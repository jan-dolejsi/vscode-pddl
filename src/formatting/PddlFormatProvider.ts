/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, FileInfo, parser, PddlLanguage, ProblemInfo } from 'pddl-workspace';
import {TextDocument, CancellationToken, DocumentFormattingEditProvider, FormattingOptions, TextEdit, DocumentRangeFormattingEditProvider, Range, Position } from 'vscode';
import { nodeToRange } from '../utils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlOnTypeFormatter } from './PddlOnTypeFormatter';

export class PddlFormatProvider implements DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider {

    constructor(private pddlWorkspace?: CodePddlWorkspace) {
    }

    async provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[] | undefined> {
        const fileInfo = await this.pddlWorkspace?.upsertAndParseFile(document);
        if (token.isCancellationRequested) { return undefined; }

        if (fileInfo && (fileInfo.getLanguage() !== PddlLanguage.PDDL)) {
            return undefined;
        }

        const tree: parser.PddlSyntaxTree = this.getSyntaxTree(fileInfo, document);
        
		return new PddlFormatter(document, range, options, token).format(tree.getRootNode());
    }

    async provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[] | undefined> {
        const fileInfo = await this.pddlWorkspace?.upsertAndParseFile(document);
        if (token.isCancellationRequested) { return undefined; }

        if (fileInfo && (fileInfo.getLanguage() !== PddlLanguage.PDDL)) {
            return undefined;
        }

        const tree: parser.PddlSyntaxTree = this.getSyntaxTree(fileInfo, document);

        const fullRange = document.validateRange(new Range(new Position(0, 0), new Position(document.lineCount, Number.MAX_VALUE)));
        
		return new PddlFormatter(document, fullRange, options, token).format(tree.getRootNode());
	}

    private getSyntaxTree(fileInfo: FileInfo | undefined, document: TextDocument): parser.PddlSyntaxTree {
        let tree: parser.PddlSyntaxTree;
        if (fileInfo && (fileInfo instanceof DomainInfo)) {
            tree = (fileInfo as DomainInfo).syntaxTree;
        }
        else if (fileInfo && (fileInfo instanceof ProblemInfo)) {
            tree = (fileInfo as ProblemInfo).syntaxTree;
        }
        else {
            tree = new parser.PddlSyntaxTreeBuilder(document.getText()).getTree();
        }
        return tree;
    }
}

class PddlFormatter {

    private readonly edits: TextEdit[] = [];
    private readonly firstOffset: number;
    private readonly lastOffset: number;

    constructor(private readonly document: TextDocument, range: Range, private readonly options: FormattingOptions, private token: CancellationToken) {
        this.firstOffset = document.offsetAt(range.start);
        this.lastOffset = document.offsetAt(range.end);
    }

    format(node: parser.PddlSyntaxNode): TextEdit[] {
        if (node.getStart() > this.lastOffset || this.token.isCancellationRequested) {
            return this.edits;
        }

        if (node.getStart() >= this.firstOffset || node.includesIndex(this.firstOffset)) {
            if (node.getToken().type === parser.PddlTokenType.Whitespace) {

                const nextSibling = node.getFollowingSibling()
                    ?? node.getParent()?.getFollowingSibling(undefined, node);

                if (node.getParent() && ['(increase', '(decrease', '(assign'].includes(node.getParent()!.getToken().tokenText)) {
                    if ((node.getParent()?.length ?? 0) > 50) {
                        this.breakAndIndent(node);
                    } else {
                        this.replace(node, ' ');
                    }
                } else if (node.getParent() && ['(:types', '(:objects'].includes(node.getParent()!.getToken().tokenText)) {
                    // todo: format type inheritance
                } else if (nextSibling === undefined) {
                    this.replace(node, '');
                } else if (nextSibling.isType(parser.PddlTokenType.CloseBracket)) {
                    if (node.getText().includes('\n')) {
                        this.breakAndIndent(node, -1);
                    } else {
                        this.replace(node, '');
                    }
                } else if (nextSibling.isType(parser.PddlTokenType.Comment)) {
                    if (node.getText().includes('\n')) {
                        this.breakAndIndent(node);
                    } else {
                        this.replace(node, ' ');
                    }
                } else if (nextSibling.isAnyOf([parser.PddlTokenType.Dash, parser.PddlTokenType.Other, parser.PddlTokenType.Parameter])) {
                    this.replace(node, ' ');
                } else if (nextSibling.isAnyOf([parser.PddlTokenType.OpenBracket, parser.PddlTokenType.OpenBracketOperator, parser.PddlTokenType.Keyword])) {
                    if (nextSibling.isType(parser.PddlTokenType.Keyword)) {
                        if (node.getParent()
                            && ['(:requirements'].includes(node.getParent()!.getToken().tokenText)) {
                            this.replace(node, ' ');
                        } else {
                            this.breakAndIndent(node);
                        }
                    } else if (node.getParent()?.isNumericExpression() || node.getParent()?.isLogicalExpression() || node.getParent()?.isTemporalExpression()) {
                        if (node.getText().includes('\n')) {
                            this.breakAndIndent(node);
                        } else {
                            this.replace(node, ' ');
                        }
                    } else if (['(domain', '(problem'].includes(nextSibling.getToken().tokenText)) {
                        this.replace(node, ' ');
                    } else {
                        if (node.getParent()
                            && [':parameters', ':duration', ':precondition', ':condition', ':effect'].includes(node.getParent()!.getToken().tokenText)) {
                            this.replace(node, ' ');
                        } else {
                            this.breakAndIndent(node);
                        }
                    }
                }
            }
        }

        node.getChildren().forEach(child => this.format(child));
        
        return this.edits;
    }
    
    breakAndIndent(node: parser.PddlSyntaxNode, offset = 0): void {
        const level = node.getAncestors([parser.PddlTokenType.OpenBracket, parser.PddlTokenType.OpenBracketOperator]).length;
        this.replace(node, this.ends(node.getText(), 1) + PddlOnTypeFormatter.createIndent('', level + offset, this.options));
    }

    replace(node: parser.PddlSyntaxNode, newText: string): void {
        this.edits.push(TextEdit.replace(nodeToRange(this.document, node), newText));
    }

    /** @returns the endline characters only, but at least the `min` count */
    ends(text: string, min: number): string {
        const endls = text.replace(/[^\n\r]/g, '');
        const endlCount = (endls.match(/\n/g) || []).length;
        if (endlCount < min) {
            return endls + '\n'.repeat(min - endlCount);
        } else {
            return endls;
        }
    }
}
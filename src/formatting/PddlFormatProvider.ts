/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, FileInfo, parser, PddlLanguage, ProblemInfo } from 'pddl-workspace';
import {TextDocument, CancellationToken, DocumentFormattingEditProvider, FormattingOptions, TextEdit, DocumentRangeFormattingEditProvider, Range, Position, EndOfLine } from 'vscode';
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

    getLastChild(node: parser.PddlSyntaxNode): parser.PddlSyntaxNode | undefined {
        let children = node?.getChildren();
        while (children && (children.length > 0)) {
            node = children[children.length - 1];
            children = node?.getChildren();
        }

        return node;
    }

    format(node: parser.PddlSyntaxNode): TextEdit[] {
        if (node.getStart() > this.lastOffset || this.token.isCancellationRequested) {
            return this.edits;
        }

        
        const nextSibling = node.getFollowingSibling()
            ?? node.getParent()?.getFollowingSibling(undefined, node);

        const precedingSibling = node.getPrecedingSibling();
        const precedingNode = precedingSibling && this.getLastChild(precedingSibling);

        if (node.getStart() >= this.firstOffset || node.includesIndex(this.firstOffset)) {
            if (node.isType(parser.PddlTokenType.OpenBracketOperator)) {
                if (precedingNode?.isNotType(parser.PddlTokenType.Whitespace)) {
                    this.breakAndIndent(node);
                }
            } else if (node.getToken().type === parser.PddlTokenType.CloseBracket) {
                if (precedingNode?.isNotType(parser.PddlTokenType.Whitespace)) {
                    const openBracketToken = node.getParent()?.getToken().tokenText ?? '';
                    if (['(:requirements', '(:domain'].includes(openBracketToken)) {
                        // do nothing
                    }
                    else if (openBracketToken.startsWith('(:')
                        || ['(define'].includes(openBracketToken)) {
                        this.breakAndIndent(node, -1);
                    }
                }
            } else if (node.isType(parser.PddlTokenType.Whitespace)) {

                if (node.getParent() && ['(increase', '(decrease', '(assign'].includes(node.getParent()!.getToken().tokenText)) {
                    if ((node.getParent()?.length ?? 0) > 50) {
                        this.breakAndIndent(node);
                    } else {
                        this.replace(node, ' ');
                    }
                } else if (nextSibling?.isType(parser.PddlTokenType.Comment)) {
                    if (node.getText().includes('\n')) {
                        this.breakAndIndent(node);
                    } else {
                        this.replace(node, ' ');
                    }
                } else if (node.getParent() && ['(:types', '(:objects'].includes(node.getParent()!.getToken().tokenText)) {
                    if (nextSibling?.isType(parser.PddlTokenType.Dash) || precedingSibling?.isType(parser.PddlTokenType.Dash)) {
                        this.replace(node, ' ');
                    } else if (precedingSibling?.isType(parser.PddlTokenType.Comment)) {
                        this.breakAndIndent(node);
                    } else if (nextSibling?.isType(parser.PddlTokenType.CloseBracket)) {
                        this.breakAndIndent(node, -1);
                    } else {
                        const precedingNodes = node.getPrecedingSiblings()
                            .filter(n => n.isNoneOf([parser.PddlTokenType.Comment, parser.PddlTokenType.Whitespace]));
                        if (precedingNodes.length === 0) {
                            this.breakAndIndent(node);
                        } else if (precedingNodes.length > 2 && this.areTypes(precedingNodes.slice(-2), [parser.PddlTokenType.Dash, parser.PddlTokenType.Other])) {
                            this.breakAndIndent(node);
                        } else {
                            this.replace(node, ' ');
                        }
                    }
                } else if (nextSibling === undefined) {
                    this.replace(node, '');
                } else if (nextSibling.isType(parser.PddlTokenType.CloseBracket)) {
                    if (node.getText().includes('\n')) {
                        this.breakAndIndent(node, -1);
                    } else {
                        this.replace(node, '');
                    }
                } else if (nextSibling.isAnyOf([parser.PddlTokenType.Dash, parser.PddlTokenType.Other, parser.PddlTokenType.Parameter])) {
                    this.replace(node, ' ');
                } else if (nextSibling.isAnyOf([parser.PddlTokenType.OpenBracket, parser.PddlTokenType.OpenBracketOperator, parser.PddlTokenType.Keyword])) {
                    if (nextSibling.isType(parser.PddlTokenType.Keyword)) {
                        const requirementsAncestor = node.findAncestor(parser.PddlTokenType.OpenBracketOperator, /:requirements/);
                        if (requirementsAncestor) {
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
    
    areTypes(nodes: parser.PddlSyntaxNode[], expectedTypes: parser.PddlTokenType[]): boolean {
        if (nodes.length !== expectedTypes.length) {
            throw new Error(`argument lengths are not matching`);
        }

        const actualTypes = nodes.map(n => n.getToken().type);

        for (let i = 0; i < actualTypes.length; i++) {
            if (actualTypes[i] !== expectedTypes[i]) {
                return false;
            }
        }
        return true;
    }
    
    breakAndIndent(node: parser.PddlSyntaxNode, offset = 0): void {
        const level = node.getAncestors([parser.PddlTokenType.OpenBracket, parser.PddlTokenType.OpenBracketOperator]).length;

        if (node.isType(parser.PddlTokenType.Whitespace)) {
            this.replace(node, this.ends(node.getText(), { min: 1, max: 2 }) + PddlOnTypeFormatter.createIndent('', level + offset, this.options));
        } else {
            const newText = this.eol() + PddlOnTypeFormatter.createIndent('', level + offset, this.options);
            this.edits.push(TextEdit.insert(this.document.positionAt(node.getStart()), newText));
        }
    }

    replace(node: parser.PddlSyntaxNode, newText: string): void {
        this.edits.push(TextEdit.replace(nodeToRange(this.document, node), newText));
    }

    /** @returns the endline characters only, but at least the `min` count */
    ends(text: string, options: { min: number; max?: number }): string {
        // strip off all other characters than the bare `\n`
        let endls = text.replace(/[^\n]/g, '');
        let endlCount = (endls.match(/\n/g) || []).length;

        // remove excess line breaks
        while (endlCount > (options.max ?? Number.MAX_VALUE)) {
            endls = endls.replace('\n', '');
            endlCount--;
        }

        // replace all `\n` by the actual document's eol sequence
        endls = endls.split('\n').join(this.eol());

        if (endlCount < options.min) {
            return endls + this.eol().repeat(options.min - endlCount);
        } else {
            return endls;
        }
    }

    eol(): string {
        switch (this.document.eol) {
            case EndOfLine.LF:
                return '\n';
            case EndOfLine.CRLF:
                return '\r\n';
        }
    }   
}
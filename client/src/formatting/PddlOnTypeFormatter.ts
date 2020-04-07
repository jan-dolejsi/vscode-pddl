/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, CancellationToken, FormattingOptions, TextEdit, OnTypeFormattingEditProvider, Position, Range, WorkspaceEdit, workspace, commands } from 'vscode';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlLanguage, DomainInfo, ProblemInfo, parser } from 'pddl-workspace';

export class PddlOnTypeFormatter implements OnTypeFormattingEditProvider {

    constructor(private pddlWorkspace?: CodePddlWorkspace, private testMode = false) {
    }

    async provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[] | undefined> {
        const fileInfo = this.pddlWorkspace && await this.pddlWorkspace.upsertAndParseFile(document);
        if (token.isCancellationRequested) { return undefined; }
        const offset = document.offsetAt(position);

        if (fileInfo && (fileInfo.getLanguage() !== PddlLanguage.PDDL)) {
            return undefined;
        }

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

        const currentNode = tree.getNodeAt(offset);

        // console.log(`Formatting upon '${ch}', ${currentNode}, ${options}`);

        const parentIndent = this.getParentStartCharacterIndent(currentNode, document);
        if (parentIndent === null) { return []; }
        
        const rangeBefore = new Range(position.with({character: 0}), position);
        const rangeAfter = new Range(position, position.with({ character: Number.MAX_VALUE }));

        if (ch === '\n' && currentNode.isType(parser.PddlTokenType.Whitespace)) {
            const insertBeforeText = this.createIndent(parentIndent, +1, options);
            const insertAfterText = '\n' + this.createIndent(parentIndent, 0, options);

            const trailingText = document.getText(rangeAfter);
            if (trailingText.trim()) {
                const edits = [
                    TextEdit.replace(rangeBefore, insertBeforeText+insertAfterText),
                ];
                
                return this.applyAndMoveCursor(document, edits, { to: 'left', value: insertAfterText.length });
            }
            else {
                const edits = [
                    TextEdit.replace(rangeBefore, insertBeforeText),
                ];
                return edits;
            }
        }
        else if (ch === '(-disabled') { // disabled, because it cancels out the auto-completion pop-up
            const leadingText = document.getText(rangeBefore);
            if (leadingText.trim() === '(') {
                const insertBeforeText = this.createIndent(parentIndent, +1, options) + '(';
                return [
                    TextEdit.replace(rangeBefore, insertBeforeText)
                ];
            }
            return [];
        }
        else {
            return [];
        }
    }

    async applyAndMoveCursor(document: TextDocument, edits: TextEdit[], cursorMoveOptions: { to: string; value: number }): Promise<TextEdit[]> {
        if (this.testMode) {
            return edits;
        }
        else {
            const edit = new WorkspaceEdit();
            edit.set(document.uri, edits);
            await workspace.applyEdit(edit);
            await commands.executeCommand('cursorMove', cursorMoveOptions);
            return [];
        }
    }

    getParentStartCharacterIndent(currentNode: parser.PddlSyntaxNode, document: TextDocument): string | null {
        const parent = currentNode.getParent()?.expand();
        if (parent === undefined) { throw new Error(`Unexpected PDDL structure in ${currentNode.getText()}`);}
        if (parent.isDocument()) { return null; }
        else {
            const lineOfParent = document.lineAt(document.positionAt(parent.getStart()).line);
            const firstNonWhitespaceCharacter = lineOfParent.firstNonWhitespaceCharacterIndex;
            return lineOfParent.text.substr(0, firstNonWhitespaceCharacter);
        }
    }

    createIndent(parentIndentText: string, levelIncrement: number, options: FormattingOptions): string {
        const singleIndent = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";
        return parentIndentText +
            singleIndent.repeat(levelIncrement);
    }
}
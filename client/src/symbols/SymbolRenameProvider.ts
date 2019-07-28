/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { RenameProvider, TextDocument, Position, CancellationToken, WorkspaceEdit, workspace, Uri, Range } from 'vscode';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { SymbolUtils, SymbolInfo, VariableInfo, TypeInfo } from './SymbolUtils';

export class SymbolRenameProvider implements RenameProvider {
    private symbolUtils: SymbolUtils;

    constructor(pddlWorkspace: PddlWorkspace) {
        this.symbolUtils = new SymbolUtils(pddlWorkspace);
    }

    async provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): Promise<WorkspaceEdit> {
        if (token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let fileUri = document.uri.toString();
        let symbolInfo = this.symbolUtils.getSymbolInfo(document, position);

        if (!symbolInfo || !this.canRename(symbolInfo)) { throw new Error("This cannot be renamed."); }

        if (!newName.match(/^\w[-\w]*$/g)) {

            throw new Error(`This is not a valid PDDL name: ${newName}`);
        }

        let references = this.symbolUtils.findSymbolReferences(fileUri, symbolInfo, true);

        let origName = document.getText(this.getWordRangeAtPosition(document, position));

        const workspaceEdits = new WorkspaceEdit();

        references.forEach(reference => {
            let oldName = this.findDocument(reference.uri).getText(reference.range);
            let replacementName = oldName.replace(origName, newName);

            workspaceEdits.replace(reference.uri, reference.range, replacementName);
        });

        return workspaceEdits;
    }

    private getWordRangeAtPosition(document: TextDocument, position: Position): Range | undefined {
        return document.getWordRangeAtPosition(position, /\w[-\w]*/g);
    }

    private findDocument(fileUri: Uri): TextDocument {
        let documentFound = workspace.textDocuments.find(textDoc => textDoc.uri.toString() === fileUri.toString());

        if (!documentFound) { throw new Error("Document not found in the workspace: " + fileUri.toString()); }

        return documentFound;
    }

    private canRename(symbolInfo: SymbolInfo): boolean {
        return symbolInfo instanceof VariableInfo
            || symbolInfo instanceof TypeInfo;
    }

    async prepareRename(document: TextDocument, position: Position, token: CancellationToken): Promise<Range>{
        if (token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let symbolInfo = this.symbolUtils.getSymbolInfo(document, position);

        if (!symbolInfo || !this.canRename(symbolInfo)) { throw new Error("This cannot be renamed."); }

        return this.getWordRangeAtPosition(document, position);
    }
}

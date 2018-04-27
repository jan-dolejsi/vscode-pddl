/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { RenameProvider, TextDocument, Position, CancellationToken, WorkspaceEdit, workspace, Uri } from 'vscode';
import { PddlWorkspace } from './workspace-model';
import { SymbolUtils, SymbolInfo, VariableInfo, TypeInfo } from './SymbolUtils';

export class SymbolRenameProvider implements RenameProvider {
    private symbolUtils: SymbolUtils;

    constructor(public pddlWorkspace: PddlWorkspace) {
        this.symbolUtils = new SymbolUtils(pddlWorkspace);
    }

    provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): WorkspaceEdit | Thenable<WorkspaceEdit> {
        if (token.isCancellationRequested) return null;
        this.symbolUtils.assertFileParsed(document);

        let fileUri = document.uri.toString();
        let symbolInfo = this.symbolUtils.getSymbolInfo(document, position);

        if (!symbolInfo || !this.canRename(symbolInfo)) return null;

        let references = this.symbolUtils.findSymbolReferences(fileUri, symbolInfo, true);

        let origName = document.getText(document.getWordRangeAtPosition(position, /\w[-\w]*/g));

        const workspaceEdits = new WorkspaceEdit();

        references.forEach(reference => {
            let oldName = this.findDocument(reference.uri).getText(reference.range);
            let replacementName = oldName.replace(origName, newName);

            workspaceEdits.replace(reference.uri, reference.range, replacementName);
        });

        return workspaceEdits;
    }

    findDocument(fileUri: Uri): TextDocument {
        let documentFound = workspace.textDocuments.find(textDoc => textDoc.uri.toString() == fileUri.toString());

        if (!documentFound) throw new Error("Document not found in the workspace: " + fileUri.toString());

        return documentFound;
    }

    canRename(symbolInfo: SymbolInfo): boolean {
        return symbolInfo instanceof VariableInfo 
            || symbolInfo instanceof TypeInfo;
    }
}

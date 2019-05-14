/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, window, workspace, Range, ViewColumn
} from 'vscode';

import { exists } from '../utils';

export async function exportToAndShow(text: string, uri: Uri): Promise<boolean> {
    let fileExists = await exists(uri.fsPath);
    if (!fileExists) {
        uri = uri.with({ scheme: 'untitled' });
    }

    let newDocument = await workspace.openTextDocument(uri);
    let editor = await window.showTextDocument(newDocument, { viewColumn: ViewColumn.Active, preserveFocus: true });
    let fullRange = newDocument.validateRange(new Range(0, 0, newDocument.lineCount, 0));
    if (await editor.edit(edit => edit.replace(fullRange, text))) {
        return newDocument.save();
    }
    else {
        throw new Error("Cannot insert text to document: " + newDocument.fileName);
    }
}
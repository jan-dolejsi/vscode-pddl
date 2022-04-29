/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, window, workspace, Range, ViewColumn } from 'vscode';
import { utils } from 'pddl-workspace';

export async function exportToAndShow(text: string, uri: Uri): Promise<boolean> {
    const fileExists = await utils.afs.exists(uri.fsPath);
    if (!fileExists) {
        uri = uri.with({ scheme: 'untitled' });
    }

    const newDocument = await workspace.openTextDocument(uri);
    const editor = await window.showTextDocument(newDocument, { viewColumn: ViewColumn.Active, preserveFocus: true });
    const fullRange = newDocument.validateRange(new Range(0, 0, newDocument.lineCount, 0));
    if (await editor.edit(edit => edit.replace(fullRange, text))) {
        const docSaved = await newDocument.save();

        // workaround to keep the editor window open after saving (or what actually closes it)
        if (!fileExists) {
            await window.showTextDocument(newDocument);
        }

        return docSaved;
    }
    else {
        throw new Error("Cannot insert text to document: " + newDocument.fileName);
    }
}
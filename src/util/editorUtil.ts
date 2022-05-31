/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, window, workspace, languages, TextDocumentShowOptions, TextEditor, Disposable } from 'vscode';
import { exists } from '../util/workspaceFs';

export async function exportToAndShow(text: string, uri: Uri, options?: DocumentOptions & TextDocumentShowOptions): Promise<TextEditor | undefined> {
    const fileExists = await exists(uri);
    const unicodeText = Buffer.from(text, 'utf8');
    await workspace.fs.writeFile(uri, unicodeText);
    let newDocument = await workspace.openTextDocument(uri);
    if (options?.languageId) {
        newDocument = await languages.setTextDocumentLanguage(newDocument, options?.languageId);
    }

    // workaround to keep the editor window open after saving (or what actually closes it)
    if (!fileExists || options?.forceShow) {
        return await window.showTextDocument(newDocument, options);
    }
    return undefined;
}

export interface DocumentOptions {
    languageId?: string;
    forceShow?: boolean;
}

/**
 * Awaits specific editor closing (or hiding).
 * @param editor editor of interest
 * @returns content of the document just after the editor closing
 */
export async function waitTillClosed(editor: TextEditor): Promise<string> {
    let disposable1: Disposable | undefined = undefined;
    let disposable2: Disposable | undefined = undefined;

    // the underlying document is closed after some unpredictable internal long timeout
    const closedDoc = new Promise<string>((resolve) => {
        disposable1 = workspace.onDidCloseTextDocument(doc => {
            if (doc === editor.document) {
                resolve(doc.getText());
            }
        });
    });

    // ... so instead we check if the editor is visible as soon as editor focus changes
    const changedEditor = new Promise<string>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        disposable2 = window.onDidChangeActiveTextEditor(_e => {
            const isVisible = window.visibleTextEditors.some(e => e === editor);
            if (!isVisible) {
                resolve(editor.document.getText());
            }
        });
    });
    const finalText = await Promise.race<string>([closedDoc, changedEditor]);
    disposable1 && (disposable1 as Disposable).dispose();
    disposable2 && (disposable2 as Disposable).dispose();
    return finalText;
}

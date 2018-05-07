/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, Event, TextDocumentContentProvider, CancellationToken, workspace, OutputChannel, EventEmitter
} from 'vscode';
import { Test } from './Test';
import { join, dirname } from 'path';
import { readFileSync } from 'fs';

export class GeneratedDocumentContentProvider implements TextDocumentContentProvider {

    private _onDidChange: EventEmitter<Uri> = new EventEmitter<Uri>();
    onDidChange?: Event<Uri> = this._onDidChange.event;
    private uriMap: Map<string, Test> = new Map<string, Test>();

    constructor(public outputWindow: OutputChannel) {

    }

    changed(uri: Uri): void {
        this._onDidChange.fire(uri)
    }

    mapUri(test: Test): Uri {
        let problemTemplatePath = test.getProblemUri().fsPath;
        let testIdx = test.uri.fragment;

        let problemPath: string;

        let problemTemplateWithoutExtension = problemTemplatePath.replace('.pddl', '');

        if (test.label) {
            problemPath = join(problemTemplateWithoutExtension + ` (${test.label}).pddl`);
        }
        else {
            problemPath = problemTemplateWithoutExtension + ` (${testIdx}).pddl`;
        }

        let uri = Uri.file(problemPath).with({scheme: 'tpddl'});

        this.uriMap.set(uri.toString(), test);

        return uri;
    }

    async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        let test = this.uriMap.get(uri.toString());
        if (token.isCancellationRequested) return "";

        let documentIfOpen = workspace.textDocuments.find(doc => doc.uri == test.getProblemUri());
        let documentText: string;

        if (documentIfOpen) {
            documentText = documentIfOpen.getText();
        }
        else {
            documentText = readFileSync(test.getProblemUri().fsPath).toString();
        }

        return await test.getPreProcessor().transform(documentText, dirname(test.manifest.path), this.outputWindow);
    }
}


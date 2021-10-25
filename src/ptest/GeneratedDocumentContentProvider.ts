/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, Event, TextDocumentContentProvider, CancellationToken, workspace, OutputChannel, EventEmitter,
} from 'vscode';
import { Test } from './Test';
import { join, dirname, basename } from 'path';
import { PddlWorkspace } from 'pddl-workspace';
import { FileInfo, PddlLanguage } from 'pddl-workspace';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { SimpleDocumentPositionResolver } from 'pddl-workspace';
import { assertDefined } from '../utils';

/**
 * Content provider for the problem file generated from a template.
 */
export class GeneratedDocumentContentProvider implements TextDocumentContentProvider {

    private _onDidChange: EventEmitter<Uri> = new EventEmitter<Uri>();
    onDidChange?: Event<Uri> = this._onDidChange.event;
    private uriMap: Map<string, Test> = new Map<string, Test>();

    constructor(private outputWindow: OutputChannel, private pddlWorkspace: CodePddlWorkspace) {
        pddlWorkspace.pddlWorkspace.on(PddlWorkspace.UPDATED, (fileInfo: FileInfo) => {
            // if the URI corresponds one that was already rendered from template, fire event
            this.uriMap.forEach((testCase: Test, uri: string) => {
                if (testCase.getProblemUri().toString() === fileInfo.fileUri.toString()) {
                    this.changed(Uri.parse(uri));
                }
            });
        });
        workspace.onDidChangeTextDocument(e => {
            // check if the changing document represents input data for a pre-processor
            this.uriMap.forEach((testCase: Test, uri: string) => {
                const inputChanged = testCase.getPreProcessor()?.getInputFiles()
                    .some(inputFileName => e.document.fileName.endsWith(inputFileName));

                if (inputChanged) {
                    this.changed(Uri.parse(uri));
                }
            });
        });
    }

    changed(uri: Uri): void {
        this._onDidChange.fire(uri);
    }

    mapUri(test: Test): Uri {
        const problemTemplatePath = test.getProblemUri().fsPath;
        const testIdx = test.getUriOrThrow().fragment;

        let problemPath: string;

        const problemTemplateWithoutExtension = problemTemplatePath.replace('.pddl', '');

        if (test.getLabel()) {
            problemPath = join(problemTemplateWithoutExtension + ` (${this.sanitizePath(test.getLabel())}).pddl`);
        }
        else {
            problemPath = problemTemplateWithoutExtension + ` (${testIdx}).pddl`;
        }

        const uri = Uri.file(problemPath).with({ scheme: 'tpddl' });

        this.uriMap.set(uri.toString(), test);

        return uri;
    }

    sanitizePath(path: string): string {
        return path.split(/[\\\/]/).join('_');
    }

    async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        const test = this.uriMap.get(uri.toString());
        if (!test) { return `Document ${uri.toString()} not found in the content provider's map.`; }
        if (token.isCancellationRequested) { return ""; }

        const problemDocument = await workspace.openTextDocument(test.getProblemUri());
        const documentText = problemDocument.getText();

        try {
            const preProcessedProblemText = await test.getPreProcessor()?.transform(
                documentText,
                dirname(assertDefined(test.getManifest(), `Test ${test.getLabel()} should have manifest defined.`).path), this.outputWindow) ?? "No pre-processor configured.";
            // force parsing of the generated problem
            this.pddlWorkspace.pddlWorkspace.upsertFile(uri, PddlLanguage.PDDL, 0, preProcessedProblemText, new SimpleDocumentPositionResolver(preProcessedProblemText), true);
            return preProcessedProblemText;
        } catch (ex: unknown) {
            const error = ex as Error;
            return `;;Problem file '${basename(uri.fsPath)}' failed to generate: ${error.message}\n\n` + documentText;
        }
    }
}


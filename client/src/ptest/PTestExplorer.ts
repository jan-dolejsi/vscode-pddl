/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, TreeView, ExtensionContext, window, commands, ViewColumn, Uri, OutputChannel
} from 'vscode';
import { dirname } from 'path';
import { existsSync } from 'fs';
import { Test } from './Test';
import { PTestTreeDataProvider, PTestNode, PTestNodeKind } from './PTestTreeDataProvider';
import { GeneratedDocumentContentProvider } from './GeneratedDocumentContentProvider';

/**
 * PDDL Test Explorer pane.
 */
export class PTestExplorer {

    private generatedDocumentContentProvider: GeneratedDocumentContentProvider;
    private pTestViewer: TreeView<PTestNode>;
    private outputWindow: OutputChannel;

    constructor(context: ExtensionContext) {
        let pTestTreeDataProvider = new PTestTreeDataProvider(context);

        this.pTestViewer = window.createTreeView('PTestExplorer', { treeDataProvider: pTestTreeDataProvider });
        context.subscriptions.push(this.pTestViewer);

        context.subscriptions.push(commands.registerCommand('pddl.tests.refresh', () => pTestTreeDataProvider.refresh()));
        context.subscriptions.push(commands.registerCommand('pddl.tests.run', node => this.runTest(node)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.view', node => this.openResource(node)));

        this.outputWindow = window.createOutputChannel("PDDL Test output");

        this.generatedDocumentContentProvider = new GeneratedDocumentContentProvider(this.outputWindow);
        context.subscriptions.push(workspace.registerTextDocumentContentProvider('tpddl', this.generatedDocumentContentProvider));
    }

    async openResource(node: PTestNode) {
        if (node.kind == PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource);

            // assert that everything exists
            if (!test) return;
            this.assertValid(test);

            let domainDocument = await workspace.openTextDocument(test.getDomainUri());
            await window.showTextDocument(domainDocument.uri, { preview: true, viewColumn: ViewColumn.One });

            this.openProblemFile(test);
        }
    }

    async openProblemFile(test: Test) {
        let uri: Uri = null;

        if (test.getPreProcessor()) {
            uri = this.generatedDocumentContentProvider.mapUri(test);
            // notify the window (if any) that the document will change
            this.generatedDocumentContentProvider.changed(uri);
        }
        else {
            let problemDocument = await workspace.openTextDocument(test.getProblemUri());
            uri = problemDocument.uri;
        }
        await window.showTextDocument(uri, { preview: true, viewColumn: ViewColumn.Two });
    }

    async runTest(node: PTestNode) {
        if (node.kind == PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource);

            // assert that everything exists
            if (!test) return;
            this.assertValid(test);

            let problemUri: Uri;

            if (test.getPreProcessor()) {
                problemUri = this.generatedDocumentContentProvider.mapUri(test);
                // notify the window (if any) that the document may have changed
                this.generatedDocumentContentProvider.changed(problemUri);
            }
            else {
                problemUri = test.getProblemUri();
            }

            commands.executeCommand('pddl.planAndDisplayResult', test.getDomainUri(), problemUri, dirname(test.manifest.path), test.getOptions());
        }
    }

    assertValid(test: Test) {
        if (!existsSync(test.getDomainUri().fsPath)) { window.showErrorMessage("Domain file not found: " + test.getDomain()); return; }
        if (!existsSync(test.getProblemUri().fsPath)) { window.showErrorMessage("Problem file not found: " + test.getProblem()); return; }
    }
}

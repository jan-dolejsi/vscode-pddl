/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, TreeView, ExtensionContext, window, commands, ViewColumn, Uri, OutputChannel
} from 'vscode';
import { dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { Test } from './Test';
import { PTestTreeDataProvider, PTestNode, PTestNodeKind } from './PTestTreeDataProvider';
import { GeneratedDocumentContentProvider } from './GeneratedDocumentContentProvider';
import { Planning } from '../planning/planning';
import { Plan } from '../planning/plan';
import { PddlPlanParser } from '../planning/PddlPlanParser';

/**
 * PDDL Test Explorer pane.
 */
export class PTestExplorer {

    private generatedDocumentContentProvider: GeneratedDocumentContentProvider;
    private pTestViewer: TreeView<PTestNode>;
    private outputWindow: OutputChannel;

    constructor(context: ExtensionContext, public planning: Planning) {
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
        } else if (node.kind == PTestNodeKind.Manifest) {
            let manifestDocument = await workspace.openTextDocument(node.resource);
            await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One });
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

            let resultSubscription = this.planning.onPlansFound(result => {
                resultSubscription.dispose();

                if (!result.success) return;

                if (test.hasExpectedPlans()) {
                    let success = result.plans.every(plan =>
                        test.getExpectedPlans()
                            .map(expectedPlanFileName => test.toAbsolutePath(expectedPlanFileName))    
                            .some(expectedPlanPath => this.areSame(plan, this.loadPlan(expectedPlanPath)))
                    );
                    if (success) {
                        this.outputWindow.appendLine(`Actual plan is matching one of the expected plans.`);
                    } else {
                        this.outputWindow.appendLine(`Actual plan is NOT matching any of the expected plans.`);
                        this.outputWindow.show();
                    }
                }
            });

            commands.executeCommand('pddl.planAndDisplayResult', test.getDomainUri(), problemUri, dirname(test.manifest.path), test.getOptions());
        }
    }

    areSame(actualPlan: Plan, expectedPlan: Plan): boolean {
        if (actualPlan.steps.length != expectedPlan.steps.length) return false;
        if (actualPlan.makespan != expectedPlan.makespan) return false;
        
        for (let index = 0; index < actualPlan.steps.length; index++) {
            const actualStep = actualPlan.steps[index];
            const expectedStep = expectedPlan.steps[index];
            
            if (!expectedStep.equals(actualStep)) return false
        }

        return true;
    }

    loadPlan(expectedPlanPath: string): Plan {
        let expectedPlanText = readFileSync(expectedPlanPath, { encoding: "utf-8" });
        let parser = new PddlPlanParser(null, null, 1e-3);
        parser.appendBuffer(expectedPlanText);
        parser.onPlanFinished();
        let plans = parser.getPlans();
        if (plans.length == 1) {
            return plans[0];
        }
        else {
            throw new Error(`Unexpected number of plans ${plans.length} in file ${expectedPlanPath}.`);
        }
    }

    assertValid(test: Test) {
        this.assertFileExists(test.getDomainUri().fsPath, 'Domain', test.getDomain()) || 
        this.assertFileExists(test.getProblemUri().fsPath, 'Problem', test.getProblem()) || 
        test.getExpectedPlans().every(planPath => this.assertFileExists(test.toAbsolutePath(planPath), 'Test', planPath));
    }

    assertFileExists(path: string, resourceName: string, fileName: string): boolean {
        let exists = existsSync(path);
        if (!exists) { window.showErrorMessage(`${resourceName} file not found: ${fileName}`); }
        return exists;
    }
}

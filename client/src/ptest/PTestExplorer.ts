/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, TreeView, ExtensionContext, window, commands, ViewColumn, Uri, OutputChannel, ProgressLocation, Range
} from 'vscode';
import { dirname, basename } from 'path';
import { existsSync, readFileSync, readFile } from 'fs';
import { Test, TestOutcome } from './Test';
import { PTestTreeDataProvider, PTestNode, PTestNodeKind } from './PTestTreeDataProvider';
import { GeneratedDocumentContentProvider } from './GeneratedDocumentContentProvider';
import { Planning } from '../planning/planning';
import { Plan } from '../planning/plan';
import { PddlPlanParser } from '../planning/PddlPlanParser';
import { TestsManifest } from './TestsManifest';

const util = require('util');
const readFileAsync = util.promisify(readFile);

/**
 * PDDL Test Explorer pane.
 */
export class PTestExplorer {

    private generatedDocumentContentProvider: GeneratedDocumentContentProvider;
    private pTestViewer: TreeView<PTestNode>;
    private pTestTreeDataProvider: PTestTreeDataProvider;
    private outputWindow: OutputChannel;

    constructor(context: ExtensionContext, public planning: Planning) {
        this.pTestTreeDataProvider = new PTestTreeDataProvider(context);

        this.pTestViewer = window.createTreeView('PTestExplorer', { treeDataProvider: this.pTestTreeDataProvider });
        context.subscriptions.push(this.pTestViewer);

        context.subscriptions.push(commands.registerCommand('pddl.tests.refresh', () => this.pTestTreeDataProvider.refresh()));
        context.subscriptions.push(commands.registerCommand('pddl.tests.run', node => this.runTest(node)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.runAll', node => this.runTests(node)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.view', node => this.openTest(node)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.viewDefinition', node => this.openDefinition(node)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.viewExpectedPlans', node => this.openExpectedPlans(node)));

        this.outputWindow = window.createOutputChannel("PDDL Test output");

        this.generatedDocumentContentProvider = new GeneratedDocumentContentProvider(this.outputWindow);
        context.subscriptions.push(workspace.registerTextDocumentContentProvider('tpddl', this.generatedDocumentContentProvider));
    }

    async openDefinition(node: PTestNode) {
        if (node.kind == PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource);
            let manifest = test.manifest;
            let manifestDocument = await workspace.openTextDocument(manifest.uri);

            if (test.label) {
                let manifestText: string = await readFileAsync(manifest.path, { encoding: "utf8" });
                let lineIdx = manifestText.split('\n').findIndex(line => new RegExp(`"label"\\s*:\\s*"${test.label}"`).test(line));

                await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One, selection: new Range(lineIdx, 0, lineIdx, Number.MAX_SAFE_INTEGER) });
            }
            else {
                await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One });
            }
        } else if (node.kind == PTestNodeKind.Manifest) {
            let manifestDocument = await workspace.openTextDocument(node.resource);
            await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One });
        }
    }

    async openExpectedPlans(node: PTestNode) {
        if (node.kind == PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource);

            // assert that everything exists
            if (!test) return;
            this.assertValid(test);

            if (!test.hasExpectedPlans) {
                await window.showInformationMessage("Test has no expected plans defined.")
            } else {
                const previewOnly = test.getExpectedPlans().length == 1;

                test.getExpectedPlans().forEach(async (expectedPlan) => {
                    let path = test.toAbsolutePath(expectedPlan);
                    let planDocument = await workspace.openTextDocument(path);
                    await window.showTextDocument(planDocument.uri, { preview: previewOnly, viewColumn: ViewColumn.Three });
                });
            }
        }
    }

    async openTest(node: PTestNode) {
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

    async runTests(node: PTestNode) {
        if (node.kind == PTestNodeKind.Manifest) {
            let manifest = TestsManifest.load(node.resource.fsPath);
            let testCount = manifest.tests.length;

            this.outputWindow.clear();
            this.outputWindow.appendLine(`Executing tests from ${basename(node.resource.fsPath)}.`);

            window.withProgress({
                location: ProgressLocation.Notification,
                title: `Running tests in ${basename(node.resource.fsPath)}`,
                cancellable: true
            }, (progress, token) => {

                return new Promise(async (resolve, reject) => {
                    for (let index = 0; index < manifest.tests.length; index++) {
                        if (token.isCancellationRequested) {
                            this.outputWindow.appendLine('Canceled by user.');
                            reject();
                            break;
                        }

                        const test = manifest.tests[index];

                        progress.report({ message: 'Test: ' + test.getLabel(), increment: 100.0 / testCount });

                        try {
                            await this.executeTest(test);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    resolve();

                    this.outputWindow.appendLine(`Finished executing tests from ${basename(node.resource.fsPath)}.`);
                    this.outputWindow.show(true);
                })
            });
        }
    }

    async runTest(node: PTestNode) {
        if (node.kind == PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource);

            // assert that everything exists
            if (!test) return;

            try {
                await this.executeTest(test);
            } catch (e) {
                console.log(e);
            }
        }
    }

    executeTest(test: Test): Promise<boolean> {
        let problemUri: Uri;

        if (test.getPreProcessor()) {
            problemUri = this.generatedDocumentContentProvider.mapUri(test);
            // notify the window (if any) that the document may have changed
            this.generatedDocumentContentProvider.changed(problemUri);
        }
        else {
            problemUri = test.getProblemUri();
        }

        this.setTestOutcome(test, TestOutcome.IN_PROGRESS);

        return new Promise(async (resolve, reject) => {
            if (!this.assertValid(test)) {
                this.outputTestResult(test, TestOutcome.SKIPPED, "Invalid test definition");
                reject(new Error('Invalid test ' + test.getLabel()));
                return;
            }

            let resultSubscription = this.planning.onPlansFound(result => {
                resultSubscription.dispose();

                if (!result.success) {
                    this.outputTestResult(test, TestOutcome.FAILED, result.error);
                    reject(new Error(result.error));
                    return;
                }

                if (test.hasExpectedPlans()) {
                    let success = result.plans.every(plan =>
                        test.getExpectedPlans()
                            .map(expectedPlanFileName => test.toAbsolutePath(expectedPlanFileName))
                            .some(expectedPlanPath => this.areSame(plan, this.loadPlan(expectedPlanPath)))
                    );
                    if (success) {
                        this.outputTestResult(test, TestOutcome.SUCCESS);
                    } else {
                        this.outputTestResult(test, TestOutcome.FAILED, "Actual plan is NOT matching any of the expected plans.");
                    }
                }
                else {
                    this.outputTestResult(test, TestOutcome.SUCCESS);
                }

                resolve(true);
            });

            try {
                await commands.executeCommand('pddl.planAndDisplayResult', test.getDomainUri(), problemUri, dirname(test.manifest.path), test.getOptions());
            } catch (e) {
                reject(e);
            }
        });
    }

    outputTestResult(test: Test, outcome: TestOutcome, error?: string) {
        let outcomeChar = String.fromCharCode(0x2591);

        switch (outcome) {
            case TestOutcome.SUCCESS:
                outcomeChar = String.fromCharCode(0x2611);
                break;
            case TestOutcome.SKIPPED:
                outcomeChar = String.fromCharCode(0x2610);
                break;
            case TestOutcome.FAILED:
                outcomeChar = String.fromCharCode(0x2612);
                break;
            // failed assertion: 	U+01C2 450
            // ‼	Double exclamation mark	0923
        }

        let outputMessage = `${outcomeChar} ${test.getLabel()}`;

        if (error) {
            outputMessage += `\n    ${error}`;
        }

        this.outputWindow.appendLine(outputMessage);

        if (outcome == TestOutcome.FAILED) {
            this.outputWindow.show(true);
        }

        this.setTestOutcome(test, outcome);
    }

    setTestOutcome(test: Test, testOutcome: TestOutcome) {
        this.pTestTreeDataProvider.setTestOutcome(test, testOutcome);
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

    assertValid(test: Test): boolean {
        return this.assertFileExists(test.getDomainUri().fsPath, 'Domain', test.getDomain()) &&
            this.assertFileExists(test.getProblemUri().fsPath, 'Problem', test.getProblem()) &&
            test.getExpectedPlans().every(planPath => this.assertFileExists(test.toAbsolutePath(planPath), 'Test', planPath));
    }

    assertFileExists(path: string, resourceName: string, fileName: string): boolean {
        let exists = existsSync(path);
        if (!exists) { window.showErrorMessage(`${resourceName} file not found: ${fileName}`); }
        return exists;
    }
}
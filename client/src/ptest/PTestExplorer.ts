/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, TreeView, window, commands, ViewColumn, Uri, ProgressLocation, Range, SaveDialogOptions, Position
} from 'vscode';
import { dirname } from 'path';
import { readFileSync, promises } from 'fs';
import * as afs from '../../../common/src/asyncfs';
import { Test, TestOutcome } from './Test';
import { PTestTreeDataProvider, PTestNode, PTestNodeKind } from './PTestTreeDataProvider';
import { GeneratedDocumentContentProvider } from './GeneratedDocumentContentProvider';
import { Planning } from '../planning/planning';
import { PlanningOutcome } from '../planning/PlanningResult';
import { Plan } from '../../../common/src/Plan';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { TestsManifest } from './TestsManifest';
import { PlanStep } from '../../../common/src/PlanStep';
import { PddlExtensionContext } from '../../../common/src/PddlExtensionContext';
import { PTestReport } from './PTestReport';
import { showError } from '../utils';

/**
 * PDDL Test Explorer pane.
 */
export class PTestExplorer {

    private generatedDocumentContentProvider: GeneratedDocumentContentProvider;
    private pTestViewer: TreeView<PTestNode>;
    private pTestTreeDataProvider: PTestTreeDataProvider;
    private report: PTestReport;

    constructor(private context: PddlExtensionContext, public planning: Planning) {
        this.pTestTreeDataProvider = new PTestTreeDataProvider(context);

        this.pTestViewer = window.createTreeView('pddl.tests.explorer', { treeDataProvider: this.pTestTreeDataProvider, showCollapseAll: true });
        context.subscriptions.push(this.pTestViewer);

        context.subscriptions.push(commands.registerCommand('pddl.tests.refresh', () => this.pTestTreeDataProvider.refresh()));
        context.subscriptions.push(commands.registerCommand('pddl.tests.run', node => this.runTest(node).catch(showError)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.runAll', node => this.findAndRunTests(node).catch(showError)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.view', nodeOrUri => {
            if (nodeOrUri instanceof Uri) {
                this.openTestByUri(<Uri>nodeOrUri).catch(showError);
            } else {
                this.openTest(nodeOrUri).catch(showError);
            }
        }));
        context.subscriptions.push(commands.registerCommand('pddl.tests.viewDefinition', node => this.openDefinition(node).catch(showError)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.viewExpectedPlans', node => this.openExpectedPlans(node).catch(showError)));
        context.subscriptions.push(commands.registerCommand('pddl.tests.problemSaveAs', () => this.saveProblemAs().catch(showError)));

        context.subscriptions.push(commands.registerCommand('pddl.tests.reveal', nodeUri =>
            this.pTestViewer.reveal(this.pTestTreeDataProvider.findNodeByResource(nodeUri), { select: true, expand: true }))
        );

        context.subscriptions.push(this.report = new PTestReport(context, this.planning.output));
        this.generatedDocumentContentProvider = new GeneratedDocumentContentProvider(this.planning.output, planning.pddlWorkspace);
        context.subscriptions.push(workspace.registerTextDocumentContentProvider('tpddl', this.generatedDocumentContentProvider));
    }

    async saveProblemAs(): Promise<void> {
        let generatedDocument = window.activeTextEditor.document;
        if (!generatedDocument) { return; }
        let options: SaveDialogOptions = {
            saveLabel: "Save as PDDL problem",
            filters: {
                "PDDL": ["pddl"]
            },
            defaultUri: generatedDocument.uri.with({ scheme: 'file' })
        };

        try {
            let uri = await window.showSaveDialog(options);
            if (!uri) { return; }
            let newDocument = await workspace.openTextDocument(uri.with({ scheme: 'untitled' }));
            let editor = await window.showTextDocument(newDocument, window.activeTextEditor.viewColumn);
            await editor.edit(edit => edit.insert(new Position(0, 0), generatedDocument.getText()));
        } catch (ex) {
            console.log(ex);
        }
    }

    async openDefinition(node: PTestNode): Promise<void> {
        if (node.kind === PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource, this.context);
            let manifest = test.getManifest();
            let manifestDocument = await workspace.openTextDocument(manifest.uri);

            // todo: try this node module: jsonc-parser - A scanner and fault tolerant parser to process JSON with or without comments.

            if (test.getLabel()) {
                let manifestText: string = await promises.readFile(manifest.path, { encoding: "utf8" });
                let lineIdx = manifestText.split('\n').findIndex(line => new RegExp(`"label"\\s*:\\s*"${test.getLabel()}"`).test(line));

                await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One, selection: new Range(lineIdx, 0, lineIdx, Number.MAX_SAFE_INTEGER) });
            }
            else {
                await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One });
            }
        } else if (node.kind === PTestNodeKind.Manifest) {
            let manifestDocument = await workspace.openTextDocument(node.resource);
            await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One });
        }
    }

    async openExpectedPlans(node: PTestNode): Promise<void> {
        if (node.kind === PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource, this.context);

            // assert that everything exists
            if (!test) { return; }
            await this.assertValid(test);

            if (!test.hasExpectedPlans()) {
                await window.showInformationMessage("Test has no expected plans defined.");
            } else {
                const previewOnly = test.getExpectedPlans().length === 1;

                test.getExpectedPlans().forEach(async (expectedPlan) => {
                    let path = test.toAbsolutePath(expectedPlan);
                    let planDocument = await workspace.openTextDocument(path);
                    await window.showTextDocument(planDocument.uri, { preview: previewOnly, viewColumn: ViewColumn.Three });
                });
            }
        }
    }

    async openTest(node: PTestNode): Promise<void> {
        if (node.kind === PTestNodeKind.Test) {
            this.openTestByUri(node.resource);
        }
    }

    async openTestByUri(testCaseUri: Uri): Promise<void> {
        let test = Test.fromUri(testCaseUri, this.context);

        // assert that everything exists
        if (!test) { return; }
        await this.assertValid(test);

        let domainDocument = await workspace.openTextDocument(test.getDomainUri());
        await window.showTextDocument(domainDocument.uri, { preview: true, viewColumn: ViewColumn.One });

        await this.openProblemFile(test);
    }

    async openProblemFile(test: Test): Promise<void> {
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

    /**
     * Finds all tests in given scope and executes them.
     * @param node user-selected tree node, or `null` for all workspace folders
     */
    async findAndRunTests(node: PTestNode): Promise<void> {
        let allManifests: TestsManifest[] = [];
        await this.findTests(node, allManifests);

        let contextPath = node ?
            workspace.asRelativePath(node.resource.fsPath) :
            "this workspace";

        this.runTests(allManifests, contextPath);
    }

    /**
     * Walks the tree from the given node recursively and adds manifests to `allManifests`.
     * @param node tree node from where to start walking
     * @param allManifests all manifests found so far
     */
    async findTests(node: PTestNode, allManifests: TestsManifest[]): Promise<void> {
        if (!node || node.kind === PTestNodeKind.Directory) {
            let children = await this.pTestTreeDataProvider.getChildren(node);
            for (const child of children) {
                await this.findTests(child, allManifests);
            }
        }
        else if (node.kind === PTestNodeKind.Manifest) {
            let manifest = TestsManifest.load(node.resource.fsPath, this.context);
            allManifests.push(manifest);
        }
    }

    private runTests(manifests: TestsManifest[], contextPath: string): void {
        let testCount = manifests.map(m => m.testCases.length).reduce((previousValue, currentValue) => previousValue + currentValue, 0);
        this.report.clearAndShow();

        window.withProgress({
            location: ProgressLocation.Notification,
            title: `Running tests from ${contextPath}`,
            cancellable: true
        }, (progress, token) => {
            return new Promise(async (resolve, reject) => {
                try {
                    for (const manifest of manifests) {
                        this.report.startingManifest(manifest);

                        for (let caseIndex = 0; caseIndex < manifest.testCases.length; caseIndex++) {
                            if (token.isCancellationRequested) {
                                this.planning.handleOutput('Canceled by user.\n');
                                reject();
                                break;
                            }
                            const test = manifest.testCases[caseIndex];
                            progress.report({ message: 'Test case: ' + test.getLabel(), increment: 100.0 / testCount });
                            try {
                                await this.executeTest(test);
                            }
                            catch (e) {
                                console.log(e);
                            }
                        }
                        this.report.finishedManifest(manifest);
                    }
                    resolve();
                }
                finally {
                    this.report.show();
                }
            });
        });
    }

    async runTest(node: PTestNode) {
        if (node.kind === PTestNodeKind.Test) {
            let test = Test.fromUri(node.resource, this.context);

            // assert that everything exists
            if (!test) { return; }

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
            let testValid = await this.assertValid(test);
            if (!testValid) {
                this.outputTestResult(test, TestOutcome.SKIPPED, Number.NaN, "Invalid test definition");
                reject(new Error('Invalid test ' + test.getLabel()));
                return;
            }

            let resultSubscription = this.planning.onPlansFound(result => {
                resultSubscription.dispose();

                if (result.outcome === PlanningOutcome.FAILURE) {
                    this.outputTestResult(test, TestOutcome.FAILED, result.elapsedTime, result.error);
                    reject(new Error(result.error));
                    return;
                } else if (result.outcome === PlanningOutcome.KILLED) {
                    this.outputTestResult(test, TestOutcome.SKIPPED, result.elapsedTime, 'Killed by the user.');
                    resolve(false);
                    return;
                } else if (result.plans.length === 0) {
                    this.outputTestResult(test, TestOutcome.FAILED, result.elapsedTime, 'No plan found.');
                    resolve(false);
                    return;
                }

                if (test.hasExpectedPlans()) {
                    let success = result.plans.every(plan =>
                        test.getExpectedPlans()
                            .map(expectedPlanFileName => test.toAbsolutePath(expectedPlanFileName))
                            .some(expectedPlanPath => this.areSame(plan, this.loadPlan(expectedPlanPath)))
                    );
                    if (success) {
                        this.outputTestResult(test, TestOutcome.SUCCESS, result.elapsedTime);
                    } else {
                        this.outputTestResult(test, TestOutcome.FAILED, result.elapsedTime, "Actual plan is NOT matching any of the expected plans.");
                    }
                }
                else {
                    this.outputTestResult(test, TestOutcome.SUCCESS, result.elapsedTime);
                }

                resolve(true);
            });

            try {
                await commands.executeCommand('pddl.planAndDisplayResult', test.getDomainUri(), problemUri, dirname(test.getManifest().path), test.getOptions());
            } catch (e) {
                this.setTestOutcome(test, TestOutcome.FAILED);
                reject(e);
                return;
            }
        });
    }

    outputTestResult(test: Test, outcome: TestOutcome, elapsedTime: number, error?: string) {
        this.setTestOutcome(test, outcome);
        this.report.outputTestResult(test, outcome, elapsedTime, error);
    }

    setTestOutcome(test: Test, testOutcome: TestOutcome) {
        this.pTestTreeDataProvider.setTestOutcome(test, testOutcome);
    }

    areSame(actualPlan: Plan, expectedPlan: Plan): boolean {
        if (actualPlan.steps.length !== expectedPlan.steps.length) { return false; }
        if (actualPlan.steps.length === 0) { return true; }

        let epsilon = workspace.getConfiguration().get<number>("pddlPlanner.epsilonTimeStep");

        if (!PlanStep.equalsWithin(actualPlan.makespan, expectedPlan.makespan, epsilon)) { return false; }

        for (let index = 0; index < actualPlan.steps.length; index++) {
            const actualStep = actualPlan.steps[index];
            const expectedStep = expectedPlan.steps[index];

            if (!expectedStep.equals(actualStep, epsilon)) { return false; }
        }

        return true;
    }

    loadPlan(expectedPlanPath: string): Plan {
        let expectedPlanText = readFileSync(expectedPlanPath, { encoding: "utf-8" });
        let epsilon = workspace.getConfiguration().get<number>("pddlPlanner.epsilonTimeStep");
        let parser = new PddlPlanParser(null, null, epsilon);
        parser.appendBuffer(expectedPlanText);
        parser.onPlanFinished();
        let plans = parser.getPlans();
        if (plans.length === 1) {
            return plans[0];
        }
        else {
            throw new Error(`Unexpected number of plans ${plans.length} in file ${expectedPlanPath}.`);
        }
    }

    async assertValid(test: Test): Promise<boolean> {
        let domainExists = await this.assertFileExists(test.getDomainUri().fsPath, 'Domain', test.getDomain());
        let problemExists = await this.assertFileExists(test.getProblemUri().fsPath, 'Problem', test.getProblem());
        let expectedPlanPromises = test.getExpectedPlans().map(async planPath => await this.assertFileExists(test.toAbsolutePath(planPath), 'Test', planPath));
        let expectedPlansExist = await Promise.all(expectedPlanPromises);
        return domainExists && problemExists
            && expectedPlansExist.every(v => v);
    }

    async assertFileExists(path: string, resourceName: string, fileName: string): Promise<boolean> {
        let exists = await afs.exists(path);
        if (!exists) { window.showErrorMessage(`${resourceName} file not found: ${fileName}`); }
        return exists;
    }
}
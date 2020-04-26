/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, TreeView, window, commands, ViewColumn, Uri, ProgressLocation, SaveDialogOptions, Position, Disposable
} from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { dirname } from 'path';
import { readFileSync } from 'fs';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import { utils, parser } from 'pddl-workspace';
import { Test, TestOutcome } from './Test';
import { PTestTreeDataProvider, PTestNode, PTestNodeKind } from './PTestTreeDataProvider';
import { GeneratedDocumentContentProvider } from './GeneratedDocumentContentProvider';
import { Planning } from '../planning/planning';
import { PlanningOutcome, PlanningResult } from '../planning/PlanningResult';
import { Plan } from 'pddl-workspace';
import { TestsManifest } from './TestsManifest';
import { PlanStep } from 'pddl-workspace';
import { PddlExtensionContext } from 'pddl-workspace';
import { PTestReport } from './PTestReport';
import { showError, jsonNodeToRange } from '../utils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PTEST_VIEW_PROBLEM, PTEST_VIEW, PTEST_REVEAL } from './PTestCommands';
import { DEFAULT_EPSILON } from '../configuration/configuration';
import { ManifestGenerator } from './ManifestGenerator';
import { PDDL_SAVE_AS_EXPECTED_PLAN } from '../planning/PlanView';
import { URI } from 'vscode-uri';

/**
 * PDDL Test Explorer pane.
 */
export class PTestExplorer {

    private generatedDocumentContentProvider: GeneratedDocumentContentProvider;
    private pTestViewer: TreeView<PTestNode>;
    private pTestTreeDataProvider: PTestTreeDataProvider;
    private report: PTestReport;
    manifestGenerator: ManifestGenerator;

    constructor(private context: PddlExtensionContext, private codePddlWorkspace: CodePddlWorkspace, private planning: Planning) {
        this.pTestTreeDataProvider = new PTestTreeDataProvider(context);

        this.pTestViewer = window.createTreeView('pddl.tests.explorer', { treeDataProvider: this.pTestTreeDataProvider, showCollapseAll: true });
        this.subscribe(this.pTestViewer);

        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.refresh', () => this.pTestTreeDataProvider.refresh()));
        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.run', node => this.runTest(node).catch(showError)));
        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.runAll', node => this.findAndRunTests(node).catch(showError)));
        this.subscribe(instrumentOperationAsVsCodeCommand(PTEST_VIEW, nodeOrUri => {
            if (nodeOrUri instanceof Uri) {
                this.openTestByUri(nodeOrUri as Uri).catch(showError);
            } else {
                this.openTest(nodeOrUri).catch(showError);
            }
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand(PTEST_VIEW_PROBLEM, test => this.openProblemFile(test, ViewColumn.Beside).catch(showError)));
        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.viewDefinition', node => this.openDefinition(node).catch(showError)));
        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.viewExpectedPlans', node => this.openExpectedPlans(node).catch(showError)));
        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.problemSaveAs', () => this.saveProblemAs().catch(showError)));

        this.subscribe(instrumentOperationAsVsCodeCommand(PTEST_REVEAL, nodeUri =>
            this.pTestViewer.reveal(this.pTestTreeDataProvider.findNodeByResource(nodeUri), { select: true, expand: true }))
        );

        this.manifestGenerator = new ManifestGenerator(this.codePddlWorkspace.pddlWorkspace, this.context);
        this.subscribe(instrumentOperationAsVsCodeCommand('pddl.tests.createAll', () => this.generateAllManifests().catch(showError)));

        this.subscribe(instrumentOperationAsVsCodeCommand(PDDL_SAVE_AS_EXPECTED_PLAN, plan => this.manifestGenerator.createPlanAssertion(plan).catch(showError)));

        this.subscribe(this.report = new PTestReport(context, this.planning.output));
        this.generatedDocumentContentProvider = new GeneratedDocumentContentProvider(this.planning.output, this.codePddlWorkspace);
        this.subscribe(workspace.registerTextDocumentContentProvider('tpddl', this.generatedDocumentContentProvider));
    }

    getTreeDataProvider(): PTestTreeDataProvider {
        return this.pTestTreeDataProvider;
    }


    async generateAllManifests(): Promise<TestsManifest[]> {
        const manifests = await this.manifestGenerator.generateAll();
        this.getTreeDataProvider().refresh();
        return manifests;
    }

    private subscribe(disposable: Disposable): void {
        this.context.subscriptions.push(disposable);
    }

    async saveProblemAs(): Promise<void> {
        const generatedDocument = window.activeTextEditor?.document;
        if (generatedDocument === undefined) { return; }
        const options: SaveDialogOptions = {
            saveLabel: "Save as PDDL problem",
            filters: {
                "PDDL": ["pddl"]
            },
            defaultUri: generatedDocument.uri.with({ scheme: 'file' })
        };

        try {
            const uri = await window.showSaveDialog(options);
            if (!uri) { return; }
            const newDocument = await workspace.openTextDocument(uri.with({ scheme: 'untitled' }));
            const editor = await window.showTextDocument(newDocument, window.activeTextEditor?.viewColumn);
            await editor.edit(edit => edit.insert(new Position(0, 0), generatedDocument.getText()));
        } catch (ex) {
            console.log(ex);
        }
    }

    async openDefinition(node: PTestNode): Promise<void> {
        if (node.kind === PTestNodeKind.Test) {
            const test = Test.fromUri(node.resource, this.context);
            if (test === undefined) {
                throw new Error("No test found at: " + node.resource);
            }

            const manifest = test.getManifest();

            if (!manifest) {
                throw new Error(`Test ${test.getLabel()} is not associated to any manifest`);
            }

            const manifestDocument = await workspace.openTextDocument(manifest.uri);

            // use jsonc-parser to find the element in the JSON DOM
            const manifestText = (await workspace.fs.readFile(Uri.file(manifest.path))).toString();
            const rootNode = parseTree(manifestText);
            const jsonTestNode = findNodeAtLocation(rootNode, ["cases", test.getIndex() ?? 0]);

            const selection = jsonTestNode && jsonNodeToRange(manifestDocument, jsonTestNode);
            await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One, selection: selection });
        } else if (node.kind === PTestNodeKind.Manifest) {
            const manifestDocument = await workspace.openTextDocument(node.resource);
            await window.showTextDocument(manifestDocument.uri, { preview: true, viewColumn: ViewColumn.One });
        }
    }

    async openExpectedPlans(node: PTestNode): Promise<void> {
        if (node.kind === PTestNodeKind.Test) {
            const test = Test.fromUri(node.resource, this.context);

            // assert that everything exists
            if (!test) { return; }
            await this.assertValid(test);

            if (!test.hasExpectedPlans()) {
                await window.showInformationMessage("Test has no expected plans defined.");
            } else {
                const previewOnly = test.getExpectedPlans().length === 1;

                test.getExpectedPlans().forEach(async (expectedPlan) => {
                    const path = test.toAbsolutePath(expectedPlan);
                    const planDocument = await workspace.openTextDocument(path);
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
        const test = Test.fromUri(testCaseUri, this.context);

        // assert that everything exists
        if (!test) { return; }
        await this.assertValid(test);

        const domainDocument = await workspace.openTextDocument(test.getDomainUri());
        await window.showTextDocument(domainDocument.uri, { preview: true, viewColumn: ViewColumn.One });

        await this.openProblemFile(test, ViewColumn.Two);
    }

    async openProblemFile(test: Test, column: ViewColumn): Promise<void> {
        let uri: Uri;

        if (test.getPreProcessor()) {
            uri = this.generatedDocumentContentProvider.mapUri(test);
            // notify the window (if any) that the document will change
            this.generatedDocumentContentProvider.changed(uri);
        }
        else {
            const problemDocument = await workspace.openTextDocument(test.getProblemUri());
            uri = problemDocument.uri;
        }
        await window.showTextDocument(uri, { preview: true, viewColumn: column });
    }

    /**
     * Finds all tests in given scope and executes them.
     * @param node user-selected tree node, or `null` for all workspace folders
     */
    async findAndRunTests(node: PTestNode): Promise<void> {
        const allManifests: TestsManifest[] = [];
        await this.findTests(node, allManifests);

        const contextPath = node ?
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
            const children = await this.pTestTreeDataProvider.getChildren(node);
            for (const child of children) {
                await this.findTests(child, allManifests);
            }
        }
        else if (node.kind === PTestNodeKind.Manifest) {
            const manifest = TestsManifest.load(node.resource.fsPath, this.context);
            allManifests.push(manifest);
        }
    }

    private runTests(manifests: TestsManifest[], contextPath: string): void {
        const testCount = manifests.map(m => m.testCases.length).reduce((previousValue, currentValue) => previousValue + currentValue, 0);
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

    async runTest(node: PTestNode): Promise<void> {
        if (node.kind === PTestNodeKind.Test) {
            const test = Test.fromUri(node.resource, this.context);

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
            try {
                const testValid = await this.assertValid(test);
                if (!testValid) {
                    this.outputTestResult(test, TestOutcome.SKIPPED, Number.NaN, "Invalid test definition");
                    reject(new Error('Invalid test ' + test.getLabel()));
                    return;
                }
            } catch (ex) {
                reject(ex);
                return;
            }
            
            const resultSubscription = this.planning.onPlansFound(result => {
                resultSubscription.dispose();

                if (result.outcome === PlanningOutcome.FAILURE) {
                    this.outputTestResult(test, TestOutcome.FAILED, result.elapsedTime, result.error);
                    reject(new Error(result.error ?? "Unknown error while planning."));
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
                    try {
                        this.assertMatchesAnExpectedPlan(result, test);
                    }
                    catch (err) {
                        this.outputTestResult(test, TestOutcome.FAILED, result.elapsedTime, "Failed to compare plan to expected plans. Error: " + err.message ?? err);
                    }
                }
                else {
                    this.outputTestResult(test, TestOutcome.SUCCESS, result.elapsedTime);
                }

                resolve(true);
            });

            try {
                const cwd = test.getManifest() ? dirname(test.getManifest()!.path) : '.';
                await commands.executeCommand('pddl.planAndDisplayResult', test.getDomainUri(), problemUri, cwd, test.getOptions());
            } catch (e) {
                this.setTestOutcome(test, TestOutcome.FAILED);
                reject(e);
                return;
            }
        });
    }

    private assertMatchesAnExpectedPlan(result: PlanningResult, test: Test): void {
        const success = result.plans.every(plan => test.getExpectedPlans()
            .map(expectedPlanFileName => test.toAbsolutePath(expectedPlanFileName))
            .some(expectedPlanPath => this.areSame(plan, this.loadPlan(expectedPlanPath))));
        if (success) {
            this.outputTestResult(test, TestOutcome.SUCCESS, result.elapsedTime);
        }
        else {
            this.outputTestResult(test, TestOutcome.FAILED, result.elapsedTime, "Actual plan is NOT matching any of the expected plans.");
        }
    }

    outputTestResult(test: Test, outcome: TestOutcome, elapsedTime: number, error?: string): void {
        this.setTestOutcome(test, outcome);
        this.report.outputTestResult(test, outcome, elapsedTime, error);
    }

    setTestOutcome(test: Test, testOutcome: TestOutcome): void {
        this.pTestTreeDataProvider.setTestOutcome(test, testOutcome);
    }

    areSame(actualPlan: Plan, expectedPlan: Plan): boolean {
        // todo: refer to VAlStep to check that plan is equivalent, rather than same
        if (actualPlan.steps.length !== expectedPlan.steps.length) { return false; }
        if (actualPlan.steps.length === 0) { return true; }

        const epsilon = workspace.getConfiguration().get<number>("pddlPlanner.epsilonTimeStep", DEFAULT_EPSILON);

        if (!PlanStep.equalsWithin(actualPlan.makespan, expectedPlan.makespan, epsilon)) { return false; }

        for (let index = 0; index < actualPlan.steps.length; index++) {
            const actualStep = actualPlan.steps[index];
            const expectedStep = expectedPlan.steps[index];

            if (!expectedStep.equals(actualStep, epsilon)) { return false; }
        }

        return true;
    }

    loadPlan(expectedPlanPath: string): Plan {
        const expectedPlanText = readFileSync(expectedPlanPath, { encoding: "utf-8" });
        const epsilon = workspace.getConfiguration().get<number>("pddlPlanner.epsilonTimeStep", DEFAULT_EPSILON);
        return parser.PddlPlannerOutputParser.parseOnePlan(expectedPlanText, URI.file(expectedPlanPath), epsilon);
    }

    async assertValid(test: Test): Promise<boolean> {
        const domainExists = await this.assertFileExists(test.getDomainUri().fsPath, 'Domain', test.getDomain());
        const problemExists = await this.assertFileExists(test.getProblemUri().fsPath, 'Problem', test.getProblem());
        const expectedPlanPromises = test.getExpectedPlans().map(async planPath => await this.assertFileExists(test.toAbsolutePath(planPath), 'Test', planPath));
        const expectedPlansExist = await Promise.all(expectedPlanPromises);
        return domainExists && problemExists
            && expectedPlansExist.every(v => v);
    }

    async assertFileExists(path: string, resourceName: string, fileName: string): Promise<boolean> {
        const exists = await utils.afs.exists(path);
        if (!exists) { window.showErrorMessage(`${resourceName} file not found: ${fileName}`); }
        return exists;
    }
}
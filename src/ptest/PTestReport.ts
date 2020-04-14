/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, OutputChannel, Disposable
} from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { TestsManifest } from './TestsManifest';
import { TestOutcome, Test } from './Test';
import { PTestReportView } from './PTestReportView';
import { PddlExtensionContext } from 'pddl-workspace';
import { PTEST_REPORT_VIEW } from './PTestCommands';
import { utils } from 'pddl-workspace';
import { assertDefined } from '../utils';

/** Gathers the output of running PDDL Test cases and summarizes them into a WebView table. */
export class PTestReport implements Disposable {
    private view: PTestReportView | undefined;
    private manifests = new ManifestMap();

    constructor(private context: PddlExtensionContext, private outputWindow: OutputChannel) {
        instrumentOperationAsVsCodeCommand(PTEST_REPORT_VIEW, () => this.show());
    }

    dispose(): void {
        if (this.outputWindow) { this.outputWindow.dispose(); }
    }

    startingManifest(manifest: TestsManifest): void {
        const manifestLocation = workspace.asRelativePath(manifest.path, true);
        this.output(`Executing tests from ${manifestLocation}.`);
        this.addManifestIfAbsent(manifest);
    }

    addManifestIfAbsent(manifest: TestsManifest): void {
        if (this.manifests.putIfAbsent(manifest, () => new TestResultMap())) {
            if (this.view) { this.view.updatePage(); }
        }
    }

    upsertTestResult(test: Test, result: TestResult): void {
        const testManifest = test.getManifest();
        if (!testManifest) { throw new Error(`Test ${test.getLabel()} has no manifest.`); }
        this.manifests.putIfAbsent(testManifest, () => new TestResultMap());
        const testMap = this.manifests.get(testManifest);
        testMap && testMap.set(test, result);
        if (this.view) { this.view.updatePage(); }
    }

    /**
     * Marks manifest test as finished
     * @param manifest manifest whose tests just finished
     */
    finishedManifest(manifest: TestsManifest): void {
        const manifestLocation = workspace.asRelativePath(manifest.path, true);
        this.outputWindow.appendLine(`Finished executing tests from ${manifestLocation}.`);
    }

    getManifests(): TestsManifest[] {
        return this.manifests.keyList();
    }

    getManifestTestResultsOrThrow(manifest: TestsManifest): TestResultMap {
        return assertDefined(this.manifests.get(manifest), `Manifest not found: ` + manifest.uri.toString());
    }

    getTestCases(manifest: TestsManifest): Test[] {
        return this.getManifestTestResultsOrThrow(manifest).keyList();
    }

    getTestResultOrThrow(test: Test): TestResult {
        const testManifest = test.getManifest();
        const testUri = test.getUri();
        if (!testManifest || !testUri) { throw new Error(`Test ${test.getLabel()} has no manifest or URI.`); }

        const results = this.getManifestTestResultsOrThrow(testManifest);
        return assertDefined(results.get(test), `Test not found in the result set: ` + testUri.toString());
    }

    outputTestResult(test: Test, outcome: TestOutcome, elapsedTime: number, error?: string): void {
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

        if (!Number.isNaN(elapsedTime)) {
            outputMessage += ` (${elapsedTime / 1000.0} sec)`;
        }

        if (error) {
            outputMessage += `\n    ${error}`;
        }

        this.outputWindow.appendLine(outputMessage);

        if (outcome === TestOutcome.FAILED) {
            this.outputWindow.show(true);
        }

        this.upsertTestResult(test, new TestResult(outcome, outcomeChar, elapsedTime, error));
    }

    clearAndShow(): void {
        this.outputWindow.clear();
        this.manifests.clear();
        if (this.view) { this.view.updatePage(); }
        this.show();
    }

    output(message: string): void {
        this.outputWindow.appendLine(message);
    }

    show(): void {
        this.outputWindow.show(true);
        if (!this.view) {
            this.view = new PTestReportView(this.context, this);
        }
        this.view.showReport();
    }
}

export class TestResult {
    constructor(readonly outcome: TestOutcome,
        readonly outcomeChar: string,
        readonly elapsedTime: number,
        readonly error?: string) {

    }
}

class ManifestMap extends utils.StringifyingMap<TestsManifest, TestResultMap> {
    protected stringifyKey(key: TestsManifest): string {
        return key.uri.toString();
    }
}

class TestResultMap extends utils.StringifyingMap<Test, TestResult> {
    protected stringifyKey(key: Test): string {
        return key.getUriOrThrow().toString();
    }
}
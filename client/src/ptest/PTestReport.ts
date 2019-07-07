/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, OutputChannel, Disposable, commands
} from 'vscode';
import { TestsManifest } from './TestsManifest';
import { TestOutcome, Test } from './Test';
import { PTestReportView } from './PTestReportView';
import { PddlExtensionContext } from '../PddlExtensionContext';

export class PTestReport implements Disposable {
    private view: PTestReportView;
    private manifests = new ManifestMap();

    constructor(private context: PddlExtensionContext, private outputWindow: OutputChannel) {
        commands.registerCommand("pddl.tests.report.view", () => this.show());
    }

    dispose() {
        if (this.outputWindow) { this.outputWindow.dispose(); }
    }

    startingManifest(manifest: TestsManifest): void {
        let manifestLocation = workspace.asRelativePath(manifest.path, true);
        this.output(`Executing tests from ${manifestLocation}.`);
        this.addManifestIfAbsent(manifest);
    }

    addManifestIfAbsent(manifest: TestsManifest): void {
        if (this.manifests.putIfAbsent(manifest, () => new TestResultMap())) {
            this.view.updatePage();
        }
    }

    upsertTestResult(test: Test, result: TestResult): void {
        let testMap = this.manifests.get(test.getManifest());
        testMap.set(test, result);
        this.view.updatePage();
    }

    finishedManifest(manifest: TestsManifest): void {
        let manifestLocation = workspace.asRelativePath(manifest.path, true);
        this.outputWindow.appendLine(`Finished executing tests from ${manifestLocation}.`);
    }

    getManifests(): TestsManifest[] {
        return this.manifests.keyList();
    }

    getTestCases(manifest: TestsManifest): Test[] {
        return this.manifests.get(manifest).keyList();
    }

    getTestResult(test: Test): TestResult {
        return this.manifests.get(test.getManifest()).get(test);
    }

    outputTestResult(test: Test, outcome: TestOutcome, elapsedTime: number, error?: string) {
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

    clearAndShow() {
        this.outputWindow.clear();
        this.manifests.clear();
        if (this.view) { this.view.updatePage(); }
        this.show();
    }

    output(message: string) {
        this.outputWindow.appendLine(message);
    }

    show() {
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

/**
 * Map that stringifies the key objects in order to leverage
 * the javascript native Map and preserve key uniqueness.
 */
abstract class StringifyingMap<K, V> {
    private map = new Map<string, V>();
    private keyMap = new Map<string, K>();

    has(key: K): boolean {
        let keyString = this.stringifyKey(key);
        return this.map.has(keyString);
    }
    get(key: K): V {
        let keyString = this.stringifyKey(key);
        return this.map.get(keyString);
    }
    set(key: K, value: V): StringifyingMap<K, V> {
        let keyString = this.stringifyKey(key);
        this.map.set(keyString, value);
        this.keyMap.set(keyString, key);
        return this;
    }

    /**
     * Puts new key/value if key is absent.
     * @param key key
     * @param defaultValue default value factory
     */
    putIfAbsent(key: K, defaultValue: () => V): boolean {
        if (!this.has(key)) {
            let value = defaultValue();
            this.set(key, value);
            return true;
        }
        return false;
    }

    keys(): IterableIterator<K> {
        return this.keyMap.values();
    }

    keyList(): K[] {
        return [...this.keys()];
    }

    delete(key: K): boolean {
        let keyString = this.stringifyKey(key);
        let flag = this.map.delete(keyString);
        this.keyMap.delete(keyString);
        return flag;
    }

    clear(): void {
        this.map.clear();
        this.keyMap.clear();
    }

    size(): number {
        return this.map.size;
    }

    /**
     * Turns the `key` object to a primitive `string` for the underlying `Map`
     * @param key key to be stringified
     */
    protected abstract stringifyKey(key: K): string;
}


class ManifestMap extends StringifyingMap<TestsManifest, TestResultMap> {
    protected stringifyKey(key: TestsManifest): string {
        return key.uri.toString();
    }
}

class TestResultMap extends StringifyingMap<Test, TestResult> {
    protected stringifyKey(key: Test): string {
        return key.getUri().toString();
    }
}
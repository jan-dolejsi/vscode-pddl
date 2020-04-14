/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri } from 'vscode';
import { join, dirname } from 'path';
import { TestsManifest } from './TestsManifest';
import { PreProcessor, CommandPreProcessor, NunjucksPreProcessor, PythonPreProcessor, Jinja2PreProcessor } from 'pddl-workspace';
import { PddlExtensionContext } from 'pddl-workspace';
import { throwForUndefined } from '../utils';

export enum TestOutcome { UNKNOWN, SUCCESS, FAILED, SKIPPED, IN_PROGRESS }

const EXPECTED_PLANS = "expectedPlans";

const LABEL = "label";
const DESCRIPTION = "description";
const DOMAIN = "domain";
const PROBLEM = "problem";
const OPTIONS = "options";
const PRE_PROCESSOR = "preProcess";
const PRE_PROCESSOR_KIND = "kind";
const PRE_PROCESSOR_SCRIPT = "script";
const PRE_PROCESSOR_DATA = "data";
const PRE_PROCESSOR_ARGS = "args";
/**
 * Test definitions
 */
export class Test {
    private manifest: TestsManifest | undefined;
    private index: number | undefined;
    private uri: Uri | undefined;

    constructor(private label: string | undefined,
        private description: string | undefined,
        private domain: string | undefined,
        private problem: string | undefined,
        private options: string | undefined,
        private preProcessor: PreProcessor | undefined,
        private expectedPlans: string[] | undefined) {

    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromJSON(json: any, context: PddlExtensionContext): Test {
        const label = json[LABEL];
        const description = json[DESCRIPTION];
        const domain = json[DOMAIN];
        const problem = json[PROBLEM];
        const options = json[OPTIONS];
        const expectedPlans = json[EXPECTED_PLANS] ?? [];

        const preProcessSettings = json[PRE_PROCESSOR];
        let preProcessor: PreProcessor | undefined;

        if (preProcessSettings) {
            const kind = preProcessSettings[PRE_PROCESSOR_KIND];

            switch (kind) {
                case "command":
                    preProcessor = CommandPreProcessor.fromJson(preProcessSettings as never);
                    break;
                case "python":
                    preProcessor = new PythonPreProcessor(context.pythonPath(), preProcessSettings[PRE_PROCESSOR_SCRIPT], preProcessSettings[PRE_PROCESSOR_ARGS]);
                    break;
                case "nunjucks":
                    preProcessor = new NunjucksPreProcessor(preProcessSettings[PRE_PROCESSOR_DATA], undefined, 0, false);
                    break;
                case "jinja2":
                    preProcessor = new Jinja2PreProcessor(context.pythonPath(), context.extensionPath, preProcessSettings[PRE_PROCESSOR_DATA]);
                    break;
            }
        }

        return new Test(label, description, domain, problem, options, preProcessor, expectedPlans);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toJSON(): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = {};

        if (this.label) { json[LABEL] = this.label; }
        if (this.description) { json[DESCRIPTION] = this.description; }
        if (this.domain) { json[DOMAIN] = this.domain; }
        if (this.problem) { json[PROBLEM] = this.problem; }
        if (this.options) { json[OPTIONS] = this.options; }
        if (this.expectedPlans?.length) { json[EXPECTED_PLANS] = this.expectedPlans; }

        if (this.preProcessor) { json[PRE_PROCESSOR] = { kind: "unsupported" }; } // creating test cases with pre-processing is currently not supported

        return json;
    }

    /**
     * @returns index of this test case in the manifest
     */
    getIndex(): number | undefined {
        return this.index;
    }

    getManifest(): TestsManifest | undefined {
        return this.manifest;
    }

    setManifest(manifest: TestsManifest): void {
        this.index = manifest.testCases.length;
        this.uri = manifest.uri.with({ fragment: this.index.toString() });
        this.manifest = manifest;
    }

    getDomain(): string {
        return this.domain ?? this.manifest?.defaultDomain ?? throwForUndefined('domain');
    }

    getDomainUri(): Uri {
        return Uri.file(this.toAbsolutePath(this.getDomain()));
    }

    getProblem(): string {
        return this.problem ?? this.manifest?.defaultProblem ?? throwForUndefined("problem");
    }

    getProblemUri(): Uri {
        return Uri.file(this.toAbsolutePath(this.getProblem()));
    }

    getUri(): Uri | undefined {
        return this.uri;
    }

    getUriOrThrow(): Uri {
        if (!this.uri) { throw new Error(`Test ${this.getLabel()} has no URI.`); }
        return this.uri;
    }

    getLabel(): string {
        return this.label ?? this.problem ?? this.getProblem() + ` (${(this.index ?? 0) + 1})`;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    getOptions(): string | undefined {
        return this.options ?? this.manifest?.defaultOptions;
    }

    getPreProcessor(): PreProcessor | undefined {
        return this.preProcessor;
    }

    hasExpectedPlans(): boolean {
        return this.expectedPlans !== undefined && this.expectedPlans.length > 0;
    }

    getExpectedPlans(): string[] {
        return this.expectedPlans ?? [];
    }

    toAbsolutePath(fileName: string): string {
        if (!this.manifest) {
            throw new Error(`Test ${this.getLabel()} is not associated to a manifest.`);
        }
        return join(dirname(this.manifest.path), fileName);
    }

    static fromUri(uri: Uri, context: PddlExtensionContext): Test | undefined {
        const testIndex = parseInt(uri.fragment);
        if (Number.isFinite(testIndex)) {
            const manifest = TestsManifest.load(uri.fsPath, context);
            return manifest.testCases[testIndex];
        }
        else {
            return undefined;
        }
    }
}
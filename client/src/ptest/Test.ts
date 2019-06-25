/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri } from 'vscode';
import { join, dirname } from 'path';
import { TestsManifest } from './TestsManifest';
import { PreProcessor, CommandPreProcessor, NunjucksPreProcessor, PythonPreProcessor, Jinja2PreProcessor } from "../../../common/src/PreProcessors";
import { PddlExtensionContext } from '../../../common/src/PddlExtensionContext';

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
    private manifest: TestsManifest;
    private index: number;
    private uri: Uri;

    constructor(private label: string,
        private description: string,
        private domain: string,
        private problem: string,
        private options: string,
        private preProcessor: PreProcessor,
        private expectedPlans: string[]) {

        }

    static fromJSON(json: any,  context: PddlExtensionContext): Test {
        let label = json[LABEL];
        let description = json[DESCRIPTION];
        let domain = json[DOMAIN];
        let problem = json[PROBLEM];
        let options = json[OPTIONS];
        let expectedPlans = json[EXPECTED_PLANS] || [];

        let preProcessSettings = json[PRE_PROCESSOR];
        let preProcessor: PreProcessor = null;

        if(preProcessSettings) {
            let kind = preProcessSettings[PRE_PROCESSOR_KIND];

            switch(kind){
                case "command":
                    preProcessor = CommandPreProcessor.fromJson(preProcessSettings);
                    break;
                case "python":
                    preProcessor = new PythonPreProcessor(context.pythonPath(), preProcessSettings[PRE_PROCESSOR_SCRIPT], preProcessSettings[PRE_PROCESSOR_ARGS]);
                    break;
                case "nunjucks":
                    preProcessor = new NunjucksPreProcessor(preProcessSettings[PRE_PROCESSOR_DATA], undefined, false);
                    break;
                case "jinja2":
                    preProcessor = new Jinja2PreProcessor(context.pythonPath(), context.extensionPath, preProcessSettings[PRE_PROCESSOR_DATA]);
                    break;
            }
        }

        return new Test(label, description, domain, problem, options, preProcessor, expectedPlans);
    }

    toJSON(): any {
        let json: any = {};

        if (this.label) { json[LABEL] = this.label; }
        if (this.description) { json[DESCRIPTION] = this.description; }
        if (this.domain) { json[DOMAIN] = this.domain; }
        if (this.problem) { json[PROBLEM] = this.problem; }
        if (this.options)  { json[OPTIONS] = this.options; }
        if (this.expectedPlans.length) {json[EXPECTED_PLANS] = this.expectedPlans; }

        if (this.preProcessor) { json[PRE_PROCESSOR] = { kind: "unsupported"}; } // creating test cases with pre-processing is currently not supported

        return json;
    }

    getManifest(): TestsManifest {
        return this.manifest;
    }

    setManifest(manifest: TestsManifest): void {
        this.index = manifest.testCases.length;
        this.uri = manifest.uri.with({ fragment: this.index.toString() });
        this.manifest = manifest;
    }

    getDomain(): string {
        return this.domain || this.manifest.defaultDomain;
    }

    getDomainUri(): Uri {
        return Uri.file(this.toAbsolutePath(this.getDomain()));
    }

    getProblem(): string {
        return this.problem || this.manifest.defaultProblem;
    }

    getProblemUri(): Uri {
        return Uri.file(this.toAbsolutePath(this.getProblem()));
    }

    getUri(): Uri {
        return this.uri;
    }

    getLabel(): string {
        return this.label || this.problem || this.getProblem() + ` (${this.index + 1})`;
    }

    getDescription(): string {
        return this.description;
    }

    getOptions(): string {
        return this.options || this.manifest.defaultOptions;
    }

    getPreProcessor(): PreProcessor {
        return this.preProcessor;
    }

    hasExpectedPlans() : boolean {
        return this.expectedPlans.length > 0;
    }

    getExpectedPlans(): string[] {
        return this.expectedPlans;
    }

    toAbsolutePath(fileName: string): string {
        return join(dirname(this.manifest.path), fileName);
    }

    static fromUri(uri: Uri, context: PddlExtensionContext): Test {
        let testIndex = parseInt(uri.fragment);
        if (Number.isFinite(testIndex)) {
            let manifest = TestsManifest.load(uri.fsPath, context);
            return manifest.testCases[testIndex];
        }
        else {
            return null;
        }
    }
}
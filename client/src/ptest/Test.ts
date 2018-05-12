/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, workspace } from 'vscode';
import { join, dirname } from 'path';
import { TestsManifest } from './TestsManifest';
import { PreProcessor, CommandPreProcessor, NunjucksPreProcessor, PythonPreProcessor, Jinja2PreProcessor } from "../../../common/src/PreProcessors";
import { PddlExtensionContext } from '../../../common/src/PddlExtensionContext';

export enum TestOutcome { UNKNOWN, SUCCESS, FAILED, SKIPPED, IN_PROGRESS }

/**
 * Test definitions
 */
export class Test {

    label: string;
    problem: string;
    private domain: string;
    private options: string;
    private preProcessor: PreProcessor
    private expectedPlans: string[];
    uri: Uri;

    constructor(public manifest: TestsManifest, public index: number, readonly json: any, readonly context: PddlExtensionContext) {
        this.label = json["label"];
        this.domain = json["domain"];
        this.problem = json["problem"];
        this.options = json["options"];
        this.expectedPlans = json["expectedPlans"] || [];
        this.uri = this.manifest.uri.with({ fragment: index.toString() });

        let preProcessSettings = json["preProcess"];

        if(preProcessSettings) {
            let kind = preProcessSettings["kind"];

            // get python location (if python extension si installed)
            let pythonPath = workspace.getConfiguration().get("python.pythonPath", "python");

            switch(kind){
                case "command":
                    this.preProcessor = CommandPreProcessor.fromJson(preProcessSettings);
                    break;
                case "python":
                    this.preProcessor = new PythonPreProcessor(pythonPath, preProcessSettings["script"], preProcessSettings["args"]);
                    break;
                case "nunjucks":
                    this.preProcessor = new NunjucksPreProcessor(preProcessSettings["data"], undefined, false);
                    break;
                case "jinja2":
                    this.preProcessor = new Jinja2PreProcessor(pythonPath, context.extensionPath, preProcessSettings["data"]);
                    break;
            }
        }
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

    getLabel(): string {
        return this.label || this.problem || this.getProblem() + ` (${this.index + 1})`;
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
        if (testIndex != NaN) {
            let manifest = TestsManifest.load(uri.fsPath, context);
            return manifest.tests[testIndex];
        }
        else {
            return null;
        }
    }
}
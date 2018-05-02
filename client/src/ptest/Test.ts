/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri } from 'vscode';
import { join, dirname } from 'path';
import { TestsManifest } from './TestsManifest';
import { PreProcessor, CommandPreProcessor, Jinja2PreProcessor } from "../../../common/src/PreProcessors";

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

    constructor(public manifest: TestsManifest, index: number, readonly json: any) {
        this.label = json["label"];
        this.domain = json["domain"];
        this.problem = json["problem"];
        this.options = json["options"];
        this.expectedPlans = json["expectedPlans"] || [];
        this.uri = this.manifest.uri.with({ fragment: index.toString() });

        if(json["preProcess"]) {
            let kind = json["preProcess"]["kind"];

            switch(kind){
                case "command":
                    this.preProcessor = CommandPreProcessor.fromJson(json["preProcess"]);
                    break;
                case "jinja2":
                    this.preProcessor = new Jinja2PreProcessor(json["preProcess"]["data"], dirname(manifest.path));
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
        return this.label;
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

    static fromUri(uri: Uri): Test {
        let testIndex = parseInt(uri.fragment);
        if (testIndex != NaN) {
            let manifest = TestsManifest.load(uri.fsPath);
            return manifest.tests[testIndex];
        }
        else {
            return null;
        }
    }
}
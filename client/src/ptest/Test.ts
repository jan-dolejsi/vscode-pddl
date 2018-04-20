/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri } from 'vscode';
import { join, dirname } from 'path';
import { TestsManifest } from './TestsManifest';
import { PreProcessor, ShellPreProcessor } from "../../../common/src/PreProcessors";

/**
 * Test definitions
 */
export class Test {

    private label: string;
    problem: string;
    private domain: string;
    private options: string;
    private preProcessor: PreProcessor
    uri: Uri;

    constructor(public manifest: TestsManifest, index: number, readonly json: any) {
        this.label = json["label"];
        this.domain = json["domain"];
        this.problem = json["problem"];
        this.options = json["options"];
        this.uri = this.manifest.uri.with({ fragment: index.toString() });

        if(json["preProcess"]) {
            let kind = json["preProcess"]["kind"];

            switch(kind){
                case "shell":
                    this.preProcessor = ShellPreProcessor.fromJson(json["preProcess"]);
                    break;
            }
        }
    }

    getDomain(): string {
        return this.domain || this.manifest.defaultDomain;
    }

    getDomainUri(): Uri {
        return Uri.file(join(dirname(this.manifest.path), this.getDomain()));
    }

    getProblem(): string {
        return this.problem || this.manifest.defaultProblem;
    }

    getProblemUri(): Uri {
        return Uri.file(join(dirname(this.manifest.path), this.getProblem()));
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
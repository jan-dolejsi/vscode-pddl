/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { readFileSync } from 'fs';
import { Test } from './test';
import { Uri } from 'vscode';
import { PddlExtensionContext } from '../../../common/src/PddlExtensionContext';

/**
 * Tests manifest
 */
export class TestsManifest {

    tests: Test[];
    defaultDomain: string;
    defaultProblem: string;
    defaultOptions: string;
    uri: Uri;

    constructor(public readonly path: string, readonly json: any, context: PddlExtensionContext) {
        this.defaultDomain = json["defaultDomain"];
        this.defaultProblem = json["defaultProblem"];
        this.defaultOptions = json["defaultOptions"];
        this.uri = Uri.file(path);
        this.tests = json["cases"] ? json["cases"].map((t: any, index: number) => new Test(this, index, t, context)) : [];
    }

    static load(path: string, context: PddlExtensionContext): TestsManifest {
        let settings = readFileSync(path);
        let json = JSON.parse(settings.toLocaleString());
        return new TestsManifest(path, json, context);
    }
}

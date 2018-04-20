/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { readFileSync } from 'fs';
import { Test } from './test';
import { Uri } from 'vscode';

/**
 * Tests manifest
 */
export class TestsManifest {

    tests: Test[];
    defaultDomain: string;
    defaultProblem: string;
    defaultOptions: string;
    uri: Uri;

    constructor(public readonly path: string, readonly json: any) {
        this.defaultDomain = json["defaultDomain"];
        this.defaultProblem = json["defaultProblem"];
        this.defaultOptions = json["defaultOptions"];
        this.uri = Uri.file(path);
        this.tests = json["tests"].map((t: any, index: number) => new Test(this, index, t));
    }

    static load(path: string): TestsManifest {
        let settings = readFileSync(path);
        try {
            let json = JSON.parse(settings.toLocaleString());
            return new TestsManifest(path, json);
        } catch (err) {
            console.log(err);
        }

        return new TestsManifest(path, []);
    }
}

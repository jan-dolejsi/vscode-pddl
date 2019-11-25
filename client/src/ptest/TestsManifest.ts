/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { readFileSync } from 'fs';
import { Test } from './Test';
import { Uri, window } from 'vscode';
import { PddlExtensionContext } from '../../../common/src/PddlExtensionContext';
import * as afs from '../../../common/src/asyncfs';

/**
 * Tests manifest
 */
export class TestsManifest {

    path: string;
    testCases: Test[] = [];

    constructor(public readonly defaultDomain: string | undefined, public readonly defaultProblem: string | undefined,
        public readonly defaultOptions: string | undefined, public readonly uri: Uri) {
        this.path = uri.fsPath;
    }

    static fromJSON(path: string, json: any, context: PddlExtensionContext) {
        let defaultDomain: string | undefined = json["defaultDomain"];
        let defaultProblem: string | undefined = json["defaultProblem"];
        let defaultOptions: string | undefined = json["defaultOptions"];
        let uri = Uri.file(path);

        let manifest = new TestsManifest(defaultDomain, defaultProblem, defaultOptions, uri);
        let tests: Test[] = json["cases"] ? json["cases"].map((t: any) => Test.fromJSON(t, context)) : [];
        tests.forEach(case1 => manifest.addCase(case1));

        return manifest;
    }
    addCase(testCase: Test): any {
        testCase.setManifest(this);
        this.testCases.push(testCase);
    }

    static load(path: string, context: PddlExtensionContext): TestsManifest {
        let settings = readFileSync(path);
        let json = JSON.parse(settings.toLocaleString());
        return TestsManifest.fromJSON(path, json, context);
    }

    async store(): Promise<void> {
        let obj: any = {};
        if (this.defaultDomain !== undefined) { obj["defaultDomain"] = this.defaultDomain; }
        if (this.defaultProblem !== undefined) { obj["defaultProblem"] = this.defaultProblem; }
        if (this.defaultOptions !== undefined) { obj["defaultOptions"] = this.defaultOptions; }
        let cases: Test[] = [];
        this.testCases.forEach(test => cases.push(test.toJSON()));
        if (cases.length > 0) { obj["cases"] = cases; }

        var json = JSON.stringify(obj, null, 2);
        try {
            await afs.writeFile(this.uri.fsPath, json, 'utf8');
        }
        catch(err) {
            window.showErrorMessage(`Error saving test case manifest ${err.name}: ${err.message}`);
        }
    }
}

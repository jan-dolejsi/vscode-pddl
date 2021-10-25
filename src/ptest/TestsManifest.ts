/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { readFileSync } from 'fs';
import { Test } from './Test';
import { Uri, window, workspace } from 'vscode';
import { PddlExtensionContext } from 'pddl-workspace';

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

    static fromJSON(path: string, json: any, context: PddlExtensionContext): TestsManifest {
        const defaultDomain: string | undefined = json["defaultDomain"];
        const defaultProblem: string | undefined = json["defaultProblem"];
        const defaultOptions: string | undefined = json["defaultOptions"];
        const uri = Uri.file(path);

        const manifest = new TestsManifest(defaultDomain, defaultProblem, defaultOptions, uri);
        const tests: Test[] = json["cases"] ? json["cases"].map((t: any) => Test.fromJSON(t, context)) : [];
        tests.forEach(case1 => manifest.addCase(case1));

        return manifest;
    }
    addCase(testCase: Test): any {
        testCase.setManifest(this);
        this.testCases.push(testCase);
    }

    static load(path: string, context: PddlExtensionContext): TestsManifest {
        // todo: use workspace.fs.readFile, but deal with the async nature
        const settings = readFileSync(path);
        const json = JSON.parse(settings.toLocaleString());
        return TestsManifest.fromJSON(path, json, context);
    }

    async store(): Promise<void> {
        const obj: any = {};
        if (this.defaultDomain !== undefined) { obj["defaultDomain"] = this.defaultDomain; }
        if (this.defaultProblem !== undefined) { obj["defaultProblem"] = this.defaultProblem; }
        if (this.defaultOptions !== undefined) { obj["defaultOptions"] = this.defaultOptions; }
        const cases: Test[] = [];
        this.testCases.forEach(test => cases.push(test.toJSON()));
        if (cases.length > 0) { obj["cases"] = cases; }

        const json = JSON.stringify(obj, null, 2);
        try {
            await workspace.fs.writeFile(this.uri, Buffer.from(json, 'utf8'));
        }
        catch (err: unknown) {
            const error = err as Error;
            window.showErrorMessage(`Error saving test case manifest ${error.name}: ${error.message}`);
        }
    }
}

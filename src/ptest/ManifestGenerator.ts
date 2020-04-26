/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { PddlWorkspace, DomainInfo, Plan, PddlExtensionContext, ProblemInfo, FileInfo } from 'pddl-workspace';
import { TestsManifest } from './TestsManifest';
import { basename, extname, dirname, join, relative } from 'path';
import { PTestTreeDataProvider } from './PTestTreeDataProvider';
import { Test } from './Test';
import { Uri, workspace } from 'vscode';
import { fileExists } from '../utils';

export class ManifestGenerator {
    constructor(private readonly pddlWorkspace: PddlWorkspace,
        private readonly context: PddlExtensionContext) { }

    async generateAll(): Promise<TestsManifest[]> {
        const domainFiles = this.pddlWorkspace
            .getAllFilesIf<DomainInfo>(fileInfo => fileInfo.isDomain())
            .filter(domain => this.pddlWorkspace.getProblemFiles(domain).length);

        return await Promise.all(domainFiles.map(async domain => {
            const manifest = await this.readOrCreateManifest(domain, this.context);
            this.addProblems(manifest, domain);
            manifest.store();
            return manifest;
        }));
    }

    async createPlanAssertion(plan: Plan): Promise<TestsManifest> {
        if (!plan.domain || !plan.problem) {
            throw new Error(`Plan has no domain or problem associated.`);
        }

        const manifest = await this.readOrCreateManifest(plan.domain, this.context);

        const { filePath: domainPath } = this.getPathAndName(plan.domain);
        const { fileName: problemFileName } = this.getPathAndName(plan.problem);

        const planFileName = `${problemFileName}_${new Date().toISOString().split(':').join('-')}.plan`;
        const planPath = join(dirname(domainPath), planFileName);
        await workspace.fs.writeFile(Uri.file(planPath), Buffer.from(plan.getText(), 'utf8'));

        const planRelativePath = relative(dirname(manifest.uri.fsPath), planPath);

        this.upsertProblemCase(plan.problem, plan.domain, manifest, [planRelativePath]);

        await manifest.store();

        return manifest;
    }

    async readOrCreateManifest(domain: DomainInfo, context: PddlExtensionContext): Promise<TestsManifest> {
        const { filePath: domainPath, fileName: domainFileName } = this.getPathAndName(domain);

        const domainFileNameWithoutExt = basename(domainPath, extname(domainPath));

        const manifestUri = Uri.file(join(dirname(domainPath), domainFileNameWithoutExt + PTestTreeDataProvider.PTEST_SUFFIX));

        if (await fileExists(manifestUri)) {
            const manifestText = await workspace.fs.readFile(manifestUri);
            const manifestJson = JSON.parse(manifestText.toString());
            return TestsManifest.fromJSON(manifestUri.fsPath, manifestJson, context);
        }
        else {
            const manifest = new TestsManifest(domainFileName, undefined, '', manifestUri);

            await manifest.store();

            return manifest;
        }
    }

    private getPathAndName(fileInfo: FileInfo): { filePath: string; fileName: string } {
        const domainPath = fileInfo.fileUri.fsPath;
        const domainFileName = basename(domainPath);
        return { filePath: domainPath, fileName: domainFileName };
    }

    private addProblems(manifest: TestsManifest, domain: DomainInfo): void {
        const problems = this.pddlWorkspace.getProblemFiles(domain);

        problems.forEach(problem => {
            this.upsertProblemCase(problem, domain, manifest);
        });
    }

    private upsertProblemCase(problem: ProblemInfo, domain: DomainInfo, manifest: TestsManifest, expectedPlans?: string[]): Test {
        const { filePath: domainPath } = this.getPathAndName(domain);
        const { filePath: problemPath } = this.getPathAndName(problem);
        const problemRelativePath = relative(dirname(domainPath), problemPath);

        const testCaseFound = manifest.testCases
            .find(c => c.getProblemUri().toString() === problem.fileUri.toString());

        if (!testCaseFound) {
            const newTestCase = new Test(undefined, undefined, undefined, problemRelativePath, undefined, undefined, expectedPlans);

            // only add if it did not exist
            manifest.addCase(newTestCase);

            return newTestCase;
        }
        else {
            if (expectedPlans) {
                expectedPlans
                    .filter(expectedPlan => !testCaseFound.getExpectedPlans().includes(expectedPlan))
                    .forEach(expectedPlan => testCaseFound.getExpectedPlans().push(expectedPlan));
            }
            return testCaseFound;
        }
    }
}
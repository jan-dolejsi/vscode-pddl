/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { window, workspace, Uri, commands } from 'vscode';
import { before } from 'mocha';
import { expect } from 'chai';
import * as path from 'path';
import { PTestTreeDataProvider, PTestNode } from '../../ptest/PTestTreeDataProvider';
import { createTestPddlExtensionContext, getMockPlanner, activateExtension, waitFor, clearWorkspaceFolder } from './testUtils';
import { PddlExtensionContext, PddlLanguage, SimpleDocumentPositionResolver, DomainInfo, ProblemInfo } from 'pddl-workspace';
import { ManifestGenerator } from '../../ptest/ManifestGenerator';
import { assertDefined, throwForUndefined } from '../../utils';
import { PDDL_PLANNER, EXECUTABLE_OR_SERVICE, EXECUTABLE_OPTIONS } from '../../configuration';
import { PDDL_PLAN_AND_DISPLAY } from '../../planning/planning';
import { planning, ptestExplorer, codePddlWorkspace } from '../../extension';
import { fail } from 'assert';

suite('PTest', () => {
    let pddlExtensionContext: PddlExtensionContext | undefined;
    let domainUri: Uri | undefined;
    let problemUri: Uri | undefined;

    before(async () => {
        await activateExtension();
        await clearWorkspaceFolder();
        window.showInformationMessage('Start PTest tests.');

        pddlExtensionContext = await createTestPddlExtensionContext();
    });

    test('Empty tree for empty workspace', async () => {
        const treeDataProvider = new PTestTreeDataProvider(pddlExtensionContext!);

        // WHEN
        const children = await treeDataProvider.getChildren();

        // THEN
        expect(children).to.be.empty;
    });

    test('Creates manifest for domain+problem', async () => {
        const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

        // create 'ptesttreedataprovider'
        const folderPath = path.join(wf.uri.fsPath, "ptesttreedataprovider");
        await workspace.fs.createDirectory(Uri.file(folderPath));

        // create 'domain.pddl'
        const domainFileName = 'domain.pddl';
        const domainPath = path.join(folderPath, domainFileName);
        domainUri = Uri.file(domainPath);
        const domainText = '(define (domain d))';
        await workspace.fs.writeFile(domainUri, Buffer.from(domainText));

        // create 'problem.pddl'
        const problemFileName = 'problem.pddl';
        const problemPath = path.join(folderPath, problemFileName);
        problemUri = Uri.file(problemPath);
        const problemText = '(define (problem p) (:domain d))';
        await workspace.fs.writeFile(problemUri, Buffer.from(problemText));

        const codePddlWorkspace1 = assertDefined(codePddlWorkspace, "code PDDL workspace");
        await codePddlWorkspace1.pddlWorkspace.upsertFile(domainUri.toString(), PddlLanguage.PDDL, 1, domainText, new SimpleDocumentPositionResolver(domainText)) as DomainInfo;
        await codePddlWorkspace1.pddlWorkspace.upsertFile(problemUri.toString(), PddlLanguage.PDDL, 1, problemText, new SimpleDocumentPositionResolver(problemText)) as ProblemInfo;

        if (!ptestExplorer) { fail('extension.ptestExplorer should be defined'); return; }

        const nodesChanged = new Array<PTestNode>();
        ptestExplorer.getTreeDataProvider().onDidChangeTreeData(e => nodesChanged.push(e));

        // WHEN
        const manifests = await ptestExplorer.generateAllManifests();


        // THEN
        expect(manifests).has.lengthOf(1);
        const manifestFolder1DomainD = manifests[0];
        expect(manifestFolder1DomainD.defaultDomain).to.equal(domainFileName);
        expect(manifestFolder1DomainD.testCases).to.have.lengthOf(1);
        const testCase1 = manifestFolder1DomainD.testCases[0];
        expect(testCase1.getProblem()).to.equal(problemFileName);

        // WHEN
        const treeDataProvider = new PTestTreeDataProvider(pddlExtensionContext ?? throwForUndefined('test extension context'));
        const children = await treeDataProvider.getChildren();

        // THEN
        expect(children).to.have.lengthOf(1);
        const folder1TreeNodes = await treeDataProvider.getChildren(children[0]);
        expect(folder1TreeNodes).to.have.lengthOf(1);
        const manifestTreeNodes = await treeDataProvider.getChildren(folder1TreeNodes[0]);
        expect(manifestTreeNodes).to.have.lengthOf(1);
        const manifestTreeNode = manifestTreeNodes[0];
        expect(manifestTreeNode.resource.fsPath).to.deep.equal(manifestFolder1DomainD.uri.fsPath);
        
        expect(nodesChanged).to.have.length(1);
    });

    test("creates manifest from planner output", async () => { 
        // GIVEN result of above tests

        await workspace.getConfiguration(PDDL_PLANNER).update(EXECUTABLE_OR_SERVICE, getMockPlanner());
        await workspace.getConfiguration(PDDL_PLANNER).update(EXECUTABLE_OPTIONS, "$(planner) $(domain) $(problem) $(options)");
        
        const cwd = path.dirname(assertDefined(domainUri, 'domain uri').fsPath);
        const mockPlanPath = path.join(cwd, 'mockPlan.plan');
        const planText = `0.001 (action1)`;
        workspace.fs.writeFile(Uri.file(mockPlanPath), Buffer.from(planText, 'utf8'));

        if (!planning) { fail('extension.planning should be defined'); return; }

        // invoke the mock planner
        const planningResult = await waitFor(planning.onPlansFound, {
            action: async () =>
                await commands.executeCommand(PDDL_PLAN_AND_DISPLAY, domainUri, problemUri, cwd, mockPlanPath)
        });

        expect(planningResult.plans).to.have.lengthOf(1);
        const plan = planningResult.plans[0];
        const codePddlWorkspace1 = assertDefined(codePddlWorkspace, "code PDDL workspace");

        // WHEN
        const manifestGenerator = new ManifestGenerator(assertDefined(codePddlWorkspace1.pddlWorkspace, 'test pddl workspace'),
            pddlExtensionContext ?? throwForUndefined('test extension context'));
        const manifest = await manifestGenerator.createPlanAssertion(plan);

        // THEN
        expect(manifest.defaultDomain).to.equal(path.basename(Uri.file(plan.domain.fileUri).fsPath));
        expect(manifest.testCases).has.lengthOf(1, "test cases after assertion added");
        const actualTestCase = manifest.testCases.find(test => test.getProblemUri().toString() === problemUri?.toString());
        expect(actualTestCase?.getExpectedPlans()).to.be.not.undefined;
        expect(actualTestCase?.getExpectedPlans()).to.have.lengthOf(1);
    });
});

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
import { createTestPddlExtensionContext, MockPlannerProvider, activateExtension, waitFor, clearWorkspaceFolder } from './testUtils';
import { PddlExtensionContext, PddlLanguage, SimpleDocumentPositionResolver, DomainInfo, ProblemInfo } from 'pddl-workspace';
import { ManifestGenerator } from '../../ptest/ManifestGenerator';
import { assertDefined, throwForUndefined, toURI } from '../../utils';
import { PDDL_PLAN_AND_DISPLAY } from '../../planning/planning';
import { planning, ptestExplorer, codePddlWorkspaceForTests, plannersConfiguration } from '../../extension';
import { fail } from 'assert';
import { PlannerConfigurationScope } from '../../configuration/PlannersConfiguration';

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

        const folderName = "ptestTreeDataProvider";
        // create 'ptestTreeDataProvider'
        const folderUri = Uri.joinPath(wf.uri, folderName);
        await workspace.fs.createDirectory(folderUri);

        // create 'domain.pddl'
        const domainFileName = 'domain.pddl';
        domainUri = Uri.joinPath(folderUri, domainFileName);
        const domainText = '(define (domain d))';
        await workspace.fs.writeFile(domainUri, Buffer.from(domainText, "utf8"));

        // create 'problem.pddl'
        const problemFileName = 'problem.pddl';
        problemUri = Uri.joinPath(folderUri, problemFileName);
        const problemText = '(define (problem p) (:domain d))';
        await workspace.fs.writeFile(problemUri, Buffer.from(problemText, "utf8"));

        const codePddlWorkspace1 = assertDefined(codePddlWorkspaceForTests, "code PDDL workspace");
        await codePddlWorkspace1.pddlWorkspace.upsertFile(toURI(domainUri), PddlLanguage.PDDL, 1, domainText, new SimpleDocumentPositionResolver(domainText)) as DomainInfo;
        await codePddlWorkspace1.pddlWorkspace.upsertFile(toURI(problemUri), PddlLanguage.PDDL, 1, problemText, new SimpleDocumentPositionResolver(problemText)) as ProblemInfo;

        if (!ptestExplorer) { fail('extension.ptestExplorer should be defined'); return; }

        const nodesChanged = new Array<PTestNode | undefined>();
        ptestExplorer.getTreeDataProvider().onDidChangeTreeData(e => nodesChanged.push(e));

        // WHEN
        const manifests = await ptestExplorer.generateAllManifests();


        // THEN
        expect(manifests).has.length.greaterThan(0);
        const manifestFolder1DomainD = manifests.find(m => m.path.includes(folderName));
        expect(manifestFolder1DomainD).to.be.not.undefined;
        expect(manifestFolder1DomainD?.defaultDomain).to.equal(domainFileName);
        expect(manifestFolder1DomainD?.testCases).to.have.lengthOf(1);
        const testCase1 = manifestFolder1DomainD?.testCases[0];
        expect(testCase1?.getProblem()).to.equal(problemFileName);

        // WHEN
        const treeDataProvider = new PTestTreeDataProvider(pddlExtensionContext ?? throwForUndefined('test extension context'));
        const children = await treeDataProvider.getChildren();

        // THEN
        expect(children, "tree children nodes (workspace folders)").to.have.lengthOf(1);
        const folder1TreeNodes = await treeDataProvider.getChildren(children[0]);

        folder1TreeNodes.forEach((n, i) => console.log(`${i}: ${n.resource} ${n.label} ${n.kind} ${n.tooltip}`));

        expect(folder1TreeNodes, "tree.folder1 tree nodes").to.have.length.greaterThan(0);
        const ptestTreeDataProviderNode = assertDefined(folder1TreeNodes.find(n => n.resource.fsPath.endsWith(folderName)), "Cannot find " + folderName);
        const manifestTreeNodes = await treeDataProvider.getChildren(ptestTreeDataProviderNode);
        expect(manifestTreeNodes, "tree.folder1.manifest children").to.have.lengthOf(1);
        const manifestTreeNode = manifestTreeNodes[0];
        expect(manifestTreeNode.resource.fsPath).to.equal(manifestFolder1DomainD?.uri.fsPath);
        
        expect(nodesChanged, "number of nodes changed or refresh events").to.have.length(1);
    });

    // must run after the previous test, which creates the domain+problem files
    test("creates manifest from planner output", async () => { 
        // GIVEN result of above tests

        const mockConfiguration = await new MockPlannerProvider().configurePlanner();
		await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User, mockConfiguration);
        
        const cwd = path.dirname(assertDefined(domainUri, 'domain uri').fsPath);
        const mockPlanPath = path.join(cwd, 'mockPlan.plan');
        const planText = `0.001: (action1)`;
        workspace.fs.writeFile(Uri.file(mockPlanPath), Buffer.from(planText, 'utf8'));

        if (!planning) { fail('extension.planning should be defined'); return; }

        // invoke the mock planner
        const planningResult = await waitFor(planning.onPlansFound, {
            action: async () =>
                await commands.executeCommand(PDDL_PLAN_AND_DISPLAY, domainUri, problemUri, cwd, mockPlanPath)
        });

        expect(planningResult.plans).to.have.lengthOf(1);
        const plan = planningResult.plans[0];
        const codePddlWorkspace1 = assertDefined(codePddlWorkspaceForTests, "code PDDL workspace");

        // WHEN
        const manifestGenerator = new ManifestGenerator(assertDefined(codePddlWorkspace1.pddlWorkspace, 'test pddl workspace'),
            pddlExtensionContext ?? throwForUndefined('test extension context'));
        const manifest = await manifestGenerator.createPlanAssertion(plan);

        // THEN
        if (!plan.domain) {
            fail('plan.domain is undefined');
        }
        expect(manifest.defaultDomain).to.equal(path.basename(plan.domain.fileUri.fsPath));
        expect(manifest.testCases).has.lengthOf(1, "test cases after assertion added");
        const actualTestCase = manifest.testCases.find(test => test.getProblemUri().toString() === problemUri?.toString());
        expect(actualTestCase?.getExpectedPlans()).to.be.not.undefined;
        expect(actualTestCase?.getExpectedPlans()).to.have.lengthOf(1);
    });
});

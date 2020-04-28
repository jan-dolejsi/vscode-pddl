/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { window, workspace, Uri, commands } from 'vscode';
import { before } from 'mocha';
import { expect } from 'chai';
import * as path from 'path';
import { MockPlannerProvider, activateExtension, waitFor, clearWorkspaceFolder, clearConfiguration } from './testUtils';
import { PddlLanguage, SimpleDocumentPositionResolver, DomainInfo, ProblemInfo } from 'pddl-workspace';
import { assertDefined, toURI } from '../../utils';
import { PDDL_PLAN_AND_DISPLAY } from '../../planning/planning';
import { planning, codePddlWorkspace, plannersConfiguration } from '../../extension';
import { fail } from 'assert';
import { PlannerConfigurationScope } from '../../configuration/PlannersConfiguration';

suite('Planning test', () => {
    let domainUri: Uri | undefined;
    let problemUri: Uri | undefined;
    let domain: DomainInfo | undefined;
    let problem: ProblemInfo | undefined;

    before(async () => {
        await activateExtension();
        await clearWorkspaceFolder();
        await clearConfiguration();
        window.showInformationMessage('Start Planning tests.');
    });

    test('Calls planner and displays plan', async () => {
        const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

        // create 'planningTest'
        const folderPath = path.join(wf.uri.fsPath, "planningTest");
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
        domain = await codePddlWorkspace1.pddlWorkspace.upsertFile(toURI(domainUri), PddlLanguage.PDDL, 1, domainText, new SimpleDocumentPositionResolver(domainText)) as DomainInfo;
        problem = await codePddlWorkspace1.pddlWorkspace.upsertFile(toURI(problemUri), PddlLanguage.PDDL, 1, problemText, new SimpleDocumentPositionResolver(problemText)) as ProblemInfo;

        // GIVEN the mock planner is configured

        const mockConfiguration = await new MockPlannerProvider().configurePlanner();
		await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User, mockConfiguration);

        const cwd = path.dirname(assertDefined(domainUri, 'domain uri').fsPath);
        const mockPlanPath = path.join(cwd, 'mockPlan.plan');
        const planText = `0.001: (action1)`;
        workspace.fs.writeFile(Uri.file(mockPlanPath), Buffer.from(planText, 'utf8'));

        if (!planning) { fail('extension.planning should be defined'); return; }

        // WHEN

        // invoke the mock planner
        const planningResult = await waitFor(planning.onPlansFound, {
            action: async () =>
                await commands.executeCommand(PDDL_PLAN_AND_DISPLAY, domainUri, problemUri, cwd, mockPlanPath)
        });

        // THEN

        expect(planningResult.plans).to.have.lengthOf(1);
        const plan = planningResult.plans[0];

        expect(plan.domain).to.equal(domain);
        expect(plan.problem).to.equal(problem);
        expect(plan.steps).to.have.lengthOf(1);
    });
});

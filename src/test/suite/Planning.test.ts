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

    const multiPlanText = `; All the ground actions in this problem are compression-safe
; Initial heuristic = 15.000
; b (14.000 | 140.000)b (12.000 | 140.001)b (10.000 | 140.001)b (8.000 | 140.001)b (6.000 | 140.001)b (5.000 | 245.002)b (3.000 | 245.003)b (2.000 | 260.001)
; Plan found with metric 515.000
; States evaluated so far: 10
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action2 auv2 drake base-w)  [130.00000]
0.00000: (action2 auv1 base-m base-a)  [55.00000]
0.00100: (action3 g1 base-h)  [140.00000]
55.00100: (action2 auv1 base-a base-r)  [40.00000]
95.00200: (action4 auv1 base-r)  [150.00000]
95.00300: (action3 auv1 base-r)  [150.00000]
130.00100: (action4 auv2 base-w)  [130.00000]
130.00200: (action3 auv2 base-w)  [130.00000]

; Resorting to best-first search
; b (14.000 | 140.000)b (13.000 | 130.000)b (13.000 | 55.000)b (12.000 | 140.000)b (11.000 | 130.000)b (9.000 | 200.000)b (8.000 | 200.000)b (6.000 | 200.000)b (5.000 | 260.001)b (3.000 | 260.002)b (2.000 | 2150.001)
; Plan found with metric 490.000
; States evaluated so far: 413
0.00000: (action2 auv2 drake base-w)  [130.00000]
0.00000: (action2 auv1 base-m base-r)  [200.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
130.00100: (action4 auv2 base-w)  [130.00000]
130.00200: (action3 auv2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]
b (0.000 | 2150.002)
; Plan found with metric 380.000
; States evaluated so far: 842
0.00000: (action2 auv2 drake base-w)  [130.00000]
0.00000: (action2 auv1 base-m base-r)  [200.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]

; Plan found with metric 275.000
; States evaluated so far: 7804
0.00000: (action2 auv2 drake base-w)  [130.00000]
0.00000: (action2 auv1 base-m base-a)  [55.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
55.00100: (action2 auv1 base-a base-r)  [40.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]

; Plan found with metric 235.000
; States evaluated so far: 14221
0.00000: (action2 auv2 drake base-w)  [130.00000]
0.00000: (action2 auv1 base-m base-a)  [55.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]

; Plan found with metric 180.000
; States evaluated so far: 20775
0.00000: (action2 auv2 drake base-w)  [130.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]

; Plan found with metric 145.000
; States evaluated so far: 23964
0.00000: (action2 auv1 base-m base-a)  [55.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
55.00100: (action2 auv1 base-a base-r)  [40.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]

; Plan found with metric 105.000
; States evaluated so far: 30628
0.00000: (action2 auv1 base-m base-a)  [55.00000]
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]

; Plan found with metric 50.000
; States evaluated so far: 40250
0.00000: (action1 g1 base-h)  [140.00000]
0.00000: (action5 g2 base-h base-w)  [750.00000]
0.00000: (action5 g3 base-m base-r)  [2000.00000]
0.00100: (action3 g1 base-h)  [140.00000]
750.00100: (action1 g2 base-w)  [130.00000]
750.00200: (action3 g2 base-w)  [130.00000]
2000.00100: (action1 g3 base-r)  [150.00000]
2000.00200: (action3 g3 base-r)  [150.00000]
Error: terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc

`;


    test('Calls planner and displays multiple improving plans', async () => {
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
        workspace.fs.writeFile(Uri.file(mockPlanPath), Buffer.from(multiPlanText, 'utf8'));

        if (!planning) { fail('extension.planning should be defined'); return; }

        // WHEN

        // invoke the mock planner
        const planningResult = await waitFor(planning.onPlansFound, {
            action: async () =>
                await commands.executeCommand(PDDL_PLAN_AND_DISPLAY, domainUri, problemUri, cwd, mockPlanPath)
        });

        // THEN

        expect(planningResult.plans).to.have.lengthOf(9);
        const plan = planningResult.plans[0];

        expect(plan.domain).to.equal(domain);
        expect(plan.problem).to.equal(problem);
        expect(plan.steps).to.have.lengthOf(9);
    });
});

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlPlanParser } from '../src/PddlPlanParser';
import { DomainInfo } from '../src/DomainInfo';
import { ProblemInfo } from '../src/parser';

describe('PddlPlanParser', () => {

    describe('#appendBuffer()', () => {

        it('parses single-durative-action plan', () => {
            // GIVEN
            let domainInfo: DomainInfo = null;
            let problemInfo: ProblemInfo = null;
            let planText = '1: (action) [20]';

            // WHEN
            let parser = new PddlPlanParser(domainInfo, problemInfo, { epsilon: 1e-3 });
            parser.appendBuffer(planText);
            parser.onPlanFinished();
            let plans = parser.getPlans();

            // THEN
            assert.strictEqual(plans.length, 1, 'there should be one empty plan');
            let plan = plans[0];
            assert.strictEqual(plan.makespan, 21, 'plan makespan');
            assert.strictEqual(plan.steps.length, 1, 'plan should have one action');
            assert.strictEqual(plan.steps[0].getStartTime(), 1, 'start time');
            assert.strictEqual(plan.steps[0].getActionName(), 'action', 'action name');
            assert.strictEqual(plan.steps[0].getFullActionName(), 'action', 'full action name');
            assert.strictEqual(plan.steps[0].isDurative, true, 'action isDurative');
            assert.strictEqual(plan.steps[0].getDuration(), 20, 'action duration');
        });

        it('parses empty document', () => {
            // GIVEN
            let domainInfo: DomainInfo = null;
            let problemInfo: ProblemInfo = null;
            let planText = '';

            // WHEN
            let parser = new PddlPlanParser(domainInfo, problemInfo, { epsilon: 1e-3, minimumPlansExpected: 1 });
            parser.appendBuffer(planText);
            parser.onPlanFinished();
            let plans = parser.getPlans();

            // THEN
            assert.strictEqual(plans.length, 1, 'there should be one empty plan');
        });

        it('parses empty plan with only meta-data', () => {
            // GIVEN
            let domainInfo: DomainInfo = null;
            let problemInfo: ProblemInfo = null;
            let planText = `;;!domain: d1
            ;;!problem: p1
            
            ; Makespan: 0.000
            ; Cost: 0.000
            ; States evaluated: 10`;

            // WHEN
            let parser = new PddlPlanParser(domainInfo, problemInfo, { epsilon: 1e-3, minimumPlansExpected: 1 });
            parser.appendBuffer(planText);
            parser.onPlanFinished();
            let plans = parser.getPlans();

            // THEN
            assert.strictEqual(plans.length, 1, 'there should be one empty plan');
            let plan = plans[0];
            assert.strictEqual(plan.makespan, 0, 'plan makespan');
            assert.strictEqual(plan.cost, 0, 'plan metric');
            assert.strictEqual(plan.statesEvaluated, 10, 'states evaluated');
        });
    });
});

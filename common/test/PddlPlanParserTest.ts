/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlPlanParser } from '../src/PddlPlanParser';
import { DomainInfo } from '../src/DomainInfo';
import { ProblemInfo } from '../src/ProblemInfo';

describe('PddlPlanParser', () => {

    describe('#appendBuffer()', () => {

        it('parses single-durative-action plan', () => {
            // GIVEN
            let domainInfo: DomainInfo | undefined;
            let problemInfo: ProblemInfo | undefined;
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
            let domainInfo: DomainInfo | undefined;
            let problemInfo: ProblemInfo | undefined;
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

        it('parses xml plan', async () => {
            // GIVEN
            let domainInfo: DomainInfo = null;
            let problemInfo: ProblemInfo = null;
            let planText = `States evaluated: 51
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Plan>
                <Actions>
                    <OrderedHappening>
                        <HappeningID>1</HappeningID>
                        <ComesBefore>
                            <HappeningID>2</HappeningID>
                        </ComesBefore>
                        <Happening>
                            <ActionStart>
                                <ActionID>1</ActionID>
                                <Name>action1</Name>
                                <Parameters>
                                    <Parameter>
                                        <Symbol>c</Symbol>
                                    </Parameter>
                                    <Parameter>
                                        <Symbol>a</Symbol>
                                    </Parameter>
                                </Parameters>        
                                <ExpectedStartTime>P0DT3H0M7.200S</ExpectedStartTime>
                            </ActionStart>
                        </Happening>
            </OrderedHappening>
        </Actions>
        </Plan>
            End of plan print-out.`;

            // WHEN
            var parser: PddlPlanParser;
            await new Promise((resolve, _reject) => {
                parser = new PddlPlanParser(domainInfo, problemInfo, { epsilon: 1e-3, minimumPlansExpected: 1 }, _plans => resolve());
                parser.appendBuffer(planText);
            });
            let plans = parser.getPlans();

            // THEN
            assert.strictEqual(plans.length, 1, 'there should be one plan');
            let plan = plans[0];
            assert.strictEqual(plan.makespan, 10807.2, 'plan makespan');
            assert.strictEqual(plan.cost, 10807.2, 'plan metric');
            assert.strictEqual(plan.statesEvaluated, 51, 'states evaluated');
            assert.strictEqual(plan.steps.length, 1, 'plan should have one action');
            assert.strictEqual(plan.steps[0].getStartTime(), 10807.2, 'start time');
            assert.strictEqual(plan.steps[0].getActionName(), 'action1', 'action name');
            assert.strictEqual(plan.steps[0].getFullActionName(), 'action1 c a', 'full action name');
            assert.strictEqual(plan.steps[0].isDurative, false, 'action isDurative');
        });

        it('parses xml with temporal plan', async () => {
            // GIVEN
            let domainInfo: DomainInfo = null;
            let problemInfo: ProblemInfo = null;
            let planText = `States evaluated: 51
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Plan>
                <Actions>
                    <OrderedHappening>
                        <HappeningID>1</HappeningID>
                        <ComesBefore>
                            <HappeningID>2</HappeningID>
                        </ComesBefore>
                        <Happening>
                            <ActionStart>
                                <ActionID>1</ActionID>
                                <Name>action1</Name>
                                <Parameters>
                                    <Parameter>
                                        <Symbol>c</Symbol>
                                    </Parameter>
                                    <Parameter>
                                        <Symbol>a</Symbol>
                                    </Parameter>
                                </Parameters>        
                                <ExpectedStartTime>P0DT0H1M0.000S</ExpectedStartTime>
                                <ExpectedDuration>P0DT1H0M0.000S</ExpectedDuration>
                            </ActionStart>
                        </Happening>
                </OrderedHappening>
                <OrderedHappening>
                    <HappeningID>2</HappeningID>
                    <ComesBefore>
                        <HappeningID>3</HappeningID>
                        <HappeningID>9</HappeningID>
                    </ComesBefore>
                    <ComesAfter>
                        <HappeningID>1</HappeningID>
                    </ComesAfter>
                    <Happening>
                        <ActionEnd>
                            <ActionID>1</ActionID>
                            </ActionEnd>
                        </Happening>
                    </OrderedHappening>                    
                </Actions>
            </Plan>
            End of plan print-out.`;

            // WHEN
            var parser: PddlPlanParser;
            await new Promise((resolve, _reject) => {
                parser = new PddlPlanParser(domainInfo, problemInfo, { epsilon: 1e-3, minimumPlansExpected: 1 }, _plans => resolve());
                parser.appendBuffer(planText);
            });
            let plans = parser.getPlans();

            // THEN
            assert.strictEqual(plans.length, 1, 'there should be one plan');
            let plan = plans[0];
            assert.strictEqual(plan.makespan, 60+60*60, 'plan makespan');
            assert.strictEqual(plan.cost, 60+60*60, 'plan metric');
            assert.strictEqual(plan.statesEvaluated, 51, 'states evaluated');
            assert.strictEqual(plan.steps.length, 1, 'plan should have one action');
            assert.strictEqual(plan.steps[0].getStartTime(), 60, 'start time');
            assert.strictEqual(plan.steps[0].getActionName(), 'action1', 'action name');
            assert.strictEqual(plan.steps[0].getFullActionName(), 'action1 c a', 'full action name');
            assert.strictEqual(plan.steps[0].isDurative, true, 'action isDurative');
            assert.strictEqual(plan.steps[0].getDuration(), 60*60, 'action duration');
        });
    });
});

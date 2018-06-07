/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from './plan';
import { PlanStep } from './PlanStep';
import { DomainInfo, ProblemInfo } from './parser';

/**
 * Parses plan in the PDDL form incrementally - line/buffer at a time.
 */
export class PddlPlanParser {

    plans: Plan[] = [];
    public static planStepPattern = /^\s*((\d+|\d+\.\d+)\s*:)?\s*\((.*)\)\s*(\[(\d+|\d+\.\d+)\])?\s*$/gim;
    planStatesEvaluatedPattern = /^;\s*States evaluated[\w ]*:[ ]*(\d*)\s*$/i;
    planCostPattern = /[\w ]*(cost|metric)[\D :]*[ ]*(\d*|\d*\.\d*)\s*$/i

    planBuilder: PlanBuilder;
    endOfBufferToBeParsedNextTime = '';

    constructor(public domain: DomainInfo, public problem: ProblemInfo, public epsilon: number, public onPlanReady?: (plans: Plan[]) => void) {
        this.planBuilder = new PlanBuilder(epsilon);
    }

    /**
     * Appends and parses the planner output.
     * @param text planner output
     */
    appendBuffer(text: string): void {
        const textString = this.endOfBufferToBeParsedNextTime + text;
        this.endOfBufferToBeParsedNextTime = '';
        let lastEndLine = 0;
        let nextEndLine: number;
        while ((nextEndLine = textString.indexOf('\n', lastEndLine)) > -1) {
            let nextLine = textString.substring(lastEndLine, nextEndLine + 1);
            this.appendLine(nextLine);
            lastEndLine = nextEndLine + 1;
        }
        if (textString.length > lastEndLine) {
            this.endOfBufferToBeParsedNextTime = textString.substr(lastEndLine);
        }
    }

    /**
     * Parses one line of parser output.
     * @param outputLine one line of planner output
     */
    appendLine(outputLine: string): void {

        let planStep = this.planBuilder.parse(outputLine, undefined);
        if (planStep) {
            // this line is a plan step
            this.appendStep(planStep);
        } else {
            // this line is NOT a plan step
            if (this.planBuilder.parsingPlan) {
                this.planBuilder.parsingPlan = false;
                this.onPlanFinished();
            }

            let group: RegExpExecArray;
            this.planStatesEvaluatedPattern.lastIndex = 0;
            this.planCostPattern.lastIndex = 0;
            if (group = this.planStatesEvaluatedPattern.exec(outputLine)) {
                this.planBuilder.statesEvaluated = parseInt(group[1]);
            }
            else if (group = this.planCostPattern.exec(outputLine)) {
                this.planBuilder.cost = parseFloat(group[2]);
            }
        }

        this.planBuilder.outputText += outputLine;
    }

    /**
     * Appends plan step. Use this when the plan does not need parsing.
     * @param planStep plan step to add to the plan
     */
    appendStep(planStep: PlanStep) {
        this.planBuilder.add(planStep);
        if (!this.planBuilder.parsingPlan) this.planBuilder.parsingPlan = true;
    }

    /**
     * Call this when the planning engine stopped. This flushes the last line in the buffered output through the parsing 
     * and adds the last plan to the collection of plans.
     */
    onPlanFinished(): void {
        if (this.endOfBufferToBeParsedNextTime.length) {
            this.appendLine(this.endOfBufferToBeParsedNextTime);
            this.endOfBufferToBeParsedNextTime = '';
        }
        if (this.planBuilder.getSteps().length > 0) {
            this.plans.push(this.planBuilder.build(this.domain, this.problem));
            this.planBuilder = new PlanBuilder(this.epsilon);
        }

        if (this.onPlanReady) this.onPlanReady.apply(this, [this.plans]);
    }

    /**
     * Gets all plans.
     */
    getPlans(): Plan[] {
        return this.plans;
    }
}

/**
 * Utility for incremental plan building as it is being parsed.
 */
export class PlanBuilder {
    statesEvaluated: number;
    cost: number;
    private steps: PlanStep[] = [];

    outputText = ""; // for information only
    parsingPlan = false;
    makespan = 0;

    constructor(private epsilon: number) {}

    parse(planLine: string, lineIndex: number | undefined): PlanStep | undefined {
        PddlPlanParser.planStepPattern.lastIndex = 0;
        let group = PddlPlanParser.planStepPattern.exec(planLine);
        if (group) {
            // this line is a valid plan step
            let time = group[2] ? parseFloat(group[2]) : this.getMakespan();
            let action = group[3];
            let isDurative = group[5] ? true : false;
            let duration = isDurative ? parseFloat(group[5]) : this.epsilon;

            return new PlanStep(time, action, isDurative, duration, lineIndex);
        } else {
            return undefined;
        }
    }

    add(step: PlanStep) {
        if (this.makespan < step.getEndTime()) {
            this.makespan = step.getEndTime();
        }
        this.steps.push(step);
    }

    getSteps(): PlanStep[] {
        return this.steps;
    }

    build(domain: DomainInfo, problem: ProblemInfo): Plan {
        let plan = new Plan(this.steps, domain, problem);

        plan.statesEvaluated = this.statesEvaluated;
        // if cost was not output by the planning engine, use the plan makespan
        plan.cost = this.cost ? this.cost : this.getMakespan();

        return plan;
    }

    getMakespan(): number {
        return this.makespan;
    }
}
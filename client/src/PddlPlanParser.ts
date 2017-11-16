/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan, PlanStep } from './plan';

/**
 * Parses plan in the PDDL form incrementally - line/buffer at a time.
 */
export class PddlPlanParser {

    plans: Plan[] = [];
    planStepPattern = /^\s*((\d+|\d+\.\d+|\.\d+)\s*:)?\s*\((.*)\)\s*(\[(\d+|\d+\.\d+|\.\d+)\])?\s*$/gim;
    planStatesEvaluatedPattern = /^; States evaluated[\w ]*:[ ]*(\d*)\s*$/i;
    planCostPattern = /[\w ]*(cost|metric)[\D :]*[ ]*(\d*|\d*\.\d*)\s*$/i

    planBuilder = new PlanBuilder();
    endOfBufferToBeParsedNextTime = '';

    constructor(public domainFileUri: string, public epsilon: number, public onPlanReady?: (plans: Plan[]) => void) {
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

        this.planStepPattern.lastIndex = 0;
        let group = this.planStepPattern.exec(outputLine);
        if (group) {
            // this line is a plan step
            let time = group[2] ? parseFloat(group[2]) : this.planBuilder.makespan();
            let action = group[3];
            let duration = group[5] ? parseFloat(group[5]) : this.epsilon;

            this.planBuilder.steps.push(new PlanStep(time, action, duration));
            if (!this.planBuilder.parsingPlan) this.planBuilder.parsingPlan = true;
        } else {
            // this line is NOT a plan step
            if (this.planBuilder.parsingPlan) {
                this.planBuilder.parsingPlan = false;
                this.onPlanFinished();
            }

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
     * Call this when the planning engine stopped. This flushes the last line in the buffered output through the parsing 
     * and adds the last plan to the collection of plans.
     */
    onPlanFinished(): void {
        if (this.endOfBufferToBeParsedNextTime.length) {
            this.appendLine(this.endOfBufferToBeParsedNextTime);
            this.endOfBufferToBeParsedNextTime = '';
        }
        if (this.planBuilder.steps.length > 0) {
            this.plans.push(this.planBuilder.build(this.domainFileUri));
            this.planBuilder = new PlanBuilder();
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
class PlanBuilder {
    statesEvaluated: number;
    cost: number;
    steps: PlanStep[] = [];

    outputText = ""; // for information only
    parsingPlan = false;

    build(domainFileUri: string): Plan {
        let plan = new Plan(this.steps, domainFileUri);

        plan.statesEvaluated = this.statesEvaluated;
        // if cost was not output by the planning engine, use the plan makespan
        plan.cost = this.cost ? this.cost : this.makespan();

        return plan;
    }

    makespan(): number {
        return this.steps.length ? Math.max(...this.steps.map(step => step.time + step.duration)) : 0;
    }
}
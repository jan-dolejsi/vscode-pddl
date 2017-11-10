/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan, PlanStep } from './plan';

export class PddlPlanParser {

    plans: Plan[] = [];
    planStepPattern = /^(\d+|\d+\.\d+|\.\d+)\s*:\s*\((.*)\)\s*(\[(\d+|\d+\.\d+|\.\d+)\])?\s*$/gim;
    planStatesEvaluatedPattern = /^; States evaluated[\w ]*:[ ]*(\d*)\s*$/i;
    planCostPattern = /^;[\w ]*(cost|metric)[\D :]*[ ]*(\d*|\d*\.\d*)\s*$/i

    planBuilder = new PlanBuilder();
    endOfBufferToBeParsedNextTime = '';

    constructor(public domainFileUri: string, public epsilon: number, public onPlanReady?: (plans: Plan[]) => void) {
    }

    appendBuffer(text: string | Buffer): void {
        const textString = this.endOfBufferToBeParsedNextTime + text.toString(); this.endOfBufferToBeParsedNextTime = '';
        let lastEndl = 0;
        let nextEndl: number;
        while ((nextEndl = textString.indexOf('\n', lastEndl)) > -1) {
            let nextLine = textString.substring(lastEndl, nextEndl + 1);
            this.appendLine(nextLine);
            lastEndl = nextEndl + 1;
        }
        if (textString.length > lastEndl) {
            this.endOfBufferToBeParsedNextTime = textString.substr(lastEndl);
        }
    }

    appendLine(outputLine: string): void {

        this.planStepPattern.lastIndex = 0;
        let group = this.planStepPattern.exec(outputLine);
        if (group) {
            // this line is a plan step
            let time = parseFloat(group[1]);
            let action = group[2];
            let duration = group[4] ? parseFloat(group[4]) : this.epsilon;

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

    getPlans(): Plan[] {
        return this.plans;
    }
}

class PlanBuilder {
    statesEvaluated: number;
    cost: number;
    steps: PlanStep[] = [];

    outputText = ""; // for information only
    parsingPlan = false;

    build(domainFileUri: string): Plan {
        let plan = new Plan(this.steps, domainFileUri);

        plan.statesEvaluated = this.statesEvaluated;
        plan.cost = this.cost;

        return plan;
    }
}
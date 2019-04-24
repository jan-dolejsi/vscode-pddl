/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { Plan } from '../../../common/src/Plan';
import { PlanStep } from "../../../common/src/PlanStep";
import { HappeningType } from "../../../common/src/HappeningsInfo";
import { SearchHappening } from "./SearchHappening";

export class StateToPlan {
    convert(state: State): Plan {

        let totalPlan = state.getTotalPlan();

        // all happenings except for ENDs
        let planStepBuilders = totalPlan
            .filter(happening => happening.kind != HappeningType.END)
            .map(happening => PlanStepBuilder.fromStart(happening));

        // now associate all ends with the corresponding starts
        totalPlan
            .filter(happening => happening.kind == HappeningType.END)
            .forEach(endHappening => StateToPlan.associate(endHappening, planStepBuilders));

        let planSteps = planStepBuilders.map(step => step.toPalStep(state.earliestTime));

        let helpfulActions = state.helpfulActions ? state.helpfulActions : [];

        return new Plan(planSteps, null, null, state.earliestTime, helpfulActions);
    }

    static associate(endHappening: SearchHappening, planSteps: PlanStepBuilder[]): void {
        let correspondingStart = planSteps.find(step => step.correspondsToEnd(endHappening) && !step.end);

        if (!correspondingStart) {
            throw new Error("Cannot find start corresponding to: " + endHappening);
        }

        correspondingStart.setEnd(endHappening);
    }
}

class PlanStepBuilder {
    end: SearchHappening;

    constructor(public readonly start: SearchHappening) {

    }

    static fromStart(happening: SearchHappening): PlanStepBuilder {
        return new PlanStepBuilder(happening);
    }

    setEnd(endHappening: SearchHappening) {
        this.end = endHappening;
    }

    correspondsToEnd(endHappening: SearchHappening): boolean {
        if (endHappening.shotCounter == -1) {
            return this.start.actionName == endHappening.actionName
                && this.end == null;
        }

        return this.start.actionName == endHappening.actionName
            && this.start.shotCounter == endHappening.shotCounter;
    }

    static readonly EPSILON = 1e-3;

    toPalStep(maxTime: number): PlanStep {
        let isDurative = this.start.kind == HappeningType.START;

        var duration = PlanStepBuilder.EPSILON;
        if (isDurative) {
            if (this.end) {
                duration = this.end.earliestTime - this.start.earliestTime;
            }
            else {
                duration = maxTime - this.start.earliestTime + maxTime * .1;
            }
        }

        return new PlanStep(this.start.earliestTime, this.start.actionName, isDurative, duration, -1);
    }
}
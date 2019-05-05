/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { Plan } from '../../../common/src/Plan';
import { PlanStep, PlanStepCommitment } from "../../../common/src/PlanStep";
import { HappeningType } from "../../../common/src/HappeningsInfo";
import { SearchHappening } from "./SearchHappening";

export class StateToPlan {

    constructor(private domain: DomainInfo, private problem: ProblemInfo) { }

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

        return new Plan(planSteps, this.domain, this.problem, state.earliestTime, helpfulActions);
    }

    static associate(endHappening: SearchHappening, planSteps: PlanStepBuilder[]): void {
        let correspondingStart = planSteps.find(step => step.correspondsToEnd(endHappening) && !step.end);

        if (!correspondingStart) {
            throw new Error("Cannot find start corresponding to: " + endHappening);
        }

        correspondingStart.setEnd(endHappening);
    }
}

/** Helps pairing corresponding start and end happenings. */
class PlanStepBuilder {
    end: SearchHappening;

    constructor(public readonly start: SearchHappening) {

    }

    static fromStart(happening: SearchHappening): PlanStepBuilder {
        return new PlanStepBuilder(happening);
    }

    /**
     * Sets corresponding end happening.
     * @param endHappening corresponding end happening
     */
    setEnd(endHappening: SearchHappening) {
        this.end = endHappening;
    }

    /**
     * Checks whether the given endHappening corresponds to this start.
     * @param endHappening end happening to test
     */
    correspondsToEnd(endHappening: SearchHappening): boolean {
        if (endHappening.shotCounter == -1) {
            return this.start.actionName == endHappening.actionName
                && this.end == null;
        }

        return this.start.actionName == endHappening.actionName
            && this.start.shotCounter == endHappening.shotCounter;
    }

    static readonly EPSILON = 1e-3;

    toPalStep(stateTime: number): PlanStep {
        let isDurative = this.start.kind == HappeningType.START;

        var duration = PlanStepBuilder.EPSILON;
        if (isDurative) {
            if (this.end) {
                duration = this.end.earliestTime - this.start.earliestTime;
            }
            else {
                // the end was not set yet (perhaps this was a dead end state and there was no relaxed plan at all)
                duration = stateTime - this.start.earliestTime + stateTime * .1;
            }
        }

        let commitment = this.getCommitment();

        return new PlanStep(this.start.earliestTime, this.start.actionName, isDurative, duration, -1, commitment);
    }

    private getCommitment(): PlanStepCommitment {
        if (this.end && !this.end.isRelaxed) return PlanStepCommitment.Committed;
        else if (!this.start.isRelaxed) return PlanStepCommitment.EndsInRelaxedPlan;
        else return PlanStepCommitment.StartsInRelaxedPlan;
    }
}
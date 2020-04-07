/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { Plan } from 'pddl-workspace';
import { PlanStep, PlanStepCommitment } from 'pddl-workspace';
import { HappeningType } from 'pddl-workspace';
import { SearchHappening } from "./SearchHappening";
import { equalsCaseInsensitive } from "../utils";
import { DEFAULT_EPSILON } from "../configuration";

export class StateToPlan {

    constructor(private domain?: DomainInfo, private problem?: ProblemInfo) { }

    convert(state: State): Plan {

        const totalPlan = state.getTotalPlan();

        // all happenings except for ENDs
        const planStepBuilders = totalPlan
            .filter(happening => happening.kind !== HappeningType.END)
            .map(happening => PlanStepBuilder.fromStart(happening));

        // now associate all ends with the corresponding starts
        totalPlan
            .filter(happening => happening.kind === HappeningType.END)
            .forEach(endHappening => StateToPlan.associate(endHappening, planStepBuilders));

        const planSteps = planStepBuilders.map(step => step.toPalStep(state.earliestTime));

        const helpfulActions = state.helpfulActions ?? [];

        return new Plan(planSteps, this.domain, this.problem, state.earliestTime, helpfulActions);
    }

    static associate(endHappening: SearchHappening, planSteps: PlanStepBuilder[]): void {
        const correspondingStart = planSteps.find(step => step.correspondsToEnd(endHappening) && !step.hasEnd());

        if (!correspondingStart) {
            throw new Error("Cannot find start corresponding to: " + endHappening.actionName);
        }

        correspondingStart.setEnd(endHappening);
    }
}

/** Helps pairing corresponding start and end happenings. */
class PlanStepBuilder {
    end: SearchHappening | undefined;

    constructor(public readonly start: SearchHappening) {

    }

    static fromStart(happening: SearchHappening): PlanStepBuilder {
        return new PlanStepBuilder(happening);
    }

    /**
     * Sets corresponding end happening.
     * @param endHappening corresponding end happening
     */
    setEnd(endHappening: SearchHappening): void {
        this.end = endHappening;
    }

    hasEnd(): boolean {
        return !!this.end;
    }

    /**
     * Checks whether the given endHappening corresponds to this start.
     * @param endHappening end happening to test
     */
    correspondsToEnd(endHappening: SearchHappening): boolean {
        const matchingName = equalsCaseInsensitive(this.start.actionName, endHappening.actionName);

        if (!matchingName) { return false; }

        if (endHappening.shotCounter === -1) {
            return this.end === undefined;
        }
        else {
            return this.start.shotCounter === endHappening.shotCounter;
        }
    }

    toPalStep(stateTime: number): PlanStep {
        const isDurative = this.start.kind === HappeningType.START;

        let duration = DEFAULT_EPSILON;
        if (isDurative) {
            if (this.end) {
                duration = this.end.earliestTime - this.start.earliestTime;
            }
            else {
                // the end was not set yet (perhaps this was a dead end state and there was no relaxed plan at all)
                duration = stateTime - this.start.earliestTime + stateTime * .1;
            }
        }

        const commitment = this.getCommitment(isDurative);

        return new PlanStep(this.start.earliestTime, this.start.actionName, isDurative, duration, -1, commitment);
    }

    private getCommitment(isDurative: boolean): PlanStepCommitment {
        if (this.end && !this.end.isRelaxed) { 
            return PlanStepCommitment.Committed; 
        }
        else if (!this.start.isRelaxed) {
            if (isDurative) {
                return PlanStepCommitment.EndsInRelaxedPlan;
            } 
            else {
                return PlanStepCommitment.Committed;
            }
        }
        else {
            return PlanStepCommitment.StartsInRelaxedPlan;
        }
    }
}
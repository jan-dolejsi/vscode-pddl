/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Happening, HappeningType } from "./HappeningsInfo";

export class PlanStep {
    actionName: string;
    objects: string[];

    constructor(private readonly time: number, public readonly fullActionName: string,
        public readonly isDurative: boolean, private readonly duration: number,
        public readonly lineIndex: number | undefined, public readonly commitment?: PlanStepCommitment) {
        let nameFragments = fullActionName.split(' ');
        this.actionName = nameFragments[0];
        this.objects = nameFragments.slice(1);
    }

    getStartTime(): number {
        return this.time;
    }

    getEndTime(): number {
        return this.isDurative ? this.time + this.duration : this.time;
    }

    getDuration(): number {
        return this.duration;
    }

    equals(other: PlanStep, epsilon: number): boolean {
        if (this.isDurative) {
            if (!other.isDurative || !PlanStep.equalsWithin(this.duration, other.duration, epsilon)) {
                return false;
            }
        }

        return PlanStep.equalsWithin(this.time, other.time, epsilon)
            && this.fullActionName.toLowerCase() == other.fullActionName.toLowerCase();
    }

    static equalsWithin(a: number, b: number, epsilon: number): boolean {
        return Math.abs(a - b) <= 1.1 * epsilon;
    }

    toPddl(): string {
        let output = "";
        if (this.time != null) output += `${this.time.toFixed(5)}: `;
        output += `(${this.fullActionName})`;
        if (this.isDurative) output += ` [${this.duration.toFixed(5)}]`;
        return output;
    }

    getHappenings(priorSteps: PlanStep[]): Happening[] {
        let count = priorSteps.filter(step => step.fullActionName === this.fullActionName).length;
        let line = priorSteps.length;

        if (this.isDurative) {
            let start = new Happening(this.getStartTime(), HappeningType.START, this.fullActionName, count, line);
            let end = new Happening(this.getEndTime(), HappeningType.END, this.fullActionName, count, line);
            return [start, end];
        } else {
            let instant = new Happening(this.getStartTime(), HappeningType.INSTANTANEOUS, this.fullActionName, count, line);
            return [instant];
        }
    }
}

export enum PlanStepCommitment {
    Committed,
    EndsInRelaxedPlan,
    StartsInRelaxedPlan
}
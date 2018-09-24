/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class PlanStep {
    actionName: string;
    objects: string[];

    constructor(private time: number, public fullActionName: string, public isDurative: boolean, private duration: number, public lineIndex: number | undefined) {
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
        let output = `${this.time.toFixed(4)}: (${this.fullActionName})`;
        if (this.isDurative) output += ` [${this.duration.toFixed(4)}]`;
        return output;
    }
}

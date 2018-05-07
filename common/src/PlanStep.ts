/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class PlanStep {
    actionName: string;
    objects: string[];

    constructor(public time: number, public fullActionName: string, public isDurative: boolean, public duration: number) {
        let nameFragments = fullActionName.split(' ');
        this.actionName = nameFragments[0];
        this.objects = nameFragments.slice(1);
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
        let output = `${this.time}: (${this.fullActionName})`;
        if (this.isDurative) output += ` [${this.duration}]`;
        return output;
    }
}

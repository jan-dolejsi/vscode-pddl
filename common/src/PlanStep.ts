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

    equals(other: PlanStep): boolean {
        if(this.isDurative){
            if (!other.isDurative || this.duration != other.duration) return false;
        }

        return this.time == other.time && this.fullActionName == other.fullActionName;
    }

    toPddl(): string {
        let output = `${this.time}: (${this.fullActionName})`;
        if (this.isDurative) output += ` [${this.duration}]`;
        return output;
    }
}

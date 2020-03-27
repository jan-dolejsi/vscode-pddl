/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { SearchHappening } from "./SearchHappening";
import { HelpfulAction } from 'pddl-workspace';

export class State {
    public h: number | undefined;
    public totalMakespan: number | undefined;
    public relaxedPlan: SearchHappening[] | undefined;
    public helpfulActions: HelpfulAction[] | undefined;
    public isDeadEnd: boolean | undefined;
    public isPlan: boolean = false;
    private _isEvaluated = false;

    constructor(public readonly id: number, public readonly origId: string, public readonly g: number,
        public readonly earliestTime: number, public readonly planHead: SearchHappening[],
        public readonly parentId?: number, public readonly actionName?: string) {

    }

    static createInitial(): State {
        return new State(0, "0", 0, 0, []);
    }

    get isEvaluated(): boolean {
        return this._isEvaluated;
    }

    evaluate(h: number, totalMakespan: number, helpfulActions: HelpfulAction[], relaxedPlan: SearchHappening[]): State {
        this.h = h;
        this.totalMakespan = totalMakespan;
        this.helpfulActions = helpfulActions;
        this.relaxedPlan = relaxedPlan;
        this.isDeadEnd = false;
        this._isEvaluated = true;

        return this;
    }

    setDeadEnd(): State {
        this.h = Number.POSITIVE_INFINITY;
        this.totalMakespan = Number.POSITIVE_INFINITY;
        this.helpfulActions = [];
        this.relaxedPlan = [];
        this.isDeadEnd = true;
        this._isEvaluated = true;

        return this;
    }

    getTotalPlan(): SearchHappening[] {
        if (this.relaxedPlan) {
            return this.planHead.concat(this.relaxedPlan);
        }
        else {
            return this.planHead;
        }
    }

    toString(): string {
        return `State={origId: ${this.origId}, G: ${this.g}, Action: ${this.actionName}, O: ${this.id}, Time: ${this.earliestTime}, parent: ${this.parentId} H: ${this.h}, Makespan: ${this.totalMakespan}}`;
    }
}
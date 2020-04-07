/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from 'pddl-workspace';

export enum PlanningOutcome { SUCCESS, FAILURE, KILLED }

/**
 * Outcome of the planner execution.
 */
export class PlanningResult {
    constructor(public readonly outcome: PlanningOutcome, public readonly plans: Plan[],
        public readonly elapsedTime: number, public readonly error?: string) { }

    /**
     * Creates the result instance for the case of successful planner execution.
     * @param plans plans
     */
    static success(plans: Plan[], elapsedTime: number): PlanningResult{
        return new PlanningResult(PlanningOutcome.SUCCESS, plans, elapsedTime, undefined);
    }

    /**
     * Creates the result instance for the case of planner failure.
     * @param error error
     */
    static failure(error: string): PlanningResult {
        return new PlanningResult(PlanningOutcome.FAILURE, [], Number.NaN, error);
    }

    /**
     * Creates the result instance for the case of planner killed by the user.
     */
    static killed(): PlanningResult {
        return new PlanningResult(PlanningOutcome.KILLED, [], Number.NaN, undefined);
    }
}
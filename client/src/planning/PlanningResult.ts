/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from './plan';

/**
 * Outcome of the planner execution.
 */
export class PlanningResult {
    constructor(public success: boolean, public plans: Plan[], public error: string) { }

    /**
     * Creates the result instance for the case of successful planner execution.
     * @param plans plans
     */
    static success(plans: Plan[]): PlanningResult{
        return new PlanningResult(true, plans, null);
    }

    /**
     * Creates the result instance for the case of planner failure.
     * @param error error
     */
    static failure(error: string){
        return new PlanningResult(false, [], error);
    }
}
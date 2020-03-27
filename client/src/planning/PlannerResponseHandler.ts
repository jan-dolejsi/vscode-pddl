/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from 'pddl-workspace';
import { PlanningRequestContext } from "./PlannerOptionsProvider";

export interface PlannerResponseHandler {
    handleOutput(outputText: string): void;
    handlePlan(plan: Plan): void;

    /**
     * Callback to provide planner config options to pass to the planner.
     * This aggregates all the options from all the registered providers.
     * @param request planning request context
     */
    providePlannerOptions(request: PlanningRequestContext): string[];
}
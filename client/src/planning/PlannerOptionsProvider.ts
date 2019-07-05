/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, ProblemInfo } from "../../../common/src/parser";

/**
 * Provides configuration options for the planner invocation.
 */
export interface PlannerOptionsProvider {

    /**
     * Callback to provide planner config options to pass via the command-line.
     * @param request planning request context
     */
    providePlannerOptions(request: PlanningRequestContext): string;
}

/**
 * Planning request context.
 */
export interface PlanningRequestContext {
    domain: DomainInfo;
    problem: ProblemInfo;
}
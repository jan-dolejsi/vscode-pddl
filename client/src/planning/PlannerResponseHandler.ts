/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from "../../../common/src/Plan";
import { PlannerOptionsProvider } from "./PlannerOptionsProvider";

export interface PlannerResponseHandler extends PlannerOptionsProvider {
    handleOutput(outputText: string): void;
    handlePlan(plan: Plan): void;
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from "../../../common/src/Plan";

export interface PlannerResponseHandler {
    handleOutput(outputText: string): void;
    handleSuccess(stdout: string, plans: Plan[]): void;
    handleError(error: Error, stderr: string): void;
}
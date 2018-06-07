/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, ProblemInfo } from './parser';
import { PlanStep } from './PlanStep';

export class Plan {
    makespan: number;
    statesEvaluated?: number;
    cost?: number;
 
    constructor(public steps: PlanStep[], public domain: DomainInfo, public problem: ProblemInfo) {
        this.makespan = Math.max(...steps.map(step => step.getEndTime()));
    }

    getText(): string {
        return this.steps.map(step => step.toPddl()).join("\n");
    }
}
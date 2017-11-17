/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, ProblemInfo } from '../../common/src/parser';

export class PlanStep {
    actionName: string;
    objects: string[];
    constructor(public time: number, public fullActionName: string, public duration: number) {
        let nameFragments = fullActionName.split(' ');
        this.actionName = nameFragments[0];
        this.objects = nameFragments.slice(1);
    }
}

export class Plan {
    makespan: number;
    statesEvaluated?: number;
    cost?: number;
 
    constructor(public steps: PlanStep[], public domain: DomainInfo, public problem: ProblemInfo) {
        this.makespan = Math.max(...steps.map(step => step.time + step.duration));
    }
}

export interface PlanningHandler {
    handleOutput(outputText: string): void;
    handleSuccess(stdout: string, plans: Plan[]): void;
    handleError(error: Error, stderr: string): void;
}
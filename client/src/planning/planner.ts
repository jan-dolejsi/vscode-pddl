/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan } from '../../../common/src/Plan';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';

export abstract class Planner {

    planningProcessKilled: boolean = false;

    constructor(protected readonly plannerPath: string) {

    }

    abstract plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: PddlPlanParser, parent: PlannerResponseHandler): Promise<Plan[]>;

    stop(): void {
        this.planningProcessKilled = true;
    }
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan, parser } from 'pddl-workspace';

export abstract class Planner {

    planningProcessKilled = false;

    constructor(protected readonly plannerPath: string) {

    }

    abstract plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlannerOutputParser, parent: PlannerResponseHandler): Promise<Plan[]>;

    stop(): void {
        this.planningProcessKilled = true;
    }
}

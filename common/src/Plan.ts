/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo } from './parser';
import { PlanStep } from './PlanStep';
import { HappeningType } from './HappeningsInfo';
import { DomainInfo } from './DomainInfo';

export class Plan {
    makespan: number;
    statesEvaluated?: number;
    cost?: number;

    constructor(public readonly steps: PlanStep[], public readonly domain: DomainInfo,
        public readonly problem: ProblemInfo,
        public readonly now?: number,
        public readonly helpfulActions?: HelpfulAction[]) {
        this.makespan = steps.length ? Math.max(...steps.map(step => step.getEndTime())) : 0;
    }

    /**
     * Returns true if any helpful actions were specified.
     */
    hasHelpfulActions() {
        return this.helpfulActions && this.helpfulActions.length > 0;
    }

    getText(): string {
        return this.steps.map(step => step.toPddl()).join("\n");
    }
}

export interface HelpfulAction {
    actionName: string;
    kind: HappeningType;
}
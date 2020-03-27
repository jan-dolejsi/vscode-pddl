/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanInfo } from 'pddl-workspace';
import { ProblemInfo, TimedVariableValue } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { PddlConfiguration } from '../configuration';
import { ValStep } from '../debugger/ValStep';

export class PlanEvaluator {
    constructor(private pddlConfiguration: PddlConfiguration) {

    }

    async evaluate(domainInfo: DomainInfo, problemInfo: ProblemInfo, planInfo: PlanInfo): Promise<TimedVariableValue[]> {
        let happenings = planInfo.getHappenings();

        const valStepPath = await this.pddlConfiguration.getValStepPath();

        if (valStepPath === undefined) { throw new Error('ValStep path not set.'); }

        return await new ValStep(domainInfo, problemInfo)
            .executeBatch(valStepPath, "", happenings);
    }
}
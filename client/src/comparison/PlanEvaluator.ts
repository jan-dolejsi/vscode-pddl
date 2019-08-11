/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo, PlanInfo, TimedVariableValue } from '../../../common/src/parser';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { PddlConfiguration } from '../configuration';
import { ValStep } from '../debugger/ValStep';

export class PlanEvaluator {
    constructor(private pddlConfiguration: PddlConfiguration) {

    }

    async evaluate(domainInfo: DomainInfo, problemInfo: ProblemInfo, planInfo: PlanInfo): Promise<TimedVariableValue[]> {
        let happenings = planInfo.getHappenings();

        const valStepPath = await this.pddlConfiguration.getValStepPath();

        return await new ValStep(domainInfo, problemInfo)
            .execute(valStepPath, "", happenings);
    }
}
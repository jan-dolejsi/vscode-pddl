/*
 * Copyright (c) Jan Dolejsi 2022. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { DomainInfo, ProblemInfo, PlanInfo } from 'pddl-workspace';
import { Uri } from 'vscode';
import { URL } from 'url';
import { postJson } from '../httpUtils';
import { PlanValidationOutcome, PlanValidator } from './PlanValidator';
import { toDiagnostic, ValParsingProblem } from './ValidatorService';

export class PlanValidatorService extends PlanValidator {

    constructor(private readonly validationService: Uri, outputCallback: (outputText: string) => void) {
        super(outputCallback);
    }

    async validate(domain: DomainInfo, problem: ProblemInfo, plan: PlanInfo, options: { epsilon: number; }): Promise<PlanValidationOutcome> {

        const requestBody = {
            domain: domain.getText(),
            problem: problem.getText(),
            plan: plan.getText()
        };

        const url = new URL(this.validationService.toString());
        const response = await postJson<ValServiceResponse>(url, requestBody, {
            evaluations: 'validation', //'plan-happenings-effect-evaluation,final-state-evaluation,plan-function-evaluation',
            epsilon: options.epsilon.toString()
        });

        console.log(response);

        return convert(plan, response.validation);
    }
}

function convert(plan: PlanInfo, response: ValServiceResponseValidation): PlanValidationOutcome {
    const diagnostics = response.problems.map(d => toDiagnostic(d));
    return new PlanValidationOutcome(plan, diagnostics, response.error);
}

interface ValServiceResponse {
    validation: ValServiceResponseValidation;
    'plan-happenings-effect-evaluation': unknown;
    'final-state-evaluation': unknown;
    'plan-function-evaluation': unknown;
}

interface ValServiceResponseValidation {
    error?: string;
    problems: ValParsingProblem[];
}

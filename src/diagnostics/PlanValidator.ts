/*
 * Copyright (c) Jan Dolejsi 2022. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { DomainInfo, PlanInfo, ProblemInfo } from 'pddl-workspace';
import { Diagnostic, DiagnosticSeverity } from 'vscode';
import { NoDomainAssociated, NoProblemAssociated } from '../workspace/workspaceUtils';
import { createDiagnostic } from './validatorUtils';

/**
 * Plan validating.
 */
export abstract class PlanValidator {

    constructor(protected readonly outputCallback: (outputText: string) => void) {
    }

    abstract validate(domain: DomainInfo,
        problem: ProblemInfo,
        plan: PlanInfo,
        options: { epsilon: number; }): Promise<PlanValidationOutcome>;
}

export class PlanValidationOutcome {
    constructor(public planInfo: PlanInfo, private diagnostics: Diagnostic[], private error?: string) {

    }

    getError(): string | undefined {
        return this.error;
    }

    getDiagnostics(): Map<string, Diagnostic[]> {
        const diagnostics = new Map<string, Diagnostic[]>();
        diagnostics.set(this.planInfo.fileUri.toString(), this.diagnostics);
        return diagnostics;
    }

    static failed(planInfo: PlanInfo, error: Error): PlanValidationOutcome {
        const message = "Validate tool failed. " + error.message;
        const diagnostic = createDiagnostic(0, 0, message, DiagnosticSeverity.Error);
        if (error instanceof NoProblemAssociated) {
            diagnostic.code = NoProblemAssociated.DIAGNOSTIC_CODE;
        }
        else if (error instanceof NoDomainAssociated) {
            diagnostic.code = NoDomainAssociated.DIAGNOSTIC_CODE;
        }

        return new PlanValidationOutcome(planInfo, [diagnostic], message);
    }


    static failedWithDiagnostics(planInfo: PlanInfo, diagnostics: Diagnostic[]): PlanValidationOutcome {
        return new PlanValidationOutcome(planInfo, diagnostics);
    }
}
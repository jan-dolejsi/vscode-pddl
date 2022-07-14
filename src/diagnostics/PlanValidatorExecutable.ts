/*
 * Copyright (c) Jan Dolejsi 2022. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { dirname } from 'path';
import { DomainInfo, ProblemInfo, PlanInfo } from 'pddl-workspace';
import { Uri, workspace } from 'vscode';
import { PlanValidationOutcome, PlanValidator } from './PlanValidator';
import { toDiagnosticsFromParsingProblems } from './validatorUtils';
import { ValPlanValidator, PlanValidationOutcome as ValPlanValidationOutcome } from './ValPlanValidator';

/**
 * Plan validator executable.
 */
export class PlanValidatorExecutable extends PlanValidator {

    constructor(private readonly validatePath: string, outputCallback: (outputText: string) => void) {
        super(outputCallback);
    }

    async validate(domain: DomainInfo, problem: ProblemInfo, plan: PlanInfo, options: { epsilon: number; }): Promise<PlanValidationOutcome> {

        const workingDir = this.createWorkingFolder(plan.fileUri);

        const outcome = await new ValPlanValidator(this.outputCallback).validate(domain, problem, plan, {
            epsilon: options.epsilon,
            cwd: workingDir,
            validatePath: this.validatePath
        });

        return this.convert(outcome);
    }

    private convert(outcome: ValPlanValidationOutcome): PlanValidationOutcome {
        const diagnostics = toDiagnosticsFromParsingProblems(outcome.getPlanProblems());
        return new PlanValidationOutcome(outcome.planInfo, diagnostics, outcome.getError());
    }

    private createWorkingFolder(planUri: Uri): string {
        if (planUri.scheme === "file") {
            return dirname(planUri.fsPath);
        }
        const workspaceFolder = workspace.getWorkspaceFolder(planUri);
        if (workspaceFolder) {
            return workspaceFolder.uri.fsPath;
        }

        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            return workspace.workspaceFolders[0].uri.fsPath;
        }

        return ".";
    }
}
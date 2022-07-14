/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, commands, OutputChannel, ExtensionContext, TextDocument, Diagnostic, Uri, DiagnosticSeverity, workspace
} from 'vscode';

import { PlanInfo, ProblemInfo, DomainInfo, PlanStep } from 'pddl-workspace';
import { PddlConfiguration } from '../configuration/configuration';
import { DomainAndProblem, getDomainAndProblemForPlan, isPlan } from '../workspace/workspaceUtils';
import { isHttp, showError } from '../utils';
import { VAL_DOWNLOAD_COMMAND } from '../validation/valCommand';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { createRangeFromLine } from './validatorUtils';
import { PlanValidatorExecutable } from './PlanValidatorExecutable';
import { PlanValidationOutcome } from './PlanValidator';
import { PlanValidatorService } from './PlanValidatorService';

export const PDDL_PLAN_VALIDATE = 'pddl.plan.validate';

/**
 * Delegate for parsing and validating plans..
 */
export class PlanDiagnostics {

    constructor(private output: OutputChannel, public codePddlWorkspace: CodePddlWorkspace, public plannerConfiguration: PddlConfiguration, context: ExtensionContext) {

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_PLAN_VALIDATE,
            async (planUri: Uri) => this.validateActiveDocument(planUri).catch(showError)));
    }

    async validateActiveDocument(planUri?: Uri): Promise<void> {

        let planDocument: TextDocument;
        if (planUri) {
            planDocument = await workspace.openTextDocument(planUri);
        }
        else {
            if (window.activeTextEditor) {
                planDocument = window.activeTextEditor.document;
            }
            else {
                throw new Error(`No active editor and no document uri provided.`);
            }
        }

        if (!isPlan(planDocument)) { return; }

        if (planDocument) {
            if (!await this.testConfiguration()) { return; }
            try {
                const outcome = await this.validatePlanDocument(planDocument);
                if (outcome.getError()) {
                    // do not open the _Problems_ pane, unless you can direct the error there
                    // commands.executeCommand('workbench.actions.view.problems');
                    throw new Error(outcome.getError());
                }
            } catch (ex) {
                console.error(ex);
                throw new Error("Plan validation failed: " + ex);
            }
        } else {
            throw new Error("There is no plan file open.");
        }
    }

    /**
     * Tests validity of the configuration and if it is missing, launches the download.
     */
    async testConfiguration(): Promise<boolean> {
        const validatePath = this.plannerConfiguration.getValidatorPath();
        if (!validatePath || validatePath.length === 0) {
            commands.executeCommand(VAL_DOWNLOAD_COMMAND);
            return false;
        }
        else {
            return true;
        }
    }

    async validatePlanDocument(planDocument: TextDocument): Promise<PlanValidationOutcome> {

        const planFileInfo = await this.codePddlWorkspace.upsertAndParseFile(planDocument) as PlanInfo;

        if (!planFileInfo) { throw new Error("Cannot open or parse plan file from: " + planDocument.uri.fsPath); }

        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return this.validatePlanAndReportDiagnostics(planFileInfo, { showOutput: true });
    }

    async validatePlanAndReportDiagnostics(planInfo: PlanInfo, options: { showOutput: boolean }): Promise<PlanValidationOutcome> {
        const epsilon = this.plannerConfiguration.getEpsilonTimeStep();
        const validatePath = this.plannerConfiguration.getValidatorPath();

        if (!validatePath) {
            throw new Error(`Validate executable path not configured.`);
        }

        let context: DomainAndProblem | undefined;

        try {
            context = getDomainAndProblemForPlan(planInfo, this.codePddlWorkspace.pddlWorkspace);
        } catch (err: unknown) {
            return PlanValidationOutcome.failed(planInfo, err as Error);
        }

        // are the actions in the plan declared in the domain?
        const actionNameDiagnostics = this.validateActionNames(context.domain, context.problem, planInfo);
        if (actionNameDiagnostics.length) {
            return PlanValidationOutcome.failedWithDiagnostics(planInfo, actionNameDiagnostics);
        }

        // are the actions start times monotonically increasing?
        const actionTimeDiagnostics = this.validateActionTimes(planInfo);
        if (actionTimeDiagnostics.length) {
            return PlanValidationOutcome.failedWithDiagnostics(planInfo, actionTimeDiagnostics);
        }

        const outputDelegate = (outputText: string) => {
            if (options.showOutput) {
                this.output.appendLine(outputText);
            }
        };

        const planValidator =
            isHttp(validatePath) ?
                new PlanValidatorService(Uri.parse(validatePath), outputDelegate) :
                new PlanValidatorExecutable(validatePath, outputDelegate);

        let outcome: PlanValidationOutcome;
        try {
            outcome = await planValidator.validate(context.domain, context.problem, planInfo, { epsilon: epsilon });
        } catch (error) {
            outcome = PlanValidationOutcome.failed(planInfo, error as Error);
        }

        if (options.showOutput) {
            this.output.show();
        }

        return outcome;
    }

    /**
     * Validate that plan steps match domain actions
     * @param domain domain file
     * @param problem problem file
     * @param plan plan
     */
    validateActionNames(domain: DomainInfo, problem: ProblemInfo, plan: PlanInfo): Diagnostic[] {
        return plan.getSteps()
            .filter(step => !this.isDomainAction(domain, problem, step))
            .map(step => new Diagnostic(createRangeFromLine(step.lineIndex ?? 0), `Action '${step.getActionName()}' not known by the domain '${domain.name}'`, DiagnosticSeverity.Error));
    }

    /**
     * Validate that plan step times are monotonically increasing
     * @param domain domain file
     * @param problem problem file
     * @param plan plan
     */
    validateActionTimes(plan: PlanInfo): Diagnostic[] {
        return plan.getSteps()
            .slice(1)
            .filter((step: PlanStep, index: number) => !this.isTimeMonotonicallyIncreasing(plan.getSteps()[index], step))
            .map(step => new Diagnostic(createRangeFromLine(step.lineIndex ?? 0), `Action '${step.getActionName()}' time ${step.getStartTime()} is before the preceding action time`, DiagnosticSeverity.Error));
    }

    private isDomainAction(domain: DomainInfo, problem: ProblemInfo, step: PlanStep): boolean {
        const allActionNames = domain.getActions().map(a => a.name?.toLowerCase() ?? 'undefined').concat(
            problem.getSupplyDemands().map(sd => sd.getName().toLowerCase()));

        return allActionNames.includes(step.getActionName().toLowerCase());
    }

    private isTimeMonotonicallyIncreasing(first: PlanStep, second: PlanStep): boolean {
        return first.getStartTime() <= second.getStartTime();
    }
}

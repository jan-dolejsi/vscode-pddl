/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, commands, OutputChannel, ExtensionContext, TextDocument, Diagnostic, Uri, DiagnosticSeverity, workspace
} from 'vscode';

import * as process from 'child_process';

import { PlanInfo, ProblemInfo, DomainInfo, PlanStep, utils } from 'pddl-workspace';
import { dirname } from 'path';
import { PddlConfiguration } from '../configuration/configuration';
import { DomainAndProblem, getDomainAndProblemForPlan, isPlan, NoProblemAssociated, NoDomainAssociated } from '../workspace/workspaceUtils';
import { showError } from '../utils';
import { VAL_DOWNLOAD_COMMAND } from '../validation/valCommand';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { createDiagnostic, createRangeFromLine } from './validatorUtils';

export const PDDL_PLAN_VALIDATE = 'pddl.plan.validate';

/**
 * Delegate for parsing and validating plans..
 */
export class PlanValidator {

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

        if (!planFileInfo) { return PlanValidationOutcome.failed(null, new Error("Cannot open or parse plan file.")); }

        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return this.validatePlanAndReportDiagnostics(planFileInfo, true, () => { }, () => { });
    }

    async validatePlanAndReportDiagnostics(planInfo: PlanInfo, showOutput: boolean, onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): Promise<PlanValidationOutcome> {
        const epsilon = this.plannerConfiguration.getEpsilonTimeStep();
        const validatePath = this.plannerConfiguration.getValidatorPath();

        if (!validatePath) {
            throw new Error(`Validate executable path not configured.`);
        }

        let context: DomainAndProblem | undefined;

        try {
            context = getDomainAndProblemForPlan(planInfo, this.codePddlWorkspace.pddlWorkspace);
        } catch (err) {
            const outcome = PlanValidationOutcome.failed(planInfo, err);
            onSuccess(outcome.getDiagnostics());
            return outcome;
        }

        // are the actions in the plan declared in the domain?
        const actionNameDiagnostics = this.validateActionNames(context.domain, context.problem, planInfo);
        if (actionNameDiagnostics.length) {
            const errorOutcome = PlanValidationOutcome.failedWithDiagnostics(planInfo, actionNameDiagnostics);
            onSuccess(errorOutcome.getDiagnostics());
            return errorOutcome;
        }

        // are the actions start times monotonically increasing?
        const actionTimeDiagnostics = this.validateActionTimes(planInfo);
        if (actionTimeDiagnostics.length) {
            const errorOutcome = PlanValidationOutcome.failedWithDiagnostics(planInfo, actionTimeDiagnostics);
            onSuccess(errorOutcome.getDiagnostics());
            return errorOutcome;
        }

        // copy editor content to temp files to avoid using out-of-date content on disk
        const domainFilePath = await utils.Util.toPddlFile('domain', context.domain.getText());
        const problemFilePath = await utils.Util.toPddlFile('problem', context.problem.getText());
        const planFilePath = await utils.Util.toPddlFile('plan', planInfo.getText());

        const args = ['-t', epsilon.toString(), '-v', domainFilePath, problemFilePath, planFilePath];
        const workingDir = this.createWorkingFolder(planInfo.fileUri);
        const child = process.spawnSync(validatePath, args, { cwd: workingDir });

        if (showOutput) { this.output.appendLine(validatePath + ' ' + args.join(' ')); }

        let outcome: PlanValidationOutcome;

        if (child.error) {
            if (showOutput) {
                this.output.appendLine(`Error: name=${child.error.name}, message=${child.error.message}`);
            }
            onError(child.error.name);
            outcome = PlanValidationOutcome.failed(planInfo, child.error);
            onSuccess(outcome.getDiagnostics());
        }
        else {
            const output = child.stdout.toString();

            if (showOutput) { this.output.appendLine(output); }

            if (showOutput && child.stderr && child.stderr.length) {
                this.output.append('Error:');
                this.output.appendLine(child.stderr.toString());
            }

            outcome = this.analyzeOutput(planInfo, child.stderr.toString(), child.error, output);
            onSuccess(outcome.getDiagnostics());
        }

        if (showOutput) {
            this.output.appendLine(`Exit code: ${child.status}`);
            this.output.show();
        }

        return outcome;
    }

    createWorkingFolder(planUri: Uri): string {
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

    analyzeOutput(planInfo: PlanInfo, stderr: string, error: Error | undefined, output: string): PlanValidationOutcome {
        if (error) {
            return PlanValidationOutcome.failed(planInfo, error);
        }

        if (output.match("Plan failed to execute") || output.match("Goal not satisfied")) {
            const failurePattern = /Checking next happening \(time (\d+.\d+)\)/g;
            let result: RegExpExecArray | null;
            let timeStamp = -1;
            while ((result = failurePattern.exec(output)) !== null) {
                timeStamp = parseFloat(result[1]);
            }

            const match = output.match(/Plan Repair Advice:([\s\S]+)Failed plans:/);
            if (match) {
                return PlanValidationOutcome.failedAtTime(planInfo, timeStamp, match[1].trim().split('\n'));
            } else {
                return PlanValidationOutcome.failedAtTime(planInfo, timeStamp, ["Unidentified error. Run the 'PDDL: Validate plan' command for more info."]);
            }
        }

        if (output.match("Bad plan description!")) {
            return PlanValidationOutcome.invalidPlanDescription(planInfo);
        } else if (output.match("Plan valid")) {
            return PlanValidationOutcome.valid(planInfo);
        }

        if (stderr?.trim()) {
            return PlanValidationOutcome.otherError(planInfo, stderr.trim());
        }

        return PlanValidationOutcome.unknown(planInfo);
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
            .map(step => new Diagnostic(createRangeFromLine(step.lineIndex), `Action '${step.getActionName()}' not known by the domain '${domain.name}'`, DiagnosticSeverity.Error));
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
            .map(step => new Diagnostic(createRangeFromLine(step.lineIndex), `Action '${step.getActionName()}' time ${step.getStartTime()} is before the preceding action time`, DiagnosticSeverity.Error));
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

class PlanValidationOutcome {
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

    static goalNotAttained(planInfo: PlanInfo): PlanValidationOutcome {
        const errorLine = planInfo.getSteps().length > 0 ? (planInfo.getSteps().slice(-1).pop()?.lineIndex??-1) + 1 : 0;
        const error = "Plan does not reach the goal.";
        const diagnostics = [createDiagnostic(errorLine, 0, error, DiagnosticSeverity.Warning)];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for invalid plan i.e. plans that do not parse or do not correspond to the domain/problem file.
     */
    static invalidPlanDescription(planInfo: PlanInfo): PlanValidationOutcome {
        const error = "Invalid plan description.";
        const diagnostics = [createDiagnostic(0, 0, error, DiagnosticSeverity.Error)];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for valid plan, which does not reach the goal.
     */
    static valid(planInfo: PlanInfo): PlanValidationOutcome {
        return new PlanValidationOutcome(planInfo, [], undefined);
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

    static failedAtTime(planInfo: PlanInfo, timeStamp: number, repairHints: string[]): PlanValidationOutcome {
        let errorLine = 0;
        const stepAtTimeStamp =
            planInfo.getSteps()
                .find(step => PlanStep.equalsWithin(step.getStartTime(), timeStamp, 1e-4));

        if (stepAtTimeStamp && stepAtTimeStamp.lineIndex !== undefined) { errorLine = stepAtTimeStamp.lineIndex; }

        const diagnostics = repairHints.map(hint => new Diagnostic(createRangeFromLine(errorLine), hint, DiagnosticSeverity.Warning));
        return new PlanValidationOutcome(planInfo, diagnostics);
    }

    static otherError(planInfo: PlanInfo, error: string): PlanValidationOutcome {
        const diagnostics = [new Diagnostic(createRangeFromLine(0), `${error}. Run the 'PDDL: Validate plan' command for more information.`, DiagnosticSeverity.Error)];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    static unknown(planInfo: PlanInfo): PlanValidationOutcome {
        const diagnostics = [new Diagnostic(createRangeFromLine(0), "Unknown error. Run the 'PDDL: Validate plan' command for more information.", DiagnosticSeverity.Warning)];
        return new PlanValidationOutcome(planInfo, diagnostics, "Unknown error.");
    }
}

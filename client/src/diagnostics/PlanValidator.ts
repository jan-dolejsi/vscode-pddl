/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, commands, OutputChannel, ExtensionContext, TextDocument, Diagnostic, Uri, Range, DiagnosticSeverity
} from 'vscode';

import * as process from 'child_process';

import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { PlanInfo, DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { PddlLanguage, ParsingProblem } from '../../../common/src/FileInfo';
import { PddlConfiguration, CONF_PDDL, VALIDATION_PATH } from '../configuration';
import { Util } from '../../../common/src/util';
import { dirname } from 'path';
import { PlanStep } from '../../../common/src/PlanStep';
import { DomainAndProblem, getDomainAndProblemForPlan, isPlan } from '../utils';

export const PDDL_PLAN_VALIDATE = 'pddl.plan.validate';

/**
 * Delegate for parsing and validating plans..
 */
export class PlanValidator {

    constructor(private output: OutputChannel, public pddlWorkspace: PddlWorkspace, public plannerConfiguration: PddlConfiguration, context: ExtensionContext) {

        context.subscriptions.push(commands.registerCommand(PDDL_PLAN_VALIDATE,
            async () => {
                if (window.activeTextEditor && isPlan(window.activeTextEditor.document)) {
                    if (!await this.testConfiguration()) { return; }
                    try {
                        let outcome = await this.validateTextDocument(window.activeTextEditor.document);
                        if (outcome.getError()) {
                            window.showErrorMessage(outcome.getError());
                        }
                    } catch (ex) {
                        window.showErrorMessage("Plan validation failed: " + ex);
                        return;
                    }
                } else {
                    window.showErrorMessage("There is no plan file open.");
                    return;
                }
            }));
    }

    async testConfiguration(): Promise<boolean> {
        let validatePath = this.plannerConfiguration.getValidatorPath();
        if (validatePath.length === 0) {

            let answer = await window.showWarningMessage(`The 'validate' executable path is not set up in '${CONF_PDDL}.${VALIDATION_PATH}'.`, "Configure 'validate' now...");
            if (answer) { commands.executeCommand('pddl.configureValidate'); }
            return false;
        }
        else {
            return true;
        }
    }

    async validateTextDocument(planDocument: TextDocument): Promise<PlanValidationOutcome> {

        let planFileInfo = <PlanInfo> await this.pddlWorkspace.upsertAndParseFile(planDocument.uri.toString(), PddlLanguage.PLAN, planDocument.version, planDocument.getText());

        if (!planFileInfo) { return PlanValidationOutcome.failed(null, new Error("Cannot open or parse plan file.")); }

        return this.validatePlanAndReportDiagnostics(planFileInfo, true, _ => { }, _ => { });
    }

    async validatePlanAndReportDiagnostics(planInfo: PlanInfo, showOutput: boolean, onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): Promise<PlanValidationOutcome> {
        let epsilon = this.plannerConfiguration.getEpsilonTimeStep();
        let validatePath = this.plannerConfiguration.getValidatorPath();

        let context: DomainAndProblem = null;

        try {
            context = getDomainAndProblemForPlan(planInfo, this.pddlWorkspace);
        } catch (err) {
            let outcome = PlanValidationOutcome.failed(planInfo, err);
            onSuccess(outcome.getDiagnostics());
            return outcome;
        }

        // are the actions in the plan declared in the domain?
        let actionNameDiagnostics = this.validateActionNames(context.domain, context.problem, planInfo);
        if (actionNameDiagnostics.length) {
            let errorOutcome = PlanValidationOutcome.failedWithDiagnostics(planInfo, actionNameDiagnostics);
            onSuccess(errorOutcome.getDiagnostics());
            return errorOutcome;
        }

        // are the actions start times monotonically increasing?
        let actionTimeDiagnostics = this.validateActionTimes(planInfo);
        if (actionTimeDiagnostics.length) {
            let errorOutcome = PlanValidationOutcome.failedWithDiagnostics(planInfo, actionTimeDiagnostics);
            onSuccess(errorOutcome.getDiagnostics());
            return errorOutcome;
        }

        // copy editor content to temp files to avoid using out-of-date content on disk
        let domainFilePath = await Util.toPddlFile('domain', context.domain.getText());
        let problemFilePath = await Util.toPddlFile('problem', context.problem.getText());
        let planFilePath = await Util.toPddlFile('plan', planInfo.getText());

        let args = ['-t', epsilon.toString(), '-v', domainFilePath, problemFilePath, planFilePath];
        let child = process.spawnSync(validatePath, args, { cwd: dirname(Uri.parse(planInfo.fileUri).fsPath) });

        if (showOutput) { this.output.appendLine(validatePath + ' ' + args.join(' ')); }

        let output = child.stdout.toString();

        if (showOutput) { this.output.appendLine(output); }

        if (showOutput && child.stderr && child.stderr.length) {
            this.output.append('Error:');
            this.output.appendLine(child.stderr.toString());
        }

        let outcome = this.analyzeOutput(planInfo, child.error, output);

        if (child.error) {
            if (showOutput) {
                this.output.appendLine(`Error: name=${child.error.name}, message=${child.error.message}`);
            }
            onError(child.error.name);
        }
        else {
            onSuccess(outcome.getDiagnostics());
        }

        if (showOutput) {
            this.output.appendLine(`Exit code: ${child.status}`);
            this.output.show();
        }

        return outcome;
    }

    analyzeOutput(planInfo: PlanInfo, error: Error, output: string): PlanValidationOutcome {
        if (error) {
            return PlanValidationOutcome.failed(planInfo, error);
        }

        if (output.match("Plan failed to execute") || output.match("Goal not satisfied")) {
            let failurePattern = /Checking next happening \(time (\d+.\d+)\)/g;
            var result: RegExpExecArray;
            var timeStamp = -1;
            while ((result = failurePattern.exec(output)) !== null) {
                timeStamp = parseFloat(result[1]);
            }

            let match = output.match(/Plan Repair Advice:([\s\S]+)Failed plans:/);
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
            .map(step => new Diagnostic(createRangeFromLine(step.lineIndex), `Action '${step.actionName}' not known by the domain ${domain.name}`, DiagnosticSeverity.Error));
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
            .map(step => new Diagnostic(createRangeFromLine(step.lineIndex), `Action '${step.actionName}' time ${step.getStartTime()} is before the preceding action time`, DiagnosticSeverity.Error));
    }

    private isDomainAction(domain: DomainInfo, problem: ProblemInfo, step: PlanStep): boolean {
        problem;
        return domain.actions.some(a => a.name.toLowerCase() === step.actionName.toLowerCase());
    }

    private isTimeMonotonicallyIncreasing(first: PlanStep, second: PlanStep): boolean {
        return first.getStartTime() <= second.getStartTime();
    }
}

class PlanValidationOutcome {
    constructor(public planInfo: PlanInfo, private diagnostics: Diagnostic[], public error: string = null) {

    }

    getError(): string {
        return this.error;
    }

    getDiagnostics(): Map<string, Diagnostic[]> {
        let diagnostics = new Map<string, Diagnostic[]>();
        diagnostics.set(this.planInfo.fileUri, this.diagnostics);
        return diagnostics;
    }

    static goalNotAttained(planInfo: PlanInfo): PlanValidationOutcome {
        let errorLine = planInfo.getSteps().length > 0 ? planInfo.getSteps().slice(-1).pop().lineIndex + 1 : 0;
        let error = "Plan does not reach the goal.";
        let diagnostics = [createDiagnostic(errorLine, 0, error, DiagnosticSeverity.Warning)];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for invalid plan i.e. plans that do not parse or do not correspond to the domain/problem file.
     */
    static invalidPlanDescription(planInfo: PlanInfo): PlanValidationOutcome {
        let error = "Invalid plan description.";
        let diagnostics = [createDiagnostic(0, 0, error, DiagnosticSeverity.Error)];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for valid plan, which does not reach the goal.
     */
    static valid(planInfo: PlanInfo): PlanValidationOutcome {
        return new PlanValidationOutcome(planInfo, [], undefined);
    }

    static failed(planInfo: PlanInfo, error: Error): PlanValidationOutcome {
        let message = "Validate tool failed. " + error.message;
        let diagnostics = [createDiagnostic(0, 0, message, DiagnosticSeverity.Error)];
        return new PlanValidationOutcome(planInfo, diagnostics, message);
    }

    static failedWithDiagnostics(planInfo: PlanInfo, diagnostics: Diagnostic[]): PlanValidationOutcome {
        return new PlanValidationOutcome(planInfo, diagnostics);
    }

    static failedAtTime(planInfo: PlanInfo, timeStamp: number, repairHints: string[]): PlanValidationOutcome {
        let errorLine = 0;
        let stepAtTimeStamp =
            planInfo.getSteps()
                .find(step => PlanStep.equalsWithin(step.getStartTime(), timeStamp, 1e-4));

        if (stepAtTimeStamp) { errorLine = stepAtTimeStamp.lineIndex; }

        let diagnostics = repairHints.map(hint => new Diagnostic(createRangeFromLine(errorLine), hint, DiagnosticSeverity.Warning));
        return new PlanValidationOutcome(planInfo, diagnostics);
    }

    static unknown(planInfo: PlanInfo): PlanValidationOutcome {
        let diagnostics = [new Diagnostic(createRangeFromLine(0), "Unknown error. Run the 'PDDL: Validate plan' command for more information.", DiagnosticSeverity.Warning)];
        return new PlanValidationOutcome(planInfo, diagnostics, "Unknown error.");
    }
}

export function createRangeFromLine(errorLine: number, errorColumn: number = 0): Range {
    return new Range(errorLine, errorColumn, errorLine, errorColumn + 100);
}

export function createDiagnostic(errorLine: number, errorColumn: number, error: string, severity: DiagnosticSeverity): Diagnostic {
    return new Diagnostic(createRangeFromLine(errorLine, errorColumn), error, severity);
}

export function createDiagnosticFromParsingProblem(problem: ParsingProblem, severity: DiagnosticSeverity): Diagnostic {
    return new Diagnostic(createRangeFromLine(problem.lineIndex, problem.columnIndex), problem.problem, severity);
}
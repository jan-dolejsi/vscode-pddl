/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, OutputChannel, ExtensionContext, TextDocument, Diagnostic, DiagnosticSeverity
} from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import * as process from 'child_process';

import { ProblemInfo, DomainInfo, HappeningsInfo, Happening, PlanStep } from 'pddl-workspace';
import { HappeningsToValStep, Util } from 'ai-planning-val';
import { PddlConfiguration } from '../configuration/configuration';
import { dirname } from 'path';
import { DomainAndProblem, isHappenings, getDomainAndProblemForHappenings } from '../workspace/workspaceUtils';
import { createRangeFromLine, createDiagnostic, createDiagnosticFromParsingProblem } from './validatorUtils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';

export const PDDL_HAPPENINGS_VALIDATE = 'pddl.happenings.validate';

/**
 * Delegate for parsing and validating Plan Happenings files.
 */
export class HappeningsValidator {

    constructor(private output: OutputChannel, public codePddlWorkspace: CodePddlWorkspace, public plannerConfiguration: PddlConfiguration, context: ExtensionContext) {

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_HAPPENINGS_VALIDATE,
            async () => {
                if (window.activeTextEditor && isHappenings(window.activeTextEditor.document)) {
                    try {
                        const outcome = await this.validateTextDocument(window.activeTextEditor.document);
                        if (outcome.getError()) {
                            window.showErrorMessage(outcome.getError()!);
                        }
                    } catch (ex) {
                        window.showErrorMessage("Happenings validation failed: " + ex);
                        return;
                    }
                } else {
                    window.showErrorMessage("There is no happenings file open.");
                    return;
                }
            }));
    }

    async validateTextDocument(planDocument: TextDocument): Promise<HappeningsValidationOutcome> {

        const planFileInfo = await this.codePddlWorkspace.upsertAndParseFile(planDocument) as HappeningsInfo;

        if (!planFileInfo) {
            return HappeningsValidationOutcome.failed(null, new Error("Cannot open or parse plan file."));
        }

        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return this.validateAndReportDiagnostics(planFileInfo, true, () => { }, () => { });
    }

    async validateAndReportDiagnostics(happeningsInfo: HappeningsInfo, showOutput: boolean, onSuccess: (diagnostics: Map<string, Diagnostic[]>) => void, onError: (error: string) => void): Promise<HappeningsValidationOutcome> {
        if (happeningsInfo.getParsingProblems().length > 0) {
            const diagnostics = happeningsInfo.getParsingProblems()
                .map(problem => createDiagnosticFromParsingProblem(problem));
            const outcome = HappeningsValidationOutcome.failedWithDiagnostics(happeningsInfo, diagnostics);
            onSuccess(outcome.getDiagnostics());
            return outcome;
        }

        let context: DomainAndProblem | null = null;

        try {
            context = getDomainAndProblemForHappenings(happeningsInfo, this.codePddlWorkspace.pddlWorkspace);
        } catch (err) {
            const outcome = HappeningsValidationOutcome.info(happeningsInfo, err);
            onSuccess(outcome.getDiagnostics());
            return outcome;
        }

        // are the actions in the plan declared in the domain?
        const actionNameDiagnostics = this.validateActionNames(context.domain, context.problem, happeningsInfo);
        if (actionNameDiagnostics.length) {
            const errorOutcome = HappeningsValidationOutcome.failedWithDiagnostics(happeningsInfo, actionNameDiagnostics);
            onSuccess(errorOutcome.getDiagnostics());
            return errorOutcome;
        }

        // are the actions start times monotonically increasing?
        const actionTimeDiagnostics = this.validateActionTimes(happeningsInfo);
        if (actionTimeDiagnostics.length) {
            const errorOutcome = HappeningsValidationOutcome.failedWithDiagnostics(happeningsInfo, actionTimeDiagnostics);
            onSuccess(errorOutcome.getDiagnostics());
            return errorOutcome;
        }

        const valStepPath = await this.plannerConfiguration.getValStepPath();
        //const valVerbose = this.plannerConfiguration.getValStepVerbose();

        if (!valStepPath) {
            onSuccess(HappeningsValidationOutcome.unknown(happeningsInfo, "ValStep not configured.").getDiagnostics());
        }

        // copy editor content to temp files to avoid using out-of-date content on disk
        const domainFilePath = await Util.toPddlFile('domain', context.domain.getText());
        const problemFilePath = await Util.toPddlFile('problem', context.problem.getText());
        const happeningsConverter = new HappeningsToValStep();
        happeningsConverter.convertAllHappenings(happeningsInfo);
        const valSteps = happeningsConverter.getExportedText(true);

        const args = [domainFilePath, problemFilePath];
        const child = process.spawnSync(valStepPath!, args, { cwd: dirname(happeningsInfo.fileUri.fsPath), input: valSteps });

        if (showOutput) { this.output.appendLine(valStepPath + ' ' + args.join(' ')); }

        const output = child.stdout.toString();

        if (showOutput) { this.output.appendLine(output); }

        if (showOutput && child.stderr && child.stderr.length) {
            this.output.append('Error:');
            this.output.appendLine(child.stderr.toString());
        }

        const outcome = this.analyzeOutput(happeningsInfo, child.error, output);

        if (child.error) {
            if (showOutput) { this.output.appendLine(`Error: name=${child.error.name}, message=${child.error.message}`); }
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    analyzeOutput(happeningsInfo: HappeningsInfo, error: Error | undefined, _output: string): HappeningsValidationOutcome {
        if (error) {
            return HappeningsValidationOutcome.failed(happeningsInfo, error);
        }

        return HappeningsValidationOutcome.valid(happeningsInfo);
    }

    /**
     * Validate that plan steps match domain actions
     * @param domain domain file
     * @param problem problem file
     * @param happeningsInfo happeningsInfo
     */
    validateActionNames(domain: DomainInfo, problem: ProblemInfo, happeningsInfo: HappeningsInfo): Diagnostic[] {
        return happeningsInfo.getHappenings()
            .filter(happening => !this.isDomainAction(domain, problem, happening))
            .map(happening => new Diagnostic(createRangeFromLine(happening.lineIndex), `Action '${happening.getAction()}' not known by the domain '${domain.name}'`, DiagnosticSeverity.Error));
    }

    /**
     * Validate that plan step times are monotonically increasing
     * @param domain domain file
     * @param problem problem file
     * @param happeningsInfo happeningsInfo
     */
    validateActionTimes(happeningsInfo: HappeningsInfo): Diagnostic[] {
        return happeningsInfo.getHappenings()
            .slice(1)
            .filter((happening: Happening, index: number) => !this.isTimeMonotonociallyIncreasing(happeningsInfo.getHappenings()[index], happening))
            .map(happening => new Diagnostic(createRangeFromLine(happening.lineIndex), `Action '${happening.getAction()}' time ${happening.getTime()} is before the preceding action time`, DiagnosticSeverity.Error));
    }

    private isDomainAction(domain: DomainInfo, problem: ProblemInfo, happening: Happening): boolean {
        const allActionNames = domain.getActions().map(a => a.name?.toLowerCase() ?? 'undefined').concat(
            problem.getSupplyDemands().map(sd => sd.getName().toLowerCase()));

        return allActionNames.includes(happening.getAction().toLowerCase());
    }

    private isTimeMonotonociallyIncreasing(first: Happening, second: Happening): boolean {
        return first.getTime() <= second.getTime();
    }
}

class HappeningsValidationOutcome {
    constructor(public readonly happeningsInfo: HappeningsInfo, private diagnostics: Diagnostic[], private error?: string) {

    }

    getError(): string | undefined {
        return this.error;
    }

    getDiagnostics(): Map<string, Diagnostic[]> {
        const diagnostics = new Map<string, Diagnostic[]>();
        diagnostics.set(this.happeningsInfo.fileUri.toString(), this.diagnostics);
        return diagnostics;
    }

    static goalNotAttained(happeningsInfo: HappeningsInfo): HappeningsValidationOutcome {
        const errorLine = happeningsInfo.getHappenings().length > 0 ?
            happeningsInfo.getHappenings().slice(-1).pop()?.lineIndex ?? 0 + 1 : 0;
        const error = "Plan does not reach the goal.";
        const diagnostics = [createDiagnostic(errorLine, 0, error, DiagnosticSeverity.Warning)];
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for invalid plan i.e. plans that do not parse or do not correspond to the domain/problem file.
     */
    static invalidPlanDescription(happeningsInfo: HappeningsInfo): HappeningsValidationOutcome {
        const error = "Invalid plan description.";
        const diagnostics = [createDiagnostic(0, 0, error, DiagnosticSeverity.Error)];
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for valid plan, which does not reach the goal.
     */
    static valid(happeningsInfo: HappeningsInfo): HappeningsValidationOutcome {
        return new HappeningsValidationOutcome(happeningsInfo, [], undefined);
    }

    static failed(happeningsInfo: HappeningsInfo, error: Error): HappeningsValidationOutcome {
        const message = "Validate tool failed. " + error.message;
        const diagnostics = [createDiagnostic(0, 0, message, DiagnosticSeverity.Error)];
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics, message);
    }

    static info(happeningsInfo: HappeningsInfo, error: Error): HappeningsValidationOutcome {
        const message = error.message;
        const diagnostics = [createDiagnostic(0, 0, message, DiagnosticSeverity.Information)];
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics, message);
    }

    static failedWithDiagnostics(happeningsInfo: HappeningsInfo, diagnostics: Diagnostic[]): HappeningsValidationOutcome {
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics);
    }

    static failedAtTime(happeningsInfo: HappeningsInfo, timeStamp: number, repairHints: string[]): HappeningsValidationOutcome {
        let errorLine = 0;
        const stepAtTimeStamp =
            happeningsInfo.getHappenings()
                .find(happening => PlanStep.equalsWithin(happening.getTime(), timeStamp, 1e-4));

        if (stepAtTimeStamp && stepAtTimeStamp.lineIndex !== undefined) { errorLine = stepAtTimeStamp.lineIndex; }

        const diagnostics = repairHints.map(hint => new Diagnostic(createRangeFromLine(errorLine), hint, DiagnosticSeverity.Warning));
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics);
    }

    static unknown(happeningsInfo: HappeningsInfo, message = "Unknown error."): HappeningsValidationOutcome {
        const diagnostics = [new Diagnostic(createRangeFromLine(0), message, DiagnosticSeverity.Warning)];
        return new HappeningsValidationOutcome(happeningsInfo, diagnostics, message);
    }
}
/*
 * Copyright (c) Jan Dolejsi 2022. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { Util } from 'ai-planning-val';
import { DomainInfo, ParsingProblem, ParsingProblemSeverity, PddlPosition, PddlRange, PlanInfo, PlanStep, ProblemInfo } from 'pddl-workspace';
import * as process from 'child_process';
import { URI } from 'vscode-uri';

/**
 * Plan validating using the VAL validator executable.
 * todo: replace by ai-planning-val/PlanValidator
 */
export class ValPlanValidator {

    constructor(private readonly outputCallback: (outputText: string) => void) {
    }

    async validate(domain: DomainInfo, problem: ProblemInfo, plan: PlanInfo, options: { validatePath: string, epsilon?: number; cwd: string }): Promise<PlanValidationOutcome> {
        // copy editor content to temp files to avoid using out-of-date content on disk
        const domainFilePath = await Util.toPddlFile('domain', domain.getText());
        const problemFilePath = await Util.toPddlFile('problem', problem.getText());
        const planFilePath = await Util.toPddlFile('plan', plan.getText());

        const args = ['-v',];

        if (options.epsilon) {
            args.push('-t', options.epsilon.toString());
        }

        args.push(domainFilePath, problemFilePath, planFilePath);
        this.outputCallback(options.validatePath + ' ' + args.join(' '));

        return await this.runProcess(options.validatePath, args, options.cwd, plan);
    }

    private async runProcess(exePath: string, args: string[], cwd: string, planInfo: PlanInfo,
    ): Promise<PlanValidationOutcome> {
        return new Promise<PlanValidationOutcome>((resolve, reject) => {
            const child = process.spawn(exePath, args, { cwd: cwd });

            let outputString = '';
            let errString = '';

            child.stdout.on('data', output => {
                const outputTextFragment = output.toString("utf8");
                this.outputCallback('Error:/n' + outputTextFragment);
                outputString += outputTextFragment;
            });

            child.stderr.on('data', errOutput => {
                const errTextFragment = errOutput.toString("utf8");
                this.outputCallback(errTextFragment);
                errString += errTextFragment;
            });

            child.on("error", error => {
                this.outputCallback(`Error: name=${error.name}, message=${error.message}`);
                if (!child.killed) {
                    reject(error);
                }
            });

            child.on("close", (code, signal) => {
                if (code !== 0) {
                    console.warn(`${exePath} exit code: ${code}, signal: ${signal}.`);
                    this.outputCallback(`Exit code: ${code}`);
                }
                const outcome = this.analyzeOutput(planInfo, errString, undefined, outputString);
                resolve(outcome);
            });
        });
    }


    private analyzeOutput(planInfo: PlanInfo, stderr: string, error: Error | undefined, output: string): PlanValidationOutcome {
        if (error) {
            return PlanValidationOutcome.failed(planInfo, error);
        }

        if (output.match("Plan failed to execute") || output.match("Goal not satisfied")) {
            const failurePattern = /Checking next happening \(time (\d+.\d+)\)/g;
            let result: RegExpExecArray | null;
            let timeStamp = -1;
            let remainingOutputIndex = 0;
            while ((result = failurePattern.exec(output)) !== null) {
                timeStamp = parseFloat(result[1]);
                remainingOutputIndex = result.index + result[0].length + 1;
            }

            const match = output.match(/Plan Repair Advice:([\s\S]+)Failed plans:/);
            if (match) {
                return PlanValidationOutcome.failedAtTime(planInfo, timeStamp, match[1].trim().split('\n'));
            } else {
                const errorOutput = output.substr(remainingOutputIndex).trim().split('\n')[0];
                if (errorOutput) {
                    return PlanValidationOutcome.failedAtTime(planInfo, timeStamp, [errorOutput], {
                        severity: "error", showMoreInfoHint: true
                    });
                } else {
                    return PlanValidationOutcome.failedAtTime(planInfo, timeStamp, [
                        "Unidentified error. Run the 'PDDL: Validate plan' command for more info."
                    ], { showMoreInfoHint: false });
                }
            }
        }

        const warnings: ParsingProblem[] = [];

        const warningPattern = /Checking next happening \(time (\d+.\d+)\)\s*\nWARNING:([^\n]+)\n/g;
        let warningMatch: RegExpExecArray | null;
        while ((warningMatch = warningPattern.exec(output)) !== null) {
            const timeStamp = parseFloat(warningMatch[1]);
            const warning = warningMatch[2];
            warnings.push(...PlanValidationOutcome.createDiagnostics(planInfo, timeStamp, [warning]));
        }

        if (output.match("Bad plan description!")) {
            return PlanValidationOutcome.invalidPlanDescription(planInfo);
        } else if (output.match("Plan valid")) {
            return PlanValidationOutcome.validWithDiagnostics(planInfo, warnings);
        }

        if (stderr?.trim()) {
            return PlanValidationOutcome.otherError(planInfo, stderr.trim());
        }

        return PlanValidationOutcome.unknown(planInfo);
    }

}

export class PlanValidationOutcome {
    constructor(public planInfo: PlanInfo, private diagnostics: ParsingProblem[], private error?: string) {

    }

    getPlanProblems() {
        return this.diagnostics;
    }

    getError(): string | undefined {
        return this.error;
    }

    static goalNotAttained(planInfo: PlanInfo): PlanValidationOutcome {
        const errorLine = planInfo.getSteps().length > 0 ? (planInfo.getSteps().slice(-1).pop()?.lineIndex ?? -1) + 1 : 0;
        const error = "Plan does not reach the goal.";
        const diagnostics = [createDiagnostic(errorLine, 0, error, "warning")];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for invalid plan i.e. plans that do not parse or do not correspond to the domain/problem file.
     */
    static invalidPlanDescription(planInfo: PlanInfo): PlanValidationOutcome {
        const error = "Invalid plan description.";
        const diagnostics = [createDiagnostic(0, 0, error, "error")];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    /**
     * Creates validation outcomes for valid plan, which does not reach the goal.
     */
    static valid(planInfo: PlanInfo): PlanValidationOutcome {
        return PlanValidationOutcome.validWithDiagnostics(planInfo, []);
    }

    /**
     * Creates validation outcomes for valid plan, which does not reach the goal.
     */
    static validWithDiagnostics(planInfo: PlanInfo, diagnostics: ParsingProblem[]): PlanValidationOutcome {
        return new PlanValidationOutcome(planInfo, diagnostics, undefined);
    }

    static failed(planInfo: PlanInfo, error: Error): PlanValidationOutcome {
        const message = "Validate tool failed. " + error.message;
        const diagnostic = createDiagnostic(0, 0, message, "error");
        // todo: here is where we could set the diagnostic.code
        return new PlanValidationOutcome(planInfo, [diagnostic], message);
    }

    static createDiagnostics(planInfo: PlanInfo, timeStamp: number, repairHints: string[], options?: PlanValidationOutcomeOptions): ParsingProblem[] {
        let errorLine = 0;
        const stepAtTimeStamp =
            planInfo.getSteps()
                .find(step => PlanStep.equalsWithin(step.getStartTime(), timeStamp, 1e-4));

        if (stepAtTimeStamp && stepAtTimeStamp.lineIndex !== undefined) { errorLine = stepAtTimeStamp.lineIndex; }

        const range = PddlRange.createFullLineRange(errorLine);
        return repairHints.map(hint => PlanValidationOutcome.createDiagnostic(planInfo, range, hint, options));
    }

    static createDiagnostic(planInfo: PlanInfo, range: PddlRange, message: string, options?: PlanValidationOutcomeOptions): ParsingProblem {
        const diagnostic = new PlanProblem(range, message.trim(), options?.severity ?? "warning");

        if (options?.showMoreInfoHint) {
            diagnostic.relatedInformation = [
                new DiagnosticRelatedInformation(new PddlLocation(planInfo.fileUri, range),
                    "Run the 'PDDL: Validate plan' command for more info.")
            ];
        }
        return diagnostic;
    }

    static failedAtTime(planInfo: PlanInfo, timeStamp: number, repairHints: string[], options?: PlanValidationOutcomeOptions): PlanValidationOutcome {
        const diagnostics = PlanValidationOutcome.createDiagnostics(planInfo, timeStamp, repairHints, options);
        return new PlanValidationOutcome(planInfo, diagnostics);
    }

    static otherError(planInfo: PlanInfo, error: string): PlanValidationOutcome {
        const diagnostics = [new PlanProblem(PddlRange.createFullLineRange(0), `${error}. Run the 'PDDL: Validate plan' command for more information.`, "error")];
        return new PlanValidationOutcome(planInfo, diagnostics, error);
    }

    static unknown(planInfo: PlanInfo): PlanValidationOutcome {
        const diagnostics = [new PlanProblem(PddlRange.createFullLineRange(0), "Unknown error. Run the 'PDDL: Validate plan' command for more information.", "warning")];
        return new PlanValidationOutcome(planInfo, diagnostics, "Unknown error.");
    }
}

export interface PlanValidationOutcomeOptions {
    severity?: ParsingProblemSeverity;
    showMoreInfoHint?: boolean;
}

export class PlanProblem extends ParsingProblem {
    relatedInformation: DiagnosticRelatedInformation[] = [];
    constructor(range: PddlRange, problem: string, severity: ParsingProblemSeverity) {
        super(problem, severity, range);
    }
}

function createDiagnostic(errorLine: number, errorColumn: number, error: string, severity: ParsingProblemSeverity): PlanProblem {
    return new PlanProblem(PddlRange.createSingleLineRange({ line: errorLine, start: errorColumn }), error, severity);
}


/**
 * Represents a related message and source code location for a diagnostic. This should be
 * used to point to code locations that cause or related to a diagnostics, e.g. when duplicating
 * a symbol in a scope.
 */
export class DiagnosticRelatedInformation {

    /**
     * Creates a new related diagnostic information object.
     *
     * @param location The location.
     * @param message The message.
     */
    constructor(public readonly location: PddlLocation, public readonly message: string) { }
}


/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export class PddlLocation {

    /**
     * Creates a new location object.
     *
     * @param uri The resource identifier.
     * @param rangeOrPosition The range or position. Positions will be converted to an empty range.
     */
    constructor(public readonly uri: URI, public readonly rangeOrPosition: PddlRange | PddlPosition) { }
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';
import { EventEmitter } from 'events';

import { Util } from '../../../common/src/util';
import { TimedVariableValue, VariableValue, ProblemInfo, DomainInfo, Parser } from '../../../common/src/parser';
import { Happening } from '../../../common/src/HappeningsInfo';
import { HappeningsToValStep } from '../diagnostics/HappeningsToValStep';

/**
 * Wraps the Valstep executable.
 */
export class ValStep extends EventEmitter {

    variableValues: TimedVariableValue[];
    initialValues: TimedVariableValue[];
    valStepInput: string = '';
    outputBuffer: string = '';
    happeningsConvertor: HappeningsToValStep;
    verbose = false;

    public static HAPPENING_EFFECTS_EVALUATED = Symbol("HAPPENING_EFFECTS_EVALUATED");
    public static NEW_HAPPENING_EFFECTS = Symbol("NEW_HAPPENING_EFFECTS");

    constructor(private domainInfo: DomainInfo, private problemInfo: ProblemInfo) {
        super();
        this.variableValues = problemInfo.getInits().map(v => TimedVariableValue.copy(v));
        this.initialValues = this.variableValues.map(v => TimedVariableValue.copy(v));
        this.happeningsConvertor = new HappeningsToValStep();
    }

    async execute(valStepPath: string, cwd: string, happenings: Happening[]): Promise<TimedVariableValue[]> {
        let args = this.createValStepArgs();

        const that = this;

        return new Promise<TimedVariableValue[]>(async (resolve, reject) => {
            let child = process.execFile(valStepPath, args, { cwd: cwd, timeout: 2000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error.message);
                }
                if (that.verbose) {
                    stdout;
                    console.log(stderr);
                }
                let eventualProblem = that.outputBuffer;
                let newValues = that.extractInitialState(eventualProblem);
                resolve(newValues);
            });

            let outputtingProblem = false;

            child.stdout.on('data', output => {
                if (this.verbose) console.log("ValStep <<<" + output);
                if (outputtingProblem) {
                    this.outputBuffer += output;
                } else if (output.indexOf('(define (problem') >= 0) {
                    this.outputBuffer = output.substr(output.indexOf('(define (problem'));
                    outputtingProblem = true;
                }
            });

            let groupedHappenings = Util.groupBy(happenings, h => h.getTime());

            for (const time of groupedHappenings.keys()) {
                const happeningGroup = groupedHappenings.get(time);
                let valSteps = this.happeningsConvertor.convert(happeningGroup);
                this.valStepInput += valSteps;

                try {
                    if (!child.stdin.write(valSteps))
                        reject('Cannot post happenings to valstep');
                    if (this.verbose) console.log("ValStep >>>" + valSteps);
                }
                catch(err) {
                    if (this.verbose) console.log("ValStep intput causing error: " + valSteps);
                    reject('Cannot post happenings to valstep: ' + err);
                }
            }

            child.stdin.write('q\n');
        });

    }

    extractInitialState(problemText: string): TimedVariableValue[] {
        let problemInfo = new Parser().tryProblem("eventual-problem://not-important", 0, problemText);

        if (!problemInfo) return null;

        return problemInfo.getInits().filter(value => this.applyIfNew(0, value.getVariableValue()));
    }

    async executeIncrementally(valStepPath: string, cwd: string, happenings: Happening[]): Promise<TimedVariableValue[]> {
        let args = this.createValStepArgs();
        let child = process.execFile(valStepPath, args, { cwd: cwd });

        // subscribe to the child process standard output stream and concatenate it till it is complete
        child.stdout.on('data', output => {
            if (this.verbose) console.log("ValStep <<<" + output);
            this.outputBuffer += output;
            if (this.isOutputComplete(this.outputBuffer)) {
                const variableValues = this.parseEffects(this.outputBuffer);
                this.outputBuffer = ''; // reset the output buffer
                this.emit(ValStep.HAPPENING_EFFECTS_EVALUATED, variableValues);
            }
        });

        // subscribe to the process exit event to be able to report possible crashes
        child.on("error", err => this.throwValStepError(err));
        child.on("exit", (code, signal) => this.throwValStepExitCode(code, signal));

        let groupedHappenings = Util.groupBy(happenings, h => h.getTime());

        for (const time of groupedHappenings.keys()) {
            const happeningGroup = groupedHappenings.get(time);
            await this.postHappeningsInteractively(child, happeningGroup);
        }

        child.stdin.write('q\n');

        return this.variableValues;
    }

    private createValStepArgs(): string[] {
        // copy editor content to temp files to avoid using out-of-date content on disk
        let domainFilePath = Util.toPddlFile('domain', this.domainInfo.getText());
        let problemFilePath = Util.toPddlFile('problem', this.problemInfo.getText());

        let args = [domainFilePath, problemFilePath];
        return args;
    }

    private async postHappeningsInteractively(childProcess: process.ChildProcess, happenings: Happening[]): Promise<boolean> {
        let valSteps = this.happeningsConvertor.convert(happenings);
        this.valStepInput += valSteps;
        const that = this;

        return new Promise<boolean>((resolve, reject) => {
            let lastHappening = happenings[happenings.length - 1];
            const lastHappeningTime = lastHappening.getTime();

            let timeOut = setTimeout(
                lastHappeningTime1 => {
                    childProcess.kill();
                    reject(`ValStep did not respond to happenings @ ${lastHappeningTime1}`);
                },
                500, lastHappeningTime);

            // subscribe to the valstep child process updates
            that.once(ValStep.HAPPENING_EFFECTS_EVALUATED, (effectValues: VariableValue[]) => {
                clearTimeout(timeOut);
                let newValues = effectValues.filter(v => that.applyIfNew(lastHappeningTime, v));
                if (newValues.length > 0)
                    this.emit(ValStep.NEW_HAPPENING_EFFECTS, happenings, newValues);
                resolve(true);
            });

            try {
                if (!childProcess.stdin.write(valSteps))
                    reject('Cannot post happenings to valstep');
                if (this.verbose) console.log("ValStep >>>" + valSteps);
            }
            catch(err) {
                if (this.verbose) console.log("ValStep intput causing error: " + valSteps);
                reject('Cannot post happenings to valstep: ' + err);
            }
        });
    }

    applyIfNew(time: number, value: VariableValue): boolean {
        let currentValue = this.variableValues.find(v => v.getVariableName().toLowerCase() === value.getVariableName().toLowerCase());
        if (currentValue === undefined) {
            this.variableValues.push(TimedVariableValue.from(time, value));
            return true;
        }
        else {
            if (value.getValue() === currentValue.getValue()) {
                return false;
            }
            else {
                currentValue.update(time, value);
                return true;
            }
        }
    }

    throwValStepExitCode(code: number, signal: string): void {
        if (code != 0)
            throw new ValStepExitCode(`Valstep exit code ${code} and signal ${signal}`);
    }

    throwValStepError(err: Error): void {
        throw new ValStepError(`Valstep failed with error ${err.name} and message ${err.message}`);
    }

    valStepOutputPattern = /^(?:(?:\? )?Posted action \d+\s+)*(?:\? )+Seeing (\d+) changed lits\s*([\s\S]*)\s+\?\s*$/m;
    valStepLiteralsPattern = /([\w-]+(?: [\w-]+)*) - now (true|false|[+-]?\d+\.?\d*(?:e[+-]?\d+)?)/g;

    isOutputComplete(output: string): boolean {
        this.valStepOutputPattern.lastIndex = 0;
        var match = this.valStepOutputPattern.exec(output);
        if (match) {
            var expectedChangedLiterals = parseInt(match[1]);
            var changedLiterals = match[2];

            if (expectedChangedLiterals == 0) return true; // the happening did not have any effects

            this.valStepLiteralsPattern.lastIndex = 0;
            var actualChangedLiterals = changedLiterals.match(this.valStepLiteralsPattern).length;

            return expectedChangedLiterals <= actualChangedLiterals; // functions are not included in the expected count
        }
        else {
            return false;
        }
    }

    parseEffects(happeningsEffectText: string): VariableValue[] {
        const effectValues: VariableValue[] = [];

        this.valStepOutputPattern.lastIndex = 0;
        var match = this.valStepOutputPattern.exec(happeningsEffectText);
        if (match) {
            var changedLiterals = match[2];

            this.valStepLiteralsPattern.lastIndex = 0;
            var match1: RegExpExecArray;
            while (match1 = this.valStepLiteralsPattern.exec(changedLiterals)) {
                var variableName = match1[1];
                var valueAsString = match1[2];
                var value: number | boolean;

                if (valueAsString === "true") {
                    value = true;
                }
                else if (valueAsString === "false") {
                    value = false;
                }
                else if (!isNaN(parseFloat(valueAsString))) {
                    value = parseFloat(valueAsString);
                }

                effectValues.push(new VariableValue(variableName, value));
            }

            return effectValues;
        }
        else {
            throw new Error(`ValStep output does not parse: ${happeningsEffectText}`);
        }
    }

    getUpdatedValues(): TimedVariableValue[] {
        return this.variableValues
            .filter(value1 => this.changedFromInitial(value1));
    }

    changedFromInitial(value1: TimedVariableValue) {
        return !this.initialValues.some(value2 => value1.sameValue(value2));
    }
}

export class ValStepError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class ValStepExitCode extends Error {
    constructor(message: string) {
        super(message);
    }
}
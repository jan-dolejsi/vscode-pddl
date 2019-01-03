/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as process from 'child_process';
import { EventEmitter } from 'events';

import { Util } from '../../../common/src/util';
import { TimedVariableValue, VariableValue, ProblemInfo, DomainInfo } from '../../../common/src/parser';
import { Happening } from '../HappeningsInfo';
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

    public static HAPPENING_EFFECTS_EVALUATED = Symbol("HAPPENING_EFFECTS_EVALUATED");
    public static NEW_HAPPENING_EFFECTS = Symbol("NEW_HAPPENING_EFFECTS");

    constructor(private domainInfo: DomainInfo, private problemInfo: ProblemInfo) {
        super();
        this.variableValues = problemInfo.getInits().map(v => TimedVariableValue.copy(v));
        this.initialValues = this.variableValues.map(v => TimedVariableValue.copy(v));
        this.happeningsConvertor = new HappeningsToValStep();
    }

    async execute(valStepPath: string, cwd: string, happenings: Happening[]): Promise<TimedVariableValue[]> {
        // copy editor content to temp files to avoid using out-of-date content on disk
        let domainFilePath = Util.toPddlFile('domain', this.domainInfo.getText());
        let problemFilePath = Util.toPddlFile('problem', this.problemInfo.getText());

        let args = [domainFilePath, problemFilePath];
        let cmd = Util.q(valStepPath) + ' ' + args.join(' ');
        let child = process.exec(cmd, { cwd: cwd });

        // subscribe to the child process standard output stream and concatenate it till it is complete
        child.stdout.on('data', output => {
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
            try {
                await this.postHappenings(child, happeningGroup);
            } catch (err) {
                console.log(err);
            }
        }

        child.stdin.write('q\n');

        return this.variableValues;
    }

    async postHappenings(childProcess: process.ChildProcess, happenings: Happening[]): Promise<boolean> {
        let valSteps = this.happeningsConvertor.convert(happenings);
        this.valStepInput += valSteps;
        const that = this;

        return new Promise<boolean>((resolve, reject) => {
            let lastHappening = happenings[happenings.length - 1];
            const lastHappeningTime = lastHappening.getTime();

            // subscribe to the valstep child process updates
            that.once(ValStep.HAPPENING_EFFECTS_EVALUATED, (effectValues: VariableValue[]) => {
                let newValues = effectValues.filter(v => that.applyIfNew(lastHappeningTime, v));
                if (newValues.length > 0)
                    this.emit(ValStep.NEW_HAPPENING_EFFECTS, happenings, newValues);
                resolve(true);
            });

            if (!childProcess.stdin.write(valSteps))
                reject('Cannot post happenings to valstep');
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
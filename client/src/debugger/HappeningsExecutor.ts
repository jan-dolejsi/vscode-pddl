/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { window, Uri } from 'vscode';
import { PddlConfiguration } from '../configuration';
import { Util } from '../../../common/src/util';
import { dirname } from 'path';
import * as process from 'child_process';
import { HappeningsToValStep } from '../diagnostics/HappeningsToValStep';
import { DebuggingSessionFiles } from './DebuggingSessionFiles';
import { Happening } from '../HappeningsInfo';
import { TimedVariableValue, VariableValue } from '../../../common/src/parser';
import { EventEmitter } from 'events';

/**
 * Executes sequence of plan happenings and decorates the happenings file with action effects.
 */
export class HappeningsExecutor extends EventEmitter {

    happeningsConvertor: HappeningsToValStep;
    variableValues: TimedVariableValue[];
    outputBuffer: string = '';
    decorations: vscode.TextEditorDecorationType[] = [];

    public static HAPPENING_EFFECTS_EVALUATED = Symbol("HAPPENING_EFFECTS_EVALUATED");

    /**
     * Constructs the executor.
     * @param editor happenings text editor
     * @param context debugging session context - the happenings, problem and domain files
     * @param pddlConfiguration user/workspace configuration
     */
    constructor(private editor: vscode.TextEditor, private context: DebuggingSessionFiles, private pddlConfiguration: PddlConfiguration) {
        super();
        this.happeningsConvertor = new HappeningsToValStep();
        this.variableValues = context.problem.getInits().map(v => TimedVariableValue.copy(v));
    }

    /**
     * Executes all the happenings and decorates the happenings file with action effects.
     */
    async execute(): Promise<vscode.TextEditorDecorationType[]> {

        if (this.context.happenings.getParsingProblems().length > 0) {
            vscode.commands.executeCommand('workbench.action.problems.show');
            vscode.window.showErrorMessage('The plan happenings file contains syntactic errors. Fix those first.');
            return [];
        }

        let valStepPath = this.pddlConfiguration.getValStepPath();

        // copy editor content to temp files to avoid using out-of-date content on disk
        let domainFilePath = Util.toPddlFile('domain', this.context.domain.getText());
        let problemFilePath = Util.toPddlFile('problem', this.context.problem.getText());

        let args = [domainFilePath, problemFilePath];
        let cwd = dirname(Uri.parse(this.context.happenings.fileUri).fsPath);
        let cmd = valStepPath + ' ' + args.join(' ');
        let child = process.exec(cmd, { cwd: cwd });

        // subscribe to the child process standard output stream and concatenate it till it is complete
        child.stdout.on('data', output => {
            this.outputBuffer += output;
            if (this.isOutputComplete(this.outputBuffer)) {
                const variableValues = this.parseEffects(this.outputBuffer);
                this.outputBuffer = ''; // reset the output buffer
                this.emit(HappeningsExecutor.HAPPENING_EFFECTS_EVALUATED, variableValues);
            }
        });

        let groupedHappenings = Util.groupBy(this.context.happenings.getHappenings(), h => h.getTime());

        for (const time of groupedHappenings.keys()) {
            const happeningGroup = groupedHappenings.get(time);
            try {
                await this.postHappenings(child, happeningGroup);
            } catch (err) {
                console.log(err);
            }
        }

        child.stdin.write('q\n');

        return this.decorations;
    }

    async postHappenings(childProcess: process.ChildProcess, happenings: Happening[]): Promise<boolean> {
        let valSteps = this.happeningsConvertor.convert(happenings);

        let that = this;

        return new Promise<boolean>((resolve, reject) => {
            let lastHappening = happenings[happenings.length - 1];

            // subscribe to the valstep child process updates
            that.once(HappeningsExecutor.HAPPENING_EFFECTS_EVALUATED, (effectValues: VariableValue[]) => {
                let newValues = effectValues.filter(v => that.applyIfNew(lastHappening.getTime(), v));
                let decoration = this.createDecorationText(newValues);
                that.decorate(decoration, lastHappening);
                resolve(true);
            });

            if (!childProcess.stdin.write(valSteps))
                reject('Cannot post happenings to valstep');
        });
    }

    valStepOutputPattern = /^(?:(?:\? )?Posted action \d+\s+)*\? Seeing (\d+) changed lits\s*([\s\S]*)\s+\?\s*$/m;
    valStepLiteralsPattern = /([\w-]+(?: [\w-]+)*) - now (true|false|[-\d.]+)/g;

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

    createDecorationText(values: VariableValue[]): string {
        const positiveEffects = values.filter(v => v.getValue() === true).sort((a, b) => a.getVariableName().localeCompare(b.getVariableName()));
        const negativeEffects = values.filter(v => v.getValue() === false).sort((a, b) => a.getVariableName().localeCompare(b.getVariableName()));
        const numericEffects = values.filter(v => v.getValue() !== true && v.getValue() !== false).sort((a, b) => a.getVariableName().localeCompare(b.getVariableName()));

        const decorations: string[] = [];

        if (positiveEffects.length > 0) {
            let decoration = 'Sets: ' + positiveEffects.map(v => `(${v.getVariableName()})`).join(', ');
            decorations.push(decoration);
        }

        if (negativeEffects.length > 0) {
            let decoration = 'Unsets: ' + negativeEffects.map(v => `(${v.getVariableName()})`).join(', ');
            decorations.push(decoration);
        }

        if (numericEffects.length > 0) {
            let decoration = 'Assigns: ' + numericEffects.map(v => `(${v.getVariableName()}):=${v.getValue()}`).join(', ');
            decorations.push(decoration);
        }

        return decorations.length > 0 ? decorations.join(', ') : 'Has no effects.';
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

    decorate(decorationText: string, lastHappening: Happening): void {
        let decorationType = window.createTextEditorDecorationType({
            after: {
                contentText: decorationText,
                fontStyle: "italic",
                textDecoration: "; opacity: 0.5; font-size: 10px; margin-left: 5px"
            }
        });

        let line = lastHappening.lineIndex;
        let range = new vscode.Range(line, 0, line, 100);
        this.editor.setDecorations(decorationType, [range]);
        this.decorations.push(decorationType);
    }
}
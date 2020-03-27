/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { window, Uri } from 'vscode';
import { PddlConfiguration } from '../configuration';
import { dirname } from 'path';
import { DebuggingSessionFiles } from './DebuggingSessionFiles';
import { Happening, VariableValue } from 'pddl-workspace';
import { ValStep, ValStepError, ValStepExitCode } from 'ai-planning-val';

/**
 * Executes sequence of plan happenings and decorates the happenings file with action effects.
 */
export class HappeningsExecutor {

    private valStep: ValStep;
    decorations: vscode.TextEditorDecorationType[] = [];

    /**
     * Constructs the executor.
     * @param editor happenings text editor
     * @param context debugging session context - the happenings, problem and domain files
     * @param pddlConfiguration user/workspace configuration
     */
    constructor(private editor: vscode.TextEditor, private context: DebuggingSessionFiles, private pddlConfiguration: PddlConfiguration) {
        this.valStep = new ValStep(context.domain, context.problem);
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

        let valStepPath = await this.pddlConfiguration.getValStepPath();
        let valStepVerbose = this.pddlConfiguration.getValStepVerbose();
        if (!valStepPath) { return []; }
        let cwd = dirname(Uri.parse(this.context.happenings.fileUri).fsPath);

        try {
            this.valStep.on(ValStep.NEW_HAPPENING_EFFECTS, (happenings, values) => this.showValues(happenings, values));

            await this.valStep.executeIncrementally(this.context.happenings.getHappenings(), { valStepPath, cwd, verbose: valStepVerbose });

            this.decorations.push(this.seeNextLineDecoration);
        } catch (err) {
            if (err instanceof ValStepError) {
                window.showErrorMessage(err.message);
            }
            else if (err instanceof ValStepExitCode) {
                window.showInformationMessage(err.message);
            }
            else {
                window.showErrorMessage(err);
            }
        }

        return this.decorations;
    }

    showValues(happenings: Happening[], values: VariableValue[]): void {
        let decoration = this.createDecorationText(values);
        this.decorate(decoration, happenings);
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

    seeNextLineDecoration = window.createTextEditorDecorationType({
        after: {
            contentText: '↓',
            textDecoration: "; opacity: 0.5; font-size: 10px; margin-left: 5px"
        }
    });

    seeNextLineRanges: vscode.Range[] = [];

    decorate(decorationText: string, happenings: Happening[]): void {
        let decorationType = window.createTextEditorDecorationType({
            after: {
                contentText: decorationText,
                textDecoration: "; opacity: 0.5; font-size: 10px; margin-left: 5px"
            }
        });

        let lastHappening = happenings[happenings.length - 1];

        let range = this.createRange(lastHappening);
        this.editor.setDecorations(decorationType, [range]);
        this.decorations.push(decorationType);

        for (let index = 0; index < happenings.length - 1; index++) {
            let range = this.createRange(happenings[index]);
            this.seeNextLineRanges.push(range);
            this.editor.setDecorations(this.seeNextLineDecoration, this.seeNextLineRanges);
        }
    }

    createRange(happening: Happening): vscode.Range {
        let line = happening.lineIndex ?? 0;
        return new vscode.Range(line, 0, line, 100);
    }
}
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

/**
 * Executes sequence of plan happenings and decorates the happenings file with action effects.
 */
export class HappeningsExecutor {

    /**
     * Constructs the executor.
     * @param editor happenings text editor
     * @param context debugging session context - the happenings, problem and domain files
     * @param pddlConfiguration user/workspace configuration
     */
    constructor(private editor: vscode.TextEditor, private context: DebuggingSessionFiles, private pddlConfiguration: PddlConfiguration) {

    }

    /**
     * Executes all the happenings and decorates the happenings file with action effects.
     */
    async execute(): Promise<boolean> {

        if (this.context.happenings.getParsingProblems().length > 0) {
            vscode.commands.executeCommand('workbench.action.problems.show');
            vscode.window.showErrorMessage('The plan happenings file contains syntactic errors. Fix those first.');
            return false;
        }

        let valStepPath = this.pddlConfiguration.getValStepPath();

        // copy editor content to temp files to avoid using out-of-date content on disk
        let domainFilePath = Util.toPddlFile('domain', this.context.domain.getText());
        let problemFilePath = Util.toPddlFile('problem', this.context.problem.getText());

        let args = [domainFilePath, problemFilePath];
        let cwd = dirname(Uri.parse(this.context.happenings.fileUri).fsPath);
        let cmd = valStepPath + ' ' + args.join(' ');
        let child = process.exec(cmd, { cwd: cwd });

        let groupedHappenings = Util.groupBy(this.context.happenings.getHappenings(), h => h.getTime());

        let that = this;
        groupedHappenings.forEach(async (happenings) => {
            let outcome = await that.postHappenings(child, happenings);
            outcome;
        });

        child.stdin.write('q\n');

        return true;
    }

    async postHappenings(childProcess: process.ChildProcess, happenings: Happening[]): Promise<boolean> {
        let happeningsConvertor = new HappeningsToValStep();
        happeningsConvertor.convert(happenings);
        let valSteps = happeningsConvertor.getExportedText(false);

        let output = '';


        let that = this;

        return new Promise<boolean>((resolve, reject) => {
            if (!childProcess.stdin.write(valSteps)) reject('Cannot post happenings to valstep');

            childProcess.stdout.on('data', data => {
                output += data;

                that.decorate(output.split('\n').join('/'), happenings[happenings.length - 1]);
                resolve(true);
            });
        });
        // childProcess.on('exit', function (code, signal) {
        //     console.log('child process exited with ' +
        //         `code ${code} and signal ${signal}`);
        // });
    }

    decorate(output: string, lastHappening: Happening): void {
        let decorationType = window.createTextEditorDecorationType({
            after: {
                contentText: output,
                fontStyle: "italic",
                textDecoration: "; opacity: 0.5; font-size: 10px"
            }
        });

        let line = lastHappening.lineIndex;
        let range = new vscode.Range(line, 0, line, 100);
        this.editor.setDecorations(decorationType, [range]);
    }
}
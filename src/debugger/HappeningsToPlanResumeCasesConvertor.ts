/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, commands, window } from 'vscode';
import { PddlConfiguration } from '../configuration/configuration';
import { Util as ValUtil } from 'ai-planning-val';
import { utils } from 'pddl-workspace';
import { dirname, relative, basename, join } from 'path';
import * as process from 'child_process';
import { HappeningsToValStep } from 'ai-planning-val';
import { DebuggingSessionFiles } from './DebuggingSessionFiles';
import { TestsManifest } from '../ptest/TestsManifest';
import { Test } from '../ptest/Test';
import { Happening, HappeningType } from 'pddl-workspace';
import { PTEST_REVEAL, PTEST_REFRESH } from '../ptest/PTestCommands';

/**
 * Executes sequence of plan happenings and generates suite of test cases to attempt planning from any intermediate state.
 */
export class HappeningsToPlanResumeCasesConvertor {

    private happeningsConvertor: HappeningsToValStep;
    problemFilePath: string;

    /**
     * Constructs the executor.
     * @param context debugging session context - the happenings, problem and domain files
     * @param pddlConfiguration user/workspace configuration
     */
    constructor(private context: DebuggingSessionFiles, private pddlConfiguration: PddlConfiguration) {
        this.happeningsConvertor = new HappeningsToValStep();
        this.problemFilePath = context.problem.fileUri.fsPath;
    }

    /**
     * Executes all the happenings and decorates the happenings file with action effects.
     */
    async generate(): Promise<boolean> {

        if (this.context.happenings.getParsingProblems().length > 0) {
            commands.executeCommand('workbench.action.problems.show');
            window.showErrorMessage('The plan happenings file contains syntactic errors. Fix those first.');
            return false;
        }

        const valStepPath = await this.pddlConfiguration.getValStepPath();
        if (!valStepPath) { return false; }

        // copy editor content to temp files to avoid using out-of-date content on disk
        const domainFilePath = await ValUtil.toPddlFile('domain', this.context.domain.getText());
        const problemFilePath = await ValUtil.toPddlFile('problem', this.context.problem.getText());

        const args = [domainFilePath, problemFilePath];
        const outputFolderUris = await window.showOpenDialog({ defaultUri: Uri.file(dirname(this.context.problem.fileUri.fsPath)), canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Select folder for problem files' });
        if (!outputFolderUris || !outputFolderUris.length) { return false; }
        const outputFolderUri = outputFolderUris[0];
        const cwd = outputFolderUri.fsPath;
        const cmd = valStepPath + ' ' + args.join(' ');

        const groupedHappenings = utils.Util.groupBy(this.context.happenings.getHappenings(), h => h.getTime());

        let valStepInput = '';

        const defaultDomain = relative(cwd, this.context.domain.fileUri.fsPath);
        const defaultProblem: string | undefined = undefined;
        const options = "";
        const manifestUri = Uri.file(join(cwd, basename(this.context.problem.fileUri.fsPath) + '_re-planning.ptest.json'));
        const manifest = new TestsManifest(defaultDomain, defaultProblem, options, manifestUri);

        // add the original problem as a test case
        manifest.addCase(new Test(undefined, "Original problem file", undefined, relative(cwd, this.context.problem.fileUri.fsPath), "", undefined, []));

        const problemFileWithoutExt = basename(this.context.problem.fileUri.fsPath, ".pddl");

        for (const time of groupedHappenings.keys()) {
            const happeningGroup = groupedHappenings.get(time);
            if (!happeningGroup) {
                continue;
            }
            const valSteps = this.happeningsConvertor.convert(happeningGroup);
            valStepInput += valSteps;
            const lastHappening = happeningGroup[happeningGroup.length - 1];
            const problemFileName = `${problemFileWithoutExt}_${time}_${this.getHappeningFullName(lastHappening)}.pddl`.split(' ').join('_');
            const testCaseLabel = `${time}: after (${lastHappening.getFullActionName()}) ${this.getHappeningSnapName(lastHappening)}`;
            const testCaseDescription = `Test case for planning from: \nTime point: ${time} and after the application of \nAction: ${lastHappening.getFullActionName()} ${this.getHappeningSnapName(lastHappening)}`;
            manifest.addCase(new Test(testCaseLabel, testCaseDescription, undefined, problemFileName, "", undefined, []));
            valStepInput += `w ${problemFileName}\n`;
        }

        valStepInput += 'q\n';

        try {
            const output = process.execSync(cmd, { cwd: cwd, input: valStepInput });
            console.log(output.toLocaleString()); // for inspection while debugging

            await commands.executeCommand('workbench.view.extension.test');
            await commands.executeCommand('pddl.tests.report.view');
            await commands.executeCommand(PTEST_REVEAL, manifestUri);
            await commands.executeCommand(PTEST_REFRESH);

            return true;
        } catch (err) {
            window.showErrorMessage("Error running valstep: " + err);
            return false;
        } finally {
            if (manifest) { await manifest.store(); }
        }
    }

    getHappeningSnapName(happening: Happening): string {
        let snap = '';

        switch (happening.getType()) {
            case HappeningType.START:
                snap = 'start';
                break;
            case HappeningType.END:
                snap = 'end';
                break;
        }

        return snap;
    }

    getHappeningFullName(happening: Happening): string {
        let output = happening.getFullActionName().split(' ').join('_');
        const snap = this.getHappeningSnapName(happening);

        if (snap.length) { output = `${output}_${snap}`; }

        return output;
    }
}
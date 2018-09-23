/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, commands, window } from 'vscode';
import { PddlConfiguration } from '../configuration';
import { Util } from '../../../common/src/util';
import { dirname, relative, basename, join } from 'path';
import * as process from 'child_process';
import { HappeningsToValStep } from '../diagnostics/HappeningsToValStep';
import { DebuggingSessionFiles } from './DebuggingSessionFiles';
import { TestsManifest } from '../ptest/TestsManifest';
import { Test } from '../ptest/Test';
import { Happening, HappeningType } from '../../../common/src/HappeningsInfo';

/**
 * Executes sequence of plan happenings and generates suite of test cases to attempt planning from any intermediate state.
 */
export class HappeningsToPlanResumeCasesConvertor {

    happeningsConvertor: HappeningsToValStep;
    problemFilePath: string;

    /**
     * Constructs the executor.
     * @param context debugging session context - the happenings, problem and domain files
     * @param pddlConfiguration user/workspace configuration
     */
    constructor(private context: DebuggingSessionFiles, private pddlConfiguration: PddlConfiguration) {
        this.happeningsConvertor = new HappeningsToValStep();
        this.problemFilePath = Uri.parse(context.problem.fileUri).fsPath;
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

        let valStepPath = this.pddlConfiguration.getValStepPath();

        // copy editor content to temp files to avoid using out-of-date content on disk
        let domainFilePath = Util.toPddlFile('domain', this.context.domain.getText());
        let problemFilePath = Util.toPddlFile('problem', this.context.problem.getText());

        let args = [domainFilePath, problemFilePath];
        let outputFolderUris = await window.showOpenDialog({defaultUri: Uri.file(dirname(Uri.parse(this.context.problem.fileUri).fsPath)),  canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Select folder for problem files'});
        if(!outputFolderUris || !outputFolderUris.length) return false;
        let outputFolderUri = outputFolderUris[0];
        let cwd = outputFolderUri.fsPath;
        let cmd = valStepPath + ' ' + args.join(' ');

        let groupedHappenings = Util.groupBy(this.context.happenings.getHappenings(), h => h.getTime());

        let valStepInput = '';

        let defaultDomain = relative(cwd, Uri.parse(this.context.domain.fileUri).fsPath);
        let defaultProblem = null;
        let options = "";
        let manifestUri = Uri.file(join(cwd,  basename(Uri.parse(this.context.problem.fileUri).fsPath)+ '_re-planning.ptest.json'));
        let manifest = new TestsManifest(defaultDomain, defaultProblem, options, manifestUri);

        // add the original problem as a test case
        manifest.addCase(new Test(null, "Original problem file", null, relative(cwd, Uri.parse(this.context.problem.fileUri).fsPath), "", null, []));

        let problemFileWithoutExt = basename(Uri.parse(this.context.problem.fileUri).fsPath, ".pddl");

        for (const time of groupedHappenings.keys()) {
            const happeningGroup = groupedHappenings.get(time);
            let valSteps = this.happeningsConvertor.convert(happeningGroup);
            valStepInput += valSteps;
            let lastHappening = happeningGroup[happeningGroup.length - 1];
            let problemFileName = `${problemFileWithoutExt}_${time}_${this.getHappeningFullName(lastHappening)}.pddl`.split(' ').join('_');
            let testCaseLabel = `${time}: after (${lastHappening.getFullActionName()}) ${this.getHappeningSnapName(lastHappening)}`;
            let testCaseDescription = `Test case for planning from: \nTime point: ${time} and after the application of \nAction: ${lastHappening.getFullActionName()} ${this.getHappeningSnapName(lastHappening)}`;
            manifest.addCase(new Test(testCaseLabel, testCaseDescription, null, problemFileName, "", null, []));
            valStepInput += `w ${problemFileName}\n`;
        }

        valStepInput += 'q\n';

        try {
            let output = process.execSync(cmd, { cwd: cwd, input: valStepInput });
            output; // for inspection while debugging

            await commands.executeCommand('workbench.view.extension.test');
            await commands.executeCommand('pddl.tests.refresh');
            await commands.executeCommand('pddl.tests.reveal', manifestUri);

            return true;
        } catch (err) {
            window.showErrorMessage("Error running valstep: " + err);
            return false;
        } finally {
            if (manifest) manifest.store();
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
        let snap = this.getHappeningSnapName(happening);

        if (snap.length) output = `${output}_${snap}`;

        return output;
    }
};
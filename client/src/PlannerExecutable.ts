/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace
} from 'vscode';

import * as process from 'child_process';
const tree_kill = require('tree-kill');

import { Planner } from './planner';
import { PlanningHandler } from './plan';
import { DomainInfo, ProblemInfo } from '../../common/src/parser';
import { PddlPlanParser } from './PddlPlanParser';

export class PlannerExecutable extends Planner {

    // this property stores the reference to the planner child process, while planning is in progress
    child: process.ChildProcess;

    constructor(plannerPath: string, plannerOptions: string) {
        super(plannerPath, plannerOptions);
    }

    plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: PddlPlanParser, parent: PlanningHandler): void {

        //todo: if auto-save is not on, should copy file content to temp files
        let domainFilePath = PlannerExecutable.toPath(domainFileInfo.fileUri);
        let problemFilePath = PlannerExecutable.toPath(problemFileInfo.fileUri);

        let command = `${PlannerExecutable.q(this.plannerPath)} ${this.plannerOptions} ${PlannerExecutable.q(domainFilePath)} ${PlannerExecutable.q(problemFilePath)}`;
        parent.handleOutput(command + '\n');
        
        let thisPlanner = this;
        super.planningProcessKilled = false;

        this.child = process.exec(command, (error, stdout, stderr) => {
            planParser.onPlanFinished();

            if (error && !thisPlanner.child.killed && !this.planningProcessKilled) {
                parent.handleError(error, stderr);
            }

            let plans = planParser.getPlans();
            parent.handleSuccess(stdout, plans);
            thisPlanner.child = null;
        });

        this.child.stdout.on('data', data => {
            const dataString = data.toString();
            parent.handleOutput(dataString);
            planParser.appendBuffer(dataString);
        });
        this.child.stderr.on('data', data => parent.handleOutput("Error: " + data));

        this.child.on("close", (code, signal) => {
            if (code) console.log("Exit code: " + code);
            if (signal) console.log("Exit Signal: " + signal);
        });
    }

    /**
     * When the UI button is pressed, the planner is forced to stop.
     */
    stop(): void {
        if (this.child) {
            this.planningProcessKilled = true;

            // try to kill just the shell
            // this.child.kill();//'SIGINT');
            // this.child.stdin.pause();
            tree_kill(this.child.pid);
        }
    }

    static toPath(uri: string): string {
        return workspace.textDocuments.find(doc => doc.uri.toString() == uri).fileName;
    }
    static q(path: string): string {
        return path.includes(' ') ? `"${path}"` : path;
    }
}
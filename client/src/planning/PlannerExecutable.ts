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
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { Util } from '../../../common/src/util';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { Plan } from "../../../common/src/Plan";

export class PlannerExecutable extends Planner {

    // this property stores the reference to the planner child process, while planning is in progress
    child: process.ChildProcess;

    constructor(plannerPath: string, plannerOptions: string, public plannerSyntax: string, public workingDirectory: string) {
        super(plannerPath, plannerOptions);
    }

    plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: PddlPlanParser, parent: PlanningHandler): Promise<Plan[]> {

        let domainFilePath = Util.toPddlFile("domain", domainFileInfo.text);
        let problemFilePath = Util.toPddlFile("problem", problemFileInfo.text);

        let command = this.plannerSyntax.replace('$(planner)', this.plannerPath)
            .replace('$(options)', this.plannerOptions)
            .replace('$(domain)', Util.q(domainFilePath))
            .replace('$(problem)', Util.q(problemFilePath));
    
        parent.handleOutput(command + '\n');
        
        let thisPlanner = this;
        super.planningProcessKilled = false;

        return new Promise<Plan[]>(function(resolve, reject) {
            thisPlanner.child = process.exec(command, 
                { cwd: thisPlanner.workingDirectory },
                (error, stdout, stderr) => {
                planParser.onPlanFinished();

                if (error && !thisPlanner.child.killed && !thisPlanner.planningProcessKilled) {
                    parent.handleError(error, stderr);//todo: remove this and use Promise
                    reject(error);
                }
    
                let plans = planParser.getPlans();
                parent.handleSuccess(stdout, plans);//todo: remove this and use Promise
                resolve(plans);
                thisPlanner.child = null;
            });
    
            thisPlanner.child.stdout.on('data', (data: any) => {
                const dataString = data.toString();
                parent.handleOutput(dataString);
                planParser.appendBuffer(dataString);
            });
            thisPlanner.child.stderr.on('data', (data: any) => parent.handleOutput("Error: " + data));
    
            thisPlanner.child.on("close", (code: any, signal: any) => {
                if (code) console.log("Exit code: " + code);
                if (signal) console.log("Exit Signal: " + signal);
            });
        });
    }

    /**
     * When the UI button is pressed, the planner is forced to stop.
     */
    stop(): void {
        if (this.child) {
            super.stop();

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
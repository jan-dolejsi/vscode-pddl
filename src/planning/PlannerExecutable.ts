/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    workspace, window
} from 'vscode';

import * as process from 'child_process';
import treeKill = require('tree-kill');

import {
    ProblemInfo, DomainInfo, utils, parser, planner, Plan
} from 'pddl-workspace';

import { Util } from 'ai-planning-val';

/** Planner implemented as an executable process. */
export class PlannerExecutable extends planner.Planner {

    // this property stores the reference to the planner child process, while planning is in progress
    private child: process.ChildProcess | undefined;

    static readonly DEFAULT_SYNTAX = "$(planner) $(options) $(domain) $(problem)";
    private readonly plannerSyntax: string;

    constructor(plannerPath: string, private plannerOptions: string, plannerSyntax: string | undefined, private workingDirectory: string) {
        super(plannerPath);
        this.plannerSyntax = plannerSyntax ?? PlannerExecutable.DEFAULT_SYNTAX;
    }

    async plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlannerOutputParser, callbacks: planner.PlannerResponseHandler): Promise<Plan[]> {

        const domainFilePath = await Util.toPddlFile("domain", domainFileInfo.getText());
        const problemFilePath = await Util.toPddlFile("problem", problemFileInfo.getText());

        let command = this.plannerSyntax
            .replace('$(planner)', utils.Util.q(this.plannerPath))
            .replace('$(options)', this.plannerOptions)
            .replace('$(domain)', utils.Util.q(domainFilePath))
            .replace('$(problem)', utils.Util.q(problemFilePath));

        command += ' ' + callbacks.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo }).join(' ');

        callbacks.handleOutput(command + '\n');

        const thisPlanner = this;
        super.planningProcessKilled = false;

        if (workspace.getConfiguration("pddlPlanner").get("executionTarget") === "Terminal") {
            return new Promise<Plan[]>((resolve) => {
                const terminal = window.createTerminal({ name: "Planner output", cwd: thisPlanner.workingDirectory });
                terminal.sendText(command, true);
                terminal.show(true);
                const plans: Plan[] = [];
                resolve(plans);
            });
        }

        return new Promise<Plan[]>(function (resolve, reject) {
            thisPlanner.child = process.exec(command,
                { cwd: thisPlanner.workingDirectory },
                (error) => {
                    planParser.onPlanFinished();

                    if (error && !thisPlanner.child?.killed && !thisPlanner.planningProcessKilled) {
                        reject(error);
                    }

                    const plans = planParser.getPlans();
                    resolve(plans); // todo: should we resolve() even if we reject()ed above?
                    thisPlanner.child = undefined;
                });

            thisPlanner.child.stdout?.on('data', (data: any) => {
                const dataString = data.toString();
                callbacks.handleOutput(dataString);
                planParser.appendBuffer(dataString);
            });
            thisPlanner.child.stderr?.on('data', (data: any) => callbacks.handleOutput("Error: " + data));

            thisPlanner.child.on("close", (code: any, signal: any) => {
                if (code) { console.log("Exit code: " + code); }
                if (signal) { console.log("Exit Signal: " + signal); }
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
            treeKill(this.child.pid);
        }
    }
}
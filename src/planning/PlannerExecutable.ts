/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    workspace, window, EventEmitter, Event, Disposable
} from 'vscode';

import * as process from 'child_process';
import treeKill = require('tree-kill');

import {
    ProblemInfo, DomainInfo, utils, parser, planner, Plan
} from 'pddl-workspace';

import { Util } from 'ai-planning-val';
import { SearchDebugger } from '../searchDebugger/SearchDebugger';
import { cratePlannerConfigurationMessageItems, ProcessErrorMessageItem } from './planningUtils';

/** Planner implemented as an executable process, which outputs through VS Code facilities. */
export class PlannerExecutable extends planner.Planner implements Disposable {

    // this property stores the reference to the planner child process, while planning is in progress
    private child: process.ChildProcess | undefined;
    private _exited = new EventEmitter<number>();

    static readonly DEFAULT_SYNTAX = "$(planner) $(options) $(domain) $(problem)";
    private readonly plannerSyntax: string;
    private readonly plannerOptions: string;

    constructor(plannerPath: string, private configuration: planner.PlannerExecutableRunConfiguration, providerConfiguration: planner.ProviderConfiguration) {
        super(plannerPath, configuration, providerConfiguration);
        this.plannerSyntax = configuration.plannerSyntax ?? providerConfiguration.configuration.syntax ?? PlannerExecutable.DEFAULT_SYNTAX;
        this.plannerOptions = configuration.options ?? '';
    }

    get onExited(): Event<number> {
        return this._exited.event;
    }

    dispose(): void {
        this._exited.dispose();
    }

    get requiresKeyboardInput(): boolean {
        return false;
    }
    get supportsSearchDebugger(): boolean {
        return true;
    }

    async plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlannerOutputParser, callbacks: planner.PlannerResponseHandler): Promise<Plan[]> {

        const domainFilePath = await Util.toPddlFile(domainFileInfo.getText(), { prefix: "domain" });
        const problemFilePath = await Util.toPddlFile(problemFileInfo.getText(), { prefix: "problem" });

        let command = this.plannerSyntax
            .replace('$(planner)', utils.Util.q(this.plannerPath))
            .replace('$(options)', this.plannerOptions)
            .replace('$(domain)', utils.Util.q(domainFilePath))
            .replace('$(problem)', utils.Util.q(problemFilePath));

        if (this.plannerConfiguration.searchDebuggerEnabled) {
            if (!this.providerConfiguration.configuration.searchDebuggerSupport) {
                const options = cratePlannerConfigurationMessageItems(this);
                options.push({ title: "Dismiss", isCloseAffordance: true });

                const message = `Selected planner does not support the Search Debugger.`;

                window.showErrorMessage<ProcessErrorMessageItem>(message, ...options).then(selection => {
                    if (selection?.action) {
                        selection.action(this);
                    }
                });
            } else if (this.providerConfiguration.configuration.searchDebuggerSupport !== planner.SearchDebuggerSupportType.HttpCallback) {
                window.showWarningMessage(`Local executable planners may only support the Search Debugger via the HTTP callback.`);
            } else {

                const commandLine =
                    this.providerConfiguration.configuration.searchDebuggerCommandLineSyntax ??
                    workspace.getConfiguration(SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER).get<string>(SearchDebugger.CONFIG_PLANNER_OPTION);
                if (!commandLine) { throw new Error(`Missing planner command-line option configuration: ${SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER}.${SearchDebugger.CONFIG_PLANNER_OPTION}`); }
                command += ' ' + commandLine.replace('$(port)', this.configuration.searchDebuggerPort?.toString() || "undefined");
            }
        }
        command += ' ' + callbacks.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo }).join(' ');

        callbacks.handleOutput(command + '\n');

        const thisPlanner = this;

        if (workspace.getConfiguration("pddlPlanner").get("executionTarget") === "Terminal") {
            return new Promise<Plan[]>((resolve) => {
                const terminal = window.createTerminal({ name: "Planner output", cwd: thisPlanner.configuration.workingDirectory });
                terminal.sendText(command, true);
                terminal.show(true);
                const plans: Plan[] = [];
                resolve(plans);
            });
        }

        return new Promise<Plan[]>(function (resolve, reject) {
            thisPlanner.child = process.exec(command,
                { cwd: thisPlanner.configuration.workingDirectory },
                (error) => {
                    planParser.onPlanFinished();

                    if (error && !thisPlanner.child?.killed && !thisPlanner.planningProcessKilled) {
                        reject(error); // todo: should calle `return` here?
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
                thisPlanner._exited.fire(code);
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

/** Creates instances of the PlannerExecutable, so other extensions could wrap them. */
export class PlannerExecutableFactory {

    /**
     * Creates new instance of `PlannerExecutable`.
     * @param plannerPath planner path
     * @param plannerRunConfiguration run configuration
     * @param providerConfiguration provider configuration
     * @returns planner executable that VS Code will call the `plan()` method on.
     */
    createPlannerExecutable(plannerPath: string, plannerRunConfiguration: planner.PlannerExecutableRunConfiguration,
        providerConfiguration: planner.ProviderConfiguration): PlannerExecutable {
        return new PlannerExecutable(plannerPath, plannerRunConfiguration, providerConfiguration);
    }
}
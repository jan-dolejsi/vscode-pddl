/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/* Warning: This file is shared by source-code between the PDDL extension and at least one other extension. */

'use strict';

import * as path from 'path';
import * as os from 'os';
import { ShellExecutionOptions } from "vscode";
import { Disposable, ShellExecution, Task, TaskDefinition, TaskEndEvent, TaskExecution, TaskRevealKind, tasks, TaskScope, Uri, window } from 'vscode';
import { instanceOfHttpConnectionRefusedError } from 'pddl-planning-service-client';
import { planner, utils } from 'pddl-workspace';
import { exists } from '../util/workspaceFs';


/** Tracks a long-running planning service execution. */
export class PlanningServiceExecution {

    constructor(public readonly servicePath: string, public readonly wasAlreadyRunning: boolean,
        public readonly execution?: TaskExecution) {
    }

    static alreadyRunning(servicePath: string): PlanningServiceExecution {
        return new PlanningServiceExecution(servicePath, true);
    }

    static justStarted(servicePath: string, execution: TaskExecution): PlanningServiceExecution {
        return new PlanningServiceExecution(servicePath, false, execution);
    }
}


export abstract class LongRunningPlannerProvider implements planner.PlannerProvider {

    abstract kind: planner.PlannerKind;
    abstract getNewPlannerLabel(): string;
    abstract configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined>;

    private planningServiceExecutions = new Map<string, PlanningServiceExecution>();

    constructor(disposables: Disposable[]) {
        tasks.onDidEndTask(this.handleTaskEnded, this, disposables);
    }

    private handleTaskEnded(event: TaskEndEvent): void {
        const taskExecution = [...this.planningServiceExecutions.values()].find(e => e.execution === event.execution);
        if (taskExecution) {
            // yes, a relevant task ended. Clean-up.
            this.planningServiceExecutions.delete(taskExecution.servicePath);
        }
    }

    /**
     * Checks if the service was started.
     * @param configuration planner configuration to start
     * @returns true if the service was started by this provider
     */
    public isServiceWasStarted(configuration: planner.PlannerConfiguration): boolean {
        return configuration.path !== undefined && this.planningServiceExecutions.has(configuration.path);
    }

    abstract isServiceAccessible(configuration: planner.PlannerConfiguration): Promise<boolean>;
    
    /**
     * Tests whether host name is local (this machine)
     * @param hostname host name from the configured url of the planning service
     * @returns true if the service is running locally
     */
    static isLocal(hostname: string): boolean {
        return ['localhost', '127.0.0.1'].includes(hostname);
    }

    /**
     * Callback invoked when the planner fails. Get troubleshooting options.
     * @param failedPlanner planner that failed
     * @param reason reason to fail (most likely an `Error`)
     * @returns list of troubleshooting options
     */
    async troubleshoot(failedPlanner: planner.Planner, reason: unknown): Promise<planner.TroubleShootingInfo> {
        let troubleShootingInfo = '';
        const troubleShootings = new Map<string, (p: planner.Planner) => Promise<void>>();

        if (instanceOfHttpConnectionRefusedError(reason)) {
            const configuration = failedPlanner.providerConfiguration.configuration;
            troubleShootingInfo += `Service ${configuration.url} cannot be reached.\n`;

            const isLocal = LongRunningPlannerProvider.isLocal(reason.address);
            const serviceExePath = configuration.path;
            if (isLocal && serviceExePath !== undefined) {
                const fileName = path.basename(serviceExePath);
                if (await exists(Uri.file(serviceExePath))) {
                    if (this.isServiceWasStarted(configuration)) {
                        troubleShootingInfo += `Service appears to be running, but not responding. Click 'Re-start the service'.\n`;
                        troubleShootings.set(`Re-start the service`, async () => this.startService(configuration));
                    } else {
                        troubleShootingInfo += `Service does not appear to be running. Click 'Start the service' to execute '${fileName}'.\n`;
                        troubleShootings.set(`Start the service`, async () => this.startService(configuration));
                    }
                } else {
                    troubleShootingInfo += `Service does not appear to be running. The configured server '${fileName}' is not a valid file.\n`;
                }
            }
        }
        
        return {
            info: troubleShootingInfo,
            options: troubleShootings
        };
    }
    
    /**
     * Suggest to the user to start the planning service.
     * @param configuration planning configuration for a service to start
     */
    async suggestStartService(configuration: planner.PlannerConfiguration): Promise<void> {
        const serviceExePath = configuration.path;
        if (!serviceExePath) {
            throw new Error(`Expected planner configuration with a 'path' specified`);
        }
        const fileName = path.basename(serviceExePath);
        const startService = 'Start the service';
        const answer = await window.showWarningMessage(`Service at '${configuration.url}' does not appear to be running. Click '${startService}' to execute '${fileName}'.\n`, startService);
        if (answer === startService) {
            this.startService(configuration);
        }
    }

    /**
     * Start the planning service.
     * @param configuration planning configuration for a service to start
     */
    public startService(configuration: planner.PlannerConfiguration): void {
        const executablePath = configuration.path;
        if (!executablePath) {
            throw new Error(`Expected configuration with attribute: 'path'`);
        }

        const taskExecution = new ShellExecution(utils.Util.q(executablePath),
            ShellExecutionOptionsFactory.createExecution(configuration.cwd ??
                path.isAbsolute(executablePath) ? path.dirname(executablePath) : undefined
            ));
        const task = new Task(this.taskDefinition, TaskScope.Global, configuration.title, this.taskSource, taskExecution);
        task.presentationOptions = { reveal: TaskRevealKind.Always, echo: true };
        task.isBackground = true;
        tasks.executeTask(task).then(taskExecution => {
            this.planningServiceExecutions.set(executablePath, PlanningServiceExecution.justStarted(executablePath, taskExecution));
        });
    }

    get taskDefinition(): TaskDefinition {
        return {
            type: 'PlanningService:' + this.kind.kind
        };
    }

    get taskSource(): string {
        return 'PDDL';
    }
}

export class ShellExecutionOptionsFactory {
    static createExecution(cwd: string | undefined): ShellExecutionOptions {
        return {
            executable: os.platform() === 'win32' ? 'cmd' : undefined,
            shellArgs: os.platform() === 'win32' ? ['/d', '/c'] : undefined,
            cwd: cwd
        };
    }
}
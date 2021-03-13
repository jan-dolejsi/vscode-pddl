/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/* Warning: This file is shared by source-code between the PDDL extension and at least one other extension. */

'use strict';

import * as path from 'path';
import { instanceOfHttpConnectionRefusedError } from 'pddl-planning-service-client';
import { planner, utils } from 'pddl-workspace';
import { Disposable, ShellExecution, Task, TaskDefinition, TaskEndEvent, TaskExecution, TaskRevealKind, tasks, TaskScope, Uri } from 'vscode';
import { fileOrFolderExists } from '../utils';


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

    protected isServiceRunning(configuration: planner.PlannerConfiguration): boolean {
        return configuration.path !== undefined && this.planningServiceExecutions.has(configuration.path);
    }

    
    /** Get troubleshooting options */
    async troubleshoot?(failedPlanner: planner.Planner, reason: unknown): Promise<planner.TroubleShootingInfo> {
        let troubleShootingInfo = '';
        const troubleShootings = new Map<string, (p: planner.Planner) => Promise<void>>();

        if (instanceOfHttpConnectionRefusedError(reason)) {
            const configuration = failedPlanner.providerConfiguration.configuration;
            troubleShootingInfo += `Service ${configuration.url} cannot be reached.\n`;

            const isLocal = ['localhost', '127.0.0.1'].includes(reason.address);
            const serviceExePath = configuration.path;
            if (isLocal && serviceExePath) {
                const fileName = path.basename(serviceExePath);
                if (await fileOrFolderExists(Uri.file(serviceExePath))) {
                    if (this.isServiceRunning(configuration)) {
                        troubleShootingInfo += `Service appears to be running, but not responding. Click 'Re-start the service'.\n`;
                        troubleShootings.set(`Re-start the service`, async () => this.startService(serviceExePath, configuration));
                    } else {
                        troubleShootingInfo += `Service does not appear to be running. Click 'Start the service' to execute '${fileName}'.\n`;
                        troubleShootings.set(`Start the service`, async () => this.startService(serviceExePath, configuration));
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
    
    protected startService(executablePath: string, configuration: planner.PlannerConfiguration): void {
        const taskExecution = new ShellExecution(utils.Util.q(executablePath), {
            cwd: configuration.cwd ??
                path.isAbsolute(executablePath) ? path.dirname(executablePath) : undefined
        });
        const task = new Task(this.taskDefinition, TaskScope.Global, configuration.title, this.taskSource, taskExecution);
        task.presentationOptions = { reveal: TaskRevealKind.Always, echo: true };
        task.isBackground = true;
        tasks.executeTask(task).then(taskExecution => {
            this.planningServiceExecutions.set(executablePath, PlanningServiceExecution.justStarted(executablePath, taskExecution));
        });
    }

    get taskDefinition(): TaskDefinition {
        return {
            type: 'PlanningService'
        };
    }

    get taskSource(): string {
        return 'PDDL';
    }
}
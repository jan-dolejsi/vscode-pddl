/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import FormData = require('form-data');

import { PlannerService, ServerResponse } from 'pddl-planning-service-client';
import { DomainInfo, ProblemInfo, Plan, parser, planner, PlanStep } from 'pddl-workspace';
import { Uri, workspace } from 'vscode';
import { exists } from '../util/workspaceFs';
import { gzip, postMultipart } from '../httpUtils';

export class SchedulingService extends PlannerService<FormData, SchedulerResponse> {

    constructor(plannerUrl: string, plannerConfiguration: planner.PlannerRunConfiguration, providerConfiguration: planner.ProviderConfiguration) {
        super(plannerUrl, plannerConfiguration, providerConfiguration);
    }

    createUrl(): string {
        return this.plannerPath;
    }

    getTimeout(): number {
        return 60;
    }

    async createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<FormData | null> {
        const form = new FormData();
        form.append('domain', domainFileInfo.getText(), { filename: domainFileInfo.fileUri.fsPath, header: { 'format': 'PDDL' }, contentType: 'text/plain' });
        form.append('problem', problemFileInfo.getText(), { filename: problemFileInfo.fileUri.fsPath, header: { 'format': 'PDDL' }, contentType: 'text/plain' });

        const scheduleUri = Uri.file(problemFileInfo.fileUri.fsPath.replace(/.pddl$/, '.schedule.json'));

        if (await exists(scheduleUri)) {
            const scheduleBuffer = await workspace.fs.readFile(scheduleUri);
            const zippedBuffer = await gzip(scheduleBuffer.toString());
            form.append('schedule', zippedBuffer, {
                filename: scheduleUri.fsPath, header: {
                    'Content-Encoding': 'gzip',
                },
                contentType: 'application/json',
            });
        }

        form.append('configuration', JSON.stringify({ 'autoStartSolver': true, 'timeout': 60 }), {
            contentType: 'application/json',
        });

        return form;
    }

    async plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlannerOutputParser, parent: planner.PlannerResponseHandler): Promise<Plan[]> {
        console.log(planParser);
        parent.handleOutput(`Planning service: ${this.plannerPath}\nDomain: ${domainFileInfo.name}, Problem: ${problemFileInfo.name}\n`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let requestHeader: NodeJS.Dict<string> = {};
        if (this.plannerConfiguration.authentication?.getToken() !== undefined) {
            requestHeader = {
                "Authorization": "Bearer " + this.plannerConfiguration.authentication.getToken()
            };
        }

        // currently, this is used to notify any observers that planning is starting
        parent.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo });

        const requestBody = await this.createRequestBody(domainFileInfo, problemFileInfo);
        if (!requestBody) { return []; }
        const url: string = this.createUrl();

        // const timeoutInSec = this.getTimeout();

        requestHeader['command'] = "generate,solve";

        const auth = ':' + process.env.AI_SCHEDULER_API_KEY;

        const schedule = await postMultipart<SchedulerResponse>(new URL(url), requestBody, auth, requestHeader
            // {
            // isAuthenticated: this.plannerConfiguration.authentication !== undefined,
            // serviceFriendlyName: 'PDDL Scheduling Service',
            // headers: requestHeader,
            // json: true,
            // timeout: timeoutInSec * 1000 * 1.1,
            // }
        );

        const plans = await this.processServerResponseBody(url, schedule, planParser, parent);

        this.injectObjects(schedule, problemFileInfo);

        return plans;
    }

    private injectObjects(schedule: SchedulerResponse, problemFileInfo: ProblemInfo) {
        const objects = problemFileInfo.getObjectsTypeMap();

        for (const locationName in schedule.locations) {
            const type = schedule.locations[locationName].type;
            objects.add(type, locationName);
        }

        for (const resourceType in schedule.resources) {
            for (const resourceName in schedule.resources[resourceType].resources) {
                objects.add(resourceType, resourceName);
            }
        }
    }

    processServerResponseBody(_origUrl: string, schedule: SchedulerResponse, planParser: parser.PddlPlannerOutputParser,
        callbacks: planner.PlannerResponseHandler): Promise<Plan[]> {

        callbacks.handleOutput(`Schedule received with ${schedule.tasks.length} jobs. `);

        const importer = new ScheduleImporter(schedule);
        for (const task of schedule.tasks) {
            const startTime = importer.parseAndConvertToRelative(task.start);
            const duration = importer.parseDurationToRelative(task.duration);
            // todo: following generally does not correspond to the action parameter order
            const fullActionName = [task.name, task.location].concat(task.resources.map(r => r.assignedResource)).join(' ');
            const planStep = new PlanStep(startTime, fullActionName, true, duration, undefined);
            planParser.appendStep(planStep);
            callbacks.handleOutput(planStep.toPddl() + '\n');
        }

        planParser.onPlanFinished();
        callbacks.handlePlan(planParser.getPlans()[0]);
        return Promise.resolve(planParser.getPlans());
    }

}

class ScheduleImporter {
    private referenceTime: Date;
    private stepsPerDay: number;

    constructor(schedule: SchedulerResponse) {
        this.referenceTime = this.parseDate(schedule.configuration.timeScale.referenceTime ?? Date.now());
        this.stepsPerDay = schedule.configuration.timeScale.stepsPerDay ?? 1;
    }

    parseDate(timeAsString: string): Date {
        return new Date(Date.parse(timeAsString));
    }

    private parseDurationToSeconds(duration: string): number {
        const match = /(\d+)s/i.exec(duration);
        if (match) {
            return Number.parseInt(match[1]);
        } else {
            throw new Error('Invalid duration: ' + duration);
        }
    }

    parseAndConvertToRelative(timeAsString: string): number {
        const differenceInMillis = this.parseDate(timeAsString).getTime() - this.referenceTime.getTime();

        return this.convertToRelative(differenceInMillis / 1000);
    }

    parseDurationToRelative(duration: string): number {
        return this.convertToRelative(this.parseDurationToSeconds(duration));
    }

    private convertToRelative(seconds: number): number {
        const days = seconds / 3600 / 24;
        return days * this.stepsPerDay;
    }
}

/** Sync service response body. */
interface SchedulerResponse extends ServerResponse {
    configuration: {
        timeScale: {
            referenceTime: string,
            stepsPerDay: number
        }
    },
    locations: { [name: string]: { type: string; } };
    resources: { [kind: string]: { resources: { [name: string]: never; } } };
    tasks: ScheduleTask[];
}

interface ScheduleTask {
    id: string;
    location: string;
    name: string;
    duration: string;
    resources: ScheduleTaskResource[];
    start: string;
}

interface ScheduleTaskResource {
    assignedResource: string;
}
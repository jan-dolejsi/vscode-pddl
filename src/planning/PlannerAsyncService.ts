/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, workspace } from 'vscode';
import { Plan, ProblemInfo, DomainInfo, parser, planner } from 'pddl-workspace';
import { Authentication } from '../util/Authentication';
import { PlannerService } from './PlannerService';
import { PlannerConfigurationSelector } from './PlannerConfigurationSelector';

/** Wraps the `/request` planning web service interface. */
export class PlannerAsyncService extends PlannerService {

    timeout = 60; //this default is overridden by info from the configuration!
    asyncMode = false;
    planTimeScale = 1;

    constructor(plannerPath: string, private plannerConfiguration: Uri, authentication?: Authentication) {
        super(plannerPath, authentication);
    }

    getTimeout(): number {
        return this.timeout;
    }

    createUrl(): string {
        return this.plannerPath + '?async=' + this.asyncMode;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<any> {
        const configuration = await this.getConfiguration();
        if (!configuration) { return null; }

        configuration.planFormat = configuration.planFormat ?? 'JSON';
        if ("timeout" in configuration) {
            this.timeout = configuration.timeout;
        }

        this.planTimeScale = PlannerAsyncService.getPlanTimeScale(configuration);

        return {
            'domain': {
                'name': domainFileInfo.name,
                'format': 'PDDL',
                'content': domainFileInfo.getText()
            },
            'problem': {
                'name': problemFileInfo.name,
                'format': 'PDDL',
                'content': problemFileInfo.getText()
            },
            'configuration': configuration
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static getPlanTimeScale(configuration: any): number {
        const planTimeUnit = configuration['planTimeUnit'];
        switch (planTimeUnit) {
            case "MINUTE":
                return 60;
            case "MILLISECOND":
                return 1 / 1000;
            case "HOUR":
                return 60 * 60;
            case "DAY":
                return 24 * 60 * 60;
            case "WEEK":
                return 7 * 24 * 60 * 60;
            case "SECOND":
            default:
                return 1;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async processServerResponseBody(responseBody: any, planParser: parser.PddlPlannerOutputParser, callbacks: planner.PlannerResponseHandler, resolve: (plans: Plan[]) => void, reject: (error: Error) => void): Promise<void> {
        let _timedOut = false;
        const responseStatus: string = responseBody['status']['status'];
        if (["STOPPED", "SEARCHING_BETTER_PLAN"].includes(responseStatus)) {
            _timedOut = responseBody['status']['reason'] === "TIMEOUT";
            if (responseBody['plans'].length > 0) {
                const plansJson = responseBody['plans'];
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const parserPromises = plansJson.map((plan: any) => this.parsePlan(plan, planParser));
                    await Promise.all(parserPromises);
                }
                catch (err) {
                    reject(err);
                }

                const plans = planParser.getPlans();
                if (plans.length > 0) {
                    callbacks.handleOutput(plans[0].getText() + '\n');
                }
                else {
                    callbacks.handleOutput('No plan found.');
                }

                resolve(plans);
                return;
            }
            else {
                // todo: no plan found yet. Poll again later.
                resolve([]);
                return;
            }
        }
        else if (responseStatus === "FAILED") {
            const error = responseBody['status']['error']['message'];
            reject(new Error(error));
            return;
        }
        else if (["NOT_INITIALIZED", "INITIATING", "SEARCHING_INITIAL_PLAN"].includes(responseStatus)) {
            _timedOut = true;
            const error = `After timeout ${this.timeout} the status is ${responseStatus}`;
            reject(new Error(error));
            return;
        }

        console.log(_timedOut);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async parsePlan(plan: any, planParser: parser.PddlPlannerOutputParser): Promise<void> {
        const makespan: number = plan['makespan'];
        const metric: number = plan['metricValue'];
        const searchPerformanceInfo = plan['searchPerformanceInfo'];
        const statesEvaluated: number = searchPerformanceInfo['statesEvaluated'];
        const elapsedTimeInSeconds = parseFloat(searchPerformanceInfo['timeElapsed']) / 1000;

        planParser.setPlanMetaData(makespan, metric, statesEvaluated, elapsedTimeInSeconds, this.planTimeScale);

        const planFormat: string | undefined = plan['format'];
        if (planFormat?.toLowerCase() === 'json') {
            const planSteps = JSON.parse(plan['content']);
            this.parsePlanSteps(planSteps, planParser);
            planParser.onPlanFinished();
        }
        else if (planFormat?.toLowerCase() === 'tasks') {
            const planText = plan['content'];
            planParser.appendLine(planText);
            planParser.onPlanFinished();
        }
        else if (planFormat?.toLowerCase() === 'xplan') {
            const planText = plan['content'];
            await planParser.appendXplan(planText); // must await the underlying async xml parsing
        }
        else {
            throw new Error('Unsupported plan format: ' + planFormat);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getConfiguration(): Promise<any> {
        if (this.plannerConfiguration.toString() === PlannerConfigurationSelector.DEFAULT.toString()) {
            return this.createDefaultConfiguration();
        }
        else {
            const configurationAbsPath = this.plannerConfiguration.fsPath;

            const configurationDoc = await workspace.openTextDocument(configurationAbsPath);
            const configurationString = configurationDoc.getText();
            return JSON.parse(configurationString);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createDefaultConfiguration(): any {
        return {
            "planFormat": "JSON",
            "timeout": this.timeout
        };
    }
}

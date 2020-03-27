/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// import * as request from 'request';
import { Uri, workspace } from 'vscode';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan, ProblemInfo, DomainInfo, parser } from 'pddl-workspace';
import { Authentication } from '../../../common/src/Authentication';
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

    async createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<any> {
        let configuration = await this.getConfiguration();
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

    static getPlanTimeScale(configuration: any): number {
        const planTimeUnit = configuration['planTimeUnit'];
        switch (planTimeUnit) {
            case "MINUTE":
                return 60;
            case "MILLISECOND":
                return 1 / 1000;
            case "HOUR":
                return 60 * 60;
            case "SECOND":
            default:
                return 1;
        }
    }

    processServerResponseBody(responseBody: any, planParser: parser.PddlPlannerOutputParser, parent: PlannerResponseHandler, resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void {
        let _timedOut = false;
        let response_status: string = responseBody['status']['status'];
        if (["STOPPED", "SEARCHING_BETTER_PLAN"].includes(response_status)) {
            _timedOut = responseBody['status']['reason'] === "TIMEOUT";
            if (responseBody['plans'].length > 0) {
                let plansJson = responseBody['plans'];
                try {
                    plansJson.forEach((plan: any) => this.parsePlan(plan, planParser));
                }
                catch (err) {
                    reject(err);
                }

                let plans = planParser.getPlans();
                if (plans.length > 0) { parent.handleOutput(plans[0].getText() + '\n'); }
                else { parent.handleOutput('No plan found.'); }

                resolve(plans);
                return;
            }
            else {
                // todo: no plan found yet. Poll again later.
                resolve([]);
                return;
            }
        }
        else if (response_status === "FAILED") {
            let error = responseBody['status']['error']['message'];
            reject(new Error(error));
            return;
        }
        else if (["NOT_INITIALIZED", "INITIATING", "SEARCHING_INITIAL_PLAN"].includes(response_status)) {
            _timedOut = true;
            let error = `After timeout ${this.timeout} the status is ${response_status}`;
            reject(new Error(error));
            return;
        }

        console.log(_timedOut);
    }

    parsePlan(plan: any, planParser: parser.PddlPlannerOutputParser): void {
        let makespan: number = plan['makespan'];
        let metric: number = plan['metricValue'];
        let search_performance_info = plan['searchPerformanceInfo'];
        let statesEvaluated: number = search_performance_info['statesEvaluated'];
        let elapsedTimeInSeconds = parseFloat(search_performance_info['timeElapsed']) / 1000;

        planParser.setPlanMetaData(makespan, metric, statesEvaluated, elapsedTimeInSeconds, this.planTimeScale);

        const planFormat: string | undefined = plan['format'];
        if (planFormat && planFormat.toLowerCase() === 'json') {
            let planSteps = JSON.parse(plan['content']);
            this.parsePlanSteps(planSteps, planParser);
            planParser.onPlanFinished();
        }
        else if (planFormat && planFormat.toLowerCase() === 'tasks') {
            let planText = plan['content'];
            planParser.appendLine(planText);
            planParser.onPlanFinished();
        }
        else if (planFormat && planFormat.toLowerCase() === 'xplan') {
            let planText = plan['content'];
            planParser.appendLine(planText); // the underlying 
        }
        else {
            throw new Error('Unsupported plan format: ' + planFormat);
        }
    }

    async getConfiguration(): Promise<any> {
        if (this.plannerConfiguration.toString() === PlannerConfigurationSelector.DEFAULT.toString()) {
            return this.createDefaultConfiguration();
        }
        else {
            let configurationAbsPath = this.plannerConfiguration.fsPath;

            let configurationDoc = await workspace.openTextDocument(configurationAbsPath);
            let configurationString = configurationDoc.getText();
            return JSON.parse(configurationString);
        }
    }

    createDefaultConfiguration(): any {
        return {
            "planFormat": "JSON",
            "timeout": this.timeout
        };
    }
}

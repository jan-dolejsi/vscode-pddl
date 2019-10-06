/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// import * as request from 'request';
import { Uri, workspace } from 'vscode';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan } from '../../../common/src/Plan';
import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { Authentication } from '../../../common/src/Authentication';
import { PlannerService } from './PlannerService';
import { PlannerConfigurationSelector } from './PlannerConfigurationSelector';

/** Wraps the `/request` planning web service interface. */
export class PlannerAsyncService extends PlannerService {

    timeout = 60; //this default is overridden by info from the configuration!
    asyncMode = false;

    constructor(plannerPath: string, private plannerConfiguration: Uri, useAuthentication: boolean, authentication: Authentication) {
        super(plannerPath, useAuthentication, authentication);
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

        configuration.planFormat = 'JSON';
        if ("timeout" in configuration) {
            this.timeout = configuration.timeout;
        }

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

    processServerResponseBody(responseBody: any, planParser: PddlPlanParser, parent: PlannerResponseHandler, resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void {
        let _timedout = false;
        let response_status: string = responseBody['status']['status'];
        if (["STOPPED", "SEARCHING_BETTER_PLAN"].includes(response_status)) {
            _timedout = responseBody['status']['reason'] === "TIMEOUT";
            if (responseBody['plans'].length > 0) {
                let plansJson = responseBody['plans'];
                plansJson.forEach((plan: any) => this.parsePlan(plan, planParser));

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
            _timedout = true;
            let error = `After timeout ${this.timeout} the status is ${response_status}`;
            reject(new Error(error));
            return;
        }

        console.log(_timedout);
    }

    parsePlan(plan: any, planParser: PddlPlanParser): void {
        let _makespan: number = plan['makespan'];
        let _metric: number = plan['metricValue'];
        let search_performance_info = plan['searchPerformanceInfo'];
        let _states_evaluated: number = search_performance_info['statesEvaluated'];
        let _elapsedTimeInSeconds = parseFloat(search_performance_info['timeElapsed']) / 1000;
        let planSteps = JSON.parse(plan['content']);
        this.parsePlanSteps(planSteps, planParser);

        planParser.onPlanFinished();

        console.log("Not implemented further." + _makespan + _metric + _states_evaluated + _elapsedTimeInSeconds + planSteps);
    }

    async getConfiguration(): Promise<any> {
        if (this.plannerConfiguration.toString() === PlannerConfigurationSelector.DEFAULT.toString()) {
            return this.createDefaultConfiguration();
        }
        else {
            let configurationDoc = await workspace.openTextDocument(this.plannerConfiguration);
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

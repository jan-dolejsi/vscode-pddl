/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as request from 'request';
import { Planner } from './planner';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { parser } from 'pddl-workspace';
import { PlanStep } from 'pddl-workspace';
import { Authentication } from '../../../common/src/Authentication';
import { window } from 'vscode';

export abstract class PlannerService extends Planner {

    constructor(plannerPath: string, private authentication?: Authentication) {
        super(plannerPath);
    }

    abstract createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<any>;

    abstract createUrl(): string;

    abstract processServerResponseBody(responseBody: any, planParser: parser.PddlPlanParser, parent: PlannerResponseHandler,
        resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void;

    async plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlanParser, parent: PlannerResponseHandler): Promise<Plan[]> {
        parent.handleOutput(`Planning service: ${this.plannerPath}\nDomain: ${domainFileInfo.name}, Problem: ${problemFileInfo.name}\n`);

        let requestHeader: any = {};
        if (this.authentication && this.authentication.getSToken() !== undefined) {
            requestHeader = {
                "Authorization": "Bearer " + this.authentication.getSToken()!
            };
        }

        if (parent.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo }).length > 0) {
            window.showWarningMessage("Search Debugger is not supported by planning services. Only planner executable may support it.");
        }

        let requestBody = await this.createRequestBody(domainFileInfo, problemFileInfo);
        if (!requestBody) { return []; }
        let url: string = this.createUrl();

        let timeoutInSec = this.getTimeout();

        let that = this;
        return new Promise<Plan[]>(function (resolve, reject) {

            request.post({ url: url, headers: requestHeader, body: requestBody, json: true, timeout: timeoutInSec*1000*1.1 }, (err, httpResponse, responseBody) => {

                if (err !== null) {
                    reject(err);
                    return;
                }

                if (that.authentication) {
                    if (httpResponse) {
                        if (httpResponse.statusCode === 400) {
                            let message = "Authentication failed. Please login or update tokens.";
                            let error = new Error(message);
                            reject(error);
                            return;
                        }
                        else if (httpResponse.statusCode === 401) {
                            let message = "Invalid token. Please update tokens.";
                            let error = new Error(message);
                            reject(error);
                            return;
                        }
                    }
                }

                if (httpResponse && httpResponse.statusCode > 202) {
                    let notificationMessage = `PDDL Planning Service returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                    let error = new Error(notificationMessage);
                    reject(error);
                    return;
                }

                that.processServerResponseBody(responseBody, planParser, parent, resolve, reject);
            });
        });
    }

    /** Gets timeout in seconds. */
    abstract getTimeout(): number;

    parsePlanSteps(planSteps: any, planParser: parser.PddlPlannerOutputParser): void {
        for (var index = 0; index < planSteps.length; index++) {
            var planStep = planSteps[index];
            let fullActionName = (<string>planStep["name"]).replace('(', '').replace(')', '');
            let time = planStep["time"] ?? (index + 1) * planParser.options.epsilon;
            let duration = planStep["duration"];
            let isDurative = duration !== undefined && duration !== null;
            duration = duration ?? planParser.options.epsilon;
            let planStepObj = new PlanStep(time, fullActionName, isDurative, duration, index);
            planParser.appendStep(planStepObj);
        }
        planParser.onPlanFinished();
    }
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as request from 'request';
import { planner, Plan, ProblemInfo, DomainInfo, parser, PlanStep } from 'pddl-workspace';
import { Authentication } from '../util/Authentication';
import { window } from 'vscode';

export abstract class PlannerService extends planner.Planner {

    constructor(plannerPath: string, private authentication?: Authentication) {
        super(plannerPath);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<any>;

    abstract createUrl(): string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract processServerResponseBody(responseBody: any, planParser: parser.PddlPlannerOutputParser, parent: planner.PlannerResponseHandler,
        resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void;

    async plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: parser.PddlPlannerOutputParser, parent: planner.PlannerResponseHandler): Promise<Plan[]> {
        parent.handleOutput(`Planning service: ${this.plannerPath}\nDomain: ${domainFileInfo.name}, Problem: ${problemFileInfo.name}\n`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let requestHeader: any = {};
        if (this.authentication && this.authentication.getSToken() !== undefined) {
            requestHeader = {
                "Authorization": "Bearer " + this.authentication.getSToken()
            };
        }

        if (parent.providePlannerOptions({ domain: domainFileInfo, problem: problemFileInfo }).some(op => op.length)) {
            window.showWarningMessage("Search Debugger is not supported by planning services. Only planner executable may support it.");
        }

        const requestBody = await this.createRequestBody(domainFileInfo, problemFileInfo);
        if (!requestBody) { return []; }
        const url: string = this.createUrl();

        const timeoutInSec = this.getTimeout();

        const that = this;
        return new Promise<Plan[]>(function (resolve, reject) {

            request.post({ url: url, headers: requestHeader, body: requestBody, json: true, timeout: timeoutInSec * 1000 * 1.1 }, (err, httpResponse, responseBody) => {

                if (err !== null) {
                    reject(err);
                    return;
                }

                if (that.authentication) {
                    if (httpResponse) {
                        if (httpResponse.statusCode === 400) {
                            const message = "Authentication failed. Please login or update tokens.";
                            const error = new Error(message);
                            reject(error);
                            return;
                        }
                        else if (httpResponse.statusCode === 401) {
                            const message = "Invalid token. Please update tokens.";
                            const error = new Error(message);
                            reject(error);
                            return;
                        }
                    }
                }

                if (httpResponse && httpResponse.statusCode > 202) {
                    const notificationMessage = `PDDL Planning Service returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                    const error = new Error(notificationMessage);
                    reject(error);
                    return;
                }

                that.processServerResponseBody(responseBody, planParser, parent, resolve, reject);
            });
        });
    }

    /** Gets timeout in seconds. */
    abstract getTimeout(): number;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsePlanSteps(planSteps: any, planParser: parser.PddlPlannerOutputParser): void {
        for (let index = 0; index < planSteps.length; index++) {
            const planStep = planSteps[index];
            const fullActionName = (planStep["name"] as string).replace('(', '').replace(')', '');
            const time = planStep["time"] ?? (index + 1) * planParser.options.epsilon;
            let duration = planStep["duration"];
            const isDurative = duration !== undefined && duration !== null;
            duration = duration ?? planParser.options.epsilon;
            const planStepObj = new PlanStep(time, fullActionName, isDurative, duration, index);
            planParser.appendStep(planStepObj);
        }
        planParser.onPlanFinished();
    }
}
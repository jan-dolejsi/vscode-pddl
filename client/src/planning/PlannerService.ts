/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as request from 'request';
import { Planner } from './planner';
import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan } from '../../../common/src/Plan';
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { PlanStep } from '../../../common/src/PlanStep';
import { Authentication } from '../../../common/src/Authentication';

export class PlannerService extends Planner {

    // This epsilon is used only for the duration of instantaneous actions
    epsilon = 1e-3;

    constructor(plannerPath: string, plannerOptions: string, private useAuthentication: boolean, private authentication: Authentication) {
        super(plannerPath, plannerOptions);
    }

    plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: PddlPlanParser, parent: PlannerResponseHandler): Promise<Plan[]> {
        parent.handleOutput(`Planning service: ${this.plannerPath}\nDomain: ${domainFileInfo.name}, Problem: ${problemFileInfo.name}\n`);

        let requestHeader: any = {};
        if(this.useAuthentication) {
            requestHeader = {
                "Authorization": "Bearer " + this.authentication.sToken
            }
        }

        let requestBody = {
            "domain": domainFileInfo.getText(),
            "problem": problemFileInfo.getText()
        }

        let that = this;
        return new Promise<Plan[]>(function(resolve, reject) {
            let url = that.plannerPath;
            if (that.plannerOptions) url = `${url}?${that.plannerOptions}`;
            request.post({ url: url, headers: requestHeader, body: requestBody, json: true }, (err, httpResponse, responseBody) => {

                if (err != null) {
                    reject(err);
                    return;
                }

                if(that.useAuthentication) {
                    if (httpResponse) {
                        if (httpResponse.statusCode == 400) {
                            let message = "Authentication failed. Please login or update tokens."
                            let error = new Error(message);
                            reject(error);
                            return;
                        }
                        else if (httpResponse.statusCode == 401) {
                            let message = "Invalid token. Please update tokens."
                            let error = new Error(message);
                            reject(error);
                            return;
                        }
                    }
                }

                if (httpResponse && httpResponse.statusCode != 200) {
                    let notificationMessage = `PDDL Planning Service returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                    //let notificationType = MessageType.Warning;
                    let error = new Error(notificationMessage);
                    reject(error);
                    return;
                }

                let status = responseBody["status"];

                if (status == "error") {
                    let result = responseBody["result"];

                    let resultOutput = result["output"];
                    if (resultOutput) {
                        parent.handleOutput(resultOutput);
                    }

                    let resultError = result["error"];
                    if (resultError) {
                        parent.handleOutput(resultError);
                        resolve([]);
                    }
                    else {
                        reject(new Error(result));
                    }
                    return;
                }
                else if (status != "ok") {
                    reject(new Error("Planner service failed."));
                    return;
                }

                let result = responseBody["result"];
                let resultOutput = result["output"];
                if (resultOutput) {
                    parent.handleOutput(resultOutput);
                }

                let planSteps = result['plan'];

                for (var index = 0; index < planSteps.length; index++) {
                    var planStep = planSteps[index];
                    let fullActionName = (<string>planStep["name"]).replace('(','').replace(')', '');
                    let time = planStep["time"];
                    let duration = planStep["duration"] ? planStep["duration"] : that.epsilon;
                    let planStepObj = new PlanStep(time, fullActionName, planStep["duration"] != null, duration, index);
                    planParser.appendStep(planStepObj);
                }

                planParser.onPlanFinished();

                let plans = planParser.getPlans();
                if (plans.length > 0) parent.handleOutput(plans[0].getText() + '\n');
                else parent.handleOutput('No plan found.');

                resolve(plans);
            });
        });
    }

    stop(): void {
        super.stop();
    }
}
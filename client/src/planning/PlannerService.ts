/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as request from 'request';
import { Planner } from './planner';
import { PlanningHandler } from './plan';
import { Plan } from '../../../common/src/Plan';
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { PlanStep } from '../../../common/src/PlanStep';
import { Authentication } from '../../../common/src/Authentication';

export class PlannerService extends Planner {

    // This epsilon is used only for the duration of instantaneous actions
    epsilon = 1e-3;

    constructor(plannerPath: string, private useAuthentication: boolean, private authentication: Authentication) {
        super(plannerPath, "");
    }

    plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: PddlPlanParser, parent: PlanningHandler): Promise<Plan[]> {
        parent.handleOutput(`Planning service: ${this.plannerPath}\nDomain: ${domainFileInfo.name}, Problem: ${problemFileInfo.name}\n`);

        let requestHeader: any = {};
        if(this.useAuthentication) {
            requestHeader = {
                "Authorization": "Bearer " + this.authentication.sToken
            }
        }
        
        let requestBody = {
            "domain": domainFileInfo.text,
            "problem": problemFileInfo.text
        }
        
        let that = this;
        return new Promise<Plan[]>(function(resolve, reject) {
            request.post({ url: that.plannerPath, headers: requestHeader, body: requestBody, json: true }, (err, httpResponse, responseBody) => {

                if (err != null) {
                    parent.handleError(err, "");
                    reject(err);
                    return;
                }
    
                if(that.useAuthentication) {
                    if (httpResponse) {
                        if (httpResponse.statusCode == 400) {
                            let message = "Authentication failed. Please login or update tokens."
                            let error = new Error(message);
                            parent.handleError(error, message);
                            reject(error);
                            return;
                        }
                        else if (httpResponse.statusCode == 401) {
                            let message = "Invalid token. Please update tokens."
                            let error = new Error(message);
                            parent.handleError(error, message);
                            reject(error);
                            return;
                        }
                    }
                }
    
                if (httpResponse && httpResponse.statusCode != 200) {
                    let notificationMessage = `PDDL Planning Service returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                    //let notificationType = MessageType.Warning;
                    let error = new Error(notificationMessage);
                    parent.handleError(error, notificationMessage);
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
                        parent.handleSuccess("", []);
                        resolve([]);
                    }
                    else {
                        parent.handleError(new Error(result), "");
                        reject(new Error(result));
                    }
                    return;
                }
                else if (status != "ok") {
                    parent.handleError(new Error("Planner service failed."), "");
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
                    let planStepObj = new PlanStep(planStep["time"], fullActionName, planStep["duration"] != null, planStep["duration"] ? planStep["duration"] : that.epsilon, index);
                    planParser.appendStep(planStepObj);
                }
    
                planParser.onPlanFinished();
    
                let plans = planParser.getPlans();
                if (plans.length > 0) parent.handleOutput(plans[0].getText() + '\n');
                else parent.handleOutput('No plan found.');

                parent.handleSuccess(responseBody.toString(), plans);
                resolve(plans);
            });
        });
    }

    stop(): void {
        super.stop();
    }
} 
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as request from 'request';
import { Planner } from './planner';
import { PlanningHandler } from './plan';
import { DomainInfo, ProblemInfo } from '../../common/src/parser';
import { PddlPlanParser } from './PddlPlanParser';
import { Authentication } from '../../common/src/Authentication';

export class PlannerService extends Planner {

    constructor(plannerPath: string, private useAuthentication: boolean, private authentication: Authentication) {
        super(plannerPath, "");
    }

    plan(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, planParser: PddlPlanParser, parent: PlanningHandler): void {
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

        request.post({ url: this.plannerPath, headers: requestHeader, body: requestBody, json: true }, (err, httpResponse, responseBody) => {

            if (err != null) {
                parent.handleError(err, "");
                return;
            }

            if(this.useAuthentication) {
                if (httpResponse && httpResponse.statusCode == 400) {
                    this.authentication.updateTokens(() => { this.plan(domainFileInfo, problemFileInfo, planParser, parent); }, () => { console.log('Couldn\'t update the tokens, try to login.'); });
                }
            }

            if (httpResponse && httpResponse.statusCode != 200) {
                let notificationMessage = `PDDL Planning Service returned code ${httpResponse.statusCode} ${httpResponse.statusMessage}`;
                //let notificationType = MessageType.Warning;
                parent.handleError(new Error(notificationMessage), notificationMessage);
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
                }
                else {
                    parent.handleError(new Error(result), "");
                }
                return;
            }
            else if (status != "ok") {
                parent.handleError(new Error("Planner service failed."), "");
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
                planParser.appendLine(planStep["name"]);
            }

            planParser.onPlanFinished();

            parent.handleSuccess(responseBody.toString(), planParser.getPlans());
        });
    }

    stop(): void {

    }
} 
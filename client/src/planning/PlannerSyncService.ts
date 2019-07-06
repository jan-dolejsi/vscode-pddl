/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan } from '../../../common/src/Plan';
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { Authentication } from '../../../common/src/Authentication';
import { PlannerService } from './PlannerService';

/** Wraps the `/solve` planning web service interface. */
export class PlannerSyncService extends PlannerService {

    constructor(plannerPath: string, private plannerOptions: string, useAuthentication: boolean, authentication: Authentication) {
        super(plannerPath, useAuthentication, authentication);
    }

    createUrl(): string {

        let url = this.plannerPath;
        if (this.plannerOptions) {
            url = `${url}?${this.plannerOptions}`;
        }
        return url;
    }

    getTimeout(): number {
        return 60;
    }

    createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<any> {
        let body = {
            "domain": domainFileInfo.getText(),
            "problem": problemFileInfo.getText()
        };

        return Promise.resolve(body);
    }

    processServerResponseBody(responseBody: any, planParser: PddlPlanParser, parent: PlannerResponseHandler,
        resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void {
        let status = responseBody["status"];

        if (status === "error") {
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
                reject(new Error("An error occurred while solving the planning problem: " + JSON.stringify(result)));
            }
            return;
        }
        else if (status !== "ok") {
            reject(new Error(`Planner service failed with status ${status}.`));
            return;
        }

        let result = responseBody["result"];
        let resultOutput = result["output"];
        if (resultOutput) {
            parent.handleOutput(resultOutput);
        }

        this.parsePlanSteps(result['plan'], planParser);

        let plans = planParser.getPlans();
        if (plans.length > 0) { parent.handleOutput(plans[0].getText() + '\n'); }
        else { parent.handleOutput('No plan found.'); }

        resolve(plans);
    }
}
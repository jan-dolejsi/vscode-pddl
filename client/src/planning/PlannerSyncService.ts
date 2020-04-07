/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlannerResponseHandler } from './PlannerResponseHandler';
import { Plan } from 'pddl-workspace';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { parser } from 'pddl-workspace';
import { Authentication } from '../../../common/src/Authentication';
import { PlannerService } from './PlannerService';

/** Wraps the `/solve` planning web service interface. */
export class PlannerSyncService extends PlannerService {

    constructor(plannerPath: string, private plannerOptions: string, authentication?: Authentication) {
        super(plannerPath, authentication);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createRequestBody(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo): Promise<any> {
        const body = {
            "domain": domainFileInfo.getText(),
            "problem": problemFileInfo.getText()
        };

        return Promise.resolve(body);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processServerResponseBody(responseBody: any, planParser: parser.PddlPlannerOutputParser, parent: PlannerResponseHandler,
        resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void {
        const status = responseBody["status"];

        if (status === "error") {
            const result = responseBody["result"];

            const resultOutput = result["output"];
            if (resultOutput) {
                parent.handleOutput(resultOutput);
            }

            const resultError = result["error"];
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

        const result = responseBody["result"];
        const resultOutput = result["output"];
        if (resultOutput) {
            parent.handleOutput(resultOutput);
        }

        this.parsePlanSteps(result['plan'], planParser);

        const plans = planParser.getPlans();
        if (plans.length > 0) { parent.handleOutput(plans[0].getText() + '\n'); }
        else { parent.handleOutput('No plan found.'); }

        resolve(plans);
    }
}
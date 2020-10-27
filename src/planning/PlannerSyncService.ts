/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan, ProblemInfo, DomainInfo, parser, planner } from 'pddl-workspace';
import { Authentication } from '../util/Authentication';
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
    processServerResponseBody(responseBody: any, planParser: parser.PddlPlannerOutputParser, callbacks: planner.PlannerResponseHandler,
        resolve: (plans: Plan[]) => void, reject: (error: Error) => void): void {
        const status = responseBody["status"];

        if (status === "error") {
            const result = responseBody["result"];

            const resultOutput = result["output"];
            if (resultOutput) {
                callbacks.handleOutput(resultOutput);
            }

            const resultError = result["error"];
            if (resultError) {
                callbacks.handleOutput(resultError);
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
            callbacks.handleOutput(resultOutput);
        }

        this.parsePlanSteps(result['plan'], planParser);

        const plans = planParser.getPlans();
        if (plans.length > 0) { callbacks.handleOutput(plans[0].getText() + '\n'); }
        else { callbacks.handleOutput('No plan found.'); }

        resolve(plans);
    }
}
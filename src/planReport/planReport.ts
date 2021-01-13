/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Plan } from 'pddl-workspace';
import { ExtensionContext, workspace, window } from 'vscode';
import { instrumentOperationAsVsCodeCommand } from 'vscode-extension-telemetry-wrapper';
import { CONF_PDDL, PLAN_REPORT_EXPORT_WIDTH } from '../configuration/configuration';
import { PDDL_GENERATE_PLAN_REPORT } from '../planView/PlanView';
import { showError } from '../utils';
import { PlanReportGenerator } from './PlanReportGenerator';

export function registerPlanReport(context: ExtensionContext): void {
    
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_GENERATE_PLAN_REPORT, async (plans: Plan[] | undefined, selectedPlan: number) => {
        if (plans) {
            const width = workspace.getConfiguration(CONF_PDDL).get<number>(PLAN_REPORT_EXPORT_WIDTH, 1000);
            try {
                await new PlanReportGenerator(context, { displayWidth: width, selfContained: true }).export(plans, selectedPlan);
            } catch(ex) {
                showError(ex);
            }
        } else {
            window.showErrorMessage("There is no plan to export.");
        }
    }));

}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { Uri, workspace } from 'vscode';
import { PddlWorkspace, Plan } from 'pddl-workspace';

import { PlanReportSettings } from '../planReport/PlanReportSettings';
import { exists } from '../util/workspaceFs';
import { PlanData, PlansData } from './model';
import { CONF_PDDL, PLAN_REPORT_WIDTH } from '../configuration/configuration';


export async function getDocumentText(fileUri: Uri, defaultText?: string): Promise<string> {
    if (await exists(fileUri)) {
        return (await workspace.fs.readFile(fileUri)).toString();
    } else {
        return defaultText ?? 'File not found ' + fileUri.fsPath;
    }
}

export async function getDomainVisualizationConfiguration(plan: Plan): Promise<PlanReportSettings | undefined> {
    return plan.domain
        && PlanReportSettings.loadFromText(await getDocumentText(PlanReportSettings.toVisualizationSettings(plan.domain.fileUri)));
}

export async function getDomainVisualizationConfigurationDataForPlan(plan: Plan): Promise<PlanData> {
    const width = workspace.getConfiguration(CONF_PDDL).get<number>(PLAN_REPORT_WIDTH, 300);

    const domainVizConfiguration = plan.domain &&
        await getDomainVisualizationConfiguration(plan);

    const planVisualizerRelativePath = domainVizConfiguration?.getPlanVisualizerScript();

    const planVisualizationScriptPath = plan.domain && planVisualizerRelativePath &&
        path.join(PddlWorkspace.getFolderPath(plan.domain.fileUri), planVisualizerRelativePath);

    const planVisualizationScript = planVisualizationScriptPath
        && await getDocumentText(Uri.file(planVisualizationScriptPath));

    return {
        plan: plan,
        domainVisualizationConfiguration: domainVizConfiguration?.settings,
        customDomainVisualizationScript: planVisualizationScript,
        width: width
    };
}

export async function getDomainVisualizationConfigurationDataForPlans(plans: Plan[]): Promise<PlansData> {
    if (plans.length > 0) {
        const data = await getDomainVisualizationConfigurationDataForPlan(plans[0]);

        return {
            plans: plans,
            width: data.width,
            domainVisualizationConfiguration: data.domainVisualizationConfiguration,
            customDomainVisualizationScript: data.customDomainVisualizationScript
        };
    } else {
        return {
            plans: plans,
            width: 0
        };
    }
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanStep } from 'pddl-workspace';
import { Uri, workspace } from 'vscode';
import { exists } from '../util/workspaceFs';

export class PlanReportSettings {
    excludeActions: string[] | undefined;
    ignoreActionParameters: ActionParameterPattern[] | undefined;


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(private readonly settings: any | undefined) {
    }

    static toVisualizationSettings(domainFileUri: Uri): Uri {
        return Uri.file(domainFileUri.fsPath.replace(/\.pddl$/, '.planviz.json'));
    }

    static async load(domainFileUri: Uri): Promise<PlanReportSettings> {
        const configurationFileUri = PlanReportSettings.toVisualizationSettings(domainFileUri);

        if (await exists(configurationFileUri)) {
            const configurationText = (await workspace.fs.readFile(configurationFileUri)).toString();
            return this.loadFromText(configurationText);
        } else {
            return new PlanReportSettings(undefined);
        }
    }

    static loadFromText(configurationText: string): PlanReportSettings {
        try {
            const configuration = JSON.parse(configurationText);
            return new PlanReportSettings(configuration);
        } catch (err) {
            console.log(err);
            return new PlanReportSettings(undefined);
        }
    }

    shouldDisplay(planStep: PlanStep): boolean {
        if (!this.settings) { return true; }

        if (this.excludeActions === undefined) {
            this.excludeActions = this.settings["excludeActions"];
        }

        if (!this.excludeActions) { return true; }
        return !this.excludeActions.some(pattern => this.matches(pattern, planStep.getActionName()));
    }

    shouldIgnoreActionParameter(actionName: string, parameterName: string): boolean {
        if (!this.settings) { return false; }

        if (this.ignoreActionParameters === undefined) { this.ignoreActionParameters = this.settings["ignoreActionParameters"]; }
        if (!this.ignoreActionParameters) { return false; }

        const applicableSetting = this.ignoreActionParameters.find(entry => this.matches(entry.action, actionName));

        if (!applicableSetting) { return false; }

        return parameterName.match(new RegExp(applicableSetting.parameterPattern, "i")) !== null;
    }

    private matches(pattern: string, actionName: string): boolean {
        return !!actionName.match(new RegExp(pattern, "i"));
    }

    getPlanVisualizerScript(): string | undefined {
        return this.settings && this.settings["planVisualizer"];
    }
}

interface ActionParameterPattern {
    action: string;
    parameterPattern: string;
}
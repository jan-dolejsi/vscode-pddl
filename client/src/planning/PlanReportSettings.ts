
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanStep } from "../../../common/src/PlanStep";
const fs = require('fs');
const { URL } = require('url');

export class PlanReportSettings {
    settings: any = null;
    excludeActions: string[] | undefined;
    ignoreActionParameters: ActionParameterPattern[] | undefined;

    constructor(domainFileUri: string) {
        let settingsFileUri = domainFileUri.replace(/\.pddl$/, '.planviz.json');
        let url = new URL(settingsFileUri);
        if (fs.existsSync(url)) {
            let settings = fs.readFileSync(url);
            try {
                this.settings = JSON.parse(settings);
            } catch (err) {
                console.log(err);
            }
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
        if (!this.ignoreActionParameters) { return true; }

        let applicableSetting = this.ignoreActionParameters.find(entry => this.matches(entry.action, actionName));

        if (!applicableSetting) { return false; }

        return parameterName.match(new RegExp(applicableSetting.parameterPattern, "i")) !== null;
    }

    private matches(pattern: string, actionName: string): boolean {
        return !!actionName.match(new RegExp(pattern, "i"));
    }

    getPlanVisualizerScript(): string {
        return this.settings && this.settings["planVisualizer"];
    }
}

interface ActionParameterPattern {
    action: string;
    parameterPattern: string;
}
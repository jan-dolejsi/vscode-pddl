
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PlanStep } from 'pddl-workspace';
import fs = require('fs');
import { URL } from 'url';

export class PlanReportSettings {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: any = null;
    excludeActions: string[] | undefined;
    ignoreActionParameters: ActionParameterPattern[] | undefined;

    constructor(domainFileUri: string) {
        const settingsFileUri = domainFileUri.replace(/\.pddl$/, '.planviz.json');
        const url = new URL(settingsFileUri);
        if (fs.existsSync(url)) {
            const settings = fs.readFileSync(url, { encoding: 'utf8' });
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
        if (!this.ignoreActionParameters) { return false; }

        const applicableSetting = this.ignoreActionParameters.find(entry => this.matches(entry.action, actionName));

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
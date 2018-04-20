
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
    excludeActions: string[] = null;

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
        if (!this.settings) return true;

        if (this.excludeActions == null) this.excludeActions = this.settings["excludeActions"];
        if (!this.excludeActions) return true;
        return !this.excludeActions.some(pattern => this.matches(pattern, planStep.actionName));
    }

    matches(pattern: string, actionName: string): boolean {
        return actionName.match(pattern) != null;
    }
}
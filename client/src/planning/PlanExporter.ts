/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, SaveDialogOptions, window
} from 'vscode';

import { Plan } from "../../../common/src/Plan";
import { parse, format } from 'path';
import { isNullOrUndefined } from 'util';
import { exportToAndShow } from './ExportUtil';

export class PlanExporter {
            
    constructor() {}

    public async export(plan: Plan) {
        
        let defaultPlanPath = PlanExporter.replaceExtension(Uri.parse(plan.problem.fileUri).with({ scheme: 'file' }).fsPath, '.plan');

        let options: SaveDialogOptions = {
            saveLabel: "Save plan as...",
            filters: {
                "Plan": ["plan"]
            },

            defaultUri: Uri.file(defaultPlanPath)
        };

        try {
            let uri = await window.showSaveDialog(options);
            if (uri == undefined) return; // canceled by user

            await exportToAndShow(this.getPlanText(plan), uri);
        } catch (ex) {
            window.showErrorMessage(`Cannot export plan: ${ex.message}`);
        }
    }

    getPlanText(plan: Plan): string {
        let planText = `;;!domain: ${plan.domain.name}
;;!problem: ${plan.problem.name}

${plan.getText()}

; Makespan: ${plan.makespan}`;

        if (!isNullOrUndefined(plan.cost)){
            planText += `\n; Cost: ${plan.cost}`;
        }
        
        if (!isNullOrUndefined(plan.statesEvaluated)){
            planText += `\n; States evaluated: ${plan.statesEvaluated}`;
        }

        return planText;
    }

    static replaceExtension(path: string, extension: string): string {
        let pathObj = parse(path);
        let origExt = pathObj.ext;
        pathObj.ext = extension;
        pathObj.base = pathObj.base.replace(new RegExp(origExt+'$'), pathObj.ext);
        return format(pathObj);
    }
}

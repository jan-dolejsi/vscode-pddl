/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, SaveDialogOptions, window
} from 'vscode';

import { Plan } from 'pddl-workspace';
import { parse, format } from 'path';
import { exportToAndShow } from './ExportUtil';


export abstract class AbstractPlanExporter {

    public async export() {

        let defaultPlanPath = this.getDefaultPlanPath();

        let options: SaveDialogOptions = {
            saveLabel: "Save plan as...",
            filters: {
                "Plan": ["plan"]
            },

            defaultUri: Uri.file(defaultPlanPath)
        };

        try {
            let uri = await window.showSaveDialog(options);
            if (uri === undefined) { return; } // canceled by user

            await exportToAndShow(this.getPlanText(), uri);
        } catch (ex) {
            window.showErrorMessage(`Cannot export plan: ${ex}`);
        }
    }

    abstract getDefaultPlanPath(): string;

    abstract getPlanText(): string;

    static getPlanMeta(domainName: string, problemName: string): string {
        return `;;!domain: ${domainName}
;;!problem: ${problemName}
`;
    }

    static replaceExtension(path: string, extension: string): string {
        let pathObj = parse(path);
        let origExt = pathObj.ext;
        pathObj.ext = extension;
        pathObj.base = pathObj.base.replace(new RegExp(origExt+'$'), pathObj.ext);
        return format(pathObj);
    }
}

export class PlanExporter extends AbstractPlanExporter {

    constructor(private plan: Plan) {
        super();
    }

    getDefaultPlanPath(): string {
        let baseUri = Uri.parse(this.plan.problem.fileUri);
        if (this.plan.problem.fileUri.startsWith('http')) {
            baseUri = Uri.file(baseUri.path);
        }

        return PlanExporter.replaceExtension(baseUri.with({ scheme: 'file' }).fsPath, '.plan');
    }

    getPlanText(): string {
        let planText = AbstractPlanExporter.getPlanMeta(this.plan.domain.name, this.plan.problem.name) +
`
${this.plan.getText()}

; Makespan: ${this.plan.makespan}`;

        if (this.plan.cost !== null && this.plan.cost !== undefined){
            planText += `\n; Cost: ${this.plan.cost}`;
        }

        if (this.plan.statesEvaluated !== null && this.plan.statesEvaluated !== undefined){
            planText += `\n; States evaluated: ${this.plan.statesEvaluated}`;
        }

        return planText;
    }
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, SaveDialogOptions, window
} from 'vscode';

import { parser, Plan } from 'pddl-workspace';
import { parse, format } from 'path';
import { exportToAndShow } from '../util/editorUtil';
import { toUri } from '../utils';


export abstract class AbstractPlanExporter {

    public async export(): Promise<void> {

        const defaultPlanPath = this.getDefaultPlanPath();

        const options: SaveDialogOptions = {
            saveLabel: "Save plan as...",
            filters: {
                "Plan": ["plan"]
            },

            defaultUri: Uri.file(defaultPlanPath)
        };

        try {
            const uri = await window.showSaveDialog(options);
            if (uri === undefined) { return; } // canceled by user

            await exportToAndShow(this.getPlanText(), uri);
        } catch (ex) {
            window.showErrorMessage(`Cannot export plan: ${ex}`);
        }
    }

    abstract getDefaultPlanPath(): string;

    abstract getPlanText(): string;

    static replaceExtension(path: string, extension: string): string {
        const pathObj = parse(path);
        const origExt = pathObj.ext;
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
        if (!this.plan.problem) {
            throw new Error(`Problem not specified.`);
        }
        let baseUri = toUri(this.plan.problem.fileUri);
        if (this.plan.problem.fileUri.scheme === 'http') {
            baseUri = Uri.file(baseUri.path);
        }

        return PlanExporter.replaceExtension(baseUri.with({ scheme: 'file' }).fsPath, '.plan');
    }

    getPlanText(): string {
        let planText = parser.PddlPlanParser.getPlanMeta(this.plan.domain?.name ?? 'undefined', this.plan.problem?.name ?? 'undefined', '\n') +
`
${this.plan.getText()}

; Makespan: ${this.plan.makespan}`;

        if (this.plan.metric !== null && this.plan.metric !== undefined){
            planText += `\n; Metric: ${this.plan.metric}`;
        }

        if (this.plan.statesEvaluated !== undefined){
            planText += `\n; States evaluated: ${this.plan.statesEvaluated}`;
        }

        return planText;
    }
}

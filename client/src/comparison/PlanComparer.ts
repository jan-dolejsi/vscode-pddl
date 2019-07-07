/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window,  workspace,
    commands, Uri,
    TextDocument, Disposable, ViewColumn,
} from 'vscode';

import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { PddlLanguage } from '../../../common/src/FileInfo';
import { toLanguage, isPlan } from '../workspace/workspaceUtils';

import { NormalizedPlanDocumentContentProvider } from './NormalizedPlanDocumentContentProvider';
import { PddlConfiguration } from '../configuration';


/**
 * Delegate for handling requests to run the planner and visualize the plans.
 */
export class PlanComparer implements Disposable {
    epsilon = 1e-3;

    provider: NormalizedPlanDocumentContentProvider;
    normalizedPlanScheme = 'normalized-pddl-plan';
    disposables: Disposable[] = [];

    constructor(public pddlWorkspace: PddlWorkspace, pddlConfiguration: PddlConfiguration) {

        this.provider = new NormalizedPlanDocumentContentProvider(pddlWorkspace, pddlConfiguration, true);
        this.disposables.push(workspace.registerTextDocumentContentProvider(this.normalizedPlanScheme, this.provider));

        this.disposables.push(commands.registerCommand("pddl.plan.compareNormalized",
            async (rightPlanUri: Uri, selectedFiles: Uri[]) => {
                if (selectedFiles.length !== 2) {
                    window.showErrorMessage("Hold down the Ctrl/Command key and select two plan files.");
                    return;
                }

                let leftFileUri = selectedFiles.find(otherFileUri => otherFileUri.toString() !== rightPlanUri.toString());
                let leftTextDocument = await workspace.openTextDocument(leftFileUri);

                if (toLanguage(leftTextDocument) !== PddlLanguage.PLAN) {
                    window.showErrorMessage("Select 2 .plan files.");
                    return;
                }

                let rightPlan = await workspace.openTextDocument(rightPlanUri);
                let leftPlan = leftTextDocument;

                this.compare(leftPlan, rightPlan);
            })
        );

        this.disposables.push(commands.registerCommand("pddl.plan.normalize", async (uri: Uri) => {
            if (!uri && window.activeTextEditor) { uri = window.activeTextEditor.document.uri; }
            let planDoc = await workspace.openTextDocument(uri);
            if (!isPlan(planDoc)) {
                window.showErrorMessage("Active document is not a plan.");
            }
            else {
                let normalizedUri = this.subscribeToNormalizedUri(uri);
                window.showTextDocument(normalizedUri, {viewColumn: ViewColumn.Beside});
            }
        }));
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    compare(leftPlan: TextDocument, rightPlan: TextDocument): any {
        let title = `${workspace.asRelativePath(leftPlan.uri)} ↔ ${workspace.asRelativePath(rightPlan.uri)}`;

        let leftPlanNormalized = this.subscribeToNormalizedUri(leftPlan.uri);
        let rightPlanNormalized = this.subscribeToNormalizedUri(rightPlan.uri);

        commands.executeCommand('vscode.diff',
            leftPlanNormalized,
            rightPlanNormalized,
            title,
            {viewColumn: ViewColumn.Active});
    }

    subscribeToNormalizedUri(uri: Uri): Uri {
        let normalizedPlanUri = uri.with({scheme: this.normalizedPlanScheme});
        this.disposables.push(workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === uri.toString()) { this.provider.planChanged(normalizedPlanUri); }
        }));

        return normalizedPlanUri;
    }
}
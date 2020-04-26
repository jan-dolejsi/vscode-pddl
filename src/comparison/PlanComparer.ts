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

import { PddlWorkspace } from 'pddl-workspace';
import { PddlLanguage } from 'pddl-workspace';
import { toLanguage, isPlan } from '../workspace/workspaceUtils';

import { NormalizedPlanDocumentContentProvider } from './NormalizedPlanDocumentContentProvider';
import { PddlConfiguration } from '../configuration/configuration';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";


/**
 * Delegate for handling requests to run the planner and visualize the plans.
 */
export class PlanComparer implements Disposable {

    provider: NormalizedPlanDocumentContentProvider;
    normalizedPlanScheme = 'normalized-pddl-plan';
    disposables: Disposable[] = [];

    constructor(public pddlWorkspace: PddlWorkspace, pddlConfiguration: PddlConfiguration) {

        this.provider = new NormalizedPlanDocumentContentProvider(pddlWorkspace, pddlConfiguration, true);
        this.disposables.push(workspace.registerTextDocumentContentProvider(this.normalizedPlanScheme, this.provider));

        this.disposables.push(instrumentOperationAsVsCodeCommand("pddl.plan.compareNormalized",
            async (rightPlanUri: Uri, selectedFiles: Uri[]) => {
                if (selectedFiles.length !== 2) {
                    window.showErrorMessage("Hold down the Ctrl/Command key and select two plan files.");
                    return;
                }

                const leftFileUri = selectedFiles.find(otherFileUri => otherFileUri.toString() !== rightPlanUri.toString())!;
                const leftTextDocument = await workspace.openTextDocument(leftFileUri);

                if (toLanguage(leftTextDocument) !== PddlLanguage.PLAN) {
                    window.showErrorMessage("Select 2 .plan files.");
                    return;
                }

                const rightPlan = await workspace.openTextDocument(rightPlanUri);
                const leftPlan = leftTextDocument;

                this.compare(leftPlan, rightPlan);
            })
        );

        this.disposables.push(instrumentOperationAsVsCodeCommand("pddl.plan.normalize", async (uri: Uri) => {
            if (!uri && window.activeTextEditor) { uri = window.activeTextEditor.document.uri; }
            const planDoc = await workspace.openTextDocument(uri);
            if (!isPlan(planDoc)) {
                window.showErrorMessage("Active document is not a plan.");
            }
            else {
                const normalizedUri = this.subscribeToNormalizedUri(uri);
                window.showTextDocument(normalizedUri, {viewColumn: ViewColumn.Beside});
            }
        }));
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    compare(leftPlan: TextDocument, rightPlan: TextDocument): void {
        const title = `${workspace.asRelativePath(leftPlan.uri)} ↔ ${workspace.asRelativePath(rightPlan.uri)}`;

        const leftPlanNormalized = this.subscribeToNormalizedUri(leftPlan.uri);
        const rightPlanNormalized = this.subscribeToNormalizedUri(rightPlan.uri);

        commands.executeCommand('vscode.diff',
            leftPlanNormalized,
            rightPlanNormalized,
            title,
            {viewColumn: ViewColumn.Active});
    }

    subscribeToNormalizedUri(uri: Uri): Uri {
        const normalizedPlanUri = uri.with({scheme: this.normalizedPlanScheme});
        this.disposables.push(workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === uri.toString()) { this.provider.planChanged(normalizedPlanUri); }
        }));

        return normalizedPlanUri;
    }
}
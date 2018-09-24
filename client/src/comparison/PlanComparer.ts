/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window,  workspace, 
    commands, Uri,
    ExtensionContext, TextDocument,
} from 'vscode';

import { PddlWorkspace } from '../../../common/src/workspace-model';
import { PddlLanguage } from '../../../common/src/FileInfo';
import { toLanguage } from '../utils';

import { NormalizedPlanDocumentContentProvider } from './NormalizedPlanDocumentContentProvider';
import { PddlConfiguration } from '../configuration';


/**
 * Delegate for handling requests to run the planner and visualize the plans.
 */
export class PlanComparer {
    epsilon = 1e-3;

    provider: NormalizedPlanDocumentContentProvider;
    normalizedPlanScheme = 'normalized-pddl-plan';

    constructor(public pddlWorkspace: PddlWorkspace, pddlConfiguration: PddlConfiguration, context: ExtensionContext) {

        this.provider = new NormalizedPlanDocumentContentProvider(pddlConfiguration);
        context.subscriptions.push(workspace.registerTextDocumentContentProvider(this.normalizedPlanScheme, this.provider));

        context.subscriptions.push(commands.registerCommand("pddl.plan.compareNormalized",
            async (rightPlanUri: Uri, selectedFiles: Uri[]) => {
                if (selectedFiles.length != 2) {
                    window.showErrorMessage("Hold down the Ctrl/Command key and select two plan files.");
                    return;
                }

                let leftFileUri = selectedFiles.find(otherFileUri => otherFileUri != rightPlanUri);
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
    }

    compare(leftPlan: TextDocument, rightPlan: TextDocument): any {
        let title = `${workspace.asRelativePath(leftPlan.uri)} ↔ ${workspace.asRelativePath(rightPlan.uri)}`;

        commands.executeCommand('vscode.diff', 
            leftPlan.uri.with({scheme: this.normalizedPlanScheme}), 
            rightPlan.uri.with({scheme: this.normalizedPlanScheme}),
            title
            );
    }
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CancellationToken, Event, EventEmitter, TextDocumentContentProvider, Uri, window, workspace } from 'vscode';
import { parser, PddlWorkspace } from 'pddl-workspace';
import { PddlConfiguration } from '../configuration/configuration';
import { getDomainAndProblemForPlan } from '../workspace/workspaceUtils';
import { PlanEvaluator } from 'ai-planning-val';
import { PlanningDomains } from '../catalog/PlanningDomains';
import { HTTPLAN } from '../catalog/Catalog';
import { toURI } from '../utils';


/**
 * Normalizes the plan at that URI and outputs the normal representation so it can be used for diffing. 
 */
export class NormalizedPlanDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private timeout: NodeJS.Timeout | undefined;
    private changingUris: Uri[] = [];

    constructor(private pddlWorkspace: PddlWorkspace, private configuration: PddlConfiguration,
        private includeFinalValues: boolean) {
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    dispose(): void {
        this._onDidChange.dispose();
        if (this.timeout) { clearTimeout(this.timeout); }
    }

    planChanged(uri: Uri): void {
        if (this.timeout) { clearTimeout(this.timeout); }
        if (!this.changingUris.some(uri1 => uri1.toString() === uri.toString())) {
            this.changingUris.push(uri);
        }
        this.timeout = setTimeout(() => this.updateChangedPlans(), 1000);
    }

    updateChangedPlans(): void {
        this.timeout = undefined;
        this.changingUris.forEach(uri => this._onDidChange.fire(uri));
        this.changingUris = [];
    }

    provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        if (token.isCancellationRequested) { return "Canceled"; }

        const newScheme = (uri.authority === PlanningDomains.AUTHORITY) ? HTTPLAN : 'file';

        const fileUri = uri.with({ scheme: newScheme });

        return workspace.openTextDocument(fileUri)
            .then(document => document.getText())
            .then(documentText => this.normalize(fileUri, documentText));
    }

    async normalize(uri: Uri, origText: string): Promise<string> {
        let normalizedPlan = new parser.NormalizingPddlPlanParser(this.configuration.getEpsilonTimeStep()).normalize(origText, '\n');

        if (this.includeFinalValues) {
            try {
                const planValuesAsText = await this.evaluate(uri, origText);
                if (planValuesAsText) {
                    normalizedPlan = `${normalizedPlan}\n\n;; Modified state values:\n\n${planValuesAsText}`;
                }
            }
            catch (err) {
                window.showWarningMessage(err.toString());
            }
        }

        return normalizedPlan;
    }

    async evaluate(uri: Uri, origText: string): Promise<string> {
        const planMetaData = parser.PddlPlanParser.parsePlanMeta(origText);
        if (planMetaData.domainName !== parser.UNSPECIFIED_DOMAIN && planMetaData.problemName !== parser.UNSPECIFIED_DOMAIN) {
            const planInfo = new parser.PddlPlanParser().parseText(origText, this.configuration.getEpsilonTimeStep(), toURI(uri));

            const context = getDomainAndProblemForPlan(planInfo, this.pddlWorkspace);
            const valStepPath = await this.configuration.getValStepPath();
            const verbose = this.configuration.getValStepVerbose();
            const planValues = await new PlanEvaluator()
                .evaluate(context.domain, context.problem, planInfo, { valStepPath: valStepPath, verbose});

            const planValuesAsText = planValues
                ?.sort((a, b) => a.getVariableName().localeCompare(b.getVariableName()))
                .map(value => `; ${value.getVariableName()}: ${value.getValue()}`)
                .join("\n");

            return planValuesAsText ?? '';
        }
        else {
            return "";
        }
    }
}
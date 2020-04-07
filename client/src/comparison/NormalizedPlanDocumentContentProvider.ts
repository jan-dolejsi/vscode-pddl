/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CancellationToken, Event, EventEmitter, TextDocumentContentProvider, Uri, window, workspace } from 'vscode';
import { parser } from 'pddl-workspace';
import { PlanStep } from 'pddl-workspace';
import { PddlWorkspace } from 'pddl-workspace';
import { PddlConfiguration } from '../configuration';
import { getDomainAndProblemForPlan } from '../workspace/workspaceUtils';
import { PlanEvaluator } from 'ai-planning-val';
import { AbstractPlanExporter } from '../planning/PlanExporter';
import { PlanningDomains } from '../catalog/PlanningDomains';
import { HTTPLAN } from '../catalog/Catalog';


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
        let normalizedPlan = new PlanParserAndNormalizer(this.configuration.getEpsilonTimeStep()).normalize(origText);

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
            const planInfo = parser.PddlPlanParser.parseText(origText, this.configuration.getEpsilonTimeStep(), uri.toString());

            const context = getDomainAndProblemForPlan(planInfo, this.pddlWorkspace);
            const valStepPath = await this.configuration.getValStepPath();
            const verbose = this.configuration.getValStepVerbose();
            const planValues = await new PlanEvaluator()
                .evaluate(context.domain, context.problem, planInfo, { valStepPath: valStepPath, verbose});

            const planValuesAsText = planValues
                .sort((a, b) => a.getVariableName().localeCompare(b.getVariableName()))
                .map(value => `; ${value.getVariableName()}: ${value.getValue()}`)
                .join("\n");

            return planValuesAsText;
        }
        else {
            return "";
        }
    }
}

/** Parsers the plan lines, offsets the times (by epsilon, if applicable) and returns the lines normalized. */
class PlanParserAndNormalizer {

    private makespan = 0;
    private timeOffset = 0;
    private firstLineParsed = false;

    constructor(private epsilon: number) {

    }

    normalize(origText: string): string {
        const compare = function (step1: PlanStep, step2: PlanStep): number {
            if (step1.getStartTime() !== step2.getStartTime()) {
                return step1.getStartTime() - step2.getStartTime();
            }
            else {
                return step1.fullActionName.localeCompare(step2.fullActionName);
            }
        };

        const planMeta = parser.PddlPlanParser.parsePlanMeta(origText);
        const normalizedText = AbstractPlanExporter.getPlanMeta(planMeta.domainName, planMeta.problemName)
            + "\n; Normalized plan:\n"
            + origText.split('\n')
                .map((origLine, idx) => this.parseLine(origLine, idx))
                .filter(step => step !== undefined)
                .map(step => step!)
                .sort(compare)
                .map(step => step.toPddl())
                .join('\n');

        return normalizedText;
    }

    parseLine(line: string, lineIdx: number): PlanStep | undefined {
        // todo: replace by PddlPlanParser.parseOnePlan()
        parser.PddlPlannerOutputParser.planStepPattern.lastIndex = 0;
        const group = parser.PddlPlannerOutputParser.planStepPattern.exec(line);

        if (!group) {
            return undefined;
        } else {
            // this line is a plan step
            const time = group[2] ? parseFloat(group[2]) : this.makespan;

            if (!this.firstLineParsed) {
                if (time === 0) {
                    this.timeOffset = -this.epsilon;
                }
                this.firstLineParsed = true;
            }

            const action = group[3];
            const isDurative = group[5] ? true : false;
            const duration = isDurative ? parseFloat(group[5]) : this.epsilon;

            return new PlanStep(time - this.timeOffset, action, isDurative, duration, lineIdx);
        }
    }
}

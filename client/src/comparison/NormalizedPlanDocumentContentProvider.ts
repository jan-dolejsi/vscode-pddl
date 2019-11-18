/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CancellationToken, Event, EventEmitter, TextDocumentContentProvider, Uri, window, workspace } from 'vscode';
import { Parser, UNSPECIFIED_DOMAIN } from '../../../common/src/parser';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { PlanStep } from '../../../common/src/PlanStep';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { PddlConfiguration } from '../configuration';
import { getDomainAndProblemForPlan } from '../workspace/workspaceUtils';
import { PlanEvaluator } from './PlanEvaluator';
import { AbstractPlanExporter } from '../planning/PlanExporter';
import { PlanningDomains } from '../catalog/PlanningDomains';
import { HTTPLAN } from '../catalog/Catalog';
import { SimpleDocumentPositionResolver } from '../../../common/src/DocumentPositionResolver';


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

    dispose() {
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

        let newScheme = (uri.authority === PlanningDomains.AUTHORITY) ? HTTPLAN : 'file';

        let fileUri = uri.with({ scheme: newScheme });

        return workspace.openTextDocument(fileUri)
            .then(document => document.getText())
            .then(documentText => this.normalize(fileUri, documentText));
    }

    async normalize(uri: Uri, origText: string): Promise<string> {
        let normalizedPlan = new PlanParserAndNormalizer(this.configuration.getEpsilonTimeStep()).normalize(origText);

        if (this.includeFinalValues) {
            try {
                let planValuesAsText = await this.evaluate(uri, origText);
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
        let planMetaData = Parser.parsePlanMeta(origText);
        if (planMetaData.domainName !== UNSPECIFIED_DOMAIN && planMetaData.problemName !== UNSPECIFIED_DOMAIN) {
            let planInfo = this.pddlWorkspace.parser.parsePlan(uri.toString(), -1, origText, this.configuration.getEpsilonTimeStep(), new SimpleDocumentPositionResolver(origText));

            let context = getDomainAndProblemForPlan(planInfo, this.pddlWorkspace);
            let planValues = await new PlanEvaluator(this.configuration).evaluate(context.domain, context.problem, planInfo);

            let planValuesAsText = planValues
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
        var compare = function (step1: PlanStep, step2: PlanStep): number {
            if (step1.getStartTime() !== step2.getStartTime()) {
                return step1.getStartTime() - step2.getStartTime();
            }
            else {
                return step1.fullActionName.localeCompare(step2.fullActionName);
            }
        };

        let planMeta = Parser.parsePlanMeta(origText);
        let normalizedText = AbstractPlanExporter.getPlanMeta(planMeta.domainName, planMeta.problemName)
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
        PddlPlanParser.planStepPattern.lastIndex = 0;
        let group = PddlPlanParser.planStepPattern.exec(line);

        if (!group) {
            return undefined;
        } else {
            // this line is a plan step
            let time = group[2] ? parseFloat(group[2]) : this.makespan;

            if (!this.firstLineParsed) {
                if (time === 0) {
                    this.timeOffset = -this.epsilon;
                }
                this.firstLineParsed = true;
            }

            let action = group[3];
            let isDurative = group[5] ? true : false;
            let duration = isDurative ? parseFloat(group[5]) : this.epsilon;

            return new PlanStep(time - this.timeOffset, action, isDurative, duration, lineIdx);
        }
    }
}

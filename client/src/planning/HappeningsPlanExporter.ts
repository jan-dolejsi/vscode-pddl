/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    TextDocument
} from 'vscode';

import { AbstractPlanExporter } from './PlanExporter';
import { Happening, HappeningType, PlanStep, parser } from 'pddl-workspace';

/** Exports .happenings file to a .plan file by pairing happenings, if possible. */
export class HappeningsPlanExporter extends AbstractPlanExporter {

    decimals: number;

    constructor(private happeningsDocument: TextDocument, private epsilon: number) {
        super();
        this.decimals = -Math.log10(epsilon);
    }

    getDefaultPlanPath(): string {
        return AbstractPlanExporter.replaceExtension(this.happeningsDocument.uri.fsPath, '.plan');
    }

    makespan = 0;

    getPlanText(): string {
        const happeningsText = this.happeningsDocument.getText();
        const happeningsParser = new parser.PlanHappeningsBuilder(this.epsilon);
        happeningsParser.tryParseFile(happeningsText);
        const happenings = happeningsParser.getHappenings();
        let planSteps: PlanStep[] = [];

        happenings.forEach((happening, happeningIndex) => {
            switch (happening.getType()) {
                case HappeningType.INSTANTANEOUS:
                    planSteps.push(new PlanStep(happening.getTime(), happening.getFullActionName(), false, undefined, -1));
                    break;
                case HappeningType.START:
                    const end = this.findEnd(happenings, happening, happeningIndex+1);
                    const duration = end === undefined ? 0 : end.getTime() - happening.getTime();
                    planSteps.push(new PlanStep(happening.getTime(), happening.getFullActionName(), true, duration, -1));
                    break;
            }
        });

        planSteps = planSteps.sort(this.comparePlanSteps);

        const meta = parser.PddlPlanParser.parsePlanMeta(happeningsText);

        return AbstractPlanExporter.getPlanMeta(meta.domainName, meta.problemName)
            + "\n"
            + planSteps.map(step => step.toPddl()).join("\n");
    }

    findEnd(happenings: Happening[], start: Happening, fromIndex: number): Happening | undefined {
        return happenings.slice(fromIndex).find(h => h.belongsTo(start));
    }

    formatTime(time: number): string {
        return Number(time).toFixed(this.decimals);
    }

    comparePlanSteps(h1: PlanStep, h2: PlanStep): number {
        if (h1.getStartTime() > h2.getStartTime()) {
            return 1;
        } else if (h1.getStartTime() < h2.getStartTime()) {
            return -1;
        }

        return 0;
    }
}

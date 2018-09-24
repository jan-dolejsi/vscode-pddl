/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, TextDocumentContentProvider, Event, EventEmitter, CancellationToken, workspace
} from 'vscode';

import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { PlanStep } from '../../../common/src/PlanStep';
import { PddlConfiguration } from '../configuration';

/**
 * Normalizes the plan at that URI and outputs the normal representation so it can be used for diffing. 
 */
export class NormalizedPlanDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
            
    constructor(private configuration: PddlConfiguration) {
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        if (token.isCancellationRequested) return "Canceled";

        let fileUri = uri.with({scheme: 'file'});

        return workspace.openTextDocument(fileUri).then(document => document.getText()).then(documentText=> this.normalize(documentText));
    }

    normalize(origText: string): string {
        return new PlanParserAndNormalizer(this.configuration.getEpsilonTimeStep()).parse(origText);
    }
}

/** Parsers the plan lines, offsets the times (by epsilon, if applicable) and returns the lines normalized. */
class PlanParserAndNormalizer {

    private makespan = 0;
    private timeOffset = 0;
    private firstLineParsed = false;

    constructor(private epsilon: number) {

    }

    parse(origText: string): string {
        let normalizedText = origText.split('\n')
            .map((origLine, idx) => this.normalizeLine(origLine, idx))
            .filter(line => line.length > 0)
            .join('\n');

        return normalizedText;
    }

    normalizeLine(line: string, lineIdx: number): string {
        PddlPlanParser.planStepPattern.lastIndex = 0;
        let group = PddlPlanParser.planStepPattern.exec(line);

        if (!group) {
            return '';
        } else {
            // this line is a plan step
            let time = group[2] ? parseFloat(group[2]) : this.makespan;

            if (!this.firstLineParsed) {
                if (time == 0) {
                    this.timeOffset = -this.epsilon;
                }
                this.firstLineParsed = true;
            }

            let action = group[3];
            let isDurative = group[5] ? true : false;
            let duration = isDurative ? parseFloat(group[5]) : this.epsilon;

            let step = new PlanStep(time - this.timeOffset, action, isDurative, duration, lineIdx);

            return step.toPddl();
        }
    }
}

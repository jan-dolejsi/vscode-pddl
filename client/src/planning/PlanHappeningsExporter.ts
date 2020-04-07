/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    TextDocument, SaveDialogOptions, Uri, window
} from 'vscode';

import { PlanExporter } from './PlanExporter';
import { parser } from 'pddl-workspace';
import { exportToAndShow } from './ExportUtil';

/**
 * Converts plan to happenings while preserving comments.
 */
export class PlanHappeningsExporter {

    decimals: number;

    constructor(private planDocument: TextDocument, private epsilon: number) {
        this.decimals = -Math.log10(epsilon);
        this.computeHappeningsText(this.planDocument.getText());
    }

    public async export(): Promise<void> {
        const defaultPlanHappeningsPath = PlanExporter.replaceExtension(this.planDocument.uri.fsPath, '.happenings');

        const options: SaveDialogOptions = {
            saveLabel: "Save plan happenings as...",
            filters: {
                "Plan Happenings": ["happenings"]
            },

            defaultUri: Uri.file(defaultPlanHappeningsPath)
        };

        try {
            const uri = await window.showSaveDialog(options);
            if (uri === undefined) { return; } // canceled by user

            await exportToAndShow(this.happeningsText, uri);
        } catch (ex) {
            window.showErrorMessage(`Cannot export plan to happenings: ${ex}`);
        }
    }

    comments = '';
    happeningsText = '';
    enqueuedHappenings: Happening[] = [];
    makespan = 0;
    actionCounter: Map<string, number> = new Map();

    computeHappeningsText(planText: string): void {

        planText.split('\n').forEach(line => {
            if (line.match(/^\s*;/)) {
                // comment lines are accumulated and flushed later 
                this.comments += line + '\n';
            }
            else if (line.match(/^\s*$/)) {
                this.comments += '\n';
            }
            else {
                if (this.comments.length) {
                    // flush non-trailing comments
                    this.flushComments();
                }

                const happening = this.parseStepAndEnqueueEnd(line);
                if (happening) {
                    this.flushHappeningsBefore(happening.time);

                    this.outputHappening(happening);
                }
                else {
                    console.log("Error parsing happening: " + line);
                }
            }
        });

        // flush enqueued ends
        this.enqueuedHappenings.forEach(happening => this.outputHappening(happening));
        this.enqueuedHappenings = [];

        // flush trailing comments into the output
        this.flushComments();
    }

    parseStepAndEnqueueEnd(line: string): Happening | null {
        parser.PddlPlannerOutputParser.planStepPattern.lastIndex = 0;
        const group = parser.PddlPlannerOutputParser.planStepPattern.exec(line);

        if (!group) {
            this.happeningsText += `; Warning: line did not parse: ${line}`;
            return null;
        } else {
            // this line is a plan step
            const time = group[2] ? parseFloat(group[2]) : this.makespan;
            const action = group[3];
            const isDurative = group[5] ? true : false;
            const duration = isDurative ? parseFloat(group[5]) : this.epsilon;

            const count = this.getActionCount(action);

            const thisHappening = new Happening(time, action, isDurative ? HappeningType.Start : HappeningType.Instantaneous, count);

            if (isDurative) {
                const endHappening = new Happening(time + duration, action, HappeningType.End, count);
                this.enqueue(endHappening);
            }

            return thisHappening;
        }
    }

    getActionCount(action: string): number {
        let prevCount = -1;
        const actionCount = this.actionCounter.get(action);
        if (actionCount !== undefined){
            prevCount = actionCount;
        }

        const newCount = prevCount +1;
        this.actionCounter.set(action, newCount);
        return newCount;
    }

    enqueue(endHappening: Happening): void {
        this.enqueuedHappenings.push(endHappening);
        this.enqueuedHappenings = this.enqueuedHappenings.sort(this.compareHappenings);
    }

    flushHappeningsBefore(time: number): void {
        while(this.enqueuedHappenings.length > 0 && this.enqueuedHappenings[0].time <= time) {
            this.outputHappening(this.enqueuedHappenings[0]);
            this.enqueuedHappenings.splice(0, 1);
        }
    }

    flushComments(): void {
        this.happeningsText += this.comments;
        this.comments = '';
    }

    outputHappening(happening: Happening): void {
        let happeningQualifier = '';

        switch(happening.type){
            case HappeningType.Start:
                happeningQualifier = "start ";
                break;
            case HappeningType.End:
                happeningQualifier = "end ";
                break;
        }

        let countString = '';
        if(happening.count > 0) {
            countString = ` #${happening.count + 1}`;
        }

        this.happeningsText += `${this.formatTime(happening.time)}: ${happeningQualifier}(${happening.name})${countString}\n`;
    }

    formatTime(time: number): string{
        return Number(time).toFixed(this.decimals);
    }

    compareHappenings(h1: Happening, h2: Happening): number {
        if (h1.time > h2.time) {
            return 1;
        } else if (h1.time < h2.time) {
            return -1;
        }

        return 0;
    }
}

class Happening {
    constructor(public time: number, public name: string, public type: HappeningType, public count: number) {

    }
}

enum HappeningType {
    Start, End, Instantaneous
}
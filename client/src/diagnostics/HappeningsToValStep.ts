/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { HappeningsInfo, Happening, HappeningType } from 'pddl-workspace';
import { utils } from 'pddl-workspace';

export const PDDL_HAPPENINGS_VALIDATE = 'pddl.happenings.validate';

export class HappeningsToValStep {
    durativeActionCounter = 0;
    durativeActionIndex = new Map<string, Number>();
    valStepText: string[] = [];
    makespan = -1;

    convertAllHappenings(happenings: HappeningsInfo) {
        this.convert(happenings.getHappenings());
    }

    convert(happenings: Happening[]): string {
        const newSteps = happenings.map(h => this.happeningToValStep(h));
        const newStepsFlatten = utils.Util.flatMap(newSteps);
        newStepsFlatten.push('x');
        this.valStepText = this.valStepText.concat(newStepsFlatten);
        return newStepsFlatten.join('\n') + '\n';
    }

    getExportedText(andQuit: boolean): string {

        if (andQuit) {
            this.valStepText.push('q');
        }

        return this.valStepText.join('\n') + '\n';
    }

    private happeningToValStep(h: Happening): string[] {
        const newValStepText: string[] = [];

        switch (h.getType()) {
            case HappeningType.START:
            case HappeningType.INSTANTANEOUS:
                this.durativeActionCounter += 1;
                this.durativeActionIndex.set(this.toOrderedActionName(h), this.durativeActionCounter);
                // ? start key_make_up_wellhead_running_tool casingrun1_sec1_well1 sec1_well1 @ 0
                newValStepText.push(`start ${h.getFullActionName()} @ ${h.getTime()}`);
                break;

            case HappeningType.END:
                let index = this.durativeActionIndex.get(this.toOrderedActionName(h));
                // ? end 3 @ 4.001
                newValStepText.push(`end ${index} @ ${h.getTime()}`);
                break;

            default:
                newValStepText.push('; error exporting: ' + h.toString());
                break;
        }

        // update the plan makespan 
        this.makespan = h.getTime();

        return newValStepText;
    }

    toOrderedActionName(h: Happening): string {
        return h.getFullActionName() + '#' + h.getCounter();
    }
}
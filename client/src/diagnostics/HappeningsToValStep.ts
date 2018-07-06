/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { HappeningsInfo, Happening, HappeningType } from "../../../common/src/HappeningsInfo";

export const PDDL_HAPPENINGS_VALIDATE = 'pddl.happenings.validate';

export class HappeningsToValStep {
    durativeActionCounter = 0;
    durativeActionIndex = new Map<string, Number>();
    valStepText: string[] = [];
    makespan = -1;

    convertAllHappenings(happenings: HappeningsInfo) {
        this.convert(happenings.getHappenings());
    }

    convert(happenings: Happening[]) {
        happenings.forEach(h => this.happeningToValStep(h));
        this.valStepText.push('x');
    }

    getExportedText(andQuit: boolean): string {

        if (andQuit) {
            this.valStepText.push('q');
        }

        return this.valStepText.join('\n') + '\n';
    }

    private happeningToValStep(h: Happening): void {
        if (h.getTime() > this.makespan && this.makespan >= 0) {
            this.valStepText.push('x');
        }

        switch (h.getType()) {
            case HappeningType.START:
            case HappeningType.INSTANTANEOUS:
                this.durativeActionCounter += 1;
                this.durativeActionIndex.set(this.toOrderedActionName(h), this.durativeActionCounter);
                // ? start key_make_up_wellhead_running_tool casingrun1_sec1_well1 sec1_well1 @ 0
                this.valStepText.push(`start ${h.getFullActionName()} @ ${h.getTime()}`);
                break;

            case HappeningType.END:
                let index = this.durativeActionIndex.get(this.toOrderedActionName(h));
                // ? end 3 @ 4.001
                this.valStepText.push(`end ${index} @ ${h.getTime()}`);
                break;

            default:
                this.valStepText.push('; error exporting: ' + h.toString());
                break;
        }

        // update the plan makespan 
        this.makespan = h.getTime();
    }

    toOrderedActionName(h: Happening): string {
        return h.getFullActionName() + '#' + h.getCounter();
    }
}
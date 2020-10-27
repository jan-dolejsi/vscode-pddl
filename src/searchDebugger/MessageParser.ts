/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { StateResolver } from "./StateResolver";
import { SearchHappening } from "./SearchHappening";
import { HappeningType } from 'pddl-workspace';
import { HelpfulAction } from 'pddl-workspace';

export class MessageParser {

    private lastStateOrder = -1;
    private stateIdToOrder = new Map<string, number>();

    constructor(private readonly search: StateResolver, private readonly stateIdPattern: RegExp) {

    }

    clear(): void {
        this.stateIdToOrder.clear();
        this.lastStateOrder = -1;
    }

    parseStateId(origId: string): number {
        let assignedStateId: number;
        if (this.stateIdPattern) {
            this.stateIdPattern.lastIndex = 0;
            let match: RegExpMatchArray | null;
            if (match = origId.match(this.stateIdPattern)) {
                assignedStateId = parseInt(match[1]);
            }
            else {
                console.log("State ID does not conform to the pattern. Assigning own ID.");
                assignedStateId = ++this.lastStateOrder;
            }
        }
        else {
            assignedStateId = ++this.lastStateOrder;
        }
        this.stateIdToOrder.set(origId, assignedStateId);
        return assignedStateId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseInitialState(state: any): State {
        const assignedStateId = this.parseStateId(state.id);
        this.stateIdToOrder.set(state.id, assignedStateId);

        return new State(assignedStateId, state.id, state.g, state.earliestTime, []);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseState(state: any): State {
        let assignedStateId = this.stateIdToOrder.get(state.id);
        if (assignedStateId === undefined) {
            assignedStateId = this.parseStateId(state.id);
        }
        const parentId = this.stateIdToOrder.get(state.parentId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const planHead = state.planHead.map((h: any) => this.parseSearchHappening(h, false));

        const actionName = state.appliedAction ? this.createActionName(this.parseSearchHappening(state.appliedAction, false)) : undefined;

        return new State(assignedStateId, state.id, state.g, state.earliestTime, planHead,
            parentId, actionName);
    }

    createActionName(lastHappening: SearchHappening): string {
        let actionName = lastHappening.actionName;
        if (lastHappening.shotCounter > 0) {
            actionName += `[${lastHappening.shotCounter}]`;
        }
        switch (lastHappening.kind) {
            case HappeningType.START:
                actionName += '├';
                break;
            case HappeningType.END:
                actionName += ' ┤';
                break;
        }

        if (lastHappening.iterations > 1) {
            actionName += ` ${lastHappening.iterations}x`;
        }

        return actionName;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseEvaluatedState(state: any): State {
        const assignedStateId = this.stateIdToOrder.get(state.id);
        if (assignedStateId === undefined) {
            throw new Error(`State with id ${state.id} is unknown`);
        }
        const stateFound = this.search.getState(assignedStateId);
        if (!stateFound) {
            throw new Error(`State with id ${state.id} not found.`);
        }

        if (!state.hasOwnProperty('h')) {
            return stateFound.setDeadEnd();
        }
        else {

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relaxedPlan = state.relaxedPlan.map((h: any) => this.parseSearchHappening(h, true));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const helpfulActions = state.helpfulActions.map((a: any) => this.parseHelpfulAction(a));

            return stateFound.evaluate(state.h, state.totalMakespan, helpfulActions, relaxedPlan);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseSearchHappening(happening: any, isRelaxed: boolean): SearchHappening {
        return {
            actionName: happening.actionName,
            earliestTime: happening.earliestTime,
            shotCounter: happening.shotCounter,
            iterations: happening.iterations,
            kind: this.parseHappeningType(happening.kind),
            isRelaxed: isRelaxed
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseHelpfulAction(action: any): HelpfulAction {
        return {
            actionName: action.actionName,
            kind: this.parseHappeningType(action.kind)
        };
    }

    parseHappeningType(happeningTypeAsString: string): HappeningType {
        switch (happeningTypeAsString) {
            case HappeningType[HappeningType.END]:
                return HappeningType.END;
            case HappeningType[HappeningType.INSTANTANEOUS]:
                return HappeningType.INSTANTANEOUS;
            case HappeningType[HappeningType.START]:
                return HappeningType.START;
            case HappeningType[HappeningType.TIMED]:
                return HappeningType.TIMED;
            default:
                throw new Error("Unexpected happening type: " + happeningTypeAsString);
        }
    }
}
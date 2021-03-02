/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { search } from "pddl-workspace";
import { EventEmitter, Event } from "vscode";
import { StateResolver } from "./StateResolver";

/** Represents the running/completed search and notifies when new states are added or evaluated. */
export class Search implements StateResolver {
    private _onStateAdded: EventEmitter<search.SearchState> = new EventEmitter<search.SearchState>();
    private _onStateUpdated: EventEmitter<search.SearchState> = new EventEmitter<search.SearchState>();
    private _onBetterState: EventEmitter<search.SearchState> = new EventEmitter<search.SearchState>();
    private _onPlanFound: EventEmitter<search.SearchState[]> = new EventEmitter<search.SearchState[]>();

    private states = new Map<number, search.SearchState>();
    private bestStateHeuristic = Number.MAX_VALUE;

    clear(): void {
        this.states.clear();
        this.bestStateHeuristic = Number.MAX_VALUE;
    }

    get onStateAdded(): Event<search.SearchState> {
        return this._onStateAdded.event;
    }

    get onStateUpdated(): Event<search.SearchState> {
        return this._onStateUpdated.event;
    }

    get onBetterState(): Event<search.SearchState> {
        return this._onBetterState.event;
    }

    get onPlanFound(): Event<search.SearchState[]> {
        return this._onPlanFound.event;
    }

    addInitialState(state: search.SearchState): void {
        console.log('Added initial: ' + state);
        this.states.set(state.id, state);
        this._onStateAdded.fire(state);
    }

    addState(state: search.SearchState): void {
        if (this.states.has(state.id)) {
            // todo: this may need modifications to align with state ordering and memoisation
            console.log('Ignoring: ' + state);
        }
        else {
            console.log('Added: ' + state);
            this.states.set(state.id, state);
            this._onStateAdded.fire(state);
        }
    }

    update(state: search.SearchState): void {
        console.log('Updated: ' + state);
        this.states.set(state.id, state);
        this._onStateUpdated.fire(state);

        if (state.isEvaluated && !state.isDeadEnd && state.h && (state.h < this.bestStateHeuristic)) {
            this.bestStateHeuristic = state.h;
            this._onBetterState.fire(state);
        }
    }

    showPlan(goalState: search.SearchState): void {
        const plan: search.SearchState[] = [];
        let state: search.SearchState | undefined = goalState;
        while(state !== undefined) {
            state.isPlan = true;
            plan.push(state);
            state = state.parentId !== undefined ? this.states.get(state.parentId) : undefined;
        }
        this._onPlanFound.fire(plan);
        // goal state is better than previous state, because we assume H==0
        this._onBetterState.fire(goalState);
    }

    setPlan(state: search.SearchState): void {
        console.log('Plan found: ' + state);
        const goalState = state.evaluate(0, state.earliestTime, [], []);

        this.update(goalState);
        this.showPlan(goalState);
    }

    getState(stateId: number): search.SearchState | undefined {
        return this.states.get(stateId);
    }

    getStates(): search.SearchState[] {
        return [...this.states.values()];
    }
}
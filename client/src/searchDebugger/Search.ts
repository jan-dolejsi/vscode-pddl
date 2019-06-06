/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { EventEmitter, Event } from "vscode";
import { StateResolver } from "./StateResolver";

/** Represents the running/completed search and notifies when new states are added or evaluated. */
export class Search implements StateResolver {
    private _onStateAdded: EventEmitter<State> = new EventEmitter<State>();
    private _onStateUpdated: EventEmitter<State> = new EventEmitter<State>();
    private _onBetterState: EventEmitter<State> = new EventEmitter<State>();
    private _onPlanFound: EventEmitter<State[]> = new EventEmitter<State[]>();

    private states = new Map<number, State>();
    private bestStateHeuristic = Number.MAX_VALUE;

    clear() {
        this.states.clear();
        this.bestStateHeuristic = Number.MAX_VALUE;
    }

    get onStateAdded(): Event<State> {
        return this._onStateAdded.event;
    }

    get onStateUpdated(): Event<State> {
        return this._onStateUpdated.event;
    }

    get onBetterState(): Event<State> {
        return this._onBetterState.event;
    }

    get onPlanFound(): Event<State[]> {
        return this._onPlanFound.event;
    }

    addInitialState(state: State) {
        console.log('Added initial: ' + state);
        this.states.set(state.id, state);
        this._onStateAdded.fire(state);
    }

    addState(state: State) {
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

    update(state: State): void {
        console.log('Updated: ' + state);
        this.states.set(state.id, state);
        this._onStateUpdated.fire(state);

        if (Number.isFinite(state.h) && state.h < this.bestStateHeuristic) {
            this.bestStateHeuristic = state.h;
            this._onBetterState.fire(state);
        }
    }

    showPlan(goalState: State): void {
        let plan: State[] = [];
        var state = goalState;
        while(state !== null) {
            state.isPlan = true;
            plan.push(state);
            state = state.parentId !== undefined ? this.states.get(state.parentId) : null;
        }
        this._onPlanFound.fire(plan);
    }

    setPlan(state: State) {
        console.log('Plan found: ' + state);
        let goalState = state.evaluate(0, state.earliestTime, [], []);

        this.update(goalState);
        this.showPlan(goalState);
    }

    getState(stateId: number): State {
        return this.states.get(stateId);
    }

    getStates(): State[] {
        return [...this.states.values()];
    }
}
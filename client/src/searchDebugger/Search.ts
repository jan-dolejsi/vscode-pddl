/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { EventEmitter, Event } from "vscode";
import { StateResolver } from "./StateResolver";

export class Search implements StateResolver {
    private _onStateAdded: EventEmitter<State> = new EventEmitter<State>();
    private _onStateUpdated: EventEmitter<State> = new EventEmitter<State>();
    private _onBetterState: EventEmitter<State> = new EventEmitter<State>();

    private states = new Map<number, State>();
    private bestStateHeuristic = Number.MAX_VALUE;

    get onStateAdded(): Event<State> {
        return this._onStateAdded.event;
    }

    get onStateUpdated(): Event<State> {
        return this._onStateUpdated.event;
    }

    get onBetterState(): Event<State> {
        return this._onBetterState.event;
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

    update(state: State) {
        console.log('Updated: ' + state);
        this.states.set(state.id, state);
        this._onStateUpdated.fire(state);

        if (Number.isFinite(state.h) && state.h < this.bestStateHeuristic) {
            this.bestStateHeuristic = state.h;
            this._onBetterState.fire(state);
        }
    }

    getState(stateId: number): State {
        return this.states.get(stateId);
    }
}
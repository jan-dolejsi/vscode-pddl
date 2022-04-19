/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { search } from "pddl-workspace";
import { Event } from "vscode";

/** Interface for the search tracker. */
export interface StateResolver {
    /** Event fired when a new state is encountered. */
    onStateAdded: Event<search.SearchState>;

    /** Event fired when a state is updated (i.e. evaluated). */
    onStateUpdated: Event<search.SearchState>;

    /** Event fired when a better state is found. */
    onBetterState: Event<search.SearchState>;

    /** Event fired when a state is found that reaches the goal of the planning problem. */
    onPlanFound: Event<search.SearchState[]>;

    /**
     * Gets search state with given `stateId`.
     * @param stateId state ID to resolve; or `undefined` if not found.
     */
    getState(stateId: number): search.SearchState | undefined;

    /**
     * @returns all states found
     */
    getStates(): search.SearchState[];
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { search } from "pddl-workspace";
import { Event } from "vscode";

export interface StateResolver {
    onStateAdded: Event<search.SearchState>;

    onStateUpdated: Event<search.SearchState>;

    onBetterState: Event<search.SearchState>;

    onPlanFound: Event<search.SearchState[]>;

    getState(stateId: number): search.SearchState | undefined;

    getStates(): search.SearchState[];
}
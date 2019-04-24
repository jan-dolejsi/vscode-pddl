/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { State } from "./State";
import { Event } from "vscode";

export interface StateResolver {
    onStateAdded: Event<State>;

    onStateUpdated: Event<State>;

    onBetterState: Event<State>;

    getState(stateId: number): State;
}
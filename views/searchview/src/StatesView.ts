/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { State } from './utils';

export interface StatesView {
    addState(state: State): void;
    clear(): void;
}
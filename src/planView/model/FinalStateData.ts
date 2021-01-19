/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { VariableValue } from "pddl-workspace";

/** Final plan state data for state custom visualization. */
export interface FinalStateData {
    /** Plan index in the web view. */
    planIndex: number;
    
    finalState: VariableValue[];
}
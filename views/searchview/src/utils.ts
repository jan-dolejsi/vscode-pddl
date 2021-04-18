/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

// eslint-disable @typescript-eslint/class-name-casing

export function getElementByIdOrThrow(elementId: string): HTMLElement {
    const el = document.getElementById(elementId);
    if (!el) {
        throw new Error(`HTML document does not contain element with ID=${elementId}`);
    }
    return el;
}


export interface State {
    /* state ID */
    id: number;
    /* original state ID (as received from the planner) */
    origId: string;
    /* parent state ID, or `undefined` */
    parentId?: number;
    /* generation */
    g: number;
    /* action that created this state, or `undefined` for the initial state */
    actionName: string | undefined;
    /* heuristic value of the state */
    h?: number;
    /* earliest time this state can be scheduled */
    earliestTime: number;
    /* landmark facts satisfied up to and by this state */
    landmarks: number | undefined;
    /* makespan of the hypotetical plan that concatenates the planhead of this state and its relaxed plan */
    totalMakespan?: number;
    /* state is dead end (goal cannot be reached) */
    isDeadEnd?: boolean;
    /* state reaches the goal condition */
    isGoal?: boolean;
    /* state on goal path */
    isPlan?: boolean;
    /* state was previously visited in the search, or other state(s) dominate it */
    wasVisitedOrIsWorse?: boolean;
    /* helpful actions */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    helpfulActions?: any;
}
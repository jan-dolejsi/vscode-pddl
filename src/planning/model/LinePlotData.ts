/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/** Plan line plot data */
export interface LinePlotData {
    /** Plan index in the web view. */
    planIndex: number,
    /** Line plot name */
    name: string,
    /** Unit of measure */
    unit: string,
    /** Legend string for each series (should correspond to the number of data series) */
    legend: string[],
    data: number[][],
}
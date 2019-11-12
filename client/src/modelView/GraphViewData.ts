/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export interface GraphViewData {
    nodes: NetworkNode[];
    relationships: NetworkEdge[];
}

export interface NetworkNode {
    id: number;
    label: string;
    shape?: string;
}

export interface NetworkEdge {
    from: number;
    to: number;
    label?: string;
} 

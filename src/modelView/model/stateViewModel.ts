/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { Plan, VariableValue } from 'pddl-workspace';
import { } from 'vscode';
import { GraphViewData } from './GraphViewData';

/** Schema for data being passed to the view for display. */
export interface ProblemInitViewData {
    symmetricRelationshipGraph: GraphViewData;
    typeProperties: Map<string, TypeProperties>;
    typeRelationships: TypesRelationship[];
    scalarValues: Map<string, number | boolean>;
    customVisualization: CustomViewData | undefined;
}

export interface TypeProperties {
    propertyNames: string[];
    objects: Map<string, Map<string, number | boolean | undefined>>;
}

export interface TypesRelationship {
    types: Map<string, string[]>;
    relationships: Map<string, RelationshipValue[]>;
}

export interface RelationshipValue {
    parameters: Map<string, string>;
    value?: boolean | number;
}

/** Custom state visualization data and view logic. */
export interface CustomViewData {
    /** In this case, it is a dummy plan, which serves as a container for the domain and problem objects. */
    plan: Plan;
    state: VariableValue[];
    /** Javascript, which exports the `CustomVisualization` interface. */
    customVisualizationScript?: string;
    displayWidth: number;
}

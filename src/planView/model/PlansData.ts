/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { DomainVizConfigurationSchema } from 'pddl-gantt';
import { Plan } from 'pddl-workspace';

interface VisualizationConfiguration {

    /** Width in pixels. */
    width: number;
    
    /** Domain visualization configuration. */
    domainVisualizationConfiguration?: DomainVizConfigurationSchema;
    
    /** Plan/state visualization script. */
    customDomainVisualizationScript?: string;
}


export interface PlansData extends VisualizationConfiguration {
    /** Plans to display */
    plans: Plan[];
}

export interface PlanData extends VisualizationConfiguration {
    /** Plan to display */
    plan: Plan;
}
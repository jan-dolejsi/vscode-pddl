/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2021. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { Plan } from 'pddl-workspace';

export interface PlansData {
    /** Plans to display */
    plans: Plan[];

    /** Width in pixels. */
    width: number;
    
    /** Domain visualization configuration. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    domainVisualizationConfiguration?: any;
    
    /** Plan visualization script. */
    planVisualizationScript?: string;
}
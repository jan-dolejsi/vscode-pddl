/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { HappeningsInfo } from 'pddl-workspace';

/**
 * Files involved in the debugging session.
 */
export interface DebuggingSessionFiles {
	domain: DomainInfo;
	problem: ProblemInfo;
	happenings: HappeningsInfo;
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    ExtensionContext} from 'vscode';

import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';

export interface ProblemRenderer<TOptions, TData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: TOptions): TData;
}
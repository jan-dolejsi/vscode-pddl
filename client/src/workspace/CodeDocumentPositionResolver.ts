/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument } from 'vscode';
import { DocumentPositionResolver, PddlPosition } from '../../../common/src/DocumentPositionResolver';

export class CodeDocumentPositionResolver implements DocumentPositionResolver {
    constructor(private readonly document: TextDocument) {

    }
    
    resolveToPosition(offset: number): PddlPosition {
        return this.document.positionAt(offset);
    }

}
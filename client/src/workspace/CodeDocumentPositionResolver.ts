/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument } from 'vscode';
import { DocumentPositionResolver, PddlPosition } from 'pddl-workspace';

export class CodeDocumentPositionResolver extends DocumentPositionResolver {
    constructor(private readonly document: TextDocument) {
        super();
    }
    
    resolveToPosition(offset: number): PddlPosition {
        let documentPosition = this.document.positionAt(offset);
        return new PddlPosition(documentPosition.line, documentPosition.character);
    }

}
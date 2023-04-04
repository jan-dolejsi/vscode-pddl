/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Position, TextDocument } from 'vscode';
import { DocumentPositionResolver, PddlPosition } from 'pddl-workspace';

export class CodeDocumentPositionResolver extends DocumentPositionResolver {
    constructor(private readonly document: TextDocument) {
        super();
    }

    resolveToOffset(position: PddlPosition): number {
        return this.document.offsetAt(new Position(position.line, position.character));
    }

    resolveToPosition(offset: number): PddlPosition {
        const documentPosition = this.document.positionAt(offset);
        return new PddlPosition(documentPosition.line, documentPosition.character);
    }

}
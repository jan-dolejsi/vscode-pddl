/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export interface DocumentPositionResolver {
    resolveToPosition(offset: number): PddlPosition;
}

export class SimpleDocumentPositionResolver implements DocumentPositionResolver {
    private readonly lineLengths: number[];
    
    constructor(readonly documentText: string) {
        this.lineLengths = this.documentText.split('\n')
            .map(line => line.length + 1);
    }

    resolveToPosition(offset: number): PddlPosition {
        let documentLengthAtCurrentLineStart = 0;
        let documentLengthAtCurrentLineEnd = 0;
        for (let lineIndex = 0; lineIndex < this.lineLengths.length; lineIndex++) {
            const currentLineLength = this.lineLengths[lineIndex];
            documentLengthAtCurrentLineEnd += currentLineLength;
            
            if (offset >= documentLengthAtCurrentLineStart && offset < documentLengthAtCurrentLineEnd) {
                let character = offset - documentLengthAtCurrentLineStart;
                return new PddlPosition(lineIndex, character);
            }

            documentLengthAtCurrentLineStart = documentLengthAtCurrentLineEnd;
        }

        throw new Error(`Offset ${offset} is outside the document.`);
    }
}

export class PddlPosition {
    constructor(public readonly line: number, public readonly character: number) {
    }
}

/**
 * This is a local version of the vscode Range class, but because the parser is used in both the extension (client)
 * and the language server, where the Range class is defined separately, we need a single proprietary implementation,
 * which is converted to the VS Code class specific to the two distinct client/server environment. 
 */
export class PddlRange {
    constructor(public readonly startLine: number, public readonly startCharacter: number,
        public readonly endLine: number, public readonly endCharacter: number) {

    }

    static from(start: PddlPosition, end: PddlPosition): PddlRange {
        return new PddlRange(start.line, start.character, end.line, end.character);
    }
}

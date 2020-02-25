/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PddlSyntaxNode } from "./PddlSyntaxNode";

/**
 * Abstract document position resolve. It translates document text offsets to Position or Range.
 */
export abstract class DocumentPositionResolver {
    abstract resolveToPosition(offset: number): PddlPosition;
    
    resolveToRange(start: number, end: number): PddlRange {
        return PddlRange.from(this.resolveToPosition(start), this.resolveToPosition(end));
    }

    rangeIncludesOffset(range: PddlRange, offset: number): boolean {
        let positionAtOffset = this.resolveToPosition(offset);

        return range.includes(positionAtOffset); 
    }

    nodeToRange(node: PddlSyntaxNode): PddlRange {
        return this.resolveToRange(node.getStart(), node.getEnd());
    }
}

export class SimpleDocumentPositionResolver extends DocumentPositionResolver {
    private readonly lineLengths: number[];

    constructor(readonly documentText: string) {
        super();
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

    atOrBefore(other: PddlPosition): boolean {
        if (this.line === other.line) {
            return this.character <= other.character;
        }
        else {
            return this.line < other.line;
        }
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

    includes(positionAtOffset: PddlPosition): boolean {
        return this.start.atOrBefore(positionAtOffset) && positionAtOffset.atOrBefore(this.end);
    }

    get start(): PddlPosition {
        return new PddlPosition(this.startLine, this.startCharacter);
    }
    
    get end(): PddlPosition {
        return new PddlPosition(this.endLine, this.endCharacter);
    }
}

/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

/** Tokenizes PDDL documents. */
export class PddlTokenizer {

    /**
     * Starts tokenizing.
     * @param pddlText input PDDL text
     * @param callback callback to call when a new token is encountered
     * @param lastIndexOfInterest last index of interest or `undefined` to parse the entire document
     */
    constructor(pddlText: string, callback: (token: PddlToken) => void, lastIndexOfInterest?: number) {
        let pddlPattern = /\(\s*(:\w[\w-]*|[-\/+*]|[><]=?|define|domain|problem|and|or|not|at start|at end|over all|at|=|assign|increase|decrease|always|sometime|forall|exists|when|within|at-most-once|sometime-before|always-within|supply-demand)(?!-)|\(|:[\w-]+|\(|\)|;|\?\w[\w-]*|[-+]?[0-9]*\.?[0-9]+|-|#t|\w[\w-]*|[\s]+/g;
        let endOfLinePattern = /(\n|\r\n)/g;
        let endOfLastToken = 0;
        
        lastIndexOfInterest = lastIndexOfInterest === undefined ? Number.MAX_SAFE_INTEGER : lastIndexOfInterest;

        let match: RegExpExecArray;
        while(match = pddlPattern.exec(pddlText)) {
            if (match.index > endOfLastToken) {
                callback(new PddlToken(PddlTokenType.Other, pddlText.substring(endOfLastToken, match.index), endOfLastToken));
            }
            let commentLength = 0;
            if (match[0] === '-') {
                callback(PddlToken.from(PddlTokenType.Dash, match));
            } 
            else if (match[0] === '(') {
                callback(PddlToken.from(PddlTokenType.OpenBracket, match));
            }
            else if (match[0].startsWith('(')) {
                callback(PddlToken.from(PddlTokenType.OpenBracketOperator, match));
            }
            else if (match[0].match(/^\)$/)) {
                callback(PddlToken.from(PddlTokenType.CloseBracket, match));
            }
            else if (match[0].match(/\?\w[\w-]*$/)) {
                callback(PddlToken.from(PddlTokenType.Parameter, match));
            }
            else if (match[0].match(/^:[\w-]+$/)) {
                callback(PddlToken.from(PddlTokenType.Keyword, match));
            }
            else if (match[0].startsWith(';')) {
                // this is where a comment starts
                endOfLinePattern.lastIndex = match.index+1;
                let endOfLineMatch = endOfLinePattern.exec(pddlText);
                if (endOfLineMatch) {
                    // end of line found
                    commentLength = endOfLineMatch.index - match.index;
                }
                else {
                    // the file(!) ends on this comment line
                    commentLength = pddlText.length - match.index;
                }

                // extract the comment text
                let comment = pddlText.substr(match.index, commentLength);
                callback(new PddlToken(PddlTokenType.Comment, comment, match.index));
                pddlPattern.lastIndex = match.index + commentLength;
            }
            else if (match[0].match(/^[\s]+$/)) {
                // this is whitespace
                callback(PddlToken.from(PddlTokenType.Whitespace, match));
            }
            else {
                callback(PddlToken.from(PddlTokenType.Other, match));
            }

            endOfLastToken = match.index + match[0].length + 
                (commentLength ? commentLength-1 : 0);

            if (pddlPattern.lastIndex > lastIndexOfInterest) {
                break;
            }
        }
    }
}

export abstract class TextRange {

    /** Index of first character of the token. */
    abstract getStart(): number;
    /** Index in the document text just after the last character of the token. */
    abstract getEnd(): number;

    includesIndex(symbolIndex: number): boolean {
        if (symbolIndex < this.getStart()) { return false; }
        
        if (this.getEnd() === undefined) { 
            return true; 
        }
        else {
            return symbolIndex <= this.getEnd();
        }
    }
}

/** PDDL syntax token. */
export class PddlToken extends TextRange {
    /** Index in the document text just after the last character of the token. */
    private readonly end: number;

    /**
     * Constructs.
     * @param type token type
     * @param tokenText token content
     * @param start first character of the token
     */
    constructor(public readonly type: PddlTokenType, public readonly tokenText: string, 
        private readonly start: number) {
            super();
            this.end = start + tokenText.length;
    }

    /**
     * Creates token from a regex match result.
     * @param type token type
     * @param match regex match
     */
    static from(type: PddlTokenType, match: RegExpExecArray): PddlToken {
        return new PddlToken(type, match[0], match.index);
    }

    getStart(): number {
        return this.start;
    }

    getEnd(): number {
        return this.end;
    }

    toString(): string {
        return `PddlToken{type: ${this.type}, text: '${this.tokenText}', range: ${this.start}~${this.end}}`;
    }
}

export enum PddlTokenType {
    /** Open bracket with the operator name, e.g. `(+` or `(:action` or `(increase` */
    OpenBracketOperator = "OPEN_BRACKET_OPERATOR",
    /** Open bracket `(` */
    OpenBracket = "OPEN_BRACKET",
    /** Close bracket `)` */
    CloseBracket = "CLOSE_BRACKET",
    /** Keyword e.g. `:parameters` or `:effect` */
    Keyword = "KEYWORD",
    /** Dash character. */
    Dash = "DASH",
    /** Parameter name e.g. `?p1`. */
    Parameter = "PARAMETER",
    /** Vertical or horizontal whitespace. */
    Whitespace = "WHITESPACE",
    /** Other unclassified token. */
    Other = "OTHER",
    /** Comment i.e. anything after `;`, including the semicolon */
    Comment = "COMMENT",
    /** Document is the root node type. */
    Document = "DOCUMENT"
}

export function isOpenBracket(token: PddlToken): boolean {
    return token.type === PddlTokenType.OpenBracketOperator || token.type === PddlTokenType.OpenBracket;
}
/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

/**
 * An abstract PDDL file.
 */

export abstract class FileInfo {
    private text: string;
    private status: FileStatus = FileStatus.Parsed;
    private parsingProblems: ParsingProblem[] = [];

    constructor(public fileUri: string, public version: number, public name: string) {
    }

    abstract getLanguage(): PddlLanguage;

    getText(): string {
        return this.text;
    }

    setText(text: string): void {
        this.text = text;
    }

    isDomain(): boolean {
        return false;
    }
    isProblem(): boolean {
        return false;
    }
    isUnknownPddl(): boolean {
        return false;
    }
    isPlan(): boolean {
        return false;
    }
    isHappenings(): boolean {
        return false;
    }

    update(version: number, text: string): boolean {
        let isNewerVersion = version > this.version;
        if (isNewerVersion) {
            this.setStatus(FileStatus.Dirty);
            this.version = version;
            this.text = text;
        }
        return isNewerVersion;
    }

    setStatus(status: FileStatus): void {
        this.status = status;
    }

    getStatus(): FileStatus {
        return this.status;
    }

    /**
     * Adds a parsing problem.
     * @param parsingProblem parsing problems
     */
    addProblem(parsingProblem: ParsingProblem): void {
        this.parsingProblems.push(parsingProblem);
    }

    /**
     * Adds list of parsing problems.
     * @param parsingProblems parsing problems
     */
    addProblems(parsingProblems: ParsingProblem[]): void {
        this.parsingProblems = parsingProblems;
    }

    getParsingProblems(): ParsingProblem[] {
        return this.parsingProblems;
    }

    getVariableReferences(variable: Variable): PddlRange[] {
        let referenceLocations: PddlRange[] = [];

        this.findVariableReferences(variable, (location) => {
            referenceLocations.push(location);
            return true; // continue searching
        });

        return referenceLocations;
    }

    getTypeReferences(typeName: string): PddlRange[] {
        let referenceLocations: PddlRange[] = [];

        let pattern = `-\\s+${typeName}\\b`;

        let lines = stripComments(this.text).split('\n');

        let regexp = new RegExp(pattern, "gi");
        for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];
            regexp.lastIndex = 0;
            let match = regexp.exec(line);
            if (match) {
                let range = new PddlRange(lineIdx, match.index + 2, lineIdx, match.index + match[0].length);
                referenceLocations.push(range);
            }
        }

        return referenceLocations;
    }

    protected findVariableReferences(variable: Variable, callback: (location: PddlRange, line: string) => boolean): void {
        let lines = this.text.split('\n');
        let pattern = "\\(\\s*" + variable.name + "( [^\\)]*)?\\)";
        let regexp = new RegExp(pattern, "gi");
        for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];
            regexp.lastIndex = 0;
            let commentStartColumn = line.indexOf(';');
            let match = regexp.exec(line);
            if (match) {
                if (commentStartColumn > -1 && match.index > commentStartColumn) continue;

                let range = new PddlRange(lineIdx, match.index, lineIdx, match.index + match[0].length);
                let shouldContinue = callback.apply(this, [range, line]);

                if (!shouldContinue) return;
            }
        }
    }
}

/**
 * Parsing problem.
 */
export class ParsingProblem {
    /**
     * Constructs parsing problem.
     * @param problem problem description to display
     * @param lineIndex zero-based line index, where this problem was found.
     * @param columnIndex zero-based column index, where this problem was found. Default is zero.
     */
    constructor(public problem: string, public lineIndex: number, public columnIndex: number = 0) { }
}

/**
 * This is a local version of the vscode Range class, but because the parser is used in both the extension (client)
 * and the language server, where the Range class is defined separately, we need a single proprietary implementation,
 * which is converted to the VS Code class specific to the two distinct client/server environment. 
 */
export class PddlRange {
    constructor(public startLine: number, public startCharacter: number, public endLine: number, public endCharacter: number) { }
}

export enum PddlLanguage {
    // domain or problem
    PDDL,
    // plan (output of the planner)
    PLAN,
    // plan happenings sequence (instantaneous happenings)
    HAPPENINGS
}

/**
 * Status of the file parsing.
 */
export enum FileStatus { Parsed, Dirty, Validating, Validated }

/**
 * State variable.
 */
export class Variable {
    name: string;
    declaredNameWithoutTypes: string;
    location: PddlRange = null; // initialized lazily
    private documentation = ''; // initialized lazily
    private unit = ''; // initialized lazily

    constructor(public declaredName: string, public parameters: Term[] = []) {
        this.declaredNameWithoutTypes = declaredName.replace(/\s+-\s+[\w-_]+/gi, '');
        this.name = declaredName.replace(/( .*)$/gi, '');
    }

    bind(objects: ObjectInstance[]): Variable {
        if (this.parameters.length != objects.length) {
            throw new Error(`Invalid objects ${objects} for function ${this.getFullName()} parameters ${this.parameters}.`);
        }
        return new Variable(this.name, objects);
    }

    getFullName(): string {
        return this.name + this.parameters.map(par => " " + par.toPddlString()).join('');
    }

    isGrounded(): boolean {
        return this.parameters.every(parameter => parameter.isGrounded());
    }

    setDocumentation(documentation: string): void {
        this.documentation = documentation;
        let match = documentation.match(/\[([^\]]*)\]/);
        if (match) {
            this.unit = match[1];
        }
    }

    getDocumentation(): string {
        return this.documentation;
    }

    getUnit(): string {
        return this.unit;
    }
}

export function stripComments(pddlText: string): string {
    let lines = pddlText.split(/\r?\n/g);

    for (var i = 0; i < lines.length; i++) {
        let line = lines[i];
        let index = line.indexOf(';');
        if (index > -1) {
            lines[i] = line.substring(0, index);
        }
    }

    return lines.join("\n");
}


export abstract class Term {
    constructor(public type: string) { }

    abstract toPddlString(): string;

    abstract isGrounded(): boolean;
}

export class Parameter extends Term {
    constructor(public name: string, type: string) {
        super(type);
    }

    toPddlString(): string {
        return `?${this.name} - ${this.type}`;
    }

    isGrounded() { return false; }
}

export class ObjectInstance extends Term {
    constructor(public name: string, type: string) {
        super(type);
    }

    toPddlString(): string {
        return this.name;
    }

    isGrounded() { return true; }
}

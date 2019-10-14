/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlRange, DocumentPositionResolver } from "./DocumentPositionResolver";
import { PddlSyntaxNode } from "./PddlSyntaxNode";

/**
 * An abstract PDDL file.
 */
export abstract class FileInfo {
    private text: string;
    private status: FileStatus = FileStatus.Parsed;
    private parsingProblems: ParsingProblem[] = [];
    private requirements: string[];

    constructor(public readonly fileUri: string, private version: number, public readonly name: string, private readonly positionResolver: DocumentPositionResolver) {
    }

    abstract getLanguage(): PddlLanguage;

    getVersion(): number {
        return this.version;
    }

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

    update(version: number, text: string, force: boolean = false): boolean {
        let isNewerVersion = version > this.version || force;
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

    getVariableReferences(_variable: Variable): PddlRange[] {
        return [];
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

    protected getRange(node: PddlSyntaxNode): PddlRange {
        return this.positionResolver.resolveToRange(node.getStart(), node.getEnd());
    }

    setRequirements(requirements: string[]) {
        this.requirements = requirements;
    }

    getRequirements(): string[] {
        return this.requirements;
    }

    getDocumentPositionResolver(): DocumentPositionResolver {
        return this.positionResolver;
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
    readonly name: string;
    readonly declaredNameWithoutTypes: string;
    private location: PddlRange = null; // initialized lazily
    private documentation: string[] = []; // initialized lazily
    private unit = ''; // initialized lazily

    constructor(public readonly declaredName: string, public readonly parameters: Term[] = []) {
        this.declaredNameWithoutTypes = declaredName.replace(/\s+-\s+[\w-_]+/gi, '');
        this.name = declaredName.replace(/( .*)$/gi, '');
    }

    bind(objects: ObjectInstance[]): Variable {
        const objectNames = objects.map(o => o.name).join(" ");
        if (this.parameters.length !== objects.length) {
            throw new Error(`Invalid objects '${objectNames}' for function '${this.getFullName()}' with ${this.parameters.length} parameters.`);
        }
        let fullName = this.name;
        if (objects) { fullName += " " + objectNames; }
        return new Variable(fullName, objects);
    }

    getFullName(): string {
        return this.name + this.parameters.map(par => " " + par.toPddlString()).join('');
    }

    matchesShortNameCaseInsensitive(symbolName: string): boolean {
        return this.name.toLowerCase() === symbolName.toLowerCase();
    }

    isGrounded(): boolean {
        return this.parameters.every(parameter => parameter.isGrounded());
    }

    setDocumentation(documentation: string[]): void {
        this.documentation = documentation;
        let match = documentation.join('\n').match(/\[([^\]]*)\]/);
        if (match) {
            this.unit = match[1];
        }
    }

    getDocumentation(): string[] {
        return this.documentation;
    }

    getUnit(): string {
        return this.unit;
    }

    setLocation(range: PddlRange): void {
        this.location = range;
    }

    getLocation(): PddlRange {
        return this.location;
    }
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
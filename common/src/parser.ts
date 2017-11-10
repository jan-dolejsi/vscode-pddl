/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class Parser {

    domainPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)/gi;
    domainDetailsPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)\s*\(:requirements\s*([^\)]*)\)\s*\(:types\s*([^\)]*)\)\s*(\(:constants\s*([^\)]*)\))?\s*(\(:predicates\s*((\([^\)]*\)\s*)*)\))?\s*(\(:functions\s*((\([^\)]*\)\s*)*)\))?/gi;
    problemPattern = /^\s*\(define\s*\(problem\s+(\S+)\s*\)\s*\(:domain\s+(\S+)\s*\)/gi;
    problemCompletePattern = /^\s*\(define\s*\(problem\s+(\S+)\s*\)\s*\(:domain\s+(\S+)\s*\)\s*\(:objects\s*([^\)]*)\)\s*\(:init\s*([\s\S]*)\s*\)\s*\(:goal\s*([\s\S]*?)\s*\)\s*(\(:constraints\s*([\s\S]*?)\s*\))?\s*(\(:metric\s*([\s\S]*?)\s*\))?\s*\)\s*$/gi;

    constructor() { }

    tryProblem(fileUri: string, fileVersion: number, fileText: string): ProblemInfo {

        let pddlText = Parser.stripComments(fileText);

        this.problemPattern.lastIndex = 0;
        let matchGroups = this.problemPattern.exec(pddlText);

        if (matchGroups) {
            let problemName = matchGroups[1];
            let domainName = matchGroups[2];

            let problemInfo = new ProblemInfo(fileUri, fileVersion, problemName, domainName);
            problemInfo.text = fileText;
            return problemInfo;
        }
        else {
            return null;
        }
    }

    tryDomain(fileUri: string, fileVersion: number, fileText: string): DomainInfo {

        let pddlText = Parser.stripComments(fileText);

        this.domainPattern.lastIndex = 0;
        let matchGroups = this.domainPattern.exec(pddlText);

        if (matchGroups) {
            let domainName = matchGroups[1];

            let domainInfo = new DomainInfo(fileUri, fileVersion, domainName);
            domainInfo.text = fileText;
            this.getDomainStructure(pddlText, domainInfo);
            return domainInfo;
        }
        else {
            return null;
        }
    }

    getDomainStructure(domainText: string, domainInfo: DomainInfo): void {
        this.domainDetailsPattern.lastIndex = 0;
        let matchGroups = this.domainDetailsPattern.exec(domainText);

        if (matchGroups) {
            let typesText = matchGroups[3];
            domainInfo.setTypeInheritance(this.parseInheritance(typesText));
            // let constantsText = matchGroups[5];
            let predicatesText = matchGroups[7];
            let predicates = this.parsePredicatesOrFunctions(predicatesText);
            domainInfo.setPredicates(predicates);

            let functionsText = matchGroups[10];
            let functions = this.parsePredicatesOrFunctions(functionsText);
            domainInfo.setFunctions(functions);
        }

        domainInfo.setActions(this.parseActions(domainText));
    }

    parseInheritance(declarationText: string): DirectionalGraph {
        let pattern = /(([\w_][\w_-]*\s*)+-\s*[\w_][\w_-]*|[\w_][\w_-]*)/g;

        // the inheritance graph is captured as a two dimensional array, where the first index is the types themselves, the second is the parent type they inherit from (PDDL supports multiple inheritance)
        let inheritance = new DirectionalGraph();

        let match;
        while (match = pattern.exec(declarationText)) {
            // is this a group with inheritance?
            if (match[1].indexOf(' -')) {
                let fragments = match[1].split('-');
                let parent = fragments[1] ? fragments[1].trim() : null;
                let children = fragments[0].trim().split(/\s+/g, );

                children.forEach(childType => inheritance.addEdge(childType, parent));
            }
        }

        return inheritance;
    }

    parsePredicatesOrFunctions(predicatesText: string): Variable[] {
        let pattern = /\(([^\)]*)\)/gi;
        let predicates = new Array<Variable>();

        let group: RegExpExecArray;

        while (group = pattern.exec(predicatesText)) {
            let symbolName = group[1];
            predicates.push(new Variable(symbolName));
        }

        return predicates;
    }

    parseActions(domainText: string): Action[] {
        let pattern = /\(\s*:(action|durative\-action)\s*([_\w][_\w-]*)\s(;\s(.*))?/gi;

        let actions: Action[] = [];

        let group: RegExpExecArray;
        
                while (group = pattern.exec(domainText)) {
                    let actionType = group[1];
                    let actionName = group[2];
                    let actionDocumentation = group[4];
                    
                    let action = new Action(actionName, actionType.includes('durative'));
                    action.documentation = actionDocumentation;
                    action.location = Parser.toRange(domainText, group.index, 0);
                    actions.push(action);
                }
        
        return actions;
    }

    static toRange(text: string, index: number, length: number): PddlRange {
        let lineLengths = text.split('\n').map(line => line.length+1);

        let totalCharactersSoFar = 0;

        for (var lineIdx = 0; lineIdx < lineLengths.length; lineIdx++) {
            let lineLength = lineLengths[lineIdx];
            
            if(totalCharactersSoFar + lineLength > index){
                let firstCharacterOnLine = index-totalCharactersSoFar;
                return new PddlRange(lineIdx, firstCharacterOnLine, lineIdx, firstCharacterOnLine + length);
            }

            totalCharactersSoFar += lineLength;
        }

        throw `Index ${index} is after the end of the document text.`
    }

    static stripComments(pddlText: string): string {
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
}

export enum FileStatus { Dirty, Validating, Validated }

export abstract class FileInfo {
    text: string;
    private status: FileStatus = FileStatus.Dirty;

    constructor(public fileUri: string, public version: number, public name: string) {
    }

    abstract isDomain(): boolean;
    abstract isProblem(): boolean;

    setStatus(status: FileStatus) {
        this.status = status;
    }

    getStatus(): FileStatus {
        return this.status;
    }

    getVariableReferences(variable: Variable): PddlRange[]{
        let referenceLocations: PddlRange[] = [];

        this.findVariableReferences(variable, (location) => {
            referenceLocations.push(location);
            return true; // continue searching
        });

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

export class ProblemInfo extends FileInfo {
    domainName: string;

    constructor(fileUri: string, version: number, problemName: string, domainName: string) {
        super(fileUri, version, problemName);
        this.domainName = domainName;
    }

    isDomain(): boolean {
        return false;
    }
    isProblem(): boolean {
        return true;
    }
}

export class DomainInfo extends FileInfo {
    predicates: Variable[];
    functions: Variable[];
    actions: Action[];
    typeInheritance: DirectionalGraph;

    constructor(fileUri: string, version: number, domainName: string) {
        super(fileUri, version, domainName);
    }

    setPredicates(predicates: Variable[]) {
        this.predicates = predicates;
    }

    setFunctions(functions: Variable[]) {
        this.functions = functions;
    }

    setActions(actions: Action[]) {
        this.actions = actions;
    }

    setTypeInheritance(typeInheritance: DirectionalGraph) {
        this.typeInheritance = typeInheritance;
    }

    getTypes(): string[] {
        return this.typeInheritance.getVertices();
    }

    isDomain(): boolean {
        return true;
    }
    isProblem(): boolean {
        return false;
    }

    findVariableLocation(variable: Variable): void {
        if (variable.location) return;//already initialized

        super.findVariableReferences(variable, (location, line) => {
            let commentStartColumn = line.indexOf(';');
            variable.location = location;

            if (commentStartColumn > -1) {
                variable.documentation = line.substr(commentStartColumn + 1).trim();
            }
            return false; // we do not continue the search after the first hit
        });

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

                variable.location = new PddlRange(lineIdx, match.index, lineIdx, match.index + match[0].length);

                if (commentStartColumn > -1) {
                    variable.documentation = line.substr(commentStartColumn + 1).trim();
                }

                return;
            }
        }
    }
}

export class UnknownFileInfo extends FileInfo {
    constructor(fileUri: string, version: number) {
        super(fileUri, version, "");
    }

    isDomain(): boolean {
        return false;
    }
    isProblem(): boolean {
        return false;
    }
}

export class DirectionalGraph {
    verticesAndEdges: [string, string[]][] = [];

    constructor() {

    }

    getVertices(): string[] {
        return this.verticesAndEdges.map(tuple => tuple[0]);
    }

    addEdge(from: string, to: string): void {
        let fromVertex = this.verticesAndEdges.find(vertex => vertex[0] == from);

        if (fromVertex) {
            let edgesAlreadyInserted = fromVertex[1];
            if (to && !edgesAlreadyInserted.includes(to)) {
                edgesAlreadyInserted.push(to);
            }
        }
        else {
            let edges = to ? [to] : [];
            this.verticesAndEdges.push([from, edges]);
        }

        if (to) this.addEdge(to, null);
    }

    getEdgesFrom(vertex: string): string[] {
        return this.verticesAndEdges.find(t => t[0] == vertex)[1];
    }
}

export class Variable {
    name: string;
    fullNameWithoutTypes: string;
    location: PddlRange = null; // initialized lazily
    documentation = ''; // initialized lazily

    constructor(public fullName: string) {
        this.fullNameWithoutTypes = fullName.replace(/\s*-\s*[\w-_]+/gi, '');
        this.name = fullName.replace(/( .*)$/gi, '');
    }
}

export class Action {
    location: PddlRange = null; // initialized lazily
    documentation = ''; // initialized lazily

    constructor(public name: string, public isDurative: boolean) {

    }
}

export class PddlRange {
    constructor(public startLine: number, public startCharacter: number, public endLine: number, public endCharacter: number){}
}
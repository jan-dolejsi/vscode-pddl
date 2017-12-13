/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class Parser {

    domainPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)/gi;
    domainDetailsPattern = /^\s*\(define\s*\(domain\s+(\S+)\s*\)\s*\(:requirements\s*([^\)]*)\)\s*(\(:types\s*([^\)]*)\))?\s*(\(:constants\s*([^\)]*)\))?\s*(\(:predicates\s*((\([^\)]*\)\s*)*)\))?\s*(\(:functions\s*((\([^\)]*\)\s*)*)\))?/gi;
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
            this.getProblemStructure(pddlText, problemInfo);
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
            let typesText = matchGroups[4];
            domainInfo.setTypeInheritance(this.parseInheritance(typesText));
            let constantsText = matchGroups[6];
            domainInfo.setConstants(Parser.toTypeObjects(this.parseInheritance(constantsText)));
            let predicatesText = matchGroups[8];
            let predicates = Parser.parsePredicatesOrFunctions(predicatesText);
            domainInfo.setPredicates(predicates);

            let functionsText = matchGroups[11];
            let functions = Parser.parsePredicatesOrFunctions(functionsText);
            domainInfo.setFunctions(functions);
        }

        domainInfo.setActions(this.parseActions(domainText));
    }

    getProblemStructure(problemText: string, problemInfo: ProblemInfo): void {
        this.problemCompletePattern.lastIndex = 0;
        let matchGroups = this.problemCompletePattern.exec(problemText);

        if (matchGroups) {
            let objectsText = matchGroups[3];
            problemInfo.setObjects(Parser.toTypeObjects(this.parseInheritance(objectsText)));
        }
    }

    static toTypeObjects(graph: DirectionalGraph): TypeObjects[] {
        let typeSet = new Set<string>(graph.getEdges().map(edge => edge[1]));
        let typeObjects: TypeObjects[] = Array.from(typeSet).map(type => new TypeObjects(type));

        graph.getVertices().forEach(obj => {
            graph.getVerticesWithEdgesFrom(obj).forEach(type => typeObjects.find(to => to.type == type).objects.push(obj));
        });

        return typeObjects;
    }

    parseInheritance(declarationText: string): DirectionalGraph {

        // the inheritance graph is captured as a two dimensional array, where the first index is the types themselves, the second is the parent type they inherit from (PDDL supports multiple inheritance)
        let inheritance = new DirectionalGraph();

        if (!declarationText) return inheritance;

        // if there are root types that do not inherit from 'object', add the 'object' inheritance.
        // it will make the following regex work
        if (!declarationText.match(/-\s+\w[\w-]*\s*$/)) {
            declarationText += ' - object';
        }

        let pattern = /(\w[\w-]*\s+)+-\s+\w[\w-]*/g;
        let match;
        while (match = pattern.exec(declarationText)) {
            // is this a group with inheritance?
            if (match[0].indexOf(' -')) {
                let fragments = match[0].split('-');
                let parent = fragments[1] ? fragments[1].trim() : null;
                let children = fragments[0].trim().split(/\s+/g, );

                children.forEach(childType => inheritance.addEdge(childType, parent));
            }
        }

        return inheritance;
    }

    static parsePredicatesOrFunctions(predicatesText: string): Variable[] {
        let pattern = /\(([^\)]*)\)/gi;
        let predicates = new Array<Variable>();

        let group: RegExpExecArray;

        while (group = pattern.exec(predicatesText)) {
            let fullSymbolName = group[1];
            let parameters = Parser.parseParameters(fullSymbolName);
            predicates.push(new Variable(fullSymbolName, parameters));
        }

        return predicates;
    }

    static parseParameters(fullSymbolName: string): Parameter[] {
        let parameterPattern = /((\?[\w]+\s+)+)-\s+([\w][\w-]*)/g;

        let parameters: Parameter[] = [];

        let group: RegExpExecArray;

        while (group = parameterPattern.exec(fullSymbolName)) {
            let variables = group[1];
            let type = group[3];

            variables.split(/(\s+)/)
                .filter(term => term.trim().length)
                .map(variable => variable.substr(1).trim()) // skip the question-mark
                .forEach(variable => parameters.push(new Parameter(variable, type)));
        }

        return parameters;
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
        let lineLengths = text.split('\n').map(line => line.length + 1);

        let totalCharactersSoFar = 0;

        for (var lineIdx = 0; lineIdx < lineLengths.length; lineIdx++) {
            let lineLength = lineLengths[lineIdx];

            if (totalCharactersSoFar + lineLength > index) {
                let firstCharacterOnLine = index - totalCharactersSoFar;
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

    getVariableReferences(variable: Variable): PddlRange[] {
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

/**
 * Problem file.
 */
export class ProblemInfo extends FileInfo {
    domainName: string;
    objects: TypeObjects[] = [];

    constructor(fileUri: string, version: number, problemName: string, domainName: string) {
        super(fileUri, version, problemName);
        this.domainName = domainName;
    }

    setObjects(objects: TypeObjects[]): void {
        this.objects = objects;
    }

    isDomain(): boolean {
        return false;
    }
    isProblem(): boolean {
        return true;
    }
}

/**
 * Domain file.
 */
export class DomainInfo extends FileInfo {
    private predicates: Variable[] = [];
    private functions: Variable[] = [];
    actions: Action[] = [];
    typeInheritance: DirectionalGraph;
    constants: TypeObjects[] = [];

    constructor(fileUri: string, version: number, domainName: string) {
        super(fileUri, version, domainName);
    }

    getPredicates(): Variable[] {
        return this.predicates;
    }

    setPredicates(predicates: Variable[]): void {
        this.predicates = predicates;
    }

    getFunctions(): Variable[] {
        return this.functions;
    }

    setFunctions(functions: Variable[]): void {
        this.functions = functions;
    }

    setActions(actions: Action[]): void {
        this.actions = actions;
    }

    setTypeInheritance(typeInheritance: DirectionalGraph): void {
        this.typeInheritance = typeInheritance;
    }

    setConstants(constants: TypeObjects[]): void {
        if (constants == undefined) throw new Error("Constants must be defined or empty.")
        this.constants = constants;
    }

    getTypes(): string[] {
        return this.typeInheritance.getVertices()
            .filter(t => t != "object");
    }

    isDomain(): boolean {
        return true;
    }
    isProblem(): boolean {
        return false;
    }

    getTypesInheritingFrom(type: string): string[] {
        return this.typeInheritance.getSubtreePointingTo(type);
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

/**
 * Simple directional graph.
 */
export class DirectionalGraph {
    // vertices and edges stemming from them
    verticesAndEdges: [string, string[]][] = [];

    constructor() {

    }

    /**
     * Get all vertices.
     */
    getVertices(): string[] {
        return this.verticesAndEdges.map(tuple => tuple[0]);
    }

    /**
     * Get all edges.
     */
    getEdges(): [string, string][] {
        let edges: [string, string][] = [];
        this.verticesAndEdges.forEach(vertexEdges => {
            let fromVertex = vertexEdges[0];
            let connectedVertices = vertexEdges[1];
            connectedVertices.forEach(toVertex => edges.push([fromVertex, toVertex]));
        });
        return edges;
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

    getVerticesWithEdgesFrom(vertex: string): string[] {
        return this.verticesAndEdges.find(t => t[0] == vertex)[1];
    }

    getVerticesWithEdgesTo(vertex: string): string[] {
        return this.verticesAndEdges
            .filter(t => t[1].includes(vertex))
            .map(t => t[0]);
    }

    getSubtreePointingTo(vertex: string): string[] {
        let vertices = this.getVerticesWithEdgesTo(vertex);

        let verticesSubTree = vertices
            .map(childVertex => this.getSubtreePointingTo(childVertex))
            .reduce((x, y) => x.concat(y), []);

        return vertices.concat(verticesSubTree);        
    }

    getSubtreePointingFrom(vertex: string): string[] {
        let vertices = this.getVerticesWithEdgesFrom(vertex);

        let verticesSubTree = vertices
            .map(childVertex => this.getSubtreePointingFrom(childVertex))
            .reduce((x, y) => x.concat(y), []);

        return vertices.concat(verticesSubTree);
    }
}

/**
 * Holds objects belonging to the same type.
 */
export class TypeObjects {
    objects: string[] = [];

    constructor(public type: string) { }

    addAllObjects(objects: string[]): TypeObjects {
        objects.forEach(o => this.objects.push(o));

        return this;
    }

    static concatObjects(constants: TypeObjects[], objects: TypeObjects[]): TypeObjects[] {
        let mergedObjects: TypeObjects[] = [];

        constants.concat(objects).forEach(typeObj => {
            let typeFound = mergedObjects.find(to1 => to1.type == typeObj.type);

            if (!typeFound) {
                typeFound = new TypeObjects(typeObj.type);
                mergedObjects.push(typeFound);
            }

            typeFound.addAllObjects(typeObj.objects);
        });

        return mergedObjects;
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
export class Variable {
    name: string;
    fullNameWithoutTypes: string;
    location: PddlRange = null; // initialized lazily
    documentation = ''; // initialized lazily

    constructor(public declaredName: string, public parameters: Term[]) {
        this.fullNameWithoutTypes = declaredName.replace(/\s*-\s*[\w-_]+/gi, '');
        this.name = declaredName.replace(/( .*)$/gi, '');
    }

    getFullName() {
        return this.name + this.parameters.map(par => " " + par.toPddlString()).join('');
    }

    isGrounded() {
        return this.parameters.every(parameter => parameter.isGrounded());
    }
}

export class Action {
    location: PddlRange = null; // initialized lazily
    documentation = ''; // initialized lazily

    constructor(public name: string, public isDurative: boolean) {

    }
}

/**
 * This is a local version of the vscode Range class, but because the parser is used in both the extension (client)
 * and the language server, where the Range class is defined separately, we need a single proprietary implementation,
 * which is converted to the VS Code class specific to the two distinct client/server environment. 
 */
export class PddlRange {
    constructor(public startLine: number, public startCharacter: number, public endLine: number, public endCharacter: number) { }
}
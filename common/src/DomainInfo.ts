/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { DirectionalGraph } from "./DirectionalGraph";
import { FileInfo, Variable, PddlLanguage, ObjectInstance, Parameter } from "./FileInfo";
import { PddlSyntaxTree } from "./PddlSyntaxTree";
import { PddlRange, DocumentPositionResolver } from "./DocumentPositionResolver";
import { PddlBracketNode, PddlSyntaxNode } from "./PddlSyntaxNode";
import { PddlTokenType } from "./PddlTokenizer";

/**
 * Domain file.
 */
export class DomainInfo extends FileInfo {
    private predicates: Variable[] = [];
    private functions: Variable[] = [];
    private derived: Variable[] = [];
    actions: Action[] = [];
    private typeInheritance: DirectionalGraph = new DirectionalGraph();
    private typeLocations = new Map<string, PddlRange>();
    constants: TypeObjects[] = [];
    events: Action[];
    processes: Action[];

    constructor(fileUri: string, version: number, domainName: string, public readonly syntaxTree: PddlSyntaxTree, positionResolver: DocumentPositionResolver) {
        super(fileUri, version, domainName, positionResolver);
    }

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
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

    getFunction(liftedVariableNeme: string): Variable {
        return this.functions
            .filter(variable => variable.name.toLocaleLowerCase() === liftedVariableNeme.toLocaleLowerCase())
            .find(_ => true);
    }

    getLiftedFunction(groundedVariable: Variable): Variable {
        return this.getFunction(groundedVariable.name);
    }

    getDerived(): Variable[] {
        return this.derived;
    }

    setDerived(derived: Variable[]): void {
        this.derived = derived;
    }

    setActions(actions: Action[]): void {
        this.actions = actions;
    }

    getActions(): Action[] {
        return this.actions;
    }

    getTypeInheritance(): DirectionalGraph {
        return this.typeInheritance;
    }

    setTypeInheritance(typeInheritance: DirectionalGraph, typesNode: PddlBracketNode, positionResolver: DocumentPositionResolver): void {
        this.typeInheritance = typeInheritance;
        this.getTypes().forEach(typeName => {
            let typeNode = typesNode.getFirstChild(PddlTokenType.Other, new RegExp("^" + typeName + "$"));
            if (typeNode) {
                let range = PddlRange.from(positionResolver.resolveToPosition(typeNode.getStart()), positionResolver.resolveToPosition(typeNode.getEnd()));
                this.typeLocations.set(typeName, range);
            }
        });
    }

    setConstants(constants: TypeObjects[]): void {
        if (constants === undefined || constants === null) { throw new Error("Constants must be defined or empty."); }
        this.constants = constants;
    }

    getTypes(): string[] {
        return this.typeInheritance.getVertices()
            .filter(t => t !== "object");
    }

    isDomain(): boolean {
        return true;
    }

    getTypesInheritingFrom(type: string): string[] {
        return this.typeInheritance.getSubtreePointingTo(type);
    }

    getEvents(): Action[] {
        return this.events;
    }

    setEvents(events: Action[]) {
        this.events = events;
    }

    getProcesses(): Action[] {
        return this.processes;
    }

    setProcesses(processes: Action[]) {
        this.processes = processes;
    }

    TYPES_SECTION_START = "(:types";

    getTypeLocation(type: string): PddlRange {
        return this.typeLocations.get(type);
    }

    getVariableReferences(variable: Variable): PddlRange[] {

        let referenceLocations: PddlRange[] = [];

        this.syntaxTree.getDefineNode().getChildrenRecursively(node => this.isVariableReference(node, variable),
            node => referenceLocations.push(this.getRange(node)));

        return referenceLocations;
    }

    private isVariableReference(node: PddlSyntaxNode, variable: Variable): boolean {
        if (node.getToken().type !== PddlTokenType.OpenBracket) {
            return false;
        }

        let nonWhiteSpaceChildren = node.getNonWhitespaceChildren();
        if (nonWhiteSpaceChildren.length < 1) {
            return false;
        }
        let variableNameNode = nonWhiteSpaceChildren[0];
        return variableNameNode.getToken().type === PddlTokenType.Other
            && variableNameNode.getToken().tokenText === variable.name;
    }
}


/**
 * Holds objects belonging to the same type.
 */
export class TypeObjects {
    private objects: string[] = [];

    constructor(public readonly type: string) { }

    getObjects(): string[] {
        return this.objects;
    }

    addObject(obj: string): void {
        this.objects.push(obj);
    }

    addAllObjects(objects: string[]): TypeObjects {
        objects.forEach(o => this.addObject(o));

        return this;
    }

    hasObject(objectName: string): boolean {
        return this.objects.some(o => o.toLowerCase() === objectName.toLowerCase());
    }

    getObjectInstance(objectName: string): ObjectInstance {
        return new ObjectInstance(objectName, this.type);
    }

    static concatObjects(constants: TypeObjects[], objects: TypeObjects[]): TypeObjects[] {
        let mergedObjects: TypeObjects[] = [];

        constants.concat(objects).forEach(typeObj => {
            let typeFound = mergedObjects.find(to1 => to1.type === typeObj.type);

            if (!typeFound) {
                typeFound = new TypeObjects(typeObj.type);
                mergedObjects.push(typeFound);
            }

            typeFound.addAllObjects(typeObj.objects);
        });

        return mergedObjects;
    }

}

export abstract class Action {
    location: PddlRange = null; // initialized lazily
    documentation: string[] = []; // initialized lazily

    constructor(public readonly name: string, public readonly parameters: Parameter[]) {

    }

    setLocation(location: PddlRange) {
        this.location = location;
    }

    getLocation(): PddlRange {
        return this.location;
    }

    setDocumentation(documentation: string[]) {
        this.documentation = documentation;
    }

    getDocumentation(): string[] {
        return this.documentation;
    }

    abstract isDurative(): boolean;
}

export class InstantAction extends Action {
    constructor(name: string, parameters: Parameter[], public readonly preCondition: PddlBracketNode, public readonly effect: PddlBracketNode) {
        super(name, parameters);
    }

    isDurative(): boolean {
        return false;
    }
}

export class DurativeAction extends Action {
    constructor(name: string, parameters: Parameter[],
        public readonly duration: PddlBracketNode,
        public readonly condition: PddlBracketNode,
        public readonly effect: PddlBracketNode) {
        super(name, parameters);
    }

    isDurative(): boolean {
        return true;
    }
}
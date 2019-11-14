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
import { Constraint } from "./constraints";

/**
 * Domain file.
 */
export class DomainInfo extends FileInfo {
    private predicates: Variable[] = [];
    private functions: Variable[] = [];
    private derived: Variable[] = [];
    private actions: Action[] = [];
    private typeInheritance: DirectionalGraph = new DirectionalGraph();
    private typeLocations = new Map<string, PddlRange>();
    private constants: TypeObjectMap = new TypeObjectMap();
    private events?: Action[];
    private processes?: Action[];
    private constraints: Constraint[] = [];

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

    getFunction(liftedVariableName: string): Variable | undefined {
        return this.functions
            .find(variable => variable.name.toLocaleLowerCase() === liftedVariableName.toLocaleLowerCase());
    }

    getLiftedFunction(groundedVariable: Variable): Variable | undefined {
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

    setTypeInheritance(typeInheritance: DirectionalGraph, typesNode?: PddlBracketNode, positionResolver?: DocumentPositionResolver): void {
        this.typeInheritance = typeInheritance;
        if (typesNode && positionResolver) {
            this.getTypes().forEach(typeName => {
                let typeNode = typesNode.getFirstChild(PddlTokenType.Other, new RegExp("^" + typeName + "$"));
                if (typeNode) {
                    let range = PddlRange.from(positionResolver.resolveToPosition(typeNode.getStart()), positionResolver.resolveToPosition(typeNode.getEnd()));
                    this.typeLocations.set(typeName, range);
                }
            });
        }
    }

    setConstants(constants: TypeObjectMap): void {
        if (constants === undefined || constants === null) { throw new Error("Constants must be defined or empty."); }
        this.constants = constants;
    }

    getConstants(): TypeObjectMap {
        return this.constants;
    }

    getTypes(): string[] {
        return this.typeInheritance.getVertices()
            .filter(t => t.toLowerCase() !== "object");
    }

    getTypesInclObject(): string[] {
        return this.typeInheritance.getVertices();
    }

    isDomain(): boolean {
        return true;
    }

    getTypesInheritingFrom(type: string): string[] {
        return this.typeInheritance.getSubtreePointingTo(type);
    }

    getEvents(): Action[] | undefined {
        return this.events;
    }

    setEvents(events: Action[]) {
        this.events = events;
    }

    getProcesses(): Action[] | undefined {
        return this.processes;
    }

    setProcesses(processes: Action[]) {
        this.processes = processes;
    }

    getConstraints(): Constraint[] {
        return this.constraints;
    }

    setConstraints(constraints: Constraint[]): void {
        this.constraints = constraints;
    }

    TYPES_SECTION_START = "(:types";

    getTypeLocation(type: string): PddlRange | undefined {
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
            && variableNameNode.getToken().tokenText.toLowerCase() === variable.name.toLowerCase();
    }
}

export class TypeObjectMap {
    private typeNameToTypeObjectMap = new Map<string, TypeObjects>();
    private objectNameToTypeObjectMap = new Map<string, TypeObjects>();

    get length(): number {
        return this.typeNameToTypeObjectMap.size;
    }

    merge(other: TypeObjectMap): TypeObjectMap {
        other.valuesArray()
            .forEach(typeObj => this.addAll(typeObj.type, typeObj.getObjects()));
        return this;
    }

    add(type: string, objectName: string): TypeObjectMap {
        this._upsert(type, typeObjects => {
            typeObjects.addObject(objectName);
            // store map of object-to-type
            this.objectNameToTypeObjectMap.set(objectName.toLowerCase(), typeObjects);
        });
        return this;
    }

    addAll(type: string, objects: string[]): TypeObjectMap {
        this._upsert(type, typeObjects => {
            typeObjects.addAllObjects(objects);
            // store map of object-to-type
            objects.forEach(objName => {
                this.objectNameToTypeObjectMap.set(objName.toLowerCase(), typeObjects);
            });
        });

        return this;
    }

    private _upsert(type: string, inserter: (typeObjects: TypeObjects) => void): void {
        let typeFound = this.getTypeCaseInsensitive(type) || new TypeObjects(type);

        inserter.apply(this, [typeFound]);

        this.typeNameToTypeObjectMap.set(type.toLowerCase(), typeFound);
    }

    private valuesArray(): TypeObjects[] {
        return [...this.typeNameToTypeObjectMap.values()];
    }

    getTypeCaseInsensitive(type: string): TypeObjects | undefined {
        return this.typeNameToTypeObjectMap.get(type.toLowerCase());
    }

    getTypeOf(objectName: string): TypeObjects | undefined {
        return this.objectNameToTypeObjectMap.get(objectName.toLowerCase());
    }
}

/**
 * Holds objects belonging to the same type.
 */
export class TypeObjects {
    private objects = new Set<string>();

    constructor(public readonly type: string) { }

    getObjects(): string[] {
        return [...this.objects.keys()];
    }

    addObject(obj: string): TypeObjects {
        this.objects.add(obj);
        return this;
    }

    addAllObjects(objects: string[]): TypeObjects {
        objects.forEach(o => this.addObject(o));

        return this;
    }

    hasObject(objectName: string): boolean {
        return [...this.objects.keys()]
            .some(o => o.toLowerCase() === objectName.toLowerCase());
    }

    getObjectInstance(objectName: string): ObjectInstance {
        return new ObjectInstance(objectName, this.type);
    }
}

export abstract class Action {
    private location?: PddlRange; // initialized lazily
    private documentation: string[] = []; // initialized lazily

    constructor(public readonly name: string | undefined, public readonly parameters: Parameter[]) {

    }

    setLocation(location: PddlRange) {
        this.location = location;
    }

    getLocation(): PddlRange | undefined {
        return this.location;
    }

    setDocumentation(documentation: string[]) {
        this.documentation = documentation;
    }

    getDocumentation(): string[] {
        return this.documentation;
    }

    abstract isDurative(): boolean;

    getNameOrEmpty(): string {
        return this.name || '';
    }
}

export class InstantAction extends Action {
    constructor(name: string | undefined, parameters: Parameter[], public readonly preCondition: PddlBracketNode, public readonly effect: PddlBracketNode) {
        super(name, parameters);
    }

    isDurative(): boolean {
        return false;
    }
}

export class DurativeAction extends Action {
    constructor(name: string | undefined, parameters: Parameter[],
        public readonly duration: PddlBracketNode,
        public readonly condition: PddlBracketNode,
        public readonly effect: PddlBracketNode) {
        super(name, parameters);
    }

    isDurative(): boolean {
        return true;
    }
}
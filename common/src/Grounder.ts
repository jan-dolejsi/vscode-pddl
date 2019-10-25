/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo } from "./ProblemInfo";
import { DomainInfo, TypeObjects } from './DomainInfo';
import { Variable, ObjectInstance, Term } from './FileInfo';
import { getObjectsInheritingFrom } from "./typeInheritance";

export class Grounder {

    private typeObjects: TypeObjects[];

    constructor(private domain: DomainInfo, private problem: ProblemInfo) {
        this.typeObjects = TypeObjects.concatObjects(this.domain.getConstants(), this.problem.getObjectsPerType());
    }

    getObjectsForType(typeName: string): string[] {
        return getObjectsInheritingFrom(this.typeObjects, typeName, this.domain.getTypeInheritance());
    }

    getObjects(typeNames: string[]): string[][] {
        return typeNames.map(typeName => this.getObjectsForType(typeName));
    }

    getObjectPermutations(typeNames: string[]): string[][] {
        let objects = this.getObjects(typeNames);
        if (typeNames.length === 0) {
            return [];
        }
        else if (typeNames.length === 1) {
            return objects[0].map(name => [name]);
        }
        else if (typeNames.length === 2) {
            let objectPermutations: string[][] = [];
            for (let index0 = 0; index0 < objects[0].length; index0++) {
                for (let index1 = 0; index1 < objects[1].length; index1++) {
                    objectPermutations.push([objects[0][index0], objects[1][index1]]);
                }
            }
            return objectPermutations;
        }
        else {
            throw new Error("Not implemented for 3-ary+ relationships.");
        }
    }

    ground(variable: Variable): Variable[] {

        if (variable.parameters.length === 0) {
            return [variable];
        }
        else if (variable.parameters.length <= 2) {
            let types = variable.parameters.map(p => p.type);

            let objectPermutations = this.getObjectPermutations(types);
            return objectPermutations.map(objectVector => new Variable(variable.declaredName, this.createObjectInstances(types, objectVector)));
        }
        else {
            //todo: handle variables with multiple parameters
            return [];
        }
    }

    createObjectInstances(types: string[], objectVector: string[]): Term[] {
        if (types.length !== objectVector.length) {
            throw new Error('List of types and list objects have different sizes.');
        }

        return types.map((type, index) => new ObjectInstance(objectVector[index], type));
    }

}
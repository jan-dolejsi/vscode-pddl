/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, ProblemInfo, TypeObjects } from "./parser";
import { Variable, ObjectInstance } from './FileInfo';

export class Grounder {
    
    typeObjects: TypeObjects[];

    constructor(public domain: DomainInfo, public problem: ProblemInfo){
        this.typeObjects = TypeObjects.concatObjects(this.domain.constants, this.problem.objects)
    }

    getObjects(typeNames: string[]): string[][] {
        return typeNames.map(typeName => {
            let typeObjects = this.typeObjects
                .find(typeObject => typeObject.type == typeName) // todo: need to support type inheritance!

            if(!typeObjects) return []; // no objects are defined for this type
            else return typeObjects.objects;
        });
    }

    getObjectPermutations(typeNames: string[]): string[][] {
        if(typeNames.length > 1) throw new Error("Not implemented for relationships.");

        if(typeNames.length == 0) return [];

        return this.getObjects(typeNames)[0].map(name => [name]);
    }

    ground(variable: Variable): Variable[] {
     
        if(variable.parameters.length == 0) return [variable];
        else if(variable.parameters.length == 1) {
            let types = variable.parameters.map(p => p.type);
            
            let type = types[0];
            let objects = this.getObjects(types)[0];

            if (!objects) return []; // no types are defined

            return objects.map(objectName => new Variable(variable.declaredName, [new ObjectInstance(objectName, type)]));
        }
        else{
            //todo: handle variables with multiple parameters
            return [];
        }
    }

}
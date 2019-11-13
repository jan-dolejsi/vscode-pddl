/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { TypeObjects } from "./DomainInfo";
import { DirectionalGraph } from "./DirectionalGraph";
import { Util } from "./util";

export function getObjectsInheritingFrom(allObjects: TypeObjects[], type: string, typeInheritance: DirectionalGraph): string[] {
    let subTypes = getTypesInheritingFromPlusSelf(type, typeInheritance);
    let subTypesObjects = subTypes.map(subType => getObjectsOfType(allObjects, subType));
    return Util.flatMap<string>(subTypesObjects);
}

export function getTypesInheritingFromPlusSelf(type: string, typeInheritance: DirectionalGraph): string[] {
    return [type].concat(typeInheritance.getSubtreePointingTo(type));
}

function getObjectsOfType(allObjects: TypeObjects[], type: string): string[] {
    let thisTypeObjects = allObjects.find(o => o.type === type);
    return thisTypeObjects ? thisTypeObjects.getObjects() : [];
}
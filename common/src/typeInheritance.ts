/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { TypeObjectMap } from "./DomainInfo";
import { DirectionalGraph } from "./DirectionalGraph";
import { Util } from "./util";

export function getObjectsInheritingFrom(allObjects: TypeObjectMap, type: string, typeInheritance: DirectionalGraph): string[] {
    let subTypes = getTypesInheritingFromPlusSelf(type, typeInheritance);
    let subTypesObjects = subTypes.map(subType => getObjectsOfType(allObjects, subType));
    return Util.flatMap<string>(subTypesObjects);
}

export function getTypesInheritingFromPlusSelf(type: string, typeInheritance: DirectionalGraph): string[] {
    return [type].concat(typeInheritance.getSubtreePointingTo(type));
}

function getObjectsOfType(allObjects: TypeObjectMap, type: string): string[] {
    let thisTypeObjects = allObjects.getTypeCaseInsensitive(type);
    return thisTypeObjects ? thisTypeObjects.getObjects() : [];
}
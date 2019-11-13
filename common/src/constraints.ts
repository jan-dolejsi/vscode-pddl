/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlSyntaxNode } from "./PddlSyntaxNode";

export class Constraint {
    constructor(public readonly node: PddlSyntaxNode) {
    }
}

export class Condition {
    constructor(public readonly node: PddlSyntaxNode) { }

    getText(): string {
        return this.node.getText();
    }
}

export class ConditionalConstraint extends Constraint {
    constructor(public readonly condition: Condition | undefined, node: PddlSyntaxNode) {
        super(node);
    }
}

export class NamedConditionConstraint extends ConditionalConstraint {
    public readonly name?: string;
    constructor(definition: { name?: string, condition?: Condition }, 
        node: PddlSyntaxNode) {
        super(definition.condition, node);
        this.name = definition.name;
    }

    toString(): string {
        return this.node.getText();
    }
}

export class AfterConstraint extends Constraint {
    constructor(public readonly predecessor: NamedConditionConstraint, public readonly successor: NamedConditionConstraint, node: PddlSyntaxNode) {
        super(node);
    }
}
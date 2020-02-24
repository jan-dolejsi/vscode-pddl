/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { Variable, Term, Parameter, ObjectInstance } from "./FileInfo";

export class ActionEffectParser {
    static parseEffect(node: PddlSyntaxNode): Effect {
        switch (node.getToken().tokenText) {
            case MakeFalseEffect.TOKEN:
                return MakeFalseEffect.parse(node);
            case AssignEffect.TOKEN:
                return AssignEffect.parse(node);
            case IncreaseEffect.TOKEN:
                return IncreaseEffect.parse(node);
            case DecreaseEffect.TOKEN:
                return DecreaseEffect.parse(node);
            case ScaleUpEffect.TOKEN:
                return ScaleUpEffect.parse(node);
            case ScaleDownEffect.TOKEN:
                return ScaleDownEffect.parse(node);
            default:
                if (node.isLeaveBracket() || MakeTrueEffect.TOKENS.includes(node.getToken().tokenText)) {
                    return MakeTrueEffect.parse(node);
                }
                else {
                    return new UnrecognizedEffect(node);
                }
        }
    }
}

export abstract class Effect {
    constructor(public readonly node: PddlSyntaxNode) {

    }
    toPddlString(): string {
        return this.node.getText();
    }
}

export class VariableEffect extends Effect {

    constructor(node: PddlSyntaxNode, private variableModified: Variable) {
        super(node);
    }

    getVariableModified(): Variable {
        return this.variableModified;
    }
    modifies(variable: Variable): boolean {
        return this.variableModified.name.toLowerCase() === variable.name.toLowerCase();
    }
}

export class UnrecognizedEffect extends Effect {
    constructor(node: PddlSyntaxNode) {
        super(node);
    }
}

export class MakeTrueEffect extends VariableEffect {
    constructor(node: PddlSyntaxNode, variableModified: Variable) {
        super(node, variableModified);
    }

    static readonly TOKENS = ['(and', '(at start', '(at end'];

    static parse(node: PddlSyntaxNode): Effect {
        if (this.TOKENS.includes(node.getToken().tokenText)) {
            return this.parse(node.getSingleNonWhitespaceChild());
        }

        return new MakeTrueEffect(node, parseVariable(node));
    }
}

export class MakeFalseEffect extends VariableEffect {
    constructor(node: PddlSyntaxNode, variableModified: Variable) {
        super(node, variableModified);
    }

    static readonly TOKEN = '(not';

    static parse(node: PddlSyntaxNode): Effect {
        if (node.getToken().tokenText !== this.TOKEN) {
            throw new Error("Invalid 'not' effect: " + node.getText());
        }

        let children = node.getNonWhitespaceNonCommentChildren();
        if (children.length === 1) {
            return new MakeFalseEffect(node, parseVariable(children[0]));
        }
        else {
            throw new Error("Invalid 'not' effect: " + node.getText());
        }
    }
}

export abstract class ExpressionEffect extends VariableEffect {
    constructor(node: PddlSyntaxNode, variableModified: Variable, public readonly expressionNode: PddlSyntaxNode) {
        super(node, variableModified);
    }

    static parseBase(node: PddlSyntaxNode, expectedToken: string,
        creator: (node: PddlSyntaxNode, variable: Variable, expressionNode: PddlSyntaxNode) => ExpressionEffect): ExpressionEffect {

        if (node.getToken().tokenText !== expectedToken) {
            throw new Error(`Invalid '${expectedToken}' effect: ` + node.getText());
        }

        let children = node.getNonWhitespaceNonCommentChildren();
        if (children.length === 2) {
            return creator.apply(this, [node, parseVariable(children[0]), children[1]]);
        }
        else {
            throw new Error(`Invalid '${expectedToken}' effect: ` + node.getText());
        }
    }
}

export class IncreaseEffect extends ExpressionEffect {
    static readonly TOKEN = '(increase';
    constructor(node: PddlSyntaxNode, variableModified: Variable, expressionNode: PddlSyntaxNode) {
        super(node, variableModified, expressionNode);
    }

    static parse(node: PddlSyntaxNode): IncreaseEffect {
        return this.parseBase(node, this.TOKEN, (node, variable, expressionNode) => new IncreaseEffect(node, variable, expressionNode));
    }
}

export class DecreaseEffect extends ExpressionEffect {
    static readonly TOKEN = '(decrease';
    constructor(node: PddlSyntaxNode, variableModified: Variable, expressionNode: PddlSyntaxNode) {
        super(node, variableModified, expressionNode);
    }

    static parse(node: PddlSyntaxNode): DecreaseEffect {
        return this.parseBase(node, this.TOKEN, (node, variable, expressionNode) => new DecreaseEffect(node, variable, expressionNode));
    }
}

export class ScaleUpEffect extends ExpressionEffect {
    static readonly TOKEN = '(scale-up';
    constructor(node: PddlSyntaxNode, variableModified: Variable, expressionNode: PddlSyntaxNode) {
        super(node, variableModified, expressionNode);
    }

    static parse(node: PddlSyntaxNode): ScaleUpEffect {
        return this.parseBase(node, this.TOKEN, (node, variable, expressionNode) => new ScaleUpEffect(node, variable, expressionNode));
    }
}

export class ScaleDownEffect extends ExpressionEffect {
    static readonly TOKEN = '(scale-down';
    constructor(node: PddlSyntaxNode, variableModified: Variable, expressionNode: PddlSyntaxNode) {
        super(node, variableModified, expressionNode);
    }
    static parse(node: PddlSyntaxNode): ScaleDownEffect {
        return this.parseBase(node, this.TOKEN, (node, variable, expressionNode) => new ScaleDownEffect(node, variable, expressionNode));
    }
}

export class AssignEffect extends ExpressionEffect {
    static readonly TOKEN = '(assign';
    constructor(node: PddlSyntaxNode, variableModified: Variable, expressionNode: PddlSyntaxNode) {
        super(node, variableModified, expressionNode);
    }

    static parse(node: PddlSyntaxNode): AssignEffect {
        return this.parseBase(node, this.TOKEN, (node, variable, expressionNode) => new AssignEffect(node, variable, expressionNode));
    }
}

function parseVariable(node: PddlSyntaxNode): Variable {
    let fragments = node.getNestedText().split(/\s+/);
    return new Variable(fragments[0], fragments.slice(1).map(term => parseTerm(term)));
}

function parseTerm(termText: string): Term {
    if (termText.startsWith('?')) {
        return new Parameter(termText.slice(1), "object");
    }
    else {
        return new ObjectInstance(termText, "object");
    }
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Constraint, NamedConditionConstraint, Condition, AfterConstraint, StrictlyAfterConstraint } from "./constraints";
import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { PddlTokenType, isOpenBracket } from "./PddlTokenizer";

export class PddlConstraintsParser {

    parseConstraints(constraintsNode: PddlSyntaxNode): Constraint[] {

        const children = constraintsNode.getNonWhitespaceChildren().filter(child => isOpenBracket(child.getToken()));

        if (children.length === 0) { return []; }

        if (children[0].isType(PddlTokenType.OpenBracketOperator) && children[0].getToken().tokenText === '(and') {
            return this.parseConstraints(children[0]);
        }

        return children
            .map(child => this.parseChild(child))
            .filter(c => c !== undefined)
            .map(c => c!);
    }

    private parseChild(node: PddlSyntaxNode): Constraint | undefined {
        let children = node.getNonWhitespaceNonCommentChildren();
        if (children.length === 0 && node.getToken().tokenText === '(') {
            return new Constraint(node);
        }

        if (children.length > 0 && children[0].getToken().type === PddlTokenType.Other) {
            const token = children[0].getToken().tokenText.toLowerCase();
            const strictlyAfterToken = 'strictly-after';
            switch (token) {
                case 'name':
                case 'named-condition':
                    return this.parseNamedCondition(node, children.slice(1)) || new Constraint(node);
                case strictlyAfterToken:
                case 'after':
                    return this.parseAfter(node, children.slice(1), token === strictlyAfterToken) || new Constraint(node);
                default:
                    return new Constraint(node);
            }
        }
        else {
            return new Constraint(node);
        }

    }

    private parseNamedCondition(constraintNode: PddlSyntaxNode, children: PddlSyntaxNode[]): Constraint | undefined {
        if (children.length < 2) { return undefined; }

        if (!children[0].isType(PddlTokenType.Other)) { return undefined; }

        let name = children[0].getText();

        if (isOpenBracket(children[1].getToken())) {
            let condition = new Condition(children[1]);
            return new NamedConditionConstraint({ name: name, condition: condition }, constraintNode);
        }
        else {
            return undefined;
        }
    }

    private parseAfter(constraintNode: PddlSyntaxNode, children: PddlSyntaxNode[], strictly: boolean): Constraint | undefined {
        if (children.length < 2) { return undefined; }

        let predecessor = this.parseAfterGoal(children[0]);
        let successor = this.parseAfterGoal(children[1]);

        if (!(predecessor || successor)) { return undefined; }

        if (strictly) {
            return new StrictlyAfterConstraint(predecessor!, successor!, constraintNode);
        } else {
            return new AfterConstraint(predecessor!, successor!, constraintNode);
        }
    }

    private parseAfterGoal(nameOrConditionNode: PddlSyntaxNode): NamedConditionConstraint | undefined {
        if (nameOrConditionNode.isType(PddlTokenType.Other)) {
            let name = nameOrConditionNode.getText();
            return new NamedConditionConstraint({ name: name }, nameOrConditionNode);
        }
        else if (isOpenBracket(nameOrConditionNode.getToken())) {
            let condition = new Condition(nameOrConditionNode);
            return new NamedConditionConstraint({ condition: condition }, nameOrConditionNode);
        } else {
            return undefined;
        }
    }
}
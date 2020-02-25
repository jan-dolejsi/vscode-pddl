/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { Variable } from "./FileInfo";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlRange, DocumentPositionResolver } from "./DocumentPositionResolver";
import { parseParameters } from "./VariablesParser";

/** Parses derived predicates and functions. E.g.:
 * `(:derived (<p> ?x ?y - type) <condition> )`
 */
export class DerivedVariablesParser {
    private conditionNode: PddlSyntaxNode | undefined;
    private variable: Variable | undefined;

    constructor(derivedNode: PddlSyntaxNode, positionResolver: DocumentPositionResolver) {
        let children = derivedNode.getNonWhitespaceChildren()
            .filter(c => c.getToken().type !== PddlTokenType.Comment);
        if (children.length !== 2) {
            return;
        }

        let fullNameNode = children[0];
        if (fullNameNode.getToken().type !== PddlTokenType.OpenBracket) {
            return;
        }

        let fullName = fullNameNode.getNestedText();
        let parameters = parseParameters(fullName);

        this.conditionNode = children[1];
        this.variable = new Variable(fullName, parameters);
        let location = PddlRange.from(positionResolver
            .resolveToPosition(derivedNode.getStart()), positionResolver.resolveToPosition(derivedNode.getEnd()));
        this.variable.setLocation(location);
        this.variable.setDocumentation(DerivedVariablesParser.getDocumentationAbove(derivedNode));
    }

    static getDocumentationAbove(derivedNode: PddlSyntaxNode): string[] {
        let siblingNodes = derivedNode.getParent()?.getChildren() ?? [];

        let indexOfThisNode = siblingNodes.indexOf(derivedNode);

        // iterate backwards through the siblings and find first comment line
        // the previous sibling should be a white space
        let whiteSpaceIndex = indexOfThisNode - 1;
        if (whiteSpaceIndex < 0 || siblingNodes[whiteSpaceIndex].getToken().type !== PddlTokenType.Whitespace) {
            return [];
        }

        let commentIndex = whiteSpaceIndex - 1;
        if (commentIndex < 0 || siblingNodes[commentIndex].getToken().type !== PddlTokenType.Comment) {
            return [];
        }
        else {
            let documentation = siblingNodes[commentIndex].getText().substr(1).trim(); // strip the semicolon
            return [documentation];
        }
    }

    getVariable(): Variable | undefined {
        return this.variable;
    }

    getConditionNode(): PddlSyntaxNode | undefined {
        return this.conditionNode;
    }
}
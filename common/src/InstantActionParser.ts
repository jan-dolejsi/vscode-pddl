/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlRange, DocumentPositionResolver } from "./DocumentPositionResolver";
import { parseParameters } from "./VariablesParser";
import { InstantAction } from "./DomainInfo";
import { DerivedVariablesParser } from "./DerivedVariableParser";

/** 
 * Parses `(:action ...)` blocks.
 */
export class InstantActionParser {
    private action: InstantAction;

    constructor(actionNode: PddlSyntaxNode, positionResolver: DocumentPositionResolver) {

        /*(:action|process|event name
            :parameters (<parameters>)
            :precondition (and <conditions>)
            :effect (and <effects>)
        )*/

        let nameNode = actionNode.getFirstChild(PddlTokenType.Other, /[\w-]+/);

        let actionName = nameNode ? nameNode.getText() : undefined;

        let parametersNode = actionNode.getKeywordOpenBracket('parameters');
        let parameters = parametersNode ? parseParameters(parametersNode.getNestedText()) : [];
        let conditionNode = actionNode.getKeywordOpenBracket('precondition');
        let effectNode = actionNode.getKeywordOpenBracket('effect');
        this.action = new InstantAction(actionName, parameters, conditionNode, effectNode);
        let location = PddlRange.from(positionResolver
            .resolveToPosition(actionNode.getStart()), positionResolver.resolveToPosition(actionNode.getEnd()));
        this.action.setLocation(location);
        this.action.setDocumentation(DerivedVariablesParser.getDocumentationAbove(actionNode));
    }

    getAction(): InstantAction {
        return this.action;
    }
}
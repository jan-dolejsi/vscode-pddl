/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlRange, DocumentPositionResolver } from "./DocumentPositionResolver";
import { parseParameters } from "./VariablesParser";
import { DurativeAction } from "./DomainInfo";
import { DerivedVariablesParser } from "./DerivedVariableParser";

/** 
 * Parses `(:durative-action ...)` blocks.
 */
export class DurativeActionParser {
    private action: DurativeAction;

    constructor(actionNode: PddlSyntaxNode, positionResolver: DocumentPositionResolver) {

        /*(:durative-action name
            :parameters (<parameters>)
            :duration (<duration constraint>)
            :condition (and
                (at start (<condition>))
                (over all (<condition>))
                (at end (<condition>))
            )
            :effect (and
                (at start (<effect>))
                (at end (<effect>))
                (increase (<function>) (* #t <expression>))
                (decrease (<function>) (* #t <expression>))
            )
        )*/

        let nameNode = actionNode.getFirstChild(PddlTokenType.Other, /[\w-]+/);

        let actionName = nameNode ? nameNode.getText() : undefined;

        let parametersNode = actionNode.getKeywordOpenBracket('parameters');
        let parameters = parametersNode ? parseParameters(parametersNode.getNestedNonCommentText()) : [];
        
        let durationNode = actionNode.getKeywordOpenBracket('duration');
        let conditionNode = actionNode.getKeywordOpenBracket('condition');
        let effectNode = actionNode.getKeywordOpenBracket('effect');
        
        this.action = new DurativeAction(actionName, parameters, durationNode, conditionNode, effectNode);
        let location = PddlRange.from(positionResolver
            .resolveToPosition(actionNode.getStart()), positionResolver.resolveToPosition(actionNode.getEnd()));
        this.action.setLocation(location);
        this.action.setDocumentation(DerivedVariablesParser.getDocumentationAbove(actionNode));
    }

    getAction(): DurativeAction {
        return this.action;
    }
}
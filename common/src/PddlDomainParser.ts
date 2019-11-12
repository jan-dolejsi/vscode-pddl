/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { FileInfo, Variable } from "./FileInfo";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { VariablesParser } from "./VariablesParser";
import { DocumentPositionResolver } from "./DocumentPositionResolver";
import { DerivedVariablesParser } from "./DerivedVariableParser";
import { DomainInfo, Action } from "./DomainInfo";
import { PddlSyntaxTree } from "./PddlSyntaxTree";
import { InstantActionParser } from "./InstantActionParser";
import { DurativeActionParser } from "./DurativeActionParser";
import { PddlInheritanceParser } from "./PddlInheritanceParser";
import { PddlConstraintsParser } from "./PddlConstraintsParser";

/**
 * Planning Domain parser.
 */
export class PddlDomainParser {
    private domainInfo: DomainInfo;
    
    constructor(fileUri: string, fileVersion: number, fileText: string, domainNode: PddlSyntaxNode, syntaxTree: PddlSyntaxTree, private positionResolver: DocumentPositionResolver) {
        let domainNameNode = domainNode.getFirstChild(PddlTokenType.Other, /./);
        if (!domainNameNode) { return null; }
        let domainName = domainNameNode.getToken().tokenText;

        this.domainInfo = new DomainInfo(fileUri, fileVersion, domainName, syntaxTree, positionResolver);
        this.domainInfo.setText(fileText);
        this.parseDomainStructure();
    }

    getDomain(): DomainInfo {
        return this.domainInfo;
    }

    private parseDomainStructure(): void {

        let defineNode = this.domainInfo.syntaxTree.getDefineNodeOrThrow();
        PddlDomainParser.parseRequirements(defineNode, this.domainInfo);

        let typesNode = defineNode.getFirstOpenBracket(':types');
        if (typesNode) {
            this.domainInfo.setTypeInheritance(PddlInheritanceParser.parseInheritance(typesNode.getNestedNonCommentText()), typesNode, this.positionResolver);
        }

        let constantsNode = defineNode.getFirstOpenBracket(':constants');
        if (constantsNode) {
            let constantsText = constantsNode.getNestedNonCommentText();
            this.domainInfo.setConstants(PddlInheritanceParser.toTypeObjects(PddlInheritanceParser.parseInheritance(constantsText)));
        }

        let predicatesNode = defineNode.getFirstOpenBracket(':predicates');
        if (predicatesNode) {
            let predicates = new VariablesParser(predicatesNode, this.positionResolver).getVariables();
            this.domainInfo.setPredicates(predicates);
        }

        let functionsNode = defineNode.getFirstOpenBracket(':functions');
        if (functionsNode) {
            let functions = new VariablesParser(functionsNode, this.positionResolver).getVariables();
            this.domainInfo.setFunctions(functions);
        }

        this.domainInfo.setDerived(PddlDomainParser.parseDerived(defineNode, this.positionResolver));

        const instantActions = this.parseActionProcessOrEvent(defineNode, this.positionResolver, "action");
        const durativeActions = this.parseDurativeActions(defineNode, this.positionResolver);
        this.domainInfo.setActions(instantActions.concat(durativeActions));

        const processes = this.parseActionProcessOrEvent(defineNode, this.positionResolver, "process");
        const events = this.parseActionProcessOrEvent(defineNode, this.positionResolver, "event");
        this.domainInfo.setProcesses(processes);
        this.domainInfo.setEvents(events);
        
        let constraintsNode = defineNode.getFirstOpenBracket(':constraints');
        if (constraintsNode) {
            const constraints = new PddlConstraintsParser().parseConstraints(constraintsNode);
            this.domainInfo.setConstraints(constraints);
        }
    }
    
    static parseRequirements(defineNode: PddlSyntaxNode, fileInfo: FileInfo) {
        let requirementsNode = defineNode.getFirstOpenBracket(':requirements');
        if (requirementsNode) {
            let requirements = requirementsNode.getNonWhitespaceChildren()
                .filter(node => node.getToken().type === PddlTokenType.Keyword)
                .map(node => node.getToken().tokenText);
            fileInfo.setRequirements(requirements);
        }
    }

    static parseDerived(defineNode: PddlSyntaxNode, positionResolver: DocumentPositionResolver): Variable[] {
        return defineNode.getChildrenOfType(PddlTokenType.OpenBracketOperator, /\(\s*:derived$/)
            .map(derivedNode => new DerivedVariablesParser(derivedNode, positionResolver).getVariable())
            .filter(derived => !!derived);
    }

    parseActionProcessOrEvent(defineNode: PddlSyntaxNode, positionResolver: DocumentPositionResolver, keyword: string): Action[] {
        return defineNode.getChildrenOfType(PddlTokenType.OpenBracketOperator, new RegExp("\\(\\s*:" + keyword + "$"))
            .map(actionNode => new InstantActionParser(actionNode, positionResolver).getAction())
            .filter(action => !!action);
    }

    parseDurativeActions(defineNode: PddlSyntaxNode, positionResolver: DocumentPositionResolver): Action[] {
        return defineNode.getChildrenOfType(PddlTokenType.OpenBracketOperator, /\(\s*:durative-action$/)
            .map(actionNode => new DurativeActionParser(actionNode, positionResolver).getAction())
            .filter(action => !!action);
    }
}

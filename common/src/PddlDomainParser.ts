/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
'use strict';

import { DirectionalGraph } from "./DirectionalGraph";
import { FileInfo, Variable } from "./FileInfo";
import { PddlTokenType } from "./PddlTokenizer";
import { PddlSyntaxNode } from "./PddlSyntaxNode";
import { VariablesParser } from "./VariablesParser";
import { DocumentPositionResolver } from "./DocumentPositionResolver";
import { DerivedVariablesParser } from "./DerivedVariableParser";
import { DomainInfo, TypeObjects, Action } from "./DomainInfo";
import { PddlSyntaxTree } from "./PddlSyntaxTree";
import { InstantActionParser } from "./InstantActionParser";
import { DurativeActionParser } from "./DurativeActionParser";

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
            this.domainInfo.setTypeInheritance(PddlDomainParser.parseInheritance(typesNode.getNestedText()), typesNode, this.positionResolver);
        }

        let constantsNode = defineNode.getFirstOpenBracket(':constants');
        if (constantsNode) {
            let constantsText = constantsNode.getNestedText();
            this.domainInfo.setConstants(PddlDomainParser.toTypeObjects(PddlDomainParser.parseInheritance(constantsText)));
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
    }

    static toTypeObjects(graph: DirectionalGraph): TypeObjects[] {
        let typeSet = new Set<string>(graph.getEdges().map(edge => edge[1]));
        let typeObjects: TypeObjects[] = Array.from(typeSet).map(type => new TypeObjects(type));

        graph.getVertices().forEach(obj => {
            graph.getVerticesWithEdgesFrom(obj).forEach(type => typeObjects.find(to => to.type === type).addObject(obj));
        });

        return typeObjects;
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
    
    static parseInheritance(declarationText: string): DirectionalGraph {

        // the inheritance graph is captured as a two dimensional array, where the first index is the types themselves, the second is the parent type they inherit from (PDDL supports multiple inheritance)
        let inheritance = new DirectionalGraph();

        if (!declarationText) { return inheritance; }

        // if there are root types that do not inherit from 'object', add the 'object' inheritance.
        // it will make the following regex work
        if (!declarationText.match(/-\s+\w[\w-]*\s*$/)) {
            declarationText += ' - object';
        }

        let pattern = /(\w[\w-]*\s+)+-\s+\w[\w-]*/g;
        let match;
        while (match = pattern.exec(declarationText)) {
            // is this a group with inheritance?
            let fragments = match[0].split(/\s-/);
            let parent = fragments.length > 1 ? fragments[1].trim() : null;
            let children = fragments[0].trim().split(/\s+/g);

            children.forEach(childType => inheritance.addEdge(childType, parent));
        }

        return inheritance;
    }
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    TextDocument, CancellationToken, SymbolInformation,
    DocumentSymbolProvider, DefinitionProvider, ReferenceProvider, Position, ReferenceContext, Location, HoverProvider, Hover, SymbolKind, DocumentSymbol, Range
} from 'vscode';
import { SymbolUtils } from './SymbolUtils';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { nodeToRange, showError } from '../utils';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { PddlSyntaxNode } from '../../../common/src/PddlSyntaxNode';

export class SymbolInfoProvider implements DocumentSymbolProvider, DefinitionProvider, ReferenceProvider, HoverProvider {
    symbolUtils: SymbolUtils;

    constructor(public pddlWorkspace: CodePddlWorkspace) {
        this.symbolUtils = new SymbolUtils(pddlWorkspace);
    }

    async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover> {
        if (token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let info = this.symbolUtils.getSymbolInfo(document, position);
        return info?.hover;
    }

    async provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): Promise<Location[]> {
        if (token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let info = this.symbolUtils.getSymbolInfo(document, position);
        if (!info) { return []; }

        return this.symbolUtils.findSymbolReferences(document, info, context.includeDeclaration);
    }

    async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Location | Location[]> {
        if (token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let info = this.symbolUtils.getSymbolInfo(document, position);
        return info?.location;
    }

    async provideDocumentSymbols(document: TextDocument, token: CancellationToken): Promise<SymbolInformation[] | DocumentSymbol[]> {
        if (token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let fileInfo = this.pddlWorkspace.getFileInfo(document);

        if (fileInfo.isDomain()) {

            let domainInfo = <DomainInfo>fileInfo;

            let containerName = '';

            let actionSymbols = domainInfo.getActions().map(action =>
                new SymbolInformation(action.name, SymbolKind.Module, containerName, SymbolUtils.toLocation(document, action.getLocation())));

            let processSymbols = domainInfo.getProcesses().map(process =>
                new SymbolInformation(process.name, SymbolKind.Struct, containerName, SymbolUtils.toLocation(document, process.getLocation())));

            let eventSymbols = domainInfo.getEvents().map(event =>
                new SymbolInformation(event.name, SymbolKind.Event, containerName, SymbolUtils.toLocation(document, event.getLocation())));

            let predicateSymbols = domainInfo.getPredicates().map(variable =>
                new SymbolInformation(variable.declaredName, SymbolKind.Boolean, containerName, SymbolUtils.toLocation(document, variable.getLocation())));

            let functionSymbols = domainInfo.getFunctions().map(variable =>
                new SymbolInformation(variable.declaredName, SymbolKind.Function, containerName, SymbolUtils.toLocation(document, variable.getLocation())));

            let symbols = actionSymbols.concat(processSymbols, eventSymbols, predicateSymbols, functionSymbols);

            return symbols;
        }
        else if (fileInfo.isProblem()) {
            let problemInfo = <ProblemInfo>fileInfo;

            try {
                return this.provideProblemSymbols(document, problemInfo, token);
            } catch (err) {
                showError(err);
            }
        }
        return [];
    }

    async provideProblemSymbols(document: TextDocument, problemInfo: ProblemInfo, token: CancellationToken): Promise<DocumentSymbol[]> {
        if (token.isCancellationRequested) { return null; }
        let defineNode = problemInfo.syntaxTree.getDefineNode();

        if (defineNode) {
            let fullRange = nodeToRange(document, defineNode);
            let firstLine = firstRow(fullRange);
            let defineSymbol = new DocumentSymbol('problem', problemInfo.name, SymbolKind.Namespace, fullRange, firstLine);

            let childrenNodes = defineNode.getChildrenOfType(PddlTokenType.OpenBracketOperator, /\(\s*:/);
            let childrenSymbols = childrenNodes
                .map(node => this.createProblemSymbol(document, node));
            return [defineSymbol].concat(childrenSymbols);
        }

        return [];
    }

    private createProblemSymbol(document: TextDocument, node: PddlSyntaxNode) {
        let fullRange = nodeToRange(document, node);
        let selectableRange = new Range(document.positionAt(node.getToken().getStart() + 1), document.positionAt(node.getToken().getEnd()));
        return new DocumentSymbol(node.getToken().tokenText.substr(1), '', SymbolKind.Package, fullRange, selectableRange);
    }
}
function firstRow(fullRange: Range) {
    return fullRange.with({ end: fullRange.start.translate({ lineDelta: +1 }).with({ character: 0 }) });
}


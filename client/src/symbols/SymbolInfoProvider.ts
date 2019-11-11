/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, CancellationToken, SymbolInformation,
    DocumentSymbolProvider, DefinitionProvider, ReferenceProvider, Position, ReferenceContext, Location, HoverProvider, Hover, SymbolKind } from 'vscode';
import { SymbolUtils } from './SymbolUtils';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';

export class SymbolInfoProvider implements DocumentSymbolProvider, DefinitionProvider, ReferenceProvider, HoverProvider {
    symbolUtils: SymbolUtils;

    constructor(public pddlWorkspace: CodePddlWorkspace) {
        this.symbolUtils = new SymbolUtils(pddlWorkspace);
    }

    async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover> {
        if(token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let info = this.symbolUtils.getSymbolInfo(document, position);
        return info ? info.hover : null;
    }

    async provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): Promise<Location[]> {
        if(token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let info = this.symbolUtils.getSymbolInfo(document, position);
        if (!info) { return []; }

        return this.symbolUtils.findSymbolReferences(document, info, context.includeDeclaration);
    }

    async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Location | Location[]> {
        if(token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let info = this.symbolUtils.getSymbolInfo(document, position);
        return info ? info.location : null;
    }

    async provideDocumentSymbols(document: TextDocument, token: CancellationToken): Promise<SymbolInformation[]> {
        if(token.isCancellationRequested) { return null; }
        await this.symbolUtils.assertFileParsed(document);

        let fileInfo = this.pddlWorkspace.getFileInfo(document);

        if(!fileInfo.isDomain()) { return []; }

        let domainInfo = <DomainInfo>fileInfo;

        let containerName = '';

        let actionSymbols = domainInfo.getActions().map(action =>
            new SymbolInformation(action.name, SymbolKind.Module, containerName, SymbolUtils.toLocation(document, action.getLocation())));

        let predicateSymbols = domainInfo.getPredicates().map(variable =>
            new SymbolInformation(variable.declaredName, SymbolKind.Boolean, containerName, SymbolUtils.toLocation(document, variable.getLocation())));

        let functionSymbols = domainInfo.getFunctions().map(variable =>
            new SymbolInformation(variable.declaredName, SymbolKind.Function, containerName, SymbolUtils.toLocation(document, variable.getLocation())));

        let symbols = actionSymbols.concat(predicateSymbols, functionSymbols);

        return symbols;
    }

}

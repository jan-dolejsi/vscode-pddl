/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionItemKind } from 'vscode';
import { PddlWorkspace } from '../../../common/src/workspace-model';
import { DomainInfo } from '../../../common/src/parser';
import { FileInfo, Variable } from '../../../common/src/FileInfo';
import { Delegate } from './Delegate';
import { SymbolUtils } from '../SymbolUtils';

export class VariableDelegate extends Delegate {

    symbolUtils: SymbolUtils;

    constructor(public workspace: PddlWorkspace) {
        super();
        this.symbolUtils = new SymbolUtils(workspace);
    }

    getVariableItems(fileInfo: FileInfo): CompletionItem[] {
        let domainInfo = this.workspace.asDomain(fileInfo);
        if (!domainInfo) return [];
        let predicates = this.getPredicates(domainInfo).map(p => this.createPredicate(p));
        let functions = this.getFunctions(domainInfo).map(f => this.createFunction(f));
        let derived = this.getDerived(domainInfo).map(d => this.createDerived(d));

        return predicates.concat(functions).concat(derived);
    }

    private getPredicates(domainInfo: DomainInfo): Variable[] {
        let predicates = domainInfo.getPredicates();
        predicates.forEach(p => domainInfo.findVariableLocation(p));
        return predicates;
    }

    private getFunctions(domainInfo: DomainInfo): Variable[] {
        let functions = domainInfo.getFunctions();
        functions.forEach(f => domainInfo.findVariableLocation(f));
        return functions;
    }

    private getDerived(domainInfo: DomainInfo): Variable[] {
        let derived = domainInfo.getDerived();
        derived.forEach(d => domainInfo.findVariableLocation(d));
        return derived;
    }

    private createPredicate(predicate: Variable): CompletionItem {
        return this.createSymbol(predicate, 'Predicate', CompletionItemKind.Value);
    }

    private createFunction(functionSymbol: Variable): CompletionItem {
        return this.createSymbol(functionSymbol, 'Function', CompletionItemKind.Reference);
    }

    private createDerived(derivedSymbol: Variable): CompletionItem {
        return this.createSymbol(derivedSymbol, 'Derived predicate/function', CompletionItemKind.Field);
    }

    private createSymbol(symbol: Variable, title: string, kind: CompletionItemKind) {
        let markdownString = this.symbolUtils.createSymbolMarkdownDocumentation(undefined, `(${symbol.declaredName})`, symbol.getDocumentation());
        let completionItem = this.createCompletionItem(symbol.declaredName, title, markdownString, kind);
        completionItem.insertText = symbol.declaredNameWithoutTypes;
        return completionItem;
    }
}
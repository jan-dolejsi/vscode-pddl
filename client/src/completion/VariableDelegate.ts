/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionItemKind } from 'vscode';
import { FileInfo, Variable } from 'pddl-workspace';
import { Delegate } from './Delegate';
import { SymbolUtils } from '../symbols/SymbolUtils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';

export class VariableDelegate extends Delegate {

    symbolUtils: SymbolUtils;

    constructor(public workspace: CodePddlWorkspace) {
        super();
        this.symbolUtils = new SymbolUtils(workspace);
    }

    getVariableItems(fileInfo: FileInfo): CompletionItem[] {
        const domainInfo = this.workspace.pddlWorkspace.asDomain(fileInfo);
        if (!domainInfo) { return []; }
        const predicates = domainInfo.getPredicates().map(p => this.createPredicate(p));
        const functions = domainInfo.getFunctions().map(f => this.createFunction(f));
        const derived = domainInfo.getDerived().map(d => this.createDerived(d));

        return predicates.concat(functions).concat(derived);
    }

    private createPredicate(predicate: Variable): CompletionItem {
        return this.createSymbol(predicate, 'Predicate', CompletionItemKind.Value);
    }

    private createFunction(functionSymbol: Variable): CompletionItem {
        return this.createSymbol(functionSymbol, 'Function', CompletionItemKind.Unit);
    }

    private createDerived(derivedSymbol: Variable): CompletionItem {
        return this.createSymbol(derivedSymbol, 'Derived predicate/function', CompletionItemKind.Interface);
    }

    private createSymbol(symbol: Variable, title: string, kind: CompletionItemKind): CompletionItem {
        const markdownString = this.symbolUtils.createSymbolMarkdownDocumentation(undefined, `(${symbol.declaredName})`, symbol.getDocumentation());
        const completionItem = this.createCompletionItem(symbol.declaredName, title, markdownString, kind);
        completionItem.insertText = symbol.declaredNameWithoutTypes;
        return completionItem;
    }
}
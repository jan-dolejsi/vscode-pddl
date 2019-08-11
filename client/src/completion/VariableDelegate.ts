/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionItemKind } from 'vscode';
import { FileInfo, Variable } from '../../../common/src/FileInfo';
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
        let domainInfo = this.workspace.pddlWorkspace.asDomain(fileInfo);
        if (!domainInfo) { return []; }
        let predicates = domainInfo.getPredicates().map(p => this.createPredicate(p));
        let functions = domainInfo.getFunctions().map(f => this.createFunction(f));
        let derived = domainInfo.getDerived().map(d => this.createDerived(d));

        return predicates.concat(functions).concat(derived);
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
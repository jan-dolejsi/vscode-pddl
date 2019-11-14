/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionContext, MarkdownString, Range, CompletionTriggerKind, CompletionItemKind } from 'vscode';
import { PDDL } from '../../../common/src/parser';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { PddlSyntaxNode } from '../../../common/src/PddlSyntaxNode';
import { AbstractCompletionItemProvider, Suggestion } from './AbstractCompletionItemProvider';
import { requires } from './DomainCompletionItemProvider';

export class DurativeActionEffectCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();

        let requiresDurativeActions = requires([':durative-actions']);

        this.addSuggestionDocumentation('at start', 'At start effect',
            new MarkdownString('Effect that takes place at the *start* point of a durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n:condition (and (at start (...) ) )\n:effect (and (at start (...) ) ) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);

        this.addSuggestionDocumentation('at end', 'At end effect',
            new MarkdownString('Effect that takes place at the *end* point of a durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n:condition (and (at end (...) ) )\n:effect (and (at end (...) ) ) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);
    }

    static inside(currentNode: PddlSyntaxNode) {
        return DurativeActionEffectCompletionItemProvider.insideEffect(currentNode)
            && DurativeActionEffectCompletionItemProvider.insideDurativeActionUnqualifiedEffect(currentNode);
    }

    static insideEffect(currentNode: PddlSyntaxNode) {
        return currentNode.findAncestor(PddlTokenType.Keyword, /^\s*:effect$/i) !== undefined;
    }

    static insideDurativeActionUnqualifiedEffect(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*:durative-action/i) !== undefined
            && currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /\(\s*(at start|at end)/i) === undefined;
    }

    provide(_domainInfo: DomainInfo, context: CompletionContext, range: Range | null): (CompletionItem | null)[] {
        if (context.triggerKind !== CompletionTriggerKind.Invoke && context.triggerCharacter !== '(') { return []; }

        return [
            this.createSnippetCompletionItem(Suggestion.from("at start", context.triggerCharacter, '('),
                "(at start $0)",
                range, context, 1),
            this.createSnippetCompletionItem(Suggestion.from("at end", context.triggerCharacter, '('),
                "(at end $0)",
                range, context, 2)
        ];
    }
}
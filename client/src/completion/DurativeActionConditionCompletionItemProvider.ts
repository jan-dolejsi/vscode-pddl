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

export class DurativeActionConditionCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();

        let requiresDurativeActions = requires([':durative-actions']);

        this.addSuggestionDocumentation('at start', 'At start condition',
            new MarkdownString('Condition that applies at the *start* point of a durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n\t:condition (and (at start (...) ) )\n\t:effect (and (at start (...) ) ) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);

        this.addSuggestionDocumentation('at end', 'At end condition',
            new MarkdownString('Condition that applies at the *end* point of a durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n\t:condition (and (at end (...) ) )\n\t:effect (and (at end (...) ) ) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);

        this.addSuggestionDocumentation('over all', 'Over all condition',
            new MarkdownString('Over-all (a.k.a. _invariant_) condition that applies for the entire duration of the durative action. Only use this inside a `:durative-action`.')
                .appendCodeblock('(:durative-action\n\t:condition (and (over all (...) ) )\n) \n)', PDDL)
                .appendMarkdown(requiresDurativeActions),
            CompletionItemKind.Property);
    }

    static inside(currentNode: PddlSyntaxNode) {
        return DurativeActionConditionCompletionItemProvider.insideCondition(currentNode)
            && DurativeActionConditionCompletionItemProvider.insideDurativeActionUnqualifiedCondition(currentNode);
    }

    static insideCondition(currentNode: PddlSyntaxNode) {
        return currentNode.findAncestor(PddlTokenType.Keyword, /^\s*:condition$/i) !== undefined;
    }

    static insideDurativeActionUnqualifiedCondition(currentNode: PddlSyntaxNode): boolean {
        return currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /^\(\s*:durative-action/i) !== undefined
            && currentNode.findAncestor(PddlTokenType.OpenBracketOperator, /^\(\s*(at start|at end|over all)/i) === undefined;
    }

    provide(_domainInfo: DomainInfo, context: CompletionContext, range: Range | null): (CompletionItem | null)[] {
        if (context.triggerKind !== CompletionTriggerKind.Invoke && context.triggerCharacter !== '(') { return []; }

        return [
            this.createSnippetCompletionItem(Suggestion.from("at start", context.triggerCharacter, '('),
                "(at start $0)",
                range, context, 1),
            this.createSnippetCompletionItem(Suggestion.from("at end", context.triggerCharacter, '('),
                "(at end $0)",
                range, context, 2),
            this.createSnippetCompletionItem(Suggestion.from("over all", context.triggerCharacter, '('),
                "(over all $0)",
                range, context, 3)
        ];
    }
}
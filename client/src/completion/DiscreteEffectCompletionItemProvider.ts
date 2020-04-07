/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionContext, MarkdownString, CompletionItemKind, Range, CompletionTriggerKind } from 'vscode';
import { PDDL } from 'pddl-workspace';
import { DomainInfo, parser, ModelHierarchy } from 'pddl-workspace';
import { AbstractCompletionItemProvider, Suggestion } from './AbstractCompletionItemProvider';
import { Delegate } from './Delegate';
import { requires, toSelection } from './DomainCompletionItemProvider';

export class DiscreteEffectCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();
        const discreteEffectHint = 'Use this either in instantaneous `:action`\'s `:effect`, or in `:durative-action`\'s `(at start ...)` or `(at end ...)` effect.';
        const requiresFluents = requires([':fluents']);

        this.addSuggestionDocumentation('not', 'Assigns `false` to a predicate',
            new MarkdownString('Makes predicate false:')
                .appendCodeblock('(not (at ?location))', PDDL)
                .appendMarkdown(discreteEffectHint), CompletionItemKind.Function);

        this.addSuggestionDocumentation('assign', 'Numeric assign effect',
            new MarkdownString('Assigns value to the function, for example:')
                .appendCodeblock('(assign (function1) 3.14)', PDDL)
                .appendMarkdown(discreteEffectHint)
                .appendMarkdown(requiresFluents), CompletionItemKind.Method);

        this.addSuggestionDocumentation('increase', 'Discrete numeric increase effect',
            new MarkdownString('For example to increment a function value by `3.14`, use')
                .appendCodeblock('(increase (function1) 3.14)', PDDL)
                .appendMarkdown(discreteEffectHint)
                .appendMarkdown(requiresFluents), CompletionItemKind.Method);

        this.addSuggestionDocumentation('decrease', 'Discrete numeric decrease effect',
            new MarkdownString('For example to decrement a function value by `3.14`, use')
                .appendCodeblock('(decrease (function1) 3.14)', PDDL)
                .appendMarkdown(discreteEffectHint)
                .appendMarkdown(requiresFluents), CompletionItemKind.Method);

        this.addSuggestionDocumentation('forall', 'For all effect',
            new MarkdownString('Effect that shall be applied to all objects of specified type. For example:')
                .appendCodeblock('(forall (?p - product) (sold_out ?p))', PDDL), CompletionItemKind.TypeParameter);

        this.addSuggestionDocumentation('when', 'Conditional effect',
            new MarkdownString('Effect that shall only be applied when a condition is met. For example:')
                .appendCodeblock('(when (at ?location) (not (at ?location)))', PDDL)
                .appendMarkdown(discreteEffectHint)
                .appendMarkdown(requires([':conditional-effects'])), CompletionItemKind.Method);
    }

    static inside(currentNode: parser.PddlSyntaxNode): boolean {
        return ModelHierarchy.isInsideEffect(currentNode)
            && (ModelHierarchy.isInsideActionOrEvent(currentNode)
                || ModelHierarchy.isInsideDurativeActionDiscreteEffect(currentNode));
    }

    provide(domainInfo: DomainInfo, context: CompletionContext, range: Range | null): (CompletionItem | null)[] {
        if (context.triggerKind !== CompletionTriggerKind.Invoke && context.triggerCharacter !== '(') { return []; }

        const functions = domainInfo.getFunctions();
        const functionNamesCsv = Delegate.toTypeLessNamesCsv(functions);

        const predicates = domainInfo.getPredicates();
        const predicateNamesCsv = Delegate.toTypeLessNamesCsv(predicates);

        return [
            this.createSnippetCompletionItem(Suggestion.from("not", context.triggerCharacter, '('),
                "(not (" + toSelection(1, predicateNamesCsv, "new_predicate") + "))$0",
                range, context, 0),
            this.createSnippetCompletionItem(Suggestion.from("assign", context.triggerCharacter, '('),
                "(assign (" + toSelection(1, functionNamesCsv, "new_function") + ") ${2:0})$0",
                range, context, 1),
            this.createSnippetCompletionItem(Suggestion.from("increase", context.triggerCharacter, '('),
                "(increase (" + toSelection(1, functionNamesCsv, "new_function") + ") ${2:1})$0",
                range, context, 2),
            this.createSnippetCompletionItem(Suggestion.from("decrease", context.triggerCharacter, '('),
                "(decrease (" + toSelection(1, functionNamesCsv, "new_function") + ") ${2:1})$0",
                range, context, 3),
            this.createSnippetCompletionItem(Suggestion.from("forall", context.triggerCharacter, '('),
                "(forall ($1) $2)$0",
                range, context, 4),
            this.createSnippetCompletionItem(Suggestion.from("when", context.triggerCharacter, '('),
                "(when ${1:condition} ${2:effect})$0",
                range, context, 5)
        ];
    }
}
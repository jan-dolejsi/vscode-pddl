/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionContext, MarkdownString, CompletionItemKind, Range, CompletionTriggerKind } from 'vscode';
import { PDDL } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { ModelHierarchy } from 'pddl-workspace';
import { parser } from 'pddl-workspace';
import { AbstractCompletionItemProvider, Suggestion } from './AbstractCompletionItemProvider';
import { Delegate } from './Delegate';
import { toSelection, requires } from './DomainCompletionItemProvider';

export class ContinuousEffectCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();
        let continuousEffectHint = 'Use this in `:durative-action`\'s `:effect` block. Do not use it inside `(at start ...)` or `(at end ...)` effect. Example usage:';
        let continuousEffectExample = `(:durative-action
...
:effect (and 
    (at start ...)
    (increase (function1) (* #t 2.0))
    (decrease (function2) (* #t 3.0))
    (at end ...)
)`;
        let requiresContinuousEffects = requires([':continuous-effects']);

        this.addSuggestionDocumentation('increase', 'Continuous numeric increase effect',
            new MarkdownString('For example to increment a function value by *twice* the amount of time that elapsed since action started, use:')
            .appendCodeblock('(increase (function1) (* $t 2.0))', PDDL)
            .appendMarkdown(continuousEffectHint)
            .appendCodeblock(continuousEffectExample)
            .appendMarkdown(requiresContinuousEffects), CompletionItemKind.Method);

        this.addSuggestionDocumentation('decrease', 'Continuous numeric decrease effect',
            new MarkdownString('For example to decrement a function value by *twice* the amount of time that elapsed since action started, use:')
            .appendCodeblock('(decrease (function1) (* $t 2.0))', PDDL)
            .appendMarkdown(continuousEffectHint)
            .appendCodeblock(continuousEffectExample)
            .appendMarkdown(requiresContinuousEffects), CompletionItemKind.Method);

        this.addSuggestionDocumentation('forall', 'For all duration-dependent effect',
            new MarkdownString('Effect that shall be applied to all objects of specified type. For example:')
                .appendCodeblock('(forall (?p - product) (increase (stock ?p) (* #t 2.0))))', PDDL), CompletionItemKind.TypeParameter);
    }

    static inside(currentNode: parser.PddlSyntaxNode) {
        return ModelHierarchy.isInsideEffect(currentNode)
            && (ModelHierarchy.isInsideProcess(currentNode)
                || ModelHierarchy.isInsideDurativeActionUnqualifiedEffect(currentNode));
    }

    provide(domainInfo: DomainInfo, context: CompletionContext, range: Range | null): (CompletionItem | null)[] {
        if (context.triggerKind !== CompletionTriggerKind.Invoke && context.triggerCharacter !== '(') { return []; }

        let functions = domainInfo.getFunctions();
        let functionNamesCsv = Delegate.toTypeLessNamesCsv(functions);

        return [
            this.createSnippetCompletionItem(Suggestion.from("increase", context.triggerCharacter, '('),
                "(increase (" + toSelection(1, functionNamesCsv, "new_function") + ") (* #t ${2:1.0}))$0",
                range, context, 2),
            this.createSnippetCompletionItem(Suggestion.from("decrease", context.triggerCharacter, '('),
                "(decrease (" + toSelection(1, functionNamesCsv, "new_function") + ") (* #t ${2:1.0}))$0",
                range, context, 3),
            this.createSnippetCompletionItem(Suggestion.from("forall", context.triggerCharacter, '('),
                "(forall ($1) $2)$0",
                range, context, 4),
        ];
    }
}
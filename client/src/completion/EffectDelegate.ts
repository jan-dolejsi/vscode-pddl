/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, MarkdownString, SnippetString } from 'vscode';
import { PddlWorkspace } from '../../../common/src/workspace-model';
import { FileInfo, Variable, DomainInfo } from '../../../common/src/parser';
import { Delegate } from './delegate';

var PDDL = 'pddl';

export class EffectDelegate extends Delegate {

    constructor(public workspace: PddlWorkspace) {
        super();
    }

    getNumericEffectItems(fileInfo: FileInfo): CompletionItem[] {
        let domainInfo = this.workspace.asDomain(fileInfo);
        if (!domainInfo) return [];
        let functions = this.getFunctions(domainInfo);
        if (!functions.length) return [];
        let namesCsv = Delegate.toTypeLessNamesCsv(functions);

        let discreteEffectHint = 'Use this either in instantaneous `:action`\'s `:effect`, or in `:durative-action`\'s `(at start ...)` or `(at end ...)` effect.';

        let discreteIncrease = this.createOperator('increase', 'Discrete numeric increase effect', new MarkdownString('For example to increment a function value by `3.14`, use')
            .appendCodeblock('(increase (function1) 3.14)', PDDL)
            .appendMarkdown(discreteEffectHint));
        discreteIncrease.insertText = new SnippetString(
            "increase (${1|" + namesCsv + "|}) $0"
        );

        let discreteDecrease = this.createOperator('decrease', 'Discrete numerical decrease effect', new MarkdownString('For example to decrease a function value by `3.14`, use')
            .appendCodeblock('(decrease (function1) 3.14)', PDDL)
            .appendMarkdown(discreteEffectHint));
        discreteDecrease.insertText = new SnippetString(
            "decrease (${1|" + namesCsv + "|}) $0"
        );

        let discreteAssign = this.createOperator('assign', 'Numeric assign effect', new MarkdownString('Assigns value to the function, for example:')
            .appendCodeblock('assign (function1) 3.14)', PDDL)
            .appendMarkdown(discreteEffectHint));
        discreteAssign.insertText = new SnippetString(
            "assign (${1|" + namesCsv + "|}) $0"
        );

        let continuousEffectHint = 'Use this in `:durative-action`\'s `:effect` block. Do not use it inside `(at start ...)` or `(at end ...)` effect. Example usage:';
        let continuousEffectExample = `(:durative-action
...
:effect (and 
    (at start ...)
    (increase (function1) (* #t 2.0))
    (decrease (function2) (* #t 3.0))
    (at end ...)
)`;

        let continuousIncrease = this.createOperator('increase', 'Continuous numeric increase effect', new MarkdownString('For example to increment a function value by *twice* the amount of time that elapsed since action started, use:')
            .appendCodeblock('(increase (function1) (* $t 2.0))', PDDL)
            .appendMarkdown(continuousEffectHint)
            .appendCodeblock(continuousEffectExample));
        continuousIncrease.insertText = new SnippetString(
            "increase (${1|" + namesCsv + "|}) (* #t ${2:1.0})"
        );

        let continuousDecrease = this.createOperator('decrease', 'Continuous numeric decrease effect', new MarkdownString('For example to decrement a function value by *twice* the amount of time that elapsed since action started, use:')
            .appendCodeblock('(decrease (function1) (* $t 2.0))', PDDL)
            .appendMarkdown(continuousEffectHint)
            .appendCodeblock(continuousEffectExample));
        continuousDecrease.insertText = new SnippetString(
            "decrease (${1|" + namesCsv + "|}) (* #t ${2:1.0})"
        );

        return [
            discreteIncrease,
            discreteDecrease,
            discreteAssign,
            continuousIncrease,
            continuousDecrease
        ];
    }

    private getFunctions(domainInfo: DomainInfo): Variable[] {
        let functions = domainInfo.getFunctions();
        functions.forEach(f => domainInfo.findVariableLocation(f));
        return functions;
    }
}
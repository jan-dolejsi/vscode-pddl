/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, MarkdownString, SnippetString } from 'vscode';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { FileInfo } from '../../../common/src/FileInfo';
import { PDDL } from '../../../common/src/parser';
import { Delegate } from './Delegate';

export class EffectDelegate extends Delegate {

    constructor(public workspace: PddlWorkspace) {
        super();
    }

    getNumericEffectItems(fileInfo: FileInfo): CompletionItem[] {
        let domainInfo = this.workspace.asDomain(fileInfo);
        if (!domainInfo) { return []; }
        let functions = domainInfo.getFunctions();
        if (!functions.length) { return []; }
        let namesCsv = Delegate.toTypeLessNamesCsv(functions);

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
            continuousIncrease,
            continuousDecrease
        ];
    }
}
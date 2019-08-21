/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, MarkdownString } from 'vscode';
import { Delegate } from './Delegate';
import { PDDL } from '../../../common/src/parser';

export class OperatorDelegate extends Delegate {

    operatorItems: CompletionItem[];

    constructor() {
        super();
    }

    getOperatorItems(): CompletionItem[] {
        if (!this.operatorItems) {

            this.operatorItems = [
                this.createOperator('and', 'Logical conjunction', new MarkdownString('Example:').appendCodeblock('(and (fact1)(fact2))', PDDL)),
                this.createOperator('not', 'Logical negation', new MarkdownString('Example:').appendCodeblock('(not (fact1))', PDDL)),
                this.createOperator('at start', 'At start condition or effect', new MarkdownString('Condition or effect that takes place at the *start* point of a durative action. Only use this inside a `:durative-action`.').appendCodeblock('(:durative-action\n:condition (and (at start (...) ) )\n:effect (and (at start (...) ) ) \n)', PDDL)),
                this.createOperator('at end', 'At end condition or effect', new MarkdownString('Condition or effect that takes place at the *end* point of a durative action. Only use this inside a `:durative-action`.').appendCodeblock('(:durative-action\n:condition (and (at end (...) ) )\n:effect (and (at end (...) ) ) \n)', PDDL)),
                this.createOperator('over all', 'Over all condition', new MarkdownString('Overall condition (aka the invariant) is the condition that must hold true for as long as action is executing. Only use this inside a `:durative-action`.')),
                this.createOperator('=', 'Equality', 'Evaluates whether two numeric values are equal.'),
                this.createOperator('>', 'Greater than', ''),
                this.createOperator('<', 'Less than', ''),
                this.createOperator('>=', 'Greater than or equal', ''),
                this.createOperator('<=', 'Less than or equal', ''),
                this.createOperator('+', 'Numerical addition', new MarkdownString('Example:').appendCodeblock('(+ (function1) 1.0)', PDDL)),
                this.createOperator('-', 'Numerical subtraction', new MarkdownString('Example:').appendCodeblock('(- (function1) 1.0)', PDDL)),
                this.createOperator('/', 'Numerical division', new MarkdownString('Example:').appendCodeblock('(/ (function1) 2)', PDDL)),
                this.createOperator('*', 'Numerical multiplication', new MarkdownString('Example:').appendCodeblock('(* (function1) 2)', PDDL)),
                this.createOperator('forall', 'For all effect', new MarkdownString('Effect that shall be applied to all objects of specified type. For example:').appendCodeblock('(forall (?p - product)(sold_out ?p))', PDDL)),
                this.createOperator('exists', 'Existential condition', new MarkdownString('Condition such as').appendCodeblock('(exists (?p - product)(available ?p))', PDDL)),
                this.createKeyword(':', 'keyword', new MarkdownString('Keywords such as `:action`')),
            ];
        }

        return this.operatorItems;
    }
}
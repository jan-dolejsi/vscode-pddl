/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, MarkdownString, SnippetString } from 'vscode';
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
                this.createOperator('or', 'Logical disjunction', new MarkdownString('Example:').appendCodeblock('(or (fact1) (fact2))', PDDL)),
                this.createOperator('=', 'Equality', 'Evaluates whether two numeric values are equal.'),
                this.createOperator('>', 'Greater than', ''),
                this.createOperator('<', 'Less than', ''),
                this.createOperator('>=', 'Greater than or equal', ''),
                this.createOperator('<=', 'Less than or equal', ''),
                this.createOperator('+', 'Numerical addition', new MarkdownString('Example:').appendCodeblock('(+ (function1) 1.0)', PDDL)),
                this.createOperator('-', 'Numerical subtraction', new MarkdownString('Example:').appendCodeblock('(- (function1) 1.0)', PDDL)),
                this.createOperator('/', 'Numerical division', new MarkdownString('Example:').appendCodeblock('(/ (function1) 2)', PDDL)),
                this.createOperator('*', 'Numerical multiplication', new MarkdownString('Example:').appendCodeblock('(* (function1) 2)', PDDL)),
                this.createParameterized('forall', 'For all condition', new MarkdownString('Conjunction condition for all objects of specified type. For example:').appendCodeblock('(forall (?p - product) (available ?p))', PDDL), new SnippetString('forall ($1) $0')),
                this.createParameterized('exists', 'Existential condition', new MarkdownString('Condition such as').appendCodeblock('(exists (?p - product)(available ?p))', PDDL), new SnippetString('exists ($1) $0')),
            ];
        }

        return this.operatorItems;
    }
}
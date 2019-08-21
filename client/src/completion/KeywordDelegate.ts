/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, MarkdownString } from 'vscode';
import { Delegate } from './Delegate';
import { PDDL } from '../../../common/src/parser';

export class KeywordDelegate extends Delegate {

    domainItems: CompletionItem[];
    problemItems: CompletionItem[];
    actionItems:  CompletionItem[];

    constructor() {
        super();
    }

    getDomainItems() {
        if(!this.domainItems){
            this.domainItems = [
                this.createKeyword('requirements', 'Requirements', 'Required planning engine features.'),
                this.createKeyword('types', 'Types', new MarkdownString('Types of objects and their hierarchy. Example:').appendCodeblock('car - vehicle', PDDL)),
                this.createKeyword('constants', 'Constants', new MarkdownString('Constant objects that will be part of all problems defined for this domain in addition to the objects defined in the `:objects` section.')),
                this.createKeyword('predicates', 'Predicates', 'Predicates are things that are either true or false.'),
                this.createKeyword('functions', 'Functions', 'Functions are used to define numeric values.'),
                this.createKeyword('derived', 'Derived predicate/function', new MarkdownString('Derived predicate/function can be defined to simplify action declaration. Example:').appendCodeblock('(:derived (c) (+ (a) (b))', PDDL)),
                this.createKeyword('constraints', 'Constraints', 'Constraints.... you may want to stay away from those.'),
                this.createKeyword('action', 'Instantaneous action', 'Actions that change state of the world.'),
                this.createKeyword('durative-action', 'Durative action', 'Actions that change the state of the world when they start, then they last for a defined duration period, while changing the world continuously and finally change the state when they end.'),
            ];
        }

        return this.domainItems;
    }

    getProblemItems(){
        if(!this.problemItems){
            this.problemItems = [
                this.createKeyword('domain', 'Domain name', 'Name of the domain this problem is designed for'),
                this.createKeyword('objects', 'Objects', new MarkdownString('List of object names, for example:').appendCodeblock('car1 car2 car3 - vehicle')),
                this.createKeyword('init', 'Initial state', 'Facts that are true in the initial state, initial values of numeric functions.'),
                this.createKeyword('goal', 'Goal state condition', ''),
                this.createKeyword('constraints', 'Constraints', 'Constraints the plan must adhere to'),
                this.createKeyword('metric', 'Metric', 'Function that the planner will either minimize or maximize.')        
            ];
        }

        return this.problemItems;
    }

    getActionItems(){
        if(!this.actionItems){
            this.actionItems = [
                this.createKeyword('parameters', 'Action parameters', 'Parameters such as: \n:parameters (?v - vehicle ?from ?to - place)'),
                this.createKeyword('precondition', 'Instantaneous action precondition', ''),
                this.createKeyword('effect', 'Action effect', ''),
                this.createKeyword('duration', 'Durative action duration', 'Examples: \n:duration (= ?duration 1)\n:duration (and (>= ?duration (min_duration))(<= ?duration (max_duration)))    '),
                this.createKeyword('condition', 'Durative action condition', '')
            ];
        }

        return this.actionItems;
    }
}
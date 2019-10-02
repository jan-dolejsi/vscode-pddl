/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, MarkdownString } from 'vscode';
import { Delegate } from './Delegate';

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
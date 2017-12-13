/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    CompletionItem, CompletionItemKind, Position
} from 'vscode-languageserver';

import { PddlWorkspace } from '../../common/src/workspace-model';

import { FileInfo, Variable } from '../../common/src/parser';

export class AutoCompletion {

    workspace: PddlWorkspace;
    allCompletions = new Array<CompletionItem>();

    constructor(workspace: PddlWorkspace) {
        this.workspace = workspace;

        this.OPERATOR_AT.insertText = 'at <time> (predicate)|(= (function) <value>)';
    }

    complete(fileUri: string, position: Position): CompletionItem[] {

        let fileInfo = this.workspace.getFileInfo(fileUri);

        let lines = fileInfo.text.split('\n');
        if (position.line >= lines.length) return [];

        let leadingText = lines[position.line].substring(0, position.character);

        if (leadingText.includes(';')) return []; // do not auto-complete in comment text

        if (leadingText.length > 1 && leadingText.endsWith('(:')) {
            if (fileInfo.isDomain()) {
                return [
                    this.KEYWORD_DOMAIN_REQUIREMENTS,
                    this.KEYWORD_DOMAIN_TYPES,
                    this.KEYWORD_DOMAIN_CONSTANTS,
                    this.KEYWORD_DOMAIN_PREDICATES,
                    this.KEYWORD_DOMAIN_FUNCTIONS,
                    this.KEYWORD_DOMAIN_CONSTRAINTS,
                    this.KEYWORD_DOMAIN_ACTION,
                    this.KEYWORD_DOMAIN_DURATIVE_ACTION,
                ];
            }
            else if (fileInfo.isProblem()) {
                return [
                    this.KEYWORD_PROBLEM_DOMAIN,
                    this.KEYWORD_PROBLEM_OBJECTS,
                    this.KEYWORD_PROBLEM_INIT,
                    this.KEYWORD_PROBLEM_GOAL,
                    this.KEYWORD_PROBLEM_CONSTRAINTS,
                    this.KEYWORD_PROBLEM_METRIC,
                ];
            }
            else return [];
        }
        else if (leadingText.length > 0 && leadingText.endsWith('(')) {
            let predicates = this.getPredicates(fileInfo).map(p => this.createPredicate(p));
            let functions = this.getFunctions(fileInfo).map(f => this.createFunction(f));
            let operators = [
                this.OPERATOR_CONJUNCTION,
                this.OPERATOR_NEGATION,
                this.OPERATOR_AT_START,
                this.OPERATOR_AT_END,
                this.OPERATOR_OVER_ALL,
                this.OPERATOR_EQUALS,
                this.OPERATOR_AT,
                this.OPERATOR_GREATER_THAN,
                this.OPERATOR_LESS_THAN,
                this.OPERATOR_GREATER_THAN_OR_EQUAL,
                this.OPERATOR_LESS_THAN_OR_EQUAL,
                this.OPERATOR_PLUS,
                this.OPERATOR_MINUS,
                this.OPERATOR_DIVIDE,
                this.OPERATOR_MULTIPLY,
                this.OPERATOR_FOR_ALL,
                this.OPERATOR_EXISTS,
                this.OPERATOR_INCREASE,
                this.OPERATOR_DECREASE,
                this.OPERATOR_ASSIGN,
                this.OPERATOR_COLON,
            ];
            return operators.concat(predicates).concat(functions);
        } else if (leadingText.length > 0 && leadingText.endsWith(':')) {
            return [
                this.KEYWORD_ACTION_PARAMETERS,
                this.KEYWORD_ACTION_PRECONDITION,
                this.KEYWORD_ACTION_EFFECT,
                this.KEYWORD_ACTION_DURATION,
                this.KEYWORD_ACTION_CONDITION,
            ];
        } else if(leadingText.endsWith(' -')) {
            return this.getTypes(fileInfo).map(t => this.createType(t));
        }
        else return [];
    }

    resolve(itemBeingResolved: CompletionItem): CompletionItem {
        return this.allCompletions.find(item1 => item1.data == itemBeingResolved.data);
    }

    last_id = 0;
    KEYWORD_DOMAIN_REQUIREMENTS = this.createKeyword(this.last_id++, 'requirements', 'Requirements', 'Required planning engine features.');
    KEYWORD_DOMAIN_TYPES = this.createKeyword(this.last_id++, 'types', 'Types', 'Types of objects and their hierarchy. e.g. car - vehicle.');
    KEYWORD_DOMAIN_CONSTANTS = this.createKeyword(this.last_id++, 'constants', 'Constants', 'Constant objects that will be part of all problems defined for this domain.');
    KEYWORD_DOMAIN_PREDICATES = this.createKeyword(this.last_id++, 'predicates', 'Predicates', 'Predicates are things that are either true or false.');
    KEYWORD_DOMAIN_FUNCTIONS = this.createKeyword(this.last_id++, 'functions', 'Functions', 'Functions are used to define numeric values.');
    KEYWORD_DOMAIN_CONSTRAINTS = this.createKeyword(this.last_id++, 'constraints', 'Constraints', 'Constraints.... you may want to stay away from those.');
    KEYWORD_DOMAIN_ACTION = this.createKeyword(this.last_id++, 'action', 'Instantaneous action', 'Actions that change state of the world.');
    KEYWORD_DOMAIN_DURATIVE_ACTION = this.createKeyword(this.last_id++, 'durative-action', 'Durative action', 'Actions that change the state of the world when they start, then they last for a defined duration period, while changing the world continuously and finally change the state when they end.');

    KEYWORD_PROBLEM_DOMAIN = this.createKeyword(this.last_id++, 'domain', 'Domain name', 'Name of the domain this problem is designed for');
    KEYWORD_PROBLEM_OBJECTS = this.createKeyword(this.last_id++, 'objects', 'Objects', 'List of object names e.g. `car1 car2 car3 - vehicle`');
    KEYWORD_PROBLEM_INIT = this.createKeyword(this.last_id++, 'init', 'Initial state', 'Facts that are true in the initial state, initial values of numeric functions.');
    KEYWORD_PROBLEM_GOAL = this.createKeyword(this.last_id++, 'goal', 'Goal state condition', '');
    KEYWORD_PROBLEM_CONSTRAINTS = this.createKeyword(this.last_id++, 'constraints', 'Constraints', 'Constraints the plan must adhere to');
    KEYWORD_PROBLEM_METRIC = this.createKeyword(this.last_id++, 'metric', 'Metric', 'Function that the planner will either minimize or maximize.');

    OPERATOR_CONJUNCTION = this.createOperator(this.last_id++, 'and', 'Logical conjunction', 'Example: `(and (fact1)(fact2))`');
    OPERATOR_NEGATION = this.createOperator(this.last_id++, 'not', 'Logical negation', 'Example: `(not (fact1))`');
    OPERATOR_AT_START = this.createOperator(this.last_id++, 'at start', 'At start effect', '');
    OPERATOR_AT_END = this.createOperator(this.last_id++, 'at end', 'At end effect', '');
    OPERATOR_OVER_ALL = this.createOperator(this.last_id++, 'over all', 'Over all condition', 'Overall condition (aka the invariant) is the condition that must hold true for as long as action is executing.');
    OPERATOR_EQUALS = this.createOperator(this.last_id++, '=', 'Equality', 'Evaluates whether two numeric values are equal.');
    OPERATOR_AT = this.createOperator(this.last_id++, 'at', 'Time initial literal', 'Specifies that value of function or predicate changes at a given time.\n\n(at 123 (predicate1))\n(at 124 (= (function1) 1))\n\nUse this in the :init section of the problem file.');
    OPERATOR_GREATER_THAN = this.createOperator(this.last_id++, '>', 'Greater than', '');
    OPERATOR_LESS_THAN = this.createOperator(this.last_id++, '<', 'Less than', '');
    OPERATOR_GREATER_THAN_OR_EQUAL = this.createOperator(this.last_id++, '>=', 'Greater than or equal', '');
    OPERATOR_LESS_THAN_OR_EQUAL = this.createOperator(this.last_id++, '<=', 'Less than or equal', '');
    OPERATOR_PLUS = this.createOperator(this.last_id++, '+', 'Numerical addition', 'Example: `(+ (function1)(1.0)`');
    OPERATOR_MINUS = this.createOperator(this.last_id++, '-', 'Numerical subtraction', '');
    OPERATOR_DIVIDE = this.createOperator(this.last_id++, '/', 'Numerical division', '');
    OPERATOR_MULTIPLY = this.createOperator(this.last_id++, '*', 'Numerical multiplication', '');
    OPERATOR_FOR_ALL = this.createOperator(this.last_id++, 'forall', 'For all effect', 'Effect that shall be applied to all objects of specified type\nExample: `(forall (?p - product)(sold_out ?p))`');
    OPERATOR_EXISTS = this.createOperator(this.last_id++, 'exists', 'Existential condition', 'Condition such as (exists (?p - product)(available ?p))');
    OPERATOR_INCREASE = this.createOperator(this.last_id++, 'increase', 'Numeric increase effect', 'For example to increment a value by `3.14`, use `(increase (function1) 3.14)`');
    OPERATOR_DECREASE = this.createOperator(this.last_id++, 'decrease', 'Numerical decrease effect', '');
    OPERATOR_ASSIGN = this.createOperator(this.last_id++, 'assign', 'Numeric assign effect', 'Assigns value to the function e.g\n(assign (function1) 3.14)');
    OPERATOR_COLON = this.createKeyword(this.last_id++, ':', 'keyword', 'Keywords such as `:action`');

    KEYWORD_ACTION_PARAMETERS = this.createKeyword(this.last_id++, 'parameters', 'Action parameters', 'Parameters such as: \n:parameters (?v - vehicle ?from ?to - place)');
    KEYWORD_ACTION_PRECONDITION = this.createKeyword(this.last_id++, 'precondition', 'Instantaneous action precondition', '');
    KEYWORD_ACTION_EFFECT = this.createKeyword(this.last_id++, 'effect', 'Action effect', '');
    KEYWORD_ACTION_DURATION = this.createKeyword(this.last_id++, 'duration', 'Durative action duration', 'Examples: \n:duration (= ?duration 1)\n:duration (and (>= ?duration (min_duration))(<= ?duration (max_duration)))    ');
    KEYWORD_ACTION_CONDITION = this.createKeyword(this.last_id++, 'condition', 'Durative action condition', '');

    createKeyword(id: number, label: string, detail: string, documentation: string): CompletionItem {
        return this.createCompletionItem(id, label, detail, documentation, CompletionItemKind.Keyword);
    }

    createOperator(id: number, label: string, detail: string, documentation: string): CompletionItem {
        return this.createCompletionItem(id, label, detail, documentation, CompletionItemKind.Function);
    }
    
    createPredicate(predicate: Variable): CompletionItem {
        let completionItem = this.createCompletionItem(this.last_id++, predicate.declaredName, 'Predicate', predicate.documentation, CompletionItemKind.Value);
        completionItem.insertText = predicate.fullNameWithoutTypes;
        return completionItem;
    }

    createFunction(functionSymbol: Variable): CompletionItem {
        let completionItem = this.createCompletionItem(this.last_id++, functionSymbol.declaredName, 'Function', functionSymbol.documentation, CompletionItemKind.Reference);
        completionItem.insertText = functionSymbol.fullNameWithoutTypes;
        return completionItem;
    }

    createType(typeName: string): CompletionItem {
        let completionItem = this.createCompletionItem(this.last_id++, typeName, 'Type', '', CompletionItemKind.Class);
        completionItem.insertText = ' ' + typeName; // prefix with a space for formatting
        return completionItem;
    }

    createCompletionItem(id: number, label: string, detail: string, documentation: string, kind: CompletionItemKind): CompletionItem {
        return this.collect({
            label: label,
            kind: kind,
            data: id,
            detail: detail,
            documentation: documentation,
        });
    }

    collect(item: CompletionItem): CompletionItem {
        this.allCompletions.push(item);
        return item;
    }

    static stripTypes(identifier: string): string{
        return identifier.replace(/\s*-\s*[\w-_]+/gi, '');
    }

    getPredicates(fileInfo: FileInfo): Variable[] {
        let domainInfo = this.workspace.asDomain(fileInfo);
        return domainInfo ? domainInfo.getPredicates() : [];
    }

    getFunctions(fileInfo: FileInfo): Variable[] {
        let domainInfo = this.workspace.asDomain(fileInfo);
        return domainInfo ? domainInfo.getFunctions() : [];
    }

    getTypes(fileInfo: FileInfo): string[]{
        let domainInfo = this.workspace.asDomain(fileInfo);
        return domainInfo ? domainInfo.getTypes() : [];
    }
}
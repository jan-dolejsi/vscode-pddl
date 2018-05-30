/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionContext, SnippetString, MarkdownString, CompletionItemKind } from 'vscode';
import { ProblemInfo, DomainInfo, TypeObjects, Variable } from '../../../common/src/parser';
import { ContextDelegate } from './ContextDelegate';
import { Delegate } from './Delegate';

export class ProblemInitDelegate extends ContextDelegate {

    completions: CompletionItem[];

    constructor(items: CompletionItem[], context: CompletionContext) {
        super(context);
        this.completions = items;
    }

    createProblemInitCompletionItems(problemFileInfo: ProblemInfo, domainFiles: DomainInfo[]): void {
        if (domainFiles.length == 1) {
            // there is a single associated domain file

            this.createSymmetricInit(problemFileInfo, domainFiles[0]);
            this.createTimedInitialLiteral(problemFileInfo, domainFiles[0]);
            this.createTimedInitialNegativeLiteral(problemFileInfo, domainFiles[0]);
            this.createTimedInitialFluent(problemFileInfo, domainFiles[0]);
        }
    }

    createSymmetricInit(problemFileInfo: ProblemInfo, domainFile: DomainInfo): void {
        let allTypeObjects = TypeObjects.concatObjects(domainFile.constants, problemFileInfo.objects);

        let symmetricPredicates = this.getSymmetricPredicates(domainFile);

        let symmetricFunctions = this.getSymmetricFunctions(domainFile);

        if (symmetricPredicates.length && symmetricFunctions.length) {
            this.createSymmetricPredicateAndFunctionInitItem(symmetricPredicates, symmetricFunctions, domainFile, allTypeObjects);
        }

        if (symmetricPredicates.length) {
            this.createSymmetricPredicateInitItem(symmetricPredicates, domainFile, allTypeObjects);

            symmetricPredicates.forEach(predicate1 => {
                this.createSequencePredicateInitItem(predicate1, allTypeObjects);
            });
        }

        if (symmetricFunctions.length) {
            this.createSymmetricFunctionInitItem(symmetricFunctions, domainFile, allTypeObjects);
        }
    }

    createSymmetricPredicateAndFunctionInitItem(symmetricPredicates: Variable[], symmetricFunctions: Variable[],
        domainFile: DomainInfo, allTypeObjects: TypeObjects[]): void {
        let typesInvolved = this.getTypesInvolved(symmetricPredicates.concat(symmetricFunctions), domainFile);
        let objectsDefined = this.getObjects(allTypeObjects, typesInvolved);
        let objectNames = objectsDefined
            .join(',');

        if (!objectsDefined.length) return;

        let item = new CompletionItem('Initialize a symmetric predicate and function', CompletionItemKind.Snippet);
        item.insertText = new SnippetString(
            "(${1|" + Delegate.toNamesCsv(symmetricPredicates) + "|} ${2|" + objectNames + "|} ${3|" + objectNames + "|}) (${1} ${3} ${2})\n" +
            "(= (${4|" + Delegate.toNamesCsv(symmetricFunctions) + "|} ${2|" + objectNames + "|} ${3|" + objectNames + "|}) ${5:1}) (= (${4} ${3} ${2}) ${5})");
        item.documentation = new MarkdownString()
            .appendText("Inserts a predicate and function initialization for predicates and functions with two parameters of the same type.")
            .appendCodeblock("(road A B) (road B A)\n(= (distance A B) 1) (= (distance B A) 1)", "PDDL")
            .appendMarkdown("Use the `Tab` and `Enter` keys on your keyboard to cycle through the selection of the predicate, objects, function and the function value.");
        this.completions.push(item);
    }

    createSymmetricPredicateInitItem(symmetricPredicates: Variable[],
        domainFile: DomainInfo, allTypeObjects: TypeObjects[]): void {

        let typesInvolved = this.getTypesInvolved(symmetricPredicates, domainFile);
        let objectsDefined = this.getObjects(allTypeObjects, typesInvolved);
        let objectNames = objectsDefined
            .join(',');

        if (!objectsDefined.length) return;

        let symmetricPredicateNames = Delegate.toNamesCsv(symmetricPredicates);

        let item = new CompletionItem('Initialize a symmetric predicate', CompletionItemKind.Snippet);
        item.insertText = new SnippetString("(${1|" + symmetricPredicateNames + "|} ${2|" + objectNames + "|} ${3|" + objectNames + "|}) (${1} ${3} ${2})");
        item.documentation = new MarkdownString()
            .appendText("Inserts a predicate initialization for predicates with two parameters of the same type.")
            .appendCodeblock("(road A B) (road B A)", "pddl")
            .appendMarkdown("Use the `Tab` and `Enter` keys on your keyboard to cycle through the selection of the predicate and objects.");
        this.completions.push(item);
    }

    createSymmetricFunctionInitItem(symmetricFunctions: Variable[],
        domainFile: DomainInfo, allTypeObjects: TypeObjects[]): void {
        let typesInvolved = this.getTypesInvolved(symmetricFunctions, domainFile);
        let objectsDefined = this.getObjects(allTypeObjects, typesInvolved);
        let objectNames = objectsDefined
            .join(',');

        if (!objectsDefined.length) return;

        let symmetricFunctionNames = Delegate.toNamesCsv(symmetricFunctions);

        let item = new CompletionItem('Initialize a symmetric function', CompletionItemKind.Snippet);
        item.insertText = new SnippetString("(= (${1|" + symmetricFunctionNames + "|} ${2|" + objectNames + "|} ${3|" + objectNames + "|}) ${4:1}) (= (${1} ${3} ${2}) ${4})");
        item.documentation = new MarkdownString()
            .appendText("Inserts a function initialization for functions with two parameters of the same type.")
            .appendCodeblock("(= (distance A B) 1) (= (distance B A) 1)", "pddl")
            .appendMarkdown("Use the `Tab` and `Enter` keys on your keyboard to cycle through the selection of the function, objects and the function value.");
        this.completions.push(item);

    }
    createSequencePredicateInitItem(symmetricPredicate: Variable, allTypeObjects: TypeObjects[]): void {

        // note for the sequence case we do not consider type inheritance
        let typeInvolved = symmetricPredicate.parameters[0].type;
        let objects = this.getObjects(allTypeObjects, [typeInvolved]);

        if (objects.length < 2) return;

        let textToInsert = '';

        for (let i = 0; i < objects.length - 1; i++) {
            textToInsert += `(${symmetricPredicate.name} ${objects[i]} ${objects[i + 1]})\n`;
        }

        let item = new CompletionItem('Initialize a sequence for ' + symmetricPredicate.declaredNameWithoutTypes, CompletionItemKind.Snippet);
        item.insertText = textToInsert;
        item.documentation = new MarkdownString()
            .appendText("Inserts a predicate initialization for predicates with two parameters of the same type with a sequence of object combinations.")
            .appendCodeblock(textToInsert, "pddl");

        this.completions.push(item);
    }

    createTimedInitialLiteral(problemFileInfo: ProblemInfo, domainFile: DomainInfo): void {
        problemFileInfo; // burn it to avoid warning

        let predicates = domainFile.getPredicates();

        if (!predicates.length) return;

        let namesCsv = Delegate.toTypeLessNamesCsv(predicates);

        let item = new CompletionItem('at <time> (predicate1)', CompletionItemKind.Snippet);
        item.filterText = 'at ';
        item.insertText = new SnippetString(this.enclose(
            "at ${1:1.0} (${2|" + namesCsv + "|})"));
        item.detail = 'Timed initial literal'
        item.documentation = new MarkdownString()
            .appendMarkdown("Defines that selected predicated changes value to `true` at specified time.")
            .appendCodeblock("(at 42 (predicate1))", "PDDL")
            .appendMarkdown("Use the `Tab` and `Enter` keys on your keyboard to cycle through the snippet inputs.");
        this.completions.push(item);
    }

    createTimedInitialNegativeLiteral(problemFileInfo: ProblemInfo, domainFile: DomainInfo): void {
        problemFileInfo; // burn it to avoid warning

        let predicates = domainFile.getPredicates();

        if (!predicates.length) return;

        let namesCsv = Delegate.toTypeLessNamesCsv(predicates);

        let item = new CompletionItem('at <time> (not (predicate1))', CompletionItemKind.Snippet);
        item.filterText = 'at ';
        item.insertText = new SnippetString(this.enclose(
            "at ${1:1.0} (not (${2|" + namesCsv + "|}))"));
        item.detail = 'Timed initial literal (negative)'
        item.documentation = new MarkdownString()
            .appendMarkdown("Defines that selected predicated changes value to `false` at specified time.")
            .appendCodeblock("(at 42 (not (predicate1)))", "PDDL")
            .appendMarkdown("Use the `Tab` and `Enter` keys on your keyboard to cycle through the snippet inputs.");
        this.completions.push(item);
    }

    createTimedInitialFluent(problemFileInfo: ProblemInfo, domainFile: DomainInfo): void {
        problemFileInfo; // burn it to avoid warning

        let functions = domainFile.getFunctions();

        if (!functions.length) return;

        let item = new CompletionItem('at <time> (= (function1) <value>)', CompletionItemKind.Snippet);
        item.filterText = 'at ';
        item.insertText = new SnippetString(this.enclose(
            "at ${1:1.0} (= (${2|" + Delegate.toTypeLessNamesCsv(functions) + "|}) ${3:42})"));
        item.detail = 'Timed initial fluent'
        item.documentation = new MarkdownString()
            .appendText("Defines that selected function changes value at specified time.")
            .appendCodeblock("(at 42 (= (function1) 1.0))", "PDDL")
            .appendMarkdown("Use the `Tab` and `Enter` keys on your keyboard to cycle through the snippet inputs.");
        this.completions.push(item);
    }

}
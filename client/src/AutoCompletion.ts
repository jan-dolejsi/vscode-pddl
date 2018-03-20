/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, SnippetString, MarkdownString, CompletionItemKind, CompletionList, CompletionContext, Range } from 'vscode';
import { PddlWorkspace } from './workspace-model';
import { ProblemInfo, DomainInfo, TypeObjects, Variable } from '../../common/src/parser';

export class AutoCompletion implements CompletionItemProvider {

    constructor(public pddlWorkspace: PddlWorkspace) {

    }

    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): CompletionItem[] | CompletionList | Thenable<CompletionItem[] | CompletionList> {
        token;
        return new CompletionCollector(this.pddlWorkspace, document, position, context).getCompletions();
    }
}

class CompletionCollector {
    completions: CompletionItem[] = [];

    constructor(public pddlWorkspace: PddlWorkspace, public document: TextDocument, public position: Position, public context: CompletionContext) {

        const activeFileInfo = this.pddlWorkspace.upsertFile(document.uri.toString(), document.version, document.getText());

        if (activeFileInfo.isProblem()) {
            let problemFileInfo = <ProblemInfo>activeFileInfo;

            this.createProblemCompletionItems(problemFileInfo);
        }
        else if (activeFileInfo.isDomain()) {
            let domainFileInfo = <DomainInfo>activeFileInfo;

            this.createDomainCompletionItems(domainFileInfo);
        }
    }

    getCompletions(): CompletionItem[] {
        return this.completions;
    }

    createDomainCompletionItems(domainFileInfo: DomainInfo): void {
        domainFileInfo;
    }

    createProblemCompletionItems(problemFileInfo: ProblemInfo): void {
        let folder = this.pddlWorkspace.getFolderOf(problemFileInfo);
        // find domain files in the same folder that match the problem's domain name
        let domainFiles = folder.getDomainFilesFor(problemFileInfo);

        if (this.isInInit()) {
            this.createProblemInitCompletionItems(problemFileInfo, domainFiles);
        }
    }

    createProblemInitCompletionItems(problemFileInfo: ProblemInfo, domainFiles: DomainInfo[]): void {
        if (domainFiles.length == 1) {
            // there is a single associated domain file
            this.createSymmetricInit(problemFileInfo, domainFiles[0]);
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

        if(!objectsDefined.length) return;

        let item = new CompletionItem('Initialize a symmetric predicate and function', CompletionItemKind.Snippet);
        item.insertText = new SnippetString(
            "(${1|" + CompletionCollector.toNamesCsv(symmetricPredicates) + "|} ${2|" + objectNames + "|} ${3|" + objectNames + "|}) (${1} ${3} ${2})\n" +
            "(= (${4|" + CompletionCollector.toNamesCsv(symmetricFunctions) + "|} ${2|" + objectNames + "|} ${3|" + objectNames + "|}) ${5:1}) (= (${4} ${3} ${2}) ${5})");
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

        if(!objectsDefined.length) return;
            
        let symmetricPredicateNames = CompletionCollector.toNamesCsv(symmetricPredicates);

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

        if(!objectsDefined.length) return;

        let symmetricFunctionNames = CompletionCollector.toNamesCsv(symmetricFunctions);

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
    static toNamesCsv(variables: Variable[]): string {
        return variables
            .map(var1 => var1.name)
            .join(',');
    }

    getObjects(allTypeObjects: TypeObjects[], types: string[]): string[] {
        return allTypeObjects
            .filter(typeObjects => types.includes(typeObjects.type))
            .map(typeObjects => typeObjects.objects)
            .reduce((x, y) => x.concat(y), []) // flat map
    }

    getTypesInvolved(variables: Variable[], domainFile: DomainInfo): string[] {
        var typesDirectlyInvolved = variables.map(p => p.parameters)
            .reduce((x, y) => x.concat(y), []) // flat map
            .map(p => p.type)
            .filter((v, i, a) => a.indexOf(v) === i); // distinct

        var typesInheriting = typesDirectlyInvolved
            .map(type1 => domainFile.getTypesInheritingFrom(type1))
            .reduce((x, y) => x.concat(y), []);

        return typesInheriting.concat(typesDirectlyInvolved);
    }

    getSymmetricPredicates(domainFile: DomainInfo): Variable[] {
        return domainFile.getPredicates().filter(this.isSymmetric);
    }

    getSymmetricFunctions(domainFile: DomainInfo): Variable[] {
        return domainFile.getFunctions().filter(this.isSymmetric);
    }

    isSymmetric(variable: Variable): boolean {
        // the predicate has exactly 2 parameters    
        return variable.parameters.length == 2
            // and the parameters are of the same type
            && variable.parameters[0].type == variable.parameters[1].type;
    }

    isInInit(): boolean {
        let startPosition = new Position(0, 0);
        let endPosition = new Position(this.document.lineCount, 10000);

        return this.document.getText(new Range(startPosition, this.position)).includes('(:init')
            && this.document.getText(new Range(this.position, endPosition)).includes('(:goal');
    }
}

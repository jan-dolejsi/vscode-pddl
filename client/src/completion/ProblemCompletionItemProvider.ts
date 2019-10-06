/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, TextDocument, Position, CompletionContext, CompletionItemKind, SnippetString, MarkdownString, Range } from 'vscode';
import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { AbstractCompletionItemProvider, Suggestion } from './AbstractCompletionItemProvider';
import { PddlSyntaxNode } from '../../../common/src/PddlSyntaxNode';
import { PddlStructure } from '../../../common/src/PddlStructure';
import { nodeToRange } from '../utils';

export class ProblemCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();
        this.addSuggestionDocumentation(':domain', 'Domain name', 'Name of the domain this problem is designed for');
        this.addRequirementsDocumentation();
        this.addSuggestionDocumentation(':objects', 'Objects', new MarkdownString('List of object names, for example:').appendCodeblock('car1 car2 car3 - vehicle'));
        this.addSuggestionDocumentation(':init', 'Initial state', 'Facts that are true in the initial state, initial values of numeric functions.');
        this.addSuggestionDocumentation(':goal', 'Goal state condition', '');
        this.addConstraintsDocumentation();
        this.addSuggestionDocumentation(':metric', 'Metric', 'Function that the planner will either minimize or maximize.');
    }

    async provide(document: TextDocument, problemInfo: ProblemInfo, position: Position, context: CompletionContext): Promise<CompletionItem[]> {

        let currentNode = problemInfo.syntaxTree.getNodeAt(document.offsetAt(position));

        if (currentNode.isType(PddlTokenType.Document) ||
            (currentNode.isType(PddlTokenType.Whitespace) || currentNode.isType(PddlTokenType.Comment))
            && currentNode.getParent().isType(PddlTokenType.Document)) {
            let items: CompletionItem[] = [];
            {
                let item = new CompletionItem(";;!pre-parsing:command", CompletionItemKind.Snippet);
                item.insertText = new SnippetString(";;!pre-parsing:{type: \"command\", command: \"${1:program}\", args: [${2:\"data.json\", \"1234\"}]}\n$0");
                item.detail = "Pre-parsing problem file transformation via a shell command.";
                items.push(item);
            }

            {
                let item = new CompletionItem(";;!pre-parsing:python", CompletionItemKind.Snippet);
                item.insertText = new SnippetString(";;!pre-parsing:{type: \"python\", command: \"${1:your_script.py}\", args: [${2:\"data.json\", \"1234\"}]}\n$0");
                item.detail = "Pre-parsing problem file transformation via a python script.";
                items.push(item);
            }

            {
                let item = new CompletionItem(";;!pre-parsing:", CompletionItemKind.Snippet);
                item.insertText = new SnippetString(";;!pre-parsing:{type: \"${1|nunjucks,jinja2|}\", data: \"${2:case1.json}\"}\n$0");
                item.detail = "Pre-parsing problem file transformation via Nunjucks or Jinja2.";
                items.push(item);
            }

            return items;
        }
        else if (this.insideDefine(problemInfo, currentNode, context)) {
            // inside the 'define' bracket
            if (currentNode.isType(PddlTokenType.Comment)) { return []; }

            if (context.triggerCharacter) {
                currentNode = currentNode.expand();
            }

            let supportedSectionsHere = PddlStructure.getSupportedSectionsHere(currentNode, currentNode, PddlTokenType.OpenBracketOperator, PddlStructure.PDDL_PROBLEM_SECTIONS, []);
            let range = ['(', ':'].includes(context.triggerCharacter) ? nodeToRange(document, currentNode) : null;

            let suggestions = supportedSectionsHere.map(s => Suggestion.from(s, context.triggerCharacter, '('));

            return suggestions
                .map((suggestion, index) => this.createDefineCompletionItem(currentNode, suggestion, range, context, index))
                .filter(item => !!item); // filter out nulls
        }

        return [];
    }

    createDefineCompletionItem(_currentNode: PddlSyntaxNode, suggestion: Suggestion, range: Range, context: CompletionContext, index: number): any {
        if (!suggestion) { return null; }

        switch (suggestion.sectionName) {
            case PddlStructure.PROBLEM:
                return this.createSnippetCompletionItem(suggestion, "(problem ${1:problem_name})", range, context, index);
            case PddlStructure.PROBLEM_DOMAIN:
                return this.createSnippetCompletionItem(suggestion, "(:domain ${1:domain_name})", range, context, index);
            case PddlStructure.REQUIREMENTS:
                return this.createSnippetCompletionItem(suggestion, "(:requirements $0)", range, context, index);
            case PddlStructure.OBJECTS:
            case PddlStructure.INIT:
            case PddlStructure.CONSTRAINTS:
                return this.createSnippetCompletionItem(suggestion, "(" + suggestion.sectionName + " \n\t$0\n)", range, context, index);
            case PddlStructure.GOAL:
                return this.createSnippetCompletionItem(suggestion, "(" + suggestion.sectionName + " (and\n\t$0\n))", range, context, index);
            case PddlStructure.METRIC:
                return this.createSnippetCompletionItem(suggestion, "(:metric ${3|minimize,maximize|} (???))", range, context, index);
            default:
                return null;
        }
    }

}

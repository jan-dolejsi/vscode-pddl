/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, TextDocument, Position, CompletionContext, CompletionItemKind, SnippetString, Range, CompletionTriggerKind, MarkdownString } from 'vscode';
import { PDDL } from '../../../common/src/parser';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { PddlSyntaxNode } from '../../../common/src/PddlSyntaxNode';
import { PddlStructure } from '../../../common/src/PddlStructure';
import { nodeToRange } from '../utils';

export class DomainCompletionItemProvider {

    suggestionDetails: Map<string, SuggestionDetails>;

    constructor() {
        this.suggestionDetails = new Map<string, SuggestionDetails>();
        this.addSuggestionDocumentation(':requirements', 'Requirements', 'Required planning engine features.');
        this.addSuggestionDocumentation(':types', 'Types', new MarkdownString('Types of objects and their hierarchy. Example:').appendCodeblock('car - vehicle', PDDL));
        this.addSuggestionDocumentation(':constants', 'Constants', new MarkdownString('Constant objects that will be part of all problems defined for this domain in addition to the objects defined in the `:objects` section.'));
        this.addSuggestionDocumentation(':predicates', 'Predicates', 'Predicates are things that are either true or false.');
        this.addSuggestionDocumentation(':functions', 'Functions', 'Functions are used to define numeric values.');
        this.addSuggestionDocumentation(':constraints', 'Constraints', 'Constraints.... you may want to stay away from those.');
        this.addSuggestionDocumentation(':derived', 'Derived predicate/function', new MarkdownString('Derived predicate/function can be defined to simplify action declaration. Example derived predicate:').appendCodeblock('(:derived (p_and_q) \n\t(and (p) (q))\n)', PDDL).appendText('Example derived function: ').appendCodeblock('(:derived (c) (+ (a) (b))', PDDL));
        this.addSuggestionDocumentation(':action', 'Instantaneous action', new MarkdownString('Actions that change state of the world. Example:').appendCodeblock('(:action action_name\n\t:parameters (?t - type1)\n\t:precondition (and (p ?t))\n\t:effect (and (q ?t))\n)', PDDL));
        this.addSuggestionDocumentation(':durative-action', 'Durative action', 'Actions that change the state of the world when they start, then they last for a defined duration period, while changing the world continuously and finally change the state when they end.');
        this.addSuggestionDocumentation(':process', 'PDDL+ Process', new MarkdownString('Process is activated and continues running when its condition is met. It may only have continuous effects. Example:').appendCodeblock(['(:process HEAT',
            '    :parameters (?r - room)',
            '    :precondition (and',
            '        (too_cold ?r)',
            '        (< (temperature ?r) 22)',
            '    )',
            '    :effect (and',
            '        (increase (temperature ?b) (* #t 3))',
            '    )',
            ')'].join('\n'), PDDL).appendMarkdown('Note that `:process` and `:event` require the `:time` requirement.'));
        this.addSuggestionDocumentation(':event', 'PDDL+ Effect', new MarkdownString('Effect is triggered when its condition is met. It may only have continuous effects. Example:').appendCodeblock(['(:event BOUNCE',
            '    :parameters (?b - ball)',
            '    :precondition (and',
            '        (not (held ?b))',
            '        (<= (distance-to-floor ?b) 0)',
            '    )',
            '    :effect (and',
            '        (assign (velocity ?b) (* -0.8 (velocity ?b)))',
            '    )',
            ')'].join('\n'), PDDL).appendMarkdown('Note that `:process` and `:event` require the `:time` requirement.'),
        CompletionItemKind.Event);
    }

    addSuggestionDocumentation(label: string, detail: string, documentation: string | MarkdownString, kind?: CompletionItemKind) {
        let details = new SuggestionDetails(label, detail, documentation, kind);
        this.suggestionDetails.set(details.label, details);
    }

    async provide(document: TextDocument, domainInfo: DomainInfo, position: Position, context: CompletionContext): Promise<CompletionItem[]> {

        let currentNode = domainInfo.syntaxTree.getNodeAt(document.offsetAt(position));

        if (currentNode.isType(PddlTokenType.Comment)) { return []; }

        if (this.insideDefine(domainInfo, currentNode, context)) {
            // inside the 'define' bracket

            if (context.triggerCharacter) {
                currentNode = currentNode.expand();
            }

            let supportedSectionsHere = PddlStructure.getSupportedSectionsHere(currentNode, PddlStructure.PDDL_DOMAIN_SECTIONS, PddlStructure.PDDL_DOMAIN_STRUCTURES);
            let range = ['(', ':'].includes(context.triggerCharacter) ? nodeToRange(document, currentNode) : null;

            let suggestions = supportedSectionsHere.map(s => Suggestion.from(s, context.triggerCharacter));

            return suggestions
                .map((suggestion, index) => this.createCompletionItem(currentNode, suggestion, range, context, index))
                .filter(item => !!item); // filter out nulls
        }

        return [];
    }

    private insideDefine(domainInfo: DomainInfo, currentNode: PddlSyntaxNode, context: CompletionContext) {
        let defineNode = domainInfo.syntaxTree.getDefineNode();
        if (context.triggerKind === CompletionTriggerKind.Invoke) {
            return currentNode.getParent() === defineNode;
        }
        else {
            return currentNode.expand().getParent() === defineNode;
        }
    }

    createCompletionItem(_currentNode: PddlSyntaxNode, suggestion: Suggestion, range: Range, context: CompletionContext, index: number): CompletionItem | null {
        if (!suggestion) { return null; }
        switch (suggestion.sectionName) {
            case PddlStructure.DOMAIN:
                return this.createSnippetCompletionItem(suggestion, "(domain ${1:domain_name})", range, context, index);
            case PddlStructure.REQUIREMENTS:
                return this.createSnippetCompletionItem(suggestion, "(:requirements :strips $0)", range, context, index);
            case PddlStructure.TYPES:
            case PddlStructure.CONSTANTS:
            case PddlStructure.PREDICATES:
            case PddlStructure.FUNCTIONS:
            case PddlStructure.CONSTRAINTS:
                return this.createSnippetCompletionItem(suggestion, "(" + suggestion.sectionName + " \n\t$0\n)", range, context, index);

            case PddlStructure.ACTION:
                return this.createSnippetCompletionItem(suggestion, ["(:action ${1:action_name}",
                    "    :parameters ($0)",
                    "    :precondition (and )",
                    "    :effect (and )",
                    ")",
                    ""
                ].join('\n'), range, context, index);
            case PddlStructure.DURATIVE_ACTION:
                return this.createSnippetCompletionItem(suggestion, [
                    "(:durative-action ${1:action_name}",
                    "    :parameters ($0)",
                    "    :duration ${2|(= ?duration 1),(> ?duration 0),(<= ?duration 10),(and (>= ?duration 1)(<= ?duration 2))|}",
                    "    :condition (and ",
                    "        (at start (and ",
                    "        ))",
                    "        (over all (and ",
                    "        ))",
                    "        (at end (and ",
                    "        ))",
                    "    )",
                    "    :effect (and ",
                    "        (at start (and ",
                    "        ))",
                    "        (at end (and ",
                    "        ))",
                    "    )",
                    ")",
                    ""
                ].join('\n'), range, context, index);
            case PddlStructure.PROCESS:
                return this.createSnippetCompletionItem(suggestion, ["(:process ${1:process_name}",
                    "    :parameters ($0)",
                    "    :precondition (and",
                    "        ; activation condition",
                    "    )",
                    "    :effect (and",
                    "        ; continuous effect(s)",
                    "    )",
                    ")",
                    ""
                ].join('\n'), range, context, index);
            case PddlStructure.EVENT:
                return this.createSnippetCompletionItem(suggestion, ["(:event ${1:event_name}",
                    "    :parameters ($0)",
                    "    :precondition (and",
                    "        ; trigger condition",
                    "    )",
                    "    :effect (and",
                    "        ; discrete effect(s)",
                    "    )",
                    ")",
                    ""
                ].join('\n'), range, context, index);
            default:
                return null;
        }
    }

    private createSnippetCompletionItem(suggestion: Suggestion, snippet: string, range: Range, _context: CompletionContext, index: number) {
        let suggestionDetail = this.suggestionDetails.get(suggestion.sectionName);
        let completionItem = new CompletionItem(suggestion.sectionName, suggestionDetail.kind || CompletionItemKind.Keyword);
        completionItem.insertText = new SnippetString(snippet);
        if (range) { completionItem.range = range; }
        if (suggestionDetail) {
            completionItem.detail = suggestionDetail.detail;
            completionItem.documentation = suggestionDetail.documentation;
        }
        completionItem.filterText = suggestion.filterText;
        completionItem.sortText = 'item' + index;
        return completionItem;
    }
}

class Suggestion {
    public readonly filterText: string;
    constructor(public readonly sectionName: string) {
        this.filterText = '(' + sectionName;
    }

    static from(sectionName: string, triggerCharacter: string): Suggestion | null {
        if (triggerCharacter === ':' && !sectionName.startsWith(':')) {
            return null;
        }
        else {
            return new Suggestion(sectionName);
        }
    }
}

class SuggestionDetails {
    
    constructor(public readonly label: string, public readonly detail: string, public readonly documentation: string | MarkdownString, public readonly kind?: CompletionItemKind) {

    }
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, TextDocument, Position, CompletionContext, CompletionItemKind, Range, MarkdownString, workspace } from 'vscode';
import { PDDL } from 'pddl-workspace';
import { DomainInfo, parser } from 'pddl-workspace';
import { nodeToRange } from '../utils';
import { AbstractCompletionItemProvider, Suggestion } from './AbstractCompletionItemProvider';
import { DiscreteEffectCompletionItemProvider } from './DiscreteEffectCompletionItemProvider';
import { ContinuousEffectCompletionItemProvider } from './ContinuousEffectCompletionItemProvider';
import { DurativeActionEffectCompletionItemProvider } from './DurativeActionEffectCompletionItemProvider';
import { DurativeActionConditionCompletionItemProvider } from './DurativeActionConditionCompletionItemProvider';
import { utils } from 'pddl-workspace';
import { ModelHierarchy } from 'pddl-workspace';

export class DomainCompletionItemProvider extends AbstractCompletionItemProvider {

    constructor() {
        super();
        this.addRequirementsDocumentation();
        this.addSuggestionDocumentation(':types', 'Types', new MarkdownString('Types of objects and their hierarchy. Example:').appendCodeblock('car - vehicle', PDDL));
        this.addSuggestionDocumentation(':constants', 'Constants', new MarkdownString('Constant objects that will be part of all problems defined for this domain in addition to the objects defined in the `:objects` section.'));
        this.addSuggestionDocumentation(':predicates', 'Predicates', 'Predicates are things that are either true or false.');
        this.addSuggestionDocumentation(':functions', 'Functions', 'Functions are used to define numeric values.');
        this.addConstraintsDocumentation();
        this.addSuggestionDocumentation(':derived', 'Derived predicate/function', new MarkdownString('Derived predicate/function can be defined to simplify action declaration. Example derived predicate:').appendCodeblock('(:derived (p_and_q) \n\t(and (p) (q))\n)', PDDL).appendText('Example derived function: ').appendCodeblock('(:derived (c) (+ (a) (b))', PDDL));
        this.addSuggestionDocumentation(':action', 'Instantaneous action', new MarkdownString('Actions that change state of the world. Example:').appendCodeblock('(:action action_name\n\t:parameters (?t - type1)\n\t:precondition (and (p ?t))\n\t:effect (and (q ?t))\n)', PDDL));
        this.addSuggestionDocumentation(':durative-action', 'Durative action', 'Actions that change the state of the world when they start, then they last for a defined duration period, while changing the world continuously and finally change the state when they end.');
        if (workspace.getConfiguration("pddl").get<boolean>("jobScheduling")) {
            this.addSuggestionDocumentation(':job', 'Job (simplified durative action)', 'Durative Action simplified for specifying job-scheduling problems.');
        }
        this.addSuggestionDocumentation(':process', 'PDDL+ Process', new MarkdownString('Process is activated and continues running when its condition is met. It may only have continuous effects. Example:').appendCodeblock(['(:process HEAT',
            '    :parameters (?r - room)',
            '    :precondition (and',
            '        (too_cold ?r)',
            '        (< (temperature ?r) 22)',
            '    )',
            '    :effect (and',
            '        (increase (temperature ?b) (* #t 3))',
            '    )',
            ')'].join('\n'), PDDL).appendMarkdown('Note that `:process` and `:event` require the `:time` requirement.'), CompletionItemKind.Struct);
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

        /* ACTION KEYWORDS */
        this.addSuggestionDocumentation(':parameters', 'Action parameters', new MarkdownString('Parameters such as:').appendCodeblock(':parameters (?v - vehicle ?from ?to - place)'));
        this.addSuggestionDocumentation(':precondition', 'Instantaneous action precondition', '');
        this.addSuggestionDocumentation(':effect', 'Action effect', '');

        /* DURATIVE ACTION KEYWORDS */
        this.addSuggestionDocumentation(':duration', 'Durative action duration', new MarkdownString('Examples:').appendCodeblock(':duration (= ?duration 1)\n:duration (and (>= ?duration (min_duration))(<= ?duration (max_duration)))'));
        this.addSuggestionDocumentation(':condition', 'Durative action condition', '');
    }

    async provide(document: TextDocument, domainInfo: DomainInfo, position: Position, context: CompletionContext): Promise<CompletionItem[]> {

        let currentNode = domainInfo.syntaxTree.getNodeAt(document.offsetAt(position));

        if (currentNode.isType(parser.PddlTokenType.Comment)) { return []; }

        if (this.insideDefine(domainInfo, currentNode, context)) {
            // inside the 'define' bracket

            if (context.triggerCharacter) {
                currentNode = currentNode.expand();
            }

            const supportedSectionsHere = parser.PddlStructure.getSupportedSectionsHere(currentNode, currentNode, parser.PddlTokenType.OpenBracketOperator, parser.PddlStructure.PDDL_DOMAIN_SECTIONS, parser.PddlStructure.PDDL_DOMAIN_STRUCTURES);
            const range = context.triggerCharacter && ['(', ':'].includes(context.triggerCharacter)
                ? nodeToRange(document, currentNode) : null;

            const suggestions = supportedSectionsHere
                .map(s => Suggestion.from(s, context.triggerCharacter, '('))
                .filter(s => !!s).map(s => s!);

            return suggestions
                .map((suggestion, index) => this.createDefineCompletionItem(currentNode, suggestion, range, context, index))
                .filter(item => !!item).map(item => item!); // filter out nulls
        }
        else if (this.insideRequirements(domainInfo, currentNode, context)) {
            return this.createRequirementsCompletionItems(document, currentNode, context);
        }
        else if (this.insideAction(currentNode)) {
            const nearestPrecedingKeyword = parser.PddlStructure.getPrecedingKeywordOrSelf(currentNode);
            const supportedSectionsHere = parser.PddlStructure.getSupportedSectionsHere(nearestPrecedingKeyword, currentNode, parser.PddlTokenType.Keyword, parser.PddlStructure.PDDL_ACTION_SECTIONS, []);
            const range = context.triggerCharacter && ['(', ':'].includes(context.triggerCharacter)
                ? nodeToRange(document, currentNode) : null;

            const suggestions = supportedSectionsHere
                .map(s => Suggestion.from(s, context.triggerCharacter, ''))
                .filter(s => !!s).map(s => s!);

            return suggestions
                .map((suggestion, index) => this.createActionCompletionItem(currentNode, suggestion, range, context, index))
                .filter(item => !!item).map(item => item!); // filter out nulls
        }
        else if (this.insideDurativeAction(currentNode)) {
            const nearestPrecedingKeyword = parser.PddlStructure.getPrecedingKeywordOrSelf(currentNode);
            const supportedSectionsHere = parser.PddlStructure.getSupportedSectionsHere(nearestPrecedingKeyword, currentNode, parser.PddlTokenType.Keyword, parser.PddlStructure.PDDL_DURATIVE_ACTION_SECTIONS, []);
            const range = context.triggerCharacter && ['(', ':'].includes(context.triggerCharacter)
                ? nodeToRange(document, currentNode) : null;

            const suggestions = supportedSectionsHere
                .map(s => Suggestion.from(s, context.triggerCharacter, ''))
                .filter(s => !!s).map(s => s!);

            return suggestions
                .map((suggestion, index) => this.createDurativeActionCompletionItem(currentNode, suggestion, range, context, index))
                .filter(item => !!item).map(item => item!); // filter out nulls
        }
        else if (ModelHierarchy.isInsideEffect(currentNode)) {
            const completions: (CompletionItem | null)[] = [];
            const range = context.triggerCharacter === '(' ? nodeToRange(document, currentNode) : null;

            if (DurativeActionEffectCompletionItemProvider.inside(currentNode)) {
                completions.push(... new DurativeActionEffectCompletionItemProvider().provide(domainInfo, context, range));
            }
            if (DiscreteEffectCompletionItemProvider.inside(currentNode)) {
                completions.push(... new DiscreteEffectCompletionItemProvider().provide(domainInfo, context, range));
            }
            if (ContinuousEffectCompletionItemProvider.inside(currentNode)) {
                completions.push(... await new ContinuousEffectCompletionItemProvider().provide(domainInfo, context, range));
            }
            // completions.push(...this.addIconGallery());
            return completions
                .filter(c => !!c).map(c => c!);
        } else if (DurativeActionConditionCompletionItemProvider.inside(currentNode)) {
            const range = context.triggerCharacter === '(' ? nodeToRange(document, currentNode) : null;
            return new DurativeActionConditionCompletionItemProvider()
                .provide(domainInfo, context, range)
                .filter(c => !!c).map(c => c!);
        }

        if (context.triggerCharacter === '?') {
            const scopes = currentNode.findAllParametrisableScopes();
            const range = nodeToRange(document, currentNode);
            const parameterNamesFromAllScopes = scopes
                .map(s => s.getParameterDefinition())
                .filter(paramNode => !!paramNode).map(paramNode => paramNode!)
                .map(paramNode => this.getParameterNames(paramNode));
            
            return utils.Util.flatMap(parameterNamesFromAllScopes)
                .map((paramName, index) => this.createSnippetCompletionItem(Suggestion.from(paramName, context.triggerCharacter, ''), paramName, range, context, index))
                .filter(c => !!c).map(c => c!);
        }

        return [];
    }

    private getParameterNames(parametersNode: parser.PddlSyntaxNode): string[] {
        return parametersNode.getChildrenOfType(parser.PddlTokenType.Parameter, /.*/)
            .map(n => n.getText());
    }

    private insideAction(currentNode: parser.PddlSyntaxNode): boolean {
        const pattern = /^\(\s*:action$/i;
        return this.insideScope(currentNode, pattern);
    }

    private insideDurativeAction(currentNode: parser.PddlSyntaxNode): boolean {
        const pattern = /^\(\s*:durative-action$/i;
        return this.insideScope(currentNode, pattern);
    }

    private insideScope(currentNode: parser.PddlSyntaxNode, pattern: RegExp): boolean {
        const parentScope = currentNode.expand();
        return parentScope.isType(parser.PddlTokenType.OpenBracketOperator) && parentScope.getToken().tokenText.match(pattern) !== null;
    }

    private readonly DURATION_SNIPPET = ":duration ${2|(= ?duration 1),(> ?duration 0),(<= ?duration 10),(and (>= ?duration 1)(<= ?duration 2))|}";

    createDefineCompletionItem(_currentNode: parser.PddlSyntaxNode, suggestion: Suggestion, range: Range | null, context: CompletionContext, index: number): CompletionItem | null {
        if (!suggestion) { return null; }
        switch (suggestion.sectionName) {
            case parser.PddlStructure.DOMAIN:
                return this.createSnippetCompletionItem(suggestion, "(domain ${1:domain_name})", range, context, index);
            case parser.PddlStructure.REQUIREMENTS:
                return this.createSnippetCompletionItem(suggestion, "(:requirements :strips $0)", range, context, index);
            case parser.PddlStructure.TYPES:
            case parser.PddlStructure.CONSTANTS:
            case parser.PddlStructure.PREDICATES:
            case parser.PddlStructure.FUNCTIONS:
                return this.createSnippetCompletionItem(suggestion, "(" + suggestion.sectionName + "\n\t$0\n)", range, context, index);
            case parser.PddlStructure.CONSTRAINTS:
                return this.createSnippetCompletionItem(suggestion, "(" + suggestion.sectionName + " (and\n\t$0\n))", range, context, index);

            case parser.PddlStructure.ACTION:
                return this.createSnippetCompletionItem(suggestion, ["(:action ${1:action_name}",
                    "    :parameters ($0)",
                    "    :precondition (and )",
                    "    :effect (and )",
                    ")",
                    ""
                ].join('\n'), range, context, index);
            case parser.PddlStructure.DURATIVE_ACTION:
                return this.createSnippetCompletionItem(suggestion, [
                    "(:durative-action ${1:action_name}",
                    "    :parameters ($0)",
                    "    " + this.DURATION_SNIPPET,
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
            case parser.PddlStructure.JOB:
                return this.createSnippetCompletionItem(suggestion, [
                    "(:job ${1:job_name}",
                    "    :parameters ($0)",
                    // "    " + this.DURATION_SNIPPET,
                    "    :condition (and ",
                    "        (at start (and ",
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
            case parser.PddlStructure.PROCESS:
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
            case parser.PddlStructure.EVENT:
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

    createActionCompletionItem(_currentNode: parser.PddlSyntaxNode, suggestion: Suggestion, range: Range | null, context: CompletionContext, index: number): CompletionItem | null {
        switch (suggestion.sectionName) {
            case parser.PddlStructure.PARAMETERS:
                return this.createParametersCompletionItem(suggestion, range, context, index);
            case parser.PddlStructure.PRECONDITION:
            case parser.PddlStructure.EFFECT:
                return this.createSnippetCompletionItem(suggestion, suggestion.sectionName + " (and \n\t$0\n)", range, context, index);
            default:
                return null;
        }
    }

    private createParametersCompletionItem(suggestion: Suggestion, range: Range | null, context: CompletionContext, index: number): CompletionItem | null {
        return this.createSnippetCompletionItem(suggestion, ":parameters ($0)", range, context, index);
    }

    createDurativeActionCompletionItem(_currentNode: parser.PddlSyntaxNode, suggestion: Suggestion, range: Range | null, context: CompletionContext, index: number): CompletionItem | null {
        switch (suggestion.sectionName) {
            case parser.PddlStructure.PARAMETERS:
                return this.createParametersCompletionItem(suggestion, range, context, index);
            case parser.PddlStructure.DURATION:
                return this.createSnippetCompletionItem(suggestion, this.DURATION_SNIPPET, range, context, index);
            case parser.PddlStructure.CONDITION:
            case parser.PddlStructure.EFFECT:
                return this.createSnippetCompletionItem(suggestion, suggestion.sectionName + " (and \n\t$0\n)", range, context, index);
            default:
                return null;
        }
    }
}

export function requires(requirements: string[]): string {
    const requirementsCsv = requirements.map(r => '`' + r + '`').join(', ');
    return `\n\nThis language feature requires ${requirementsCsv}.`;
}

export function toSelection(tabstop: number, optionsCsv: string, orDefault: string): string {
    if (optionsCsv.length) {
        return "${" + tabstop + "|" + optionsCsv + "|}";
    }
    else {
        return "${" + tabstop + ":" + orDefault + "}";
    }
}

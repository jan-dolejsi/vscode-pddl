/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, TextDocument, Position, CompletionContext, CompletionItemKind } from 'vscode';
import { PDDL, parser } from 'pddl-workspace';
import { nodeToRange } from '../utils';

export class UnknownPddlCompletionItemProvider {

    provide(document: TextDocument, position: Position, _context: CompletionContext): CompletionItem[] | PromiseLike<CompletionItem[]> {
        const tree = new parser.PddlSyntaxTreeBuilder(document.getText()).getTree();
        const currentNode = tree.getNodeAt(document.offsetAt(position));
        if (currentNode.isDocument() ||
            currentNode.isType(parser.PddlTokenType.Whitespace) &&
            currentNode.getParent() && currentNode.getParent()!.isDocument()) {

            const domainSnippet = new CompletionItem("domain", CompletionItemKind.Module);
            domainSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'domain' }], title: 'Insert domain snippet' };

            const problemSnippet = new CompletionItem("problem", CompletionItemKind.Module);
            problemSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'problem' }], title: 'Insert problem snippet' };
            return [
                domainSnippet,
                problemSnippet
            ];
        } else if (_context.triggerCharacter === '(') {
            if (currentNode.getParent() &&
                currentNode.getParent()!.isType(parser.PddlTokenType.Document)) {
                const domainSnippet = new CompletionItem("(define domain...", CompletionItemKind.Module);
                domainSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'domain' }], title: 'Insert domain snippet' };
                domainSnippet.range = nodeToRange(document, currentNode.expand());
                domainSnippet.insertText = '';
                domainSnippet.filterText = '(define domain';

                const problemSnippet = new CompletionItem("(define problem...", CompletionItemKind.Module);
                problemSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'problem' }], title: 'Insert problem snippet' };
                problemSnippet.range = nodeToRange(document, currentNode.expand());
                problemSnippet.insertText = '';
                problemSnippet.filterText = '(define problem';

                return [
                    domainSnippet,
                    problemSnippet
                ];
            }
        }

        return [];
    }

}
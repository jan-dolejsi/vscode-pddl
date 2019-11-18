/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, TextDocument, Position, CompletionContext, CompletionItemKind } from 'vscode';
import { PDDL } from '../../../common/src/parser';
import { PddlSyntaxTreeBuilder } from '../../../common/src/PddlSyntaxTreeBuilder';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { nodeToRange } from '../utils';

export class UnknownPddlCompletionItemProvider {
    
    provide(document: TextDocument, position: Position, _context: CompletionContext): CompletionItem[] | PromiseLike<CompletionItem[]> {
        let tree = new PddlSyntaxTreeBuilder(document.getText()).getTree();
        let currentNode = tree.getNodeAt(document.offsetAt(position));
        if (currentNode.isDocument() || currentNode.isType(PddlTokenType.Whitespace) &&
            currentNode.getParent() && currentNode.getParent().isDocument()) {
            
            let domainSnippet = new CompletionItem("domain", CompletionItemKind.Module);
            domainSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'domain' }], title: 'Insert domain snippet' };

            let problemSnippet = new CompletionItem("problem", CompletionItemKind.Module);
            problemSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'problem' }], title: 'Insert problem snippet' };
            return [
                domainSnippet,
                problemSnippet
            ];
        } else if (_context.triggerCharacter === '(') {
            if (currentNode.getParent().isType(PddlTokenType.Document)) {
                let domainSnippet = new CompletionItem("(define domain...", CompletionItemKind.Module);
                domainSnippet.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': PDDL, 'name': 'domain' }], title: 'Insert domain snippet' };
                domainSnippet.range = nodeToRange(document, currentNode.expand());
                domainSnippet.insertText = '';
                domainSnippet.filterText = '(define domain';

                let problemSnippet = new CompletionItem("(define problem...", CompletionItemKind.Module);
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
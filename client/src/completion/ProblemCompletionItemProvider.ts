/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, TextDocument, Position, CompletionContext, CompletionItemKind, SnippetString } from 'vscode';
import { ProblemInfo } from '../../../common/src/parser';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';

export class ProblemCompletionItemProvider {
    async provide(document: TextDocument, problemInfo: ProblemInfo, position: Position, _context: CompletionContext): Promise<CompletionItem[]> {
        
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

        return [];
    }

}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DomainInfo, parser, PddlLanguage, ProblemInfo } from 'pddl-workspace';
import {TextDocument, CancellationToken, DocumentFormattingEditProvider, FormattingOptions, TextEdit } from 'vscode';
import { nodeToRange } from '../utils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';

export class PddlFormatProvider implements DocumentFormattingEditProvider {

    constructor(private pddlWorkspace?: CodePddlWorkspace) {
    }

	async provideDocumentFormattingEdits(document: TextDocument, _options: FormattingOptions, token: CancellationToken): Promise<TextEdit[] | undefined> {
        const fileInfo = await this.pddlWorkspace?.upsertAndParseFile(document);
        if (token.isCancellationRequested) { return undefined; }

        if (fileInfo && (fileInfo.getLanguage() !== PddlLanguage.PDDL)) {
            return undefined;
        }

        let tree: parser.PddlSyntaxTree;
        if (fileInfo && (fileInfo instanceof DomainInfo)) {
            tree = (fileInfo as DomainInfo).syntaxTree;
        }
        else if (fileInfo && (fileInfo instanceof ProblemInfo)) {
            tree = (fileInfo as ProblemInfo).syntaxTree;
        }
        else {
            tree = new parser.PddlSyntaxTreeBuilder(document.getText()).getTree();
		}
		
		const edits: TextEdit[] = [];
		this.format(tree.getRootNode(), edits, document);

		return edits;
	}

	format(node: parser.PddlSyntaxNode, edits: TextEdit[], document: TextDocument): void {
		if (node.getToken().type === parser.PddlTokenType.Whitespace) {
			edits.push(TextEdit.replace(nodeToRange(document, node), ' '));
		}

		node.getChildren().forEach(child => this.format(child, edits, document));
	}
}
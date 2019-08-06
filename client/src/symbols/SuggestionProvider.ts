/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, CodeActionProvider, CodeActionKind, Range, Selection, CodeActionContext, CancellationToken, CodeAction, Diagnostic } from 'vscode';
// import { NoProblemAssociated, NoDomainAssociated } from './workspaceUtils';
import { MissingRequirements } from './MissingRequirements';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { toLanguage } from '../workspace/workspaceUtils';
import { Util } from '../../../common/src/util';
import { PddlSyntaxTreeBuilder } from '../../../common/src/PddlSyntaxTreeBuilder';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { PddlSyntaxTree } from '../../../common/src/PddlSyntaxTree';
import { FileInfo } from '../../../common/src/FileInfo';

/**
 * Provides code actions for PDDL files.
 */
export class SuggestionProvider implements CodeActionProvider {

    static readonly CONTENT_NOT_RECOGNIZED = 'CONTENT_NOT_RECOGNIZED';

    constructor(private workspace: PddlWorkspace) {
    }

    public static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix
    ];

    async provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext, token: CancellationToken): Promise<CodeAction[]> {
        if (token.isCancellationRequested) { return []; }

        let fileInfo = await this.workspace.upsertFile(document.uri.toString(), toLanguage(document), document.version, document.getText());
        let syntaxTree = new PddlSyntaxTreeBuilder(fileInfo.getText()).getTree();

        let insertSnippetCodeActions = context.diagnostics
            .filter(diagnostic => diagnostic.code === SuggestionProvider.CONTENT_NOT_RECOGNIZED)
            .map(diagnostic => this.createSnippetSuggestions(document, diagnostic, range, fileInfo, syntaxTree));

        let missingRequirement = context.diagnostics
            .filter(diagnostic => diagnostic.message.match(MissingRequirements.undeclaredRequirementDiagnosticPattern))
            .map(diagnostic => this.createUndeclaredRequirementAction(document, diagnostic, fileInfo))
            .filter(action => action !== undefined);

        return Util.flatMap(insertSnippetCodeActions).concat(missingRequirement);
    }

    private createSnippetSuggestions(document: TextDocument, diagnostic: Diagnostic, range: Range | Selection, fileInfo: FileInfo, syntaxTree: PddlSyntaxTree): CodeAction[] {
        let isWhitespaceOnly = syntaxTree.getRootNode().getChildren()
            .every(node => node.getToken().type === PddlTokenType.Comment || node.getToken().type === PddlTokenType.Whitespace);

        let selectedNode = syntaxTree.getNodeAt(document.offsetAt(range.start));
        let isInsideWhitespace = selectedNode &&
            (selectedNode.getToken().type === PddlTokenType.Whitespace
                || selectedNode.getToken().type === PddlTokenType.Document);

        let codeActions: CodeAction[] = [];

        if (fileInfo.isUnknownPddl() && isInsideWhitespace && isWhitespaceOnly) {
            {
                const title = 'Insert PDDL domain snippet...';
                const action = new CodeAction(title, CodeActionKind.QuickFix);
                action.diagnostics = [diagnostic];
                action.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': 'pddl', 'name': 'domain' }], title: title };
                action.isPreferred = true;
                codeActions.push(action);
            }
            {
                const title = 'Insert PDDL problem snippet...';
                const action = new CodeAction(title, CodeActionKind.QuickFix);
                action.diagnostics = [diagnostic];
                action.command = { command: 'editor.action.insertSnippet', arguments: [{ 'langId': 'pddl', 'name': 'problem' }], title: title };
                codeActions.push(action);
            }
        }

        return codeActions;
    }

     private createUndeclaredRequirementAction(document: TextDocument, diagnostic: Diagnostic, fileInfo: FileInfo): CodeAction {

        let missingRequirementsDelegate = new MissingRequirements(fileInfo);

        let requirementName = missingRequirementsDelegate.getRequirementName(diagnostic.message);

        let edit = missingRequirementsDelegate.createEdit(document, requirementName);

		const title = 'Add missing requirement ' + requirementName;
        const action = new CodeAction(title, CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];
		action.isPreferred = true;
		return action;
	}
}
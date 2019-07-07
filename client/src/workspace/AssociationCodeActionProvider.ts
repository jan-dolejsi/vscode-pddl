/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, CodeActionProvider, CodeActionKind, Range, Selection, CodeActionContext, CancellationToken, CodeAction, Diagnostic } from 'vscode';
import { NoProblemAssociated, NoDomainAssociated } from './workspaceUtils';
import { COMMAND_ASSOCIATE_PROBLEM, COMMAND_ASSOCIATE_DOMAIN } from './AssociationProvider';

/**
 * Provides code actions corresponding to diagnostic problems.
 */
export class AssociationCodeActionProvider implements CodeActionProvider {

	public static readonly providedCodeActionKinds = [
		CodeActionKind.QuickFix
	];

	provideCodeActions(document: TextDocument, _range: Range | Selection, context: CodeActionContext, token: CancellationToken): CodeAction[] {
		if (token.isCancellationRequested) { return []; }

		let associateProblemCodeActions = context.diagnostics
			.filter(diagnostic => diagnostic.code === NoProblemAssociated.DIAGNOSTIC_CODE)
			.map(diagnostic => this.createAssociateProblemCommand(diagnostic, document));

		let associateDomainCodeActions = context.diagnostics
			.filter(diagnostic => diagnostic.code === NoDomainAssociated.DIAGNOSTIC_CODE)
			.map(diagnostic => this.createAssociateDomainCommand(diagnostic, document));

		return associateProblemCodeActions.concat(associateDomainCodeActions);
	}

	private createAssociateProblemCommand(diagnostic: Diagnostic, document: TextDocument): CodeAction {
		const title = 'Associate problem file that corresponds to this plan file...';
		const action = new CodeAction(title, CodeActionKind.QuickFix);
		action.command = { command: COMMAND_ASSOCIATE_PROBLEM, arguments: [document.uri], title: title };
		action.diagnostics = [diagnostic];
		// todo: re-introduce this when upgraded to a later VS Code version
		// action.isPreferred = true;
		return action;
	}

	private createAssociateDomainCommand(diagnostic: Diagnostic, document: TextDocument): CodeAction {
		const title = 'Associate domain file that corresponds to this problem file...';
		const action = new CodeAction(title, CodeActionKind.QuickFix);
		action.command = { command: COMMAND_ASSOCIATE_DOMAIN, arguments: [document.uri], title: title };
		action.diagnostics = [diagnostic];
		// todo: re-introduce this when upgraded to a later VS Code version
		// action.isPreferred = true;
		return action;
	}
}
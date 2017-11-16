/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { workspace, window, ExtensionContext, commands, Uri, ViewColumn, Range, StatusBarAlignment, extensions, TextDocument } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, State } from 'vscode-languageclient';

import { Planning } from './planning'

import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, PddlRange } from '../../common/src/parser';
import { PddlConfiguration } from './configuration';

const PDDL_STOP_PLANNER = 'pddl.stopPlanner';
const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_CONFIGURE_PLANNER = 'pddl.configurePlanner';
const PDDL = 'PDDL';

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'server', 'src', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

	let pddlConfiguration = new PddlConfiguration(context);
	uninstallLegacyExtension(pddlConfiguration);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for PDDL documents
		documentSelector: [{ scheme: 'file', language: 'pddl' }],
		synchronize: {
			// Synchronize the setting section 'pddlParser' to the server
			configurationSection: 'pddlParser',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	// Create the language client and start the client.
	let languageClient = new LanguageClient('pddlParser', 'PDDL Language Server', serverOptions, clientOptions);
	context.subscriptions.push(languageClient.start());

	const status = window.createStatusBarItem(StatusBarAlignment.Right, 100);
	status.text = '$(server)';
	status.tooltip = 'Stop the planning engine.'

	let pddlWorkspace = new PddlWorkspace();
	subscribeToWorkspace(pddlWorkspace, context);
	let planning = new Planning(pddlWorkspace, pddlConfiguration, context, status);

	let planCommand = commands.registerCommand('pddl.planAndDisplayResult', () => {
		planning.plan();
	});

	let revealActionCommand = commands.registerCommand('pddl.revealAction', (domainFileUri: Uri, actionName: String) => {
		revealAction(<DomainInfo>pddlWorkspace.getFileInfo(domainFileUri.toString()), actionName);
	});

	let stopPlannerCommand = commands.registerCommand(PDDL_STOP_PLANNER, () => planning.stopPlanner());
	status.command = PDDL_STOP_PLANNER;

	let configureParserCommand = commands.registerCommand(PDDL_CONFIGURE_PARSER, () => {
		pddlConfiguration.setupParserLater = false;
		pddlConfiguration.suggestNewParserConfiguration(false);
	});

	let configurePlannerCommand = commands.registerCommand(PDDL_CONFIGURE_PLANNER, () => {
		pddlConfiguration.askNewPlannerPath();
	});

	// when the extension is done loading, subscribe to the client-server communication
	let stateChangeHandler = languageClient.onDidChangeState((stateEvent) => {
		if (stateEvent.newState == State.Running) languageClient.onRequest('pddl.configureParser', (showNever) => {
			pddlConfiguration.suggestNewParserConfiguration(showNever);
		});
	});

	// Push the disposables to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(planCommand, revealActionCommand, planning.planDocumentProviderRegistration, status, stopPlannerCommand, stateChangeHandler, configureParserCommand, configurePlannerCommand);
}

async function revealAction(domainInfo: DomainInfo, actionName: String) {
	let document = await workspace.openTextDocument(Uri.parse(domainInfo.fileUri));
	let actionFound = domainInfo.actions.find(a => a.name.toLowerCase() == actionName.toLowerCase());
	let actionRange = actionFound ? toRange(actionFound.location) : null;
	window.showTextDocument(document.uri, { viewColumn: ViewColumn.One, preserveFocus: true, preview: true, selection: actionRange });
}

function toRange(pddlRange: PddlRange): Range {
	return new Range(pddlRange.startLine, pddlRange.startCharacter, pddlRange.endLine, pddlRange.endCharacter);
}

function subscribeToWorkspace(pddlWorkspace: PddlWorkspace, context: ExtensionContext): void {
	workspace.textDocuments
		.filter(textDoc => textDoc.languageId == 'pddl')
		.forEach(textDoc => {
			pddlWorkspace.upsertFile(textDoc.uri.toString(), textDoc.version, textDoc.getText());
		});

	context.subscriptions.push(workspace.onDidOpenTextDocument(textDoc => { if(isPddl(textDoc)) pddlWorkspace.upsertFile(textDoc.uri.toString(), textDoc.version, textDoc.getText())}));
	context.subscriptions.push(workspace.onDidChangeTextDocument(docEvent => { if(isPddl(docEvent.document)) pddlWorkspace.upsertFile(docEvent.document.uri.toString(), docEvent.document.version, docEvent.document.getText())}));
	context.subscriptions.push(workspace.onDidCloseTextDocument(docEvent => { if(isPddl(docEvent)) pddlWorkspace.removeFile(docEvent.uri.toString())}));
}

function isPddl(doc: TextDocument): boolean {
	return doc.languageId.toLowerCase() == PDDL;
}

function uninstallLegacyExtension(pddlConfiguration: PddlConfiguration) {
	let extension = extensions.getExtension("jan-dolejsi.pddl-parser");
	
	if (extension) {
		pddlConfiguration.copyFromLegacyParserConfig()
		window.showWarningMessage(`The internal preview extension 'PDDL SL8 Only' is now obsolete. Please uninstall it, or it will interfere with functionality of the PDDL extension.`);
	}
}
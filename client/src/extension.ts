/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { workspace, window, ExtensionContext, commands, Uri, ViewColumn, Range, languages } from 'vscode';

import { Planning } from './planning/planning'

import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, PddlRange, PDDL } from '../../common/src/parser';
import { PddlConfiguration } from './configuration';
import { Authentication } from '../../common/src/Authentication';
import { AutoCompletion } from './completion/AutoCompletion';
import { SymbolRenameProvider } from './SymbolRenameProvider';
import { SymbolInfoProvider } from './SymbolInfoProvider';
import { Diagnostics } from './diagnostics/Diagnostics';
import { StartUp } from './StartUp'
import { PTestExplorer } from './ptest/PTestExplorer';
import { PlanValidator } from './diagnostics/PlanValidator';
import { Debugging } from './debugger/debugging';
import { Telemetry } from './telemetry';
import { isPddl, isPlan, toLanguage } from './utils';

const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_LOGIN_PARSER_SERVICE = 'pddl.loginParserService';
const PDDL_UPDATE_TOKENS_PARSER_SERVICE = 'pddl.updateTokensParserService';
const PDDL_CONFIGURE_PLANNER = 'pddl.configurePlanner';
const PDDL_LOGIN_PLANNER_SERVICE = 'pddl.loginPlannerService';
const PDDL_UPDATE_TOKENS_PLANNER_SERVICE = 'pddl.updateTokensPlannerService';

var telemetry: Telemetry;

export function activate(context: ExtensionContext) {

	telemetry = new Telemetry(context)
	let pddlConfiguration = new PddlConfiguration(context);

	// run start-up actions
	new StartUp(context).atStartUp(pddlConfiguration);

	let pddlWorkspace = new PddlWorkspace(pddlConfiguration.getEpsilonTimeStep(), context);
	let planning = new Planning(pddlWorkspace, pddlConfiguration, context);
	let planValidator = new PlanValidator(planning.output, pddlWorkspace, pddlConfiguration, context);

	let revealActionCommand = commands.registerCommand('pddl.revealAction', (domainFileUri: Uri, actionName: String) => {
		revealAction(<DomainInfo>pddlWorkspace.getFileInfo(domainFileUri.toString()), actionName);
	});

	let configureParserCommand = commands.registerCommand(PDDL_CONFIGURE_PARSER, () => {
		pddlConfiguration.setupParserLater = false;
		pddlConfiguration.suggestNewParserConfiguration(false);
	});

	let loginParserServiceCommand = commands.registerCommand(PDDL_LOGIN_PARSER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlParserAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Login successful.");
				},
				(message: string) => { window.showErrorMessage('Login failure: ' + message); });
		});
	});

	let updateTokensParserServiceCommand = commands.registerCommand(PDDL_UPDATE_TOKENS_PARSER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlParserAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Tokens refreshed and saved.");
				},
				(message: string) => { window.showErrorMessage('Couldn\'t refresh the tokens, try to login: ' + message); });
		});
	});

	let configurePlannerCommand = commands.registerCommand(PDDL_CONFIGURE_PLANNER, () => {
		pddlConfiguration.askNewPlannerPath();
	});

	let loginPlannerServiceCommand = commands.registerCommand(PDDL_LOGIN_PLANNER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlPlannerAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Login successful.");
				},
				(message: string) => { window.showErrorMessage('Login failure: ' + message); });
		});
	});

	let updateTokensPlannerServiceCommand = commands.registerCommand(PDDL_UPDATE_TOKENS_PLANNER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlPlannerAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Tokens refreshed and saved.");
				},
				(message: string) => { window.showErrorMessage('Couldn\'t refresh the tokens, try to login: ' + message); });
		});
	});

	let completionItemProvider = languages.registerCompletionItemProvider(PDDL, new AutoCompletion(pddlWorkspace), '(', ':', '-');

	let renameProvider = languages.registerRenameProvider(PDDL, new SymbolRenameProvider(pddlWorkspace));

	let symbolInfoProvider = new SymbolInfoProvider(pddlWorkspace);

	let documentSymbolProvider = languages.registerDocumentSymbolProvider(PDDL, symbolInfoProvider);
	let definitionProvider = languages.registerDefinitionProvider(PDDL, symbolInfoProvider);
	let referencesProvider = languages.registerReferenceProvider(PDDL, symbolInfoProvider);
	let hoverProvider = languages.registerHoverProvider(PDDL, symbolInfoProvider);
	let diagnosticCollection = languages.createDiagnosticCollection(PDDL);
	let diagnostics = new Diagnostics(pddlWorkspace, diagnosticCollection,  pddlConfiguration, planValidator);

	if(workspace.getConfiguration().get<boolean>("pddlTestExplorer.enabled")) new PTestExplorer(context, planning);

	new Debugging(context, pddlWorkspace);
	
	subscribeToWorkspace(pddlWorkspace, pddlConfiguration, context);

	// Push the disposables to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(diagnostics, revealActionCommand,
		configureParserCommand, loginParserServiceCommand, updateTokensParserServiceCommand,
		configurePlannerCommand, loginPlannerServiceCommand, updateTokensPlannerServiceCommand, completionItemProvider,
		renameProvider, documentSymbolProvider, definitionProvider, referencesProvider, hoverProvider);
}

export function deactivate() {
	// This will ensure all pending events get flushed
	telemetry.dispose();
}

function createAuthentication(pddlConfiguration: PddlConfiguration): Authentication {
	let configuration = pddlConfiguration.getPddlParserServiceAuthenticationConfiguration();
	return new Authentication(configuration.url, configuration.requestEncoded, configuration.clientId, configuration.callbackPort, configuration.timeoutInMs,
		configuration.tokensvcUrl, configuration.tokensvcApiKey, configuration.tokensvcAccessPath, configuration.tokensvcValidatePath,
		configuration.tokensvcCodePath, configuration.tokensvcRefreshPath, configuration.tokensvcSvctkPath,
		configuration.refreshToken, configuration.accessToken, configuration.sToken);
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

function subscribeToWorkspace(pddlWorkspace: PddlWorkspace, pddlConfiguration: PddlConfiguration, context: ExtensionContext): void {
	// add all open documents
	workspace.textDocuments
		.filter(textDoc => isPddl(textDoc) || isPlan(textDoc))
		.forEach(textDoc => {
			pddlWorkspace.upsertFile(textDoc.uri.toString(), toLanguage(textDoc), textDoc.version, textDoc.getText());
		});

	// subscribe to document opening event
	context.subscriptions.push(workspace.onDidOpenTextDocument(textDoc => { 
		if (isPddl(textDoc) || isPlan(textDoc)) 
			pddlWorkspace.upsertFile(textDoc.uri.toString(), toLanguage(textDoc), textDoc.version, textDoc.getText()) 
		}
	));

	// subscribe to document changing event
	context.subscriptions.push(workspace.onDidChangeTextDocument(docEvent => {
		if (isPddl(docEvent.document) || isPlan(docEvent.document))
			pddlWorkspace.upsertFile(docEvent.document.uri.toString(), toLanguage(docEvent.document), docEvent.document.version, docEvent.document.getText())
		}
	));

	// subscribe to document closing event
	context.subscriptions.push(workspace.onDidCloseTextDocument(textDoc => { 
		if (isPddl(textDoc) || isPlan(textDoc)) pddlWorkspace.removeFile(textDoc.uri.toString()) 
	}));

	workspace.onDidChangeConfiguration(_ => pddlWorkspace.epsilon = pddlConfiguration.getEpsilonTimeStep());
}

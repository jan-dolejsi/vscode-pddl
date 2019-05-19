/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { workspace, window, ExtensionContext, commands, Uri, ViewColumn, Range, languages } from 'vscode';

import { Planning } from './planning/planning';
import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, PDDL, PLAN, HAPPENINGS } from '../../common/src/parser';
import { PddlRange } from '../../common/src/FileInfo';
import { PddlConfiguration } from './configuration';
import { Authentication } from '../../common/src/Authentication';
import { AutoCompletion } from './completion/AutoCompletion';
import { SymbolRenameProvider } from './SymbolRenameProvider';
import { SymbolInfoProvider } from './SymbolInfoProvider';
import { Diagnostics } from './diagnostics/Diagnostics';
import { StartUp } from './init/StartUp';
import { PTestExplorer } from './ptest/PTestExplorer';
import { PlanValidator } from './diagnostics/PlanValidator';
import { Debugging } from './debugger/debugging';
import { ExtensionInfo } from './ExtensionInfo';
import { toLanguage, isAnyPddl, createPddlExtensionContext } from './utils';
import { HappeningsValidator } from './diagnostics/HappeningsValidator';
import { PlanComparer } from './comparison/PlanComparer';
import { Catalog } from './catalog/Catalog';

import { initialize, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { KEY } from './TelemetryInstrumentation';
import { SearchDebugger } from './searchDebugger/SearchDebugger';
import { PlanningDomainsSessions } from './session/PlanningDomainsSessions';

const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_LOGIN_PARSER_SERVICE = 'pddl.loginParserService';
const PDDL_UPDATE_TOKENS_PARSER_SERVICE = 'pddl.updateTokensParserService';
const PDDL_CONFIGURE_PLANNER = 'pddl.configurePlanner';
const PDDL_LOGIN_PLANNER_SERVICE = 'pddl.loginPlannerService';
const PDDL_UPDATE_TOKENS_PLANNER_SERVICE = 'pddl.updateTokensPlannerService';

const PDDL_CONFIGURE_VALIDATOR = 'pddl.configureValidate';

export async function activate(context: ExtensionContext) {

	let extensionInfo = new ExtensionInfo();

	// initialize the instrumentation wrapper
	await initialize(extensionInfo.getId(), extensionInfo.getVersion(), KEY);

	try {
		// activate the extension, but send instrumentation data
		await instrumentOperation("activation", activateWithTelemetry)(context);
	}
	catch (ex) {
		window.showErrorMessage("There was an error starting the PDDL extension: " + ex);
	}
}

function activateWithTelemetry(_operationId: string, context: ExtensionContext) {
	let pddlConfiguration = new PddlConfiguration(context);

	// run start-up actions
	new StartUp(context, pddlConfiguration).atStartUp();

	let pddlContext = createPddlExtensionContext(context);

	let pddlWorkspace = new PddlWorkspace(pddlConfiguration.getEpsilonTimeStep(), pddlContext);
	let planning = new Planning(pddlWorkspace, pddlConfiguration, context);
	let planValidator = new PlanValidator(planning.output, pddlWorkspace, pddlConfiguration, context);
	let happeningsValidator = new HappeningsValidator(planning.output, pddlWorkspace, pddlConfiguration, context);

	let revealActionCommand = commands.registerCommand('pddl.revealAction', (domainFileUri: Uri, actionName: String) => {
		revealAction(<DomainInfo>pddlWorkspace.getFileInfo(domainFileUri.toString()), actionName);
	});

	let configureParserCommand = commands.registerCommand(PDDL_CONFIGURE_PARSER, () => {
		pddlConfiguration.askNewParserPath();
	});

	let searchDebugger = new SearchDebugger(context);
	planning.addOptionsProvider(searchDebugger);

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

	context.subscriptions.push(commands.registerCommand(PDDL_CONFIGURE_VALIDATOR, () => {
		pddlConfiguration.askNewValidatorPath();
	}));

	let completionItemProvider = languages.registerCompletionItemProvider(PDDL, new AutoCompletion(pddlWorkspace), '(', ':', '-');

	let renameProvider = languages.registerRenameProvider(PDDL, new SymbolRenameProvider(pddlWorkspace));

	let symbolInfoProvider = new SymbolInfoProvider(pddlWorkspace);

	let documentSymbolProvider = languages.registerDocumentSymbolProvider(PDDL, symbolInfoProvider);
	let definitionProvider = languages.registerDefinitionProvider(PDDL, symbolInfoProvider);
	let referencesProvider = languages.registerReferenceProvider(PDDL, symbolInfoProvider);
	let hoverProvider = languages.registerHoverProvider(PDDL, symbolInfoProvider);
	let diagnosticCollection = languages.createDiagnosticCollection(PDDL);
	let diagnostics = new Diagnostics(pddlWorkspace, diagnosticCollection, pddlConfiguration,
		planValidator, happeningsValidator);

	let planDefinitionProvider = languages.registerDefinitionProvider(PLAN, symbolInfoProvider);
	let planHoverProvider = languages.registerHoverProvider(PLAN, symbolInfoProvider);

	let happeningsDefinitionProvider = languages.registerDefinitionProvider(HAPPENINGS, symbolInfoProvider);
	let happeningsHoverProvider = languages.registerHoverProvider(HAPPENINGS, symbolInfoProvider);

	// tslint:disable-next-line:no-unused-expression
	new PTestExplorer(pddlContext, planning);

	// tslint:disable-next-line:no-unused-expression
	new Catalog(context);

	// tslint:disable-next-line:no-unused-expression
	new PlanningDomainsSessions(context);

	// tslint:disable-next-line:no-unused-expression
	new Debugging(context, pddlWorkspace, pddlConfiguration);

	context.subscriptions.push(new PlanComparer(pddlWorkspace, pddlConfiguration));

	subscribeToWorkspace(pddlWorkspace, pddlConfiguration, context);

	// Push the disposables to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(diagnostics, revealActionCommand,
		configureParserCommand, loginParserServiceCommand, updateTokensParserServiceCommand,
		configurePlannerCommand, loginPlannerServiceCommand, updateTokensPlannerServiceCommand, completionItemProvider,
		renameProvider, documentSymbolProvider, definitionProvider, referencesProvider, hoverProvider,
		planHoverProvider, planDefinitionProvider, happeningsHoverProvider, happeningsDefinitionProvider);
}

export function deactivate() {
	// nothing to do
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
	let actionFound = domainInfo.actions.find(a => a.name.toLowerCase() === actionName.toLowerCase());
	let actionRange = actionFound ? toRange(actionFound.location) : null;
	window.showTextDocument(document.uri, { viewColumn: ViewColumn.One, preserveFocus: true, preview: true, selection: actionRange });
}

function toRange(pddlRange: PddlRange): Range {
	return new Range(pddlRange.startLine, pddlRange.startCharacter, pddlRange.endLine, pddlRange.endCharacter);
}

function subscribeToWorkspace(pddlWorkspace: PddlWorkspace, pddlConfiguration: PddlConfiguration, context: ExtensionContext): void {
	// add all open documents
	workspace.textDocuments
		.filter(textDoc => isAnyPddl(textDoc))
		.forEach(textDoc => {
			pddlWorkspace.upsertFile(textDoc.uri.toString(), toLanguage(textDoc), textDoc.version, textDoc.getText());
		});

	// subscribe to document opening event
	context.subscriptions.push(workspace.onDidOpenTextDocument(textDoc => {
		if (isAnyPddl(textDoc)) {
			pddlWorkspace.upsertFile(textDoc.uri.toString(), toLanguage(textDoc), textDoc.version, textDoc.getText());
		}
	}));

	// subscribe to document changing event
	context.subscriptions.push(workspace.onDidChangeTextDocument(docEvent => {
		if (isAnyPddl(docEvent.document)) {
			pddlWorkspace.upsertFile(docEvent.document.uri.toString(), toLanguage(docEvent.document), docEvent.document.version, docEvent.document.getText());
		}
	}));

	// subscribe to document closing event
	context.subscriptions.push(workspace.onDidCloseTextDocument(textDoc => {
		if (isAnyPddl(textDoc)) { pddlWorkspace.removeFile(textDoc.uri.toString()); }
	}));

	workspace.onDidChangeConfiguration(_ => pddlWorkspace.epsilon = pddlConfiguration.getEpsilonTimeStep());
}

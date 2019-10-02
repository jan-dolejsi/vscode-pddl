/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { workspace, window, ExtensionContext, commands, languages } from 'vscode';

import { Planning } from './planning/planning';
import { PddlWorkspace } from '../../common/src/PddlWorkspace';
import { PDDL, PLAN, HAPPENINGS } from '../../common/src/parser';
import { PddlConfiguration } from './configuration';
import { Authentication } from '../../common/src/Authentication';
import { AutoCompletion } from './completion/AutoCompletion';
import { SymbolRenameProvider } from './symbols/SymbolRenameProvider';
import { SymbolInfoProvider } from './symbols/SymbolInfoProvider';
import { Diagnostics } from './diagnostics/Diagnostics';
import { StartUp } from './init/StartUp';
import { PTestExplorer } from './ptest/PTestExplorer';
import { PlanValidator } from './diagnostics/PlanValidator';
import { Debugging } from './debugger/debugging';
import { ExtensionInfo } from './ExtensionInfo';
import { HappeningsValidator } from './diagnostics/HappeningsValidator';
import { PlanComparer } from './comparison/PlanComparer';
import { Catalog } from './catalog/Catalog';

import { initialize, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { KEY } from './TelemetryInstrumentation';
import { SearchDebugger } from './searchDebugger/SearchDebugger';
import { PlanningDomainsSessions } from './session/PlanningDomainsSessions';
import { PddlFormatProvider } from './formatting/PddlFormatProvider';
import { Val } from './validation/Val';
import { createPddlExtensionContext } from './utils';
import { AssociationProvider } from './workspace/AssociationProvider';
import { SuggestionProvider } from './symbols/SuggestionProvider';
import { CodePddlWorkspace } from './workspace/CodePddlWorkspace';
import { DomainDiagnostics } from './diagnostics/DomainDiagnostics';
import { PddlOnTypeFormatter } from './formatting/PddlOnTypeFormatter';
import { PddlCompletionItemProvider } from './completion/PddlCompletionItemProvider';

const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_LOGIN_PARSER_SERVICE = 'pddl.loginParserService';
const PDDL_UPDATE_TOKENS_PARSER_SERVICE = 'pddl.updateTokensParserService';
const PDDL_CONFIGURE_PLANNER = 'pddl.configurePlanner';
const PDDL_LOGIN_PLANNER_SERVICE = 'pddl.loginPlannerService';
const PDDL_UPDATE_TOKENS_PLANNER_SERVICE = 'pddl.updateTokensPlannerService';

const PDDL_CONFIGURE_VALIDATOR = 'pddl.configureValidate';
var formattingProvider: PddlFormatProvider;

export async function activate(context: ExtensionContext) {

	let extensionInfo = new ExtensionInfo();

	// initialize the instrumentation wrapper
	await initialize(extensionInfo.getId(), extensionInfo.getVersion(), KEY);

	try {
		// activate the extension, but send instrumentation data
		await instrumentOperation("activation", activateWithTelemetry)(context);
	}
	catch (ex) {
		// sadly, the next line never gets triggered, even if the activateWithTelemetry fails
		window.showErrorMessage("There was an error starting the PDDL extension: " + ex.message);
	}
}

function activateWithTelemetry(_operationId: string, context: ExtensionContext) {
	let pddlConfiguration = new PddlConfiguration(context);

	let val = new Val(context);

	// run start-up actions
	new StartUp(context, pddlConfiguration, val).atStartUp();

	let pddlContext = createPddlExtensionContext(context);

	let pddlWorkspace = new PddlWorkspace(pddlConfiguration.getEpsilonTimeStep(), pddlContext);
	let codePddlWorkspace = new CodePddlWorkspace(pddlWorkspace, pddlConfiguration, context);
	let planning = new Planning(codePddlWorkspace, pddlConfiguration, context);
	let planValidator = new PlanValidator(planning.output, codePddlWorkspace, pddlConfiguration, context);
	let happeningsValidator = new HappeningsValidator(planning.output, codePddlWorkspace, pddlConfiguration, context);

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

	let completionItemProvider = languages.registerCompletionItemProvider(PDDL, new AutoCompletion(codePddlWorkspace), '(', ':', '-');
	let completionItemProvider2 = languages.registerCompletionItemProvider(PDDL, new PddlCompletionItemProvider(codePddlWorkspace), '(', ':', '-');

	let suggestionProvider = languages.registerCodeActionsProvider(PDDL, new SuggestionProvider(codePddlWorkspace), {
		providedCodeActionKinds: SuggestionProvider.providedCodeActionKinds
	});

	registerDocumentFormattingProvider(context, codePddlWorkspace);

	let renameProvider = languages.registerRenameProvider(PDDL, new SymbolRenameProvider(codePddlWorkspace));

	let symbolInfoProvider = new SymbolInfoProvider(codePddlWorkspace);

	let documentSymbolProvider = languages.registerDocumentSymbolProvider(PDDL, symbolInfoProvider);
	let definitionProvider = languages.registerDefinitionProvider(PDDL, symbolInfoProvider);
	let referencesProvider = languages.registerReferenceProvider(PDDL, symbolInfoProvider);
	let hoverProvider = languages.registerHoverProvider(PDDL, symbolInfoProvider);
	let diagnosticCollection = languages.createDiagnosticCollection(PDDL);
	let diagnostics = new Diagnostics(codePddlWorkspace, diagnosticCollection, pddlConfiguration,
		planValidator, happeningsValidator);

	// tslint:disable-next-line:no-unused-expression
	new DomainDiagnostics(codePddlWorkspace);

	// tslint:disable-next-line: no-unused-expression
	new AssociationProvider(context, codePddlWorkspace);

	let planDefinitionProvider = languages.registerDefinitionProvider(PLAN, symbolInfoProvider);
	let planHoverProvider = languages.registerHoverProvider(PLAN, symbolInfoProvider);

	let happeningsDefinitionProvider = languages.registerDefinitionProvider(HAPPENINGS, symbolInfoProvider);
	let happeningsHoverProvider = languages.registerHoverProvider(HAPPENINGS, symbolInfoProvider);

	// tslint:disable-next-line:no-unused-expression
	new PTestExplorer(pddlContext, codePddlWorkspace, planning);

	// tslint:disable-next-line:no-unused-expression
	new Catalog(context);

	// tslint:disable-next-line:no-unused-expression
	new PlanningDomainsSessions(context);

	// tslint:disable-next-line:no-unused-expression
	new Debugging(context, codePddlWorkspace, pddlConfiguration);

	context.subscriptions.push(new PlanComparer(pddlWorkspace, pddlConfiguration));

	workspace.onDidChangeConfiguration(_ => {
		if (registerDocumentFormattingProvider(context, codePddlWorkspace)) {
			window.showInformationMessage("PDDL formatter is now available. Right-click on a PDDL file...");
			console.log('PDDL Formatter enabled.');
		}
	});

	// Push the disposables to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(diagnostics,
		configureParserCommand, loginParserServiceCommand, updateTokensParserServiceCommand,
		configurePlannerCommand, loginPlannerServiceCommand, updateTokensPlannerServiceCommand, completionItemProvider, completionItemProvider2,
		renameProvider, suggestionProvider, documentSymbolProvider, definitionProvider, referencesProvider, hoverProvider,
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

function registerDocumentFormattingProvider(context: ExtensionContext, pddlWorkspace: CodePddlWorkspace): boolean {
	if (workspace.getConfiguration("pddl").get<boolean>("formatter") && !formattingProvider) {
		formattingProvider = new PddlFormatProvider();
		// let formattingProviderDisposable = languages.registerDocumentFormattingEditProvider(PDDL, formattingProvider);
		// context.subscriptions.push(formattingProviderDisposable);

		let onTypeFormattingProviderDisposable = languages.registerOnTypeFormattingEditProvider(PDDL, new PddlOnTypeFormatter(pddlWorkspace), '\n');
		context.subscriptions.push(onTypeFormattingProviderDisposable);

		return true;
	}	
	else {
		return false;
	}
}
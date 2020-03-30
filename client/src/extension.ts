/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { workspace, window, ExtensionContext, languages } from 'vscode';

import { Planning } from './planning/planning';
import { PddlWorkspace } from 'pddl-workspace';
import { PDDL, PLAN, HAPPENINGS } from 'pddl-workspace';
import { PddlConfiguration, PDDL_CONFIGURE_COMMAND } from './configuration';
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

import { initialize, instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { SearchDebugger } from './searchDebugger/SearchDebugger';
import { PlanningDomainsSessions } from './session/PlanningDomainsSessions';
import { PddlFormatProvider } from './formatting/PddlFormatProvider';
import { ValDownloader } from './validation/ValDownloader';
import { createPddlExtensionContext, showError } from './utils';
import { AssociationProvider } from './workspace/AssociationProvider';
import { SuggestionProvider } from './symbols/SuggestionProvider';
import { CodePddlWorkspace } from './workspace/CodePddlWorkspace';
import { DomainDiagnostics } from './diagnostics/DomainDiagnostics';
import { PddlOnTypeFormatter } from './formatting/PddlOnTypeFormatter';
import { PddlCompletionItemProvider } from './completion/PddlCompletionItemProvider';
import { ProblemInitView } from './modelView/ProblemInitView';
import { ProblemObjectsView } from './modelView/ProblemObjectsView';
import { DomainTypesView } from './modelView/DomainTypesView';
import { ProblemConstraintsView } from './modelView/ProblemConstraintsView';
import { ModelHierarchyProvider } from './symbols/ModelHierarchyProvider';

const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_LOGIN_PARSER_SERVICE = 'pddl.loginParserService';
const PDDL_UPDATE_TOKENS_PARSER_SERVICE = 'pddl.updateTokensParserService';
const PDDL_CONFIGURE_PLANNER = 'pddl.configurePlanner';
const PDDL_LOGIN_PLANNER_SERVICE = 'pddl.loginPlannerService';
const PDDL_UPDATE_TOKENS_PLANNER_SERVICE = 'pddl.updateTokensPlannerService';

const PDDL_CONFIGURE_VALIDATOR = 'pddl.configureValidate';
var formattingProvider: PddlFormatProvider;

export async function activate(context: ExtensionContext): Promise<PddlWorkspace | undefined> {

	let extensionInfo = new ExtensionInfo();

	// initialize the instrumentation wrapper
	const KEY: string = process.env.VSCODE_PDDL_TELEMETRY_TOKEN || null;// MUST NOT BE STORED!!
	await initialize(extensionInfo.getId(), extensionInfo.getVersion(), KEY);

	try {
		// activate the extension, but send instrumentation data
		return await instrumentOperation("activation", activateWithTelemetry)(context);
	}
	catch (ex) {
		// sadly, the next line never gets triggered, even if the activateWithTelemetry fails
		console.error("Error during PDDL extension activation: " + (ex.message ?? ex));
		window.showErrorMessage("There was an error starting the PDDL extension: " + ex.message);
		return undefined;
	}
}

var pddlConfiguration: PddlConfiguration;

function activateWithTelemetry(_operationId: string, context: ExtensionContext): PddlWorkspace {
	pddlConfiguration = new PddlConfiguration(context);

	let valDownloader = new ValDownloader(context).registerCommands();

	// run start-up actions
	new StartUp(context, pddlConfiguration, valDownloader).atStartUp();

	let pddlContext = createPddlExtensionContext(context);

	let pddlWorkspace = new PddlWorkspace(pddlConfiguration.getEpsilonTimeStep(), pddlContext);
	let codePddlWorkspace = CodePddlWorkspace.getInstance(pddlWorkspace, context, pddlConfiguration);
	let planning = new Planning(codePddlWorkspace, pddlConfiguration, context);
	let planValidator = new PlanValidator(planning.output, codePddlWorkspace, pddlConfiguration, context);
	let happeningsValidator = new HappeningsValidator(planning.output, codePddlWorkspace, pddlConfiguration, context);

	let configureParserCommand = instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_PARSER, () => {
		pddlConfiguration.askNewParserPath();
	});

	let searchDebugger = new SearchDebugger(context, pddlConfiguration);
	planning.addOptionsProvider(searchDebugger);

	let loginParserServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_LOGIN_PARSER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlParserAuthenticationTokens(configuration!, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Login successful.");
				},
				(message: string) => { window.showErrorMessage('Login failure: ' + message); });
		});
	});

	let updateTokensParserServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_UPDATE_TOKENS_PARSER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlParserAuthenticationTokens(configuration!, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Tokens refreshed and saved.");
				},
				(message: string) => { window.showErrorMessage('Couldn\'t refresh the tokens, try to login: ' + message); });
		});
	});

	let configurePlannerCommand = instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_PLANNER, () => {
		pddlConfiguration.askNewPlannerPath();
	});

	let loginPlannerServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_LOGIN_PLANNER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlPlannerAuthenticationTokens(configuration!, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Login successful.");
				},
				(message: string) => { window.showErrorMessage('Login failure: ' + message); });
		});
	});

	let updateTokensPlannerServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_UPDATE_TOKENS_PLANNER_SERVICE, () => {
		let scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			let configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			let authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlPlannerAuthenticationTokens(configuration!, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Tokens refreshed and saved.");
				},
				(message: string) => { window.showErrorMessage('Couldn\'t refresh the tokens, try to login: ' + message); });
		});
	});

	context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_VALIDATOR, () => {
		pddlConfiguration.askNewValidatorPath();
	}));

	let completionItemProvider = languages.registerCompletionItemProvider(PDDL, new AutoCompletion(codePddlWorkspace), '(', ':', '-');
	let completionItemProvider2 = languages.registerCompletionItemProvider(PDDL, new PddlCompletionItemProvider(codePddlWorkspace), '(', ':', '-', '?');

	let suggestionProvider = languages.registerCodeActionsProvider(PDDL, new SuggestionProvider(codePddlWorkspace), {
		providedCodeActionKinds: SuggestionProvider.providedCodeActionKinds
	});

	let domainTypesView = new DomainTypesView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, domainTypesView));

	let problemInitView = new ProblemInitView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, problemInitView));

	let problemObjectsView = new ProblemObjectsView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, problemObjectsView));

	let problemConstraintsView = new ProblemConstraintsView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, problemConstraintsView));

	registerDocumentFormattingProvider(context, codePddlWorkspace);

	let renameProvider = languages.registerRenameProvider(PDDL, new SymbolRenameProvider(codePddlWorkspace));
	
	if (workspace.getConfiguration("pddl").get<boolean>("modelHierarchy")) {
		let modelHierarchyProvider = new ModelHierarchyProvider(context, codePddlWorkspace);
		context.subscriptions.push(languages.registerHoverProvider(PDDL, modelHierarchyProvider));
	}
	
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
	
	let configureCommand = instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_COMMAND, (configurationName: string) => {
		pddlConfiguration.askConfiguration(configurationName).catch(showError);
	});

	console.log('PDDL Extension initialized.');

	// Push the disposables to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(diagnostics,
		configureParserCommand, loginParserServiceCommand, updateTokensParserServiceCommand,
		configurePlannerCommand, loginPlannerServiceCommand, updateTokensPlannerServiceCommand, completionItemProvider, completionItemProvider2,
		renameProvider, suggestionProvider, documentSymbolProvider, definitionProvider, referencesProvider, hoverProvider,
		planHoverProvider, planDefinitionProvider, happeningsHoverProvider, happeningsDefinitionProvider,
		problemInitView, problemObjectsView, problemConstraintsView, configureCommand);
	
	return pddlWorkspace;
}

export function deactivate() {
	// nothing to do
}

function createAuthentication(pddlConfiguration: PddlConfiguration): Authentication {
	let configuration = pddlConfiguration.getPddlParserServiceAuthenticationConfiguration();
	return new Authentication(configuration.url!, configuration.requestEncoded!, configuration.clientId!, configuration.callbackPort!, configuration.timeoutInMs!,
		configuration.tokensvcUrl!, configuration.tokensvcApiKey!, configuration.tokensvcAccessPath!, configuration.tokensvcValidatePath!,
		configuration.tokensvcCodePath!, configuration.tokensvcRefreshPath!, configuration.tokensvcSvctkPath!,
		configuration.refreshToken!, configuration.accessToken!, configuration.sToken!);
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
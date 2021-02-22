/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { workspace, window, ExtensionContext, languages, commands, Uri } from 'vscode';

import { Planning } from './planning/planning';
import { PddlWorkspace } from 'pddl-workspace';
import { PDDL, PLAN, HAPPENINGS } from 'pddl-workspace';
import { PddlConfiguration, PDDL_CONFIGURE_COMMAND } from './configuration/configuration';
import { Authentication } from './util/Authentication';
import { AutoCompletion } from './completion/AutoCompletion';
import { SymbolRenameProvider } from './symbols/SymbolRenameProvider';
import { SymbolInfoProvider } from './symbols/SymbolInfoProvider';
import { Diagnostics } from './diagnostics/Diagnostics';
import { StartUp } from './init/StartUp';
import { PTestExplorer } from './ptest/PTestExplorer';
import { PlanValidator } from './diagnostics/PlanValidator';
import { Debugging } from './debugger/debugging';
import { ExtensionInfo, ExtensionPackage } from './configuration/ExtensionInfo';
import { HappeningsValidator } from './diagnostics/HappeningsValidator';
import { PlanComparer } from './comparison/PlanComparer';
import { Catalog } from './catalog/Catalog';

import { initialize, instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { SearchDebugger } from './searchDebugger/SearchDebugger';
import { PlanningDomainsSessions } from './session/PlanningDomainsSessions';
import { PddlFormatProvider } from './formatting/PddlFormatProvider';
import { ValDownloader } from './validation/ValDownloader';
import { createPddlExtensionContext, showError, toPddlFileSystem } from './utils';
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
import { PlannersConfiguration } from './configuration/PlannersConfiguration';
import { registerPlanReport } from './planReport/planReport';

const PDDL_CONFIGURE_PARSER = 'pddl.configureParser';
const PDDL_LOGIN_PARSER_SERVICE = 'pddl.loginParserService';
const PDDL_UPDATE_TOKENS_PARSER_SERVICE = 'pddl.updateTokensParserService';
const PDDL_LOGIN_PLANNER_SERVICE = 'pddl.loginPlannerService';
const PDDL_UPDATE_TOKENS_PLANNER_SERVICE = 'pddl.updateTokensPlannerService';

const PDDL_CONFIGURE_VALIDATOR = 'pddl.configureValidate';
let formattingProvider: PddlFormatProvider;
let pddlConfiguration: PddlConfiguration;
export let plannersConfiguration: PlannersConfiguration;
/** the workspace instance that integration tests may use */
export let codePddlWorkspaceForTests: CodePddlWorkspace | undefined;
export let planning: Planning | undefined;
export let ptestExplorer: PTestExplorer | undefined;

export let packageJson: ExtensionPackage | undefined;
  
export async function activate(context: ExtensionContext): Promise<PddlWorkspace | undefined> {

	const extensionInfo = new ExtensionInfo();

	// initialize the instrumentation wrapper
	const telemetryKey = process.env.VSCODE_PDDL_TELEMETRY_TOKEN;
	if (telemetryKey) {
		await initialize(extensionInfo.getId(), extensionInfo.getVersion(), telemetryKey);
	}

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

async function activateWithTelemetry(_operationId: string, context: ExtensionContext): Promise<PddlWorkspace> {
	pddlConfiguration = new PddlConfiguration(context);

	const valDownloader = new ValDownloader(context).registerCommands();


	const pddlContext = createPddlExtensionContext(context);

	const pddlWorkspace = new PddlWorkspace(pddlConfiguration.getEpsilonTimeStep(), pddlContext, toPddlFileSystem(workspace.fs));
	plannersConfiguration = new PlannersConfiguration(context, pddlWorkspace);

	// run start-up actions
	new StartUp(context, pddlConfiguration, plannersConfiguration, valDownloader).atStartUp();

	const codePddlWorkspace = CodePddlWorkspace.getInstance(pddlWorkspace, context, pddlConfiguration);
	codePddlWorkspaceForTests = codePddlWorkspace;
	planning = new Planning(codePddlWorkspace, pddlConfiguration, plannersConfiguration, context);
	registerPlanReport(context);
	const planValidator = new PlanValidator(planning.output, codePddlWorkspace, pddlConfiguration, context);
	const happeningsValidator = new HappeningsValidator(planning.output, codePddlWorkspace, pddlConfiguration, context);

	const configureParserCommand = instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_PARSER, () => {
		pddlConfiguration.askNewParserPath();
	});

	const searchDebugger = new SearchDebugger(context, pddlConfiguration);
	planning.addOptionsProvider(searchDebugger);

	const loginParserServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_LOGIN_PARSER_SERVICE, () => {
		const scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			const configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			const authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlParserAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Login successful.");
				},
				(message: string) => { window.showErrorMessage('Login failure: ' + message); });
		});
	});

	const updateTokensParserServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_UPDATE_TOKENS_PARSER_SERVICE, () => {
		const scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			const configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			const authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlParserAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Tokens refreshed and saved.");
				},
				(message: string) => { window.showErrorMessage('Couldn\'t refresh the tokens, try to login: ' + message); });
		});
	});

	const loginPlannerServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_LOGIN_PLANNER_SERVICE, () => {
		const scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			const configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			const authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlPlannerAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Login successful.");
				},
				(message: string) => { window.showErrorMessage('Login failure: ' + message); });
		});
	});

	const updateTokensPlannerServiceCommand = instrumentOperationAsVsCodeCommand(PDDL_UPDATE_TOKENS_PLANNER_SERVICE, () => {
		const scopePromise = pddlConfiguration.askConfigurationScope();
		scopePromise.then((scope) => {
			if (scope === undefined) { return; } // canceled
			const configuration = pddlConfiguration.getConfigurationForScope(scope);
			if (configuration === undefined) { return; }
			const authentication = createAuthentication(pddlConfiguration);
			authentication.login(
				(refreshtoken: string, accesstoken: string, stoken: string) => {
					pddlConfiguration.savePddlPlannerAuthenticationTokens(configuration, refreshtoken, accesstoken, stoken, scope.target);
					window.showInformationMessage("Tokens refreshed and saved.");
				},
				(message: string) => { window.showErrorMessage('Couldn\'t refresh the tokens, try to login: ' + message); });
		});
	});

	context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_VALIDATOR, () => {
		pddlConfiguration.askNewValidatorPath();
	}));

	const completionItemProvider = languages.registerCompletionItemProvider(PDDL, new AutoCompletion(codePddlWorkspace), '(', ':', '-');
	const completionItemProvider2 = languages.registerCompletionItemProvider(PDDL, new PddlCompletionItemProvider(codePddlWorkspace), '(', ':', '-', '?');

	const suggestionProvider = languages.registerCodeActionsProvider(PDDL, new SuggestionProvider(codePddlWorkspace), {
		providedCodeActionKinds: SuggestionProvider.providedCodeActionKinds
	});

	const domainTypesView = new DomainTypesView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, domainTypesView));

	const problemInitView = new ProblemInitView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, problemInitView));

	const problemObjectsView = new ProblemObjectsView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, problemObjectsView));

	const problemConstraintsView = new ProblemConstraintsView(context, codePddlWorkspace);
	context.subscriptions.push(languages.registerCodeLensProvider(PDDL, problemConstraintsView));

	registerDocumentFormattingProvider(context, codePddlWorkspace);

	const renameProvider = languages.registerRenameProvider(PDDL, new SymbolRenameProvider(codePddlWorkspace));
	
	if (workspace.getConfiguration("pddl").get<boolean>("modelHierarchy")) {
		const modelHierarchyProvider = new ModelHierarchyProvider(context, codePddlWorkspace);
		context.subscriptions.push(languages.registerHoverProvider(PDDL, modelHierarchyProvider));
	}
	
	const symbolInfoProvider = new SymbolInfoProvider(codePddlWorkspace);

	const documentSymbolProvider = languages.registerDocumentSymbolProvider(PDDL, symbolInfoProvider);
	const definitionProvider = languages.registerDefinitionProvider(PDDL, symbolInfoProvider);
	const referencesProvider = languages.registerReferenceProvider(PDDL, symbolInfoProvider);
	const hoverProvider = languages.registerHoverProvider(PDDL, symbolInfoProvider);
	const diagnosticCollection = languages.createDiagnosticCollection(PDDL);
	
	const diagnostics = new Diagnostics(codePddlWorkspace, diagnosticCollection, pddlConfiguration,
		planValidator, happeningsValidator);

	// tslint:disable-next-line:no-unused-expression
	new DomainDiagnostics(codePddlWorkspace);

	// tslint:disable-next-line: no-unused-expression
	new AssociationProvider(context, codePddlWorkspace);

	const planDefinitionProvider = languages.registerDefinitionProvider(PLAN, symbolInfoProvider);
	const planHoverProvider = languages.registerHoverProvider(PLAN, symbolInfoProvider);

	const happeningsDefinitionProvider = languages.registerDefinitionProvider(HAPPENINGS, symbolInfoProvider);
	const happeningsHoverProvider = languages.registerHoverProvider(HAPPENINGS, symbolInfoProvider);

	// tslint:disable-next-line:no-unused-expression
	ptestExplorer = new PTestExplorer(pddlContext, codePddlWorkspace, planning);
	
	// tslint:disable-next-line:no-unused-expression
	new Catalog(context);

	// tslint:disable-next-line:no-unused-expression
	new PlanningDomainsSessions(context);

	// tslint:disable-next-line:no-unused-expression
	new Debugging(context, codePddlWorkspace, pddlConfiguration);

	const localPackageJson = packageJson = JSON.parse((await workspace.fs.readFile(Uri.file(context.asAbsolutePath('package.json')))).toString());

	context.subscriptions.push(instrumentOperationAsVsCodeCommand('pddl.settings', (): void => {
		commands.executeCommand(
			'workbench.action.openSettings',
			`@ext:${localPackageJson.publisher}.${localPackageJson.name}`
		);
	}));

	context.subscriptions.push(new PlanComparer(pddlWorkspace, pddlConfiguration));

	workspace.onDidChangeConfiguration(() => {
		plannersConfiguration.refreshStatusBar();
		if (registerDocumentFormattingProvider(context, codePddlWorkspace)) {
			window.showInformationMessage("PDDL formatter is now available. Right-click on a PDDL file...");
			console.log('PDDL Formatter enabled.');
		}
	});
	
	const configureCommand = instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_COMMAND, (configurationName: string) => {
		pddlConfiguration.askConfiguration(configurationName).catch(showError);
	});

	plannersConfiguration.registerBuiltInPlannerProviders();

	console.log('PDDL Extension initialized.');

	// Push the disposables to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(diagnostics,
		configureParserCommand, loginParserServiceCommand, updateTokensParserServiceCommand,
		loginPlannerServiceCommand, updateTokensPlannerServiceCommand, completionItemProvider, completionItemProvider2,
		renameProvider, suggestionProvider, documentSymbolProvider, definitionProvider, referencesProvider, hoverProvider,
		planHoverProvider, planDefinitionProvider, happeningsHoverProvider, happeningsDefinitionProvider,
		problemInitView, problemObjectsView, problemConstraintsView, configureCommand);
	
	return pddlWorkspace;
}

export function deactivate(): void {
	// nothing to do
}

function createAuthentication(pddlConfiguration: PddlConfiguration): Authentication {
	const configuration = pddlConfiguration.getPddlParserServiceAuthenticationConfiguration();
	return new Authentication(configuration.url!, configuration.requestEncoded!, configuration.clientId!, configuration.callbackPort!, configuration.timeoutInMs!,
		configuration.tokensvcUrl!, configuration.tokensvcApiKey!, configuration.tokensvcAccessPath!, configuration.tokensvcValidatePath!,
		configuration.tokensvcCodePath!, configuration.tokensvcRefreshPath!, configuration.tokensvcSvctkPath!,
		configuration.refreshToken!, configuration.accessToken!, configuration.sToken!);
}

function registerDocumentFormattingProvider(context: ExtensionContext, pddlWorkspace: CodePddlWorkspace): boolean {
	if (workspace.getConfiguration("pddl").get<boolean>("formatter") && !formattingProvider) {
		formattingProvider = new PddlFormatProvider(pddlWorkspace);
		const formattingProviderDisposable = languages.registerDocumentFormattingEditProvider(PDDL, formattingProvider);
		context.subscriptions.push(formattingProviderDisposable);
		const rangeFormattingProviderDisposable = languages.registerDocumentRangeFormattingEditProvider(PDDL, formattingProvider);
		context.subscriptions.push(rangeFormattingProviderDisposable);

		const onTypeFormattingProviderDisposable = languages.registerOnTypeFormattingEditProvider(PDDL, new PddlOnTypeFormatter(pddlWorkspace), '\n');
		context.subscriptions.push(onTypeFormattingProviderDisposable);

		return true;
	}	
	else {
		return false;
	}
}

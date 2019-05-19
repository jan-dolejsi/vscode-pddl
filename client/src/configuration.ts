/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { PDDLParserSettings } from './Settings';

export const PDDL_PARSER = 'pddlParser';
const PARSER_EXECUTABLE_OR_SERVICE = PDDL_PARSER + '.executableOrService';
const PARSER_EXECUTABLE_OPTIONS = PDDL_PARSER + '.executableOptions';
const PARSER_LEGACY_LOCATION = PDDL_PARSER + '.pddlParserService';
const PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN = PDDL_PARSER + '.serviceAuthenticationRefreshToken';
const PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN = PDDL_PARSER + '.serviceAuthenticationAccessToken';
const PARSER_SERVICE_AUTHENTICATION_S_TOKEN = PDDL_PARSER + '.serviceAuthenticationSToken';

export const PDDL_PLANNER = 'pddlPlanner';
const PLANNER_EXECUTABLE_OR_SERVICE = PDDL_PLANNER + '.executableOrService';
const PLANNER_EXECUTABLE_OPTIONS = PDDL_PLANNER + '.executableOptions';
const PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN = PDDL_PLANNER + '.serviceAuthenticationRefreshToken';
const PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN = PDDL_PLANNER + '.serviceAuthenticationAccessToken';
const PLANNER_SERVICE_AUTHENTICATION_S_TOKEN = PDDL_PLANNER + '.serviceAuthenticationSToken';
const PLANNER_EPSILON_TIMESTEP = PDDL_PLANNER + '.epsilonTimeStep';
export const CONF_PDDL = 'pddl';
export const VALIDATION_PATH = 'validatorPath';
export const VAL_STEP_PATH = 'valStepPath';
export const VALUE_SEQ_PATH = 'valueSeqPath';
export const PLANNER_VAL_STEP_PATH  = CONF_PDDL + "." + VAL_STEP_PATH;
export const PLANNER_VALUE_SEQ_PATH  = PDDL_PLANNER + "." + VALUE_SEQ_PATH;

export class PddlConfiguration {

    constructor(public context: vscode.ExtensionContext) {
    }

    getEpsilonTimeStep(): number {
        return vscode.workspace.getConfiguration().get(PLANNER_EPSILON_TIMESTEP);
    }

    async getParserPath(): Promise<string> {
        // this may be 'undefined'
        return vscode.workspace.getConfiguration().get(PARSER_EXECUTABLE_OR_SERVICE);

    }

    NEVER_SETUP_PARSER = 'neverSetupParser';
    setupParserLater = false;

    async suggestNewParserConfiguration(showNever: boolean) {
        if (await this.copyFromLegacyParserConfig()) { return; }

        if (this.setupParserLater || this.context.globalState.get(this.NEVER_SETUP_PARSER)) { return; }

        let setupParserNow: vscode.MessageItem = { title: "Setup now..." };
        let setupParserNever: vscode.MessageItem = { title: "Never" };
        let setupParserLater: vscode.MessageItem = { title: "Later", isCloseAffordance: true };
        let options: vscode.MessageItem[] = [setupParserNow, setupParserLater];
        if (showNever) { options.splice(2, 0, setupParserNever); }
        let choice = await vscode.window.showInformationMessage(
            'Setup a [PDDL parser](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser "Read more about PDDL parsers") in order to enable detailed syntactic analysis.',
            ...options);

        switch (choice) {
            case setupParserNow:
                this.askNewParserPath();
                // if the above method call updates the configuration, the parser will be notified
                break;

            case setupParserLater:
                this.setupParserLater = true;// will retry in the next session
                break;

            case setupParserNever:
                this.context.globalState.update(this.NEVER_SETUP_PARSER, true);

            default:
                break;
        }
    }

    async copyFromLegacyParserConfig(): Promise<string> {
        let configuration = vscode.workspace.getConfiguration();

        // first try to salvage configuration from a deprecated configuration field
        let legacyParserUrl: string = configuration.get(PARSER_LEGACY_LOCATION);

        if (legacyParserUrl) {

            await this.moveConfiguration(configuration, PARSER_LEGACY_LOCATION, PARSER_EXECUTABLE_OR_SERVICE);
            return legacyParserUrl;
        }
        else {
            return null;
        }
    }

    async askNewParserPath() {
        let existingValue: string = vscode.workspace.getConfiguration().get(PARSER_EXECUTABLE_OR_SERVICE);

        let newParserPath = await vscode.window.showInputBox({
            prompt: "Enter PDDL parser/validator path local command or web service URL",
            placeHolder: `parser.exe OR java -jar c:\\planner.jar OR https://someserver/parse`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newParserPath) {
            newParserPath = newParserPath.trim().replace(/\\/g, '/');

            // todo: validate that this parser actually works by sending a dummy request to it

            let newParserScope = await this.askConfigurationScope();

            if (!newParserScope) return null;

            let configurationToUpdate = this.getConfigurationForScope(newParserScope);

            if (!PddlConfiguration.isHttp(newParserPath)) {
                this.askParserOptions(newParserScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PARSER_EXECUTABLE_OR_SERVICE, newParserPath, newParserScope.target);
        }

        return newParserPath;
    }

    async askParserOptions(scope: ScopeQuickPickItem) {
        let existingValue: string = vscode.workspace.getConfiguration().get(PARSER_EXECUTABLE_OPTIONS);

        let newParserOptions = await vscode.window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser].",
            placeHolder: `$(parser) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newParserOptions) {
            // todo: validate that this parser actually works by sending a dummy request to it

            let configurationToUpdate = this.getConfigurationForScope(scope);

            // Update the value in the target
            configurationToUpdate.update(PARSER_EXECUTABLE_OPTIONS, newParserOptions, scope.target);
        }

        return newParserOptions;
    }

    isPddlParserServiceAuthenticationEnabled() {
        return vscode.workspace.getConfiguration().get<boolean>(PDDL_PARSER + '.serviceAuthenticationEnabled');
    }

    getPddlParserServiceAuthenticationConfiguration() {
        let configuration = vscode.workspace.getConfiguration();
        return {
            url: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationUrl'),
            requestEncoded: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationRequestEncoded'),
            clientId: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationClientId'),
            callbackPort: configuration.get<number>(PDDL_PARSER + '.serviceAuthenticationCallbackPort'),
            timeoutInMs: configuration.get<number>(PDDL_PARSER + '.serviceAuthenticationTimeoutInMs'),
            tokensvcUrl: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcUrl'),
            tokensvcApiKey: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcApiKey'),
            tokensvcAccessPath: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcAccessPath'),
            tokensvcValidatePath: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcValidatePath'),
            tokensvcCodePath: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcCodePath'),
            tokensvcRefreshPath: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcRefreshPath'),
            tokensvcSvctkPath: configuration.get<string>(PDDL_PARSER + '.serviceAuthenticationTokensvcSvctkPath'),
            refreshToken: configuration.get<string>(PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN),
            accessToken: configuration.get<string>(PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN),
            sToken: configuration.get<string>(PARSER_SERVICE_AUTHENTICATION_S_TOKEN),
        }
    }

    async savePddlParserAuthenticationTokens(configuration: vscode.WorkspaceConfiguration, refreshtoken: string, accesstoken: string, stoken: string, target: vscode.ConfigurationTarget) {
        configuration.update(PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, refreshtoken, target);
        configuration.update(PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, accesstoken, target);
        configuration.update(PARSER_SERVICE_AUTHENTICATION_S_TOKEN, stoken, target);
    }

    isPddlPlannerServiceAuthenticationEnabled() {
        return vscode.workspace.getConfiguration().get<boolean>(PDDL_PLANNER + '.serviceAuthenticationEnabled');
    }

    getPddlPlannerServiceAuthenticationConfiguration() {
        let configuration = vscode.workspace.getConfiguration();
        return {
            url: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationUrl'),
            requestEncoded: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationRequestEncoded'),
            clientId: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationClientId'),
            callbackPort: configuration.get<number>(PDDL_PLANNER + '.serviceAuthenticationCallbackPort'),
            timeoutInMs: configuration.get<number>(PDDL_PLANNER + '.serviceAuthenticationTimeoutInMs'),
            tokensvcUrl: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcUrl'),
            tokensvcApiKey: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcApiKey'),
            tokensvcAccessPath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcAccessPath'),
            tokensvcValidatePath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcValidatePath'),
            tokensvcCodePath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcCodePath'),
            tokensvcRefreshPath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcRefreshPath'),
            tokensvcSvctkPath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcSvctkPath'),
            refreshToken: configuration.get<string>(PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN),
            accessToken: configuration.get<string>(PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN),
            sToken: configuration.get<string>(PLANNER_SERVICE_AUTHENTICATION_S_TOKEN),
        }
    }

    async savePddlPlannerAuthenticationTokens(configuration: vscode.WorkspaceConfiguration, refreshtoken: string, accesstoken: string, stoken: string, target: vscode.ConfigurationTarget) {
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, refreshtoken, target);
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, accesstoken, target);
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_S_TOKEN, stoken, target);
    }

    static isHttp(path: string) {
        return path.match(/^http[s]?:/i);
    }

    async getPlannerPath(): Promise<string> {
        let plannerPath: string = vscode.workspace.getConfiguration().get(PLANNER_EXECUTABLE_OR_SERVICE);

        if (!plannerPath) {
            plannerPath = await this.askNewPlannerPath();
        }

        return plannerPath; // this may be 'undefined'
    }

    async askNewPlannerPath() {
        let existingValue: string = vscode.workspace.getConfiguration().get(PLANNER_EXECUTABLE_OR_SERVICE);

        let newPlannerPath = await vscode.window.showInputBox({
            prompt: "Enter PDDL planner path local command or web service URL",
            placeHolder: `planner.exe OR java -jar c:\\planner.jar OR http://solver.planning.domains/solve`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newPlannerPath) {

            newPlannerPath = newPlannerPath.trim().replace(/\\/g, '/');

            // todo: validate that this planner actually works by sending a dummy request to it

            let newPlannerScope = await this.askConfigurationScope();

            if (!newPlannerScope) return null;
            let configurationToUpdate = this.getConfigurationForScope(newPlannerScope);

            if (!PddlConfiguration.isHttp(newPlannerPath)) {
                this.askPlannerSyntax(newPlannerScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PLANNER_EXECUTABLE_OR_SERVICE, newPlannerPath, newPlannerScope.target);
        }

        return newPlannerPath;
    }

    async askPlannerSyntax(scope: ScopeQuickPickItem) {
        let existingValue: string = vscode.workspace.getConfiguration().get(PLANNER_EXECUTABLE_OPTIONS);

        let newPlannerOptions = await vscode.window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner].",
            placeHolder: `$(planner) $(options) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newPlannerOptions) {
            // todo: validate that this planner actually works by sending a dummy request to it

            let configurationToUpdate = this.getConfigurationForScope(scope);

            // Update the value in the target
            configurationToUpdate.update(PLANNER_EXECUTABLE_OPTIONS, newPlannerOptions, scope.target);
        }

        return newPlannerOptions;
    }

    NO_OPTIONS: OptionsQuickPickItem = { label: 'No options.', options: '', description: '' };
    optionsHistory: OptionsQuickPickItem[] = [ this.NO_OPTIONS, { label: 'Specify options...', newValue: true, options: '', description: '' }];

    async getPlannerOptions() {
        let optionsSelected = await vscode.window.showQuickPick(this.optionsHistory,
            { placeHolder: 'Optionally specify planner switches or press ENTER to use default planner configuration.' });

        if (!optionsSelected) { return null; } // operation canceled by the user by pressing Escape
        else if (optionsSelected.newValue) {
            let optionsEntered = await vscode.window.showInputBox({ placeHolder: 'Specify planner options.' });
            if (!optionsEntered) { return null; }
            optionsSelected = { label: optionsEntered, options: optionsEntered, description: '' };
        }
        else if (optionsSelected !== this.NO_OPTIONS) {
            // a previous option was selected - lets allow the user to edit it before continuing
            let optionsEntered = await vscode.window.showInputBox({value: optionsSelected.options, placeHolder: 'Specify planner options.', prompt: 'Adjust the options, if needed and press Enter to continue.'});
            if (!optionsEntered) { return null; } // canceled by the user
            optionsSelected = { label: optionsEntered, options: optionsEntered, description: '' };
        }

        let indexOf = this.optionsHistory.findIndex(option => option.options === optionsSelected.options);
        if (indexOf > -1) {
            this.optionsHistory.splice(indexOf, 1);
        }
        this.optionsHistory.unshift(optionsSelected); // insert to the first position
        return optionsSelected.options;
    }

    getPlannerSyntax(): string {
        return vscode.workspace.getConfiguration().get(PLANNER_EXECUTABLE_OPTIONS);
    }

    getValueSeqPath(): string {
        return vscode.workspace.getConfiguration().get(PLANNER_VALUE_SEQ_PATH);
    }

    getValidatorPath(): string {
        return vscode.workspace.getConfiguration(CONF_PDDL).get(VALIDATION_PATH);
    }

    askNewValidatorPath(): Promise<string> {
        return this.askAndUpdatePath(VALIDATION_PATH, "Validate tool");
    }

    getValStepPath(): Promise<string> {
        return this.getOrAskPath(VAL_STEP_PATH, "ValStep executable");
    }

    async getOrAskPath(configName: string, configFriendlyName: string): Promise<string> {
        let configurationSection = vscode.workspace.getConfiguration(CONF_PDDL);
        let configValue: string = configurationSection.get(configName);
        if (!configValue) {
            configValue = await this.askAndUpdatePath(configName, configFriendlyName);
        }

        return configValue;
    }

    async suggestUpdatingPath(configName: string, configFriendlyName: string): Promise<string> {
        let configureOption: vscode.MessageItem = { title: `Select ${configFriendlyName}...` };
        let notNowOption: vscode.MessageItem = { title: "Not now", isCloseAffordance: true };

        let choice = await vscode.window.showErrorMessage(
            `${configFriendlyName} is not configured.`,
            ...[configureOption, notNowOption]);

        let configValue: string = undefined;

        if (choice === configureOption) {
            configValue = await this.askAndUpdatePath(configName, configFriendlyName);
        }

        return configValue;
    }

    async askAndUpdatePath(configName: string, configFriendlyName: string): Promise<string> {
        let seletedUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false, canSelectMany: false,
            openLabel: `Select ${configFriendlyName}`
        });

        let configValue: string = undefined;

        if (seletedUris) {
            configValue = seletedUris[0].fsPath;
            let scopeToUpdate = await this.askConfigurationScope();
            if (!scopeToUpdate) return null;
            let configurationSection = vscode.workspace.getConfiguration(CONF_PDDL);
            configurationSection.update(configName, configValue, scopeToUpdate.target);
        }

        return configValue;
    }

    async askConfigurationScope(): Promise<ScopeQuickPickItem> {
        let availableScopes: ScopeQuickPickItem[] = [
            { label: 'This machine (default)', description: 'Selected tool will be used for all domain/problem files on this computer.', target: vscode.ConfigurationTarget.Global }
        ];

        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
                availableScopes.push({ label: 'This workspace', description: `Selected tool will be used just for this workspace: ${folder.name}`, target: vscode.ConfigurationTarget.Workspace, uri: folder.uri });
            });
        }
        // todo: need to support folders?
        //{ label: 'Just one workspace folder', description: 'Selected tool will be used just for one workspace folder...', target: vscode.ConfigurationTarget.WorkspaceFolder }

        let selectedScope = availableScopes.length == 1 ? availableScopes[0] : await vscode.window.showQuickPick(availableScopes,
            { placeHolder: 'Select the target scope for which this setting should be applied' });

        return selectedScope;
    }

    async moveConfiguration(configuration: vscode.WorkspaceConfiguration, legacyConfigName: string, configName: string) {
        let legacyConfig = configuration.inspect(legacyConfigName);

        let target: vscode.ConfigurationTarget;

        if (legacyConfig.workspaceFolderValue) target = vscode.ConfigurationTarget.WorkspaceFolder;
        else if (legacyConfig.workspaceValue) target = vscode.ConfigurationTarget.Workspace;
        else if (legacyConfig.globalValue) target = vscode.ConfigurationTarget.Global;
        else if (legacyConfig.defaultValue) {
            await configuration.update(configName, legacyConfig.defaultValue, vscode.ConfigurationTarget.Global);
        }
        if (target) {
            await configuration.update(configName, configuration.get(legacyConfigName), target);
            await configuration.update(legacyConfigName, null, target);
        }
    }

    getConfigurationForScope(scope: ScopeQuickPickItem): vscode.WorkspaceConfiguration {

        if (scope.target == vscode.ConfigurationTarget.WorkspaceFolder) {
            // let workspaceFolder = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Pick Workspace Folder to which this setting should be applied' })
            // if (workspaceFolder) {

            // 	// *Get the configuration for the workspace folder
            // 	const configuration = vscode.workspace.getConfiguration('', workspaceFolder.uri);
            vscode.window.showErrorMessage("Workspace folder not supported");
            return null;
        }
        else {
            return vscode.workspace.getConfiguration();
        }
    }

    getParserSettings(): PDDLParserSettings {
        let configurationAny: any = vscode.workspace.getConfiguration(PDDL_PARSER);
        let configuration = <PDDLParserSettings>configurationAny;

        return configuration;
    }
}

class ScopeQuickPickItem implements vscode.QuickPickItem {
    label: string;
    description: string;
    target: vscode.ConfigurationTarget;
    uri?: vscode.Uri;
}

class OptionsQuickPickItem implements vscode.QuickPickItem {
    label: string;
    description: string;
    options: string;
    newValue?: boolean;
}

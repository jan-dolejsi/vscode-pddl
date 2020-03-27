/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { PDDLParserSettings } from './Settings';

import { ensureAbsoluteGlobalStoragePath, isHttp } from './utils';
import { VAL_DOWNLOAD_COMMAND } from './validation/valCommand';
import { ExtensionInfo } from './ExtensionInfo';

export const EXECUTABLE_OR_SERVICE = 'executableOrService';
export const PDDL_PARSER = 'pddlParser';
export const PARSER_EXECUTABLE_OR_SERVICE = PDDL_PARSER + '.' + EXECUTABLE_OR_SERVICE;
const PARSER_EXECUTABLE_OPTIONS = PDDL_PARSER + '.executableOptions';
const PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN = PDDL_PARSER + '.serviceAuthenticationRefreshToken';
const PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN = PDDL_PARSER + '.serviceAuthenticationAccessToken';
const PARSER_SERVICE_AUTHENTICATION_S_TOKEN = PDDL_PARSER + '.serviceAuthenticationSToken';

export const PDDL_PLANNER = 'pddlPlanner';
export const PLANNER_EXECUTABLE_OR_SERVICE = PDDL_PLANNER + '.' + EXECUTABLE_OR_SERVICE;
const PLANNER_EXECUTABLE_OPTIONS = PDDL_PLANNER + '.executableOptions';
const PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN = PDDL_PLANNER + '.serviceAuthenticationRefreshToken';
const PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN = PDDL_PLANNER + '.serviceAuthenticationAccessToken';
const PLANNER_SERVICE_AUTHENTICATION_S_TOKEN = PDDL_PLANNER + '.serviceAuthenticationSToken';
const PLANNER_EPSILON_TIMESTEP = PDDL_PLANNER + '.epsilonTimeStep';
export const CONF_PDDL = 'pddl';
export const VALIDATION_PATH = 'validatorPath';
export const VAL_STEP_PATH = 'valStepPath';
export const VAL_VERBOSE = 'valVerbose';
export const VALUE_SEQ_PATH = 'valueSeqPath';
export const PLAN_REPORT_LINE_PLOT_GROUP_BY_LIFTED = 'planReport.linePlot.groupByLifted';
export const PLAN_REPORT_EXPORT_WIDTH = 'planReport.exportWidth';
export const PLAN_REPORT_WIDTH = 'planReport.width';
export const PLANNER_VAL_STEP_PATH = CONF_PDDL + "." + VAL_STEP_PATH;
export const PLANNER_VALUE_SEQ_PATH = CONF_PDDL + "." + VALUE_SEQ_PATH;
export const PDDL_CONFIGURE_COMMAND = CONF_PDDL + "." + "configure";
export const DEFAULT_EPSILON = 1e-3;

export class PddlConfiguration {

    constructor(private context: vscode.ExtensionContext) {
    }

    getEpsilonTimeStep(): number {
        return vscode.workspace.getConfiguration().get(PLANNER_EPSILON_TIMESTEP, DEFAULT_EPSILON);
    }

    getParserPath(): string | undefined {
        let configuredPath = vscode.workspace.getConfiguration().get<string>(PARSER_EXECUTABLE_OR_SERVICE);
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    NEVER_SETUP_PARSER = 'neverSetupParser';
    setupParserLater = false;

    async suggestNewParserConfiguration(showNever: boolean) {
        if (this.setupParserLater || this.context.globalState.get(this.NEVER_SETUP_PARSER)) { return; }

        let setupParserNow: vscode.MessageItem = { title: "Setup now..." };
        let downloadVal: vscode.MessageItem = { title: "Download VAL now..." };
        let setupParserNever: vscode.MessageItem = { title: "Never" };
        let setupParserLater: vscode.MessageItem = { title: "Later", isCloseAffordance: true };
        let options: vscode.MessageItem[] = [setupParserNow, downloadVal, setupParserLater];
        if (showNever) { options.splice(options.length, 0, setupParserNever); }
        let choice = await vscode.window.showInformationMessage(
            'Setup a [PDDL parser](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser "Read more about PDDL parsers") or download [VAL Tools](https://github.com/KCL-Planning/VAL) in order to enable detailed syntactic analysis.',
            ...options);

        switch (choice) {
            case setupParserNow:
                this.askNewParserPath();
                // if the above method call updates the configuration, the parser will be notified
                break;

            case downloadVal:
                vscode.commands.executeCommand(VAL_DOWNLOAD_COMMAND);
                break;

            case setupParserLater:
                this.setupParserLater = true;// will retry in the next session
                break;

            case setupParserNever:
                this.context.globalState.update(this.NEVER_SETUP_PARSER, true);
                break;

            default:
                break;
        }
    }

    async askNewParserPath(): Promise<string | undefined> {
        let existingValue = vscode.workspace.getConfiguration().get<string>(PARSER_EXECUTABLE_OR_SERVICE);

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

            if (!newParserScope) { return undefined; }

            let configurationToUpdate = this.getConfigurationForScope(newParserScope);
            if (!configurationToUpdate) { return undefined; }

            if (!isHttp(newParserPath)) {
                this.askParserOptions(newParserScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PARSER_EXECUTABLE_OR_SERVICE, newParserPath, newParserScope.target);
        }

        return newParserPath;
    }

    async askParserOptions(scope: ScopeQuickPickItem): Promise<string | undefined> {
        let existingValue = vscode.workspace.getConfiguration().get<string>(PARSER_EXECUTABLE_OPTIONS);

        let newParserOptions = await vscode.window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser].",
            placeHolder: `$(parser) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newParserOptions) {
            // todo: validate that this parser actually works by sending a dummy request to it

            let configurationToUpdate = this.getConfigurationForScope(scope);
            if (!configurationToUpdate) { return undefined; }

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
        };
    }

    async savePddlParserAuthenticationTokens(configuration: vscode.WorkspaceConfiguration, refreshtoken: string, accesstoken: string, stoken: string, target: vscode.ConfigurationTarget) {
        configuration.update(PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, refreshtoken, target);
        configuration.update(PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, accesstoken, target);
        configuration.update(PARSER_SERVICE_AUTHENTICATION_S_TOKEN, stoken, target);
    }

    isPddlPlannerServiceAuthenticationEnabled(): boolean{
        return vscode.workspace.getConfiguration().get<boolean>(PDDL_PLANNER + '.serviceAuthenticationEnabled', false);
    }

    getPddlPlannerServiceAuthenticationConfiguration(): PlannerServiceAuthenticationConfiguration {
        let configuration = vscode.workspace.getConfiguration();
        return {
            url: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationUrl', ''),
            requestEncoded: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationRequestEncoded', ''),
            clientId: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationClientId', ''),
            callbackPort: configuration.get<number>(PDDL_PLANNER + '.serviceAuthenticationCallbackPort', 0),
            timeoutInMs: configuration.get<number>(PDDL_PLANNER + '.serviceAuthenticationTimeoutInMs', 0),
            tokensvcUrl: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcUrl', ""),
            tokensvcApiKey: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcApiKey', ""),
            tokensvcAccessPath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcAccessPath', ""),
            tokensvcValidatePath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcValidatePath', ""),
            tokensvcCodePath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcCodePath', ""),
            tokensvcRefreshPath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcRefreshPath', ""),
            tokensvcSvctkPath: configuration.get<string>(PDDL_PLANNER + '.serviceAuthenticationTokensvcSvctkPath', ""),
            refreshToken: configuration.get<string>(PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, ""),
            accessToken: configuration.get<string>(PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, ""),
            sToken: configuration.get<string>(PLANNER_SERVICE_AUTHENTICATION_S_TOKEN, ""),
        };
    }

    async savePddlPlannerAuthenticationTokens(configuration: vscode.WorkspaceConfiguration, refreshtoken: string, accesstoken: string, stoken: string, target: vscode.ConfigurationTarget) {
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, refreshtoken, target);
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, accesstoken, target);
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_S_TOKEN, stoken, target);
    }

    async getPlannerPath(workingFolder?: vscode.Uri): Promise<string | undefined> {
        let plannerPath = vscode.workspace.getConfiguration(PDDL_PLANNER, workingFolder).get<string>(EXECUTABLE_OR_SERVICE);

        if (!plannerPath) {
            plannerPath = await this.askNewPlannerPath();
        }

        return plannerPath; // this may be 'undefined', if the user canceled
    }

    async askNewPlannerPath(): Promise<string | undefined> {
        let existingValue = vscode.workspace.getConfiguration(PDDL_PLANNER, null).get<string>(EXECUTABLE_OR_SERVICE);

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

            if (!newPlannerScope) { return undefined; }
            let configurationToUpdate = this.getConfigurationForScope(newPlannerScope);
            if (!configurationToUpdate) { return undefined; }

            if (!isHttp(newPlannerPath)) {
                this.askPlannerSyntax(newPlannerScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PLANNER_EXECUTABLE_OR_SERVICE, newPlannerPath, newPlannerScope.target);
        }

        return newPlannerPath;
    }

    async askPlannerSyntax(scope: ScopeQuickPickItem): Promise<string | undefined> {
        let existingValue = vscode.workspace.getConfiguration().get<string>(PLANNER_EXECUTABLE_OPTIONS);

        let newPlannerOptions = await vscode.window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner].",
            placeHolder: `$(planner) $(options) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newPlannerOptions) {
            // todo: validate that this planner actually works by sending a dummy request to it

            let configurationToUpdate = this.getConfigurationForScope(scope);
            if (!configurationToUpdate) { return undefined; }

            // Update the value in the target
            configurationToUpdate.update(PLANNER_EXECUTABLE_OPTIONS, newPlannerOptions, scope.target);
        }

        return newPlannerOptions;
    }

    getPlannerSyntax(): string | undefined {
        return vscode.workspace.getConfiguration().get<string>(PLANNER_EXECUTABLE_OPTIONS);
    }

    getValueSeqPath(): string | undefined {
        let configuredPath = vscode.workspace.getConfiguration().get<string>(PLANNER_VALUE_SEQ_PATH);
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    getValidatorPath(): string | undefined {
        let configuredPath = vscode.workspace.getConfiguration(CONF_PDDL).get<string>(VALIDATION_PATH);
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    async askNewValidatorPath(): Promise<string | undefined> {
        let configuredPath = await this.askAndUpdatePath(VALIDATION_PATH, "Validate tool");
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    async getValStepPath(): Promise<string | undefined> {
        let configuredPath = await this.getOrAskPath(VAL_STEP_PATH, "ValStep executable");
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    async getOrAskPath(configName: string, configFriendlyName: string): Promise<string | undefined> {
        let configurationSection = vscode.workspace.getConfiguration(CONF_PDDL);
        let configValue = configurationSection.get<string>(configName);
        if (!configValue) {
            configValue = await this.askAndUpdatePath(configName, configFriendlyName);
        }

        return configValue;
    }

    getValStepVerbose(): boolean {
        return vscode.workspace.getConfiguration(CONF_PDDL).get<boolean>(VAL_VERBOSE);
    }

    async suggestUpdatingPath(configName: string, configFriendlyName: string): Promise<string | undefined> {
        let configureOption: vscode.MessageItem = { title: `Select ${configFriendlyName}...` };
        let notNowOption: vscode.MessageItem = { title: "Not now", isCloseAffordance: true };

        let choice = await vscode.window.showErrorMessage(
            `${configFriendlyName} is not configured.`,
            ...[configureOption, notNowOption]);

        let configValue: string | undefined;

        if (choice === configureOption) {
            configValue = await this.askAndUpdatePath(configName, configFriendlyName);
        }

        return configValue;
    }

    async askAndUpdatePath(configName: string, configFriendlyName: string): Promise<string | undefined> {
        let selectedUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false, canSelectMany: false,
            openLabel: `Select ${configFriendlyName}`
        });

        let configValue: string | undefined;

        if (selectedUris) {
            configValue = selectedUris[0].fsPath;
            let scopeToUpdate = await this.askConfigurationScope();
            if (!scopeToUpdate) { return undefined; }
            let configurationSection = vscode.workspace.getConfiguration(CONF_PDDL);
            configurationSection.update(configName, configValue, scopeToUpdate.target);
        }

        return configValue;
    }

    async askConfigurationScope(): Promise<ScopeQuickPickItem | undefined> {
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

        let selectedScope = availableScopes.length === 1 ? availableScopes[0] : await vscode.window.showQuickPick(availableScopes,
            { placeHolder: 'Select the target scope for which this setting should be applied' });

        return selectedScope;
    }

    async moveConfiguration<T>(configuration: vscode.WorkspaceConfiguration, legacyConfigName: string, configName: string): Promise<void> {
        let legacyConfig = configuration.inspect<T>(legacyConfigName);
        if (!legacyConfig) { return; }

        let target: vscode.ConfigurationTarget | undefined;

        if (legacyConfig.workspaceFolderValue) {
            target = vscode.ConfigurationTarget.WorkspaceFolder;
        } else if (legacyConfig.workspaceValue) {
            target = vscode.ConfigurationTarget.Workspace;
        } else if (legacyConfig.globalValue) {
            target = vscode.ConfigurationTarget.Global;
        } else if (legacyConfig.defaultValue) {
            await configuration.update(configName, legacyConfig.defaultValue, vscode.ConfigurationTarget.Global);
        }
        if (target) {
            await configuration.update(configName, configuration.get<T>(legacyConfigName), target);
            await configuration.update(legacyConfigName, null, target);
        }
    }

    getConfigurationForScope(scope: ScopeQuickPickItem): vscode.WorkspaceConfiguration | undefined {

        if (scope.target === vscode.ConfigurationTarget.WorkspaceFolder) {
            // let workspaceFolder = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Pick Workspace Folder to which this setting should be applied' })
            // if (workspaceFolder) {

            // 	// *Get the configuration for the workspace folder
            // 	const configuration = vscode.workspace.getConfiguration('', workspaceFolder.uri);
            vscode.window.showErrorMessage("Workspace folder not supported");
            return undefined;
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

    async askConfiguration(configName: string): Promise<void> {
        let thisExtension = vscode.extensions.getExtension(ExtensionInfo.EXTENSION_ID);
        if (thisExtension === undefined) { return; } // something odd!
        let configurationElement = thisExtension.packageJSON["contributes"]["configuration"]["properties"][configName];

        if (!configurationElement) {
            throw new Error("Configuration not found: " + configName);
        }

        if (["number", "integer"].includes(configurationElement["type"])) {
            return this.askNumberConfiguration(configName, configurationElement);
        }
        else if (configurationElement["enum"] !== undefined) {
            return this.askEnumConfiguration(configName, configurationElement);
        }
    }

    private async askEnumConfiguration(configName: string, configurationElement: any): Promise<void> {
        let items: vscode.QuickPickItem[] = [];
        const enumNames = configurationElement["enum"];
        const enumDescriptions = configurationElement["enumDescriptions"];

        let currentValue = vscode.workspace.getConfiguration().get<string>(configName, <string>configurationElement["default"]);

        for (let index = 0; index < enumNames.length; index++) {
            const itemLabel = enumNames[index];
            const description = enumDescriptions && index < enumDescriptions.length ?
                enumDescriptions[index] : undefined;

            items.push({
                label: itemLabel,
                description: description,
                picked: itemLabel === currentValue
            });
        }

        let itemSelected = await vscode.window.showQuickPick(items, {
            placeHolder: configurationElement["description"] + ` (current value: ${currentValue})`
        });

        if (itemSelected === undefined) { return; }

        await vscode.workspace.getConfiguration().update(configName, itemSelected.label);
    }

    private async askNumberConfiguration(configName: string, configurationElement: any): Promise<void> {
        let currentValue = vscode.workspace.getConfiguration().get<number>(configName, <number>configurationElement["default"]);

        let hint: string | undefined;
        let parser: (enteredValue: string) => number;

        const valueType = configurationElement["type"];
        switch (valueType) {
            case "integer":
                hint = "Value must be a decimal integer.";
                parser = enteredValueAsString => Number.parseInt(enteredValueAsString);
                break;
            default:
                hint = "Value must be a number.";
                parser = enteredValueAsString => Number.parseFloat(enteredValueAsString);
                break;
        }

        let minimum = configurationElement["minimum"];
        let maximum = configurationElement["maximum"];

        let enteredValueAsString = await vscode.window.showInputBox({
            prompt: configurationElement["description"],
            value: currentValue.toString(),
            validateInput: (enteredValueAsString: string) => {
                let enteredValue = parser.apply(this, [enteredValueAsString]); 

                if (Number.isNaN(enteredValue)) { return hint; }

                if (minimum !== undefined && minimum > enteredValue) {
                    return `Minimum: ${minimum}`;
                } 

                if (maximum !== undefined && maximum < enteredValue) {
                    return `Maximum: ${maximum}`;
                } 

                return null;
            },
            placeHolder: "Value"
        });

        if (enteredValueAsString === undefined) { return; }

        await vscode.workspace.getConfiguration().update(configName, parser(enteredValueAsString));
    }
}

interface ScopeQuickPickItem extends vscode.QuickPickItem {
    label: string;
    description: string;
    target: vscode.ConfigurationTarget;
    uri?: vscode.Uri;
}

interface PlannerServiceAuthenticationConfiguration {
    url: string;
    requestEncoded: string;
    clientId: string;
    callbackPort: number;
    timeoutInMs: number;
    tokensvcUrl: string;
    tokensvcApiKey: string;
    tokensvcAccessPath: string;
    tokensvcValidatePath: string;
    tokensvcCodePath: string;
    tokensvcRefreshPath: string;
    tokensvcSvctkPath: string;
    refreshToken: string;
    accessToken: string;
    sToken: string;
}
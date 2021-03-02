/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
    Uri, ExtensionContext, workspace, MessageItem, window, commands, WorkspaceConfiguration, ConfigurationTarget, QuickPickItem, extensions, WorkspaceFolder
} from 'vscode';
import { PDDLParserSettings } from '../util/Settings';

import { ensureAbsoluteGlobalStoragePath, isHttp } from '../utils';
import { VAL_DOWNLOAD_COMMAND } from '../validation/valCommand';
import { ExtensionInfo } from './ExtensionInfo';

export const EXECUTABLE_OR_SERVICE = 'executableOrService';
export const PDDL_PARSER = 'pddlParser';
export const PARSER_EXECUTABLE_OR_SERVICE = PDDL_PARSER + '.' + EXECUTABLE_OR_SERVICE;
export const EXECUTABLE_OPTIONS = 'executableOptions';
const PARSER_EXECUTABLE_OPTIONS = PDDL_PARSER + '.' + EXECUTABLE_OPTIONS;
const PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN = PDDL_PARSER + '.serviceAuthenticationRefreshToken';
const PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN = PDDL_PARSER + '.serviceAuthenticationAccessToken';
const PARSER_SERVICE_AUTHENTICATION_S_TOKEN = PDDL_PARSER + '.serviceAuthenticationSToken';

export const PDDL_PLANNER = 'pddlPlanner';
export const PLANNER_EXECUTABLE_OR_SERVICE = PDDL_PLANNER + '.' + EXECUTABLE_OR_SERVICE;
const PLANNER_EXECUTABLE_OPTIONS = PDDL_PLANNER + '.' + EXECUTABLE_OPTIONS;
const PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN = PDDL_PLANNER + '.serviceAuthenticationRefreshToken';
const PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN = PDDL_PLANNER + '.serviceAuthenticationAccessToken';
const PLANNER_SERVICE_AUTHENTICATION_S_TOKEN = PDDL_PLANNER + '.serviceAuthenticationSToken';
const PLANNER_EPSILON_TIMESTEP = PDDL_PLANNER + '.epsilonTimeStep';
export const CONF_PDDL = 'pddl';
export const VALIDATOR_VERSION = 'validatorVersion';
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
const EDITOR_FORMAT_ON_TYPE = "editor.formatOnType";

export class PddlConfiguration {

    constructor(private context: ExtensionContext) {
    }

    async updateEffectiveConfiguration<T>(section: string, key: string, value: T, workspaceFolder?: WorkspaceFolder): Promise<void> {
        const configuration = workspace.getConfiguration(section, workspaceFolder);
        const inspect = configuration.inspect(key);

        if (!inspect) {
            throw new Error(`Unexpected configuration: ${section}.${key}`);
        }

        if (inspect.workspaceFolderValue !== undefined) {
            await configuration.update(key, value, ConfigurationTarget.WorkspaceFolder);
        }
        else if (inspect.workspaceValue !== undefined) {
            await configuration.update(key, value, ConfigurationTarget.Workspace);
        }
        else {
            await configuration.update(key, value, ConfigurationTarget.Global);
        }
    }

    getEpsilonTimeStep(): number {
        return workspace.getConfiguration().get(PLANNER_EPSILON_TIMESTEP, DEFAULT_EPSILON);
    }

    getEditorFormatOnType(): boolean {
        return workspace.getConfiguration('', { languageId: CONF_PDDL }).get<boolean>(EDITOR_FORMAT_ON_TYPE, false);
    }

    setEditorFormatOnType(newValue: boolean, options: { forPddlOnly: boolean }): void {
        if (options.forPddlOnly) {
            workspace.getConfiguration(undefined, { languageId: CONF_PDDL }).update(EDITOR_FORMAT_ON_TYPE, newValue, true, true);
        } else {
            workspace.getConfiguration().update(EDITOR_FORMAT_ON_TYPE, newValue, true);
        }
    }

    getParserPath(workspaceFolder?: WorkspaceFolder): string | undefined {
        const configuredPath = workspace.getConfiguration(PDDL_PARSER, workspaceFolder).get<string>(EXECUTABLE_OR_SERVICE);
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    NEVER_SETUP_PARSER = 'neverSetupParser';
    setupParserLater = false;

    async suggestNewParserConfiguration(showNever: boolean): Promise<void> {
        if (this.setupParserLater || this.context.globalState.get(this.NEVER_SETUP_PARSER)) { return; }

        const setupParserNow: MessageItem = { title: "Setup manually..." };
        const downloadVal: MessageItem = { title: "Download VAL now..." };
        const setupParserNever: MessageItem = { title: "Never" };
        const setupParserLater: MessageItem = { title: "Later", isCloseAffordance: true };
        const options: MessageItem[] = [downloadVal, setupParserNow, setupParserLater];
        if (showNever) { options.splice(options.length, 0, setupParserNever); }
        const choice = await window.showInformationMessage(
            'Setup a [PDDL parser](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser "Read more about PDDL parsers") or download [VAL Tools](https://github.com/KCL-Planning/VAL) in order to enable detailed syntactic analysis.',
            ...options);

        switch (choice) {
            case setupParserNow:
                this.askNewParserPath();
                // if the above method call updates the configuration, the parser will be notified
                break;

            case downloadVal:
                commands.executeCommand(VAL_DOWNLOAD_COMMAND);
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
        const existingValue = workspace.getConfiguration().get<string>(PARSER_EXECUTABLE_OR_SERVICE);

        let newParserPath = await window.showInputBox({
            prompt: "Enter PDDL parser/validator path local command or web service URL",
            placeHolder: `parser.exe OR java -jar c:\\planner.jar OR https://someserver/parse`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newParserPath) {
            newParserPath = newParserPath.trim().replace(/\\/g, '/');

            // todo: validate that this parser actually works by sending a dummy request to it

            const newParserScope = await this.askConfigurationScope();

            if (!newParserScope) { return undefined; }

            const configurationToUpdate = this.getConfigurationForScope(newParserScope);
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
        const existingValue = workspace.getConfiguration().get<string>(PARSER_EXECUTABLE_OPTIONS);

        const newParserOptions = await window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser].",
            placeHolder: `$(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newParserOptions) {
            // todo: validate that this parser actually works by sending a dummy request to it

            const configurationToUpdate = this.getConfigurationForScope(scope);
            if (!configurationToUpdate) { return undefined; }

            // Update the value in the target
            configurationToUpdate.update(PARSER_EXECUTABLE_OPTIONS, newParserOptions, scope.target);
        }

        return newParserOptions;
    }

    isPddlParserServiceAuthenticationEnabled(): boolean {
        return workspace.getConfiguration().get<boolean>(PDDL_PARSER + '.serviceAuthenticationEnabled', false);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPddlParserServiceAuthenticationConfiguration(): any {
        const configuration = workspace.getConfiguration();
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

    async savePddlParserAuthenticationTokens(configuration: WorkspaceConfiguration, refreshtoken: string, accesstoken: string, stoken: string, target: ConfigurationTarget): Promise<void> {
        configuration.update(PARSER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, refreshtoken, target);
        configuration.update(PARSER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, accesstoken, target);
        configuration.update(PARSER_SERVICE_AUTHENTICATION_S_TOKEN, stoken, target);
    }

    isPddlPlannerServiceAuthenticationEnabled(): boolean {
        return workspace.getConfiguration().get<boolean>(PDDL_PLANNER + '.serviceAuthenticationEnabled', false);
    }

    getPddlPlannerServiceAuthenticationConfiguration(): PlannerServiceAuthenticationConfiguration {
        const configuration = workspace.getConfiguration();
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

    async savePddlPlannerAuthenticationTokens(configuration: WorkspaceConfiguration, refreshtoken: string, accesstoken: string, stoken: string, target: ConfigurationTarget): Promise<void> {
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_REFRESH_TOKEN, refreshtoken, target);
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_ACCESS_TOKEN, accesstoken, target);
        configuration.update(PLANNER_SERVICE_AUTHENTICATION_S_TOKEN, stoken, target);
    }

    /**
     * @deprecated
     */
    async getPlannerPath(workingFolder?: Uri): Promise<string | undefined> {
        let plannerPath = workspace.getConfiguration(PDDL_PLANNER, workingFolder).get<string>(EXECUTABLE_OR_SERVICE);

        if (!plannerPath) {
            plannerPath = await this.askNewPlannerPath();
        }

        return plannerPath; // this may be 'undefined', if the user canceled
    }

    /**
     * @deprecated
     */
    async askNewPlannerPath(): Promise<string | undefined> {
        const existingValue = workspace.getConfiguration(PDDL_PLANNER, null).get<string>(EXECUTABLE_OR_SERVICE);

        let newPlannerPath = await window.showInputBox({
            prompt: "Enter PDDL planner path local command or web service URL",
            placeHolder: `planner.exe OR java -jar c:\\planner.jar OR http://solver.planning.domains/solve`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newPlannerPath) {

            newPlannerPath = newPlannerPath.trim().replace(/\\/g, '/');

            // todo: validate that this planner actually works by sending a dummy request to it

            const newPlannerScope = await this.askConfigurationScope();

            if (!newPlannerScope) { return undefined; }
            const configurationToUpdate = this.getConfigurationForScope(newPlannerScope);
            if (!configurationToUpdate) { return undefined; }

            if (!isHttp(newPlannerPath)) {
                this.askPlannerSyntax(newPlannerScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PLANNER_EXECUTABLE_OR_SERVICE, newPlannerPath, newPlannerScope.target);
        }

        return newPlannerPath;
    }

    /**
     * @deprecated
     */
    async askPlannerSyntax(scope: ScopeQuickPickItem): Promise<string | undefined> {
        const existingValue = workspace.getConfiguration().get<string>(PLANNER_EXECUTABLE_OPTIONS);

        const newPlannerOptions = await window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner].",
            placeHolder: `$(planner) $(options) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newPlannerOptions) {
            // todo: validate that this planner actually works by sending a dummy request to it

            const configurationToUpdate = this.getConfigurationForScope(scope);
            if (!configurationToUpdate) { return undefined; }

            // Update the value in the target
            configurationToUpdate.update(PLANNER_EXECUTABLE_OPTIONS, newPlannerOptions, scope.target);
        }

        return newPlannerOptions;
    }

    /**
     * @deprecated
     */
    getPlannerSyntax(): string | undefined {
        return workspace.getConfiguration().get<string>(PLANNER_EXECUTABLE_OPTIONS);
    }

    getValueSeqPath(): string | undefined {
        const configuredPath = workspace.getConfiguration().get<string>(PLANNER_VALUE_SEQ_PATH);
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    getValidatorPath(workspaceFolder?: WorkspaceFolder): string | undefined {
        const configuredPath = workspace.getConfiguration(CONF_PDDL, workspaceFolder).get<string>(VALIDATION_PATH);
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    async askNewValidatorPath(): Promise<string | undefined> {
        const configuredPath = await this.askAndUpdatePath(VALIDATION_PATH, "Validate tool");
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    async getValStepPath(): Promise<string | undefined> {
        const configuredPath = await this.getOrAskPath(VAL_STEP_PATH, "ValStep executable");
        return ensureAbsoluteGlobalStoragePath(configuredPath, this.context);
    }

    async getOrAskPath(configName: string, configFriendlyName: string): Promise<string | undefined> {
        const configurationSection = workspace.getConfiguration(CONF_PDDL);
        let configValue = configurationSection.get<string>(configName);
        if (!configValue) {
            configValue = await this.askAndUpdatePath(configName, configFriendlyName);
        }

        return configValue;
    }

    getValStepVerbose(): boolean {
        return workspace.getConfiguration(CONF_PDDL).get<boolean>(VAL_VERBOSE, false);
    }

    async suggestUpdatingPath(configName: string, configFriendlyName: string): Promise<string | undefined> {
        const configureOption: MessageItem = { title: `Select ${configFriendlyName}...` };
        const notNowOption: MessageItem = { title: "Not now", isCloseAffordance: true };

        const choice = await window.showErrorMessage(
            `${configFriendlyName} is not configured.`,
            ...[configureOption, notNowOption]);

        let configValue: string | undefined;

        if (choice === configureOption) {
            configValue = await this.askAndUpdatePath(configName, configFriendlyName);
        }

        return configValue;
    }

    async askAndUpdatePath(configName: string, configFriendlyName: string): Promise<string | undefined> {
        const selectedUris = await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false, canSelectMany: false,
            openLabel: `Select ${configFriendlyName}`
        });

        let configValue: string | undefined;

        if (selectedUris) {
            configValue = selectedUris[0].fsPath;
            const scopeToUpdate = await this.askConfigurationScope();
            if (!scopeToUpdate) { return undefined; }
            const configurationSection = workspace.getConfiguration(CONF_PDDL);
            configurationSection.update(configName, configValue, scopeToUpdate.target);
        }

        return configValue;
    }

    async askConfigurationScope(): Promise<ScopeQuickPickItem | undefined> {
        const availableScopes: ScopeQuickPickItem[] = [
            { label: 'This machine (default)', description: 'Selected tool will be used for all domain/problem files on this computer.', target: ConfigurationTarget.Global }
        ];

        if (workspace.workspaceFolders) {
            workspace.workspaceFolders.forEach(folder => {
                availableScopes.push({ label: 'This workspace', description: `Selected tool will be used just for this workspace: ${folder.name}`, target: ConfigurationTarget.Workspace, uri: folder.uri });
            });
        }
        // todo: need to support folders?
        //{ label: 'Just one workspace folder', description: 'Selected tool will be used just for one workspace folder...', target: ConfigurationTarget.WorkspaceFolder }

        const selectedScope = availableScopes.length === 1 ? availableScopes[0] : await window.showQuickPick(availableScopes,
            { placeHolder: 'Select the target scope for which this setting should be applied' });

        return selectedScope;
    }

    async moveConfiguration<T>(configuration: WorkspaceConfiguration, legacyConfigName: string, configName: string): Promise<void> {
        const legacyConfig = configuration.inspect<T>(legacyConfigName);
        if (!legacyConfig) { return; }

        let target: ConfigurationTarget | undefined;

        if (legacyConfig.workspaceFolderValue) {
            target = ConfigurationTarget.WorkspaceFolder;
        } else if (legacyConfig.workspaceValue) {
            target = ConfigurationTarget.Workspace;
        } else if (legacyConfig.globalValue) {
            target = ConfigurationTarget.Global;
        } else if (legacyConfig.defaultValue) {
            await configuration.update(configName, legacyConfig.defaultValue, ConfigurationTarget.Global);
        }
        if (target) {
            await configuration.update(configName, configuration.get<T>(legacyConfigName), target);
            await configuration.update(legacyConfigName, null, target);
        }
    }

    getConfigurationForScope(scope: ScopeQuickPickItem): WorkspaceConfiguration | undefined {

        if (scope.target === ConfigurationTarget.WorkspaceFolder) {
            // let workspaceFolder = await window.showWorkspaceFolderPick({ placeHolder: 'Pick Workspace Folder to which this setting should be applied' })
            // if (workspaceFolder) {

            // 	// *Get the configuration for the workspace folder
            // 	const configuration = workspace.getConfiguration('', workspaceFolder.uri);
            window.showErrorMessage("Workspace folder not supported");
            return undefined;
        }
        else {
            return workspace.getConfiguration();
        }
    }

    getParserSettings(): PDDLParserSettings {
        const configurationAny = workspace.getConfiguration(PDDL_PARSER);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const configuration = (configurationAny as any) as PDDLParserSettings;

        return configuration;
    }

    async askConfiguration(configName: string): Promise<void> {
        const thisExtension = extensions.getExtension(ExtensionInfo.EXTENSION_ID);
        if (thisExtension === undefined) { return; } // something odd!
        const configurationElement = thisExtension.packageJSON["contributes"]["configuration"]["properties"][configName];

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async askEnumConfiguration(configName: string, configurationElement: any): Promise<void> {
        const items: QuickPickItem[] = [];
        const enumNames = configurationElement["enum"];
        const enumDescriptions = configurationElement["enumDescriptions"];

        const currentValue = workspace.getConfiguration().get<string>(configName, configurationElement["default"] as string);

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

        const itemSelected = await window.showQuickPick(items, {
            placeHolder: configurationElement["description"] + ` (current value: ${currentValue})`
        });

        if (itemSelected === undefined) { return; }

        const configurationTarget = this.getEffectiveConfigurationTarget(configName);

        await workspace.getConfiguration().update(configName, itemSelected.label, configurationTarget);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async askNumberConfiguration(configName: string, configurationElement: any): Promise<void> {
        const currentValue = workspace.getConfiguration().get<number>(configName, configurationElement["default"] as number);

        let hint: string | undefined;
        let parser: (enteredValue: string) => number;

        const valueType = configurationElement["type"];
        switch (valueType) {
            case "integer":
                hint = "Value must be a decimal integer.";
                parser = function (enteredValueAsString: string): number { return Number.parseInt(enteredValueAsString); };
                break;
            default:
                hint = "Value must be a number.";
                parser = function (enteredValueAsString: string): number { return Number.parseFloat(enteredValueAsString); };
                break;
        }

        const minimum = configurationElement["minimum"];
        const maximum = configurationElement["maximum"];

        const enteredValueAsString = await window.showInputBox({
            prompt: configurationElement["description"],
            value: currentValue.toString(),
            validateInput: (enteredValueAsString: string) => {
                const enteredValue = parser.apply(this, [enteredValueAsString]);

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

        const configurationTarget = this.getEffectiveConfigurationTarget(configName);

        await workspace.getConfiguration().update(configName, parser(enteredValueAsString), configurationTarget);
    }

    /**
     * Determines the configuration scope, where the `configName` was configured in the active workspace.
     * @param configName configuration item e.g. scope.name
     */
    getEffectiveConfigurationTarget(configName: string): ConfigurationTarget {
        const conf = workspace.getConfiguration().inspect(configName);

        if (conf?.workspaceFolderValue) {
            return ConfigurationTarget.WorkspaceFolder;
        } else if (conf?.workspaceValue) {
            return ConfigurationTarget.Workspace;
        } else {
            return ConfigurationTarget.Global;
        } 
    }
}

interface ScopeQuickPickItem extends QuickPickItem {
    label: string;
    description: string;
    target: ConfigurationTarget;
    uri?: Uri;
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

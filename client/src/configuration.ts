/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';

const PARSER_LOCATION = 'pddlParser.executableOrService';
const PARSER_SYNTAX = 'pddlParser.executableOptions';
const PARSER_LEGACY_LOCATION = 'pddlParser.pddlParserService';
const PLANNER_LOCATION = 'pddlPlanner.executableOrService';
const PLANNER_SYNTAX = 'pddlPlanner.executableOptions';
const PLANNER_EPSILON = 'pddlPlanner.epsilonTimeStep';

export class PddlConfiguration {

    constructor(public context: vscode.ExtensionContext) {

    }

    getEpsilonTimeStep(): number {
        return vscode.workspace.getConfiguration().get(PLANNER_EPSILON);
    }

    async getParserPath(): Promise<string> {
        let parserPath: string = vscode.workspace.getConfiguration().get(PARSER_LOCATION);

        if (!parserPath) {
            parserPath = await this.askNewParserPath();
        }

        return parserPath; // this may be 'undefined'
    }

    NEVER_SETUP_PARSER = 'neverSetupParser';
    setupParserLater = false;

    async suggestNewParserConfiguration(showNever: boolean) {
        if (await this.copyFromLegacyParserConfig()) return;

        if (this.setupParserLater || this.context.globalState.get(this.NEVER_SETUP_PARSER)) return;

        let moreInfo: vscode.MessageItem = { title: "More info..." };
        let setupParserNow: vscode.MessageItem = { title: "Setup now..." };
        let setupParserNever: vscode.MessageItem = { title: "Never" };
        let setupParserLater: vscode.MessageItem = { title: "Later", isCloseAffordance: true };
        let options: vscode.MessageItem[] = [moreInfo, setupParserNow, setupParserLater];
        if (showNever) options.splice(2, 0, setupParserNever);
        let choice = await vscode.window.showInformationMessage(
            "Setup a PDDL parser in order to enable detailed syntactic analysis.",
            ...options);

        switch (choice) {
            case moreInfo:
                vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser'));
                this.suggestNewParserConfiguration(showNever);
                break;

            case setupParserNow:
                this.askNewParserPath();
                // if the above method call updates the configuration, the language server will be notified
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

            await this.moveConfiguration(configuration, PARSER_LEGACY_LOCATION, PARSER_LOCATION);
            return legacyParserUrl;
        }
        else {
            return null;
        }
    }

    async askNewParserPath() {
        let existingValue: string = vscode.workspace.getConfiguration().get(PARSER_LOCATION);

        let newParserPath = await vscode.window.showInputBox({
            prompt: "Enter PDDL parser/validator path local command or web service URL",
            placeHolder: `parser.exe OR java -jar c:\\planner.jar OR https://someserver/parse`,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (newParserPath) {
            // todo: validate that this parser actually works by sending a dummy request to it

            let newParserScope = await this.askConfigurationScope();

            if (!newParserScope) return null;

            let configurationToUpdate = this.getConfigurationForScope(newParserScope);

            if (!PddlConfiguration.isHttp(newParserPath)) {
                this.askParserOptions(newParserScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PARSER_LOCATION, newParserPath, newParserScope.target);
        }

        return newParserPath;
    }

    async askParserOptions(scope: ScopeQuickPickItem) {
        let existingValue: string = vscode.workspace.getConfiguration().get(PARSER_SYNTAX);

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
            configurationToUpdate.update(PARSER_SYNTAX, newParserOptions, scope.target);
        }

        return newParserOptions;
    }

    static isHttp(path: string) {
        return path.match(/^http[s]?:/i);
    }

    async getPlannerPath(): Promise<string> {
        let plannerPath: string = vscode.workspace.getConfiguration().get(PLANNER_LOCATION);

        if (!plannerPath) {
            plannerPath = await this.askNewPlannerPath();
        }

        return plannerPath; // this may be 'undefined'
    }

    async askNewPlannerPath() {
        let existingValue: string = vscode.workspace.getConfiguration().get(PLANNER_LOCATION);
        
        let newPlannerPath = await vscode.window.showInputBox({ 
            prompt: "Enter PDDL planner path local command or web service URL", 
            placeHolder: `planner.exe OR java -jar c:\\planner.jar OR http://solver.planning.domains/solve`,
            value: existingValue,
            ignoreFocusOut: true 
        });

        if (newPlannerPath) {
            // todo: validate that this planner actually works by sending a dummy request to it

            let newPlannerScope = await this.askConfigurationScope();

            if (!newPlannerScope) return null;
            let configurationToUpdate = this.getConfigurationForScope(newPlannerScope);

            if (!PddlConfiguration.isHttp(newPlannerPath)) {
                this.askPlannerSyntax(newPlannerScope);
            }

            // Update the value in the target
            configurationToUpdate.update(PLANNER_LOCATION, newPlannerPath, newPlannerScope.target);
        }

        return newPlannerPath;
    }

    async askPlannerSyntax(scope: ScopeQuickPickItem) {
        let existingValue: string = vscode.workspace.getConfiguration().get(PLANNER_SYNTAX);

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
            configurationToUpdate.update(PLANNER_SYNTAX, newPlannerOptions, scope.target);
        }

        return newPlannerOptions;
    }

    optionsHistory: OptionsQuickPickItem[] = [{ label: 'No options.', options: '', description: '' }, { label: 'Specify options...', newValue: true, options: '', description: '' }];

    async getPlannerOptions() {
        let optionsSelected = await vscode.window.showQuickPick(this.optionsHistory,
            { placeHolder: 'Optionally specify planner switches or press ENTER to use default planner configuration.' });

        if (!optionsSelected) return null;
        else if (optionsSelected.newValue) {
            let optionsEntered = await vscode.window.showInputBox({ placeHolder: 'Specify planner options.' });
            if (!optionsEntered) return null;
            optionsSelected = { label: optionsEntered, options: optionsEntered, description: '' };
        }

        let indexOf = this.optionsHistory.findIndex(option => option.options == optionsSelected.options);
        if (indexOf > -1) {
            this.optionsHistory.splice(indexOf, 1);
        }
        this.optionsHistory.unshift(optionsSelected); // insert to the first position
        return optionsSelected.options;
    }

    getPlannerSyntax(): string {
        return vscode.workspace.getConfiguration().get(PLANNER_SYNTAX);
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

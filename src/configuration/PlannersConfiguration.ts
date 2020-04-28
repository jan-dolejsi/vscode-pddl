/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as os from 'os';
import * as path from 'path';
import { parseTree, findNodeAtLocation } from 'jsonc-parser';
import { window, commands, workspace, ConfigurationTarget, QuickPickItem, ExtensionContext, StatusBarItem, StatusBarAlignment, Uri, Range, WorkspaceFolder, TextDocument, ViewColumn } from 'vscode';
import { PddlWorkspace, planner } from 'pddl-workspace';
import { CommandPlannerProvider, SolveServicePlannerProvider, RequestServicePlannerProvider, ExecutablePlannerProvider } from './plannerConfigurations';
import { CONF_PDDL, PDDL_PLANNER, EXECUTABLE_OR_SERVICE, EXECUTABLE_OPTIONS } from './configuration';
import { instrumentOperationAsVsCodeCommand } from 'vscode-extension-telemetry-wrapper';
import { showError, jsonNodeToRange, fileExists, isHttp } from '../utils';

export const CONF_PLANNERS = "planners";
export const CONF_SELECTED_PLANNER = "selectedPlanner";
export const PDDL_SELECT_PLANNER = CONF_PDDL + '.' + 'selectPlanner';
const PDDL_CONFIGURE_PLANNER = CONF_PDDL + '.' + 'configurePlanner';
const PDDL_DELETE_PLANNER = CONF_PDDL + '.' + 'deletePlanner';
const PDDL_JSON_SETTINGS = CONF_PDDL + '.' + 'plannersJsonSettings';

export enum PlannerConfigurationScope {
    Default = 0,
    Extension = 1,
    User = 2,
    Workspace = 3,
    WorkspaceFolder = 4,
}

export class PlannersConfiguration {

    plannerSelector: StatusBarItem;

    constructor(context: ExtensionContext, private pddlWorkspace: PddlWorkspace) {
        context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.addPlanner", () => this.createPlannerConfiguration().catch(showError)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_SELECT_PLANNER, () => this.selectPlanner()));

        if (workspace.getConfiguration(CONF_PDDL).get('showPlannerInStatusBar', true)) {
            this.plannerSelector = window.createStatusBarItem(StatusBarAlignment.Left, 10);
            this.plannerSelector.command = PDDL_SELECT_PLANNER;
            context.subscriptions.push(this.plannerSelector);
            setTimeout(() => this.refreshPlanSelector(), 3000); // delayed initialization
        }

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_PLANNER,
            (plannerConfiguration: ScopedPlannerConfiguration) => {
                if (!plannerConfiguration) {
                    plannerConfiguration = this.getSelectedPlanner();
                }

                if (!plannerConfiguration) {
                    showError(new Error('No planner selected.'));
                    return;
                }

                this.configureAndSavePlanner(plannerConfiguration).catch(showError);
            }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(CONF_PDDL + '.showPlannerConfiguration',
            (plannerConfiguration: ScopedPlannerConfiguration) => {
                if (plannerConfiguration) {
                    this.openPlannerSettingsInJson(plannerConfiguration);
                }
            }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_DELETE_PLANNER, async (plannerConfiguration: ScopedPlannerConfiguration) => {
            if (!plannerConfiguration) {
                plannerConfiguration = this.getSelectedPlanner();
            }

            if (!plannerConfiguration) {
                showError(new Error('No planner selected.'));
                return;
            }

            const yes = 'Yes';
            const answer = await window.showWarningMessage(`Delete configuration '${plannerConfiguration.configuration.title}'?`, { modal: true }, yes, 'No');
            if (answer === yes) {
                this.deletePlanner(plannerConfiguration).catch(showError);
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_JSON_SETTINGS, () => {
            this.openSettingsInJson();
        }));

        // migrate legacy configuration in all workspaces
        (workspace.workspaceFolders ?? [undefined]).forEach(wf =>
            this.migrateLegacyConfiguration(wf).catch(showError)
        );
    }

    async configureAndSavePlanner(plannerConfiguration: ScopedPlannerConfiguration): Promise<ScopedPlannerConfiguration | undefined> {
        if (!plannerConfiguration.configuration.canConfigure) {
            throw new Error(`Planner configuration ${plannerConfiguration.configuration.title} is not configurable.`);
        }

        const plannerProvider = this.pddlWorkspace.getPlannerRegistrar()
            .getPlannerProvider({ kind: plannerConfiguration.configuration.kind });

        if (!plannerProvider) {
            new Error(`Planner provider for '${plannerConfiguration.configuration.kind}' is not currently available. Are you missing an extension?`);
        }

        const newPlannerConfiguration = await plannerProvider
            .configurePlanner(plannerConfiguration.configuration);

        if (!newPlannerConfiguration) {
            return undefined;
        }

        const workspaceFolder = this.toWorkspaceFolder(plannerConfiguration);

        return await this.savePlannerConfiguration(plannerConfiguration.index, plannerConfiguration.scope, newPlannerConfiguration, workspaceFolder);
    }

    async migrateLegacyConfiguration(workspaceFolder?: WorkspaceFolder): Promise<void> {
        const config = workspace.getConfiguration(PDDL_PLANNER, workspaceFolder);
        const legacyPlannerInspect = config.inspect<string>(EXECUTABLE_OR_SERVICE);
        const legacySyntaxInspect = config.inspect<string>(EXECUTABLE_OPTIONS);

        if (legacyPlannerInspect.globalValue) {
            await this.migrateLegacyConfigurationInTarget(legacyPlannerInspect.globalValue,
                legacySyntaxInspect.globalValue, PlannerConfigurationScope.User);
        }

        if (legacyPlannerInspect.workspaceValue) {
            await this.migrateLegacyConfigurationInTarget(legacyPlannerInspect.workspaceValue,
                legacySyntaxInspect.workspaceValue, PlannerConfigurationScope.Workspace);
        }

        if (legacyPlannerInspect.workspaceFolderValue) {
            await this.migrateLegacyConfigurationInTarget(legacyPlannerInspect.workspaceFolderValue,
                legacySyntaxInspect.workspaceFolderValue, PlannerConfigurationScope.WorkspaceFolder, workspaceFolder);
        }
    }

    async migrateLegacyConfigurationInTarget(legacyPlanner: string, legacySyntax: string | undefined, scope: PlannerConfigurationScope, workspaceFolder?: WorkspaceFolder): Promise<void> {
        const config = workspace.getConfiguration(PDDL_PLANNER, workspaceFolder);
        const migratedPlanner = isHttp(legacyPlanner)
            ? legacyPlanner.endsWith('/solve')
                ? new SolveServicePlannerProvider().createPlannerConfiguration(legacyPlanner)
                : new RequestServicePlannerProvider().createPlannerConfiguration(legacyPlanner)
            : new CommandPlannerProvider().createPlannerConfiguration(legacyPlanner, legacySyntax);

        const target = this.toConfigurationTarget(scope);

        const newPlannerConfig = await this.addPlannerConfiguration(scope, migratedPlanner, workspaceFolder);
        await config.update(EXECUTABLE_OR_SERVICE, undefined, target);
        await config.update(EXECUTABLE_OPTIONS, undefined, target);

        console.log(`Migrated ${legacyPlanner} to ${newPlannerConfig.scope.toString()}:${newPlannerConfig.configuration.title}`);
    }

    refreshPlanSelector(): void {
        if (!this.plannerSelector) { return; }
        const selectedPlanner = this.getSelectedPlanner();
        const activePlannerTitle = selectedPlanner?.configuration.title ?? '$(warning)';
        this.plannerSelector.text = `$(circuit-board) ${activePlannerTitle}`;
        this.plannerSelector.tooltip = selectedPlanner?.configuration.path ?? selectedPlanner?.configuration.url ?? 'Click here to select a planning engine.';
        this.plannerSelector.color = !selectedPlanner ? "yellow" : undefined;
        this.plannerSelector.show();
    }

    registerBuiltInPlannerProviders(): void {
        [
            new ExecutablePlannerProvider(),
            new CommandPlannerProvider(),
            new SolveServicePlannerProvider(),
            new RequestServicePlannerProvider()
            // new JavaPlannerProvider(),
        ].forEach(provider =>
            this.pddlWorkspace.getPlannerRegistrar().registerPlannerProvider(provider.kind, provider));
    }

    async selectPlanner(): Promise<ScopedPlannerConfiguration | undefined> {
        const planners = this.getPlanners();

        const items = planners.map(plannerConfig => new PlannerQuickPickItem(plannerConfig));
        items.push(PlannerQuickPickItem.CREATE_NEW);

        const selectedItem = await window.showQuickPick(items, { placeHolder: 'Select planner ...' });

        if (!selectedItem) {
            return undefined;
        }

        if (selectedItem === PlannerQuickPickItem.CREATE_NEW) {
            commands.executeCommand("pddl.addPlanner");
            return undefined;
        } else {
            await this.setSelectedPlanner(selectedItem.planner);
            return selectedItem.planner;
        }
    }

    /**
     * Sets selected planner (and clears all lower-level selections).
     * @param selectedPlanner selected planner
     * @param workspaceFolder workspace folder context of the possible previous workspaceFolder-level selection (which shall now be removed)
     */
    async setSelectedPlanner(selectedPlanner: ScopedPlannerConfiguration, previousWorkspaceFolder?: WorkspaceFolder): Promise<void> {
        const workspaceFolder = previousWorkspaceFolder ?? this.toWorkspaceFolder(selectedPlanner);
        const pddlConfig = workspace.getConfiguration(CONF_PDDL, workspaceFolder);

        // first, clear the lower-level selections to make the selection on the `selectedPlanner.scope` effective
        switch (selectedPlanner.scope) {
            case PlannerConfigurationScope.Default:
            case PlannerConfigurationScope.User:
            case PlannerConfigurationScope.Extension:
                // clear workspace-level selection (if any)
                await pddlConfig.update(CONF_SELECTED_PLANNER, undefined, this.toConfigurationTarget(PlannerConfigurationScope.Workspace));
            case PlannerConfigurationScope.Workspace:
                // clear workspaceFolder-level selection (if any)
                if (workspaceFolder) {
                    await pddlConfig.update(CONF_SELECTED_PLANNER, undefined, this.toConfigurationTarget(PlannerConfigurationScope.WorkspaceFolder));
                }
        }

        await pddlConfig
            .update(CONF_SELECTED_PLANNER, selectedPlanner.configuration.title, this.toConfigurationTarget(selectedPlanner.scope) ?? ConfigurationTarget.Global);
    }

    toWorkspaceFolder(selectedPlanner: ScopedPlannerConfiguration): WorkspaceFolder | undefined {
        return selectedPlanner.workspaceFolder && workspace.getWorkspaceFolder(Uri.parse(selectedPlanner.workspaceFolder));
    }

    getPlannersPerScope(scope: PlannerConfigurationScope, workingFolder?: WorkspaceFolder): planner.PlannerConfiguration[] {
        const plannersConf = workspace.getConfiguration(CONF_PDDL, workingFolder)
            .inspect<planner.PlannerConfiguration[]>(CONF_PLANNERS);

        switch (scope) {
            case PlannerConfigurationScope.Default:
                return plannersConf.defaultValue ?? [];
            case PlannerConfigurationScope.User:
                return plannersConf.globalValue ?? [];
            case PlannerConfigurationScope.Workspace:
                return plannersConf.workspaceValue ?? [];
            case PlannerConfigurationScope.WorkspaceFolder:
                return plannersConf.workspaceFolderValue ?? [];
            default:
                console.warn(`Unexpected scope in getPlannersPerScope(): ${scope}`);
                return undefined;
        }
    }

    getPlanners(workingFolder?: WorkspaceFolder): ScopedPlannerConfiguration[] {
        const plannersConf = workspace.getConfiguration(CONF_PDDL, workingFolder)
            .inspect<planner.PlannerConfiguration[]>(CONF_PLANNERS);

        const scopedConfigs = [
            plannersConf.workspaceFolderValue?.map((conf, index) => this.toScopedConfiguration(conf, index, PlannerConfigurationScope.WorkspaceFolder, workingFolder)) ?? [],
            plannersConf.workspaceValue?.map((conf, index) => this.toScopedConfiguration(conf, index, PlannerConfigurationScope.Workspace)) ?? [],
            plannersConf.globalValue?.map((conf, index) => this.toScopedConfiguration(conf, index, PlannerConfigurationScope.User)) ?? [],
            plannersConf.defaultValue?.map((conf, index) => this.toScopedConfiguration(conf, index, PlannerConfigurationScope.Default)) ?? []
        ];

        // flatten the structure, but ignore the workspace-level configurations that repeat the workspaceFolder-level configs
        const allConfigs = scopedConfigs.reduce((cumPlanners, scopePlanners) => {
            const stringifiedCumPlanners = cumPlanners.map(spc => JSON.stringify(spc.configuration));
            const unique = scopePlanners.filter(spc => !stringifiedCumPlanners.includes(JSON.stringify(spc.configuration)));
            return cumPlanners.concat(unique);
        }, []);

        return [...new Set(allConfigs).values()];
    }

    toScopedConfiguration(config: planner.PlannerConfiguration, index: number, scope: PlannerConfigurationScope, workspaceFolder?: WorkspaceFolder): ScopedPlannerConfiguration {
        if (scope === PlannerConfigurationScope.WorkspaceFolder) {
            if (!workspaceFolder) {
                throw new Error('WorkspaceFolder-scoped planner configurations must specify originating workspaceFolder');
            }
        }
        else {
            // omit the workspace folder, when it is not needed
            workspaceFolder = undefined;
        }

        return {
            configuration: config,
            scope: scope,
            index: index,
            workspaceFolder: workspaceFolder?.uri.toString()
        };
    }

    async deletePlanner(plannerConfiguration: ScopedPlannerConfiguration): Promise<void> {
        const workspaceFolder = this.toWorkspaceFolder(plannerConfiguration);
        const remainingPlannerConfigs = this.getPlannersPerScope(plannerConfiguration.scope, workspaceFolder);
        remainingPlannerConfigs.splice(plannerConfiguration.index, 1);

        await this.savePlanners(plannerConfiguration.scope, remainingPlannerConfigs, workspaceFolder);
    }

    async savePlannerConfiguration(index: number, scope: PlannerConfigurationScope, newPlannerConfiguration: planner.PlannerConfiguration, workspaceFolder?: WorkspaceFolder): Promise<ScopedPlannerConfiguration> {
        const scopePlanners = this.getPlannersPerScope(scope, workspaceFolder);
        scopePlanners.splice(index, 1, newPlannerConfiguration);
        await this.savePlanners(scope, scopePlanners, workspaceFolder);

        return this.toScopedConfiguration(newPlannerConfiguration, index, scope, workspaceFolder);
    }

    /**
     * Overwrite planners in given `scope`.
     * @param scope configuration scope
     * @param scopePlanners planners to set for this scope
     * @param workspaceFolder workspace folder - must be provider if `scope` is set to WorkspaceFolder
     */
    private async savePlanners(scope: PlannerConfigurationScope, scopePlanners: planner.PlannerConfiguration[], workspaceFolder?: WorkspaceFolder): Promise<void> {
        const target = this.toConfigurationTarget(scope);

        if (scopePlanners.length === 0) {
            scopePlanners = undefined; // remove the setting key altogether to keep settings.json tidy
        }

        const configuration = workspace.getConfiguration(CONF_PDDL, workspaceFolder);

        await configuration
            .update(CONF_PLANNERS, scopePlanners, target);
    }

    private toConfigurationTarget(scope: PlannerConfigurationScope): ConfigurationTarget | undefined {
        switch (scope) {
            case PlannerConfigurationScope.User:
                return ConfigurationTarget.Global;
            case PlannerConfigurationScope.Workspace:
                return ConfigurationTarget.Workspace;
            case PlannerConfigurationScope.WorkspaceFolder:
                return ConfigurationTarget.WorkspaceFolder;
            default:
                return undefined;
        }
    }

    static readonly SCOPES = [
        PlannerConfigurationScope.WorkspaceFolder,
        PlannerConfigurationScope.Workspace,
        PlannerConfigurationScope.User,
        PlannerConfigurationScope.Default,
    ];

    getSelectedPlanner(workingFolder?: WorkspaceFolder): ScopedPlannerConfiguration {
        const selectedPlannerTitle = workspace.getConfiguration(CONF_PDDL, workingFolder).get<string>(CONF_SELECTED_PLANNER);

        if (selectedPlannerTitle) {
            for (const scope of PlannersConfiguration.SCOPES) {
                const planners = this.getPlannersPerScope(scope, workingFolder);
                if (!Array.isArray(planners)) { console.error(`Planners for scope ${scope} is invalid: ${planners}`); continue; }
                const indexFound = planners.findIndex(p => p.title === selectedPlannerTitle);
                if (indexFound > -1) {
                    return this.toScopedConfiguration(planners[indexFound], indexFound, scope, workingFolder);
                }
            }
        }

        return undefined;
    }

    async getOrAskSelectedPlanner(workingFolder?: WorkspaceFolder): Promise<ScopedPlannerConfiguration | undefined> {
        let selectedPlanner = this.getSelectedPlanner(workingFolder);

        if (!selectedPlanner) {
            selectedPlanner = await this.selectPlanner();

            if (selectedPlanner) {
                await this.setSelectedPlanner(selectedPlanner);
            }
        }

        return selectedPlanner;
    }

    async createPlannerConfiguration(): Promise<ScopedPlannerConfiguration | undefined> {

        const allSpecs = this.pddlWorkspace.getPlannerRegistrar().getPlannerProviders()
            .map(provider => new PlannerSpecPickItem(provider));

        const selectedItem = await window.showQuickPick(allSpecs, { placeHolder: 'Select type of planner ...' });

        if (!selectedItem) {
            return undefined;
        }

        const newConfiguration = await selectedItem.provider.configurePlanner();

        if (!newConfiguration) { // canceled by user
            return undefined;
        }

        // we only support adding planner configurations to the Global/User scope
        return await this.addPlannerConfiguration(PlannerConfigurationScope.User, newConfiguration);
    }

    /**
     * Adds a new planner configuration to the `scope` and sets it as a default.
     * @param scope scope
     * @param newPlannerConfig new planner configuration
     * @param workspaceFolder workspace folder - must be provider if `scope` is set to WorkspaceFolder
     */
    async addPlannerConfiguration(scope: PlannerConfigurationScope, newPlannerConfig: planner.PlannerConfiguration, workspaceFolder?: WorkspaceFolder): Promise<ScopedPlannerConfiguration> {
        const allPlannerNames = this.getPlanners(workspaceFolder)
            .map(spc => this.getUnNumberedTitle(spc));

        if (allPlannerNames.includes(newPlannerConfig.title)) {
            const similarPlannerCount = allPlannerNames
                .filter(name => name === newPlannerConfig.title)
                .length;

            newPlannerConfig.title += ` #${similarPlannerCount + 1}`;
        }

        const plannersInScope = this.getPlannersPerScope(scope);

        await this.savePlanners(scope, plannersInScope.concat([newPlannerConfig]), workspaceFolder);

        const scopedConfiguration = this.toScopedConfiguration(
            newPlannerConfig, plannersInScope.length, scope, workspaceFolder);

        await this.setSelectedPlanner(scopedConfiguration);

        return scopedConfiguration;
    }

    private getUnNumberedTitle(config: ScopedPlannerConfiguration): string {
        const title = config.configuration.title;
        if (title.includes('#')) {
            const match = /(.+)(#\w+)/.exec(title);
            if (match) {
                return match[1].trim();
            }
        }
        return title;
    }

    async openSettingsInJson(): Promise<void> {
        const settings = [
            this.createSettingForScope(PlannerConfigurationScope.User),
            this.createSettingForScope(PlannerConfigurationScope.Workspace),
        ].concat(workspace.workspaceFolders?.map(wf => this.toFolderConfigurationUri(wf)) ?? []);

        const documentsAndRanges = await Promise.all(settings.map(s => this.toDocumentAndRange(s)));

        const validDocumentsAndRanges = documentsAndRanges
            .filter(setting => !!setting);

        validDocumentsAndRanges.forEach(async (docAndRange, index) => {
            window.showTextDocument(docAndRange.settingsDoc, { selection: docAndRange.range, viewColumn: index + 1 });
        });
    }

    async openPlannerSettingsInJson(plannerConfiguration: ScopedPlannerConfiguration): Promise<void> {
        const workspaceFolder: WorkspaceFolder | undefined = plannerConfiguration.workspaceFolder && workspace.getWorkspaceFolder(Uri.parse(plannerConfiguration.workspaceFolder));
        const setting = this.createSettingForScope(plannerConfiguration.scope, workspaceFolder);

        const documentAndRange = await this.toDocumentAndRange(setting, plannerConfiguration.index);

        await window.showTextDocument(documentAndRange.settingsDoc, { selection: documentAndRange.range, viewColumn: ViewColumn.Beside });
    }

    private createSettingForScope(scope: PlannerConfigurationScope, workspaceFolder?: WorkspaceFolder): { fileUri: Uri; settingRootPath: string[] } | undefined {
        switch (scope) {
            case PlannerConfigurationScope.User:
                return { fileUri: Uri.file(this.getUserSettings()), settingRootPath: [] };
            case PlannerConfigurationScope.Workspace:
                return { fileUri: workspace.workspaceFile, settingRootPath: ["settings"] };
            case PlannerConfigurationScope.WorkspaceFolder:
                return this.toFolderConfigurationUri(workspaceFolder);
            default:
                return undefined;
        }
    }

    toFolderConfigurationUri(wf: WorkspaceFolder): { fileUri: Uri; settingRootPath: string[] } {
        const workspaceFolderSettingsPath = path.join(wf.uri.fsPath, '.vscode', 'settings.json');
        return {
            fileUri: Uri.file(workspaceFolderSettingsPath),
            settingRootPath: []
        };
    }

    async toDocumentAndRange(setting: { fileUri: Uri | undefined; settingRootPath: (string | number)[] }, index?: number): Promise<{ settingsDoc: TextDocument; range: Range } | undefined> {
        if (!setting.fileUri) { return undefined; }
        const exists = await fileExists(setting.fileUri);
        if (!exists) { return undefined; }
        const settingsText = await workspace.fs.readFile(setting.fileUri);
        const settingsRoot = parseTree(settingsText.toString());

        let path = setting.settingRootPath.concat([CONF_PDDL + '.' + CONF_PLANNERS]);
        if (index !== undefined) {
            path = path.concat([index]);
        }
        const plannersNode = findNodeAtLocation(settingsRoot, path);
        if (!plannersNode) { return undefined; }

        const settingsDoc = await workspace.openTextDocument(setting.fileUri);
        const range: Range = plannersNode && jsonNodeToRange(settingsDoc, plannersNode);

        return { settingsDoc, range };
    }

    getUserSettings(): string {
        // https://supunkavinda.blog/vscode-editing-settings-json
        const windows = "%APPDATA%\\Code\\User\\settings.json";
        const macOS = "$HOME/Library/Application Support/Code/User/settings.json";
        const linux = "$HOME/.config/Code/User/settings.json";

        switch (os.platform()) {
            case 'darwin':
                return macOS;
            case 'win32':
                return windows.replace(/%([^%]+)%/g, (_, n) => process.env[n]);
            default:
                // 'freebsd'
                // 'linux'
                // 'openbsd'
                // 'sunos'
                // 'cygwin';
                return linux;
        }
    }
}

class PlannerQuickPickItem implements QuickPickItem {
    label: string;
    description?: string;
    detail?: string;
    picked?: boolean;
    alwaysShow?: boolean;
    planner: ScopedPlannerConfiguration;

    constructor(plannerConfig: ScopedPlannerConfiguration | undefined) {
        this.planner = plannerConfig;
        this.alwaysShow = plannerConfig === undefined;
        this.label = plannerConfig?.configuration.title ?? "$(add) Create new planner configuration";
    }

    static readonly CREATE_NEW = new PlannerQuickPickItem(undefined);
}

class PlannerSpecPickItem implements QuickPickItem {
    provider: planner.PlannerProvider;
    constructor(plannerSpec: planner.PlannerProvider) {
        this.provider = plannerSpec;
    }

    get label(): string {
        return this.provider.getNewPlannerLabel();
    }
}

export interface ScopedPlannerConfiguration {
    /** Configuration as extracted from the settings. */
    configuration: planner.PlannerConfiguration;
    /** user | machine | workspaceFolder | workspace | extension */
    scope: PlannerConfigurationScope;
    /** Order of this planner configuration within the scope. */
    index: number;
    /** Originating workspace folder Uri#toString(). Required when scope==PlannerConfigurationScope.WorkspaceFolder */
    workspaceFolder?: string;
}

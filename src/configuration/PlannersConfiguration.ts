/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as os from 'os';
import * as path from 'path';
import { parseTree, findNodeAtLocation } from 'jsonc-parser';
import { window, commands, workspace, ConfigurationTarget, QuickPickItem, ExtensionContext, StatusBarItem, StatusBarAlignment, Uri, Range, WorkspaceFolder, TextDocument } from 'vscode';
import { PddlWorkspace, planner } from 'pddl-workspace';
import { CommandPlannerProvider, SolveServicePlannerProvider } from './plannerConfigurations';
import { CONF_PDDL } from './configuration';
import { instrumentOperationAsVsCodeCommand } from 'vscode-extension-telemetry-wrapper';
import { showError, jsonNodeToRange, fileExists } from '../utils';

const PLANNERS = "planners";
export const PDDL_SELECT_PLANNER = CONF_PDDL + '.' + 'selectPlanner';
const PDDL_CONFIGURE_PLANNER = CONF_PDDL + '.' + 'configurePlanner';
const PDDL_DELETE_PLANNER = CONF_PDDL + '.' + 'deletePlanner';
const PDDL_JSON_SETTINGS = CONF_PDDL + '.' + 'plannersJsonSettings';

export class PlannersConfiguration {

    plannerSelector: StatusBarItem;

    constructor(context: ExtensionContext, private pddlWorkspace: PddlWorkspace) {
        context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.addPlanner", () => this.addPlannerConfiguration().catch(showError)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_SELECT_PLANNER, () => this.selectPlanner()));

        this.plannerSelector = window.createStatusBarItem(StatusBarAlignment.Left, 10);
        this.plannerSelector.command = PDDL_SELECT_PLANNER;
        context.subscriptions.push(this.plannerSelector);
        setTimeout(() => this.refreshPlanSelector(), 3000); // delayed initialization


        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_PLANNER,
            (plannerConfiguration: planner.PlannerConfiguration, index: number) => {
                if (!plannerConfiguration || index === undefined || index < 0) {
                    [plannerConfiguration, index] = this.getSelectedPlanner();
                }

                if (!plannerConfiguration) {
                    showError(new Error('No planner selected.'));
                    return;
                }

                if (index < 0) {
                    showError(new Error(`Selected planner not found?!`));
                }

                this.pddlWorkspace.getPlannerRegistrar()
                    .getPlannerProvider({ kind: plannerConfiguration.kind })
                    .configurePlanner(plannerConfiguration)
                    .then(newPlannerConfiguration => {
                        this.savePlannerConfiguration(index, newPlannerConfiguration)
                            .catch(showError);
                    }, showError);
            }));


        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_DELETE_PLANNER, async (plannerConfiguration: planner.PlannerConfiguration, index: number) => {
            if (!plannerConfiguration || index < 0) {
                [plannerConfiguration, index] = this.getSelectedPlanner();
            }

            if (!plannerConfiguration) {
                showError(new Error('No planner selected.'));
                return;
            }

            const yes = 'Yes';
            const answer = await window.showWarningMessage(`Delete configuration ${plannerConfiguration.title}?`, { modal: true }, yes, 'No');
            if (answer === yes) {
                this.deletePlanner(plannerConfiguration).catch(showError);
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_JSON_SETTINGS, () => {
            this.openSettingsInJson();
        }));
    }

    refreshPlanSelector(): void {
        const [selectedPlanner] = this.getSelectedPlanner();
        const activePlannerTitle = selectedPlanner?.title ?? '$(warning)';
        this.plannerSelector.text = `$(circuit-board) ${activePlannerTitle}`;
        this.plannerSelector.tooltip = selectedPlanner?.path ?? selectedPlanner?.url ?? 'Click here to select a planning engine.';
        this.plannerSelector.color = !selectedPlanner ? "yellow" : undefined;
        this.plannerSelector.show();
    }

    registerBuiltInPlannerProviders(): void {
        [
            // new ExecutablePlannerProvider(),
            new CommandPlannerProvider(),
            new SolveServicePlannerProvider()
            // new JavaPlannerProvider(),
        ].forEach(provider =>
            this.pddlWorkspace.getPlannerRegistrar().registerPlannerProvider(provider.kind, provider));
    }

    async selectPlanner(): Promise<planner.PlannerConfiguration | undefined> {
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

    async setSelectedPlanner(selectedPlanner: planner.PlannerConfiguration, allPlanners?: planner.PlannerConfiguration[]): Promise<void> {
        const updatedPlanners = (allPlanners ?? this.getPlanners())
            .map(p => {
                p.isSelected = p.title === selectedPlanner.title;
                return p;
            });

        // todo: save this setting to the Machine target, when available
        await workspace.getConfiguration(CONF_PDDL).update(PLANNERS, updatedPlanners, ConfigurationTarget.Global);
    }

    getPlanners(workingFolder?: Uri): planner.PlannerConfiguration[] {
        return workspace.getConfiguration(CONF_PDDL, workingFolder)
            .get<planner.PlannerConfiguration[]>(PLANNERS)
            .map(p => {
                p.canConfigure = p.canConfigure ?? true;
                return p;
            });
    }

    async deletePlanner(plannerConfiguration: planner.PlannerConfiguration): Promise<void> {
        const remainingPlannerConfigs = this.getPlanners()
            .filter(planner => this.equals(planner, plannerConfiguration));

        // todo: save this setting to the Machine target, when available
        await workspace.getConfiguration(CONF_PDDL)
            .update(PLANNERS, remainingPlannerConfigs, ConfigurationTarget.Global);
    }

    private equals(planner: planner.PlannerConfiguration, plannerConfiguration: planner.PlannerConfiguration): unknown {
        return planner.title !== plannerConfiguration.title
            && (planner.url ?? planner.path) !== (plannerConfiguration.url ?? plannerConfiguration.path);
    }

    async savePlannerConfiguration(index: number, newPlannerConfiguration: planner.PlannerConfiguration): Promise<void> {
        const newPlanners = this.getPlanners();
        newPlanners.splice(index, 1, newPlannerConfiguration);

        // todo: save this setting to the Machine target, when available
        await workspace.getConfiguration(CONF_PDDL)
            .update(PLANNERS, newPlanners, ConfigurationTarget.Global);
    }

    getSelectedPlanner(workingFolder?: Uri): [planner.PlannerConfiguration | undefined, number] {
        const planners = this.getPlanners(workingFolder);
        const selectedIndex = planners
            .findIndex(p => p.isSelected);

        let selectedPlanner: planner.PlannerConfiguration | undefined;

        if (selectedIndex > -1) {
            selectedPlanner = planners[selectedIndex];
        }

        return [selectedPlanner, selectedIndex];
    }

    async getOrAskSelectedPlanner(workingFolder?: Uri): Promise<planner.PlannerConfiguration | undefined> {
        let [selectedPlanner] = this.getSelectedPlanner(workingFolder);

        if (!selectedPlanner) {
            selectedPlanner = await this.selectPlanner();

            if (selectedPlanner) {
                await this.setSelectedPlanner(selectedPlanner, this.getPlanners());
            }
        }

        return selectedPlanner;
    }

    async addPlannerConfiguration(): Promise<planner.PlannerConfiguration | undefined> {

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

        // todo: store configuration in different scopes
        await this.setSelectedPlanner(newConfiguration, this.getPlanners().concat([newConfiguration]));

        // switch (selectedItem) {
        //     case executable:
        //     default:
        //         window.showErrorMessage(`Not supported yet: ${selectedItem.label}`);
        //         return undefined;
        // }

        return newConfiguration;
    }

    async openSettingsInJson(): Promise<void> {
        const settings = [
            { fileUri: Uri.file(this.getUserSettings()), settingRootPath: [] },
            { fileUri: workspace.workspaceFile, settingRootPath: ["settings"] },
        ].concat(workspace.workspaceFolders?.map(wf => this.toFolderConfigurationUri(wf)) ?? []);

        const documentsAndRanges = await Promise.all(settings.map(s => this.toDocumentAndRange(s)));

        const validDocumentsAndRanges = documentsAndRanges
            .filter(setting => !!setting);

        validDocumentsAndRanges.forEach(async (docAndRange, index) => {
            window.showTextDocument(docAndRange.settingsDoc, { selection: docAndRange.range, viewColumn: index + 1 });
        });
    }

    toFolderConfigurationUri(wf: WorkspaceFolder): { fileUri: Uri; settingRootPath: string[] } {
        const workspaceFolderSettingsPath = path.join(wf.uri.fsPath, '.vscode', 'settings.json');
        return {
            fileUri: Uri.file(workspaceFolderSettingsPath),
            settingRootPath: []
        };
    }

    async toDocumentAndRange(setting: { fileUri: Uri | undefined; settingRootPath: string[] }): Promise<{ settingsDoc: TextDocument; range: Range } | undefined> {
        if (!setting.fileUri) { return undefined; }
        const exists = await fileExists(setting.fileUri);
        if (!exists) { return undefined; }
        const settingsText = await workspace.fs.readFile(setting.fileUri);
        const settingsRoot = parseTree(settingsText.toString());
        const plannersNode = findNodeAtLocation(settingsRoot, setting.settingRootPath.concat([CONF_PDDL + '.' + PLANNERS]));
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
    planner: planner.PlannerConfiguration;

    constructor(plannerConfig: planner.PlannerConfiguration | undefined) {
        this.planner = plannerConfig;
        this.label = plannerConfig?.title ?? "$(add) Create new planner configuration";
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

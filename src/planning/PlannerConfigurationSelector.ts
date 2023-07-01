/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { window, Uri, QuickPickItem, workspace, SaveDialogOptions } from 'vscode';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { AsyncServiceOnlyConfiguration, PlannerAsyncService } from 'pddl-planning-service-client';
import { exportToAndShow } from '../util/editorUtil';
import { utils } from 'pddl-workspace';

/** Async planner interface configuration. */
export class PlannerConfigurationSelector {

    public static readonly DEFAULT = Uri.parse("configuration:/default");

    constructor(private problemPath: Uri) {
    }

    async getConfiguration(): Promise<Uri | null> {
        const selectedItem = await window.showQuickPick<PlannerConfigurationItem>([useDefaultsItem, selectedConfigurationItem, createConfigurationItem], { placeHolder: 'Select planner configuration from a .json file...' });
        if (!selectedItem) { return null; }

        switch (selectedItem) {
            case useDefaultsItem:
                return PlannerConfigurationSelector.DEFAULT;
            case selectedConfigurationItem:
                return await this.selectConfigurationFile();
            case createConfigurationItem:
                await this.createConfigurationFile();
                return null;
            default:
                if (selectedConfigurationItem instanceof PlannerConfigurationUriItem) {
                    return selectedConfigurationItem.uri;
                }
                else {
                    throw new Error("Unexpected selected item type: " + typeof (selectedConfigurationItem));
                }
        }
    }

    async selectConfigurationFile(): Promise<Uri | null> {
        const selectedUris = await window.showOpenDialog({
            canSelectMany: false, filters: {
                'Planner Configuration JSON': ['json']
            },
            defaultUri: this.problemPath
        });

        if (!selectedUris) { return null; }

        return selectedUris[0];
    }

    static async loadConfiguration(configurationUri: Uri, timeout: number): Promise<AsyncServiceOnlyConfiguration> {
        if (configurationUri.toString() === PlannerConfigurationSelector.DEFAULT.toString()) {
            return PlannerAsyncService.createDefaultConfiguration(timeout);
        }
        else {
            const configurationDoc = await workspace.openTextDocument(configurationUri);
            const configurationString = configurationDoc.getText();
            return jsonc.parse(configurationString, [], { allowTrailingComma: true });
        }
    }

    async createConfigurationFile(): Promise<void> {
        let uri = Uri.joinPath(this.problemPath, ".plannerConfiguration.json");
        while (await utils.afs.exists(uri.fsPath)) {
            const overwrite = "Overwrite";
            const selectDifferentFileName = "Select a different file name...";
            const shouldOverwrite = await window.showQuickPick([overwrite, selectDifferentFileName], {placeHolder: 'Configuration file already exists...'});
            if (shouldOverwrite === overwrite) {
                break;
            } else if (!shouldOverwrite) {
                return; // canceled
            } else if (shouldOverwrite === selectDifferentFileName) {
                const options: SaveDialogOptions = {
                    saveLabel: "Create",
                    filters: {
                        "JSON": ["json"]
                    },
                    defaultUri: uri
                };
                const selectedUri = await window.showSaveDialog(options);
                if (selectedUri) {
                    uri = selectedUri;
                
                } else {
                    return; // canceled
                }
            }
        }
        await exportToAndShow("{\n\t\n}", uri);
    }
}

class PlannerConfigurationItem implements QuickPickItem {

    constructor(public readonly label: string, public readonly description?: string) {
    }
}

class PlannerConfigurationUriItem extends PlannerConfigurationItem {

    constructor(public readonly uri: Uri) {
        super(path.basename(uri.fsPath), path.dirname(uri.fsPath));
    }
}


const useDefaultsItem = new PlannerConfigurationItem("Use defaults");
const selectedConfigurationItem = new PlannerConfigurationItem("Select a configuration file...");
const createConfigurationItem = new PlannerConfigurationItem("Create a blank configuration file...", "This creates a blank file, you populate it and launch the planner again.");

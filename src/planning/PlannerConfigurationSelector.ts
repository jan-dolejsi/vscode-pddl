/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { window, Uri, QuickPickItem, workspace } from 'vscode';
import * as path from 'path';
import { AsyncServiceOnlyConfiguration, PlannerAsyncService } from 'pddl-planning-service-client';

export class PlannerConfigurationSelector {

    public static readonly DEFAULT = Uri.parse("configuration:/default");

    constructor(private problemPath: Uri) {
    }

    async getConfiguration(): Promise<Uri | null> {
        const selectedItem = await window.showQuickPick<PlannerConfigurationItem>([useDefaultsItem, selectedConfigurationItem], { placeHolder: 'Select planner configuration from a .json file...' });
        if (!selectedItem) { return null; }

        switch (selectedItem) {
            case useDefaultsItem:
                return PlannerConfigurationSelector.DEFAULT;
            case selectedConfigurationItem:
                return await this.selectConfigurationFile();
            default:
                if (selectedConfigurationItem instanceof PlannerConfigurationUriItem) {
                    return (selectedConfigurationItem as PlannerConfigurationUriItem).uri;
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
            return JSON.parse(configurationString);
        }
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

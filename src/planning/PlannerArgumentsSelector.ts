/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { window, Uri, QuickPickItem, workspace, SaveDialogOptions } from 'vscode';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { PackagedServerRequestArgs } from 'pddl-planning-service-client';
import { utils } from 'pddl-workspace';
import { exportToAndShow, waitTillClosed } from '../util/editorUtil';
import { SelectedEndpoint } from './PackagedPlanners';
import { Util as valUtil } from 'ai-planning-val';
import { PlannerArgumentsGenerator } from './PlannerArgumentsGenerator';

/** Async planner-as-a-service arguments. */
export class PlannerArgumentsSelector extends PlannerArgumentsGenerator {

    public static readonly DEFAULT: PackagedServerRequestArgs = {};

    constructor(private readonly problemPath: Uri, selectedEndpoint: SelectedEndpoint) {
        super(selectedEndpoint);
    }

    async getConfiguration(): Promise<PackagedServerRequestArgs | null> {
        // check if there actually are any configurable arguments
        const isConfigurable = this.selectedEndpoint.service.args.some(arg => PlannerArgumentsSelector.isConfigurable(arg));

        if (!isConfigurable) {
            return PlannerArgumentsSelector.DEFAULT;
        }

        const selectedItem = await window.showQuickPick<PlannerConfigurationItem>([useDefaultsItem, editConfigurationItem, selectedConfigurationItem, createConfigurationItem], { placeHolder: 'Select planner arguments from a .json file...' });
        if (!selectedItem) { return null; }

        switch (selectedItem) {
            case useDefaultsItem:
                return PlannerArgumentsSelector.DEFAULT;
            case editConfigurationItem:
                return await this.editConfiguration();
            case selectedConfigurationItem:
                return await this.selectConfigurationFile();
            case createConfigurationItem:
                await this.createConfigurationFile();
                return null;
            default:
                if (selectedConfigurationItem instanceof PlannerConfigurationUriItem) {
                    const uri = (selectedConfigurationItem as PlannerConfigurationUriItem).uri;
                    return PlannerArgumentsSelector.loadConfiguration(uri);
                }
                else {
                    throw new Error("Unexpected selected item type: " + typeof (selectedConfigurationItem));
                }
        }
    }

    async selectConfigurationFile(): Promise<PackagedServerRequestArgs | null> {
        const selectedUris = await window.showOpenDialog({
            canSelectMany: false, filters: {
                'Planner arguments JSON': ['json', 'jsonc']
            },
            defaultUri: this.problemPath
        });

        if (!selectedUris) { return null; }

        return PlannerArgumentsSelector.loadConfiguration(selectedUris[0]);
    }

    static async loadConfiguration(configurationUri: Uri): Promise<PackagedServerRequestArgs> {
        if (configurationUri.toString() === PlannerArgumentsSelector.DEFAULT.toString()) {
            return {};
        }
        else {
            const configurationDoc = await workspace.openTextDocument(configurationUri);
            const configurationString = configurationDoc.getText();
            return jsonc.parse(configurationString, [], { allowTrailingComma: true });
        }
    }

    async createConfigurationFile(): Promise<void> {
        let uri = Uri.joinPath(this.problemPath, this.createArgumentsFileName());
        while (await utils.afs.exists(uri.fsPath)) {
            const overwrite = "Overwrite";
            const selectDifferentFileName = "Select a different file name...";
            const shouldOverwrite = await window.showQuickPick([overwrite, selectDifferentFileName], { placeHolder: 'Arguments file already exists...' });
            if (shouldOverwrite === overwrite) {
                break;
            } else if (!shouldOverwrite) {
                return; // canceled
            } else if (shouldOverwrite === selectDifferentFileName) {
                const options: SaveDialogOptions = {
                    saveLabel: "Create",
                    filters: {
                        "JSON": ["json", "jsonc"]
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
        await this.exportArgsAndShow(uri);
    }

    private createArgumentsFileName(): string {
        return `.${this.selectedEndpoint.manifest.package_name}.${this.selectedEndpoint.endpoint}.jsonc`;
    }

    async editConfiguration(): Promise<PackagedServerRequestArgs> {
        const templateWithInstructions = `// Instructions: EDIT AND CLOSE/HIDE THIS TAB TO START THE PLANNER\n\n` + this.createArgumentTemplate();

        const argumentTempFilePath = await valUtil.toFile("", this.createArgumentsFileName(), templateWithInstructions);
        const argumentTempUri = Uri.file(argumentTempFilePath);
        const argsEditor = await exportToAndShow(templateWithInstructions, argumentTempUri, { forceShow: true, preview: true });
        const editedContent = await waitTillClosed(argsEditor!);
        await workspace.fs.delete(argumentTempUri);
        const errors: jsonc.ParseError[] = [];
        const args =
            jsonc.parse(editedContent, errors, { allowTrailingComma: true, allowEmptyContent: true });
        if (errors.length > 0) {
            throw new Error(`Arguments not formatted properly: ${errors.map(e => e.error).join(', ')}`);
        }
        return args;
    }

    async exportArgsAndShow(uri: Uri): Promise<void> {
        const formattedContent = this.createArgumentTemplate();
        await exportToAndShow(formattedContent, uri, { languageId: 'jsonc' });
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
const editConfigurationItem = new PlannerConfigurationItem("Edit arguments...");
const selectedConfigurationItem = new PlannerConfigurationItem("Select an arguments file...");
const createConfigurationItem = new PlannerConfigurationItem("Create a template arguments file...", "This creates a file, populated with default values for this planner. Launch the planner again.");

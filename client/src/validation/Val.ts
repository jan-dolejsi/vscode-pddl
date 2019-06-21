/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { commands, ExtensionContext, window, ProgressLocation, workspace, ConfigurationTarget } from 'vscode';
import * as path from 'path';
import { getFile } from '../httpUtils';
import { mkdirIfDoesNotExist } from '../../../common/src/asyncfs';
import * as os from 'os';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';

export class Val {
    valPath: string;
    valVersion: string;

    constructor(private context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand("pddl.downloadVal", async () => {
            try {
                let userAgreesToDownload = await this.promptForConsent();
                if (!userAgreesToDownload) { return; }
                await this.downloadAndConfigure();
            } catch (ex) {
                window.showErrorMessage(ex);
            }
        }));

        this.valPath = path.join(this.context.extensionPath, "val");
        this.valVersion = path.join(this.valPath, "VAL.version");
    }

    private async promptForConsent(): Promise<boolean> {
        let download = "Download";
        let answer = await window.showInformationMessage("Please confirm to download [build](https://dev.azure.com/schlumberger/ai-planning-validation) of [VAL tools](https://github.com/KCL-Planning/VAL)...", download, "Cancel");
        return answer === download;
    }

    private async downloadAndConfigure(): Promise<void> {

        let buildId = 12; //todo: pick it up from configuration
        let artifactName = Val.getArtifactName();
        if (!artifactName) {
            this.unsupportedOperatingSystem();
            return;
        }

        let zipPath = path.join(this.valPath, "drop.zip");
        await mkdirIfDoesNotExist(path.dirname(zipPath), 0o644); // was 777

        let url = `https://dev.azure.com/schlumberger/4e6bcb11-cd68-40fe-98a2-e3777bfec0a6/_apis/build/builds/${buildId}/artifacts?artifactName=${artifactName}&api-version=5.1-preview.5&%24format=zip`;

        await window.withProgress({ location: ProgressLocation.Window, title: 'Downloading VAL tools...' }, (_progress, _token) => {
            return getFile(url, zipPath);
        });
        console.log("Done downloading." + url);

        let zipEntries = await this.unzip(zipPath);

        if (zipEntries.length !== 1) {
            throw new Error(`Binary archive contains unexpected number of entries: ${zipEntries}. Content: ${zipEntries}`);
        }

        let valZipFileName = zipEntries[0];

        let versionMatch = /^Val-(\d{8}\.\d+(\.DRAFT)?)/.exec(path.basename(valZipFileName));
        if (!versionMatch) {
            throw new Error("Binary archive version does not conform to expected pattern: " + valZipFileName);
        }

        let version = versionMatch[1];

        let valToolFileNames = await this.decompress(path.join(this.valPath, valZipFileName));

        // clean-up and delete the drop content
        zipEntries.forEach(async (zipEntry) => {
            await fs.promises.unlink(path.join(this.valPath, zipEntry));
        });

        // delete the drop zip
        await fs.promises.unlink(zipPath);

        this.writeVersion(buildId, version, valToolFileNames);

        this.updateConfigurationPaths(valToolFileNames);
    }

    async decompress(compressedFilePath: string): Promise<string[]> {
        if (compressedFilePath.endsWith(".zip")) {
            return this.unzip(compressedFilePath);
        }
        else {
            throw new Error(`VAL tools were downloaded to ${compressedFilePath}, and must be de-compressed and configured manually.`);
        }
    }

    async unzip(zipPath: string): Promise<string[]> {
        let zip = new AdmZip(zipPath);
        let entryNames = zip.getEntries()
            .filter(entry => !entry.isDirectory)
            .map(entry => entry.entryName);

        return new Promise<string[]>((resolve, reject) => {
            zip.extractAllToAsync(this.valPath, true, err => {
                if (err) {
                    reject(err);
                    return;
                }
                else {
                    resolve(entryNames);
                }
            });
        });
    }

    private async writeVersion(buildId: number, version: string, valToolFileNames: string[]) {
        let valToolFilePaths = valToolFileNames.map(fileName => path.join(this.valPath, fileName));
        var json = JSON.stringify({ buildId: buildId, version: version, files: valToolFilePaths }, null, 2);
        try {
            await fs.promises.writeFile(this.valVersion, json, 'utf8');
        }
        catch (err) {
            window.showErrorMessage(`Error saving VAL version ${err.name}: ${err.message}`);
        }
    }

    static getArtifactName(): string {
        switch (os.platform()) {
            case "win32":
                switch (os.arch()) {
                    case "x64":
                        return "win64";
                    case "x32":
                        return "win32";
                    default:
                        return null;
                }
                break;
            case "linux":
                return "linux";
            default:
                return null;
        }
    }

    private unsupportedOperatingSystem() {
        window.showInformationMessage(`[VAL](https://github.com/KCL-Planning/VAL "VAL tools repository hosted by Kings College London Planning department.") binaries are not available for the ${os.platform()} platform.\nVisit the repository, build it on your system and manually configure it in VS Code settings.`);
    }

    /**
     * Configures the val tool paths
     * @param valToolFileNames all VAL tool relative path
     */
    private updateConfigurationPaths(valToolFileNames: string[]) {
        valToolFileNames.forEach(fileName => this.updateConfigurationPath(fileName));
    }

    private async updateConfigurationPath(fileName: string): Promise<void> {
        let configuration = workspace.getConfiguration("pddl");
        let filePath = path.join(this.valPath, fileName);

        let fileToConfig = new Map<string, string>();
        fileToConfig.set("Validate", "validatorPath");
        fileToConfig.set("ValueSeq", "valueSeqPath");
        fileToConfig.set("ValStep", "valStepPath");

        for (const file of fileToConfig.keys()) {
            let match = new RegExp("\\b" + file + "(?:\\.exe)?$");
            if (match.test(fileName)) {
                let configKey = fileToConfig.get(file);
                await configuration.update(configKey, filePath, ConfigurationTarget.Global);
                return;
            }
        }
    }
}

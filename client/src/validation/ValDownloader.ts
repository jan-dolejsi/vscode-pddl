/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, window, ProgressLocation, workspace, ConfigurationTarget } from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import * as path from 'path';
import { utils } from 'pddl-workspace';
import { ValDownloader as ValDownloaderBase, ValVersion, readValManifest, writeValManifest } from 'ai-planning-val';
import { PARSER_EXECUTABLE_OR_SERVICE, CONF_PDDL, VALIDATION_PATH, VALUE_SEQ_PATH, VAL_STEP_PATH, VALIDATOR_VERSION } from '../configuration';
import { VAL_DOWNLOAD_COMMAND, ValDownloadOptions } from './valCommand';
import { ensureAbsoluteGlobalStoragePath } from '../utils';

export class ValDownloader extends ValDownloaderBase {
    /** Directory where VAL binaries are to be downloaded locally. */
    static readonly VAL_DIR = "val";
    /** File that contains version info of last downloaded VAL binaries. */
    private valVersionPath: string;

    private readonly binaryStorage: string;

    constructor(private context: ExtensionContext) {
        super();
        this.binaryStorage = this.context.globalStoragePath;

        this.valVersionPath = path.join(this.getValPath(), "VAL.version");
    }

    registerCommands(): ValDownloader {
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(VAL_DOWNLOAD_COMMAND, async (options: ValDownloadOptions) => {
            try {
                const userAgreesToDownload = options?.bypassConsent ?? await this.promptForConsent();
                if (!userAgreesToDownload) { return; }
                await this.downloadConfigureAndCleanUp();
            } catch (ex) {
                window.showErrorMessage(ex.message ?? ex);
            }
        }));

        return this;
    }

    protected async downloadDelegate(url: string, zipPath: string, message: string): Promise<void> {
        return await window.withProgress({ location: ProgressLocation.Window, title: message }, () => {
            return super.downloadDelegate(url, zipPath, message);
        });
    }

    /** Directory where VAL binaries are to be downloaded locally. */
    getValPath(): string {
        return path.join(this.binaryStorage, ValDownloader.VAL_DIR);
    }

    private asAbsoluteStoragePath(relativePath: string): string {
        return path.join(this.binaryStorage, relativePath);
    }

    private async promptForConsent(): Promise<boolean> {
        const download = "Download";
        const message = `Please confirm to download [VAL tools](${ValDownloader.VAL_REPO}) build from ${ValDownloader.VAL_BINARY_PROJECT}?`;
        const answer = await window.showInformationMessage(message, { modal: true }, download);
        return answer === download;
    }

    async downloadConfigureAndCleanUp(): Promise<ValVersion> {
        const wasValInstalled = await this.isInstalled();
        const previousVersion = wasValInstalled ? await this.readVersion() : undefined;
        let newVersion: ValVersion | undefined;

        try {
            newVersion = await this.downloadAndConfigure();
        }
        finally {
            // clean previous version
            if (wasValInstalled && previousVersion && newVersion) {
                if (previousVersion.buildId !== newVersion.buildId) {
                    console.log(`The ${previousVersion.version} and the ${newVersion.version} differ, cleaning-up the old version.`);
                    const filesAbsPaths = previousVersion.files.map(f => this.asAbsoluteStoragePath(path.join(ValDownloader.VAL_DIR, f)));
                    await ValDownloader.deleteAll(filesAbsPaths);
                }
            }
        }

        return newVersion;
    }

    protected getLatestStableValBuildId(): number {
        return workspace.getConfiguration(CONF_PDDL).get<number>(VALIDATOR_VERSION) ?? -1;
    }

    private async downloadAndConfigure(): Promise<ValVersion> {

        const buildId = this.getLatestStableValBuildId();
        utils.afs.mkdirIfDoesNotExist(this.binaryStorage, 0o755);

        const newValVersion = await this.download(buildId, this.getValPath());

        const wasValInstalled = await this.isInstalled();
        const previousVersion = wasValInstalled ? await this.readVersion() : undefined;

        await this.writeVersion(newValVersion);

        await this.updateConfigurationPaths(newValVersion, previousVersion);
        return newValVersion;
    }

    async isInstalled(): Promise<boolean> {
        return await utils.afs.exists(this.valVersionPath);
    }

    private async readVersion(): Promise<ValVersion> {
        return readValManifest(this.valVersionPath);
    }

    private async writeVersion(valVersion: ValVersion): Promise<void> {
        return writeValManifest(this.valVersionPath, valVersion);
    }

    /**
     * Configures the val tool paths
     * @param newValVersion val version just downloaded
     * @param oldValVersion val version from which we are upgrading
     */
    private async updateConfigurationPaths(newValVersion: ValVersion, oldValVersion?: ValVersion): Promise<void> {
        const fileToConfig = new Map<string, string>();
        fileToConfig.set("Parser", PARSER_EXECUTABLE_OR_SERVICE);
        fileToConfig.set("Validate", CONF_PDDL + '.' + VALIDATION_PATH);
        fileToConfig.set("ValueSeq", CONF_PDDL + '.' + VALUE_SEQ_PATH);
        fileToConfig.set("ValStep", CONF_PDDL + '.' + VAL_STEP_PATH);

        for (const toolName of fileToConfig.keys()) {
            const oldToolPath = findValToolPath(oldValVersion, toolName);
            const newToolPath = findValToolPath(newValVersion, toolName);
            if (!newToolPath) {
                console.log(`Tool ${toolName} not found in the downloaded archive.`);
                return;
            }

            const oldToolAbsPath = oldToolPath && this.asAbsoluteStoragePath(path.join(ValDownloader.VAL_DIR, oldToolPath));
            const newToolAbsPath = this.asAbsoluteStoragePath(path.join(ValDownloader.VAL_DIR, newToolPath));

            const configKey = fileToConfig.get(toolName);

            if (configKey && newToolPath) {
                await this.updateConfigurationPath(toolName, configKey, newToolAbsPath, oldToolAbsPath);
            }
        }
    }

    /**
     * Updates the configuration path for the configuration key, unless it was explicitly set by the user.
     * @param toolName name of the tool being configured
     * @param configKey configuration key in the form prefix.postfix
     * @param newToolPath the location of the currently downloaded/unzipped tool
     * @param prevDownloadToolPath the location of the previously downloaded/unzipped tool (if known)
     */
    private async updateConfigurationPath(toolName: string, configKey: string, newToolPath: string, prevDownloadToolPath?: string): Promise<void> {
        const configurationInspect = workspace.getConfiguration().inspect<string>(configKey);
        if (!configurationInspect) {
            console.log("configuration not declared: " + configKey);
            return;
        }
        const normConfiguredGlobalValue =
            this.normalizePathIfValid(
                // for backward compatibility
                ensureAbsoluteGlobalStoragePath(configurationInspect.globalValue, this.context));

        const normPrevDownloadToolPath = this.normalizePathIfValid(prevDownloadToolPath);

        // was the configuration value empty?
        if (normConfiguredGlobalValue === undefined
            // or did it match the previous download?
            // (i.e.it came from the previous download and the user did not change the configuration)
            || normConfiguredGlobalValue === normPrevDownloadToolPath
            // or does the path not exist anyway?
            // || prevDownloadToolPath && !await utils.afs.exists(this.asAbsoluteStoragePath(prevDownloadToolPath))
            || await this.shouldOverwrite(toolName, normConfiguredGlobalValue, newToolPath)) {
            // Overwrite it!
            return await workspace.getConfiguration().update(configKey, newToolPath, ConfigurationTarget.Global);
        }
    }

    protected async shouldOverwrite(toolName: string, yourConfiguredPath: string, newToolPath: string): Promise<boolean> {
        const overwrite = "Overwrite";
        const message = `VAL tool '${toolName}' was already configured:\n\nYour configuration: ${yourConfiguredPath}\n\nJust downloaded: ${newToolPath}\n\nWish to use the downloaded tool instead?`;
        const answer = await window.showInformationMessage(message, {modal: true}, overwrite, "Keep");
        return answer === overwrite;
    }

    private normalizePathIfValid(pathToNormalize?: string): string | undefined {
        return pathToNormalize ? path.normalize(pathToNormalize) : pathToNormalize;
    }

    async isNewValVersionAvailable(): Promise<boolean> {
        const isInstalled = await this.isInstalled();
        if (!isInstalled) { return false; }

        const latestStableValBuildId = this.getLatestStableValBuildId();
        const installedVersion = await this.readVersion();

        return latestStableValBuildId > installedVersion.buildId;
    }
}

/**
 * Finds the path of given VAL tool in the given version.
 * @param valVersion VAL version manifest (if known)
 * @param toolName tool name for which we are looking for its path
 * @returns corresponding path, or _undefined_ if the _valVersion_ argument is null or undefined
 */
function findValToolPath(valVersion: ValVersion | undefined, toolName: string): string | undefined {
    if (!valVersion) { return undefined; }
    const pattern = new RegExp("\\b" + toolName + "(?:\\.exe)?$");
    return valVersion.files.find(filePath => pattern.test(filePath));
}
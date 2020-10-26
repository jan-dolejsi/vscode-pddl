/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, workspace, ConfigurationTarget, extensions, TextDocument, Webview, WorkspaceFolder
} from 'vscode';

import { PddlConfiguration, PDDL_PLANNER } from '../configuration/configuration';

import * as path from 'path';
import { getWebViewHtml, createPddlExtensionContext, showError, asWebviewUri } from '../utils';
import { utils } from 'pddl-workspace';
import { ValDownloader } from '../validation/ValDownloader';
import { VAL_DOWNLOAD_COMMAND, ValDownloadOptions } from '../validation/valCommand';
import { PTEST_VIEW } from '../ptest/PTestCommands';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { PlannersConfiguration as PlannersConfiguration, ScopedPlannerConfiguration } from '../configuration/PlannersConfiguration';

export const SHOULD_SHOW_OVERVIEW_PAGE = 'shouldShowOverviewPage';
export const LAST_SHOWN_OVERVIEW_PAGE = 'lastShownOverviewPage';

export class OverviewPage {

    private webViewPanel?: WebviewPanel;
    private iconsInstalled = false;
    private workspaceFolder: WorkspaceFolder | undefined;

    private readonly ICONS_EXTENSION_NAME = "vscode-icons-team.vscode-icons";

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration, private plannersConfiguration: PlannersConfiguration, private val: ValDownloader) {
        instrumentOperationAsVsCodeCommand("pddl.showOverview", () => this.showWelcomePage(true));
        workspace.onDidChangeConfiguration(() => this.scheduleUpdatePageConfiguration(), undefined, this.context.subscriptions);
        workspace.onDidChangeWorkspaceFolders(() => this.scheduleUpdatePageConfiguration(), undefined, this.context.subscriptions);
        extensions.onDidChange(() => this.updateIconsAlerts(), this.context.subscriptions);
        this.updateIconsAlerts();
    }

    async showWelcomePage(showAnyway: boolean): Promise<void> {
        if (this.webViewPanel) {
            this.webViewPanel.reveal();
        }
        else {
            if (showAnyway || this.beenAWhile()) {
                this.createWelcomePage(false);
            }
        }
    }

    beenAWhile(): boolean {
        const lastTimeShown = this.context.globalState.get<string>(LAST_SHOWN_OVERVIEW_PAGE, new Date(2000, 0, 1).toString());
        const minutesSinceLastShow = (Date.now() - Date.parse(lastTimeShown)) / 1000 / 60;
        return minutesSinceLastShow > 60;
    }

    async createWelcomePage(showOnTop: boolean): Promise<void> {
        const iconUri = this.context.asAbsolutePath('images/icon.png');

        const webViewPanel = window.createWebviewPanel(
            "pddl.Welcome",
            "PDDL Overview",
            {
                viewColumn: ViewColumn.Active,
                preserveFocus: !showOnTop
            },
            {
                retainContextWhenHidden: true,
                enableFindWidget: true,
                enableCommandUris: true,
                enableScripts: true,
                localResourceRoots: [
                    Uri.file(this.context.asAbsolutePath(this.VIEWS)),
                    Uri.file(this.context.asAbsolutePath("images"))
                ]
            }
        );

        const html = await this.getHtml(webViewPanel.webview);
        webViewPanel.webview.html = html;
        webViewPanel.iconPath = Uri.file(iconUri);

        webViewPanel.onDidDispose(() => this.webViewPanel = undefined, undefined, this.context.subscriptions);
        webViewPanel.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, this.context.subscriptions);
        webViewPanel.onDidChangeViewState(() => this.scheduleUpdatePageConfiguration());

        this.webViewPanel = webViewPanel;
        this.context.subscriptions.push(this.webViewPanel);

        // record the last date the page was shown on top
        this.context.globalState.update(LAST_SHOWN_OVERVIEW_PAGE, new Date(Date.now()));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async handleMessage(message: any): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'onload':
                this.scheduleUpdatePageConfiguration();
                break;
            case 'shouldShowOverview':
                this.context.globalState.update(SHOULD_SHOW_OVERVIEW_PAGE, message.value);
                break;
            case 'tryHelloWorld':
                this.helloWorld().catch(showError);
                break;
            case 'openNunjucksSample':
                this.openNunjucksSample().catch(showError);
                break;
            case 'clonePddlSamples':
                commands.executeCommand("git.clone", "https://github.com/jan-dolejsi/vscode-pddl-samples.git");
                break;
            case 'selectPlanner':
                this.plannersConfiguration.setSelectedPlanner(message.value as ScopedPlannerConfiguration, this.workspaceFolder).catch(showError);
                break;
            case 'deletePlanner':
                commands.executeCommand('pddl.deletePlanner', message.value as ScopedPlannerConfiguration);
                break;
            case 'configurePlanner':
                commands.executeCommand('pddl.configurePlanner', message.value as ScopedPlannerConfiguration);
                break;
            case 'showConfiguration':
                commands.executeCommand('pddl.showPlannerConfiguration', message.value as ScopedPlannerConfiguration);
                break;
            case 'plannerOutputTarget':
                this.pddlConfiguration.updateEffectiveConfiguration("pddlPlanner", "executionTarget", message.value as string);
                break;
            case 'workspaceFolderSelected':
                const workspaceFolderUriAsString = message.workspaceFolderUri as string;
                this.workspaceFolder = workspace.getWorkspaceFolder(Uri.parse(workspaceFolderUriAsString));
                this.scheduleUpdatePageConfiguration();
                break;
            case 'installIcons':
                try {
                    await commands.executeCommand("workbench.extensions.installExtension", this.ICONS_EXTENSION_NAME);
                }
                catch (err) {
                    window.showErrorMessage("Could not install the VS Code Icons extension: " + err);
                }
                break;
            case 'enableIcons':
                await workspace.getConfiguration().update("workbench.iconTheme", "vscode-icons", ConfigurationTarget.Global);
                break;
            case 'downloadVal':
                const options: ValDownloadOptions = { bypassConsent: message.informedDecision };
                await commands.executeCommand(VAL_DOWNLOAD_COMMAND, options);
                break;
            default:
                if (message.command?.startsWith('command:')) {
                    const command = message.command as string;
                    await commands.executeCommand(command.substr('command:'.length));
                } else {
                    console.warn('Unexpected command: ' + message.command);
                }
        }
    }

    readonly VIEWS = "views";
    readonly CONTENT_FOLDER = path.join(this.VIEWS, "overview");
    readonly COMMON_FOLDER = path.join(this.VIEWS, "common");

    async helloWorld(): Promise<void> {
        const sampleDocuments = await this.createSample('helloworld', 'Hello World!');

        if (!sampleDocuments) { return; } // canceled

        const documentsToOpen = await this.openSampleFiles(sampleDocuments, ['domain.pddl', 'problem.pddl']);

        const workingDirectory = path.dirname(documentsToOpen[0].fileName);
        commands.executeCommand("pddl.planAndDisplayResult", documentsToOpen[0].uri, documentsToOpen[1].uri, workingDirectory, "");
    }

    async openNunjucksSample(): Promise<void> {
        const sampleDocuments = await this.createSample('nunjucks', 'Nunjucks template sample');

        if (!sampleDocuments) { return; } // canceled

        // let documentsToOpen = 
        await this.openSampleFiles(sampleDocuments, ['domain.pddl', 'problem.pddl', 'problem0.json']);

        const ptestJsonName = '.ptest.json';
        const ptestJson = sampleDocuments.find(doc => path.basename(doc.fileName) === ptestJsonName);
        if (!ptestJson) { throw new Error("Could not find " + ptestJsonName); }
        const generatedProblemUri = ptestJson.uri.with({ fragment: '0' });

        await commands.executeCommand(PTEST_VIEW, generatedProblemUri);

        // let workingDirectory = path.dirname(documentsToOpen[0].fileName);
        // commands.executeCommand("pddl.planAndDisplayResult", documentsToOpen[0].uri, generatedProblemUri, workingDirectory, "");
    }

    async openSampleFiles(sampleDocuments: TextDocument[], fileNamesToOpen: string[]): Promise<TextDocument[]> {
        const documentsToOpen = fileNamesToOpen
            .map(fileName => sampleDocuments.find(doc => path.basename(doc.fileName) === fileName));

        // were all files found?
        if (documentsToOpen.some(v => !v)) {
            throw new Error('One or more sample files were not found: ' + fileNamesToOpen);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const validDocumentsToOpen = documentsToOpen.map(v => v!);

        for (let index = 0; index < validDocumentsToOpen.length; index++) {
            const doc = sampleDocuments[index];
            const viewColumn: ViewColumn = this.indexToViewColumn(index);
            await window.showTextDocument(doc, { viewColumn: viewColumn, preview: false });
        }

        return validDocumentsToOpen;
    }

    indexToViewColumn(index: number): ViewColumn {
        switch (index) {
            case 0: return ViewColumn.One;
            case 1: return ViewColumn.Two;
            case 2: return ViewColumn.Three;
            case 3: return ViewColumn.Four;
            default: return ViewColumn.Five;
        }
    }

    async createSample(subDirectory: string, sampleName: string): Promise<TextDocument[] | undefined> {
        let folder: Uri | undefined;

        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            const folders = await window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: `Select folder for the '${sampleName}' sample...` });
            if (folders) {
                folder = folders[0];
            }
        } else if (workspace.workspaceFolders.length === 1) {
            folder = workspace.workspaceFolders[0].uri;
        } else {
            const selectedFolder = await window.showWorkspaceFolderPick({ placeHolder: `Select workspace folder for the '${sampleName}' sample...` });
            folder = selectedFolder?.uri;
        }

        if (!folder) { return undefined; }

        const sampleFiles = await utils.afs.readdir(this.context.asAbsolutePath(path.join(this.CONTENT_FOLDER, subDirectory)));

        const sampleDocumentPromises = sampleFiles
            .map(async (sampleFile) => {
                const sampleResourcePath = this.context.asAbsolutePath(path.join(this.CONTENT_FOLDER, subDirectory, sampleFile));//'overview/helloWorld/domain.pddl'
                const sampleText = await utils.afs.readFile(sampleResourcePath, { encoding: "utf-8" });
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const sampleTargetPath = path.join(folder!.fsPath, sampleFile);//"helloWorldDomain.pddl"
                if (await utils.afs.exists(sampleTargetPath)) { throw new Error(`File '${sampleFile}' already exists.`); }
                await utils.afs.writeFile(sampleTargetPath, sampleText, { encoding: "utf-8" });
                const sampleDocument = await workspace.openTextDocument(sampleTargetPath);
                return sampleDocument;
            });

        const sampleDocuments = await Promise.all(sampleDocumentPromises);
        return sampleDocuments;
    }

    async getHtml(webview: Webview): Promise<string> {
        return getWebViewHtml(createPddlExtensionContext(this.context), {
            relativePath: this.CONTENT_FOLDER, htmlFileName: 'overview.html',
            fonts: [
                webview.asWebviewUri(Uri.file(this.context.asAbsolutePath(path.join(this.COMMON_FOLDER, "codicon.ttf"))))
            ]
        }, webview);
    }

    updateIconsAlerts(): void {
        this.iconsInstalled = extensions.getExtension(this.ICONS_EXTENSION_NAME) !== undefined;
        this.scheduleUpdatePageConfiguration();
    }

    updateTimeout: NodeJS.Timeout | undefined;

    scheduleUpdatePageConfiguration(options?: { immediate?: boolean }): void {
        if (options?.immediate) {
            this.updatePageConfiguration();
        }
        else {
            if (this.updateTimeout) {
                this.updateTimeout.refresh();

            }
            else {
                this.updateTimeout = setTimeout(() => {
                    this.updatePageConfiguration().catch(showError);
                }, 500);
            }
        }
    }

    async updatePageConfiguration(): Promise<boolean> {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }
        if (!this.webViewPanel || !this.webViewPanel.active) { return false; }

        let planners: ScopedPlannerConfiguration[] | undefined;
        let plannersConfigError: string | undefined;

        this.workspaceFolder = this.workspaceFolder ?? (workspace.workspaceFolders && workspace.workspaceFolders[0]);

        try {
            planners = this.plannersConfiguration.getPlanners(this.workspaceFolder);
        }
        catch (err) {
            plannersConfigError = err.message ?? err;
            console.log(plannersConfigError);
        }

        const message: OverviewConfiguration = {
            command: 'updateConfiguration',
            workspaceFolders: workspace.workspaceFolders?.map(wf => this.toWireWorkspaceFolder(wf)) ?? [],
            selectedWorkspaceFolder: this.workspaceFolder && this.toWireWorkspaceFolder(this.workspaceFolder),
            planners: planners,
            selectedPlanner: this.plannersConfiguration.getSelectedPlanner(this.workspaceFolder)?.configuration.title,
            plannersConfigError: plannersConfigError,
            plannerOutputTarget: workspace.getConfiguration(PDDL_PLANNER, this.workspaceFolder).get<string>("executionTarget", "Output window"),
            parser: this.pddlConfiguration.getParserPath(this.workspaceFolder),
            validator: this.pddlConfiguration.getValidatorPath(this.workspaceFolder),
            imagesPath: asWebviewUri(Uri.file(this.context.asAbsolutePath('images')), this.webViewPanel.webview).toString(),
            shouldShow: this.context.globalState.get<boolean>(SHOULD_SHOW_OVERVIEW_PAGE, true),
            autoSave: workspace.getConfiguration("files", this.workspaceFolder).get<string>("autoSave", "off"),
            showInstallIconsAlert: !this.iconsInstalled,
            showEnableIconsAlert: this.iconsInstalled && workspace.getConfiguration().get<string>("workbench.iconTheme") !== "vscode-icons",
            downloadValAlert: !this.pddlConfiguration.getValidatorPath(this.workspaceFolder) || !(await this.val.isInstalled()),
            updateValAlert: await this.val.isNewValVersionAvailable()
            // todo: workbench.editor.revealIfOpen
        };
        return this?.webViewPanel.webview?.postMessage(message) ?? false;
    }

    private toWireWorkspaceFolder(workspaceFolder: WorkspaceFolder): WireWorkspaceFolder {
        return {
            name: workspaceFolder.name,
            uri: workspaceFolder.uri.toString()
        };
    }
}

interface OverviewConfiguration {
    command: string;
    workspaceFolders: WireWorkspaceFolder[];
    selectedWorkspaceFolder?: WireWorkspaceFolder;
    planners: ScopedPlannerConfiguration[];
    selectedPlanner?: string;
    plannersConfigError?: string;
    plannerOutputTarget: string;
    parser?: string;
    validator?: string;
    imagesPath: string;
    shouldShow: boolean;
    autoSave: string;
    showInstallIconsAlert: boolean;
    showEnableIconsAlert: boolean;
    downloadValAlert: boolean;
    updateValAlert: boolean;
}

interface WireWorkspaceFolder {
    uri: string;
    name: string;
}
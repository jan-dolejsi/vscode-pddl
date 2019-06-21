/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, workspace, ConfigurationTarget, extensions
} from 'vscode';

import { PddlConfiguration } from '../configuration';

import * as path from 'path';
import { getWebViewHtml } from '../utils';
import * as afs from '../../../common/src/asyncfs';
import * as fs from 'fs';

export const SHOULD_SHOW_OVERVIEW_PAGE = 'shouldShowOverviewPage';
export const LAST_SHOWN_OVERVIEW_PAGE = 'lastShownOverviewPage';

export class OverviewPage {

    private webViewPanel: WebviewPanel;
    private iconsInstalled: boolean;

    private readonly ICONS_EXTENSION_NAME = "vscode-icons-team.vscode-icons";

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        commands.registerCommand("pddl.showOverview", () => this.showWelcomePage(true));
        workspace.onDidChangeConfiguration(_ => this.updatePageConfiguration(), undefined, this.context.subscriptions);
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
        let lastTimeShown = this.context.globalState.get<string>(LAST_SHOWN_OVERVIEW_PAGE, new Date(2000, 0, 1).toString());
        let minutesSinceLastShow = (Date.now() - Date.parse(lastTimeShown)) / 1000 / 60;
        return minutesSinceLastShow > 60;
    }

    async createWelcomePage(showOnTop: boolean): Promise<void> {
        let html = await this.getHtml();
        let iconUri = this.context.asAbsolutePath('images/icon.png');

        this.webViewPanel = window.createWebviewPanel(
            "pddl.Wecome",
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
                localResourceRoots: [Uri.file(path.join(this.context.extensionPath, this.CONTENT_FOLDER))]
            }
        );

        this.webViewPanel.webview.html = html;
        this.webViewPanel.iconPath = Uri.file(iconUri);

        this.webViewPanel.onDidDispose(() => this.webViewPanel = undefined, undefined, this.context.subscriptions);
        this.webViewPanel.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, this.context.subscriptions);
        this.webViewPanel.onDidChangeViewState(_ => this.updatePageConfiguration());

        this.context.subscriptions.push(this.webViewPanel);

        // set up the view with relevant data
        this.updatePageConfiguration();

        // record the last date the page was shown on top
        this.context.globalState.update(LAST_SHOWN_OVERVIEW_PAGE, new Date(Date.now()));
    }

    async handleMessage(message: any): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'shouldShowOverview':
                this.context.globalState.update(SHOULD_SHOW_OVERVIEW_PAGE, message.value);
                break;
            case 'tryHelloWorld':
                try {
                    await this.helloWorld();
                }
                catch (ex) {
                    window.showErrorMessage(ex.message);
                }
                break;
            case 'clonePddlSamples':
                commands.executeCommand("git.clone", "https://github.com/jan-dolejsi/vscode-pddl-samples.git");
                break;
            case 'plannerOutputTarget':
                workspace.getConfiguration("pddlPlanner").update("executionTarget", message.value, ConfigurationTarget.Global);
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
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }

    CONTENT_FOLDER = "overview";

    async helloWorld(): Promise<void> {
        let folder: Uri = undefined;

        if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
            let folders = await window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Select folder for hello world...' });
            if (folders) {
                folder = folders[0];
            }
        } else if (workspace.workspaceFolders.length === 1) {
            folder = workspace.workspaceFolders[0].uri;
        } else {
            let selectedFolder = await window.showWorkspaceFolderPick({ placeHolder: 'Select workspace folder for Hello World!' });
            folder = selectedFolder.uri;
        }

        let domainResourcePath = this.context.asAbsolutePath('overview/domain.pddl');
        let domainText = await fs.promises.readFile(domainResourcePath, { encoding: "utf-8" });
        let domainPath = path.join(folder.fsPath, "helloWorldDomain.pddl");
        if (await afs.exists(domainPath)) { throw new Error("File 'helloWorldDomain.pddl' already exists."); }
        await fs.promises.writeFile(domainPath, domainText, { encoding: "utf-8" });
        let domainDocument = await workspace.openTextDocument(domainPath);
        await window.showTextDocument(domainDocument, { viewColumn: ViewColumn.One, preview: false });

        let problemResourcePath = this.context.asAbsolutePath('overview/problem.pddl');
        let problemText = await fs.promises.readFile(problemResourcePath, { encoding: "utf-8" });
        let problemPath = path.join(folder.fsPath, "helloWorldProblem.pddl");
        if (await afs.exists(problemPath)) { throw new Error("File 'helloWorldProblem.pddl' already exists."); }
        await fs.promises.writeFile(problemPath, problemText, { encoding: "utf-8" });
        let problemDocument = await workspace.openTextDocument(problemPath);
        window.showTextDocument(problemDocument, { viewColumn: ViewColumn.Two, preview: false });

        commands.executeCommand("pddl.planAndDisplayResult", domainDocument.uri, problemDocument.uri, folder.fsPath, "");
    }

    async getHtml(): Promise<string> {
        let html = getWebViewHtml(this.context, this.CONTENT_FOLDER, 'overview.html');
        return html;
    }

    updateIconsAlerts(): void {
        this.iconsInstalled = extensions.getExtension(this.ICONS_EXTENSION_NAME) !== undefined;
        this.updatePageConfiguration();
    }

    async updatePageConfiguration(): Promise<void> {
        if (!this.webViewPanel) { return; }
        let message = {
            command: 'updateConfiguration',
            planner: await this.pddlConfiguration.getPlannerPath(),
            plannerOutputTarget: await workspace.getConfiguration("pddlPlanner").get<String>("executionTarget"),
            parser: await this.pddlConfiguration.getParserPath(),
            validator: await this.pddlConfiguration.getValidatorPath(),
            shouldShow: this.context.globalState.get<boolean>(SHOULD_SHOW_OVERVIEW_PAGE, true),
            autoSave: workspace.getConfiguration().get<String>("files.autoSave"),
            showInstallIconsAlert: !this.iconsInstalled,
            showEnableIconsAlert: this.iconsInstalled && workspace.getConfiguration().get<String>("workbench.iconTheme") !== "vscode-icons",
        };
        this.webViewPanel.webview.postMessage(message);
    }
}
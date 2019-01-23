/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, workspace
} from 'vscode';

import { PddlConfiguration } from '../configuration';

import * as path from 'path';

import * as fs from 'fs';
const util = require('util');
require('util.promisify').shim();

const readFile = util.promisify(fs.readFile);

export const SHOULD_SHOW_OVERVIEW_PAGE = 'shouldShowOverviewPage';

export class OverviewPage {

    private webViewPanel: WebviewPanel

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        commands.registerCommand("pddl.showOverview", () => this.showWelcomePage());
        workspace.onDidChangeConfiguration(_ => this.updatePageConfiguration(), undefined, this.context.subscriptions);
    }

    async showWelcomePage(): Promise<void> {
        if (this.webViewPanel) {
            this.webViewPanel.reveal();
        }
        else {
            this.createWelcomePage();
        }
    }

    async createWelcomePage(): Promise<void> {
        let html = await this.getHtml();
        let iconUri = this.context.asAbsolutePath('images/icon.png');

        this.webViewPanel = window.createWebviewPanel(
            "pddl.Wecome",
            "PDDL Overview",
            {
                viewColumn: ViewColumn.Active,
                // preserveFocus: showInBackground
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
    }

    handleMessage(message: any): void {
        console.log(`Message received from the webview: ${message.command}`);

        switch(message.command){
            case 'shouldShowOverview':
                this.context.globalState.update(SHOULD_SHOW_OVERVIEW_PAGE, message.value);
                break;

            case 'clonePddlSamples':
                commands.executeCommand("git.clone", Uri.parse("https://github.com/jan-dolejsi/vscode-pddl-samples"));
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }

    CONTENT_FOLDER = "overview";

    async getHtml(): Promise<string> {
        let overviewHtmlPath = this.context.asAbsolutePath('overview/overview.html');
        let html = await readFile(overviewHtmlPath, { encoding: "utf-8" });

        html = html.replace(/<(script|img) src="([^"]+)"/g, (sourceElement: string, elementName: string, srcPath: string) => {
            sourceElement;
            let resource=Uri.file(
                path.join(this.context.extensionPath,
                    this.CONTENT_FOLDER,
                    srcPath))
                    .with({scheme: "vscode-resource"});
            return `<${elementName} src="${resource}"`;
        })

        return html;
    }

    async updatePageConfiguration() {
        this.webViewPanel.webview.postMessage({
            command: 'updateConfiguration',
            planner: await this.pddlConfiguration.getPlannerPath(),
            parser: await this.pddlConfiguration.getParserPath(),
            validator: await this.pddlConfiguration.getValidatorPath(),
            shouldShow: this.context.globalState.get<boolean>(SHOULD_SHOW_OVERVIEW_PAGE, true)
        });
    }
}
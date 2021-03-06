/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, Uri, ViewColumn, WebviewPanel, workspace, commands, Webview, ExtensionContext
} from 'vscode';
import * as path from 'path';
import { getWebViewHtml } from '../webviewUtils';
import { PTestReport } from './PTestReport';
import { TestsManifest } from './TestsManifest';
import { Test } from './Test';
import { PTEST_VIEW } from './PTestCommands';

/** Visualizes PTest results on a web view panel. */
export class PTestReportView {
    private webViewPanel: WebviewPanel | undefined;
    readonly CONTENT_FOLDER = path.join("views", "ptestReport");

    constructor(private context: ExtensionContext, private report: PTestReport) {
    }

    async showReport(): Promise<void> {
        if (this.webViewPanel) {
            this.webViewPanel.reveal();
        }
        else {
            this.createPage();
        }
    }

    async createPage(): Promise<void> {
        const iconUri = this.context.asAbsolutePath('images/icon.png');

        this.webViewPanel = window.createWebviewPanel(
            "pddl.test.report",
            "Test Report",
            {
                viewColumn: ViewColumn.Active,
                preserveFocus: false
            },
            {
                retainContextWhenHidden: true,
                enableFindWidget: true,
                enableCommandUris: true,
                enableScripts: true,
                localResourceRoots: [Uri.file(this.context.asAbsolutePath(this.CONTENT_FOLDER))]
            }
        );

        this.webViewPanel.iconPath = Uri.file(iconUri);

        this.webViewPanel.onDidDispose(() => this.webViewPanel = undefined, undefined, this.context.subscriptions);
        this.webViewPanel.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, this.context.subscriptions);
        this.webViewPanel.onDidChangeViewState(() => this.updatePage());

        this.context.subscriptions.push(this.webViewPanel);

        // set up the view with relevant data
        this.updatePage();
    }

    async updatePage(): Promise<void> {
        if (this.webViewPanel) {
            const html = await this.getHtml(this.webViewPanel.webview);
            this.webViewPanel.webview.html = html;
        }
    }

    async getHtml(webview: Webview): Promise<string> {
        let html = await getWebViewHtml(this.context, {
            allowUnsafeInlineScripts: true, // it is used by the generated html
            relativePath: this.CONTENT_FOLDER,
            htmlFileName: 'page.html'
        }, webview);

        const tableRowsHtml = this.report.getManifests().map(manifest => this.renderManifestRow(manifest));

        html = html.replace("TABLE", tableRowsHtml.join('\n'));

        return html;
    }

    renderManifestRow(manifest: TestsManifest): string {
        const manifestLocation = workspace.asRelativePath(manifest.path, true);

        const manifestLink = `<a  href="#" onclick="openManifest('${manifest.uri.toString()}')" title="Open test manifest.">&#128065;</a>`;
        const manifestHeader = `<tr><td colspan="4" class="manifestRow">${manifestLocation} ${manifestLink}</td></tr>`;

        const testRows = this.report.getTestCases(manifest).map(test => this.renderTestRow(test));

        return [manifestHeader].concat(testRows).join('\n');
    }

    renderTestRow(test: Test): string {
        const testResult = this.report.getTestResultOrThrow(test);
        const elapsedTime = testResult.elapsedTime ? `${(testResult.elapsedTime / 1000).toFixed(2)}` : '';
        const viewTestLink = `<a  href="#" onclick="openTest('${test.getUriOrThrow().toString()}')" title="Open test case.">&#128065;</a>`;
        return `<tr><td>${test.getLabel()} ${viewTestLink}</td><td>${testResult.outcomeChar}</td><td>${elapsedTime}</td><td>${testResult.error ?? ""}</td></tr>`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async handleMessage(message: any): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'openManifest':
                const manifestDoc = await workspace.openTextDocument(Uri.parse(message.value));
                await window.showTextDocument(manifestDoc, { viewColumn: ViewColumn.Beside });
                break;
            case 'openTest':
                commands.executeCommand(PTEST_VIEW, Uri.parse(message.value));
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }
}
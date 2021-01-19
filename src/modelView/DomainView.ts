/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, Uri,
    ViewColumn, ExtensionContext, TextDocument, Disposable, Event, EventEmitter, TextEditor, WebviewOptions, WebviewPanelOptions
} from 'vscode';
import * as path from 'path';

import { isPddl } from '../workspace/workspaceUtils';
import { DomainInfo } from 'pddl-workspace';
import { PddlWorkspace } from 'pddl-workspace';
import { FileInfo } from 'pddl-workspace';

import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { getWebViewHtml, createPddlExtensionContext, UriMap, showError, toUri } from '../utils';
import { DomainViewPanel } from './DomainViewPanel';
import { WebviewPanelAdapter, WebviewInsetAdapter } from './view';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

const VIEWS = "views";
const COMMON_FOLDER = path.join(VIEWS, "common");

/**
 * Base-class for different domain views.
 */
export abstract class DomainView<TRendererOptions, TRenderData> extends Disposable {

    private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeCodeLenses?: Event<void> = this._onDidChangeCodeLenses.event;

    private webviewPanels = new UriMap<DomainViewPanel>();
    private webviewInsets = new UriMap<Map<TextEditor, DomainViewPanel>>();

    constructor(private context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace,
        private renderer: DomainRenderer<TRendererOptions, TRenderData>,
        private options: DomainViewOptions,
        private rendererOptions: TRendererOptions) {

        super(() => this.dispose());

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(options.viewCommand, async domainUri => {
            const domainDocument = await getDomainDocument(domainUri);
            if (domainDocument) {
                return this.revealOrCreatePreview(domainDocument, ViewColumn.Beside).catch(showError);
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(options.insetViewCommand, async (domainUri: Uri, line: number) => {
            if (window.activeTextEditor && domainUri && line) {
                if (domainUri.toString() === window.activeTextEditor.document.uri.toString()) {
                    this.showInset(window.activeTextEditor, line, options.insetHeight).catch(showError);
                }
            }
        }));

        codePddlWorkspace.pddlWorkspace.on(PddlWorkspace.UPDATED, (fileInfo: FileInfo) => {
            if (fileInfo.isDomain()) {
                this.refreshDomain(fileInfo as DomainInfo);
            }
        });
    }

    async refreshDomain(domainInfo: DomainInfo): Promise<void> {
        const domainUri = toUri(domainInfo.fileUri);
        // if no panel was created, skip
        if (!this.webviewPanels.get(domainUri) && !this.webviewInsets.get(domainUri)) { return; }

        let panelsToRefresh: DomainViewPanel[] = [];

        // update the panel
        const panel = this.webviewPanels.get(domainUri);
        if (panel) {
            panelsToRefresh.push(panel);
        }

        // update all the insets
        const insets = this.webviewInsets.get(domainUri);
        if (insets) {
            panelsToRefresh = panelsToRefresh.concat([...insets.values()]);
        }

        panelsToRefresh.forEach(async panel => {
            panel.setDomain(domainInfo);
            await this.refreshPanelContent(panel);
        });

        if (panelsToRefresh.length > 0) {
            this._onDidChangeCodeLenses.fire();
        }
    }

    private refreshPanel(panel: DomainViewPanel): void {
        if (panel.getNeedsRebuild() && panel.getPanel().isVisible()) {
            this.refreshPanelContent(panel);
        }
    }

    async setup(previewPanel: DomainViewPanel, domainInfo: DomainInfo): Promise<void> {
        if (!previewPanel.getPanel().html) {
            previewPanel.getPanel().html = "Please wait...";
        }
        previewPanel.setNeedsRebuild(false);
        previewPanel.getPanel().html =
            await this.generateHtml(previewPanel);

        previewPanel.setDomain(domainInfo);
    }

    async refreshPanelContent(previewPanel: DomainViewPanel): Promise<boolean> {
        previewPanel.setNeedsRebuild(false);
        return this.updateContentData(previewPanel.getDomain(), previewPanel);
    }

    async showInset(editor: TextEditor, line: number, height: number): Promise<void> {
        let domainInfo = await this.parseDomain(editor.document);
        if (!domainInfo) { return; }

        let domainUri = editor.document.uri;
        let insets = this.webviewInsets.get(domainUri);
        if (!insets || !insets.get(editor)) {

            let newInitInset = window.createWebviewTextEditorInset(
                editor,
                line,
                height,
                this.options.webviewOptions
            );
            newInitInset.onDidDispose(() => {
                let insets = this.webviewInsets.get(domainUri);
                insets?.delete(editor);
            });
            
            let domainViewPanel = new DomainViewPanel(domainUri, new WebviewInsetAdapter(newInitInset));
            if (!insets) {
                insets = new Map<TextEditor, DomainViewPanel>();
                this.webviewInsets.set(domainUri, insets);
            }
            insets.set(editor, domainViewPanel);
            newInitInset.webview.onDidReceiveMessage(e => this.handleMessageCore(domainViewPanel, e), undefined, this.context.subscriptions);
            await this.setup(domainViewPanel, domainInfo);
        }
    }

    async expandInset(panel: DomainViewPanel): Promise<void> {
        panel.getPanel().dispose();
        if (panel.getPanel().isInset) {
            let inset = panel.getPanel() as WebviewInsetAdapter;
            
            this.showInset(inset.inset.editor, inset.inset.line, inset.inset.height * 2);
        }
    }

    async revealOrCreatePreview(doc: TextDocument, displayColumn: ViewColumn): Promise<void> {
        const domainInfo = await this.parseDomain(doc);
        if (!domainInfo) { return; }

        let previewPanel = this.webviewPanels.get(doc.uri);

        if (previewPanel && previewPanel.getPanel().canReveal()) {
            previewPanel.getPanel().reveal(displayColumn);
            await this.refreshDomain(domainInfo);
        }
        else {
            previewPanel = await this.createPreviewPanelForDocument(domainInfo, displayColumn);
            this.webviewPanels.set(doc.uri, previewPanel);
        }
    }

    protected abstract createPreviewPanelTitle(uri: Uri): string;

    async createPreviewPanelForDocument(domainInfo: DomainInfo, displayColumn: ViewColumn): Promise<DomainViewPanel> {
        const domainUri = toUri(domainInfo.fileUri);
        const previewTitle = this.createPreviewPanelTitle(domainUri);
        const webViewPanel = window.createWebviewPanel(this.options.webviewType, previewTitle, displayColumn, this.options.webviewOptions);

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath("images/icon.png"));

        const panel = new DomainViewPanel(domainUri, new WebviewPanelAdapter(webViewPanel));

        // when the user closes the tab, remove the panel
        webViewPanel.onDidDispose(() => this.webviewPanels.delete(domainUri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        webViewPanel.onDidChangeViewState(() => this.refreshPanel(panel));

        webViewPanel.webview.onDidReceiveMessage(e => this.handleMessageCore(panel, e), undefined, this.context.subscriptions);

        await this.setup(panel, domainInfo);

        return panel;
    }

    private async generateHtml(viewPanel: DomainViewPanel): Promise<string> {
        const error = viewPanel.getError();
        if (error) {
            return error.message;
        }
        else {
            return getWebViewHtml(createPddlExtensionContext(this.context), {
                fonts: [
                    Uri.file(path.join("..", "..", "..", COMMON_FOLDER, "codicon.ttf"))
                ],
                relativePath: this.options.content,
                htmlFileName: this.options.webviewHtmlPath
            }, viewPanel.getPanel().webview);
        }
    }

    private async updateContentData(domain: DomainInfo, panel: DomainViewPanel): Promise<boolean> {
        return panel.postMessage('updateContent', {
            data: this.renderer.render(this.context, domain, this.rendererOptions)
        });
    }

    async parseDomain(domainDocument: TextDocument): Promise<DomainInfo | undefined> {
        const fileInfo = await this.codePddlWorkspace.upsertAndParseFile(domainDocument);

        if (!fileInfo?.isDomain()) {
            return undefined;
        }

        return fileInfo as DomainInfo;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected handleMessage(_panel: DomainViewPanel, _message: {command: string }): boolean {
        return false;
    }

    protected async handleOnLoad(panel: DomainViewPanel): Promise<boolean> {
        await panel.postMessage('setIsInset', { value: panel.getPanel().isInset });
        return await this.refreshPanelContent(panel);
    }

    private async handleMessageCore(panel: DomainViewPanel, message: {command: string }): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'close':
                panel.close();
                break;
            case 'expand':
                this.expandInset(panel);
                break;
            case 'onload':
                await this.handleOnLoad(panel);
                break;
            default:
                if (!this.handleMessage(panel, message)) {
                    console.warn('Unexpected command: ' + message.command);
                }
        }
    }

}

async function getDomainDocument(dotDocumentUri: Uri | undefined): Promise<TextDocument | undefined> {
    if (dotDocumentUri) {
        return await workspace.openTextDocument(dotDocumentUri);
    } else {
        if (window.activeTextEditor !== undefined && isPddl(window.activeTextEditor.document)) {
            return window.activeTextEditor.document;
        }
        else {
            return undefined;
        }
    }
}

export interface DomainRendererOptions {
    displayWidth?: number;
    selfContained?: boolean;
}

export interface DomainViewOptions {
    /** Relative folder containing files used by the HTML content. */
    content: string;

    viewCommand: string;
    insetViewCommand: string;
    insetHeight: number;

    webviewType: string;
    webviewOptions: WebviewPanelOptions & WebviewOptions;
    webviewHtmlPath: string;
}

export interface DomainRenderer<TOptions, TData> {
    render(context: ExtensionContext, domain: DomainInfo, options: TOptions): TData;
}

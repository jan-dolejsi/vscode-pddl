/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, Uri,
    ViewColumn, ExtensionContext, TextDocument, Disposable, TextDocumentChangeEvent, Event, EventEmitter, TextEditor, WebviewOptions, WebviewPanelOptions
} from 'vscode';

import { isPddl, getDomainFileForProblem } from '../workspace/workspaceUtils';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';

import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { getWebViewHtml, createPddlExtensionContext, UriMap } from '../utils';
import { ProblemInitPanel } from './ProblemInitPanel';
import { ProblemRenderer, WebviewPanelAdapter, WebviewAdapter, WebviewInsetAdapter } from './view';

/**
 * Base-class for different problem views.
 */
export abstract class ProblemView<TRendererOptions, TRenderData> extends Disposable {

    private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeCodeLenses?: Event<void> = this._onDidChangeCodeLenses.event;

    private subscribedDocumentUris: string[] = [];

    private webviewPanels = new UriMap<ProblemInitPanel>();
    private initInsets = new UriMap<Map<TextEditor, ProblemInitPanel>>();
    private timeout: NodeJS.Timer;

    constructor(private context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace,
        private renderer: ProblemRenderer<TRendererOptions, TRenderData>,
        private options: ProblemViewOptions,
        private rendererOptions: TRendererOptions) {

        super(() => this.dispose());

        context.subscriptions.push(commands.registerCommand(options.viewCommand, async problemUri => {
            let problemDocument = await getProblemDocument(problemUri);
            if (problemDocument) {
                return this.revealOrCreatePreview(problemDocument, ViewColumn.Beside);
            }
        }));

        context.subscriptions.push(commands.registerCommand(options.insetViewCommand, async (problemUri: Uri, line: number) => {
            if (window.activeTextEditor && problemUri && line) {
                if (problemUri.toString() === window.activeTextEditor.document.uri.toString()) {
                    this.showInset(window.activeTextEditor, problemUri, line, options.insetHeight);
                }
            }
        }));

        // When the active document is changed set the provider for rebuild
        // this only occurs after an edit in a document
        context.subscriptions.push(workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
            if (isPddl(e.document)) {
                this.setNeedsRebuild(e.document);
            }
            if (this.isSubscribed(e.document)) {
                this._onDidChangeCodeLenses.fire();
            }
        }));
    }

    protected subscribe(document: TextDocument) {
        if (!this.subscribedDocumentUris.includes(document.uri.toString())) {
            this.subscribedDocumentUris.push(document.uri.toString());
        }
    }

    private isSubscribed(document: TextDocument) {
        return this.subscribedDocumentUris.includes(document.uri.toString());
    }

    async setNeedsRebuild(problemDocument: TextDocument): Promise<void> {
        let panel = this.webviewPanels.get(problemDocument.uri);

        if (panel) {
            try {
                let [domain, problem] = await this.getProblemAndDomain(problemDocument);
                panel.setDomainAndProblem(domain, problem);
            }
            catch (ex) {
                panel.setError(ex);
            }

            this.resetTimeout();
        }

        let insets = this.initInsets.get(problemDocument.uri);
        if (insets) {
            try {
                let [domain, problem] = await this.getProblemAndDomain(problemDocument);
                [...insets.values()].forEach(panel => panel.setDomainAndProblem(domain, problem));
            }
            catch (ex) {
                [...insets.values()].forEach(panel => panel.setError(ex));
            }

            this.resetTimeout();
        }
    }

    resetTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => this.refresh(), 1000);
    }

    dispose(): void {
        clearTimeout(this.timeout);
    }

    refresh(): void {
        this.webviewPanels.forEach(async (panel) => {
            this.refreshPanel(panel);
        });

        this.initInsets.forEach(async (insets) => {
            insets.forEach(panel => {
                this.refreshPanel(panel);
            });
        });
    }

    private refreshPanel(panel: ProblemInitPanel) {
        if (panel.getNeedsRebuild() && panel.getPanel().isVisible()) {
            this.updateContent(panel);
        }
    }

    async updateContent(previewPanel: ProblemInitPanel) {
        if (!previewPanel.getPanel().html) {
            previewPanel.getPanel().html = "Please wait...";
        }
        previewPanel.setNeedsRebuild(false);
        previewPanel.getPanel().html = await this.generateHtml(previewPanel.getError());
        this.updateContentData(previewPanel.getDomain(), previewPanel.getProblem(), previewPanel.getPanel());
    }

    async showInset(editor: TextEditor, problemUri: Uri, line: number, height: number): Promise<void> {
        let insets = this.initInsets.get(problemUri);
        if (!insets || !insets.get(editor)) {

            let newInitInset = window.createWebviewTextEditorInset(
                editor,
                line,
                height,
                this.options.webviewOptions
            );
            newInitInset.onDidDispose(() => {
                let insets = this.initInsets.get(problemUri);
                insets.delete(editor);
            });
            let problemInitPanel = new ProblemInitPanel(problemUri, new WebviewInsetAdapter(newInitInset));
            if (!insets) {
                insets = new Map<TextEditor, ProblemInitPanel>();
                this.initInsets.set(problemUri, insets);
            }
            insets.set(editor, problemInitPanel);
            newInitInset.webview.onDidReceiveMessage(e => this.handleMessage(problemInitPanel, e), undefined, this.context.subscriptions);
        }
        await this.setNeedsRebuild(await workspace.openTextDocument(problemUri));
    }

    async expandInset(panel: ProblemInitPanel): Promise<void> {
        panel.getPanel().dispose();
        if (panel.getPanel().isInset) {
            let inset = panel.getPanel() as WebviewInsetAdapter;
            
            this.showInset(inset.inset.editor, Uri.parse(panel.getProblem().fileUri), inset.inset.line, inset.inset.height * 2);
        }
    }

    async revealOrCreatePreview(doc: TextDocument, displayColumn: ViewColumn): Promise<void> {
        let previewPanel = this.webviewPanels.get(doc.uri);

        if (previewPanel && previewPanel.getPanel().canReveal()) {
            previewPanel.getPanel().reveal(displayColumn);
        }
        else {
            previewPanel = this.createPreviewPanelForDocument(doc, displayColumn);
            this.webviewPanels.set(doc.uri, previewPanel);
        }

        await this.setNeedsRebuild(doc);
    }

    protected abstract createPreviewPanelTitle(doc: TextDocument): string;

    createPreviewPanelForDocument(doc: TextDocument, displayColumn: ViewColumn): ProblemInitPanel {
        let previewTitle = this.createPreviewPanelTitle(doc);
        let webViewPanel = window.createWebviewPanel(this.options.webviewType, previewTitle, displayColumn, this.options.webviewOptions);

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath("images/icon.png"));

        let panel = new ProblemInitPanel(doc.uri, new WebviewPanelAdapter(webViewPanel));

        // when the user closes the tab, remove the panel
        webViewPanel.onDidDispose(() => this.webviewPanels.delete(doc.uri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        webViewPanel.onDidChangeViewState(_ => this.refreshPanel(panel));

        webViewPanel.webview.onDidReceiveMessage(e => this.handleMessageCore(panel, e), undefined, this.context.subscriptions);

        return panel;
    }

    private async generateHtml(error?: Error): Promise<string> {
        if (error) {
            return error.message;
        }
        else {
            let html = getWebViewHtml(createPddlExtensionContext(this.context), this.options.content, this.options.webviewHtmlPath);
            return html;
        }
    }

    private updateContentData(domain: DomainInfo, problem: ProblemInfo, panel: WebviewAdapter) {
        panel.postMessage({
            command: 'updateContent', data: this.renderer.render(this.context, problem, domain, this.rendererOptions)
        });
        panel.postMessage({ command: 'setIsInset', value: panel.isInset });
    }

    async parseProblem(problemDocument: TextDocument): Promise<ProblemInfo | undefined> {
        let fileInfo = await this.codePddlWorkspace.upsertAndParseFile(problemDocument);

        if (!fileInfo.isProblem()) {
            return undefined;
        }

        return <ProblemInfo>fileInfo;
    }

    async getProblemAndDomain(problemDocument: TextDocument): Promise<[DomainInfo, ProblemInfo] | undefined> {
        try {
            let fileInfo = await this.parseProblem(problemDocument);

            if (!fileInfo) {
                return undefined;
            }

            let problemInfo = <ProblemInfo>fileInfo;

            let domainInfo = getDomainFileForProblem(problemInfo, this.codePddlWorkspace);

            return [domainInfo, problemInfo];
        }
        catch (ex) {
            throw new Error("No domain associated to problem.");
        }
    }

    protected handleMessage(_panel: ProblemInitPanel, _message: any): boolean {
        return false;
    }


    private handleMessageCore(panel: ProblemInitPanel, message: any): void {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'close':
                panel.close();
                break;
            case 'expand':
                this.expandInset(panel);
                break;
            default:
                if (!this.handleMessage(panel, message)) {
                    console.warn('Unexpected command: ' + message.command);
                }
        }
    }

}

async function getProblemDocument(dotDocumentUri: Uri | undefined): Promise<TextDocument> {
    if (dotDocumentUri) {
        return await workspace.openTextDocument(dotDocumentUri);
    } else {
        if (window.activeTextEditor !== null && isPddl(window.activeTextEditor.document)) {
            return window.activeTextEditor.document;
        }
        else {
            return undefined;
        }
    }
}

export interface ProblemViewOptions {
    /** Relative folder containing files used by the HTML content. */
    content: string;

    viewCommand: string;
    insetViewCommand: string;
    insetHeight: number;

    webviewType: string;
    webviewOptions: WebviewPanelOptions & WebviewOptions;
    webviewHtmlPath: string;
}
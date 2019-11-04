/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, Uri,
    ViewColumn, ExtensionContext, TextDocument, Disposable, Event, EventEmitter, TextEditor, WebviewOptions, WebviewPanelOptions, CodeLens, Range, Command
} from 'vscode';

import { isPddl, getDomainFileForProblem } from '../workspace/workspaceUtils';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { ProblemInfo } from '../../../common/src/ProblemInfo';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { FileInfo } from '../../../common/src/FileInfo';

import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { getWebViewHtml, createPddlExtensionContext, UriMap, showError } from '../utils';
import { ProblemViewPanel } from './ProblemViewPanel';
import { ProblemRenderer, WebviewPanelAdapter, WebviewAdapter } from './view';

/**
 * Base-class for different problem views.
 */
export abstract class ProblemView<TRendererOptions, TRenderData> extends Disposable {

    private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeCodeLenses?: Event<void> = this._onDidChangeCodeLenses.event;

    private webviewPanels = new UriMap<ProblemViewPanel>();
    private webviewInsets = new UriMap<Map<TextEditor, ProblemViewPanel>>();

    constructor(private context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace,
        private renderer: ProblemRenderer<TRendererOptions, TRenderData>,
        private options: ProblemViewOptions,
        private rendererOptions: TRendererOptions) {

        super(() => this.dispose());

        context.subscriptions.push(commands.registerCommand(options.viewCommand, async problemUri => {
            let problemDocument = await getProblemDocument(problemUri);
            if (problemDocument) {
                return this.revealOrCreatePreview(problemDocument, ViewColumn.Beside).catch(showError);
            }
        }));

        context.subscriptions.push(commands.registerCommand(options.insetViewCommand, async (problemUri: Uri, line: number) => {
            if (window.activeTextEditor && problemUri && line) {
                if (problemUri.toString() === window.activeTextEditor.document.uri.toString()) {
                    this.showInset(window.activeTextEditor, line, options.insetHeight).catch(showError);
                }
            }
        }));

        codePddlWorkspace.pddlWorkspace.on(PddlWorkspace.UPDATED, (fileInfo: FileInfo) => {
            if (fileInfo.isProblem()) {
                this.refreshProblem(<ProblemInfo>fileInfo);
            }
            else if (fileInfo.isDomain()) {
                this.refreshDomainProblems(<DomainInfo>fileInfo);
            }
        });
    }

    async refreshDomainProblems(domainInfo: DomainInfo): Promise<void> {
        let promises = this.codePddlWorkspace.pddlWorkspace
            .getProblemFiles(domainInfo)
            .map(async problemInfo => await this.refreshProblem(problemInfo));
        
        await Promise.all(promises);
    }

    async refreshProblem(problemInfo: ProblemInfo) {
        const problemUri = Uri.parse(problemInfo.fileUri);
        // if no panel was created, skip
        if (!this.webviewPanels.get(problemUri) && !this.webviewInsets.get(problemUri)) { return; }

        let error: Error;
        let domainInfo: DomainInfo;
        try {
            domainInfo = getDomainFileForProblem(problemInfo, this.codePddlWorkspace);
        }
        catch (ex) {
            error = ex;
        }

        let panelsToRefresh: ProblemViewPanel[] = [];
    
        // update the panel
        let panel = this.webviewPanels.get(problemUri);
        if (panel) {
            panelsToRefresh.push(panel);
        }

        // update all the insets
        let insets = this.webviewInsets.get(problemUri);
        if (insets) {
            panelsToRefresh = panelsToRefresh.concat([...insets.values()]);
        }

        panelsToRefresh.forEach(async panel => {
            if (!error) {
                panel.setDomainAndProblem(domainInfo, problemInfo);
            }
            else {
                panel.setError(error);
            }
            await this.refreshPanelContent(panel);
        });

        if (panelsToRefresh.length > 0) {
            this._onDidChangeCodeLenses.fire();
        }
    }

    private refreshPanel(panel: ProblemViewPanel) {
        if (panel.getNeedsRebuild() && panel.getPanel().isVisible()) {
            this.refreshPanelContent(panel);
        }
    }

    async setup(previewPanel: ProblemViewPanel, problemInfo: ProblemInfo) {
        if (!previewPanel.getPanel().html) {
            previewPanel.getPanel().html = "Please wait...";
        }
        previewPanel.setNeedsRebuild(false);
        previewPanel.getPanel().html = await this.generateHtml(previewPanel.getError());

        try {
            let domainInfo = getDomainFileForProblem(problemInfo, this.codePddlWorkspace);
            previewPanel.setDomainAndProblem(domainInfo, problemInfo);
        }
        catch (ex) {
            previewPanel.setError(ex);
        }
    }

    async refreshPanelContent(previewPanel: ProblemViewPanel): Promise<boolean> {
        previewPanel.setNeedsRebuild(false);
        return this.updateContentData(previewPanel.getDomain(), previewPanel.getProblem(), previewPanel.getPanel());
    }

    async showInset(editor: TextEditor, line: number, height: number): Promise<void> {
        console.log(`todo: revealOrCreateInset ${editor} line ${line} height ${height}`);
    }

    async expandInset(panel: ProblemViewPanel): Promise<void> {
        console.log(`todo: expand inset ${panel.uri}`);
    }

    async revealOrCreatePreview(doc: TextDocument, displayColumn: ViewColumn): Promise<void> {
        let problemInfo = await this.parseProblem(doc);
        if (!problemInfo) { return; }

        let previewPanel = this.webviewPanels.get(doc.uri);

        if (previewPanel && previewPanel.getPanel().canReveal()) {
            previewPanel.getPanel().reveal(displayColumn);
            await this.refreshProblem(problemInfo);
        }
        else {
            previewPanel = await this.createPreviewPanelForDocument(problemInfo, displayColumn);
            this.webviewPanels.set(doc.uri, previewPanel);
        }
    }

    protected abstract createPreviewPanelTitle(uri: Uri): string;

    async createPreviewPanelForDocument(problemInfo: ProblemInfo, displayColumn: ViewColumn): Promise<ProblemViewPanel> {
        let problemUri = Uri.parse(problemInfo.fileUri);
        let previewTitle = this.createPreviewPanelTitle(problemUri);
        let webViewPanel = window.createWebviewPanel(this.options.webviewType, previewTitle, displayColumn, this.options.webviewOptions);

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath("images/icon.png"));

        let panel = new ProblemViewPanel(problemUri, new WebviewPanelAdapter(webViewPanel));

        // when the user closes the tab, remove the panel
        webViewPanel.onDidDispose(() => this.webviewPanels.delete(problemUri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        webViewPanel.onDidChangeViewState(_ => this.refreshPanel(panel));

        webViewPanel.webview.onDidReceiveMessage(e => this.handleMessageCore(panel, e), undefined, this.context.subscriptions);

        await this.setup(panel, problemInfo);

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

    private async updateContentData(domain: DomainInfo, problem: ProblemInfo, panel: WebviewAdapter): Promise<boolean> {
        return panel.postMessage({
            command: 'updateContent', data: this.renderer.render(this.context, problem, domain, this.rendererOptions)
        });
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

    protected handleMessage(_panel: ProblemViewPanel, _message: any): boolean {
        return false;
    }


    private async handleMessageCore(panel: ProblemViewPanel, message: any): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'close':
                panel.close();
                break;
            case 'expand':
                this.expandInset(panel);
                break;
            case 'onload':
                await panel.getPanel().postMessage({ command: 'setIsInset', value: panel.getPanel().isInset });
                await this.refreshPanelContent(panel);
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

export interface ProblemRendererOptions {
    displayWidth?: number;
    selfContained?: boolean;
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

export class DocumentCodeLens extends CodeLens {
    constructor(private document: TextDocument, range: Range, command?: Command) {
        super(range, command);
    }

    getDocument(): TextDocument {
        return this.document;
    }
}

export class DocumentInsetCodeLens extends DocumentCodeLens {
    constructor(document: TextDocument, range: Range, private line: number, command?: Command) {
        super(document, range, command);
    }

    getLine(): number {
        return this.line;
    }
}

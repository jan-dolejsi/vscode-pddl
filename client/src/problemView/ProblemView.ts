/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, Uri,
    ViewColumn, ExtensionContext, TextDocument, WebviewPanel, Disposable, TextDocumentChangeEvent, CodeLensProvider, Event, CodeLens, CancellationToken, Command, Range, EventEmitter, Webview
} from 'vscode';

import { isPddl, getDomainFileForProblem } from '../workspace/workspaceUtils';
import { DomainInfo, TypeObjects } from '../../../common/src/DomainInfo';
import { ProblemInfo, TimedVariableValue } from '../../../common/src/ProblemInfo';
import { Variable } from '../../../common/src/FileInfo';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { PddlTokenType } from '../../../common/src/PddlTokenizer';
import { nodeToRange, getWebViewHtml, createPddlExtensionContext } from '../utils';
import { getObjectsInheritingFrom, getTypesInheritingFromPlusSelf } from '../../../common/src/typeInheritance';
import { Util } from '../../../common/src/util';

const CONTENT = 'problemView';

const PDDL_PROBLEM_INIT_PREVIEW_COMMAND = "pddl.problem.init.preview";
export class ProblemView extends Disposable implements CodeLensProvider {

    private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeCodeLenses?: Event<void> = this._onDidChangeCodeLenses.event;
    private subscribedDocumentUris: string[] = [];

    webviewPanels = new Map<Uri, ProblemInitPanel>();
    timeout: NodeJS.Timer;

    constructor(private context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace) {
        super(() => this.dispose());

        context.subscriptions.push(commands.registerCommand(PDDL_PROBLEM_INIT_PREVIEW_COMMAND, async problemUri => {
            let dotDocument = await getProblemDocument(problemUri);
            if (dotDocument) {
                console.log('Revealing problem init...');
                return this.revealOrCreatePreview(dotDocument, ViewColumn.Beside);
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

        context.subscriptions.push(workspace.onDidSaveTextDocument((doc: TextDocument) => {
            if (isPddl(doc)) {
                this.setNeedsRebuild(doc);
            }
        }));
    }

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) { return null; }
        let problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return null; }
        if (!problem) { return []; }

        let defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        let initNode = defineNode.getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\s*:init/i);
        this.subscribe(document);
        return [new DocumentCodeLens(document, nodeToRange(document, initNode))];
    }

    async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
        if (!(codeLens instanceof DocumentCodeLens)) {
            return null;
        }
        if (token.isCancellationRequested) { return null; }
        let [domain] = await this.getProblemAndDomain(codeLens.getDocument());
        this.subscribe(codeLens.getDocument());
        if (token.isCancellationRequested) { return null; }

        let hasSymmetric2DPredicates = domain.getPredicates()
            .some(p => ProblemInitRenderer.is2DSymmetric(p));

        let hasSymmetric2DFunctions = domain.getFunctions()
            .some(p => ProblemInitRenderer.is2DSymmetric(p));

        if (hasSymmetric2DFunctions || hasSymmetric2DPredicates) {
            codeLens.command = { command: PDDL_PROBLEM_INIT_PREVIEW_COMMAND, title: 'View' };
        }
        return codeLens;
    }

    private subscribe(document: TextDocument) {
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
    }

    resetTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => this.rebuild(), 1000);
    }

    dispose(): void {
        clearTimeout(this.timeout);
    }

    rebuild(): void {
        this.webviewPanels.forEach(async (panel) => {
            if (panel.getNeedsRebuild() && panel.getPanel().visible) {
                this.updateContent(panel);
            }
        });
    }

    async updateContent(previewPanel: ProblemInitPanel) {
        if (!previewPanel.getPanel().webview.html) {
            previewPanel.getPanel().webview.html = "Please wait...";
        }
        previewPanel.setNeedsRebuild(false);
        previewPanel.getPanel().webview.html = await this.generateHtml(previewPanel.getError());
        this.updateContentData(previewPanel.getDomain(), previewPanel.getProblem(), previewPanel.getPanel().webview);
    }

    async revealOrCreatePreview(doc: TextDocument, displayColumn: ViewColumn): Promise<void> {
        let previewPanel = this.webviewPanels.get(doc.uri);

        if (previewPanel) {
            previewPanel.reveal(displayColumn);
        }
        else {
            previewPanel = this.createPreviewPanelForDocument(doc, displayColumn);
            this.webviewPanels.set(doc.uri, previewPanel);
        }

        await this.setNeedsRebuild(doc);
    }

    createPreviewPanelForDocument(doc: TextDocument, displayColumn: ViewColumn): ProblemInitPanel {
        let previewTitle = `Preview '${path.basename(doc.uri.fsPath)}'`;

        return this.createPreviewPanel(previewTitle, doc.uri, displayColumn);
    }

    createPreviewPanel(previewTitle: string, uri: Uri, displayColumn: ViewColumn): ProblemInitPanel {
        let webViewPanel = window.createWebviewPanel('problemPreview', previewTitle, displayColumn, {
            enableFindWidget: true,
            // enableCommandUris: true,
            retainContextWhenHidden: true,
            enableScripts: true,
            localResourceRoots: [
                Uri.file(this.context.extensionPath)
            ]
        });

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath("images/icon.png"));

        let previewPanel = new ProblemInitPanel(uri, webViewPanel);

        // when the user closes the tab, remove the panel
        previewPanel.getPanel().onDidDispose(() => this.webviewPanels.delete(uri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        previewPanel.getPanel().onDidChangeViewState(_ => this.rebuild());

        previewPanel.getPanel().webview.onDidReceiveMessage(e => this.handleMessage(previewPanel, e), undefined, this.context.subscriptions);

        return previewPanel;
    }

    private async generateHtml(error?: Error): Promise<string> {
        if (error) {
            return error.message;
        }
        else {
            let html = getWebViewHtml(createPddlExtensionContext(this.context), CONTENT, 'problemView.html');
            return html;
        }
    }

    private updateContentData(domain: DomainInfo, problem: ProblemInfo, webview: Webview) {
        let renderer = new ProblemInitRenderer(this.context, domain, problem, { displayWidth: 100 });
        webview.postMessage({
            command: 'updateGraph', data: {
                nodes: renderer.getNodes(),
                relationships: renderer.getRelationships()
            }
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

    handleMessage(previewPanel: ProblemInitPanel, message: any): void {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'commandXYZ':
                commands.executeCommand('command...', previewPanel.getProblem());
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
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

class ProblemInitPanel {

    needsRebuild: boolean;
    problem: ProblemInfo;
    error: Error;
    domain: DomainInfo;

    constructor(public uri: Uri, private panel: WebviewPanel) { }

    setDomainAndProblem(domain: DomainInfo, problem: ProblemInfo): void {
        this.domain = domain;
        this.problem = problem;
        this.error = null;
        this.setNeedsRebuild(true);
    }

    setError(ex: Error): void {
        this.error = ex;
    }

    getError(): Error {
        return this.error;
    }

    getDomain(): DomainInfo {
        return this.domain;
    }

    getProblem(): ProblemInfo {
        return this.problem;
    }

    reveal(displayColumn?: ViewColumn): void {
        this.panel.reveal(displayColumn);
    }

    setNeedsRebuild(needsRebuild: boolean) {
        this.needsRebuild = needsRebuild;
    }

    getNeedsRebuild(): boolean {
        return this.needsRebuild;
    }

    getPanel(): WebviewPanel {
        return this.panel;
    }
}

class ProblemInitRenderer {
    
    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    constructor(private context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, private options: ProblemInitViewOptions) {
        console.log(`${this.context}, ${this.options}`);
        let symmetric2dPredicates = domain.getPredicates()
            .filter(v => ProblemInitRenderer.is2DSymmetric(v));

        let symmetric2dFunctions = domain.getFunctions()
            .filter(v => ProblemInitRenderer.is2DSymmetric(v));

        let symmetric2dVariables = symmetric2dFunctions.concat(symmetric2dPredicates);
        
        let relatableTypes: string[] = Util.distinct(symmetric2dVariables
            .map(v => v.parameters[0].type));

        let relatableAndInheritedTypes = Util.distinct(Util.flatMap(relatableTypes.map(type => getTypesInheritingFromPlusSelf(type, this.domain.getTypeInheritance()))));

        relatableAndInheritedTypes.forEach(type => this.getObjects(type).forEach(obj => this.addNode(obj)));

        let symmetric2dInits = problem.getInits()
            .filter(init => symmetric2dVariables.some(v => v.matchesShortNameCaseInsensitive(init.getLiftedVariableName())));
        
        symmetric2dInits.forEach(init => this.addRelationship(init));
    }

    getObjects(type: string) {
        return getObjectsInheritingFrom(
            TypeObjects.concatObjects(this.domain.getConstants(), this.problem.getObjectsPerType()),
            type,
            this.domain.getTypeInheritance());
    }

    private addNode(obj: string): void {
        if (!this.nodes.has(obj)) { this.nodes.set(obj, this.nodes.size+1); }
    }

    addRelationship(initialValue: TimedVariableValue): void {
        this.relationships.push(this.toEdge(initialValue));
    }

    getNodes(): NetworkNode[] {
        return [...this.nodes.entries()].map(entry => this.toNode(entry));
    }

    toNode(entry: [string, number]): NetworkNode {
        let [entryLabel, entryId] = entry;
        return { id: entryId, label: entryLabel };
    }

    toEdge(initialValue: TimedVariableValue): NetworkEdge {
        let variableNameParts = initialValue.getVariableName().split(' ');
        let fromName = variableNameParts[1];
        let toName = variableNameParts[2];
        let label = variableNameParts[0];

        if (variableNameParts.length > 3) {
            // the variable had more than 2 parameters
            label += ' ' + variableNameParts.slice(3).join(' ');
        }
        if (!(initialValue.getValue() === true)) {
            // this is a fluent! include the value
            label += `=${initialValue.getValue()}`;
        }
        if (initialValue.getTime() > 0) {
            // this is a timed-initial literal/fluent
            label += ' @ ' + initialValue.getTime();
        }
        return { from: this.nodes.get(fromName), to: this.nodes.get(toName), label: label };
    }

    getRelationships(): NetworkEdge[] {
        return this.relationships;
    }

    /**
     * Tests whether the predicate/function has two parameters of the same type.
     * @param variable predicate/function to test
     */
    static is2DSymmetric(variable: Variable): unknown {
        return variable.parameters.length >= 2
            && variable.parameters[0].type === variable.parameters[1].type;
    }
}

interface ProblemInitViewOptions {
    displayWidth: number;
    selfContained?: boolean;
}

class DocumentCodeLens extends CodeLens {
    constructor(private document: TextDocument, range: Range, command?: Command) {
        super(range, command);
    }

    getDocument(): TextDocument {
        return this.document;
    }
}

interface NetworkNode {
    id: number;
    label: string;
}

interface NetworkEdge {
    from: number;
    to: number;
    label: string;
} 
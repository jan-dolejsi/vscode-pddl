/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, Uri,
    ViewColumn, ExtensionContext, TextDocument, Disposable, TextDocumentChangeEvent, CodeLensProvider, Event, CodeLens, CancellationToken, Command, Range, EventEmitter
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
import { ProblemInitPanel } from './ProblemInitPanel';
import { ProblemRenderer, WebviewPanelAdapter, WebviewAdapter } from './view';

const CONTENT = 'problemView';

const PDDL_PROBLEM_INIT_PREVIEW_COMMAND = "pddl.problem.init.preview";
const PDDL_PROBLEM_INIT_INSET_COMMAND = "pddl.problem.init.inset";
export class ProblemView extends Disposable implements CodeLensProvider {

    private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeCodeLenses?: Event<void> = this._onDidChangeCodeLenses.event;
    private subscribedDocumentUris: string[] = [];
    private renderer = new ProblemInitRenderer();

    private webviewPanels = new Map<Uri, ProblemInitPanel>();
    private initInsets = new Map<Uri, ProblemInitPanel>();
    private timeout: NodeJS.Timer;

    constructor(private context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace) {
        super(() => this.dispose());

        context.subscriptions.push(commands.registerCommand(PDDL_PROBLEM_INIT_PREVIEW_COMMAND, async problemUri => {
            let dotDocument = await getProblemDocument(problemUri);
            if (dotDocument) {
                console.log('Revealing problem init...');
                return this.revealOrCreatePreview(dotDocument, ViewColumn.Beside);
            }
        }));

        context.subscriptions.push(commands.registerCommand(PDDL_PROBLEM_INIT_INSET_COMMAND, async (problemUri, line)  => {
            if (problemUri && line) {
                console.log('Revealing problem init inset...');
                this.revealOrCreateInset(problemUri, line);
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

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) { return null; }
        let problem = await this.parseProblem(document);
        if (token.isCancellationRequested) { return null; }
        if (!problem) { return []; }

        let defineNode = problem.syntaxTree.getDefineNodeOrThrow();
        let initNode = defineNode.getFirstChildOrThrow(PddlTokenType.OpenBracketOperator, /\s*:init/i);
        this.subscribe(document);
        return [
            new DocumentCodeLens(document, nodeToRange(document, initNode))
        ];
    }

    async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
        if (!(codeLens instanceof DocumentCodeLens)) {
            return null;
        }
        if (token.isCancellationRequested) { return null; }
        let [domain] = await this.getProblemAndDomain(codeLens.getDocument());
        if (!domain) { return null; }
        if (token.isCancellationRequested) { return null; }

        if (codeLens instanceof DocumentInsetCodeLens) {
            codeLens.command = { command: PDDL_PROBLEM_INIT_INSET_COMMAND, title: 'View inset', arguments: [codeLens.getDocument().uri, codeLens.getLine()] };
            return codeLens;
        }

        codeLens.command = { command: PDDL_PROBLEM_INIT_PREVIEW_COMMAND, title: 'View', arguments: [codeLens.getDocument().uri] };
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

        let inset = this.initInsets.get(problemDocument.uri);
        if (inset) {
            try {
                let [domain, problem] = await this.getProblemAndDomain(problemDocument);
                inset.setDomainAndProblem(domain, problem);
            }
            catch (ex) {
                inset.setError(ex);
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
            if (panel.getNeedsRebuild() && panel.getPanel().isVisible()) {
                this.updateContent(panel);
            }
        });

        this.initInsets.forEach(async (inset) => {
            if (inset.getNeedsRebuild()) {
                this.updateContent(inset);
            }
        });
    }

    async updateContent(previewPanel: ProblemInitPanel) {
        if (!previewPanel.getPanel().html) {
            previewPanel.getPanel().html = "Please wait...";
        }
        previewPanel.setNeedsRebuild(false);
        previewPanel.getPanel().html = await this.generateHtml(previewPanel.getError());
        this.updateContentData(previewPanel.getDomain(), previewPanel.getProblem(), previewPanel.getPanel());
    }

    async revealOrCreateInset(problemUri: Uri, line: number): Promise<void> {
        console.log(`todo: revealOrCreateInset ${problemUri} line ${line}`);
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

    createPreviewPanelForDocument(doc: TextDocument, displayColumn: ViewColumn): ProblemInitPanel {
        let previewTitle = `:init of '${path.basename(doc.uri.fsPath)}'`;

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

        let previewPanel = new ProblemInitPanel(uri, new WebviewPanelAdapter(webViewPanel));

        // when the user closes the tab, remove the panel
        webViewPanel.onDidDispose(() => this.webviewPanels.delete(uri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        webViewPanel.onDidChangeViewState(_ => this.rebuild());

        webViewPanel.webview.onDidReceiveMessage(e => this.handleMessage(previewPanel, e), undefined, this.context.subscriptions);

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

    private updateContentData(domain: DomainInfo, problem: ProblemInfo, panel: WebviewAdapter) {
        panel.postMessage({
            command: 'updateContent', data: this.renderer.render(this.context, problem, domain, { displayWidth: 100 })
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

    handleMessage(previewPanel: ProblemInitPanel, message: any): void {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'close':
                previewPanel.close();
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

class ProblemInitRenderer implements ProblemRenderer<ProblemInitViewOptions, ProblemInitViewData> {
    render(context: ExtensionContext, problem: ProblemInfo, domain: DomainInfo, options: ProblemInitViewOptions): ProblemInitViewData {
        let renderer = new ProblemInitRendererDelegate(context, domain, problem, options);
        
        return {
            nodes: renderer.getNodes(),
            relationships: renderer.getRelationships()
        };
    }
}

interface ProblemInitViewData {
    nodes: NetworkNode[];
    relationships: NetworkEdge[];
}

class ProblemInitRendererDelegate {
    
    private nodes: Map<string, number> = new Map();
    private relationships: NetworkEdge[] = [];

    constructor(private context: ExtensionContext, private domain: DomainInfo, private problem: ProblemInfo, private options: ProblemInitViewOptions) {
        console.log(`${this.context}, ${this.options}`);
        let symmetric2dPredicates = domain.getPredicates()
            .filter(v => ProblemInitRendererDelegate.is2DSymmetric(v));

        let symmetric2dFunctions = domain.getFunctions()
            .filter(v => ProblemInitRendererDelegate.is2DSymmetric(v));

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

class DocumentInsetCodeLens extends DocumentCodeLens {
    constructor(document: TextDocument, range: Range, private line: number, command?: Command) {
        super(document, range, command);
    }

    getLine(): number {
        return this.line;
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
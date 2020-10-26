/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, Disposable, workspace, TextEditorRevealType, TextEditor, Range, Webview
} from 'vscode';
import * as path from 'path';

import { getWebViewHtml, createPddlExtensionContext } from '../utils';
import { State } from './State';
import { PlanReportGenerator } from '../planning/PlanReportGenerator';
import { StateToPlan } from './StateToPlan';
import { StateResolver } from './StateResolver';
import { ProblemInfo } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';

export class SearchDebuggerView {
    private webViewPanel: WebviewPanel | undefined;
    private subscriptions: Disposable[] = [];
    private search: StateResolver | undefined;
    private stateChangedWhileViewHidden = false;
    private stateLogFile: Uri | undefined;
    private stateLogEditor: TextEditor | undefined;
    private stateLogLineCache = new Map<string, number>();
    private domain: DomainInfo | undefined;
    private problem: ProblemInfo | undefined;

    // cached values
    private debuggerState: boolean | undefined;
    private port: number | undefined;

    constructor(private context: ExtensionContext) {
    }

    isVisible(): boolean {
        return this.webViewPanel !== undefined && this.webViewPanel.visible;
    }

    observe(search: StateResolver): void {
        this.search = search;
        // first unsubscribe from previous search
        this.subscriptions.forEach(subscription => subscription.dispose());
        this.subscriptions = [];

        this.subscriptions.push(search.onStateAdded(newState => this.addState(newState)));
        this.subscriptions.push(search.onStateUpdated(newState => this.update(newState)));
        this.subscriptions.push(search.onBetterState(betterState => this.displayBetterState(betterState)));
        this.subscriptions.push(search.onPlanFound(planStates => this.displayPlan(planStates)));
    }

    setDomainAndProblem(domain: DomainInfo, problem: ProblemInfo): void {
        this.domain = domain;
        this.problem = problem;
    }

    async showDebugView(): Promise<void> {
        if (this.webViewPanel !== undefined) {
            this.webViewPanel.reveal();
        }
        else {
            await this.createDebugView(false);
        }
    }

    async createDebugView(showOnTop: boolean): Promise<void> {
        const iconUri = this.context.asAbsolutePath('images/icon.png');

        this.webViewPanel = window.createWebviewPanel(
            "pddl.SearchDebugger",
            "Search Debugger",
            {
                viewColumn: ViewColumn.Active,
                preserveFocus: !showOnTop
            },
            {
                retainContextWhenHidden: true,
                enableFindWidget: true,
                enableCommandUris: true,
                enableScripts: true,
                localResourceRoots: [Uri.file(this.context.asAbsolutePath("views"))]
            }
        );

        const html = await this.getHtml(this.webViewPanel.webview);
        this.webViewPanel.webview.html = html;
        this.webViewPanel.iconPath = Uri.file(iconUri);

        this.webViewPanel.onDidDispose(() => this.webViewPanel = undefined, undefined, this.context.subscriptions);
        this.webViewPanel.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, this.context.subscriptions);
        this.webViewPanel.onDidChangeViewState(event => this.changedViewState(event.webviewPanel));

        this.context.subscriptions.push(this.webViewPanel); // todo: this may not be necessary
    }

    changedViewState(webViewPanel: WebviewPanel): void {
        if (webViewPanel.visible) {
            this.showDebuggerState();
            if (this.stateChangedWhileViewHidden) {
                // re-send all states
                this.showAllStates();
            }

            // reset the state
            this.stateChangedWhileViewHidden = false;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async handleMessage(message: any): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'onload':
                this.showDebuggerState();
                break;
            case 'stateSelected':
                try {
                    this.showStatePlan(message.stateId);
                    this.scrollStateLog(message.stateId);
                }
                catch (ex) {
                    window.showErrorMessage("Error while displaying state-plan: " + ex);
                }
                break;
            case 'startDebugger':
                commands.executeCommand("pddl.searchDebugger.start");
                this.stateLogLineCache.clear();
                break;
            case 'stopDebugger':
                commands.executeCommand("pddl.searchDebugger.stop");
                break;
            case 'reset':
                commands.executeCommand("pddl.searchDebugger.reset");
                break;
            case 'toggleStateLog':
                this.toggleStateLog();
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }

    readonly VIEWS = "views";
    readonly CONTENT_FOLDER = path.join(this.VIEWS, "searchview");
    readonly COMMON_FOLDER = path.join(this.VIEWS, "common");

    async getHtml(webview: Webview): Promise<string> {
        const googleCharts = Uri.parse("https://www.gstatic.com/charts/");
        return getWebViewHtml(createPddlExtensionContext(this.context), {
            relativePath: this.CONTENT_FOLDER, htmlFileName: 'search.html',
            externalImages: [Uri.parse('data:')],
            externalScripts: [googleCharts],
            externalStyles: [googleCharts],
            fonts: [
                webview.asWebviewUri(Uri.file(this.context.asAbsolutePath(path.join(this.COMMON_FOLDER, "codicon.ttf"))))
            ]
        }, webview);
    }

    setDebuggerState(on: boolean, port: number): void {
        this.debuggerState = on;
        this.port = port;
        this.showDebuggerState();
    }

    private showDebuggerState(): void {
        this.postMessage({
            command: "debuggerState", state: {
                running: this.debuggerState ? 'on' : 'off',
                port: this.port
            }
        });
    }

    addState(newState: State): void {
        new Promise(() => this.postMessage({ command: 'stateAdded', state: newState }))
            .catch(reason => console.log(reason));
    }

    update(state: State): void {
        new Promise(() => this.postMessage({ command: 'stateUpdated', state: state }))
            .catch(reason => console.log(reason));
    }

    showAllStates(): void {
        const allStates = this.search?.getStates() ?? [];
        new Promise(() => this.postMessage({ command: 'showAllStates', state: allStates }))
            .catch(reason => console.log(reason));
    }

    displayBetterState(state: State): void {
        try {
            this.showStatePlan(state.id);
        } catch (ex) {
            window.showErrorMessage(ex.message ?? ex);
        }
    }

    displayPlan(planStates: State[]): void {
        new Promise(() => this.postMessage({ command: 'showPlan', state: planStates }))
            .catch(reason => console.log(reason));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private postMessage(message: { command: string; state: any }): void {
        if (this.webViewPanel !== undefined) {
            this.webViewPanel.webview.postMessage(message);

            if (!this.webViewPanel.visible) {
                this.stateChangedWhileViewHidden = true;
            }
        }
    }

    async showStatePlan(stateId: number): Promise<void> {
        if (this.search === undefined) { return void 0; }
        if (stateId === null) { return void 0; }
        const state = this.search.getState(stateId);
        if (!state) { return; }
        const statePlan = new StateToPlan(this.domain, this.problem).convert(state);
        const planHtml = await new PlanReportGenerator(this.context,
            {
                displayWidth: 200, selfContained: false, disableLinePlots: true, disableSwimLaneView: false, disableHamburgerMenu: true,
                resourceUriConverter: this.webViewPanel.webview
            })
            .generateHtml([statePlan]);
        this.postMessage({ command: 'showStatePlan', state: planHtml });
    }

    clear(): void {
        this.postMessage({ command: 'clear', state: 'n/a' });
        this.stateLogLineCache.clear();
        this.domain = undefined;
        this.problem = undefined;
    }

    async toggleStateLog(): Promise<void> {
        if (this.stateLogFile !== undefined) {
            this.postMessage({ command: 'stateLog', state: null });
        }
        else {
            const selectedUri = await window.showOpenDialog({ canSelectMany: false, defaultUri: this.stateLogFile, canSelectFolders: false });
            if (!selectedUri) { return; }
            this.stateLogFile = selectedUri[0];
            this.stateLogEditor = await window.showTextDocument(await workspace.openTextDocument(this.stateLogFile), { preserveFocus: true, viewColumn: ViewColumn.Beside });
            this.postMessage({ command: 'stateLog', state: this.stateLogFile.fsPath });
        }
    }

    async scrollStateLog(stateId: number): Promise<void> {
        if (!this.stateLogFile || !this.stateLogEditor || !this.search) { return; }
        const state = this.search.getState(stateId);
        if (!state) { return; }

        if (this.stateLogEditor.document.isClosed) {
            this.stateLogEditor = await window.showTextDocument(this.stateLogEditor.document, ViewColumn.Beside);
        }

        if (this.stateLogLineCache.has(state.origId)) {
            const cachedLineId = this.stateLogLineCache.get(state.origId);
            if (cachedLineId) {
                this.stateLogEditor.revealRange(new Range(cachedLineId, 0, cachedLineId + 1, 0), TextEditorRevealType.AtTop);
            }
            return;
        }

        const pattern = workspace.getConfiguration("pddlSearchDebugger").get<string>("stateLogPattern", "");

        for (let lineIdx = 0; lineIdx < this.stateLogEditor.document.lineCount; lineIdx++) {
            const logLine = this.stateLogEditor.document.lineAt(lineIdx);
            const patternMatch = logLine.text.match(new RegExp(pattern));
            if (patternMatch && patternMatch[1] === state.origId) {
                this.stateLogEditor.revealRange(logLine.range, TextEditorRevealType.AtTop);
                this.stateLogLineCache.set(state.origId, lineIdx);
                break;
            }
        }
    }
}
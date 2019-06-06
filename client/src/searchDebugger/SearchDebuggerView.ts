/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, Disposable, workspace, TextEditorRevealType, TextEditor, Range
} from 'vscode';

import { getWebViewHtml } from '../utils';
import { State } from './State';
import { PlanReportGenerator } from '../planning/PlanReportGenerator';
import { StateToPlan } from './StateToPlan';
import { StateResolver } from './StateResolver';
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';

export class SearchDebuggerView {
    private webViewPanel: WebviewPanel;
    private subscriptions: Disposable[] = [];
    private search: StateResolver;
    private stateChangedWhileViewHidden: boolean;
    private stateLogFile: Uri;
    private stateLogFileEnabled: boolean;
    private stateLogEditor: TextEditor;
    private stateLogLineCache = new Map<string, number>();
    private domain: DomainInfo;
    private problem: ProblemInfo;

    // cached values
    private debuggerState: boolean;
    private port: number;

    constructor(private context: ExtensionContext) {
    }

    isVisible(): boolean {
        return this.webViewPanel && this.webViewPanel.visible;
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

    setDomainAndProblem(domain: DomainInfo, problem: ProblemInfo) {
        this.domain = domain;
        this.problem = problem;
    }

    async showDebugView(debuggerListening: boolean, port: number): Promise<void> {
        if (this.webViewPanel) {
            this.webViewPanel.reveal();
        }
        else {
            await this.createDebugView(false);
        }

        this.showDebuggerState(debuggerListening, port);
    }

    async createDebugView(showOnTop: boolean): Promise<void> {
        let html = await this.getHtml();
        let iconUri = this.context.asAbsolutePath('images/icon.png');

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
                localResourceRoots: [Uri.file(this.context.extensionPath)]
            }
        );

        this.webViewPanel.webview.html = html;
        this.webViewPanel.iconPath = Uri.file(iconUri);

        this.webViewPanel.onDidDispose(() => this.webViewPanel = undefined, undefined, this.context.subscriptions);
        this.webViewPanel.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, this.context.subscriptions);
        this.webViewPanel.onDidChangeViewState(event => this.changedViewState(event.webviewPanel));

        this.context.subscriptions.push(this.webViewPanel);
    }

    changedViewState(webViewPanel: WebviewPanel): any {
        if (webViewPanel.visible) {
            this.showDebuggerState(this.debuggerState, this.port);
            if (this.stateChangedWhileViewHidden) {
                // re-send all states
                this.showAllStates();
            }

            // reset the state
            this.stateChangedWhileViewHidden = false;
        }
    }

    async handleMessage(message: any): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
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

    CONTENT_FOLDER = "searchview";

    async getHtml(): Promise<string> {
        let html = await getWebViewHtml(this.context, this.CONTENT_FOLDER, 'search.html');
        return html;
    }

    showDebuggerState(on: boolean, port: number): void {
        this.debuggerState = on;
        this.port = port;
        this.postMessage({ command: "debuggerState", state: { running: on ? 'on' : 'off', port: port}});
    }

    addState(newState: State): void {
        new Promise(_ => this.postMessage({ command: 'stateAdded', state: newState }))
            .catch(reason => console.log(reason));
    }

    update(state: State): void {
        new Promise(_ => this.postMessage({ command: 'stateUpdated', state: state }))
            .catch(reason => console.log(reason));
    }

    showAllStates(): void {
        let allStates = this.search.getStates();
        new Promise(_ => this.postMessage({ command: 'showAllStates', state: allStates }))
            .catch(reason => console.log(reason));
    }

    displayBetterState(state: State): void {
        try {
            this.showStatePlan(state.id);
        } catch (ex) {
            window.showErrorMessage(ex);
        }
    }

    displayPlan(planStates: State[]): void {
        new Promise(_ => this.postMessage({ command: 'showPlan', state: planStates }))
            .catch(reason => console.log(reason));
    }

    private postMessage(message: { command: string; state: any; }) {
        if (this.webViewPanel) {
            this.webViewPanel.webview.postMessage(message);

            if (!this.webViewPanel.visible) {
                this.stateChangedWhileViewHidden = true;
            }
        }
    }

    async showStatePlan(stateId: number): Promise<void> {
        if (!this.search) { return void 0; }
        if (stateId === null) { return void 0; }
        let state = this.search.getState(stateId);
        let statePlan = new StateToPlan(this.domain, this.problem).convert(state);
        let planHtml = await new PlanReportGenerator(this.context,
            { displayWidth: 200, selfContained: false, disableLinePlots: true, disableSwimLaneView: false, disableHamburgerMenu: true })
            .generateHtml([statePlan]);
        this.postMessage({ command: 'showStatePlan', state: planHtml });
    }

    clear() {
        this.postMessage({ command: 'clear', state: 'n/a' });
        this.stateLogLineCache.clear();
        this.domain = null;
        this.problem = null;
    }

    async toggleStateLog(): Promise<void> {
        if (this.stateLogFileEnabled) {
            this.postMessage({ command: 'stateLog', state: null });
        }
        else {
            let selectedUri = await window.showOpenDialog({ canSelectMany: false, defaultUri: this.stateLogFile, canSelectFolders: false });
            if (!selectedUri) { return; }
            this.stateLogFile = selectedUri[0];
            this.stateLogEditor = await window.showTextDocument(await workspace.openTextDocument(this.stateLogFile), { preserveFocus: true, viewColumn: ViewColumn.Beside });
            this.postMessage({ command: 'stateLog', state: this.stateLogFile.fsPath });
        }
        this.stateLogFileEnabled = !this.stateLogFileEnabled;
    }

    async scrollStateLog(stateId: number): Promise<void> {
        if (!this.stateLogFileEnabled || !this.stateLogEditor) { return; }
        let state = this.search.getState(stateId);
        if (!state) { return; }

        if (this.stateLogEditor.document.isClosed) {
            this.stateLogEditor = await window.showTextDocument(this.stateLogEditor.document, ViewColumn.Beside);
        }

        if (this.stateLogLineCache.has(state.origId)) {
            let cachedLineId = this.stateLogLineCache.get(state.origId);
            this.stateLogEditor.revealRange(new Range(cachedLineId, 0, cachedLineId + 1, 0), TextEditorRevealType.AtTop);
            return;
        }

        let pattern = workspace.getConfiguration("pddlSearchDebugger").get<string>("stateLogPattern");

        for (let lineIdx = 0; lineIdx < this.stateLogEditor.document.lineCount; lineIdx++) {
            const logLine = this.stateLogEditor.document.lineAt(lineIdx);
            let patternMatch = logLine.text.match(new RegExp(pattern));
            if (patternMatch && patternMatch[1] === state.origId) {
                this.stateLogEditor.revealRange(logLine.range, TextEditorRevealType.AtTop);
                this.stateLogLineCache.set(state.origId, lineIdx);
                break;
            }
        }
    }
}
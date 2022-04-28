/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, Disposable, workspace, TextEditorRevealType, TextEditor, Range, Webview
} from 'vscode';
import * as path from 'path';

import { showError, ensureAbsoluteGlobalStoragePath } from '../utils';
import { StateResolver } from './StateResolver';
import { ProblemInfo, DomainInfo, utils, search, Happening } from 'pddl-workspace';
import { CONF_PDDL, DEFAULT_EPSILON, VAL_STEP_PATH, VAL_VERBOSE } from '../configuration/configuration';
import { getDomainVisualizationConfigurationDataForPlan } from '../planView/DomainVisualization';
import { PlanEvaluator } from 'ai-planning-val';
import { FinalStateData } from '../planView/model';
import { handleValStepError } from '../planView/valStepErrorHandler';
import { getWebViewHtml } from '../webviewUtils';

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
    private serializableDomain: DomainInfo | undefined;
    private serializableProblem: ProblemInfo | undefined;

    // cached values
    private debuggerState: boolean | undefined;
    private port: number | undefined;

    public static readonly COMMAND_SHOW_STATE_CONTEXT = "pddl.showStateContext";
    public static readonly COMMAND_SEARCH_DEBUGGER_START = "pddl.searchDebugger.start";
    public static readonly COMMAND_SEARCH_DEBUGGER_STOP = "pddl.searchDebugger.stop";
    public static readonly COMMAND_SEARCH_DEBUGGER_RESET = "pddl.searchDebugger.reset";

    constructor(private context: ExtensionContext) {
    }

    getDomain(): DomainInfo | undefined {
        return this.domain;
    }

    getProblem(): ProblemInfo | undefined {
        return this.problem;
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
        this.serializableDomain = undefined;
        this.serializableProblem = undefined;
    }

    getSerializableDomain(): DomainInfo | undefined {
        return this.serializableDomain ?? (this.serializableDomain = this.domain && utils.serializationUtils.makeSerializable(this.domain));
    }

    getSerializableProblem(): ProblemInfo | undefined {
        return this.serializableProblem ?? (this.serializableProblem = this.problem && utils.serializationUtils.makeSerializable(this.problem));
    }

    async showDebugView(): Promise<void> {
        if (this.webViewPanel !== undefined) {
            this.webViewPanel.reveal(undefined, true);
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

    async handleMessage(message: CommandMessage): Promise<void> {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'onload':
                this.showDebuggerState();
                break;
            case 'stateSelected':
                const stateMessage = message as StateMessage;
                try {
                    this.showStatePlan(stateMessage.stateId);
                    this.scrollStateLog(stateMessage.stateId);
                }
                catch (ex) {
                    window.showErrorMessage("Error while displaying state-plan: " + ex);
                }
                break;
            case 'stateContext':
                const stateMessage2 = message as StateMessage;
                commands.executeCommand(SearchDebuggerView.COMMAND_SHOW_STATE_CONTEXT , stateMessage2.stateId);
                break;
            case 'finalStateDataRequest': 
                const stateMessage1 = message as StateMessage;
                this.getFinalStateData(stateMessage1.stateId).catch(showError);
                break;    
            case 'startDebugger':
                commands.executeCommand(SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_START);
                this.stateLogLineCache.clear();
                break;
            case 'stopDebugger':
                commands.executeCommand(SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_STOP);
                break;
            case 'reset':
                commands.executeCommand(SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_RESET);
                break;
            case 'toggleStateLog':
                this.toggleStateLog();
                break;
            case 'revealAction':
                const actionMessage = message as ActionMessage;
                this.domain && commands.executeCommand("pddl.revealAction", this.domain.fileUri, actionMessage.action);
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }

    readonly VIEWS = "views";
    readonly STATIC_CONTENT_FOLDER = path.join(this.VIEWS, "searchview", "static");
    readonly COMMON_FOLDER = path.join(this.VIEWS, "common");

    async getHtml(webview: Webview): Promise<string> {
        const googleCharts = Uri.parse("https://www.gstatic.com/charts/");
        return getWebViewHtml(this.context, {
            relativePath: this.STATIC_CONTENT_FOLDER, htmlFileName: 'search.html',
            externalImages: [Uri.parse('data:')],
            allowUnsafeInlineScripts: true, // todo: false?
            allowUnsafeEval: true,
            externalScripts: [googleCharts],
            externalStyles: [googleCharts],
            fonts: [
                Uri.file(path.join("..", "..", "..", this.COMMON_FOLDER, "codicon.ttf"))
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

    addState(newState: search.SearchState): void {
        new Promise(() => this.postMessage({ command: 'stateAdded', state: newState }))
            .catch(reason => console.log(reason));
    }

    update(state: search.SearchState): void {
        new Promise(() => this.postMessage({ command: 'stateUpdated', state: state }))
            .catch(reason => console.log(reason));
    }

    showAllStates(): void {
        const allStates = this.search?.getStates() ?? [];
        new Promise(() => this.postMessage({ command: 'showAllStates', state: allStates }))
            .catch(reason => console.log(reason));
    }

    displayBetterState(state: search.SearchState): void {
        try {
            this.showStatePlan(state.id);
        } catch (ex: unknown) {
            window.showErrorMessage((ex as Error).message ?? ex);
        }
    }

    displayPlan(planStates: search.SearchState[]): void {
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
        if (!state || !this.webViewPanel) { return; }
        
        const statePlan = new search.SearchStateToPlan(this.getSerializableDomain(),
            this.getSerializableProblem(), DEFAULT_EPSILON).convert(state);
        
        const plansData = await getDomainVisualizationConfigurationDataForPlan(statePlan);

        this.postMessage({
            command: 'showStatePlan', state: plansData
        });
    }

    async getFinalStateData(stateId: number | null | undefined): Promise<void> {
        if (this.search === undefined) { return void 0; }
        if (stateId === null || stateId === undefined) { return void 0; }
        const state = this.search.getState(stateId);
        if (!state || !this.webViewPanel) { return; }

        const valStepPath = ensureAbsoluteGlobalStoragePath(workspace.getConfiguration(CONF_PDDL).get<string>(VAL_STEP_PATH), this.context);
        const valVerbose = workspace.getConfiguration(CONF_PDDL).get<boolean>(VAL_VERBOSE, false);

        const happenings = state.planHead.map(searchHappening => toHappening(searchHappening));

        if (this.domain && this.problem) {
            try {
                const finalStateValues = await new PlanEvaluator().evaluateHappenings(this.domain, this.problem, happenings, { valStepPath, verbose: valVerbose });

                if (finalStateValues) {

                    const data: FinalStateData = {
                        finalState: finalStateValues.map(tvv => tvv.getVariableValue()),
                        planIndex: stateId
                    };

                    this.postMessage({
                        "command": "visualizeFinalState",
                        "state": data
                    });
                }
            } catch (err) {
                console.error(err);
                if (valStepPath) {
                    handleValStepError(err, valStepPath);
                }
            }
        }
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

/**
 * Converts `SearchHappening` to `Happening`.
 * @param searchHappening plan happening that was created as a search state progression
 */
export function toHappening(searchHappening: search.SearchHappening): Happening {
    return new Happening(searchHappening.earliestTime, searchHappening.kind,
        searchHappening.actionName, searchHappening.shotCounter);
}

interface CommandMessage {
    command: string;
}

interface StateMessage extends CommandMessage {
    stateId: number;
}

interface ActionMessage extends CommandMessage {
    action: string;
}

// todo: handle Home / End keyboard buttons to move to initial state and goal state (when there are multiple goal states, perhaps we can iterate through them upon repetitive <end> key presses).
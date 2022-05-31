/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, window, workspace, StatusBarItem, StatusBarAlignment, MarkdownString, Uri, SaveDialogOptions, commands } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import * as express from 'express';
import http = require('http');
import { Search } from "./Search";
import { MessageParser } from "./MessageParser";
import { MockSearch } from "./MockSearch";
import { SearchDebuggerView, toHappening } from "./SearchDebuggerView";
import { PDDL, planner, DomainInfo, ProblemInfo, search } from "pddl-workspace";
import { CONF_PDDL, PddlConfiguration, PDDL_PLANNER, VAL_STEP_PATH, VAL_VERBOSE } from "../configuration/configuration";
import { DEF_PLANNER_OUTPUT_TARGET, EXECUTION_TARGET, PLANNER_OUTPUT_TARGET_SEARCH_DEBUGGER, STATUS_BAR_PRIORITY } from "../configuration/PlannersConfiguration";
import { ensureAbsoluteGlobalStoragePath, showError } from "../utils";
import { ValStep } from "ai-planning-val";
import { handleValStepError } from "../planView/valStepErrorHandler";
import { basename, dirname, extname, join } from "path";
import { exportToAndShow } from "../util/editorUtil";

/** Search debugger component. It owns and manages the {@link SearchDebuggerView}. */
export class SearchDebugger implements planner.PlannerOptionsProvider {

    private server: http.Server | null = null;
    private search: Search | undefined; // lazy init
    private port = 0; // port is randomized
    private view: SearchDebuggerView;
    private messageParser: MessageParser | undefined; // lazy init
    private statusBarItem: StatusBarItem | undefined; // lazy init
    static readonly TOGGLE_COMMAND = "pddl.searchDebugger.toggle";
    static readonly PORT_COMMAND = "pddl.searchDebugger.port";
    static readonly START_COMMAND = SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_START;
    static readonly STOP_COMMAND = SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_STOP;
    static readonly RESET_COMMAND = SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_RESET;

    public static readonly CONFIG_PDDL_SEARCH_DEBUGGER = "pddlSearchDebugger";
    private readonly CONF_DEFAULT_PORT = "defaultPort";
    private readonly CONF_STATE_ID_PATTERN = "stateIdPattern";
    public static readonly CONFIG_PLANNER_OPTION = "plannerCommandLine";
    private domain: DomainInfo | undefined;
    private problem: ProblemInfo | undefined;

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(SearchDebugger.START_COMMAND, async () => this.tryStart()));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(SearchDebugger.STOP_COMMAND, () => this.tryStop()));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(SearchDebugger.RESET_COMMAND, () => this.reset()));
        this.context.subscriptions.push(commands.registerCommand(SearchDebugger.PORT_COMMAND, async () => {
            if (!this.server) {
                await this.tryStart();
            }
            return this.port;
        }));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.searchDebugger.mock", () => this.mock()));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(SearchDebuggerView.COMMAND_SHOW_STATE_CONTEXT, (stateId) => this.showContextMenu(stateId)));

        // hen the planner output target changes, disable the search debugger accordingly, so it stops listening
        workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(PDDL_PLANNER + '.' + EXECUTION_TARGET)) {
                const target = workspace.getConfiguration(PDDL_PLANNER).get<string>(EXECUTION_TARGET, DEF_PLANNER_OUTPUT_TARGET);
                if (this.isRunning() && target !== PLANNER_OUTPUT_TARGET_SEARCH_DEBUGGER) {
                    this.tryStop();
                }
            }
        });

        this.view = new SearchDebuggerView(this.context);
    }

    providePlannerOptions(context: planner.PlanningRequestContext): string {
        if (this.isRunning()) {
            this.reset();
            if (this.view) {
                this.view.setDomainAndProblem(context.domain, context.problem);
            }
            this.domain = context.domain;
            this.problem = context.problem;
        }
        return "";
    }

    reset(): void {
        if (this.search) { this.search.clear(); }
        if (this.messageParser) { this.messageParser.clear(); }
        if (this.view) { this.view.clear(); }
    }

    async showContextMenu(stateId: number): Promise<void> {
        const state = this.search?.getState(stateId);
        if (state) {
            const selectedItem = await window.showQuickPick([
                `Export state ${stateId} to PDDL problem`,
            ], {
                ignoreFocusOut: true,
                title: `Options for state ${stateId}`,
            });

            if (selectedItem) {
                this.generateProblem(state);
            }
        }
    }

    async generateProblem(state: search.SearchState): Promise<void> {

        const valStepPath = ensureAbsoluteGlobalStoragePath(workspace.getConfiguration(CONF_PDDL).get<string>(VAL_STEP_PATH), this.context);
        const valVerbose = workspace.getConfiguration(CONF_PDDL).get<boolean>(VAL_VERBOSE, false);

        const happenings = state.planHead.map(searchHappening => toHappening(searchHappening));
        const lastHappeningTime = Math.max(...happenings.map(h => h.getTime()), 0);

        if (this.domain && this.problem) {
            try {
                const valStep = new ValStep(this.domain, this.problem);
                const finalStateValues = await valStep.executeBatch(happenings, { valStepPath, verbose: valVerbose });

                if (finalStateValues) {
                    const newProblemText = ProblemInfo.cloneWithInitStateAt(this.problem, finalStateValues, lastHappeningTime);
                    const origProblemPath = (this.problem.fileUri as Uri).fsPath;
                    const ext = extname(origProblemPath);
                    const defaultNewProblemPath = join(dirname(origProblemPath), basename(origProblemPath, ext) + "_state" + state.id + "." + PDDL);
                    const options: SaveDialogOptions = {
                        saveLabel: "Save problem as...",
                        filters: {
                            "PDDL Problem": [PDDL]
                        },

                        defaultUri: Uri.file(defaultNewProblemPath)
                    };

                    const newProblemUri = await window.showSaveDialog(options);
                    if (!newProblemUri) { return; } // canceled by user
                    exportToAndShow(newProblemText, newProblemUri);
                }
            } catch (err) {
                console.error(err);
                if (valStepPath) {
                    handleValStepError(err, valStepPath);
                }
            }
        }
    }

    async tryStart(): Promise<void> {
        try {
            await this.startAndShow();
        }
        catch (ex) {
            window.showErrorMessage("Error starting search debug listener: " + ex);
        }
    }

    isRunning(): boolean {
        return this.server !== null && this.server.listening;
    }

    async startAndShow(): Promise<void> {
        if (!this.isRunning()) {
            await this.startServer();
        }
        this.view.showDebugView().catch(err => showError(err));
        this.showStatusBarItem();
    }

    private async startServer(): Promise<void> {
        if (!this.search || !this.messageParser) {
            this.search = new Search();
            const stateIdPattern = this.getStateIdPattern();
            this.messageParser = new MessageParser(this.search, stateIdPattern);
            this.view.observe(this.search);
        }

        const app: express.Application = this.createApplication(this.search, this.messageParser);

        const defaultPort = workspace.getConfiguration(SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER).get<number>(this.CONF_DEFAULT_PORT, 0);

        this.port = defaultPort > 0 ? defaultPort : 8000 + Math.floor(Math.random() * 1000);
        return new Promise<void>(resolve => {
            this.server = http.createServer(app);
            this.server.on('error', e => {
                window.showErrorMessage(e.message);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((e as any)['code'] === "EADDRINUSE") {
                    this.pddlConfiguration.askConfiguration(SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER + "." + this.CONF_DEFAULT_PORT);
                }
            });
            this.server.on("listening", () => {
                resolve();
                console.log("Search debugger listening at port " + this.port);
                this.showStatus();
            });
            this.server.on("close", () => {
                console.log("Search debugger closed");
                this.server = null;
                this.showStatus();
            });

            this.server.listen(this.port, "127.0.0.1"); // listen to the local loop-back IP address only
        });
    }

    private getStateIdPattern(): RegExp {
        const stateIdPatternAsString = workspace.getConfiguration(SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER).get<string>(this.CONF_STATE_ID_PATTERN);
        if (!stateIdPatternAsString) { throw new Error(`Missing configuration: ${SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER}.${this.CONF_STATE_ID_PATTERN}`); }
        let stateIdPattern: RegExp;
        try {
            stateIdPattern = new RegExp(stateIdPatternAsString);
        }
        catch (ex) {
            console.log("Invalid stateIdPattern regular expression: " + ex);
            throw new Error(`Invalid regular expression in configuration: ${SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER}.${this.CONF_STATE_ID_PATTERN}`);
            // todo: this.pddlConfiguration.askConfiguration(SearchDebugger.CONFIG_PDDL_SEARCH_DEBUGGER + "." + this.CONF_STATE_ID_PATTERN);
        }
        return stateIdPattern;
    }

    private createApplication(search: Search, messageParser: MessageParser): express.Application {
        const app: express.Application = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));
        app.get('/about', function (_req: express.Request, res: express.Response) {
            res.status(200).send('Visual search debugger.');
        });
        app.post('/state/initial', function (req: express.Request, res: express.Response) {
            try {
                search.addInitialState(messageParser.parseInitialState(req.body));
                res.status(201).end();
            }
            catch (ex) {
                console.log(ex);
                res.status(500).end();
            }
        });
        app.post('/state', function (req: express.Request, res: express.Response) {
            search.addState(messageParser.parseState(req.body));
            res.status(201).end();
        });
        // todo: the next one should be a 'patch' verb for '/state' path
        app.post('/state/visitedOrWorse', function (req: express.Request, res: express.Response) {
            search.update(messageParser.parseState(req.body).setVisitedOrIsWorse());
            res.status(201).end();
        });
        // todo: the next one should be a 'patch' verb for '/state' path
        app.post('/state/heuristic', function (req: express.Request, res: express.Response) {
            search.update(messageParser.parseEvaluatedState(req.body));
            res.status(200).end();
        });

        app.post('/plan', function (req: express.Request, res: express.Response) {
            search.setPlan(messageParser.parseState(req.body));
            res.status(200).end();
        });
        return app;
    }

    tryStop(): void {
        try {
            this.stop();
        }
        catch (ex: unknown) {
            window.showErrorMessage("Error stopping search debug listener: " + ((ex as Error).message ?? ex));
        }
    }

    stop(): void {
        if (this.server !== null) {
            this.server.close();
        }
        this.showStatus();
    }

    showStatus(): void {
        this.view.setDebuggerState(this.isRunning(), this.port);
        this.showStatusBarItem();
    }

    toggle(): void {
        if (this.isRunning()) {
            this.tryStop();
        } else {
            this.tryStart().catch(showError);
        }
    }

    mock(): void {
        try {
            this.view.clear();
            this.stop();
            this.startAndShow();
            new MockSearch(this.port).run();
        }
        catch (ex) {
            window.showErrorMessage("Error starting the mock search: " + ex);
        }
    }

    showStatusBarItem(): void {
        if (!this.statusBarItem) {
            // create it and show it the first time the search debugger is used
            this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
            this.context.subscriptions.push(this.statusBarItem);

            this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(SearchDebugger.TOGGLE_COMMAND, () => this.toggle()));
            this.statusBarItem.command = SearchDebugger.TOGGLE_COMMAND;
            this.statusBarItem.show();
        }

        this.statusBarItem.text = this.isRunning() ? '$(stop-circle)' : '$(record)';
        this.statusBarItem.color = this.isRunning() ? undefined : 'red';
        const status = this.isRunning() ? `listening on port ${this.port}. Click here to stop it.` : 'OFF. Click here to start it.';
        const tooltip = new MarkdownString(`PDDL Search debugger is ${status}.`, true);
        if (this.isRunning()) {
            tooltip.appendMarkdown(`$(stop-circle) ([Stop debugger listening](command: ${SearchDebugger.STOP_COMMAND}))`);
        } else {
            tooltip.appendMarkdown(`$(record) ([Start debugger listening](command: ${SearchDebugger.START_COMMAND}))`);
        }
        tooltip.appendMarkdown(`$(refresh) ([Stop debugger listening](command: ${SearchDebugger.RESET_COMMAND}))`);
        tooltip.isTrusted = true;
        this.statusBarItem.tooltip = tooltip;
    }
}
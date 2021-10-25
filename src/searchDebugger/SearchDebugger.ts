/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, window, workspace, StatusBarItem, StatusBarAlignment } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import * as express from 'express';
import bodyParser = require('body-parser');
import http = require('http');
import { Search } from "./Search";
import { MessageParser } from "./MessageParser";
import { MockSearch } from "./MockSearch";
import { SearchDebuggerView } from "./SearchDebuggerView";
import { planner } from "pddl-workspace";
import { PddlConfiguration, PDDL_PLANNER } from "../configuration/configuration";
import { DEF_PLANNER_OUTPUT_TARGET, EXECUTION_TARGET, PLANNER_OUTPUT_TARGET_SEARCH_DEBUGGER, STATUS_BAR_PRIORITY } from "../configuration/PlannersConfiguration";

export class SearchDebugger implements planner.PlannerOptionsProvider {

    private server: http.Server | null = null;
    private search: Search | undefined; // lazy init
    private port = 0; //port is randomized
    private view: SearchDebuggerView;
    private messageParser: MessageParser | undefined; // lazy init
    private statusBarItem: StatusBarItem | undefined; // lazy init
    static readonly TOGGLE_COMMAND = "pddl.searchDebugger.toggle";

    private readonly CONFIG_PDDL_SEARCH_DEBUGGER = "pddlSearchDebugger";
    private readonly CONF_DEFAULT_PORT = "defaultPort";
    private readonly CONF_STATE_ID_PATTERN = "stateIdPattern";
    private readonly CONFIG_PLANNER_OPTION = "plannerCommandLine";

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.searchDebugger.start", () => this.tryStart()));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.searchDebugger.stop", () => this.tryStop()));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.searchDebugger.reset", () => this.reset()));
        this.context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.searchDebugger.mock", () => this.mock()));

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

            const commandLine = workspace.getConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER).get<string>(this.CONFIG_PLANNER_OPTION);
            if (!commandLine) { throw new Error(`Missing planner command-line option configuration: ${this.CONFIG_PDDL_SEARCH_DEBUGGER}.${this.CONFIG_PLANNER_OPTION}`); }
            return commandLine.replace('$(port)', this.port.toString());
        }
        else {
            return "";
        }
    }

    reset(): void {
        if (this.search) { this.search.clear(); }
        if (this.messageParser) { this.messageParser.clear(); }
        if (this.view) { this.view.clear(); }
    }

    tryStart(): void {
        try {
            this.startAndShow();
        }
        catch (ex) {
            window.showErrorMessage("Error starting search debug listener: " + ex);
        }
    }

    isRunning(): boolean {
        return this.server !== null && this.server.listening;
    }

    startAndShow(): void {
        if (!this.isRunning()) {
            this.startServer();
        }
        this.view.showDebugView();
        this.showStatusBarItem();
    }

    private startServer(): void {
        if (!this.search || !this.messageParser) {
            this.search = new Search();
            const stateIdPattern = this.getStateIdPattern();
            this.messageParser = new MessageParser(this.search, stateIdPattern);
            this.view.observe(this.search);
        }

        const app: express.Application = this.createApplication(this.search, this.messageParser);

        const defaultPort = workspace.getConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER).get<number>(this.CONF_DEFAULT_PORT, 0);

        this.port = defaultPort > 0 ? defaultPort : 8000 + Math.floor(Math.random() * 1000);
        this.server = http.createServer(app);
        this.server.on('error', e => {
            window.showErrorMessage(e.message);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((e as any)['code'] === "EADDRINUSE") {
                this.pddlConfiguration.askConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER + "." + this.CONF_DEFAULT_PORT);
            }
        });
        this.server.on("listening", () => {
            console.log("Search debugger listening at port " + this.port);
            this.showStatus();
        });
        this.server.on("close", () => {
            console.log("Search debugger closed");
            this.server = null;
            this.showStatus();
        });

        this.server.listen(this.port, "127.0.0.1"); // listen to the local loop-back IP address only
    }

    private getStateIdPattern(): RegExp {
        const stateIdPatternAsString = workspace.getConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER).get<string>(this.CONF_STATE_ID_PATTERN);
        if (!stateIdPatternAsString) { throw new Error(`Missing configuration: ${this.CONFIG_PDDL_SEARCH_DEBUGGER}.${this.CONF_STATE_ID_PATTERN}`); }
        let stateIdPattern: RegExp;
        try {
            stateIdPattern = new RegExp(stateIdPatternAsString);
        }
        catch (ex) {
            console.log("Invalid stateIdPattern regular expression: " + ex);
            throw new Error(`Invalid regular expression in configuration: ${this.CONFIG_PDDL_SEARCH_DEBUGGER}.${this.CONF_STATE_ID_PATTERN}`);
            // todo: this.pddlConfiguration.askConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER + "." + this.CONF_STATE_ID_PATTERN);
        }
        return stateIdPattern;
    }

    private createApplication(search: Search, messageParser: MessageParser): express.Application {
        const app: express.Application = express();
        app.use(bodyParser.json());
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
            this.tryStart();
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
        this.statusBarItem.tooltip = `PDDL Search debugger is ${status}.`;
    }
}
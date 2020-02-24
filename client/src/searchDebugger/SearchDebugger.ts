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
import { PlannerOptionsProvider, PlanningRequestContext } from "../planning/PlannerOptionsProvider";
import { PddlConfiguration } from "../configuration";

export class SearchDebugger implements PlannerOptionsProvider {

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

        this.view = new SearchDebuggerView(this.context);
    }

    providePlannerOptions(context: PlanningRequestContext): string {
        if (this.isRunning()) {
            this.reset();
            if (this.view) {
                this.view.setDomainAndProblem(context.domain, context.problem);
            }

            let commandLine = workspace.getConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER).get<string>(this.CONFIG_PLANNER_OPTION);
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
            var stateIdPattern = this.getStateIdPattern();
            this.messageParser = new MessageParser(this.search, stateIdPattern);
            this.view.observe(this.search);
        }

        var app: express.Application = this.createApplication(this.search, this.messageParser);

        let defaultPort = workspace.getConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER).get<number>(this.CONF_DEFAULT_PORT, 0);

        this.port = defaultPort > 0 ? defaultPort : 8000 + Math.floor(Math.random() * 1000);
        this.server = http.createServer(app);
        this.server.on('error', e => {
            window.showErrorMessage(e.message);
            if ((<any>e)['code'] === "EADDRINUSE") {
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
        let stateIdPatternAsString = workspace.getConfiguration(this.CONFIG_PDDL_SEARCH_DEBUGGER).get<string>(this.CONF_STATE_ID_PATTERN);
        if (!stateIdPatternAsString) { throw new Error(`Missing configuration: ${this.CONFIG_PDDL_SEARCH_DEBUGGER}.${this.CONF_STATE_ID_PATTERN}`); }
        var stateIdPattern: RegExp;
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
        var app: express.Application = express();
        app.use(bodyParser.json());
        app.get('/about', function (_req: express.Request, res: express.Response, _next: express.NextFunction) {
            res.status(200).send('Hello, world!');
        });
        app.post('/state/initial', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            try {
                search.addInitialState(messageParser.parseInitialState(req.body));
                res.status(201).end();
            }
            catch (ex) {
                console.log(ex);
                res.status(500).end();
            }
        });
        app.post('/state', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            search.addState(messageParser.parseState(req.body));
            res.status(201).end();
        });
        // todo: the next one should be a 'patch' verb for '/state' path
        app.post('/state/heuristic', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            search.update(messageParser.parseEvaluatedState(req.body));
            res.status(200).end();
        });

        app.post('/plan', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            search.setPlan(messageParser.parseState(req.body));
            res.status(200).end();
        });
        return app;
    }

    tryStop(): void {
        try {
            this.stop();
        }
        catch (ex) {
            window.showErrorMessage("Error stopping search debug listener: " + (ex.message || ex));
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

    showStatusBarItem() {
        if (!this.statusBarItem) {
            // create it and show it the first time the search debugger is used
            this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right);
            this.context.subscriptions.push(this.statusBarItem);

            this.context.subscriptions.push(instrumentOperationAsVsCodeCommand(SearchDebugger.TOGGLE_COMMAND, () => this.toggle()));
            this.statusBarItem.command = SearchDebugger.TOGGLE_COMMAND;
            this.statusBarItem.show();
        }

        let statusIcon = this.isRunning() ? '$(radio-tower)' : '$(x)';
        let status = this.isRunning() ? `ON (on port ${this.port}). Click here to stop it.` : 'OFF. Click here to start it.';
        this.statusBarItem.text = `$(bug)${statusIcon}`;
        this.statusBarItem.tooltip = `PDDL Search debugger is ${status}.`;
    }
}
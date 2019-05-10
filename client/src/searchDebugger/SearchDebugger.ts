/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, commands, window, workspace, StatusBarItem, StatusBarAlignment } from "vscode";

import * as express from 'express';
import bodyParser = require('body-parser')
import http = require('http');
import { Search } from "./Search";
import { MessageParser } from "./MessageParser";
import { MockSearch } from "./MockSearch";
import { SearchDebuggerView } from "./SearchDebuggerView";
import { PddlConfiguration } from "../configuration";
import { PlannerOptionsProvider, PlanningRequestContext } from "../planning/PlannerOptionsProvider";

export class SearchDebugger implements PlannerOptionsProvider {

    private server: http.Server;
    private search: Search;
    private port = 0; //port is randomized
    private view: SearchDebuggerView;
    private messageParser: MessageParser;
    private statusBarItem: StatusBarItem;
    static readonly TOGGLE_COMMAND = "pddl.searchDebugger.toggle";

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.start", () => this.tryStart()));
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.stop", () => this.tryStop()));
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.reset", () => this.reset()));
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.mock", () => this.mock()));

        this.view = new SearchDebuggerView(this.context, this.pddlConfiguration);
    }

    providePlannerOptions(context: PlanningRequestContext): string {
        if (this.isRunning()) {
            this.reset();
            if (this.view) {
                this.view.setDomainAndProblem(context.domain, context.problem);
            }

            let commandLine = workspace.getConfiguration("pddlSearchDebugger").get<string>("plannerCommandLine");
            return commandLine.replace('$(port)', this.port.toString());
        }
        else {
            return "";
        }
    }

    reset(): void {
        if (this.search) this.search.clear();
        if (this.messageParser) this.messageParser.clear();
        if (this.view) this.view.clear();
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
        return this.server != null;
    }

    startAndShow(): void {
        if (!this.isRunning()) {
            this.startServer();
        }
        this.view.showDebugView(this.isRunning());
        this.showStatusBarItem();
    }

    private startServer(): void {
        if (!this.search) {
            this.search = new Search();
            this.messageParser = new MessageParser(this.search);
            this.view.observe(this.search);
        }

        var app: express.Application = this.createApplication();

        let defaultPort = workspace.getConfiguration("pddlSearchDebugger").get<number>("defaultPort");

        this.port = defaultPort > 0 ? defaultPort : 8000 + Math.floor(Math.random() * 1000);
        let retryCount = defaultPort > 0 ? 1 : 100;
        this.server = http.createServer(app);
        this.server.on('error', e => window.showErrorMessage(e.message));
        for (; retryCount > 0; retryCount--) {
            try {
                this.server.listen(this.port);
                break;
            }catch(ex){
                console.log(`Cannot listen to port ${this.port}: ` + ex);
                this.port--;
            }
        }
        console.log("Search debugger listening at port " + this.port);
    }

    private createApplication() {
        var app: express.Application = express();
        app.use(bodyParser.json());
        app.get('/about', function (_req: express.Request, res: express.Response, _next: express.NextFunction) {
            res.status(200).send('Hello, world!');
        });
        const serviceDebugger = this;
        app.post('/state/initial', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            try {
                serviceDebugger.search.addInitialState(serviceDebugger.messageParser.parseInitialState(req.body));
                res.status(201).end();
            }
            catch (ex) {
                console.log(ex);
                res.status(500).end();
            }
        });
        app.post('/state', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            serviceDebugger.search.addState(serviceDebugger.messageParser.parseState(req.body));
            res.status(201).end();
        });
        // todo: the next one should be a 'patch' verb for '/state' path
        app.post('/state/heuristic', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            serviceDebugger.search.update(serviceDebugger.messageParser.parseEvaluatedState(req.body));
            res.status(200).end();
        });

        app.post('/plan', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            serviceDebugger.search.setPlan(serviceDebugger.messageParser.parseState(req.body));
            res.status(200).end();
        });
        return app;
    }

    tryStop(): void {
        try {
            this.stop();
        }
        catch (ex) {
            window.showErrorMessage("Error stopping search debug listener: " + ex);
        }
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.view.showDebuggerState(this.isRunning());
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

            this.context.subscriptions.push(commands.registerCommand(SearchDebugger.TOGGLE_COMMAND, () => this.toggle()));
            this.statusBarItem.command = SearchDebugger.TOGGLE_COMMAND;
            this.statusBarItem.show();
        }

        let statusIcon = this.isRunning() ? '$(radio-tower)' : '$(x)';
        let status = this.isRunning() ? `ON (on port ${this.port}). Click here to stop it.` : 'OFF. Click here to start it.';
        this.statusBarItem.text = `$(bug)${statusIcon}`;
        this.statusBarItem.tooltip = `PDDL Search debugger is ${status}.`;
    }
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, commands, window } from "vscode";

import * as express from 'express';
import bodyParser = require('body-parser')
import http = require('http');
import { Search } from "./Search";
import { MessageParser } from "./MessageParser";
import { MockSearch } from "./MockSearch";
import { SearchDebuggerView } from "./SearchDebuggerView";
import { PddlConfiguration } from "../configuration";

export class SearchDebugger {

    server: http.Server;
    search: Search;
    port = 8899; //todo: randomize port
    view: SearchDebuggerView;
    messageParser: MessageParser;

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.start", () => this.tryStart()));
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.stop", () => this.tryStop()));
        this.context.subscriptions.push(commands.registerCommand("pddl.searchDebugger.mock", () => this.mock()));

        this.view = new SearchDebuggerView(this.context, this.pddlConfiguration);
    }

    tryStart(): void {
        try {
            this.start();
        }
        catch (ex) {
            window.showErrorMessage("Error starting search debug listener: " + ex);
        }
    }

    start(): void {
        this.view.showDebugView(true);
        if (this.server != null) window.showErrorMessage("Search debugger is already running");

        this.search = new Search();
        this.messageParser = new MessageParser(this.search);
        this.view.observe(this.search);

        if (this.server != null) window.showErrorMessage("Search debugger is already running");
        var app: express.Application = this.createApplication();

        this.server = http.createServer(app);
        this.server.on('error', e => window.showErrorMessage(e.message));
        this.server.listen(this.port);
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
        // todo: the next one should be a 'patch'
        app.post('/state/h', function (req: express.Request, res: express.Response, _next: express.NextFunction) {
            serviceDebugger.search.update(serviceDebugger.messageParser.parseEvaluatedState(req.body));
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
        this.view.showDebuggerState(false);
    }

    mock(): void {
        try {
            this.view.clear();
            this.stop();
            this.start();
            new MockSearch(this.port).run();
        }
        catch (ex) {
            window.showErrorMessage("Error starting mock search: " + ex);
        }
    }
}
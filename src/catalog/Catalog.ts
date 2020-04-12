/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ExtensionContext, TreeDataProvider, EventEmitter, TreeItem, Event, window, TreeItemCollapsibleState, Uri, TextDocumentContentProvider, CancellationToken, workspace, commands, ViewColumn, TreeView, Command } from 'vscode';

import { CatalogEntry, CatalogEntryKind, Collection, Domain, Problem } from './CatalogEntry';
import { PlanningDomains } from './PlanningDomains';
import request = require('request');
import { join } from 'path';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

const COMMAND_SHOW_DOMAIN_PROBLEM = 'pddl.planning.domains.show';
export const HTTPDDL = 'httpddl';
export const HTTPLAN = 'httplan';

export class Catalog {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    treeView: TreeView<any>;

    public static readonly VIEW = "pddl.planning.domains";

    constructor(context: ExtensionContext) {
        const catalogDataProvider = new CatalogDataProvider(context);
        this.treeView = window.createTreeView(Catalog.VIEW, { treeDataProvider: catalogDataProvider, showCollapseAll: true });
        const catalogContentProvider = new CatalogDomainProblemProvider();
        context.subscriptions.push(workspace.registerTextDocumentContentProvider(HTTPDDL, catalogContentProvider));
        context.subscriptions.push(workspace.registerTextDocumentContentProvider(HTTPLAN, new CatalogPlanProvider()));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(COMMAND_SHOW_DOMAIN_PROBLEM,
            (domainUrl: string, problemUrl: string, planUrl: string) =>
                this.showProblem(domainUrl, problemUrl, planUrl)));
    }

    showProblem(domainUrl: string, problemUrl: string, planUrl: string): void {
        try {
            commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 0.4 }, { size: 0.3 }, { size: 0.3 }] });

            workspace.openTextDocument(Uri.parse(domainUrl)).then(document => {
                window.showTextDocument(document, ViewColumn.One);
            });
            workspace.openTextDocument(Uri.parse(problemUrl)).then(document => {
                window.showTextDocument(document, ViewColumn.Two);
            });
            workspace.openTextDocument(Uri.parse(planUrl)).then(document => {
                window.showTextDocument(document, { viewColumn: ViewColumn.Three, preview: true });
            });
        }
        catch (ex) {
            console.log(ex);
            window.showWarningMessage("Failed to display domain/problem/plan from planning.domains: " + ex);
        }
    }
}

class CatalogDomainProblemProvider implements TextDocumentContentProvider {
    onDidChange?: Event<Uri>;

    async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        if (token.isCancellationRequested) { return "Operation canceled."; }

        uri = uri.with({ scheme: "http" });
        return new Promise<string>((resolve) => {
            request.get(uri.toString(), (error, _httpResponse, httpBody) => {
                if (error) {
                    resolve(error);
                }
                else {
                    resolve(httpBody);
                }
            });
        });
    }
}

class CatalogPlanProvider implements TextDocumentContentProvider {
    onDidChange?: Event<Uri>;

    async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        if (token.isCancellationRequested) { return "Operation canceled."; }

        uri = decodePlanUri(uri);
        return new Promise<string>((resolve) => {
            request.get(uri.toString(), { json: true }, (error, _httpResponse, httpBody) => {
                if (error) {
                    resolve(error);
                }
                else {
                    resolve(httpBody["result"]["plan"]);
                }
            });
        });
    }
}

class CatalogDataProvider implements TreeDataProvider<CatalogEntry> {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;
    private planningDomains = new PlanningDomains();

    constructor(private context: ExtensionContext) {

    }

    public getTreeItem(element: CatalogEntry): TreeItem {
        const isCollapsible = element.kind !== CatalogEntryKind.Problem;
        return {
            label: element.label,
            collapsibleState: isCollapsible ? TreeItemCollapsibleState.Collapsed : void 0,
            command: this.createCommand(element),
            iconPath: this.getIcon(element.kind),
            tooltip: element.tooltip
        };
    }

    getIcon(kind: CatalogEntryKind): string | undefined {
        if (!kind) {
            return undefined;
        } else if (kind === CatalogEntryKind.Domain) {
            return this.context.asAbsolutePath(join('views', 'overview', 'file_type_pddl.svg'));
        } else if (kind === CatalogEntryKind.Problem) {
            return this.context.asAbsolutePath(join('views', 'overview', 'file_type_pddl_plan.svg'));
        } else {
            return undefined;
        }
    }

    private createCommand(element: CatalogEntry): Command | undefined {
        if (element.kind === CatalogEntryKind.Problem) {
            const problem = element as Problem;
            const domainUrl = Uri.parse(problem.domain_url).with({ scheme: HTTPDDL });
            const problemUrl = Uri.parse(problem.problem_url).with({ scheme: HTTPDDL });
            const planUrl = encodePlanUri(problem);

            return {
                command: COMMAND_SHOW_DOMAIN_PROBLEM,
                arguments: [domainUrl, problemUrl, planUrl],
                title: 'PDDL: Show PDDL domain, problem and plan'
            };
        } else {
            return void 0;
        }
    }

    public async getChildren(element?: CatalogEntry): Promise<CatalogEntry[]> {
        if (!element) {
            return this.withProgress("Fetching collections", () => this.planningDomains.getCollections());
        }
        else if (element.kind === CatalogEntryKind.Collection) {
            const collection = element as Collection;
            return this.withProgress("Fetching domains", () => this.planningDomains.getDomains(collection));
        }
        else if (element.kind === CatalogEntryKind.Domain) {
            const domain = element as Domain;
            return this.withProgress("Fetching problems", () => this.planningDomains.getProblems(domain));
        }
        else {
            return [];
        }
    }

    private withProgress<T>(message: string, workload: () => Thenable<T>): Thenable<T> {
        return window.withProgress({ location: { viewId: Catalog.VIEW }, title: message }, workload);
    }
}

function encodePlanUri(problem: Problem): Uri {
    const extension = '.plan';
    let fileName = problem.label.replace('.pddl', extension);
    if (!fileName.endsWith(extension)) { fileName += extension; }
    return Uri.parse(PlanningDomains.URL + `plan/${problem.id}/${fileName}`).with({ scheme: HTTPLAN });
}

function decodePlanUri(encodedUri: Uri): Uri {
    const lastSlash = encodedUri.path.lastIndexOf('/');
    return encodedUri.with({ path: encodedUri.path.substring(0, lastSlash), scheme: "http" });
}


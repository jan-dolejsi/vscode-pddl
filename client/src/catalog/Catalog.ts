/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ExtensionContext, TreeDataProvider, EventEmitter, TreeItem, Event, window, TreeItemCollapsibleState, Uri, TextDocumentContentProvider, CancellationToken, workspace, commands, ViewColumn } from 'vscode';

import { CatalogEntry, CatalogEntryKind, Collection, Domain, Problem } from './CatalogEntry';
import { PlanningDomains } from './PlanningDomains';
import request = require('request');
import { join } from 'path';

const COMMAND_SHOW_DOMAIN_PROBLEM = 'pddl.planning.domains.show';
const HTTPDDL = 'httpddl'
const HTTPLAN = 'httplan'

export class Catalog {
    constructor(context: ExtensionContext) {
        const catalogDataProvider = new CatalogDataProvider(context);
        context.subscriptions.push(window.registerTreeDataProvider("pddl.planning.domains", catalogDataProvider));
        const catalogContentProvider = new CatalogDomainProblemProvider();
        context.subscriptions.push(workspace.registerTextDocumentContentProvider(HTTPDDL, catalogContentProvider));
        context.subscriptions.push(workspace.registerTextDocumentContentProvider(HTTPLAN, new CatalogPlanProvider()));

        context.subscriptions.push(commands.registerCommand(COMMAND_SHOW_DOMAIN_PROBLEM,
            (domain_url: string, problem_url: string, plan_url: string) =>
                this.showProblem(domain_url, problem_url, plan_url)));
    }

    showProblem(domain_url: string, problem_url: string, plan_url: string): void {
        try {
            commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 0.4 }, { size: 0.3 }, { size: 0.3 }] });

            workspace.openTextDocument(Uri.parse(domain_url)).then(document => {
                window.showTextDocument(document, ViewColumn.One);
            });
            workspace.openTextDocument(Uri.parse(problem_url)).then(document => {
                window.showTextDocument(document, ViewColumn.Two);
            });
            workspace.openTextDocument(Uri.parse(plan_url)).then(document => {
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
        if (token.isCancellationRequested) return "Operation canceled.";

        uri = uri.with({ scheme: "http" })
        return new Promise<string>((resolve, _reject) => {
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
        if (token.isCancellationRequested) return "Operation canceled.";

        uri = decodePlanUri(uri);
        return new Promise<string>((resolve, _reject) => {
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

    private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();
    readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;
    private planningDomains = new PlanningDomains();

    constructor(private context: ExtensionContext) {

    }

    public getTreeItem(element: CatalogEntry): TreeItem {
        let isCollapsible = element.kind != CatalogEntryKind.Problem;
        return {
            label: element.label,
            collapsibleState: isCollapsible ? TreeItemCollapsibleState.Collapsed : void 0,
            command: this.createCommand(element),
            iconPath: this.getIcon(element.kind),
            tooltip: element.tooltip
        };
    }

    getIcon(kind: CatalogEntryKind): any {
        if (!kind) return null;
        else if (kind == CatalogEntryKind.Domain)
            return this.context.asAbsolutePath(join('overview', 'file_type_pddl.svg'));
        else if (kind == CatalogEntryKind.Problem)
            return this.context.asAbsolutePath(join('overview', 'file_type_pddl_plan.svg'));
    }

    private createCommand(element: CatalogEntry) {
        if (element.kind == CatalogEntryKind.Problem) {
            let problem = <Problem>element;
            let domain_url = Uri.parse(problem.domain_url).with({ scheme: HTTPDDL })
            let problem_url = Uri.parse(problem.problem_url).with({ scheme: HTTPDDL })
            let plan_url = encodePlanUri(problem);

            return {
                command: COMMAND_SHOW_DOMAIN_PROBLEM,
                arguments: [domain_url, problem_url, plan_url],
                title: 'PDDL: Show PDDL domain, problem and plan'
            }
        } else {
            return void 0;
        }
    }

    public async getChildren(element?: CatalogEntry): Promise<CatalogEntry[]> {
        if (!element) {
            return this.planningDomains.getCollections();
        }
        else if (element.kind == CatalogEntryKind.Collection) {
            let collection = <Collection>element;
            return this.planningDomains.getDomains(collection);
        }
        else if (element.kind == CatalogEntryKind.Domain) {
            let domain = <Domain>element;
            return this.planningDomains.getProblems(domain);
        }
        else {
            return [];
        }
    }
}

function encodePlanUri(problem: Problem): Uri {
    const extension = '.plan';
    let fileName = problem.label.replace('.pddl', extension);
    if (!fileName.endsWith(extension)) fileName += extension;
    return Uri.parse(PlanningDomains.URL + `plan/${problem.id}/${fileName}`).with({ scheme: HTTPLAN });
}

function decodePlanUri(encodedUri: Uri): Uri {
    let lastSlash = encodedUri.path.lastIndexOf('/');
    return encodedUri.with({ path: encodedUri.path.substring(0, lastSlash), scheme: "http" })
}


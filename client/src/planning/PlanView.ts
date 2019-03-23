/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, Uri,
    ViewColumn, ExtensionContext, TextDocument, WebviewPanel, Disposable, TextDocumentChangeEvent
} from 'vscode';

import { isPlan, getDomainAndProblemForPlan } from '../utils';
import { PlanReportGenerator } from './PlanReportGenerator';
import { PddlWorkspace } from '../../../common/src/workspace-model';
import { PddlLanguage } from '../../../common/src/FileInfo';
import { PlanInfo, PLAN } from '../../../common/src/parser';
import { Plan } from '../../../common/src/Plan';

import * as path from 'path';

const CONTENT = 'planview';
export const PDDL_GENERATE_PLAN_REPORT = 'pddl.planReport';
export const PDDL_EXPORT_PLAN = 'pddl.exportPlan';

export class PlanView extends Disposable {

    webviewPanels = new Map<Uri, PlanPreviewPanel>();
    timeout: NodeJS.Timer;
    displayWidth = 200;
    public static readonly PLANNER_OUTPUT_URI = Uri.parse("pddl://planner/output");

    constructor(private context: ExtensionContext, private pddlWorkspace: PddlWorkspace) {
        super(() => this.dispose());

        context.subscriptions.push(commands.registerCommand("pddl.plan.preview", async planUri => {
            let dotDocument = await getDotDocument(planUri);
            if (dotDocument) {
                return this.revealOrCreatePreview(dotDocument, ViewColumn.Beside);
            }
        }));

        // When the active document is changed set the provider for rebuild
        // this only occurs after an edit in a document
        context.subscriptions.push(workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
            if (e.document.languageId === PLAN) {
                this.setNeedsRebuild(e.document);
            }
        }));

        context.subscriptions.push(workspace.onDidSaveTextDocument((doc: TextDocument) => {
            if (doc.languageId === PLAN) {
                this.setNeedsRebuild(doc);
            }
        }))

    }

    setPlannerOutput(plans: Plan[]): void {
        let plannerOutputPanel = this.getPlannerOutputPanel();
        plannerOutputPanel.setPlans(plans);
        this.resetTimeout();
    }

    getPlannerOutputPanel(): PlanPreviewPanel {
        let plannerOutputPanel = this.webviewPanels.get(PlanView.PLANNER_OUTPUT_URI);
        if (!plannerOutputPanel) {
            plannerOutputPanel = this.createPreviewPanel('Planner output', PlanView.PLANNER_OUTPUT_URI, ViewColumn.Three);
            this.webviewPanels.set(PlanView.PLANNER_OUTPUT_URI, plannerOutputPanel);
        }

        return plannerOutputPanel;
    }

    setNeedsRebuild(planDocument: TextDocument): void {
        let panel = this.webviewPanels.get(planDocument.uri);

        if (panel) {
            try {
                let plan = this.parsePlanFile(planDocument);
                panel.setPlans([plan]);
            }
            catch (ex) {
                panel.setError(ex);
            }

            this.resetTimeout();
        }
    }

    resetTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => this.rebuild(), 1000);
    }

    dispose(): void {
        clearTimeout(this.timeout);
    }

    rebuild(): void {
        this.webviewPanels.forEach(async (panel) => {
            if (panel.getNeedsRebuild() && panel.getPanel().visible) {
                this.updateContent(panel);
            }
        });
    }

    async updateContent(previewPanel: PlanPreviewPanel) {
        if (!previewPanel.getPanel().webview.html) {
            previewPanel.getPanel().webview.html = "Please wait...";
        }
        previewPanel.setNeedsRebuild(false);
        previewPanel.getPanel().webview.html = await this.getPreviewHtml(previewPanel);
    }

    async revealOrCreatePreview(doc: TextDocument, displayColumn: ViewColumn): Promise<void> {
        let previewPanel = this.webviewPanels.get(doc.uri);

        if (previewPanel) {
            previewPanel.reveal(displayColumn);
        }
        else {
            previewPanel = this.createPreviewPanelForDocument(doc, displayColumn);
            this.webviewPanels.set(doc.uri, previewPanel);
            // when the user closes the tab, remove the panel
            previewPanel.getPanel().onDidDispose(() => this.webviewPanels.delete(doc.uri), undefined, this.context.subscriptions);
            // when the pane becomes visible again, refresh it
            previewPanel.getPanel().onDidChangeViewState(_ => this.rebuild());

            previewPanel.getPanel().webview.onDidReceiveMessage(e => this.handleMessage(previewPanel, e), undefined, this.context.subscriptions);
        }

        this.setNeedsRebuild(doc);
        this.updateContent(previewPanel);
    }

    createPreviewPanelForDocument(doc: TextDocument, displayColumn: ViewColumn): PlanPreviewPanel {
        let previewTitle = `Preview '${path.basename(doc.uri.fsPath)}'`;

        return this.createPreviewPanel(previewTitle, doc.uri, displayColumn);
    }

    createPreviewPanel(previewTitle: string, uri: Uri, displayColumn: ViewColumn): PlanPreviewPanel {
        let webViewPanel = window.createWebviewPanel('planPreview', previewTitle, displayColumn, {
            enableFindWidget: true,
            enableCommandUris: true,
            enableScripts: true,
            localResourceRoots: [Uri.file(path.join(this.context.extensionPath, CONTENT))]
        });

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath("overview/file_type_pddl_plan.svg"));

        return new PlanPreviewPanel(uri, webViewPanel);
    }

    private async getPreviewHtml(previewPanel: PlanPreviewPanel): Promise<string> {
        if (previewPanel.getError()) {
            return previewPanel.getError().message;
        }
        else {
            return new PlanReportGenerator(this.context, this.displayWidth, false)
                .generateHtml(previewPanel.getPlans());
        }
    }

    parsePlanFile(planDocument: TextDocument): Plan {
        try {
            let planFileInfo = <PlanInfo>this.pddlWorkspace.upsertAndParseFile(planDocument.uri.toString(), PddlLanguage.PLAN, planDocument.version, planDocument.getText());

            let domainAndProblem = getDomainAndProblemForPlan(planFileInfo, this.pddlWorkspace);

            return new Plan(planFileInfo.getSteps(), domainAndProblem.domain, domainAndProblem.problem);
        }
        catch (ex) {
            throw new Error("Domain and problem associated with this plan are not open.");
        }
    }

    handleMessage(previewPanel: PlanPreviewPanel, message: any): void {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'savePlanToFile':
                commands.executeCommand(PDDL_EXPORT_PLAN, previewPanel.getSelectedPlan());
                break;
            case 'openInBrowser':
                commands.executeCommand(PDDL_GENERATE_PLAN_REPORT, previewPanel.getPlans(), previewPanel.getSelectedPlan());
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }
}

async function getDotDocument(dotDocumentUri: Uri | undefined): Promise<TextDocument> {
    if (dotDocumentUri) {
        return await workspace.openTextDocument(dotDocumentUri);
    } else {
        if (window.activeTextEditor != null && isPlan(window.activeTextEditor.document)) {
            return window.activeTextEditor.document;
        }
        else {
            return undefined;
        }
    }
}

class PlanPreviewPanel {

    needsRebuild: boolean;
    width: number;
    selectedPlanIndex: number;
    plans: Plan[];
    error: Error;

    constructor(public uri: Uri, private panel: WebviewPanel) { }

    setWidth(width: number): void {
        this.width = width;
    }

    getWidth(): number {
        return this.width;
    }

    setSelectedPlanIndex(selectedPlan: number): void {
        this.selectedPlanIndex = selectedPlan;
    }

    getSelectedPlanIndex(): number {
        return this.selectedPlanIndex;
    }

    getSelectedPlan(): Plan {
        if (this.plans.length > 0) return this.plans[this.selectedPlanIndex];
        else return undefined;
    }

    setPlans(plans: Plan[]): void {
        this.plans = plans;
        this.error = null;
        this.setNeedsRebuild(true);
    }

    setError(ex: Error): void {
        this.error = ex;;
    }

    getError(): Error {
        return this.error;
    }

    getPlans(): Plan[] {
        return this.plans;
    }

    reveal(displayColumn: ViewColumn): void {
        this.panel.reveal(displayColumn);
    }

    setNeedsRebuild(needsRebuild: boolean) {
        this.needsRebuild = needsRebuild;
    }

    getNeedsRebuild(): boolean {
        return this.needsRebuild;
    }

    getPanel(): WebviewPanel {
        return this.panel;
    }
}
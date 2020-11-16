/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, Uri,
    ViewColumn, ExtensionContext, TextDocument, WebviewPanel, Disposable, TextDocumentChangeEvent
} from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import { isPlan, getDomainAndProblemForPlan } from '../workspace/workspaceUtils';
import { PlanReportGenerator } from './PlanReportGenerator';
import { PlanInfo, PLAN } from 'pddl-workspace';
import { Plan } from 'pddl-workspace';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { CONF_PDDL, PLAN_REPORT_WIDTH, PDDL_CONFIGURE_COMMAND } from '../configuration/configuration';
import { Menu } from '../Menu';

const CONTENT = path.join('views', 'planview');
export const PDDL_GENERATE_PLAN_REPORT = 'pddl.planReport';
export const PDDL_EXPORT_PLAN = 'pddl.exportPlan';
export const PDDL_SAVE_AS_EXPECTED_PLAN = 'pddl.saveAsExpectedPlan';

export class PlanView extends Disposable {

    private webviewPanels = new Map<Uri, PlanPreviewPanel>();// todo: replace with UriMap
    private timeout: NodeJS.Timer | undefined;
    public static readonly PLANNER_OUTPUT_URI = Uri.parse("pddl://planner/output");

    constructor(private context: ExtensionContext, private codePddlWorkspace: CodePddlWorkspace) {
        super(() => this.dispose());

        context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.plan.preview", async planUri => {
            const dotDocument = await getPlanDocument(planUri);
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
        }));

        context.subscriptions.push(workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CONF_PDDL + '.' + PLAN_REPORT_WIDTH)) {
                // preview width configuration was updated --> rebuild all views
                this.webviewPanels.forEach(panel => panel.setNeedsRebuild(true));
                this.rebuild();
            }
        }));
    }

    setPlannerOutput(plans: Plan[], reveal: boolean): void {
        const plannerOutputPanel = this.getPlannerOutputPanel();
        plannerOutputPanel.setPlans(plans);
        this.resetTimeout();
        if (plans.length > 0 && reveal) { plannerOutputPanel.reveal(); }
    }

    getPlannerOutputPanel(): PlanPreviewPanel {
        let plannerOutputPanel = this.webviewPanels.get(PlanView.PLANNER_OUTPUT_URI);
        if (!plannerOutputPanel) {
            plannerOutputPanel = this.createPreviewPanel('Planner output', PlanView.PLANNER_OUTPUT_URI, ViewColumn.Three);
            this.webviewPanels.set(PlanView.PLANNER_OUTPUT_URI, plannerOutputPanel);
        }

        return plannerOutputPanel;
    }

    hasPlannerOutput(): boolean {
        return this.webviewPanels.has(PlanView.PLANNER_OUTPUT_URI);
    }

    async setNeedsRebuild(planDocument: TextDocument): Promise<void> {
        const panel = this.webviewPanels.get(planDocument.uri);

        if (panel) {
            try {
                const plan = await this.parsePlanFile(planDocument);
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
        if (this.timeout) { clearTimeout(this.timeout); }
    }

    rebuild(): void {
        this.webviewPanels.forEach(async (panel) => {
            if (panel.getNeedsRebuild() && panel.getPanel().visible) {
                this.updateContent(panel);
            }
        });
    }

    async updateContent(previewPanel: PlanPreviewPanel): Promise<void> {
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
        }

        await this.setNeedsRebuild(doc);
        this.updateContent(previewPanel);
    }

    createPreviewPanelForDocument(doc: TextDocument, displayColumn: ViewColumn): PlanPreviewPanel {
        const previewTitle = `Preview '${path.basename(doc.uri.fsPath)}'`;

        return this.createPreviewPanel(previewTitle, doc.uri, displayColumn);
    }

    createPreviewPanel(previewTitle: string, uri: Uri, displayColumn: ViewColumn): PlanPreviewPanel {
        const webViewPanel = window.createWebviewPanel('planPreview', previewTitle, displayColumn, {
            enableFindWidget: true,
            enableCommandUris: true,
            enableScripts: true,
            localResourceRoots: [Uri.file(this.context.asAbsolutePath(CONTENT))]
        });

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath(path.join("views", "overview", "file_type_pddl_plan.svg")));

        const previewPanel = new PlanPreviewPanel(uri, webViewPanel);

        // when the user closes the tab, remove the panel
        previewPanel.getPanel().onDidDispose(() => this.webviewPanels.delete(uri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        previewPanel.getPanel().onDidChangeViewState(() => this.rebuild());

        previewPanel.getPanel().webview.onDidReceiveMessage(e => this.handleMessage(previewPanel, e), undefined, this.context.subscriptions);

        return previewPanel;
    }

    private async getPreviewHtml(previewPanel: PlanPreviewPanel): Promise<string> {
        if (previewPanel.getError()) {
            return previewPanel.getError()!.message;
        }
        else {
            const width = workspace.getConfiguration(CONF_PDDL).get<number>(PLAN_REPORT_WIDTH, 300);
            return new PlanReportGenerator(this.context, { displayWidth: width, selfContained: false, resourceUriConverter: previewPanel.getPanel().webview })
                .generateHtml(previewPanel.getPlans());
        }
    }

    async parsePlanFile(planDocument: TextDocument): Promise<Plan> {
        const planFileInfo = await this.codePddlWorkspace.upsertAndParseFile(planDocument) as PlanInfo;

        try {
            const domainAndProblem = getDomainAndProblemForPlan(planFileInfo, this.codePddlWorkspace.pddlWorkspace);

            return planFileInfo.getPlan(domainAndProblem.domain, domainAndProblem.problem);
        }
        catch (ex) {
            // show a hint that domain & problem were not associated
            return new Plan(planFileInfo.getSteps());
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleMessage(previewPanel: PlanPreviewPanel, message: any): void {
        console.log(`Message received from the webview: ${message.command}`);

        switch (message.command) {
            case 'selectPlan':
                const planIndex: number = message.planIndex;
                previewPanel.setSelectedPlanIndex(planIndex);
                break;
            case 'showMenu':
                this.showMenu(previewPanel);
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }

    // tslint:disable-next-line:no-unused-expression
    async showMenu(previewPanel: PlanPreviewPanel): Promise<void> {
        await new Menu([
            {
                label: "$(browser) Generate plan report",
                detail: "Creates a self-contained HTML file and opens it in a default browser",
                command: PDDL_GENERATE_PLAN_REPORT,
                args: [previewPanel.getPlans(), previewPanel.getSelectedPlanIndex()]
            },
            {
                label: "$(file) Export as .plan file...",
                detail: "Opens a file picker to confirm the name and location of the plan file.",
                command: PDDL_EXPORT_PLAN,
                args: [previewPanel.getSelectedPlan()]
            },
            {
                label: "$(beaker) Creates PDDL test with expected test assertion",
                detail: "Saves this plan into PDDL Test as expected plan assertion.",
                command: PDDL_SAVE_AS_EXPECTED_PLAN,
                args: [previewPanel.getSelectedPlan()]
            },
            {
                label: "$(arrow-both) Change width...",
                detail: "Select the width for the plan preview (in pixels)",
                command: PDDL_CONFIGURE_COMMAND,
                args: [CONF_PDDL + '.' + PLAN_REPORT_WIDTH]
            },
            {
                label: "$(arrow-both) $(browser) Change report width...",
                detail: "Select the width of the next exported report (in pixels)",
                command: PDDL_CONFIGURE_COMMAND,
                args: ["pddl.planReport.exportWidth"]
            }
        ],
            { placeHolder: 'Select an action...' }
        ).show();
    }
}

async function getPlanDocument(dotDocumentUri: Uri | undefined): Promise<TextDocument | undefined> {
    if (dotDocumentUri) {
        return await workspace.openTextDocument(dotDocumentUri);
    } else {
        if (window.activeTextEditor !== undefined && isPlan(window.activeTextEditor.document)) {
            return window.activeTextEditor.document;
        }
        else {
            return undefined;
        }
    }
}

class PlanPreviewPanel {

    private needsRebuild = false;
    private width = 200;
    selectedPlanIndex = 0;
    plans: Plan[] = [];
    error: Error | undefined;

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

    getSelectedPlan(): Plan | undefined {
        if (this.plans.length > 0) { return this.plans[this.selectedPlanIndex]; }
        else { return undefined; }
    }

    setPlans(plans: Plan[]): void {
        this.plans = plans;
        this.selectedPlanIndex = plans ? plans.length - 1 : 0;
        this.error = undefined;
        this.setNeedsRebuild(true);
    }

    setError(ex: Error): void {
        this.error = ex;
    }

    getError(): Error | undefined {
        return this.error;
    }

    getPlans(): Plan[] {
        return this.plans;
    }

    reveal(displayColumn?: ViewColumn): void {
        this.panel.reveal(displayColumn);
    }

    setNeedsRebuild(needsRebuild: boolean): void {
        this.needsRebuild = needsRebuild;
    }

    getNeedsRebuild(): boolean {
        return this.needsRebuild;
    }

    getPanel(): WebviewPanel {
        return this.panel;
    }
}
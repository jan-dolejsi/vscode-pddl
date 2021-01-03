/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, Uri,
    ViewColumn, ExtensionContext, TextDocument, WebviewPanel, Disposable, TextDocumentChangeEvent, Webview, commands
} from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import { isPlan, getDomainAndProblemForPlan } from '../workspace/workspaceUtils';
import { PlanInfo, PLAN } from 'pddl-workspace';
import { Plan } from 'pddl-workspace';

import * as path from 'path';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { CONF_PDDL, PLAN_REPORT_WIDTH, PDDL_CONFIGURE_COMMAND, VAL_STEP_PATH, VALUE_SEQ_PATH, VAL_VERBOSE, PLAN_REPORT_LINE_PLOT_GROUP_BY_LIFTED } from '../configuration/configuration';
import { Menu } from '../Menu';
import { makeSerializable } from 'pddl-workspace/dist/utils/serializationUtils';
import { createPddlExtensionContext, ensureAbsoluteGlobalStoragePath, getWebViewHtml } from '../utils';
import { LinePlotData } from './model';
import { PlanFunctionEvaluator } from 'ai-planning-val';
import { PlanReportGenerator } from './PlanReportGenerator';

const VIEWS = "views";
const COMMON_FOLDER = path.join(VIEWS, "common");
const STATIC_CONTENT_FOLDER = path.join(VIEWS, 'planview', 'static');
// const JS_FOLDER = path.join(VIEWS, 'planview', 'out');

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
            const planDocument = await getPlanDocument(planUri);
            if (planDocument) {
                return this.revealOrCreatePreview(planDocument, ViewColumn.Beside);
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
        previewPanel.setNeedsRebuild(false);

        if (previewPanel.getError()) {
            previewPanel.getPanel().webview.postMessage({ command: 'error', message: previewPanel.getError().message});
        }
        else {
            const width = workspace.getConfiguration(CONF_PDDL).get<number>(PLAN_REPORT_WIDTH, 300);

            // todo: only send the additional plan, not all of them
            const plans = previewPanel.getPlans()
                .map(p => makeSerializable(p));
            previewPanel.getPanel().webview.postMessage({ command: 'showPlans', plans: plans, width: width });
        }
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
            localResourceRoots: [Uri.file(this.context.asAbsolutePath(VIEWS))]
        });

        webViewPanel.iconPath = Uri.file(this.context.asAbsolutePath(path.join("views", "overview", "file_type_pddl_plan.svg")));

        this.getHtml(webViewPanel.webview).then(html => 
            webViewPanel.webview.html = html);

        const previewPanel = new PlanPreviewPanel(uri, webViewPanel);

        // when the user closes the tab, remove the panel
        previewPanel.getPanel().onDidDispose(() => this.webviewPanels.delete(uri), undefined, this.context.subscriptions);
        // when the pane becomes visible again, refresh it
        previewPanel.getPanel().onDidChangeViewState(() => this.rebuild());

        previewPanel.getPanel().webview.onDidReceiveMessage(e => this.handleMessage(previewPanel, e), undefined, this.context.subscriptions);

        return previewPanel;
    }

    async getHtml(webview: Webview): Promise<string> {
        const googleCharts = Uri.parse("https://www.gstatic.com/charts/");
        return getWebViewHtml(createPddlExtensionContext(this.context), {
            relativePath: STATIC_CONTENT_FOLDER, htmlFileName: 'plans.html',
            externalImages: [Uri.parse('data:')],
            allowUnsafeInlineScripts: true,
            externalScripts: [googleCharts],
            externalStyles: [googleCharts],
            fonts: [
                Uri.file(path.join("..", "..", "..", COMMON_FOLDER, "codicon.ttf"))
            ]
        }, webview);
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
            case 'onload':
                // Webview (and its resources) finished loading
                this.updateContent(previewPanel);
                break;
            case 'linePlotDataRequest': {
                const planIndex: number = message.planIndex;
                this.getLinePlotData(previewPanel, planIndex);
                break;
            }
            case 'selectPlan':
                const planIndex: number = message.planIndex;
                previewPanel.setSelectedPlanIndex(planIndex);
                break;
            case 'showMenu':
                this.showMenu(previewPanel);
                break;
            case 'revealAction':
                commands.executeCommand("pddl.revealAction", Uri.file(message.domainUri.fsPath), message.action);
                break;
            default:
                console.warn('Unexpected command: ' + message.command);
        }
    }

    async getLinePlotData(previewPanel: PlanPreviewPanel, planIndex: number): Promise<void> {
        if (planIndex >= previewPanel.getPlans().length) {
            console.error(`requesting data for plan index {} while there are only {} plans`, planIndex, previewPanel.getPlans().length);
            return;
        }

        const plan = previewPanel.getPlans()[planIndex];

        const valStepPath = ensureAbsoluteGlobalStoragePath(workspace.getConfiguration(CONF_PDDL).get<string>(VAL_STEP_PATH), this.context);
        const valueSeqPath = ensureAbsoluteGlobalStoragePath(workspace.getConfiguration(CONF_PDDL).get<string>(VALUE_SEQ_PATH), this.context);
        const valVerbose = workspace.getConfiguration(CONF_PDDL).get<boolean>(VAL_VERBOSE, false);

        if (plan.domain && plan.problem) {
            const groupByLifted = workspace.getConfiguration(CONF_PDDL).get<boolean>(PLAN_REPORT_LINE_PLOT_GROUP_BY_LIFTED, true);
            const evaluator = new PlanFunctionEvaluator(plan, { valStepPath, valueSeqPath, shouldGroupByLifted: groupByLifted, verbose: valVerbose });

            if (evaluator.isAvailable()) {

                try {

                    const functionValues = await evaluator.evaluate();

                    functionValues.forEach((values, liftedVariable) => {
                        let chartTitleWithUnit = values.legend.length > 1 ? liftedVariable.name : liftedVariable.getFullName();
                        if (liftedVariable.getUnit()) { chartTitleWithUnit += ` [${liftedVariable.getUnit()}]`; }

                        this.sendLinePlotData(previewPanel, {
                            planIndex: planIndex,
                            name: chartTitleWithUnit,
                            unit: liftedVariable.getUnit(),
                            legend: values.legend,
                            data: values.values
                        });
                    });

                    // add one plot for declared metric
                    // todo: use valstep's ability to handle metric directly
                    for (let metricIndex = 0; metricIndex < plan.problem.getMetrics().length; metricIndex++) {
                        const metric = plan.problem.getMetrics()[metricIndex];

                        const metricValues = await evaluator.evaluateExpression(metric.getExpression());
                        const chartTitle = metric.getDocumentation()[metric.getDocumentation().length - 1] ?? "Metric";

                        this.sendLinePlotData(previewPanel, {
                            planIndex: planIndex,
                            name: chartTitle,
                            unit: "",
                            legend: [''],
                            data: metricValues.values
                        });
                    }

                } catch (err) {
                    console.error(err);
                    const valStepPath = evaluator.getValStepPath();
                    if (valStepPath) {
                        PlanReportGenerator.handleValStepError(err, valStepPath);
                    }
                }
            }
            else {
                previewPanel.getPanel().webview.postMessage({
                    "command": "setVisibility",
                    "elementId": "downloadVal",
                    "visible": true
                });
            }
        } else {
            previewPanel.getPanel().webview.postMessage({
                "command": "setVisibility",
                "elementId": "domainProblemAssociation",
                "visible": true
            });
        }
    }

    sendLinePlotData(previewPanel: PlanPreviewPanel, data: LinePlotData): void {
        previewPanel.getPanel().webview.postMessage({
            "command": "showLinePlot",
            "data": data
        });
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
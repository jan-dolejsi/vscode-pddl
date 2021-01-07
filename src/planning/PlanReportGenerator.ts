/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    ExtensionContext, workspace, window, env, Uri
} from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import opn = require('open');

import { DomainInfo, PlanStep, PlanStepCommitment, HappeningType, Plan, HelpfulAction, PddlWorkspace, VariableExpression } from 'pddl-workspace';
import { PlanFunctionEvaluator, Util as ValUtil, ValStepError, ValStep } from 'ai-planning-val';
import { capitalize } from 'pddl-gantt';
import { SwimLane } from './SwimLane';
import { PlanReportSettings } from './PlanReportSettings';
import { VAL_STEP_PATH, CONF_PDDL, VALUE_SEQ_PATH, PLAN_REPORT_LINE_PLOT_GROUP_BY_LIFTED, DEFAULT_EPSILON, VAL_VERBOSE } from '../configuration/configuration';
import { ensureAbsoluteGlobalStoragePath, WebviewUriConverter } from '../utils';

const DIGITS = 4;

export class PlanReportGenerator {

    planStepHeight = 20;
    settings: Map<Plan, PlanReportSettings> = new Map();

    constructor(private context: ExtensionContext, private options: PlanReportOptions) {

    }

    async export(plans: Plan[], planId: number): Promise<boolean> {
        const html = await this.generateHtml(plans, planId);

        const htmlFile = await ValUtil.toFile("plan-report", ".html", html);
        const uri = Uri.parse("file://" + htmlFile);
        opn(uri.toString());
        return true; //env.openExternal(uri);
    }

    async generateHtml(plans: Plan[], planId = -1): Promise<string> {
        const selectedPlan = planId < 0 ? plans.length - 1 : planId;

        const maxCost = Math.max(...plans.map(plan => plan.metric ?? 0));

        const planSelectors = plans.map((plan, planIndex) => this.renderPlanSelector(plan, planIndex, selectedPlan, maxCost)).join(" ");

        const planSelectorsDisplayStyle = plans.length > 1 ? "flex" : "none";

        const planHtmlArr: string[] = await Promise.all(plans.map(async (plan, planIndex) => await this.renderPlan(plan, planIndex, selectedPlan)));
        const plansHtml = planHtmlArr.join("\n\n");
        const plansChartsScript = this.createPlansChartsScript(plans);
        const relativePath = path.join('views', 'planview');
        const staticPath = path.join(relativePath, 'static');
        const ganttStylesPath = path.join('node_modules', 'pddl-gantt', 'styles');
        const html = `<!DOCTYPE html>
        <head>
            <title>Plan report</title>
            <meta http-equiv="Content-Security-Policy"
                content="default-src 'none'; img-src vscode-resource: https: data:; script-src vscode-resource: https://www.gstatic.com/charts/ 'unsafe-inline'; style-src vscode-resource: https://www.gstatic.com/charts/ 'unsafe-inline';"
            />    
            ${await this.includeStyle(this.asAbsolutePath(ganttStylesPath, 'pddl-gantt.css'))}
            ${await this.includeStyle(this.asAbsolutePath(staticPath, 'menu.css'))}
            ${await this.includeScript(this.asAbsolutePath(path.join(relativePath, 'out'), 'plans.js'))}
            <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
            ${await this.includeScript(this.asAbsolutePath(staticPath, 'charts.js'))}
        </head>
        <body onload="scrollPlanSelectorIntoView(${selectedPlan})">
            <div class="planSelectors" style="display: ${planSelectorsDisplayStyle};">${planSelectors}
            </div>
        ${plansHtml}
        ${plansChartsScript}
        </body>`;

        return html;
    }

    asAbsolutePath(...paths: string[]): Uri {
        let uri = Uri.file(this.context.asAbsolutePath(path.join(...paths)));
        if (!this.options.selfContained && this.options.resourceUriConverter) {
            uri = this.options.resourceUriConverter.asWebviewUri(uri);
        }
        return uri;
    }

    renderPlanSelector(plan: Plan, planIndex: number, selectedPlan: number, maxCost: number): string {
        let className = "planSelector";
        if (planIndex === selectedPlan) { className += " planSelector-selected"; }

        const normalizedCost = (plan.cost ?? 0) / maxCost * 100;
        const costRounded = plan.cost ? plan.cost.toFixed(DIGITS) : NaN;
        const tooltip = `Plan #${planIndex}
Metric value / cost: ${plan.cost}
Makespan: ${plan.makespan}
States evaluated: ${plan.statesEvaluated}`;

        return `
        <div class="${className}" plan="${planIndex}" onclick="showPlan(${planIndex})"><span>${costRounded}</span>
            <div class="planMetricBar" style="height: ${normalizedCost}px" title="${tooltip}"></div>
        </div>`;
    }

    shouldDisplay(planStep: PlanStep, plan: Plan): boolean {
        if (this.settings.has(plan)) {
            return this.settings.get(plan)!.shouldDisplay(planStep);
        }
        else { return true; }
    }

    async renderPlan(plan: Plan, planIndex: number, selectedPlan: number): Promise<string> {
        plan = capitalize(plan);

        let planVisualizerPath: string | undefined;
        if (plan.domain) {
            const settings = new PlanReportSettings(plan.domain.fileUri.toString());
            planVisualizerPath = settings.getPlanVisualizerScript();
            this.settings.set(plan, settings);
        }

        const styleDisplay = planIndex === selectedPlan ? "block" : "none";

        let stateViz = '';
        if (planVisualizerPath && plan.domain) {
            const absPath = path.join(PddlWorkspace.getFolderPath(plan.domain.fileUri), planVisualizerPath);
            try {
                delete require.cache[require.resolve(absPath)];
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const visualize = require(absPath);
                stateViz = visualize(plan, 300, 100);
                // todo: document.getElementById("stateviz").innerHTML = stateViz;
                stateViz = `<div class="stateView" plan="${planIndex}" style="margin: 5px; width: 300px; height: 100px; display: ${styleDisplay};">${stateViz}</div>`;
            }
            catch (ex) {
                console.warn(ex);
            }
        }

        const stepsToDisplay = plan.steps
            .filter(step => this.shouldDisplay(step, plan));

        // split this to two batches and insert helpful actions in between
        const planHeadSteps = stepsToDisplay
            .filter(step => this.isPlanHeadStep(step, plan));
        const relaxedPlanSteps = stepsToDisplay
            .filter(step => !this.isPlanHeadStep(step, plan));

        const oneIfHelpfulActionsPresent = (plan.hasHelpfulActions() ? 1 : 0);
        const relaxedPlanStepIndexOffset = planHeadSteps.length + oneIfHelpfulActionsPresent;

        const ganttChartHtml = planHeadSteps
            .map((step, stepIndex) => this.renderGanttStep(step, stepIndex, plan, planIndex)).join("\n")
            + this.renderHelpfulActions(plan, planHeadSteps.length) + '\n'
            + relaxedPlanSteps
                .map((step, stepIndex) => this.renderGanttStep(step, stepIndex + relaxedPlanStepIndexOffset, plan, planIndex)).join("\n");

        const ganttChartHeight = (stepsToDisplay.length + oneIfHelpfulActionsPresent) * this.planStepHeight;

        const ganttChart = `    <div class="gantt" plan="${planIndex}" style="margin: 5px; height: ${ganttChartHeight}px; display: ${styleDisplay};">
    ${ganttChartHtml}
        </div>`;

        let objectsHtml = '';
        if (!this.options.disableSwimLaneView && plan.domain && plan.problem) {
            const allTypeObjects = plan.domain.getConstants().merge(plan.problem.getObjectsTypeMap());

            objectsHtml = plan.domain.getTypes()
                .filter(type => type !== "object")
                .map(type => {
                    const typeObjects = allTypeObjects.getTypeCaseInsensitive(type);
                    return typeObjects
                        ? this.renderTypeSwimLanes(type, typeObjects.getObjects(), plan)
                        : '';
                }).join("\n");
        }

        const swimLanes = `    <div class="resourceUtilization" plan="${planIndex}" style="display: ${styleDisplay};">
        <table>
${objectsHtml}
        </table>
    </div>`;

        const valStepPath = ensureAbsoluteGlobalStoragePath(workspace.getConfiguration(CONF_PDDL).get<string>(VAL_STEP_PATH), this.context);
        const valueSeqPath = ensureAbsoluteGlobalStoragePath(workspace.getConfiguration(CONF_PDDL).get<string>(VALUE_SEQ_PATH), this.context);
        const valVerbose = workspace.getConfiguration(CONF_PDDL).get<boolean>(VAL_VERBOSE, false);

        let lineCharts = `    <div class="lineChart" plan="${planIndex}" style="display: ${styleDisplay};margin-top: 20px;">\n`;
        let lineChartScripts = '';

        if (!this.options.disableLinePlots && plan.domain && plan.problem) {
            const groupByLifted = workspace.getConfiguration(CONF_PDDL).get<boolean>(PLAN_REPORT_LINE_PLOT_GROUP_BY_LIFTED, true);
            const evaluator = new PlanFunctionEvaluator(plan, { valStepPath, valueSeqPath, shouldGroupByLifted: groupByLifted, verbose: valVerbose });

            if (evaluator.isAvailable()) {

                try {

                    const functionValues = await evaluator.evaluate();

                    functionValues.forEach((values, liftedVariable) => {
                        const chartDivId = `chart_${planIndex}_${liftedVariable.declaredName}`;
                        lineCharts += this.createLineChartDiv(chartDivId);
                        let chartTitleWithUnit = values.legend.length > 1 ? liftedVariable.name : liftedVariable.getFullName();
                        if (liftedVariable.getUnit()) { chartTitleWithUnit += ` [${liftedVariable.getUnit()}]`; }
                        lineChartScripts += `        drawChart('${chartDivId}', '${chartTitleWithUnit}', '', ${JSON.stringify(values.legend)}, ${JSON.stringify(values.values)}, ${this.options.displayWidth});\n`;
                    });

                    // add one plot for declared metric
                    for (let metricIndex = 0; metricIndex < plan.problem.getMetrics().length; metricIndex++) {
                        const metric = plan.problem.getMetrics()[metricIndex];
                        const metricExpression = metric.getExpression();
                        if (metricExpression instanceof VariableExpression) {
                            if (metricExpression.name === "total-time") {
                                continue;
                            }
                        }

                        const metricValues = await evaluator.evaluateExpression(metric.getExpression());
                        const chartDivId = `chart_${planIndex}_metric${metricIndex}`;
                        lineCharts += this.createLineChartDiv(chartDivId);
                        const chartTitleWithUnit = metric.getDocumentation()[metric.getDocumentation().length - 1];
                        lineChartScripts += `        drawChart('${chartDivId}', '${chartTitleWithUnit}', '', ['${/*unit?*/""}'], ${JSON.stringify(metricValues.values)}, ${this.options.displayWidth});\n`;
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
                lineCharts += `<a href="command:pddl.downloadVal" title="Click to initiate download. You will be able to see what is being downloaded and from where...">Download plan validation tools (a.k.a. VAL) to see line plots of function values.</a>`;
            }
        }
        lineCharts += `\n    </div>`;

        const hint = plan.domain && plan.problem ? '' : `<div class="hint"><b>Hint:</b> Problem file was not identified for this plan. Open the associated domain and problem and visualize the plan again.</div>`;

        return `${this.options.selfContained || this.options.disableHamburgerMenu ? '' : this.renderMenu()}
${stateViz}
${ganttChart}
${swimLanes}
${lineCharts}
${hint}
        <script>function drawPlan${planIndex}Charts(){\n${lineChartScripts}}</script>
`;
    }

    private createLineChartDiv(chartDivId: string): string {
        return `        <div id="${chartDivId}" style="width: ${this.options.displayWidth + 100}px; height: ${Math.round(this.options.displayWidth / 2)}px"></div>\n`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async handleValStepError(err: any, valStepPath: string): Promise<void> {
        if (err instanceof ValStepError) {
            try {
                const exportCase = "Export valstep case...";
                const choice = await window.showErrorMessage("ValStep failed to evaluate the plan values.", exportCase, "Ignore");
                if (choice === exportCase) {
                    const targetPathUris = await window.showOpenDialog({
                        canSelectFolders: true, canSelectFiles: false,
                        defaultUri: Uri.file(path.dirname(err.domain.fileUri.fsPath)),
                        openLabel: 'Select target folder'
                    });
                    if (!targetPathUris) { return; }
                    const targetPath = targetPathUris[0];
                    const outputPath = await ValStep.storeError(err, targetPath.fsPath, valStepPath);
                    const success = await env.openExternal(Uri.file(outputPath));
                    if (!success) {
                        window.showErrorMessage(`Files for valstep bug report: ${outputPath}.`);
                    }
                }
            }
            catch (err1) {
                console.log(err1);
            }
        }
        else {
            window.showWarningMessage(err?.message ?? err);
        }
    }

    renderHelpfulActions(plan: Plan, planHeadLength: number): string {
        if (plan.hasHelpfulActions()) {
            const fromTop = planHeadLength * this.planStepHeight;
            const fromLeft = this.toViewCoordinates(plan.now, plan);
            const text = plan.helpfulActions?.map((helpfulAction, index) => this.renderHelpfulAction(index, helpfulAction)).join(', ');
            return `\n        <div class="planstep" style="top: ${fromTop}px; left: ${fromLeft}px; margin-top: 3px">▶ ${text}</div>`;
        }
        else {
            return '';
        }
    }

    renderHelpfulAction(index: number, helpfulAction: HelpfulAction): string {
        const suffix = PlanReportGenerator.getActionSuffix(helpfulAction);
        const beautifiedName = `${helpfulAction.actionName}<sub>${suffix}</sub>`;
        return `${index + 1}. <a href="#" onclick="navigateToChildOfSelectedState('${helpfulAction.actionName}')">${beautifiedName}</a>`;
    }

    static getActionSuffix(helpfulAction: HelpfulAction): string {
        switch (helpfulAction.kind) {
            case HappeningType.START:
                return '├';
            case HappeningType.END:
                return '┤';
        }
        return '';
    }

    isPlanHeadStep(step: PlanStep, plan: Plan): boolean {
        return plan.now === undefined ||
            step.commitment === PlanStepCommitment.Committed ||
            step.commitment === PlanStepCommitment.EndsInRelaxedPlan;
    }

    createPlansChartsScript(plans: Plan[]): string {
        const selectedPlan = plans.length - 1;
        return `        <script>
                google.charts.setOnLoadCallback(drawCharts);
                function drawCharts() {
                    drawPlan${selectedPlan}Charts();
                }
        </script>`;
    }

    renderTypeSwimLanes(type: string, objects: string[], plan: Plan): string {
        return `            <tr>
                <th>${type}</th>
                <th style="width: ${this.options.displayWidth}px"></th>
            </tr>
`
            + objects.map(obj => this.renderObjectSwimLane(obj, plan)).join('\n');
    }

    renderObjectSwimLane(obj: string, plan: Plan): string {
        const subLanes = new SwimLane(1);
        const stepsInvolvingThisObject = plan.steps
            .filter(step => this.shouldDisplay(step, plan))
            .filter(step => this.shouldDisplayObject(step, obj, plan))
            .map(step => this.renderSwimLameStep(step, plan, obj, subLanes))
            .join('\n');

        return `            <tr>
                <td class="objectName"><div>${obj}</div></td>
                <td style="position: relative; height: ${subLanes.laneCount() * this.planStepHeight}px;">
${stepsInvolvingThisObject}
                </td>
            </tr>
`;
    }

    private shouldDisplayObject(step: PlanStep, obj: string, plan: Plan): boolean {
        if (!this.settings.has(plan)) {
            return true;
        }

        const liftedAction = plan.domain?.getActions()
            .find(a => a.getNameOrEmpty().toLowerCase() === step.getActionName().toLowerCase());

        if (!liftedAction) {
            console.debug('Unexpected plan action: ' + step.getActionName());
            return true;
        }

        let fromArgument = 0;
        do {
            const indexOfArgument = step.getObjects().indexOf(obj.toLowerCase(), fromArgument);
            fromArgument = indexOfArgument + 1;
            if (indexOfArgument > -1 && indexOfArgument < liftedAction.parameters.length) {
                const parameter = liftedAction.parameters[indexOfArgument];
                const shouldIgnoreThisArgument = this.settings.get(plan)?.shouldIgnoreActionParameter(liftedAction.name ?? 'unnamed', parameter.name);
                if (!shouldIgnoreThisArgument) {
                    return true;
                }
            }
        } while (fromArgument > 0);

        return false;
    }

    renderSwimLameStep(step: PlanStep, plan: Plan, thisObj: string, swimLanes: SwimLane): string {
        const actionColor = this.getActionColor(step, plan.domain);
        const leftOffset = this.computeLeftOffset(step, plan);
        const width = this.computeWidth(step, plan) + this.computeRelaxedWidth(step, plan);
        const objects = step.getObjects()
            .map(obj => obj.toLowerCase() === thisObj.toLowerCase() ? '@' : obj)
            .join(' ');

        const availableLane = swimLanes.placeNext(leftOffset, width);
        const fromTop = availableLane * this.planStepHeight + 1;

        return `
                    <div class="resourceTaskTooltip" style="background-color: ${actionColor}; left: ${leftOffset}px; width: ${width}px; top: ${fromTop}px;">${step.getActionName()} ${objects}<span class="resourceTaskTooltipText">${this.toActionTooltip(step)}</span></div>`;
    }

    renderGanttStep(step: PlanStep, index: number, plan: Plan, planIndex: number): string {
        const actionLink = this.toActionLink(step.getActionName(), plan);

        const fromTop = index * this.planStepHeight;
        const fromLeft = this.computeLeftOffset(step, plan);
        const width = this.computeWidth(step, plan);
        const widthRelaxed = this.computeRelaxedWidth(step, plan);

        const actionColor = plan.domain ? this.getActionColor(step, plan.domain) : 'gray';
        const actionIterations = step.getIterations() > 1 ? `${step.getIterations()}x` : '';

        return `        <div class="planstep" id="plan${planIndex}step${index}" style="left: ${fromLeft}px; top: ${fromTop}px; "><div class="planstep-bar" title="${this.toActionTooltipPlain(step)}" style="width: ${width}px; background-color: ${actionColor}"></div><div class="planstep-bar-relaxed whitecarbon" style="width: ${widthRelaxed}px;"></div>${actionLink} ${step.getObjects().join(' ')} ${actionIterations}</div>`;
    }

    toActionLink(actionName: string, plan: Plan): string {
        if (this.options.selfContained || !plan.domain) {
            return actionName;
        }
        else {
            const revealActionUri = encodeURI('command:pddl.revealAction?' + JSON.stringify([plan.domain.fileUri, actionName]));
            return `<a href="${revealActionUri}" title="Reveal '${actionName}' action in the domain file">${actionName}</a>`;
        }
    }

    toActionTooltip(step: PlanStep): string {
        const durationRow = step.isDurative && step.getDuration() !== undefined ?
            `<tr><td class="actionToolTip">Duration: </td><td class="actionToolTip">${step.getDuration()?.toFixed(DIGITS)}</td></tr>
            <tr><td class="actionToolTip">End: </td><td class="actionToolTip">${step.getEndTime().toFixed(DIGITS)}</td></tr>` :
            '';
        return `<table><tr><th colspan="2" class="actionToolTip">${step.getActionName()} ${step.getObjects().join(' ')}</th></tr><tr><td class="actionToolTip" style="width:50px">Start:</td><td class="actionToolTip">${step.getStartTime().toFixed(DIGITS)}</td></tr>${durationRow}</table>`;
    }

    toActionTooltipPlain(step: PlanStep): string {
        const durationRow = step.isDurative && step.getDuration() !== undefined ?
            `Duration: ${step.getDuration()?.toFixed(DIGITS)}, End: ${step.getEndTime().toFixed(DIGITS)}` :
            '';

        const startTime = step.getStartTime() !== undefined ?
            `, Start: ${step.getStartTime().toFixed(DIGITS)}` :
            '';

        return `${step.getActionName()} ${step.getObjects().join(' ')}${startTime} ${durationRow}`;
    }

    async includeStyle(uri: Uri): Promise<string> {
        if (this.options.selfContained) {
            const styleText = await fs.promises.readFile(uri.fsPath, { encoding: 'utf-8' });
            return `<style>\n${styleText}\n</style>`;
        } else {
            return `<link rel = "stylesheet" type = "text/css" href = "${uri.toString()}" />`;
        }
    }

    async includeScript(uri: Uri): Promise<string> {
        if (this.options.selfContained) {
            const scriptText = await fs.promises.readFile(uri.fsPath, { encoding: 'utf-8' });
            return `<script>\n${scriptText}\n</script>`;
        } else {
            return `<script src="${uri.toString()}"></script>`;
        }
    }

    computeLeftOffset(step: PlanStep, plan: Plan): number {
        return this.toViewCoordinates(step.getStartTime(), plan);
    }

    renderMenu(): string {
        return `    <div class="menu" onclick="postCommand('showMenu')" title="Click to show menu options...">&#x2630;</div>`;
    }

    computePlanHeadDuration(step: PlanStep, plan: Plan): number {
        if (plan.now === undefined) { return step.getDuration() ?? DEFAULT_EPSILON; }
        else if (step.getEndTime() < plan.now) {
            if (step.commitment === PlanStepCommitment.Committed) { return step.getDuration() ?? DEFAULT_EPSILON; }
            else { return 0; } // the end was not committed yet
        }
        else if (step.getStartTime() >= plan.now) { return 0; }
        else {
            switch (step.commitment) {
                case PlanStepCommitment.Committed:
                    return step.getDuration() ?? DEFAULT_EPSILON;
                case PlanStepCommitment.EndsInRelaxedPlan:
                    return 0;
                case PlanStepCommitment.StartsInRelaxedPlan:
                    return plan.now - step.getStartTime();
                default:
                    return 0; // should not happen
            }
        }
    }

    computeWidth(step: PlanStep, plan: Plan): number {
        // remove the part of the planStep duration that belongs to the relaxed plan
        const planHeadDuration = this.computePlanHeadDuration(step, plan);
        return Math.max(1, this.toViewCoordinates(planHeadDuration, plan));
    }

    computeRelaxedWidth(step: PlanStep, plan: Plan): number {
        const planHeadDuration = this.computePlanHeadDuration(step, plan);
        // remove the part of the planStep duration that belongs to the planhead part
        const relaxedDuration = (step.getDuration() ?? DEFAULT_EPSILON) - planHeadDuration;
        return this.toViewCoordinates(relaxedDuration, plan);
    }

    /** Converts the _time_ argument to view coordinates */
    toViewCoordinates(time: number | undefined, plan: Plan): number {
        return (time ?? 0) / plan.makespan * this.options.displayWidth;
    }

    getActionColor(step: PlanStep, domain?: DomainInfo): string {
        const actionIndex = domain?.getActions()
            .findIndex(action => action.getNameOrEmpty().toLowerCase() === step.getActionName().toLowerCase());
        if (actionIndex === undefined || actionIndex < 0) {
            return 'gray';
        }
        else {
            return this.colors[actionIndex * 7 % this.colors.length];
        }
    }

    colors = ['#ff0000', '#ff4000', '#ff8000', '#ffbf00', '#ffff00', '#bfff00', '#80ff00', '#40ff00', '#00ff00', '#00ff40', '#00ff80', '#00ffbf', '#00ffff', '#00bfff', '#0080ff', '#0040ff', '#0000ff', '#4000ff', '#8000ff', '#bf00ff', '#ff00ff', '#ff00bf', '#ff0080', '#ff0040'];
}

export interface PlanReportOptions {
    displayWidth: number;
    selfContained?: boolean;
    disableSwimLaneView?: boolean;
    disableLinePlots?: boolean;
    disableHamburgerMenu?: boolean;
    resourceUriConverter?: WebviewUriConverter;
}
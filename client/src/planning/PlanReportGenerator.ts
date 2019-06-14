/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    ExtensionContext, workspace, window, env, Uri
} from 'vscode';

import * as path from 'path';

import { DomainInfo, TypeObjects } from '../../../common/src/parser';
import { SwimLane } from '../../../common/src/SwimLane';
import { PlanStep, PlanStepCommitment } from '../../../common/src/PlanStep';
import { HappeningType } from '../../../common/src/HappeningsInfo';
import { Plan, HelpfulAction } from '../../../common/src/Plan';
import { Util } from '../../../common/src/util';
import { PlanFunctionEvaluator } from './PlanFunctionEvaluator';
import { PlanReportSettings } from './PlanReportSettings';
import { VAL_STEP_PATH, CONF_PDDL, VALUE_SEQ_PATH } from '../configuration';
import * as afs from '../asyncfs';
import { ValStepError, ValStep } from '../debugger/ValStep';
const DIGITS = 4;

export class PlanReportGenerator {

    planStepHeight = 20;
    settings: Map<Plan, PlanReportSettings> = new Map();

    constructor(private context: ExtensionContext, private options: PlanReportOptions) {

    }

    async export(plans: Plan[], planId: number): Promise<boolean> {
        let html = await this.generateHtml(plans, planId);

        let htmlFile = await Util.toFile("plan-report", ".html", html);

        return env.openExternal(Uri.parse("file://" + htmlFile));
    }

    async generateHtml(plans: Plan[], planId: number = -1): Promise<string> {
        let selectedPlan = planId < 0 ? plans.length - 1 : planId;

        let maxCost = Math.max(...plans.map(plan => plan.cost));

        let planSelectors = plans.map((plan, planIndex) => this.renderPlanSelector(plan, planIndex, selectedPlan, maxCost)).join(" ");

        let planSelectorsDisplayStyle = plans.length > 1 ? "flex" : "none";

        let planHtmlArr: string[] = await Promise.all(plans.map(async (plan, planIndex) => await this.renderPlan(plan, planIndex, selectedPlan)));
        let plansHtml = planHtmlArr.join("\n\n");
        let plansChartsScript = this.createPlansChartsScript(plans);

        let html = `<!DOCTYPE html>
        <head>
            <title>Plan report</title>
            ${await this.includeStyle(this.asAbsolutePath('planview', 'plans.css'))}
            ${await this.includeStyle(this.asAbsolutePath('planview', 'plan-resource-task.css'))}
            ${await this.includeStyle(this.asAbsolutePath('planview', 'menu.css'))}
            ${await this.includeScript(this.asAbsolutePath('planview', 'plans.js'))}
            <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
            ${await this.includeScript(this.asAbsolutePath('planview', 'charts.js'))}
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
        if (!this.options.selfContained) {
            uri = uri.with({ scheme: "vscode-resource" });
        }
        return uri;
    }

    renderPlanSelector(plan: Plan, planIndex: number, selectedPlan: number, maxCost: number): string {
        let className = "planSelector";
        if (planIndex === selectedPlan) { className += " planSelector-selected"; }

        let normalizedCost = plan.cost / maxCost * 100;

        return `
        <div class="${className}" plan="${planIndex}" onclick="showPlan(${planIndex})"><span>${plan.cost}</span>
            <div class="planMetricBar" style="height: ${normalizedCost}px"></div>
        </div>`;
    }

    shouldDisplay(planStep: PlanStep, plan: Plan): boolean {
        if (this.settings.has(plan)) {
            return this.settings.get(plan).shouldDisplay(planStep);
        }
        else { return true; }
    }

    async renderPlan(plan: Plan, planIndex: number, selectedPlan: number): Promise<string> {
        if (plan.domain) {
            this.settings.set(plan, new PlanReportSettings(plan.domain.fileUri));
        }

        let stepsToDisplay = plan.steps
            .filter(step => this.shouldDisplay(step, plan));

        // split this to two batches and insert helpful actions in between
        let planHeadSteps = stepsToDisplay
            .filter(step => this.isPlanHeadStep(step, plan));
        let relaxedPlanSteps = stepsToDisplay
            .filter(step => !this.isPlanHeadStep(step, plan));

        let oneIfHelpfulActionsPresent = (plan.hasHelpfulActions() ? 1 : 0);
        let relaxedPlanStepIndexOffset = planHeadSteps.length + oneIfHelpfulActionsPresent;

        let ganttChartHtml = planHeadSteps
            .map((step, stepIndex) => this.renderGanttStep(step, stepIndex, plan, planIndex)).join("\n")
            + this.renderHelpfulActions(plan, planHeadSteps.length) + '\n'
            + relaxedPlanSteps
                .map((step, stepIndex) => this.renderGanttStep(step, stepIndex + relaxedPlanStepIndexOffset, plan, planIndex)).join("\n");

        let ganttChartHeight = (stepsToDisplay.length + oneIfHelpfulActionsPresent) * this.planStepHeight;

        let styleDisplay = planIndex === selectedPlan ? "block" : "none";

        let ganttChart = `    <div class="gantt" plan="${planIndex}" style="margin: 5px; height: ${ganttChartHeight}px; display: ${styleDisplay};">
    ${ganttChartHtml}
        </div>`;

        let objectsHtml = '';
        if (!this.options.disableSwimLaneView && plan.domain && plan.problem) {
            let allTypeObjects = TypeObjects.concatObjects(plan.domain.constants, plan.problem.objects);

            objectsHtml = plan.domain.getTypes()
                .filter(type => type !== "object")
                .map(type => {
                    let typeObjects = allTypeObjects.find(to => to.type === type);
                    return typeObjects
                        ? this.renderTypeSwimLanes(type, typeObjects.objects, plan)
                        : '';
                }).join("\n");
        }

        let swimLanes = `    <div class="resourceUtilization" plan="${planIndex}" style="display: ${styleDisplay};">
        <table>
${objectsHtml}
        </table>
    </div>`;

        let valStepPath = workspace.getConfiguration(CONF_PDDL).get<string>(VAL_STEP_PATH);
        let valueSeqPath = workspace.getConfiguration(CONF_PDDL).get<string>(VALUE_SEQ_PATH);

        let lineCharts = `    <div class="lineChart" plan="${planIndex}" style="display: ${styleDisplay};margin-top: 20px;">\n`;
        let lineChartScripts = '';

        if (!this.options.disableLinePlots && plan.domain && plan.problem) {
            let evaluator = new PlanFunctionEvaluator(valueSeqPath, valStepPath, plan);

            if (evaluator.isAvailable()) {

                try {

                    let functionValues = await evaluator.evaluate();

                    functionValues.forEach((values, liftedVariable) => {
                        let chartDivId = `chart_${planIndex}_${liftedVariable.name}`;
                        lineCharts += `        <div id="${chartDivId}" style="width: ${this.options.displayWidth + 100}px; height: ${Math.round(this.options.displayWidth / 2)}px"></div>\n`;
                        let chartTitleWithUnit = liftedVariable.name;
                        if (liftedVariable.getUnit()) { chartTitleWithUnit += ` [${liftedVariable.getUnit()}]`; }
                        lineChartScripts += `        drawChart('${chartDivId}', '${chartTitleWithUnit}', '', ${JSON.stringify(values.legend)}, ${JSON.stringify(values.values)}, ${this.options.displayWidth});\n`;
                    });
                } catch (err) {
                    console.log(err);
                    if (err instanceof ValStepError) {
                        try {
                            let choice = await window.showErrorMessage("ValStep failed to evaluate the plan values.", "Show", "Ignore");
                            if (choice === "Show") {
                                let path = await ValStep.storeError(err);
                                env.openExternal(Uri.file(path));
                            }
                        } catch (err1) {
                            console.log(err1);
                        }
                    }
                    else {
                        window.showWarningMessage(err);
                    }
                }
            }
            else {
                lineCharts += `<a href="command:pddl.downloadVal" title="Click to initiate download. You will be able to see what is being downloaded and from where...">Download plan validation tools (a.k.a. VAL) to see line plots of function values.</a>`;
            }
        }
        lineCharts += `\n    </div>`;

        return `${this.options.selfContained || this.options.disableHamburgerMenu ? '' : this.renderMenu()}
${ganttChart}
${swimLanes}
${lineCharts}
        <script>function drawPlan${planIndex}Charts(){\n${lineChartScripts}}</script>
`;
    }

    renderHelpfulActions(plan: Plan, planHeadLength: number): string {
        if (plan.hasHelpfulActions()) {
            let fromTop = planHeadLength * this.planStepHeight;
            let fromLeft = this.toViewCoordinates(plan.now, plan);
            let text = plan.helpfulActions.map((helpfulAction, index) => this.renderHelpfulAction(index, helpfulAction)).join(', ');
            return `\n        <div class="planstep" style="top: ${fromTop}px; left: ${fromLeft}px; margin-top: 3px">▶ ${text}</div>`;
        }
        else {
            return '';
        }
    }

    renderHelpfulAction(index: number, helpfulAction: HelpfulAction): string {
        let suffix = PlanReportGenerator.getActionSuffix(helpfulAction);
        let beautifiedName = `${helpfulAction.actionName}<sub>${suffix}</sub>`;
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

    createPlansChartsScript(plans: Plan[]) {
        let selectedPlan = plans.length - 1;
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
        let subLanes = new SwimLane(1);
        let stepsInvolvingThisObject = plan.steps
            .filter(step => this.shouldDisplay(step, plan))
            .filter(step => step.objects.includes(obj.toLowerCase()))
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

    renderSwimLameStep(step: PlanStep, plan: Plan, thisObj: string, swimLanes: SwimLane): string {
        let actionColor = this.getActionColor(step, plan.domain);
        let leftOffset = this.computeLeftOffset(step, plan);
        let width = this.computeWidth(step, plan) + this.computeRelaxedWidth(step, plan);
        let objects = step.objects
            .map(obj => obj.toLowerCase() === thisObj.toLowerCase() ? '@' : obj)
            .join(' ');

        let availableLane = swimLanes.placeNext(leftOffset, width);
        let fromTop = availableLane * this.planStepHeight + 1;

        return `
                    <div class="resourceTaskTooltip" style="background-color: ${actionColor}; left: ${leftOffset}px; width: ${width}px; top: ${fromTop}px;">${step.actionName} ${objects}<span class="resourceTaskTooltipText">${this.toActionTooltip(step)}</span></div>`;
    }

    renderGanttStep(step: PlanStep, index: number, plan: Plan, planIndex: number): string {
        let actionLink = this.toActionLink(step.actionName, plan);

        let fromTop = index * this.planStepHeight;
        let fromLeft = this.computeLeftOffset(step, plan);
        let width = this.computeWidth(step, plan);
        let widthRelaxed = this.computeRelaxedWidth(step, plan);

        let actionColor = plan.domain ? this.getActionColor(step, plan.domain) : 'gray';

        return `        <div class="planstep" id="plan${planIndex}step${index}" style="left: ${fromLeft}px; top: ${fromTop}px; "><div class="planstep-bar" title="${this.toActionTooltipPlain(step)}" style="width: ${width}px; background-color: ${actionColor}"></div><div class="planstep-bar-relaxed whitecarbon" style="width: ${widthRelaxed}px;"></div>${actionLink} ${step.objects.join(' ')}</div>`;
    }

    toActionLink(actionName: string, plan: Plan): string {
        if (this.options.selfContained || !plan.domain) {
            return actionName;
        }
        else {
            let revealActionUri = encodeURI('command:pddl.revealAction?' + JSON.stringify([plan.domain.fileUri, actionName]));
            return `<a href="${revealActionUri}" title="Reveal '${actionName}' action in the domain file">${actionName}</a>`;
        }
    }

    toActionTooltip(step: PlanStep): string {
        let durationRow = step.isDurative ?
            `<tr><td class="actionToolTip">Duration: </td><td class="actionToolTip">${step.getDuration().toFixed(DIGITS)}</td></tr>
            <tr><td class="actionToolTip">End: </td><td class="actionToolTip">${step.getEndTime().toFixed(DIGITS)}</td></tr>` :
            '';
        return `<table><tr><th colspan="2" class="actionToolTip">${step.actionName} ${step.objects.join(' ')}</th></tr><tr><td class="actionToolTip" style="width:50px">Start:</td><td class="actionToolTip">${step.getStartTime().toFixed(DIGITS)}</td></tr>${durationRow}</table>`;
    }

    toActionTooltipPlain(step: PlanStep): string {
        let durationRow = step.isDurative ?
            `Duration: ${step.getDuration().toFixed(DIGITS)}, End: ${step.getEndTime().toFixed(DIGITS)}` :
            '';
        return `${step.actionName} ${step.objects.join(' ')}, Start: ${step.getStartTime().toFixed(DIGITS)} ${durationRow}`;
    }

    async includeStyle(uri: Uri): Promise<string> {
        if (this.options.selfContained) {
            let styleText = await afs.readFile(uri.fsPath, { encoding: 'utf-8' });
            return `<style>\n${styleText}\n</style>`;
        } else {
            return `<link rel = "stylesheet" type = "text/css" href = "${uri.toString()}" />`;
        }
    }

    async includeScript(uri: Uri): Promise<string> {
        if (this.options.selfContained) {
            let scriptText = await afs.readFile(uri.fsPath, { encoding: 'utf-8' });
            return `<script>\n${scriptText}\n</script>`;
        } else {
            return `<script src="${uri.toString()}"></script>`;
        }
    }

    computeLeftOffset(step: PlanStep, plan: Plan): number {
        return this.toViewCoordinates(step.getStartTime(), plan);
    }

    renderMenu(): string {
        return `    <div class="menu">&#x2630;
        <span class="menutooltip">
            <a href="#" onClick="openInBrowser()">Generate plan report</a>
            <a href="#" onClick="savePlanToFile()">Export as .plan file...</a>
        </span>
    </div>`;
    }

    computePlanHeadDuration(step: PlanStep, plan: Plan): number {
        if (plan.now === undefined) { return step.getDuration(); }
        else if (step.getEndTime() < plan.now) {
            if (step.commitment === PlanStepCommitment.Committed) { return step.getDuration(); }
            else { return 0; } // the end was not committed yet
        }
        else if (step.getStartTime() >= plan.now) { return 0; }
        else {
            switch (step.commitment) {
                case PlanStepCommitment.Committed:
                    return step.getDuration();
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
        let planHeadDuration = this.computePlanHeadDuration(step, plan);
        return Math.max(1, this.toViewCoordinates(planHeadDuration, plan));
    }

    computeRelaxedWidth(step: PlanStep, plan: Plan): number {
        let planHeadDuration = this.computePlanHeadDuration(step, plan);
        // remove the part of the planStep duration that belongs to the planhead part
        let relaxedDuration = step.getDuration() - planHeadDuration;
        return this.toViewCoordinates(relaxedDuration, plan);
    }

    /** Converts the _time_ argument to view coordinates */
    toViewCoordinates(time: number, plan: Plan): number {
        return time / plan.makespan * this.options.displayWidth;
    }

    getActionColor(step: PlanStep, domain: DomainInfo): string {
        let actionIndex = domain.actions.findIndex(action => action.name.toLowerCase() === step.actionName.toLowerCase());
        let actionColor = this.colors[actionIndex * 7 % this.colors.length];

        return actionColor;
    }

    colors = ['#ff0000', '#ff4000', '#ff8000', '#ffbf00', '#ffff00', '#bfff00', '#80ff00', '#40ff00', '#00ff00', '#00ff40', '#00ff80', '#00ffbf', '#00ffff', '#00bfff', '#0080ff', '#0040ff', '#0000ff', '#4000ff', '#8000ff', '#bf00ff', '#ff00ff', '#ff00bf', '#ff0080', '#ff0040'];
}

export interface PlanReportOptions {
    displayWidth: number;
    selfContained?: boolean;
    disableSwimLaneView?: boolean;
    disableLinePlots?: boolean;
    disableHamburgerMenu?: boolean;
}
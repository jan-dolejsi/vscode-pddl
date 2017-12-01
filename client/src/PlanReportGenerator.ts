/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    ExtensionContext
} from 'vscode';

import * as path from 'path';

import { DomainInfo, TypeObjects } from '../../common/src/parser';
import { SwimLane } from '../../common/src/SwimLane';
import { Plan, PlanStep } from './plan';
import { Util } from '../../common/src/util';
var opn = require('opn');
var fs = require('fs')

export class PlanReportGenerator {

    planStepHeight = 20;

    constructor(public context: ExtensionContext, public displayWidth: number, public selfContained: boolean) {

    }

    export(plans: Plan[], planId: number): void {
        let html = this.generateHtml(plans, planId);

        let htmlFile = Util.toFile("plan-report", ".html", html);

        opn("file://" + htmlFile);
    }

    generateHtml(plans: Plan[], planId: number = -1): string {
        let selectedPlan = planId < 0 ? plans.length - 1 : planId;

        let maxCost = Math.max(...plans.map(plan => plan.cost));

        let planSelectors = plans.map((plan, planIndex) => this.renderPlanSelector(plan, planIndex, selectedPlan, maxCost)).join(" ");

        let planSelectorsDisplayStyle = plans.length > 1 ? "flex" : "none";

        let plansHtml = plans.map((plan, planIndex) => this.renderPlan(plan, planIndex, selectedPlan)).join("\n\n");

        let html = `<!DOCTYPE html>        
        <head>
            <title>Plan report</title>
            ${this.includeStyle(this.asAbsolutePath('planview', 'plans.css'))}
            ${this.includeStyle(this.asAbsolutePath('planview', 'plan-resource-task.css'))}
            ${this.includeScript(this.asAbsolutePath('planview', 'plans.js'))}
        </head>        
        <body onload="scrollPlanSelectorIntoView(${selectedPlan})">
            <div class="planSelectors" style="display: ${planSelectorsDisplayStyle};">${planSelectors}
            </div>
        ${plansHtml}
        </body>`;

        return html;
    }

    asAbsolutePath(...paths: string[]): string {
        return this.context.asAbsolutePath(path.join(...paths));
    }

    renderPlanSelector(plan: Plan, planIndex: number, selectedPlan: number, maxCost: number): string {
        let className = "planSelector";
        if (planIndex == selectedPlan) className += " planSelector-selected";

        let normalizedCost = plan.cost / maxCost * 100;

        return `
        <div class="${className}" plan="${planIndex}" onclick="showPlan(${planIndex})"><span>${plan.cost}</span>
            <div class="planMetricBar" style="height: ${normalizedCost}px"></div>
        </div>`;
    }

    renderPlan(plan: Plan, planIndex: number, selectedPlan: number): string {
        let planHtml = plan.steps.map((step, stepIndex) => this.renderPlanStep(step, stepIndex, plan, planIndex)).join("\n");

        let allTypeObjects = PlanReportGenerator.concatObjects(plan.domain.constants, plan.problem.objects);

        let styleDisplay = planIndex == selectedPlan ? "block" : "none";

        let objectsHtml = plan.domain.getTypes()
            .filter(type => type != "object")
            .map(type => {
                let typeObjects = allTypeObjects.find(to => to.type == type);
                return typeObjects
                    ? this.renderTypeSwimLanes(type, typeObjects.objects, plan)
                    : '';
            }).join("\n");

        return `    <div class="gantt" plan="${planIndex}" style="margin: 5px; height: ${plan.steps.length * this.planStepHeight}px; display: ${styleDisplay};">
${planHtml}
    </div>
    <div class="resourceUtilization" plan="${planIndex}" style="display: ${styleDisplay};">
        <table>
${objectsHtml}
        </table>
    </div>`;
    }

    static concatObjects(constants: TypeObjects[], objects: TypeObjects[]): TypeObjects[] {
        let mergedObjects: TypeObjects[] = [];

        constants.concat(objects).forEach(typeObj => {
            let typeFound = mergedObjects.find(to1 => to1.type == typeObj.type);

            if (!typeFound) {
                typeFound = new TypeObjects(typeObj.type);
                mergedObjects.push(typeFound);
            }

            typeFound.addAllObjects(typeObj.objects);
        });

        return mergedObjects;
    }

    renderTypeSwimLanes(type: string, objects: string[], plan: Plan): string {
        return `            <tr>
                <th>${type}</th>
                <th style="width: ${this.displayWidth}px"></th>
            </tr>
`
            + objects.map(obj => this.renderObjectSwimLane(obj, plan)).join('\n');
    }

    renderObjectSwimLane(obj: string, plan: Plan): string {
        let subLanes = new SwimLane(1);
        let stepsInvolvingThisObject = plan.steps
            .filter(step => step.objects.includes(obj.toLowerCase()))
            .map(step => this.renderStep(step, plan, obj, subLanes))
            .join('\n');

        return `            <tr>
                <td class="objectName"><div>${obj}</div></td>
                <td style="position: relative; height: ${subLanes.laneCount() * this.planStepHeight}px;">
${stepsInvolvingThisObject}
                </td>
            </tr>
`;
    }

    renderStep(step: PlanStep, plan: Plan, thisObj: string, swimLanes: SwimLane): string {
        let actionColor = this.getActionColor(step, plan.domain);
        let leftOffset = this.computeLeftOffset(step, plan);
        let width = this.computeWidth(step, plan);
        let objects = step.objects
            .map(obj => obj.toLowerCase() == thisObj.toLowerCase() ? '@' : obj)
            .join(' ');

        let availableLane = swimLanes.placeNext(leftOffset, width);

        return `
                    <div class="resourceTaskTooltip" style="background-color: ${actionColor}; left: ${leftOffset}px; width: ${width}px; top: ${availableLane * this.planStepHeight + 1}px;">${step.actionName} ${objects}<span class="resourceTaskTooltipText">${step.actionName} ${objects}</span></div>`;
    };

    renderPlanStep(step: PlanStep, index: number, plan: Plan, planIndex: number): string {
        let actionLink = this.toActionLink(step.actionName, plan);

        let fromTop = index * this.planStepHeight;
        let fromLeft = this.computeLeftOffset(step, plan);
        let width = this.computeWidth(step, plan);

        let actionColor = this.getActionColor(step, plan.domain);

        return `        <div class="planstep" id="plan${planIndex}step${index}" style="left: ${fromLeft}px; top: ${fromTop}px; "><div class="planstep-bar" style="width: ${width}px; background-color: ${actionColor}"></div>${actionLink} ${step.objects.join(' ')}</div>`;
    }

    toActionLink(actionName: string, plan: Plan) {
        if (this.selfContained) {
            return actionName;
        }
        else {
            return `<a href="${encodeURI('command:pddl.revealAction?' + JSON.stringify([plan.domain.fileUri, actionName]))}">${actionName}</a>`;
        }
    }

    includeStyle(path: string): any {
        if (this.selfContained) {
            let styleText = fs.readFileSync(path, 'utf8');
            return `<style>\n${styleText}\n</style>`;
        } else {
            return `<link rel = "stylesheet" type = "text/css" href = "${path}" />`;
        }
    }

    includeScript(path: string): any {
        if (this.selfContained) {
            let scriptText = fs.readFileSync(path, 'utf8');
            return `<script>\n${scriptText}\n</script>`;
        } else {
            return `<script src="${path}"></script>`;
        }
    }

    computeLeftOffset(step: PlanStep, plan: Plan): number {
        return step.time / plan.makespan * this.displayWidth;
    }

    computeWidth(step: PlanStep, plan: Plan): number {
        return Math.max(1, step.duration / plan.makespan * this.displayWidth);
    }

    getActionColor(step: PlanStep, domain: DomainInfo): string {
        let actionIndex = domain.actions.findIndex(action => action.name.toLowerCase() == step.actionName.toLowerCase());
        let actionColor = this.colors[actionIndex * 7 % this.colors.length];

        return actionColor;
    }

    colors = ['#ff0000', '#ff4000', '#ff8000', '#ffbf00', '#ffff00', '#bfff00', '#80ff00', '#40ff00', '#00ff00', '#00ff40', '#00ff80', '#00ffbf', '#00ffff', '#00bfff', '#0080ff', '#0040ff', '#0000ff', '#4000ff', '#8000ff', '#bf00ff', '#ff00ff', '#ff00bf', '#ff0080', '#ff0040'];

}
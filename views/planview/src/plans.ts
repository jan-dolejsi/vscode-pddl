/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { createPlansView, JsonPlanVizSettings, PlansView, PlanView } from "pddl-gantt";
import { Plan, PlanStep } from "pddl-workspace";
import { LinePlotData } from 'model';

/** VS Code stub, so we can work with it in a type safe way. */
interface VsCodeApi {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(payload: any): void;
}

declare function postCommand(command: string): void;

declare const acquireVsCodeApi: () => VsCodeApi;

declare const vscode: VsCodeApi | undefined;
// let vscode: VsCodeApi | undefined;
// try {
//     vscode = acquireVsCodeApi();
// } catch (error) {
//     console.warn(error);
//     // swallow, so the script can be tested in a browser
// }

/* implemented in baseWebview.js */
declare function onLoad(): void;

window.addEventListener('message', event => {
    const message = event.data;
    // console.debug("Message: " + JSON.stringify(message));
    switch (message.command) {
        case 'showPlans':
            showPlans(message.plans, message.width);
            break;
        case 'setVisibility':
            showElement(message.elementId, message.visible);
            break;
        case 'showLinePlot':
            showLinePlot(message.data);
            break;
        case 'hideLinePlotLoadingProgress':
            hideLinePlotLoadingProgress(message.planIndex);
            break;
        case 'error':
            showError(message.message);
            break;        
        default:
            console.log("Unexpected message: " + message.command);
    }
});


document.body.onload = (): void => initialize();

function initialize(): void {

    plansViz = createPlansView("plans",
        {
            displayWidth: 400,
            epsilon: 1e-3,
            onActionSelected: actionName => revealAction(actionName),
            onLinePlotsVisible: planView => requestLinePlotData(planView)
        }
    );

    if (!vscode) {
        // initialize in-browser debugging
        const dummyPlan = new Plan([
            new PlanStep(.5, "hello world", true, 1, 1),
            new PlanStep(1, "hello universe", true, .8, 2),
        ]);

        showElement('downloadVal', true);
        showPlans([dummyPlan], 300);
        showError("Some issue...");
    }

    const menu = document.getElementById("menu");
    if (menu) {
        menu.onclick = (): void => postCommand('showMenu');
    }

    onLoad();
}

let plansViz: PlansView;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let selectedPlan = 0;

let plansShown: Plan[] = [];

function revealAction(actionName: string): void {
    plansShown[selectedPlan].domain
        && vscode?.postMessage({ "command": "revealAction", "domainUri": plansShown[selectedPlan].domain?.fileUri, "action": actionName });
}

function showElement(elementId: string, visible: boolean): void {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.visibility = visible ? "visible" : "collapse";
    }
}

// todo: how to clear the error again?
function showError(message: string): void {
    const element = document.getElementById("error");
    if (element) {
        element.style.visibility = "visible";
        element.innerHTML = `<b>Error:</b> ${message}`;
    }
}

function showPlans(plans: Plan[], width: number): void {
    plansShown = plans;
    showElement("pleaseWait", false);
    if (plans.length > 0) {
        const clonedPlans = plans.map(p => Plan.clone(p));
        plansViz.setDisplayWidth(width);
        plansViz.showPlans(clonedPlans, undefined, new JsonPlanVizSettings({}));
    } else {
        plansViz.clear();
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function showPlan(planIndex: number): void {
    // remember the index of the plan that is being shown for later manipulation
    selectedPlan = planIndex;
    vscode?.postMessage({ "command": "selectPlan", "planIndex": planIndex});
    document.querySelectorAll("div.stateView").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.gantt").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.resourceUtilization").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.lineChart").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.planSelector").forEach(div => {
        let newClass = "planSelector";
        const planId = parseInt(div.getAttribute("plan") ?? "-1");
        if (planIndex === planId) { newClass += " planSelector-selected"; }
        div.setAttribute("class", newClass);
    });
    eval("drawPlan" + planIndex + "Charts();");
}

function showPlanDiv(planIndex: number, div: Element): void {
    const planId = parseInt(div.getAttribute("plan") ?? "-1");
    const newDisplayStyle = planId === planIndex ? "block" : "none";
    let style = div.getAttribute("style") ?? "display: none";
    style = style.replace(/display: (none|block);/i, "display: " + newDisplayStyle + ';');
    div.setAttribute("style", style);
}

function requestLinePlotData(planView: PlanView): void {
    vscode?.postMessage({ 'command': 'linePlotDataRequest', 'planIndex': planView.planIndex });
}

function showLinePlot(data: LinePlotData): void {
    plansViz.getView(data.planIndex).showPlanLinePlots(data.name, data.unit, data.legend, data.data);
}

function hideLinePlotLoadingProgress(planIndex: number): void {
    plansViz.getView(planIndex).hideLinePlotLoadingProgress();
}
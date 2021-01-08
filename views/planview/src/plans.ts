/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { createPlansView, JsonPlanVizSettings, PlansView, PlanView } from "pddl-gantt";
import { Plan, PlanStep } from "pddl-workspace";
import { LinePlotData, PlansData } from 'model';

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
            const plansData = message.data as PlansData;
            showPlans(plansData);
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
            onLinePlotsVisible: planView => requestLinePlotData(planView),
            onPlanSelected: planIndex => selectedPlan = planIndex
        }
    );

    if (!vscode) {
        // initialize in-browser debugging
        const dummyPlan = new Plan([
            new PlanStep(.5, "hello world", true, 1, 1),
            new PlanStep(1, "hello universe", true, .8, 2),
        ]);

        showElement('downloadVal', true);
        showPlans({
            plans: [dummyPlan],
            width: 300});
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

function showPlans(plansData: PlansData): void {
    const plans = plansShown = plansData.plans;
    showElement("pleaseWait", false);
    if (plans.length > 0) {
        const clonedPlans = plans.map(p => Plan.clone(p));
        plansViz.setDisplayWidth(plansData.width);
        const settings = new JsonPlanVizSettings(plansData.domainVisualizationConfiguration, plansData.planVisualizationScript);
        plansViz.showPlans(clonedPlans, undefined, settings);
    } else {
        plansViz.clear();
    }
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
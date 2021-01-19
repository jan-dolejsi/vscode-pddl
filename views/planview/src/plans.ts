/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { createPlansView, CustomVisualization, JsonDomainVizConfiguration, PlansView, PlanView } from "pddl-gantt";
import { Plan, PlanStep } from "pddl-workspace";
import { LinePlotData, PlansData, FinalStateData } from 'model';

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
        case 'visualizeFinalState':
            showFinalState(message.data);
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
            onFinalStateVisible: planView => requestFinalState(planView),
            onPlanSelected: planIndex => setSelectedPlan(planIndex)
        }
    );

    if (!vscode) {
        // initialize in-browser debugging
        const dummyPlan = new Plan([
            new PlanStep(.5, "hello world", true, 1, 1),
            new PlanStep(1, "hello universe", true, .8, 2),
        ]);

        const mockVisualization = function visualizeHtml(plan: Plan, width: number): string {
            const height = 100;
            return `<svg height="${height}" width="${width}">
                <rect width="${width}" height="${height}" style="fill:rgb(0,0,255);stroke-width:3;stroke:rgb(0,0,0)" />
                <circle cx="${height / 2}" cy="${height / 2}" r="${plan.metric}" stroke="black" stroke-width="3" fill="red" />
              </svg> `;
        };

        const customDomainVisualization: CustomVisualization = {
            visualizePlanHtml: mockVisualization
        };

        showElement('downloadVal', true);
        showPlans({
            plans: [dummyPlan],
            width: 300,
            domainVisualizationConfiguration: {
                customVisualization: "see further"
            }
        }, customDomainVisualization);
        showError("Some issue...");
    }

    const menu = document.getElementById("menu");
    if (menu) {
        menu.onclick = (): void => postCommand('showMenu');
    }

    onLoad();

    function setSelectedPlan(planIndex: number): void {
        if (selectedPlan !== planIndex) {
            selectedPlan = planIndex;
            vscode?.postMessage({ "command": "selectPlan", "planIndex": planIndex });
        }
    }
}

let plansViz: PlansView;

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

function showPlans(plansData: PlansData, customDomainVisualization?: CustomVisualization): void {
    const plans = plansShown = plansData.plans;
    showElement("pleaseWait", false);
    if (plans.length > 0) {
        const clonedPlans = plans.map(p => Plan.clone(p));
        if (!plansViz) {
            console.error(`Plan visualization is not initialized.`);
            return;
        }

        plansViz.setDisplayWidth(plansData.width);

        const configuration = customDomainVisualization ?
            JsonDomainVizConfiguration.withCustomVisualization(
                plansData.domainVisualizationConfiguration,
                customDomainVisualization) :
            JsonDomainVizConfiguration.withCustomVisualizationScript(
                plansData.domainVisualizationConfiguration,
                plansData.customDomainVisualizationScript);
        
        plansViz.showPlans(clonedPlans, undefined, configuration);
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

function requestFinalState(planView: PlanView): void {
    vscode?.postMessage({ 'command': 'finalStateDataRequest', 'planIndex': planView.planIndex });
}

function showFinalState(data: FinalStateData): void {
    plansViz.getView(data.planIndex).showFinalState(data.finalState);
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Plan, PlanStep } from "pddl-workspace";
import { createPlanView, JsonDomainVizConfiguration, PlanView } from "pddl-gantt";

import { SearchTree } from "./tree";
import { StateChart } from "./charts";
import { getElementByIdOrThrow, State } from "./utils";
import { FinalStateData, PlanData } from 'model';
import { StatesView } from "./StatesView";
import { BubbleChart } from "./BubbleChart";

/** VS Code stub, so we can work with it in a type safe way. */
interface VsCodeApi {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(payload: any): void;
}

declare function postCommand(command: string): void;

declare const acquireVsCodeApi: () => VsCodeApi;

declare const vscode: VsCodeApi;


/* implemented in baseWebview.js */
declare function onLoad(): void;

let searchTree: SearchTree;

window.addEventListener('message', event => {
    const message = event.data;
    // console.log("Message: " + message);
    switch (message.command) {
        case 'stateAdded':
            add(message.state, false);
            break;
        case 'stateUpdated':
            update(message.state);
            break;
        case 'debuggerState':
            showDebuggerOn(message.state.running === 'on', message.state.port);
            break;
        case 'showStatePlan':
            showStatePlan(message.state);
            break;
        case 'visualizeFinalState':
            showFinalState(message.state);
            break;
        case 'clear':
            clearStates();
            break;
        case 'showAllStates':
            showAllStates(message.state);
            break;
        case 'showPlan':
            showPlan(message.state); // the message.state contains list of states actually
            break;
        case 'stateLog':
            showStateLogButton(message.state);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
});

/**
 * Creates a mock state
 * @param g mock state generation
 * @param id mock state ID
 * @param parentId mock state's parent ID
 * @param actionName creating action
 * @param earliestTime earliest state time
 * @param landmarks landmark facts satisfied in this state
 * @returns mock state
 */
function createMockState(g: number, id: number, parentId: number | undefined, actionName: string | undefined, earliestTime: number, landmarks?: number): State {
    return {
        g: g,
        id: id,
        origId: id.toString(),
        parentId: parentId,
        actionName: actionName,
        earliestTime: earliestTime,
        isGoal: false,
        landmarks: landmarks,
        totalMakespan: undefined
    };
}

const mockStates = [
    createMockState(0, 10, undefined, undefined, 0, 1),
    createMockState(1, 11, 10, 'drive start', .1, 2),
    createMockState(1, 12, 10, 'load start', .1, 2),
    createMockState(2, 13, 11, 'drive end', 2, 3),
    createMockState(3, 14, 13, 'unload start', 2.1, 3),
];

/** All states displayed. todo: should this be a map?*/
const states: State[] = [];

/** Selected state ID or null if no state was selected yet. */
let selectedStateId: number | null;

getElementByIdOrThrow("addMock").onclick = (): void => {
    if (mockStates.length === 0) { return; }
    const newState = mockStates.shift();
    if (newState) {
        add(newState, false);
    }
};

getElementByIdOrThrow("setVisitedOrWorseMock").onclick = (): void => {
    if (selectedStateId === null) { return; }
    const state = states[selectedStateId];
    state.wasVisitedOrIsWorse = true;
    update(state);
};

getElementByIdOrThrow("evaluateMock").onclick = (): void => {
    if (selectedStateId === null) { return; }

    const state = states[selectedStateId];

    if (!state) {
        console.log('Selected state does not exist!');
        return;
    }

    let h = 5;
    let totalMakespan = 5;
    let earliestTime = 0;

    if (state.parentId !== undefined) {
        const parentState = states[state.parentId];
        h = parentState.h ?? 2 - Math.floor(Math.random() * 2);
        totalMakespan = parentState.totalMakespan ?? 1.5 + Math.floor(Math.random() * 1.5);
        earliestTime = parentState.earliestTime + Math.random() * 1.5;
    }

    state.h = h;
    state.totalMakespan = totalMakespan;
    state.earliestTime = earliestTime;
    update(state);
};

getElementByIdOrThrow("deadEndMock").onclick = (): void => {
    if (selectedStateId === null) { return; }

    const state = states[selectedStateId];

    if (!state) {
        console.log('Selected state does not exist!');
        return;
    }

    state.h = Number.POSITIVE_INFINITY;
    state.totalMakespan = Number.POSITIVE_INFINITY;
    state.isDeadEnd = true;
    update(state);
};

getElementByIdOrThrow("clearStatesMock").onclick = (): void => {
    clearStates();
};

getElementByIdOrThrow("planMock").onclick = (): void => {
    if (selectedStateId === null) { return; }

    let state: State | undefined = states[selectedStateId];

    const planStates = [];

    while (state) {
        state.isPlan = true;
        planStates.push(state);
        const parentId: number | undefined = state.parentId;
        state = parentId !== undefined && parentId !== null ?
            states[parentId] : undefined;
    }

    showPlan(planStates);
};

let stackChart: StateChart;
let bubbleChart: StatesView;

let planViz: PlanView;
// let endBatchTimeout: NodeJS.Timeout | undefined;

const MAX_STATES_ON_NETWORK = 200;
const MAX_STATES_ON_STACK_CHART = 500;

/**
 * Adds state
 * @param newState state to add
 * @param batch batch-mode on/off
 * @returns {void}
 */
function add(newState: State, batch: boolean): void {
    if (states.length < MAX_STATES_ON_NETWORK) {
        searchTree.addStateToTree(newState, batch);
    } else {
        showNetwork(false);
        // if (endBatchTimeout) {
        //     clearTimeout(endBatchTimeout);
        // }
        // endBatchTimeout = setTimeout(() => {
        //     searchTree.endTreeBatch();
        //     endBatchTimeout = undefined;
        // }, states.length * 2);
    }
    if (states.length < MAX_STATES_ON_STACK_CHART) {
        stackChart.addStateToChart(newState, batch);
    } else {
        showStackChart(false);
    }
    states[newState.id] = newState;
}

/**
 * Updates state on the view
 * @param state state to update
 */
function update(state: State): void {
    stackChart.updateStateOnChart(state);
    searchTree.updateStateOnTree(state);
    bubbleChart.addState(state);

    if (selectedStateId === state.id) {
        stackChart.selectChartRow(state.id);
    }
}

/**
 * Highlight states that belong to plan
 * @param states state chain that form a plan
 */
function showPlan(states: State[]): void {
    searchTree.showPlanOnTree(states);
    showBubbleChart(false);
}

/**
 * Clear pre-existing states and show new ones
 * @param states states to display (instead of currently shown states)
 */
function showAllStates(states: State[]): void {
    clearStates();
    for (const state of states) {
        add(state, true);
    }
    endBatch();
}

function endBatch(): void {
    stackChart.endChartBatch();
    searchTree.endTreeBatch();
}

/**
 * State was selected
 * @param stateId state id or null to unselect
 */
function onStateSelected(stateId: number | null): void {
    if (selectedStateId === stateId) { return; }

    selectedStateId = stateId;
    stackChart.selectChartRow(stateId);
    searchTree.selectTreeNode(stateId);
    vscode?.postMessage({ command: 'stateSelected', stateId: stateId });
    if (!vscode) {
        const statePlan = new Plan([
            new PlanStep(.5, "hello world " + stateId, true, 1, 1)
        ]);

        showStatePlan({
            plan: statePlan,
            width: 300
        });
    }
}

const NETWORK_DIV_ID = 'network';
const STACK_CHART_DIV_ID = 'chart_div';
const BUBBLE_CHART_DIV_ID = 'bubbleChart';

document.body.onload = (): void => initialize();

function initialize(): void {
    searchTree = new SearchTree(NETWORK_DIV_ID);
    searchTree.network.on('selectNode', function (nodeEvent) {
        if (nodeEvent.nodes.length > 0) {
            onStateSelected(nodeEvent.nodes[0]);
        }
    });

    searchTree.network.on('deselectNode', function (nodeEvent) {
        if (nodeEvent.nodes.length > 0) {
            onStateSelected(nodeEvent.nodes[0]);
        }
        else {
            onStateSelected(null);
        }
    });

    searchTree.network.on('oncontext', params => {
        const node = searchTree.network.getNodeAt(params.pointer.DOM);
        if (node) {
            vscode?.postMessage({ command: 'stateContext', stateId: node });
        }
    });

    window.document.addEventListener('keydown', function (event) {
        navigate(event);
    });

    window.onresize = function (): void {
        stackChart.unsubscribeChartEvents();
        stackChart.reSizeChart();
        stackChart.subscribeToChartEvents();
    };

    if (!vscode) {
        showDebuggerOn(false);
    }

    stackChart = new StateChart(STACK_CHART_DIV_ID, onStateSelected);
    stackChart.subscribeToChartEvents();

    planViz = createPlanView("statePlan",
        {
            displayWidth: 400,
            epsilon: 1e-3,
            disableLinePlots: true,
            onActionSelected: (actionName: string) => vscode?.postMessage({ "command": "revealAction", "action": actionName }),
            onHelpfulActionSelected: (helpfulAction: string) => navigateToChildOfSelectedState(helpfulAction),
            onFinalStateVisible: planView => requestFinalState(planView),
        });

    getElementByIdOrThrow("mockMenu").style.visibility = vscode ? 'collapse' : 'visible';

    bubbleChart = new BubbleChart(BUBBLE_CHART_DIV_ID);

    onLoad();
}

function clearStates(): void {
    console.log('clearing all states');
    searchTree.clearTree();
    stackChart.clearChart();
    bubbleChart.clear();
    states.length = 0;
    showNetwork(true);
    showStackChart(true);
    showBubbleChart(true);
}

const START_DEBUGGER_BUTTON_ID = "startDebuggerButton";
const STOP_DEBUGGER_BUTTON_ID = "stopDebuggerButton";
const CLEAR_DEBUGGER_BUTTON_ID = "restartDebuggerButton";

getElementByIdOrThrow(START_DEBUGGER_BUTTON_ID).onclick = (): void => startSearchDebugger();

function showNetwork(visible: boolean): void {
    showElements([NETWORK_DIV_ID, 'networkHelp'], visible);
}

function showStackChart(visible: boolean): void {
    showElements([STACK_CHART_DIV_ID], visible);
}

function showBubbleChart(visible: boolean): void {
    showElements([BUBBLE_CHART_DIV_ID], visible);
    getElementByIdOrThrow(NETWORK_DIV_ID).style.backgroundColor = visible ? '' : 'whitesmoke';
}

function showElements(elementIDs: string[], visible: boolean): void {
    const visibility = visible ? 'visible' : 'collapse';
    elementIDs.forEach(id =>
        getElementByIdOrThrow(id).style.visibility = visibility);
}

function startSearchDebugger(): void {
    showDebuggerOn(true);
    postCommand('startDebugger');
}

getElementByIdOrThrow(STOP_DEBUGGER_BUTTON_ID).onclick = (): void => stopSearchDebugger();

function stopSearchDebugger(): void {
    showDebuggerOn(false);
    postCommand('stopDebugger');
}

getElementByIdOrThrow(CLEAR_DEBUGGER_BUTTON_ID).onclick = (): void => restartSearchDebugger();

function restartSearchDebugger(): void {
    postCommand('reset');
    showStatePlan({ plan: new Plan([]), width: 300 });
    clearStates();
}

/**
 * Display debugger status
 * @param on debugger is active
 * @param port HTTP port the debugger is listening on
 */
function showDebuggerOn(on: boolean, port?: number): void {
    enableButton(!on, START_DEBUGGER_BUTTON_ID);
    enableButton(on, STOP_DEBUGGER_BUTTON_ID);
    enableButton(on, CLEAR_DEBUGGER_BUTTON_ID);

    if (port) {
        getElementByIdOrThrow(STOP_DEBUGGER_BUTTON_ID).title = "Search engine listener is running on port " + port + ". Click here to stop it.";
    }
}

/**
 * Enable/disable icon-based button.
 * @param enable enable/disable
 * @param buttonId button element ID
 */
function enableButton(enable: boolean, buttonId: string): void {
    const icon = getElementByIdOrThrow(buttonId);

    if (enable) {
        icon.classList.remove('disabled');
    } else {
        icon.classList.add('disabled');
    }
}

function showStatePlan(data: PlanData): void {
    const clonedPlan = Plan.clone(data.plan);
    
    const configuration = JsonDomainVizConfiguration.withCustomVisualizationScript(
        data.domainVisualizationConfiguration,
        data.customDomainVisualizationScript);

    planViz.showPlan(clonedPlan, configuration);
}

const shapeMap = new Map<string, string>();
shapeMap.set('h', 'hexagon');
shapeMap.set('b', 'box');
shapeMap.set('d', 'diamond');
shapeMap.set('s', 'star');
shapeMap.set('t', 'triangle');
shapeMap.set('q', 'square');
shapeMap.set('e', 'ellipse');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function navigate(e: any): void {
    e = e || window.event;
    let newSelectedStateId: number | null;
    switch (e.key) {
        case "ArrowLeft":
            newSelectedStateId = e.shiftKey ? stackChart.navigateChart(-1) : searchTree.navigateTreeSiblings(-1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowRight":
            newSelectedStateId = e.shiftKey ? stackChart.navigateChart(+1) : searchTree.navigateTreeSiblings(+1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowUp":
            newSelectedStateId = searchTree.navigateTreeUp();
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowDown":
            newSelectedStateId = searchTree.navigateTreeDown();
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "f":
            searchTree.toggleAutoFit();
            break;
        case "F":
            searchTree.fitTree();
            break;
    }

    if (e.key in shapeMap) {
        searchTree.changeSelectedNodeShape(shapeMap.get(e.key)!);
    }

    if (Number.isFinite(parseInt(e.key))) {
        // digits are being typed
        const digit = parseInt(e.key);
        findingStateWithDigit(digit);
    }
}

let stateIdToFind = 0;
/** Timeout for keyboard typing state ID. */
let stateFindingTimeout: NodeJS.Timeout | undefined;

/**
 * Turns on state finding and appends a stateId digit.
 * @param digit of the state number to append
 */
function findingStateWithDigit(digit: number): void {
    stateIdToFind = stateIdToFind * 10 + digit;
    if (stateFindingTimeout) { clearTimeout(stateFindingTimeout); }
    stateFindingTimeout = setTimeout(() => findState(), 1000);
}

function findState(): void {
    try {
        onStateSelected(stateIdToFind);
    } catch (ex) {
        console.log("Cannot find find state with id " + stateIdToFind + ". Error: " + ex);
    }
    stateIdToFind = 0;
}

/**
 * Navigates to child
 * @param actionName action name
 * @todo this is called by the helpful action link on the relaxed plan display
 */
export function navigateToChildOfSelectedState(actionName: string): void {
    if (selectedStateId) {
        const newSelectedStateId = searchTree.navigateToChildState(selectedStateId, actionName);
        if (newSelectedStateId !== null) { onStateSelected(newSelectedStateId); }
    }
}

getElementByIdOrThrow("toggleStateLogButton").onclick = (): void => toggleStateLog();

function toggleStateLog(): void {
    postCommand('toggleStateLog');
}

/**
 * Shows heuristic log path
 * @param logFilePath heuristic log path
 */
function showStateLogButton(logFilePath: string): void {
    const button = getElementByIdOrThrow("toggleStateLogButton");

    if (logFilePath) {
        button.style.color = "green";
        button.title = "State selection synchronized with log file file: " + logFilePath;
    } else {
        button.style.color = "red";
        button.title = "State log file synchronization disabled. Click here to re-enable.";
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function requestFinalState(_planView: PlanView): void {
    vscode?.postMessage({ 'command': 'finalStateDataRequest', 'stateId': selectedStateId });
}

function showFinalState(data: FinalStateData): void {
    // check that the selected state is _still_ the same one as when the request was sent
    if (data.planIndex === selectedStateId) {
        planViz.showFinalState(data.finalState);
    }
}

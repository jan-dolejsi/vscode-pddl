import {
    SearchTree
} from "./tree";
import {
    addStateToChart, chart, clearChart, endChartBatch, google, initializeChart, navigateChart, reSizeChart, rowIdToStateId, selectChartRow, updateStateOnChart
} from "./charts";
import { getElementByIdOrThrow, postCommand, State, vscode } from "./utils";

/* implemented in baseWebview.js */
declare function onLoad(): void;

let searchTree: SearchTree;

window.addEventListener('message', event => {
    const message = event.data;
    console.log("Message: " + message);
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
 * @param satisfiedLandmarks landmark facts satisfied in this state
 * @returns mock state
 */
function createMockState(g: number, id: number, parentId: number | undefined, actionName: string | undefined, earliestTime: number, satisfiedLandmarks?: number): State {
    return {
        g: g,
        id: id,
        origId: id.toString(),
        parentId: parentId,
        actionName: actionName,
        earliestTime: earliestTime,
        isGoal: false,
        satisfiedLandmarks: satisfiedLandmarks,
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

/**
 * Adds state
 * @param newState state to add
 * @param batch batch-mode on/off
 * @returns {void}
 */
function add(newState: State, batch: boolean): void {
    searchTree.addStateToTree(newState, batch);
    addStateToChart(newState, batch);
    states[newState.id] = newState;
}

/**
 * Updates state on the view
 * @param state state to update
 */
function update(state: State): void {
    updateStateOnChart(state);
    searchTree.updateStateOnTree(state);

    if (selectedStateId === state.id) {
        selectChartRow(state.id);
    }
}

/**
 * Highlight states that belong to plan
 * @param states state chain that form a plan
 */
function showPlan(states: State[]): void {
    searchTree.showPlanOnTree(states);
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
    endChartBatch();
    searchTree.endTreeBatch();
}

/**
 * State was selected
 * @param stateId state id or null to unselect
 */
function onStateSelected(stateId: number | null): void {
    if (selectedStateId === stateId) { return; }

    selectedStateId = stateId;
    selectChartRow(stateId);
    searchTree.selectTreeNode(stateId);
    vscode?.postMessage({ command: 'stateSelected', stateId: stateId });

    if (!vscode) {
        showStatePlan('<div style="width: 400px; height: 900px; background-color: green"></div>');
    }
}

document.body.onload = (): void => initialize();

function initialize(): void {
    searchTree = new SearchTree();
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

    window.document.addEventListener('keydown', function (event) {
        navigate(event);
    });

    window.onresize = function (): void {
        unsubscribeChartEvents();
        reSizeChart();
        subscribeToChartEvents();
    };

    if (!vscode) {
        showDebuggerOn(false);
    }

    initializeChart();
    subscribeToChartEvents();

    getElementByIdOrThrow("mockMenu").style.visibility = vscode ? 'collapse' : 'visible';

    onLoad();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chartSelectEvent: any;

function subscribeToChartEvents(): void {
    console.log("subscribing to chart select event for "); console.log(chart);
    chartSelectEvent = google.visualization.events.addListener(chart, 'select', function () {
        console.log("chart selection changed");
        const selection = chart.getSelection();
        console.log(selection);
        if (selection && selection.length > 0) {
            const newSelectedStateId = rowIdToStateId.get(selection[0].row);
            onStateSelected(newSelectedStateId ?? null);
        }
        else {
            onStateSelected(null);
        }
    });
}

function unsubscribeChartEvents(): void {
    if (chartSelectEvent && chart) {
        google.visualization.events.removeListener(chartSelectEvent);
    }
}

function clearStates(): void {
    console.log('clearing all states');
    searchTree.clearTree();
    clearChart();
}

const START_DEBUGGER_BUTTON_ID = "startDebuggerButton";
const STOP_DEBUGGER_BUTTON_ID = "stopDebuggerButton";
const CLEAR_DEBUGGER_BUTTON_ID = "restartDebuggerButton";

getElementByIdOrThrow(START_DEBUGGER_BUTTON_ID).onclick = (): void => startSearchDebugger();

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
    showStatePlan("");
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

function showStatePlan(statePlanHtml: string): void {
    getElementByIdOrThrow("statePlan").innerHTML = statePlanHtml;
}

const shapeMap = new Map<string, string>();
shapeMap.set('h', 'hexagon');
shapeMap.set('b', 'box');
shapeMap.set('d', 'diamond');
shapeMap.set('s', 'star');
shapeMap.set('t', 'triangle');
shapeMap.set('h', 'hexagon');
shapeMap.set('q', 'square');
shapeMap.set('e', 'ellipse');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function navigate(e: any): void {
    e = e || window.event;
    let newSelectedStateId: number | null;
    switch (e.key) {
        case "ArrowLeft":
            newSelectedStateId = e.shiftKey ? navigateChart(-1) : searchTree.navigateTreeSiblings(-1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowRight":
            newSelectedStateId = e.shiftKey ? navigateChart(+1) : searchTree.navigateTreeSiblings(+1);
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
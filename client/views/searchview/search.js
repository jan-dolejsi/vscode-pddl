
window.addEventListener('message', event => {
    const message = event.data;
    console.log("Message: " + message);
    switch (message.command) {
        case 'stateAdded':
            add(message.state, false);
            break;
        case 'stateUpdated':
            update(message.state, false);
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
            showPlan(message.state);
            break;
        case 'stateLog':
            showStateLogButton(message.state);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
});

/**
 * @typedef {Object} State
 * @property {number} id state ID
 * @property {string} origId original state ID (as received from the planner)
 * @property {number} parentId parent state ID
 * @property {number} g generation
 * @property {string} actionName action that created this state
 * @property {number} h heuristic value of the state
 * @property {number} earliestTime earliest time this state can be scheduled
 * @property {number} totalMakespan makespan of the hypotetical plan that concatenates the planhead of this state and its relaxed plan
 * @property {boolean | undefined} isDeadEnd state is dead end (goal cannot be reached)
 * @property {boolean | undefined} isGoal state reaches the goal condition
 * @property {boolean | undefined} wasVisitedOrIsWorse state was previously visited in the search, or other state(s) dominate it
 */

/**
 * Creates a mock state
 * @param {number} id mock state ID
 * @param {number} parentId mock state's parent ID
 * @param {string} actionName creating action
 * @param {number} earliestTime earliest state time
 * @returns {State} mock state
 */
function createMockState(id, parentId, actionName, earliestTime) {
    return {
        id: id,
        origId: id.toString(),
        parentId: parentId,
        actionName: actionName,
        h: undefined,
        earliestTime: earliestTime,
        totalMakespan: undefined
    };
}

const mockStates = [
    createMockState(10, null, null, 0),
    createMockState(11, 10, 'drive start', .1),
    createMockState(12, 10, 'load start', .1),
    createMockState(13, 11, 'drive end', 2),
    createMockState(14, 13, 'unload start', 2.1),
];

/** @type {State[]} */
const states = {};
/** @type {number | null} */
let selectedStateId = null;

function addMock() {
    if (mockStates.length === 0) { return; }
    const newState = mockStates.shift();
    add(newState);
}

function setVisitedOrWorseMock() {
    if (selectedStateId === null) { return; }
    const state = states[selectedStateId];
    state.wasVisitedOrIsWorse = true;
    update(state);
}

function evaluateMock() {
    if (selectedStateId === null) { return; }

    const state = states[selectedStateId];

    if (!state) {
        console.log('Selected state does not exist!');
        return;
    }

    let h = 5;
    let totalMakespan = 5;
    let earliestTime = 0;

    if (state.parentId !== null) {
        const parentState = states[state.parentId];
        h = parentState.h - Math.floor(Math.random() * 2);
        totalMakespan = parentState.totalMakespan + Math.floor(Math.random() * 1.5);
        earliestTime = parentState.earliestTime + Math.random() * 1.5;
    }

    state.h = h;
    state.totalMakespan = totalMakespan;
    state.earliestTime = earliestTime;
    update(state);
}

function deadEndMock() {
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
}

/**
 * Adds state
 * @param {State} newState state to add
 * @param {boolean} batch batch-mode on/off
 * @returns {void}
 */
function add(newState, batch) {
    addStateToTree(newState, batch);
    addStateToChart(newState, batch);
    states[newState.id] = newState;
}

/**
 * Updates state on the view
 * @param {State} state state to update
 */
function update(state) {
    updateStateOnChart(state);
    updateStateOnTree(state);

    if (selectedStateId === state.id) {
        selectChartRow(state.id);
    }
}

/**
 * Highlight states that belong to plan
 * @param {State[]} states state chain that form a plan
 */
function showPlan(states) {
    showPlanOnTree(states);
}

/**
 * Clear pre-existing states and show new ones
 * @param {State[]} states states to display (instead of currently shown states)
 */
function showAllStates(states) {
    clearStates();
    for (const state of states) {
        add(state, true);
    }
    endBatch();
}

function endBatch() {
    endChartBatch();
    endTreeBatch();
}

/**
 * State was selected
 * @param {number} stateId state id
 */
function onStateSelected(stateId) {
    if (selectedStateId === stateId) { return; }

    selectedStateId = stateId;
    selectChartRow(stateId);
    selectTreeNode(stateId);
    postMessage({ command: 'stateSelected', stateId: stateId });

    if (!vscode) {
        showStatePlan('<div style="width: 400px; height: 900px; background-color: green"></div>');
    }
}

function initialize() {
    createTree();
    network.on('selectNode', function (nodeEvent) {
        if (nodeEvent.nodes.length > 0) {
            onStateSelected(nodeEvent.nodes[0]);
        }
    });

    network.on('deselectNode', function (nodeEvent) {
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

    window.onresize = function () {
        unsubscribeChartEvents();
        reSizeChart();
        subscribeToChartEvents();
    };

    if (!vscode) {
        showDebuggerOn(false);
    }

    initializeChart();
    subscribeToChartEvents();

    document.getElementById("mockMenu").style.visibility = vscode ? 'collapse' : 'visible';

    onLoad();
}

let chartSelectEvent;

function subscribeToChartEvents() {
    console.log("subscribing to chart select event for "); console.log(chart);
    chartSelectEvent = google.visualization.events.addListener(chart, 'select', function () {
        console.log("chart selection changed");
        const selection = chart.getSelection();
        console.log(selection);
        if (selection && selection.length > 0) {
            const newSelectedStateId = rowIdToStateId.get(selection[0].row);
            onStateSelected(newSelectedStateId);
        }
        else {
            onStateSelected(null);
        }
    });
}

function unsubscribeChartEvents() {
    if (chartSelectEvent && chart) {
        google.visualization.events.removeListener(chartSelectEvent);
    }
}

function clearStates() {
    console.log('clearing all states');
    clearTree();
    clearChart();
}

function startSearchDebugger() {
    showDebuggerOn(true);
    postCommand('startDebugger');
}

function stopSearchDebugger() {
    showDebuggerOn(false);
    postCommand('stopDebugger');
}

function restartSearchDebugger() {
    postCommand('reset');
    showStatePlan("");
    clearStates();
}

/**
 * Display debugger status
 * @param {boolean} on debugger is active
 * @param {number} port HTTP port the debugger is listening on
 */
function showDebuggerOn(on, port) {
    stopDisplay = on ? 'initial' : 'none';
    startDisplay = on ? 'none' : 'initial';

    window.document.getElementById("startDebuggerButton").style.display = startDisplay;
    window.document.getElementById("stopDebuggerButton").style.display = stopDisplay;
    window.document.getElementById("restartDebuggerButton").style.display = stopDisplay;

    window.document.getElementById("stopDebuggerButton").title = "Search engine listener is running on port " + port + ". Click here to stop it.";
}

function showStatePlan(statePlanHtml) {
    window.document.getElementById("statePlan").innerHTML = statePlanHtml;
}

const shapeMap = new Map();
shapeMap['h'] = 'hexagon';
shapeMap['b'] = 'box';
shapeMap['d'] = 'diamond';
shapeMap['s'] = 'star';
shapeMap['t'] = 'triangle';
shapeMap['h'] = 'hexagon';
shapeMap['q'] = 'square';
shapeMap['e'] = 'ellipse';

function navigate(e) {
    e = e || window.event;
    /** @type{number | undefined} */
    const newSelectedStateId = undefined;
    switch (e.key) {
        case "ArrowLeft":
            newSelectedStateId = e.shiftKey ? navigateChart(-1) : navigateTreeSiblings(-1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowRight":
            newSelectedStateId = e.shiftKey ? navigateChart(+1) : navigateTreeSiblings(+1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowUp":
            newSelectedStateId = navigateTreeUp();
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "ArrowDown":
            newSelectedStateId = navigateTreeDown();
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) { e.cancelBubble = true; }
            break;
        case "f":
            autoFitEnabled = !autoFitEnabled;
            break;
        case "F":
            fitTree();
            break;
    }

    if (e.key in shapeMap) {
        changeSelectedNodeShape(shapeMap[e.key]);
    }

    if (Number.isFinite(parseInt(e.key))) {
        // digits are being typed
        const digit = parseInt(e.key);
        findingStateWithDigit(digit);
    }
}

let stateIdToFind = 0;
/** @type{number | undefined} */
let stateFindingTimeout;

/**
 * Turns on state finding and appends a stateId digit.
 * @param {number} digit of the state number to append
 */
function findingStateWithDigit(digit) {
    stateIdToFind = stateIdToFind * 10 + digit;
    if (stateFindingTimeout) { clearTimeout(stateFindingTimeout); }
    stateFindingTimeout = setTimeout(() => findState(), 1000);
}

function findState() {
    try {
        onStateSelected(stateIdToFind);
    } catch (ex) {
        console.log("Cannot find find state with id " + stateIdToFind + ". Error: " + ex);
    }
    stateIdToFind = 0;
}

/**
 * Navigates to child
 * @param {string} actionName action name
 */
function navigateToChildOfSelectedState(actionName) {
    const newSelectedStateId = navigateToChildState(selectedStateId, actionName);
    if (newSelectedStateId !== null) { onStateSelected(newSelectedStateId); }
}

function toggleStateLog() {
    postCommand('toggleStateLog');
}

/**
 * Shows heuristic log path
 * @param {string} logFilePath heuristic log path
 */
function showStateLogButton(logFilePath) {
    const button = document.getElementById("toggleStateLogButton");

    if (logFilePath) {
        button.style = "color: green";
        button.title = "State selection synchronized with log file file: " + logFilePath;
    } else {
        button.style = "color: red";
        button.title = "State log file synchronization disabled. Click here to re-enable.";
    }
}
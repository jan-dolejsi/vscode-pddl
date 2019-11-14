
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
            showDebuggerOn(message.state.running == 'on', message.state.port);
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
})

function createMockState(id, parentId, actionName, earliestTime) {
    return {
        id: id,
        origId: id.toString(),
        parentId: parentId,
        actionName: actionName,
        h: undefined,
        earliestTime: earliestTime,
        totalMakespan: undefined
    }
}

var mockStates = [
    createMockState(10, null, null, 0),
    createMockState(11, 10, 'drive start', .1),
    createMockState(12, 10, 'load start', .1),
    createMockState(13, 11, 'drive end', 2),
    createMockState(14, 13, 'unload start', 2.1),
];
var states = {};
var selectedStateId = null;

function addMock() {
    if (mockStates.length == 0) return;
    var newState = mockStates.shift();
    add(newState);
}

function evaluateMock() {
    if (selectedStateId == null) return;

    var state = states[selectedStateId];

    if (!state) {
        console.log('Selected state does not exist!');
        return;
    }

    var h = 5;
    var totalMakespan = 5;
    var earliestTime = 0;

    if (state.parentId !== null) {
        var parentState = states[state.parentId];
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
    if (selectedStateId == null) return;

    var state = states[selectedStateId];

    if (!state) {
        console.log('Selected state does not exist!');
        return;
    }

    state.h = Number.POSITIVE_INFINITY;
    state.totalMakespan = Number.POSITIVE_INFINITY;
    state.isDeadEnd = true;
    update(state);
}

function add(newState, batch) {
    addStateToTree(newState, batch);
    addStateToChart(newState, batch);
    states[newState.id]=newState;
}

function update(state) {
    updateStateOnChart(state);
    updateStateOnTree(state);

    if (selectedStateId == state.id) {
        selectChartRow(state.id);
    }
}

function showPlan(states) {
    showPlanOnTree(states);
}

function showAllStates(states) {
    clearStates();
    for (const state of states) {
        add(state, true);
    }
    endBatch();
}

function endBatch() {
    endChartBatch()
    endTreeBatch();
}

function onStateSelected(stateId) {
    if (selectedStateId == stateId) return;

    selectedStateId = stateId;
    selectChartRow(stateId);
    selectTreeNode(stateId);
    postMessage({command: 'stateSelected', stateId: stateId});

    if (!vscode) {
        showStatePlan('<div style="width: 400px; height: 900px; background-color: green"></div>');
    }
}

function initialize() {
    createTree();
    network.on('selectNode', function(nodeEvent) {
        if (nodeEvent.nodes.length > 0) {
            onStateSelected(nodeEvent.nodes[0]);
        }
    });

    network.on('deselectNode', function(nodeEvent){
        if (nodeEvent.nodes.length > 0) {
            onStateSelected(nodeEvent.nodes[0]);
        }
        else {
            onStateSelected(null);
        }
    });

    window.document.addEventListener('keydown', function(event) {
        navigate(event);
    })

    window.onresize = function() {
        unsubscribeChartEvents();
        reSizeChart();
        subscribeToChartEvents();
    }

    if (!vscode) {
        showDebuggerOn(false);
    }

    initializeChart();
    subscribeToChartEvents();

    onLoad();
}

var chartSelectEvent;

function subscribeToChartEvents() {
    console.log("subscribing to chart select event for ");console.log(chart);
    chartSelectEvent = google.visualization.events.addListener(chart, 'select', function() {
        console.log("chart selection changed");
        var selection = chart.getSelection();
        console.log(selection);
        if (selection && selection.length > 0) {
            var newSelectedStateId = rowIdToStateId.get(selection[0].row);
            onStateSelected(newSelectedStateId);
        }
        else {
            onStateSelected(null);
        }
    });
}

function unsubscribeChartEvents() {
    if (chartSelectEvent && chart)
        google.visualization.events.removeListener(chartSelectEvent);
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

function showDebuggerOn(on, port) {
    stopDisplay = on ? 'initial' : 'none';
    startDisplay = on ? 'none' : 'initial';

    window.document.getElementById("startDebuggerButton").style.display = startDisplay;
    window.document.getElementById("stopDebuggerButton").style.display = stopDisplay;
    window.document.getElementById("restartDebuggerButton").style.display = stopDisplay;

    window.document.getElementById("stopDebuggerButton").title="Search engine listener is running on port "+port+". Click here to stop it."
}

function showStatePlan(statePlanHtml) {
    window.document.getElementById("statePlan").innerHTML = statePlanHtml;
}

var shapeMap = new Map();
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
    switch (e.key) {
        case "ArrowLeft":
            var newSelectedStateId = e.shiftKey ? navigateChart(-1) : navigateTreeSiblings(-1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) e.cancelBubble = true;
        break;
        case "ArrowRight":
            var newSelectedStateId = e.shiftKey ? navigateChart(+1) : navigateTreeSiblings(+1);
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) e.cancelBubble = true;
        break;
        case "ArrowUp":
            var newSelectedStateId = navigateTreeUp();
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) e.cancelBubble = true;
            break;
        case "ArrowDown":
            var newSelectedStateId = navigateTreeDown();
            onStateSelected(newSelectedStateId);
            if (newSelectedStateId !== null) e.cancelBubble = true;
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
        var digit = parseInt(e.key);
        findingStateWithDigit(digit);
    }
}

var stateIdToFind = 0;
var stateFindingTimeout;

/**
 * Turns on state finding and appends a stateId digit.
 * @param {number} digit of the state number to append
 */
function findingStateWithDigit(digit) {
    stateIdToFind = stateIdToFind * 10 + digit;
    if (stateFindingTimeout) clearTimeout(stateFindingTimeout);
    stateFindingTimeout = setTimeout(() => findState(), 1000);
}

function findState() {
    try {
        onStateSelected(stateIdToFind);
    } catch(ex) {
        console.log("Cannot find find state with id " +stateIdToFind + ". Error: " + ex);
    }
    stateIdToFind = 0;
}

function navigateToChildOfSelectedState(actionName) {
    var newSelectedStateId = navigateToChildState(selectedStateId, actionName);
    if (newSelectedStateId != null) onStateSelected(newSelectedStateId);
}

function toggleStateLog() {
    postCommand('toggleStateLog');
}

function showStateLogButton(logFilePath) {
    var button = document.getElementById("toggleStateLogButton");

    if (logFilePath) {
        button.style = "color: green";
        button.title = "State selection synchronized with log file file: " + logFilePath;
    } else {
        button.style = "color: red";
        button.title = "State log file synchronization disabled. Click here to re-enable.";
    }
}
var vscode = null;
try {
    vscode = acquireVsCodeApi();
}catch(error){
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

function postMessage(message) {
    if (vscode) vscode.postMessage(message);
}

window.addEventListener('message', event => {
    const message = event.data;
    console.log("Message: " + message);
    switch (message.command) {
        case 'stateAdded':
            add(message.state);
            break;
        case 'stateUpdated':
            update(message.state);
            break;
        case 'debuggerState':
            showDebuggerOn(message.state == 'on');
            break;
        case 'showPlan':
            showStatePlan(message.state);
            break;
        case 'clear':
            clearStates();
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
        h: null,
        earliestTime: earliestTime,
        totalMakespan: null
    }
}

var mockStates = [
    createMockState(0, null, null, 0),
    createMockState(1, 0, 'drive start', .1),
    createMockState(2, 0, 'load start', .1),
    createMockState(3, 1, 'drive end', 2),
    createMockState(4, 3, 'unload start', 2.1),
];
var states = {};
var selectedStateId = null;

function addMock() {
    if (mockStates.length == 0) return;
    var newState = mockStates.shift();
    add(newState);
}

function updateMock() {
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

function add(newState) {
    addStateToTree(newState);
    addStateToChart(newState);
    states[newState.id]=newState;
}

function update(state) {
    updateStateOnChart(state);
    updateStateOnTree(state);

    if (selectedStateId == state.id) {
        selectChartRow(state.id);
    }
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

    initializeChart();
    google.visualization.events.addListener(chart, 'select', function() {
        var selection = chart.getSelection();
        if (selection && selection.length > 0) {
            onStateSelected(selection[0].row);
        }
        else {
            onStateSelected(null);
        }
    });

    window.document.addEventListener('keydown', function(event) {
        navigate(event);
    })

    window.onresize = function() {
        reSizeChart();
    }

    if (!vscode) {
        showDebuggerOn(false);
    }
}

function clearStates() {
    console.log('clearing all states');
    clearTree();
    clearChart();
}

function startSearchDebugger() {
    showDebuggerOn(true);
    postMessage({command: 'startDebugger'});
}

function stopSearchDebugger() {
    showDebuggerOn(false);
    postMessage({command: 'stopDebugger'});
}

function restartSearchDebugger() {
    postMessage({command: 'stopDebugger'});
    showStatePlan("");
    clearStates();
    postMessage({command: 'startDebugger'});
}

function showDebuggerOn(on) {
    stopDisplay = on ? 'inherit' : 'none';
    startDisplay = on ? 'none' : 'inherit';

    window.document.getElementById("startDebuggerButton").style.display = startDisplay;
    window.document.getElementById("stopDebuggerButton").style.display = stopDisplay;
    window.document.getElementById("restartDebuggerButton").style.display = stopDisplay;
}

function showStatePlan(statePlanHtml) {
    window.document.getElementById("statePlan").innerHTML = statePlanHtml;
}

function navigate(e) {
    e = e || window.event;
    switch (event.key) {
        case "ArrowLeft":
            if (event.shiftKey) {
                var newSelectedStateId = navigateChart(-1);
                onStateSelected(newSelectedStateId);
            } else {
                var newSelectedStateId = navigateTreeSiblings(-1);
                onStateSelected(newSelectedStateId);
            }
            break;
        case "ArrowRight":
            if (event.shiftKey) {
                var newSelectedStateId = navigateChart(+1);
                onStateSelected(newSelectedStateId);
            } else {
                var newSelectedStateId = navigateTreeSiblings(+1);
                onStateSelected(newSelectedStateId);
            }
            break;
        case "ArrowUp":
            var newSelectedStateId = navigateTreeUp();
            onStateSelected(newSelectedStateId);
            break;
        case "ArrowDown":
            var newSelectedStateId = navigateTreeDown();
            onStateSelected(newSelectedStateId);
            break;
    }
}

function navigateToChildOfSelectedState(actionName) {
    var newSelectedStateId = navigateToChildState(selectedStateId, actionName);
    if (newSelectedStateId != null) onStateSelected(newSelectedStateId);
}

function toggleStateLog() {
    postMessage({ command: 'toggleStateLog' });
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
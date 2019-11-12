// see vis.js documentation at
// http://visjs.org/docs/network/#Events
// http://visjs.org/docs/data/dataset.html
// http://visjs.org/examples/network/data/datasets.html

// create an array with nodes
var nodes = new vis.DataSet([]);

// create an array with edges
var edges = new vis.DataSet([]);

var treeData = {
    nodes: nodes,
    edges: edges
};

var network;
var autoFitEnabled = true;

function createTree() {
    // create the network
    var container = document.getElementById('network');
    var options = {
        autoResize: true,
        height: '100%',
        width: '100%',
        layout: {
            hierarchical: {
                direction: "UD",
                sortMethod: "directed",
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true,
                levelSeparation: 180
            }
        },
        interaction: {
            dragNodes: false
        },
        physics: {
            enabled: false
        },
        configure: {
            enabled: false
        },
        nodes: {
            color: {
                highlight: {
                    background: 'red',
                    border: 'red'
                }
            }
        },
        edges: {
            font: { align: 'top' },
            arrows: { to: { enabled: true, scaleFactor: 0.5 } }
        },
        groups: {
            plan: {
                color: {
                    background: 'lightgreen'
                },
                borderWidth: 0
            },
            deadEnd: {
                color: {
                    background: 'brown'
                },
                borderWidth: 0
            },
            goal: {
                color: {
                    background: 'green'
                },
                borderWidth: 0
            }
        }
    };
    network = new vis.Network(container, treeData, options);

    return network;
}

function addStateToTree(newState, batch) {
    nodes.add(toNode(newState));
    if (newState.parentId != null && newState.actionName) {
        addStateEdge(newState);
    }
    if (!batch && nodes.length < 100 && autoFitEnabled) network.fit();
}

function addStateEdge(newState) {
    var undecoratedActionName = newState.actionName.replace(/[├┤]$/, "").replace(/\[\d+\]/, "").trim();

    var actionLabel = createActionLabel(newState.actionName);

    var actionTitle = createActionTooltip(newState.actionName);

    var edge = {
        from: newState.parentId,
        to: newState.id,
        actionName: undecoratedActionName,
        label: actionLabel,
        title: actionTitle
    };
    edges.add(edge);
}

var snapActionLegend = new Map();
snapActionLegend['├'] = "Action start";
snapActionLegend['┤'] = "Action end";

/**
 * Constructs edge tooltip
 * @param {string} fullActionName full action name
 */
function createActionTooltip(fullActionName) {
    counter = 0;
    var counterMatch = fullActionName.match(/\[(\d+)\]/);
    if (counterMatch) {
        counter = parseInt(counterMatch[1]);
    }

    var tooltip = fullActionName.replace(/\[\d+\]/, "").replace(/[├┤]$/, " $&").split(' ')
        .filter(fragment => fragment != ' ')
        .map(fragment => fragment in snapActionLegend ? snapActionLegend[fragment] : fragment)
        .join('<br/>');

    if (counter > 0) {
        tooltip += '<br/>Shot counter: ' + counter;
    }

    return tooltip;
}

/**
 * Constructs edge label
 * @param {string} fullActionName full action name
 */
function createActionLabel(fullActionName) {
    var fragments = fullActionName.replace(/\[\d+\]/, "").split(' ');

    var maxLineLength = 19;
    var label = fragments.reduce((prevValue, currentValue) => {
        var separator = prevValue.length + currentValue.length > maxLineLength ? '\n' : ' ';
        return prevValue + separator + currentValue;
    });

    return label;
}

function endTreeBatch() {
    network.fit();
}

function toNode(newState) {
    var label = toNodeLabel(newState);
    var title = toNodeTitle(newState);

    var node = { id: newState.id, label: label, title: title };

    if (newState.isPlan) {
        node['group'] = 'plan';
    }
    if (newState.h !== undefined) {
        if (newState.isDeadEnd) {
            node['group'] = 'deadEnd';
        } else if (newState.h == 0) {
            node['group'] = 'goal';
        }
    }
    return node;
}

function toNodeLabel(newState) {
    var label = 'O: ' + newState.id;
    if (newState.h !== undefined) {
        label += '\nH: ' + (newState.isDeadEnd ? 'Infinite' : newState.h);
    }
    return label;
}

function toNodeTitle(newState) {

    var title = 'Order: ' + newState.id;
    if (newState.id != newState.origId) {
        title += ' (' + newState.origId + ')';
    }

    title += '\nGeneration: ' + newState.g
        + '\nEarliest time: ' + newState.earliestTime;

    if (newState.h !== undefined) {
        title += '\nHeuristic value: ' + (newState.isDeadEnd ? 'Infinite' : newState.h);
    }

    if (newState.totalMakespan) {
        title += '\nTotal makespan: ' + newState.totalMakespan
    }

    if (newState.helpfulActions) {
        title += '\nHelpful actions: ' + newState.helpfulActions.length
    }

    title = title.split('\n').join('<br/>');
    return title;
}

function updateStateOnTree(state) {
    nodes.update([toNode(state)]);
}

/**
 * Re-paints all states on the plan branch
 * @param {State[]} planStates intermediate states in the plan and the goal state
 */
function showPlanOnTree(planStates) {
    planStates.forEach(state => updateStateOnTree(state));
}

function selectTreeNode(id) {
    if (id !== null) {
        network.selectNodes([id]);
    }
    else {
        network.selectNodes([]);
    }
}

function clearTree() {
    nodes.clear();
    edges.clear();
}

function fitTree() {
    network.fit();
}

function navigateTreeUp() {
    var selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length == 0) return null;

    var selectedNode = selectedNodes[0];
    var parent = getParent(selectedNode);

    if (parent != null) {
        return parent;
    }

    // in all other cases, the selection did not change
    return selectedNode;
}

function navigateTreeDown() {
    var selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length == 0) return null;

    var selectedNode = selectedNodes[0];
    var children = getChildren(selectedNode);

    if (children.length > 0) {
        return children[0];
    }

    // in all other cases, the selection did not change
    return selectedNode;
}

/**
 * Navigating to +1 moves to the next sibling to the right.
 * Offset -2 navigates two sibling states to the left.
 * @param {int} offset direction and distance of navigation
 */
function navigateTreeSiblings(offset) {
    var selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length == 0) return null;

    var selectedNode = selectedNodes[0];
    var siblings = getSiblingsIncludingSelf(selectedNode);

    var indexOfThisNodeAmongSiblings = siblings.indexOf(selectedNode);

    var newSelectedNodeIndex = indexOfThisNodeAmongSiblings + offset;

    if (newSelectedNodeIndex > -1 && newSelectedNodeIndex < siblings.length) {
        return siblings[newSelectedNodeIndex];
    }

    // in all other cases, the selection did not change
    return selectedNode;
}


function getParent(childId) {
    var parents = edges.get({
        filter: function (edge) {
            return edge.to == childId;
        }
    });

    if (parents.length > 0) {
        return parents[0].from;
    }
    else {
        return null;
    }
}

function getChildren(parentId) {
    var edgesFromParent = edges.get({
        filter: function (edge) {
            return edge.from == parentId;
        }
    });
    var children = edgesFromParent.map(e => e.to);
    return children;
}

function getSiblingsIncludingSelf(nodeId) {
    var parent = getParent(nodeId);

    if (parent == null) return [];
    var siblings = getChildren(parent);
    return siblings;
}

function navigateToChildState(parentStateId, actionName) {
    var edgesFromParent = edges.get({
        filter: function (edge) {
            return edge.from == parentStateId && edge.actionName == actionName;
        }
    });
    if (edgesFromParent.length > 0) {
        return edgesFromParent[0].to;
    } else {
        return null;
    }
}

/**
 * Changes selected node shape
 * @param {string} shape shape name; supported are: diamond, dot, star, triangle, triangleDown, hexagon, square and icon
 */
function changeSelectedNodeShape(shape) {
    var selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length == 0) return null;

    var selectedNodeId = selectedNodes[0];
    var selectedNode = nodes.get(selectedNodeId);
    selectedNode.shape = shape;
    nodes.update(selectedNode);
}

// todo: support for context menu: http://jsbin.com/qeyumiwepo/5/edit?html,output
// todo: nodes.shape: diamond, dot, star, triangle, triangleDown, hexagon, square and icon
// http://visjs.org/examples/network/nodeStyles/icons.html
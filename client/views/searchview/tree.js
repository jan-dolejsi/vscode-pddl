/* eslint-disable @typescript-eslint/explicit-function-return-type */

// see vis.js documentation at
// https://visjs.github.io/vis-network/docs/network/
// https://visjs.github.io/vis-data/data/dataset.html
// https://visjs.github.io/vis-network/examples/

// create an array with nodes
const nodes = new vis.DataSet([]);

// create an array with edges
const edges = new vis.DataSet([]);

const treeData = {
    nodes: nodes,
    edges: edges
};

let network;
let autoFitEnabled = true;

/**
 * Creates tree
 * @returns {vis.Network}
 */
function createTree() {
    // create the network
    const container = document.getElementById('network');
    const options = {
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
                levelSeparation: 180,
                shakeTowards: "roots" // vs. "leaves"
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
            visitedOrWorse: {
                color: {
                    background: 'black'
                },
                font: {
                    color: 'white'
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

/**
 * Adds state to tree
 * @param {State} newState new state
 * @param {boolean} batch batch mode
 */
function addStateToTree(newState, batch) {
    nodes.add(toNode(newState));
    if (newState.parentId !== null && newState.actionName) {
        addStateEdge(newState);
    }
    if (!batch && nodes.length < 100 && autoFitEnabled) { network.fit(); }
}

/**
 * Add edge towards the newState
 * @param {State} newState new child state
 */
function addStateEdge(newState) {
    const undecoratedActionName = newState.actionName.replace(/[├┤]$/, "").replace(/\[\d+\]/, "").trim();

    const actionLabel = createActionLabel(newState.actionName);

    const actionTitle = createActionTooltip(newState.actionName);

    const edge = {
        from: newState.parentId,
        to: newState.id,
        actionName: undecoratedActionName,
        label: actionLabel,
        title: actionTitle
    };
    edges.add(edge);
}

const snapActionLegend = new Map();
snapActionLegend['├'] = "Action start";
snapActionLegend['┤'] = "Action end";

/**
 * Constructs edge tooltip
 * @param {string} fullActionName full action name
 * @returns {string} action edge tooltip
 */
function createActionTooltip(fullActionName) {
    counter = 0;
    const counterMatch = fullActionName.match(/\[(\d+)\]/);
    if (counterMatch) {
        counter = parseInt(counterMatch[1]);
    }

    let tooltip = fullActionName.replace(/\[\d+\]/, "").replace(/[├┤]$/, " $&").split(' ')
        .filter(fragment => fragment !== ' ')
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
 * @returns {string} action label
 */
function createActionLabel(fullActionName) {
    const fragments = fullActionName.replace(/\[\d+\]/, "").split(' ');

    const maxLineLength = 19;
    const label = fragments.reduce((prevValue, currentValue) => {
        const separator = prevValue.length + currentValue.length > maxLineLength ? '\n' : ' ';
        return prevValue + separator + currentValue;
    });

    return label;
}

/**
 * Ends tree batch update.
 * @returns {void}
 */
function endTreeBatch() {
    network.fit();
}

/**
 * Converts state to network node object
 * @param {State} newState state
 */
function toNode(newState) {
    const label = toNodeLabel(newState);
    const title = toNodeTitle(newState);

    const node = { id: newState.id, label: label, title: title };

    if (newState.wasVisitedOrIsWorse) {
        node['group'] = 'visitedOrWorse';
    }
    if (newState.isPlan) {
        node['group'] = 'plan';
    }
    if (newState.h !== undefined) {
        if (newState.isDeadEnd) {
            node['group'] = 'deadEnd';
        }
    }
    if (newState.isGoal) {
        node['group'] = 'goal'; // todo: this is a wrong assumption
    }
    return node;
}

/**
 * Creates label for the state visual node
 * @param {State} newState state
 */
function toNodeLabel(newState) {
    let label = 'O: ' + newState.id;
    if (newState.h !== undefined) {
        label += '\nH: ' + (newState.isDeadEnd ? 'Infinite' : newState.h);
    }
    return label;
}

/**
 * Creates tooltip for the state visual node
 * @param {State} newState state
 */
function toNodeTitle(newState) {

    let title = 'Order: ' + newState.id;
    if (newState.id !== newState.origId) {
        title += ' (' + newState.origId + ')';
    }

    title += '\nGeneration: ' + newState.g
        + '\nEarliest time: ' + newState.earliestTime;

    if (newState.wasVisitedOrIsWorse) {
        title += '\nState was visited or is worse than a previously visited state';
    }
    
    if (newState.h !== undefined) {
        title += '\nHeuristic value: ' + (newState.isDeadEnd ? 'Infinite' : newState.h);
    }

    if (newState.totalMakespan) {
        title += '\nTotal makespan: ' + newState.totalMakespan;
    }

    if (newState.helpfulActions) {
        title += '\nHelpful actions: ' + newState.helpfulActions.length;
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
    const lastStateId = Math.max(planStates.map(state => state.id));
    const lastState = planStates.find(state => state.id === lastStateId);
    lastState.isGoal = true;
    updateStateOnTree(lastState);
}

/**
 * Visually select tree node
 * @param {number} id state id
 */
function selectTreeNode(id) {
    if (id !== null) {
        network.selectNodes([id]);
        network.focus(id, { animation: true, locked: false})
    }
    else {
        network.selectNodes([]);
        network.releaseNode();
    }
}

function clearTree() {
    nodes.clear();
    edges.clear();
}

function fitTree() {
    network.fit();
}

/**
 * @returns {number | null} parent ID, selected ID (if root), or null if there is no selected node
 */
function navigateTreeUp() {
    const selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length === 0) { return null; }

    const selectedNode = selectedNodes[0];
    const parent = getParent(selectedNode);

    if (parent !== null) {
        return parent;
    }

    // in all other cases, the selection did not change
    return selectedNode;
}

/**
 * @returns {number | null} parent ID, selected ID (if leaf), or null if there is no selected node
 */
function navigateTreeDown() {
    /** @type{number[]} */
    const selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length === 0) { return null; }

    const selectedNode = selectedNodes[0];
    const children = getChildren(selectedNode);

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
 * @returns {number | null} sibling ID, selected node ID (if most left/right sibling), or null if there is no selected node
 */
function navigateTreeSiblings(offset) {
    const selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length === 0) { return null; }

    const selectedNode = selectedNodes[0];
    const siblings = getSiblingsIncludingSelf(selectedNode);

    const indexOfThisNodeAmongSiblings = siblings.indexOf(selectedNode);

    const newSelectedNodeIndex = indexOfThisNodeAmongSiblings + offset;

    if (newSelectedNodeIndex > -1 && newSelectedNodeIndex < siblings.length) {
        return siblings[newSelectedNodeIndex];
    }

    // in all other cases, the selection did not change
    return selectedNode;
}


/**
 * Finds node's parent
 * @param {number} childId child node ID
 * @returns {number | null}
 */
function getParent(childId) {
    const parents = edges.get({
        filter: function (edge) {
            return edge.to === childId;
        }
    });

    if (parents.length > 0) {
        return parents[0].from;
    }
    else {
        return null;
    }
}

/** 
 * @param parentId {number} parent ID
 * @returns {number[]} sibling IDs 
 */
function getChildren(parentId) {
    const edgesFromParent = edges.get({
        filter: function (edge) {
            return edge.from === parentId;
        }
    });
    const children = edgesFromParent.map(e => e.to);
    return children;
}

/**
 * Gets all siblings including this node.
 * @param {number} nodeId node ID
 * @returns {number[]} sibling IDs
 */
function getSiblingsIncludingSelf(nodeId) {
    const parent = getParent(nodeId);

    if (parent === null) { return []; }
    const siblings = getChildren(parent);
    return siblings;
}

/**
 * Navigates the tree to the child (if the action was exanded)
 * @param {number} parentStateId parent state ID
 * @param {string} actionName action name that expands the parent state
 * @returns {number | null} child ID, or null, if the action was not expanded
 */
function navigateToChildState(parentStateId, actionName) {
    const edgesFromParent = edges.get({
        filter: function (edge) {
            return edge.from === parentStateId && edge.actionName === actionName;
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
 * @return {void}
 */
function changeSelectedNodeShape(shape) {
    const selectedNodes = network.getSelectedNodes();
    if (selectedNodes.length === 0) { return null; }

    const selectedNodeId = selectedNodes[0];
    const selectedNode = nodes.get(selectedNodeId);
    selectedNode.shape = shape;
    nodes.update(selectedNode);
}

// todo: support for context menu: http://jsbin.com/qeyumiwepo/5/edit?html,output
// todo: nodes.shape: diamond, dot, star, triangle, triangleDown, hexagon, square and icon
// https://visjs.github.io/vis-network/examples/network/nodeStyles/icons.html
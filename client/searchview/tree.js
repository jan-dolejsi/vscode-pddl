// see vis.js documentation at
// http://visjs.org/docs/network/#Events
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
            font: { align: 'top' }
        }
    };
    network = new vis.Network(container, treeData, options);

    return network;
}

function addStateToTree(newState, batch) {
    nodes.add(toNode(newState));
    if (newState.parentId != null && newState.actionName) {
        var undecoratedActionName = newState.actionName.replace(/[├┤]$/, "").trim();
        edges.add({ from: newState.parentId, to: newState.id, actionName: undecoratedActionName, label: newState.actionName.split(' ').join('\n') });
    }
    if (!batch && nodes.length < 100) network.fit();
}

function endTreeBatch() {
    network.fit();
}

function toNode(newState) {
    var label = 'O: ' + newState.id;
    if (newState.h != null) {
        label += '\nH: ' + newState.h;
    }
    var node = { id: newState.id, label: label };
    if (newState.h != null) {
        if(!Number.isFinite(newState.h)) {
        // dead-end state
        node['color'] = { background: 'brown' };
        } else if (newState.h == 0) {
            node['color'] = { background: 'green', border: 'green' };
        }
    }
    return node;
}

function updateStateOnTree(state) {
    nodes.update([toNode(state)]);
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

// todo: support for context menu: http://jsbin.com/qeyumiwepo/5/edit?html,output
// todo: nodes.shape: diamond, dot, star, triangle, triangleDown, hexagon, square and icon
// http://visjs.org/examples/network/nodeStyles/icons.html
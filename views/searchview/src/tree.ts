import { DataSet, IdType, Network } from 'vis-network/standalone';
import { getElementByIdOrThrow, State } from './utils';

// see vis.js documentation at
// https://visjs.github.io/vis-network/docs/network/
// https://visjs.github.io/vis-data/data/dataset.html
// https://visjs.github.io/vis-network/examples/

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Node {
    readonly id: number;
    readonly label: string;
    readonly title: string;
    group?: string;
    shape?: string;
}

interface ActionEdge {
    readonly id?: number; // required by the DataSet class, but not used
    readonly from: number;
    readonly to: number;
    readonly label: string;
    readonly title: string;
    readonly actionName: string; // this is a custom extension to the vis.js network Edge
};

export class SearchTree {
    readonly network: Network;
    autoFitEnabled = true;

    // create an array with nodes
    readonly nodes: DataSet<Node> = new DataSet([]);

    // create an array with edges
    readonly edges: DataSet<ActionEdge> = new DataSet([]);

    readonly treeData = {
        nodes: this.nodes,
        edges: this.edges
    };

    /**
     * Creates tree
     */
    constructor() {
        // create the network
        const container = getElementByIdOrThrow('network');
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
        this.network = new Network(container, this.treeData, options);
    }

    toggleAutoFit(): void {
        this.autoFitEnabled = !this.autoFitEnabled;
    }

    /**
     * Adds state to tree
     * @param newState new state
     * @param batch batch mode
     */
    addStateToTree(newState: State, batch: boolean): void {
        this.nodes.add(toNode(newState));
        if (newState.parentId !== null && newState.actionName) {
            this.addStateEdge(newState);
        }
        if (!batch && this.nodes.length < 100 && this.autoFitEnabled) {
            this.network.fit();
        }
    }
    
    /**
     * Add edge towards the newState
     * @param newState new child state
     */
    addStateEdge(newState: State): void {
        if (!newState.actionName || newState.parentId === undefined) {
            throw new Error(`Cannot progress _to_ the initial state.`);
        }

        const undecoratedActionName = newState.actionName.replace(/[├┤]$/, "").replace(/\[\d+\]/, "").trim();

        const actionLabel = createActionLabel(newState.actionName!);

        const actionTitle = createActionTooltip(newState.actionName!);

        const edge: ActionEdge = {
            from: newState.parentId!,
            to: newState.id,
            actionName: undecoratedActionName,
            label: actionLabel,
            title: actionTitle
        };
        this.edges.add(edge);
    }

    /**
     * Ends tree batch update.
     */
    endTreeBatch(): void {
        this.network.fit();
    }

    updateStateOnTree(state: State): void {
        this.nodes.update([toNode(state)]);
    }
    
    /**
     * Re-paints all states on the plan branch
     * @param planStates intermediate states in the plan and the goal state
     */
    showPlanOnTree(planStates: State[]): void {
        planStates.forEach(state => this.updateStateOnTree(state));
        // assuming state IDs grow monotonically
        const lastStateId = Math.max(...planStates.map(state => state.id as number));
        const lastState = planStates.find(state => state.id === lastStateId);
        if (lastState) {
            lastState.isGoal = true;
            this.updateStateOnTree(lastState);
        }
    }
    
    /**
     * Visually select tree node
     * @param id state id
     */
    selectTreeNode(id: number | null): void {
        if (id !== null) {
            this.network.selectNodes([id]);
            this.network.focus(id, { animation: true, locked: false });
        }
        else {
            this.network.selectNodes([]);
            this.network.releaseNode();
        }
    }
    
    clearTree(): void {
        this.nodes.clear();
        this.edges.clear();
    }
    
    fitTree(): void {
        this.network.fit();
    }
    
    /**
     * @returns parent ID, selected ID (if root), or null if there is no selected node
     */
    navigateTreeUp(): number | null {
        const selectedNodes = this.network.getSelectedNodes();
        if (selectedNodes.length === 0) { return null; }
    
        const selectedNode = toIntNodeId(selectedNodes[0]);
        const parent = this.getParent(selectedNode);
    
        if (parent !== null) {
            return parent;
        }
    
        // in all other cases, the selection did not change
        return selectedNode;
    }
    
    /**
     * @returns parent ID, selected ID (if leaf), or null if there is no selected node
     */
    navigateTreeDown(): number | null {
        const selectedNodes = this.network.getSelectedNodes();
        if (selectedNodes.length === 0) { return null; }
    
        const selectedNode = toIntNodeId(selectedNodes[0]);
        const children = this.getChildren(selectedNode);
    
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
     * @returns sibling ID, selected node ID (if most left/right sibling), or null if there is no selected node
     */
    navigateTreeSiblings(offset: number): number | null {
        const selectedNodes = this.network.getSelectedNodes();
        if (selectedNodes.length === 0) { return null; }
    
        const selectedNode = toIntNodeId(selectedNodes[0]);
        const siblings = this.getSiblingsIncludingSelf(selectedNode);
    
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
     * @param childId child node ID
     */
    getParent(childId: number): number | null {
        const parents = this.edges.get({
            filter: function (edge: ActionEdge) {
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
     * @param parentId parent ID
     * @returns sibling IDs 
     */
    getChildren(parentId: number): number[] {
        const edgesFromParent = this.edges.get({
            filter: function (edge: ActionEdge) {
                return edge.from === parentId;
            }
        });
        const children = edgesFromParent.map((e: ActionEdge) => e.to).filter(e => !!e).map(e => toIntNodeId(e!));
        return children;
    }
    
    /**
     * Gets all siblings including this node.
     * @param nodeId node ID
     * @returns sibling IDs
     */
    getSiblingsIncludingSelf(nodeId: number): number[] {
        const parent = this.getParent(nodeId);
    
        if (parent === null) { return []; }
        const siblings = this.getChildren(parent);
        return siblings;
    }
    
    /**
     * Navigates the tree to the child (if the action was exanded)
     * @param parentStateId parent state ID
     * @param actionName action name that expands the parent state
     * @returns child ID, or null, if the action was not expanded
     */
    navigateToChildState(parentStateId: number, actionName: string): number | null {
        const edgesFromParent = this.edges.get({
            filter: function (edge: ActionEdge) {
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
     * @param shape shape name; supported are: diamond, dot, star, triangle, triangleDown, hexagon, square and icon
     */
    changeSelectedNodeShape(shape: string): void {
        const selectedNodes = this.network.getSelectedNodes();
        if (selectedNodes.length === 0) { return; }
    
        const selectedNodeId = selectedNodes[0];
        const selectedNode = this.nodes.get(selectedNodeId);
        if (selectedNode) {
            (selectedNode as Node).shape = shape;
            this.nodes.update(selectedNode);
        }
    }
}

const snapActionLegend = new Map<string, string>();
snapActionLegend.set('├', "Action start");
snapActionLegend.set('┤', "Action end");

/**
 * Constructs edge tooltip
 * @param fullActionName full action name
 * @returns action edge tooltip
 */
function createActionTooltip(fullActionName: string): string {
    let counter = 0;
    const counterMatch = fullActionName.match(/\[(\d+)\]/);
    if (counterMatch) {
        counter = parseInt(counterMatch[1]);
    }

    let tooltip = fullActionName.replace(/\[\d+\]/, "").replace(/[├┤]$/, " $&").split(' ')
        .filter(fragment => fragment !== ' ')
        .map(fragment => fragment in snapActionLegend ? snapActionLegend.get(fragment) : fragment)
        .join('<br/>');

    if (counter > 0) {
        tooltip += '<br/>Shot counter: ' + counter;
    }

    return tooltip;
}

/**
 * Constructs edge label
 * @param fullActionName full action name
 * @returns action label
 */
function createActionLabel(fullActionName: string): string {
    const fragments = fullActionName.replace(/\[\d+\]/, "").split(' ');

    const maxLineLength = 19;
    const label = fragments.reduce((prevValue, currentValue) => {
        const separator = prevValue.length + currentValue.length > maxLineLength ? '\n' : ' ';
        return prevValue + separator + currentValue;
    });

    return label;
}

/**
 * Converts state to network node object
 * @param newState state
 */
function toNode(newState: State): Node {
    const label = toNodeLabel(newState);
    const title = toNodeTitle(newState);

    const node: Node = { id: newState.id, label: label, title: title };

    if (newState.wasVisitedOrIsWorse) {
        node.group = 'visitedOrWorse';
    }
    if (newState.isPlan) { // this flag is set in the extension for all states on the plan
        node.group = 'plan';
    }
    if (newState.h !== undefined) {
        if (newState.isDeadEnd) {
            node.group = 'deadEnd';
        }
    }
    if (newState.isGoal) {
        node.group = 'goal'; // todo: this is a wrong assumption that it is also a plan
    }
    return node;
}

/**
 * Creates label for the state visual node
 * @param newState state
 */
function toNodeLabel(newState: State): string {
    let label = 'O: ' + newState.id;
    if (newState.h !== undefined) {
        label += '\nH: ' + (newState.isDeadEnd ? 'Infinite' : newState.h);
    }
    return label;
}

/**
 * Creates tooltip for the state visual node
 * @param newState state
 */
function toNodeTitle(newState: State): string {

    let title = 'Order: ' + newState.id;
    if (newState.id.toString() !== newState.origId) {
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

function toIntNodeId(nodeId: IdType): number {
    return nodeId as number;
}

// todo: support for context menu: http://jsbin.com/qeyumiwepo/5/edit?html,output
// todo: nodes.shape: diamond, dot, star, triangle, triangleDown, hexagon, square and icon
// https://visjs.github.io/vis-network/examples/network/nodeStyles/icons.html
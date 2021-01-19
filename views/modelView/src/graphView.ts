/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"strict mode";

import { applyThemeToNetwork, Node, Edge, getElementByIdOrThrow, setIsInset, vscode, expandInset, closeInset, ThemeChangedEvent, addWindowEventListener, CommandMessage } from "./baseView";
import { GraphViewData } from "model";

/** Declared in baseWebview.js */
declare function onLoad(): void;

/**
 * This must be declared in the same file, where it is used : (.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace vis {

  type IdType = number | string;

  class DataSet<T> {
      constructor(content: T[]);

      length: number;

      add(node: T): void;
      add(nodes: T[]): void;
      get(id: number): T;
      get(filter: { filter: (edge: Edge) => boolean }): T[];
      clear(): void;
      update(nodes: Node[]): void;
      update(node: Node): void;
  }

  type Direction = 'DU' | 'UD' | 'RL' | 'LR';

  interface Options {
      layout?: { hierarchical: { direction: Direction } };
      edges?: { font: { color: string | undefined; strokeColor: string | undefined } };
      configure?: boolean;
  }

  export class Network {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(container: HTMLElement, treeData: { nodes: DataSet<Node>; edges: DataSet<Edge> }, options: any);

      fit(options?: { animation: boolean }): void;
      getSelectedNodes(): number[];
      releaseNode(): void;
      focus(nodeId: number, arg1: { animation: boolean; locked: boolean }): void;
      selectNodes(arg0: number[]): void;

      on(arg0: string, event: (nodeEvent: { nodes: number[] }) => void): void;

      setOptions(options: Options): void;
      setSize(width: string, height: string): void;
  }
}

const nodes = new vis.DataSet<Node>([]);
const edges = new vis.DataSet<Edge>([]);
const networkData = {
  nodes: nodes,
  edges: edges
};

let network: vis.Network | null;

let _inverted = false;
const TOP_DOWN = "TOP_DOWN";
const LEFT_RIGHT = "LEFT_RIGHT";
let _layout = TOP_DOWN;
let _settings = false;
let _origData: GraphViewData = {
  nodes: [],
  relationships: []
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initialize(): void {
  // create a network
  const container = getElementByIdOrThrow("network");

  const options = {
    autoResize: true,
    height: '100%',
    width: '100%',
    nodes: {
      font: {
        size: 12
      }
    },
    edges: {
      arrows: {
        to: {
          enabled: true,
          scaleFactor: 0.5
        }
      },
      font: {
        size: 8,
        align: "top"
      },
      smooth: false
    },
    layout: {
      hierarchical: {
        enabled: true,
        direction: "DU",
        sortMethod: "directed"
      }
    },
    physics: {
      enabled: false,
      minVelocity: 0.75,
      solver: "hierarchicalRepulsion"
    },
    configure: false
  };
  network = new vis.Network(container, networkData, options);
  resize();

  network.on("configChange", function () {
    // this will immediately fix the height of the configuration
    // wrapper to prevent unecessary scrolls in chrome.
    // see https://github.com/almende/vis/issues/1568
    const div = container.getElementsByClassName("vis-configuration-wrapper")[0] as HTMLElement;
    div.style["height"] = div.getBoundingClientRect().height + "px";
  });
  
  document.body.addEventListener("themeChanged", (event: Event) => {
    network && applyThemeToNetwork(network, (event as ThemeChangedEvent).detail.newTheme);
  });

  if (!vscode) { populateWithTestData(); }
  ensureLayout();
  onLoad();
}

function handleMessage(message: { command: string; data: never }): void {
  switch (message.command) {
    case 'updateContent':
      updateGraph(message.data);
      break;
    case 'setInverted':
      setInverted((message as (CommandMessage & { value: boolean })).value);
      break;
    case 'setOptions':
      setOptions((message as (CommandMessage & { options: vis.Options })).options);
      break;
    default:
      console.log("Unexpected message: " + message.command);
  }

}

addWindowEventListener(handleMessage);

function populateWithTestData(): void {
  // for testing only
  updateGraph({
    nodes: [{ id: 1, label: 'City' }, { id: 2, label: 'Town nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn' }, { id: 3, label: 'Village' }, { id: 4, label: 'Capital' }],
    relationships: [{ from: 1, to: 2 }, { from: 2, to: 3 }, {from: 4, to: 2}]
  });
  setIsInset(true);
}

function clearNetwork(): void {
  nodes.clear();
  edges.clear();
}

function updateGraph(data: GraphViewData): void {
  _origData = data;
  clearNetwork();
  if (data.nodes) { nodes.add(data.nodes); }
  edges.add(data.relationships);
  network?.fit({animation: true});
}

interface VisNetworkHtmlElement extends HTMLElement {
  canvas: HTMLElement;
}

function resize(): void {
  const container = getElementByIdOrThrow("network");
    const visNetwork = container.getElementsByClassName("vis-network")[0] as VisNetworkHtmlElement;
    const canvas = visNetwork.canvas;
    if (canvas) {
      network?.setSize(canvas.style["width"], (window.innerHeight - 6) + "px");
    }
}

/**
 * Sets the `inverted` fag. 
 * @param inverted should the direction of the graph layout be inverted?
 */
function setInverted(inverted: boolean): void {
  _inverted = inverted;
  ensureLayout();
}

function ensureLayout(): void {
  if (_layout === TOP_DOWN) {
    topDown();
  }
  else if (_layout === LEFT_RIGHT) {
    leftRight();
  }
}

function topDown(): void {
  _layout = TOP_DOWN;
  setLayoutDirection(_inverted ? 'DU' : 'UD');
}

function leftRight(): void {
  _layout = LEFT_RIGHT;
  setLayoutDirection(_inverted ? 'RL' : 'LR');
}

function setLayoutDirection(direction: vis.Direction): void {
  network?.setOptions({ layout: { hierarchical: { direction: direction } } });
}

function setOptions(options: vis.Options): void {
  network?.setOptions(options);
}

function fit(): void {
  network?.fit();
}

function toggleSettings(): void {
  _settings = !_settings;
  network?.setOptions({ configure: _settings });
  document.body.style.overflow = _settings ? 'scroll' : 'hidden';
  if (_settings) {
    const settingsElement = document.getElementsByClassName("vis-configuration-wrapper")[0];
    if (settingsElement) { settingsElement.scrollIntoView(); }
  }
}

function reset(): void {
  updateGraph(_origData);
}


// subscribe to view events
document.body.onload = initialize;
document.body.onresize = resize; 
getElementByIdOrThrow("reset").onclick = reset;
getElementByIdOrThrow("toggleSettings").onclick = toggleSettings;
getElementByIdOrThrow("fit").onclick = fit;

getElementByIdOrThrow("topDown-light").onclick = topDown;
getElementByIdOrThrow("topDown-dark").onclick = topDown;

getElementByIdOrThrow("leftRight-light").onclick = leftRight;
getElementByIdOrThrow("leftRight-dark").onclick = leftRight;

getElementByIdOrThrow("expandInset").onclick = expandInset;
getElementByIdOrThrow("closeInset").onclick = closeInset;
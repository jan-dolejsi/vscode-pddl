/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"strict mode";

import { applyThemeToNetwork, Node, Edge, getElementByIdOrThrow, setIsInset, vscode, expandInset, closeInset, ThemeChangedEvent, addWindowEventListener, CommandMessage } from "./baseView";
import { CustomViewData, GraphViewData } from "model";
import { DomainInfo, Plan, ProblemInfo, VariableValue } from "pddl-workspace";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initialize(): void {
  // create a network
  const container = getElementByIdOrThrow("network");

  const options = {
    clickToUse: true,
    nodes: {
      font: { size: 12 }
    },
    edges: {
      font: { align: 'top', size: 8 },
      arrows: { to: { enabled: true, scaleFactor: 0.5 } }
    },
    physics: {
      stabilization: false
    },
    configure: false
  };
  network = new vis.Network(container, networkData, options);

  network.on("configChange", function () {
    // this will immediately fix the height of the configuration
    // wrapper to prevent unnecessary scrolls in chrome.
    // see https://github.com/almende/vis/issues/1568
    const div = container.getElementsByClassName("vis-configuration-wrapper")[0] as HTMLElement;
    div.style["height"] = div.getBoundingClientRect().height + "px";
  });

  document.body.addEventListener("themeChanged", event => {
    network && applyThemeToNetwork(network, (event as ThemeChangedEvent).detail.newTheme);
  });

  if (!vscode) { populateWithTestData(); }
  onLoad();
}

type Value = boolean | number | undefined;

/** Schema for data being passed to the view for display. */
interface ProblemInitViewData {
  symmetricRelationshipGraph: GraphViewData;
  typeProperties: never; // serialized Map<string, TypeProperties>;
  typeRelationships: TypesRelationship[];
  scalarValues: never; // serialized Map<string, Value>;
  customVisualization: CustomViewData | undefined;
}
interface TypeProperties {
  propertyNames: string[];
  objects: never;
}
interface TypesRelationship {
  types: never; // serializable Map<string, string[]>;
  relationships: never; // serializable Map<string, RelationshipValue[]>;
}
interface RelationshipValue {
  parameters: never; // serializable Map<string, string>;
  value?: Value;
}

function handleMessage(message: CommandMessage): void {
  switch (message.command) {
    case 'updateContent':
      const data = message.data as ProblemInitViewData;
      updateScalarValues(data.scalarValues);
      updateGraph(data.symmetricRelationshipGraph);
      updateObjectProperties(data.typeProperties);
      updateObjectRelationships(data.typeRelationships);
      updateCustomView(data.customVisualization);
      break;
    default:
      console.log("Unexpected message: " + message.command);
  }
}

addWindowEventListener(handleMessage);

function populateWithTestData(): void {
  // for testing only
  updateCustomView({
    plan: new Plan([]),
    state: [
      new VariableValue("predicate1", true),
      new VariableValue("function1", 3.14),
    ],
    customVisualizationScript: `function visualizePlanHtml(plan, width) {
        return "PLAN VISUALIZATION";
    }
    module.exports = {
        // define one of the following functions:
        visualizePlanHtml: visualizePlanHtml, 
        visualizePlanInDiv: undefined, // function (hostDiv, plan, width)
        visualizePlanSvg: undefined // function (plan, width)
    };
    `,
    displayWidth: 500
  });
  updateGraph({
    nodes: [{ id: 1, label: 'City' }, { id: 2, label: 'Town' }, { id: 3, label: 'Village' }],
    relationships: [{ from: 1, to: 2, label: 'connected' }, { from: 2, to: 3, label: 'connected' }]
  });
  const truckProperties: TypeProperties = {
    propertyNames: [
      "size", "available"
    ],
    objects: {
      "red": {
        "size": 1,
        "available": true
      },
      "blue": {
        "size": 2,
        "available": false
      },
      "green": {
        "size": undefined
      }
    } as never
  };
  updateObjectProperties({
    "truck": truckProperties
  } as never);
  updateObjectRelationships([
    {
      types: {
        "driver": ["Peter", "Paul"],
        "truck": ["red", "blue", "green"]
      } as never,
      relationships: {
        "driving": [
          {
            "parameters": {
              "driver": "Peter",
              "truck": "red"
            }
          },
          {
            "parameters": {
              "driver": "Paul",
              "truck": "green"
            },
            "value": false
          }
        ],
        "milage": [
          {
            "parameters": {
              "driver": "Peter",
              "truck": "red"
            },
            "value": 14
          },
          {
            "parameters": {
              "driver": "Paul",
              "truck": "green"
            },
            "value": 17
          }
        ]
      } as never
    },
    {
      relationships: {
          "same": [
              {
                  "parameters": {
                      "t1": "red",
                      "t2": "blue"
                  },
                  "value": true
              },
              {
                  "parameters": {
                      "t1": "blue",
                      "t2": "green"
                  },
                  "value": true,
              }
          ]
      } as never,
      types: {
          "truck": [
              "red",
              "green",
              "blue"
          ]
      } as never
    }
  ]);
  setIsInset(true);
}

function clearNetwork(): void {
  nodes.clear();
  edges.clear();
}

function updateGraph(data: GraphViewData): void {
  clearNetwork();
  nodes.add(data.nodes);
  edges.add(data.relationships);
  network?.fit();

  const container = getElementByIdOrThrow("networkSection");
  container.style.display = data.nodes.length > 0 ? 'initial' : 'none';
}

function updateScalarValues(data: never): void {
  const container = getElementByIdOrThrow("scalarValues");
  const header = `<table class="objectValues">
  <tr><th></th><th>value</th></tr>`;
  const footer = `</table>`;
  container.innerHTML = header +
    Object.keys(data)
      .sort((a, b) => a.localeCompare(b))
      .map(variableName => createScalarValuesTableRow(variableName, data[variableName] as Value))
      .join('\n') +
    footer;
}

function createScalarValuesTableRow(variableName: string, value: Value): string {
  return `<tr><th>${variableName}</th><td>${value}</td></tr>`;
}

/**
 * Renders object properties as HTML tables per type.
 * @param data object properties
 */
function updateObjectProperties(data: never): void {
  const container = getElementByIdOrThrow("objectProperties");
  container.innerHTML = Object.keys(data).map(type => createTypePropertiesTable(type, data[type])).join('\n');
}

function createTypePropertiesTable(type: string, objectProperties: TypeProperties): string {
  const headerCells = [th(type)].concat(objectProperties.propertyNames.map(n => th(n)));
  const objectRows = Object.keys(objectProperties.objects).map(objName => createObjectPropertiesRow(objName, objectProperties.objects[objName] as never, objectProperties.propertyNames));
  return '<table class="objectValues">' +
    tr(headerCells) +
    objectRows.join('\n') +
    "\n</table>";
}

/**
 * Create object property table row
 * @param objectName object name
 * @param objectValues object values
 * @param propertyNames property names
 */
function createObjectPropertiesRow(objectName: string, objectValues: never, propertyNames: string[]): string {
  const valueCells = propertyNames.map(p => td(createObjectPropertyValue(objectValues,p, objectName)));
  const cells = [th(objectName)].concat(valueCells);
  return tr(cells);
}

/**
 * Create object property table row
 * @param objectValues object values
 * @param propertyName property name
 * @param objectName name of the object for the tooltip
 */
function createObjectPropertyValue(objectValues: never, propertyName: string, objectName: string): string {
  const value = objectValues[propertyName];
  const fullVariableName = `(${propertyName} ${objectName})`;
  return createValueSnap(fullVariableName, value);
}

function createValueSnap(fullVariableName: string, value: Value): string {
  if (value !== undefined) {
    let tooltip = fullVariableName;
    if (typeof(value) === 'number') {
      tooltip = toPddlFunctionInit(tooltip, value);
    }
    else if (typeof (value) === 'boolean' && value === false) {
      tooltip = `(not ${tooltip})`;
    }
    return toSnap(value, tooltip);
  } else {
    return "&nbsp;";
  }
}

function updateObjectRelationships(data: TypesRelationship[]): void {
  const container = getElementByIdOrThrow("relationships");
  container.innerHTML = data.map(relationship => createTypeRelationshipsTable(relationship)).join('\n');
}

function createTypeRelationshipsTable(relationship: TypesRelationship): string {
  const types = Object.keys(relationship.types);
  if (types.length > 2) { return ""; }
  const objectType = types[0];
  const subjectType = types.length === 2 ? types[1] : types[0]; // if relationship is symmetric

  const headerCells = [th(types.join(' \\ '))].concat((relationship.types[subjectType] as string[]).map(n => th(n)));

  const objectRows = (relationship.types[objectType] as string[])
    .map(rowObject => createObjectRelationshipRow(rowObject, relationship, subjectType));

  return '<table class="objectValues">' +
    tr(headerCells) +
    objectRows.join('\n') +
    "\n</table>";
}

/**
 * Create object relationship table row
 * @param rowObject name of the object described by this row
 * @param relationship type relationship
 * @param subjectType name of the type in the columns
 */
function createObjectRelationshipRow(rowObject: string, relationship: TypesRelationship, subjectType: string): string {
  const valueCells = (relationship.types[subjectType] as string[])
    .map(subject => createRelationshipsValue(rowObject, subject, relationship.relationships))
    .map(value => td(value));
  const cells = [th(rowObject)].concat(valueCells);
  return tr(cells);
}

/**
 * Creates relationship table cell
 * @param rowObject object name (row)
 * @param subject subject name (column)
 * @param relationships list of relationship values (as serialized Map<string, RelationshipValue[]>)
 */
function createRelationshipsValue(rowObject: string, subject: string, relationships: never): string {
  const relevantRelationshipsValues = Object.keys(relationships)
    .map(relationshipName => createRelationshipValue(relationshipName, relationships[relationshipName] as RelationshipValue[], [rowObject, subject]))
    .filter(r => !!r); // filter out nulls
    
  return relevantRelationshipsValues.join("<br>");
}

/**
 * Creates relationship-value tuple, if the relationship is relevant to the given objects
 * @param relationshipName relationship name
 * @param relationship structure (array of RelationshipValue)
 * @param objectNames object names
 */
function createRelationshipValue(relationshipName: string, relationship: RelationshipValue[], objectNames: string[]): string | null {
  const relevantGrounding = relationship.find(relationshipGrounding => relationshipDescribes(relationshipGrounding, objectNames));
  if (relevantGrounding) {
    let cellText = relationshipName;
    let tooltip = `(${relationshipName} ${objectNames.join(' ')})`;
    if (relevantGrounding.value !== undefined) {
      if (typeof (relevantGrounding.value) === 'number') {
        cellText += ":=" + relevantGrounding.value;
        tooltip = toPddlFunctionInit(tooltip, relevantGrounding.value);
      }
      else if (typeof (relevantGrounding.value) === 'boolean' && relevantGrounding.value === false) {
        cellText = `<i>not</i> ${cellText}`;
        tooltip = `(not ${tooltip})`;
      }
    }
    return toSnap(cellText, tooltip);
  }
  else {
    return null;
  }
}

/** 
 * @typedef CustomViewData Custom state visualization data and view logic. 
 * @property {Plan} plan In this case, it is a dummy plan, which serves as a container for the domain and problem objects.
 * @property {VariableValue[]} state
 * @property {string} customVisualizationScript Javascript, which exports the `CustomVisualization` interface.
 * @property {number} displayWidth
 */

/**
 * Renders the custom state view.
 * @param data data
 */
function updateCustomView(data: CustomViewData | undefined): void {
  const customViewDiv = getElementByIdOrThrow("customView");

  if (data && data.customVisualizationScript) {

    try {
      const customVisualization = eval(data.customVisualizationScript);

      const plan = new Plan(data.plan.steps,
        data.plan.domain && DomainInfo.clone(data.plan.domain),
        data.plan.problem && ProblemInfo.clone(data.plan.problem));

      customViewDiv.innerHTML = '';
      
      if (customVisualization.visualizePlanHtml) {
        const vizHtml = customVisualization.visualizePlanHtml(plan, data.displayWidth);
        customViewDiv.innerHTML = vizHtml;
      } else if (customVisualization.visualizePlanInDiv) {
        customVisualization.visualizePlanInDiv(customViewDiv, plan, data.displayWidth);
      } else if (customVisualization.visualizePlanSvg) {
        const vizSvg = customVisualization.visualizePlanSvg(plan, data.displayWidth);
        customViewDiv.appendChild(vizSvg);
      } else if (customVisualization.visualizeStateHtml) {
        const vizHtml = customVisualization.visualizeStateHtml(plan, data.state, data.displayWidth);
        customViewDiv.innerHTML = vizHtml;
      } else if (customVisualization.visualizeStateInDiv) {
        customVisualization.visualizeStateInDiv(customViewDiv, plan, data.state, data.displayWidth);
      } else if (customVisualization.visualizeStateSvg) {
        const vizSvg = customVisualization.visualizeStateSvg(plan, data.state, data.displayWidth);
        customViewDiv.appendChild(vizSvg);
      }
    }
    catch (err) {
      console.error(err);
    }
  }

}

function toPddlFunctionInit(functionName: string, value: number | boolean): string {
  return `(= ${functionName} ${value})`;
}

function toSnap(htmlText: string | Value, tooltip: string): string {
  return `<snap title="${tooltip}">${htmlText}</snap>`;
}

/**
 * True if the relationship describes given objects.
 * @param relationship structure
 * @param objectNames object names
 */
function relationshipDescribes(relationship: RelationshipValue, objectNames: string[]): boolean {
  return Object.values(relationship.parameters).join(',') === objectNames.join(',');
}

/**
 * Wraps table cells to table row
 * @param cells cell(s) html
 */
function tr(cells: string[]): string {
  return "<tr>" + cells.join('') + "</tr>";
}

/**
 * Wraps header cell
 * @param cell cell html
 */
function th(cell: string): string {
  return "<th>" + cell + "</th>";
}

/**
 * Wraps cell
 * @param cell cell html
 */
function td(cell: string): string {
  return "<td>" + cell + "</td>";
}

function fit(): void {
  network?.fit();
}

// subscribe to view events
document.body.onload = initialize;
getElementByIdOrThrow("fit").onclick = fit;
getElementByIdOrThrow("expandInset").onclick = expandInset;
getElementByIdOrThrow("closeInset").onclick = closeInset;

var nodes = new vis.DataSet([]);
var edges = new vis.DataSet([]);
var networkData = {
  nodes: nodes,
  edges: edges
};

var network = null;

function initialize() {
  // create a network
  var container = document.getElementById("network");

  var options = {
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
    // wrapper to prevent unecessary scrolls in chrome.
    // see https://github.com/almende/vis/issues/1568
    var div = container.getElementsByClassName("vis-configuration-wrapper")[0];
    div.style["height"] = div.getBoundingClientRect().height + "px";
  });

  document.body.addEventListener("themeChanged", event => {
    applyThemeToNetwork(network, event.detail.newTheme)
  })

  if (!vscode) { populateWithTestData(); }
  onLoad();
}

function handleMessage(message) {
  switch (message.command) {
    case 'updateContent':
      updateGraph(message.data.symmetricRelationshipGraph);
      updateObjectProperties(message.data.typeProperties);
      // console.log(JSON.stringify(message.data.typeRelationships));
      updateObjectRelationships(message.data.typeRelationships);
      break;
    default:
      console.log("Unexpected message: " + message.command);
  }
}

function populateWithTestData() {
  // for testing only
  updateGraph({
    nodes: [{ id: 1, label: 'City' }, { id: 2, label: 'Town' }, { id: 3, label: 'Village' }],
    relationships: [{ from: 1, to: 2, label: 'connected' }, { from: 2, to: 3, label: 'connected' }]
  });
  updateObjectProperties({
    "truck": {
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
      }
    }
  });
  updateObjectRelationships([
    {
      "types": {
        "driver": ["Peter", "Paul"],
        "truck": ["red", "blue", "green"]
      },
      "relationships": {
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
      }
    },
    {
      "relationships": {
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
      },
      "types": {
          "truck": [
              "red",
              "green",
              "blue"
          ]
      }
    }
  ]);
  setIsInset(true);
}

function clearNetwork() {
  nodes.clear();
  edges.clear();
}

function updateGraph(data) {
  clearNetwork();
  nodes.add(data.nodes);
  edges.add(data.relationships);
  network.fit();

  var container = document.getElementById("networkSection");
  container.style.display = data.nodes.length > 0 ? 'initial' : 'none';
}

/**
 * Renders object properties as HTML tables per type.
 * @param {any} data object properties
 */
function updateObjectProperties(data) {
  var container = document.getElementById("objectProperties");
  container.innerHTML = Object.keys(data).map(type => createTypePropertiesTable(type, data[type])).join('\n');
}

function createTypePropertiesTable(type, objectProperties) {
  let headerCells = [th(type)].concat(objectProperties.propertyNames.map(n => th(n)));
  let objectRows = Object.keys(objectProperties.objects).map(objName => createObjectPropertiesRow(objName, objectProperties.objects[objName], objectProperties.propertyNames));
  return '<table class="objectValues">' +
    tr(headerCells) +
    objectRows.join('\n') +
    "\n</table>";
}

/**
 * Create object property table row
 * @param {string} objectName object name
 * @param {any} objectValues object values
 * @param {string[]} propertyNames property names
 */
function createObjectPropertiesRow(objectName, objectValues, propertyNames) {
  let valueCells = propertyNames.map(p => td(createObjectPropertyValue(objectValues,p, objectName)));
  let cells = [th(objectName)].concat(valueCells)
  return tr(cells);
}

/**
 * Create object property table row
 * @param {any} objectValues object values
 * @param {string} propertyName property name
 * @param {string} objectName name of the object for the tooltip
 */
function createObjectPropertyValue(objectValues, propertyName, objectName) {
  let value = objectValues[propertyName];
  let fullVariableName = `(${propertyName} ${objectName})`;
  return createValueSnap(fullVariableName, value);
}

function createValueSnap(fullVariableName, value) {
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

function updateObjectRelationships(data) {
  var container = document.getElementById("relationships");
  container.innerHTML = data.map(relationship => createTypeRelationshipsTable(relationship)).join('\n');
}

function createTypeRelationshipsTable(relationship) {
  let types = Object.keys(relationship.types);
  if (types.length > 2) return "";
  let objectType = types[0];
  let subjectType = types.length == 2 ? types[1] : types[0]; // if relationship is symmetric

  let headerCells = [th(types.join(' \\ '))].concat(relationship.types[subjectType].map(n => th(n)));

  let objectRows = relationship.types[objectType]
    .map(rowObject => createObjectRelationshipRow(rowObject, relationship, subjectType));

  return '<table class="objectValues">' +
    tr(headerCells) +
    objectRows.join('\n') +
    "\n</table>";
}

/**
 * Create object relationship table row
 * @param {string} rowObject name of the object described by this row
 * @param {string} subjectType name of the type in the columns
 */
function createObjectRelationshipRow(rowObject, relationship, subjectType) {
  let valueCells = relationship.types[subjectType]
    .map(subject => createRelationshipsValue(rowObject, subject, relationship.relationships))
    .map(value => td(value));
  let cells = [th(rowObject)].concat(valueCells)
  return tr(cells);
}

/**
 * Creates relationship table cell
 * @param {string} rowObject object name (row)
 * @param {string} subject subject name (column)
 * @param {any[]} relationships list of relationship values
 */
function createRelationshipsValue(rowObject, subject, relationships) {
  let relevantRelationshipsValues = Object.keys(relationships)
    .map(relationshipName => createRelationshipValue(relationshipName, relationships[relationshipName], [rowObject, subject]))
    .filter(r => !!r); // filter out nulls
    
  return relevantRelationshipsValues.join("<br>");
}

/**
 * Creates relationship-value tuple, if the relationship is relevant to the given objects
 * @param {string} relationshipName relationship name
 * @param {any} relationship structure
 * @param {string[]} objectNames object names
 */
function createRelationshipValue(relationshipName, relationship, objectNames) {
  let relevantGrounding = relationship.find(relationshipGrounding => relationshipDescribes(relationshipGrounding, objectNames));
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

function toPddlFunctionInit(functionNme, value) {
  return `(= ${functionNme} ${value})`;
}

function toSnap(value, tooltip) {
  return `<snap title="${tooltip}">${value}</snap>`;
}

/**
 * True if the relationship describes given objects.
 * @param {any} relationship structure
 * @param {string[]} objectNames object names
 */
function relationshipDescribes(relationship, objectNames) {
  return Object.values(relationship.parameters).join(',') === objectNames.join(',');
}

/**
 * Wraps table cells to table row
 * @param {string[]} cells cell(s) html
 */
function tr(cells) {
  return "<tr>" + cells.join('') + "</tr>";
}

/**
 * Wraps header cell
 * @param {string} cell cell html
 */
function th(cell) {
  return "<th>" + cell + "</th>";
}

/**
 * Wraps cell
 * @param {string} cell cell html
 */
function td(cell) {
  return "<td>" + cell + "</td>";
}

function fit() {
  network.fit();
}
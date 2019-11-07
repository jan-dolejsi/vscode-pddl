
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

  var container = document.getElementById("network");
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
  let objectRows = Object.keys(objectProperties.objects).map(objName => createObjectRow(objName, objectProperties.objects[objName], objectProperties.propertyNames));
  return "<table>" +
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
function createObjectRow(objectName, objectValues, propertyNames) {
  let valueCells = propertyNames.map(p => td(createValue(objectValues,p)));
  let cells = [td(objectName)].concat(valueCells)
  return tr(cells);
}

/**
 * Create object property table row
 * @param {any} objectValues object values
 * @param {string} propertyName property name
 */
function createValue(objectValues, propertyName) {
  let value = objectValues[propertyName];
  return value !== undefined ? value : "&nbsp;"; 
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
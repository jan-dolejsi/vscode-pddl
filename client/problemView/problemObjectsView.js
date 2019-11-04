
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
        levelSeparation: 77,
        nodeSpacing: 17,
        treeSpacing: 17,
        parentCentralization: false
      }
    },
    physics: {
      enabled: true,
      hierarchicalRepulsion: {
        centralGravity: 0
      },
      minVelocity: 0.75,
      solver: "hierarchicalRepulsion"
    },
    configure: false
  };
  network = new vis.Network(container, networkData, options);
  if (!vscode) { populateWithTestData(); }
  onLoad();

  network.on("configChange", function () {
    // this will immediately fix the height of the configuration
    // wrapper to prevent unecessary scrolls in chrome.
    // see https://github.com/almende/vis/issues/1568
    var div = container.getElementsByClassName("vis-configuration-wrapper")[0];
    div.style["height"] = div.getBoundingClientRect().height + "px";
  });

  resize();
}

function handleMessage(message) {
  switch (message.command) {
    case 'updateContent':
      updateGraph(message.data);
      break;
    default:
      console.log("Unexpected message: " + message.command);
  }

}

function populateWithTestData() {
  // for testing only
  updateGraph({
    nodes: [{ id: 1, label: 'City' }, { id: 2, label: 'Town' }, { id: 3, label: 'Village' }],
    relationships: [{ from: 1, to: 2 }, { from: 2, to: 3 }]
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
  network.fit({animation: true});
}

function resize() {
  // todo: network.setSize()
  var container = document.getElementById("network");
  var visNetwork = container.getElementsByClassName("vis-network")[0];
  var canvas = visNetwork.canvas;
  if (canvas) {
    canvas.style["height"] = (window.innerHeight) + "px";
  }
}

function topDown() {
  setLayoutDirection('UD');
}

function leftRight() {
  setLayoutDirection('LR');
}

function setLayoutDirection(direction) {
  network.setOptions({ layout: { hierarchical: { direction: direction } } });
  postMessage({ command: 'layout', direction: direction });
}

function fit() {
  network.fit();
}
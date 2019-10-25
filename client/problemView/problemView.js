
var vscode = null;
try {
    vscode = acquireVsCodeApi();
}catch(error){
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

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
        font: { size: 12 }
    },
    edges: {
        font: { align: 'top', size: 8 },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } }
    },
    physics: {
      stabilization: false
    },
    configure: true
  };
  network = new vis.Network(container, networkData, options);
  populateWithTestData();

//   network.on("configChange", function() {
//     // this will immediately fix the height of the configuration
//     // wrapper to prevent unecessary scrolls in chrome.
//     // see https://github.com/almende/vis/issues/1568
//     var div = container.getElementsByClassName("vis-configuration-wrapper")[0];
//     div.style["height"] = div.getBoundingClientRect().height + "px";
//   });
}

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'updateGraph':
            updateGraph(message.data);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
})

function populateWithTestData() {
    if (!vscode) {
        // for testing only
        updateGraph({
            nodes: [{id: 1, label: 'City'}, {id: 2, label: 'Town'}, {id: 3, label: 'Village'}],
            relationships: [{ from: 1, to: 2}, { from: 2, to: 3}]
        });
    }
}

function clearNetwork() {
    nodes.clear();
    edges.clear();
}

function updateGraph(data) {
    clearNetwork();
    data.nodes.forEach(node => nodes.add(node));
    data.relationships.forEach(relationship => edges.add(relationship));
    network.fit();
}

let vscode = null;
try {
    vscode = acquireVsCodeApi();
} catch (error) {
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'update':
            update(message);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function update(message) {
    // document.getElementById('someElementId').value = message.someValue;
}

/**
 * Opens manifest by its uri
 * @param {string} nodeUri manifest node uri
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function openManifest(nodeUri) {
    postMessage({
        command: 'openManifest',
        value: nodeUri
    });
}


/**
 * Opens manifest by its uri
 * @param {string} nodeUri test node uri
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function openTest(nodeUri) {
    postMessage({
        command: 'openTest',
        value: nodeUri
    });
}

function postMessage(message) {
    if (vscode) { vscode.postMessage(message); }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function populateWithTestData() {
    if (!vscode) {
        // for testing only
        update({
            someValue: "sample data"
        });
    }
}

document.body.onload = populateWithTestData;

var vscode = null;
try {
    vscode = acquireVsCodeApi();
}catch(error){
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

function postMessage(message) {
    if (vscode) vscode.postMessage(message);
}

function closeInset() {
    postMessage({ 'command': 'close' });
}

function expandInset() {
    postMessage({ 'command': 'expand' });
}

window.addEventListener('message', event => {
    const message = event.data;
    console.log("Received message: " + message.command);

    switch (message.command) {
        case 'setIsInset':
            setIsInset(message.value);
            break;
        default:
            handleMessage(message);
    }
})

/**
 * Sets whether this is an inset or a document content
 * @param {boolean} value true if this view is an inset
 */
function setIsInset(value) {
    document.getElementById('menu').style.display = value ? 'inherit' : 'none';
}
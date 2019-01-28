
var vscode = null;
try {
    vscode = acquireVsCodeApi();
}catch(error){
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'updateConfiguration':
            updateConfiguration(message);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
})

function updateConfiguration(message) {
    document.getElementById('planner').value = message.planner;
    document.getElementById('parser').value = message.parser;
    document.getElementById('validator').value = message.validator;
    document.getElementById('autoSaveDiv').style.display =
        message.autoSave == "off" ? "unset" : "none";
    updateShowOverviewChanged(message.shouldShow);
}

function shouldShowOverviewChanged(value) {
    showHowToShowOverview(value);

    postMessage({
        command: 'shouldShowOverview',
        value: value
    })
}

function updateShowOverviewChanged(value) {
    showHowToShowOverview(value);
    document.getElementById('shouldShowOverview').checked = value;
}

function showHowToShowOverview(shouldShow) {
    document.getElementById('howToShowOverviewPage').style.display =
        (shouldShow ? 'none' : 'unset');
}

function clonePddlSamples() {
    postMessage({
        command: 'clonePddlSamples'
    })
}

function tryHelloWorld() {
    postMessage({
        command: 'tryHelloWorld'
    })
}

function postMessage(message) {
    if (vscode) vscode.postMessage(message);
}

function populateWithTestData() {
    if (!vscode) {
        // for testing only
        updateConfiguration({
            planner: "planner.exe",
            parser: "parser.exe",
            validator: "validate.exe",
            autoSave: "off",
            shouldShow: true
        });
    }
}
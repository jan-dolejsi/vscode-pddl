
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
            document.getElementById('planner').value = message.planner;
            document.getElementById('parser').value = message.parser;
            document.getElementById('validator').value = message.validator;
            updateShowOverviewChanged(message.shouldShow);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
})

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
    document.getElementById('howToShowOverviewPage').style.visibility =
        (shouldShow ? 'collapse' : 'inherit');
}

function clonePddlSamples() {
    postMessage({
        command: 'clonePddlSamples'
    })
}

function postMessage(message) {
    if (vscode) vscode.postMessage(message);
}

function populateWithTestData() {
    if (!vscode) {
        // for testing only
        document.getElementById('planner').value = 'planner.exe';
        document.getElementById('parser').value = 'parser.exe';
        document.getElementById('validator').value = 'validate.exe';
        updateShowOverviewChanged(true);
    }
}
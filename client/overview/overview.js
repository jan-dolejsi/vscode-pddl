
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
    setStyleDisplay('installIconsAlert', message.showInstallIconsAlert, "list-item");
    setStyleDisplay('enableIconsAlert', message.showEnableIconsAlert, "list-item");
    setStyleDisplay('enableAutoSaveAlert', message.autoSave == "off", "list-item")
    setStyleDisplay('downloadValAlert', message.downloadValAlert, "list-item")
    setStyleDisplay('alertList', hasAnyChildrenToDisplay('alertList'), "block");
    updatePlannerOutputTarget(message.plannerOutputTarget);
    updateShowOverviewChanged(message.shouldShow);
}

/**
 * Converts a boolean to a display style
 * @param {string} elementId element ID
 * @param {boolean} shouldDisplay true if the element should display
 * @param {string} displayStyle style display value, if the element should be shown
 */
function setStyleDisplay(elementId, shouldDisplay, displayStyle) {
    const element = document.getElementById(elementId);
    const style = shouldDisplay ? displayStyle : "none";
    element.style.display = style;
}

/**
 * Returns true if at least one element has not-"none" display style
 * @param {string} elementId html element ID
 */
function hasAnyChildrenToDisplay(elementId) {
    const parent = document.getElementById(elementId);
    for (let index = 0; index < parent.childElementCount; index++) {
        const child = parent.children.item(index);
        if (child.nodeType != Node.ELEMENT_NODE) continue;

        if (child.style.display != "none") {
            return true;
        }
    }
    return false;
}

/**
 * Reflects the planner output target from configuration to the UI state.
 * @param {string} value target is output/terminal/search-debugger.
 */
function updatePlannerOutputTarget(value) {
    var radioButtons = document.getElementsByName("planner_output_target");
    for(var i = 0; i < radioButtons.length; i++) {
        radioButtons[i].checked = value == radioButtons[i].value;
    }
}

/**
 * Notifies the view-model that the should-show selection has changed.
 * @param {boolean} value true if hte overview page should show next time
 */
function shouldShowOverviewChanged(value) {
    showHowToShowOverview(value);

    postMessage({
        command: 'shouldShowOverview',
        value: value
    })
}

/**
 * Updates the UI according to the configuration.
 * @param {boolean} value true if hte overview page should show next time
 */
function updateShowOverviewChanged(value) {
    showHowToShowOverview(value);
    document.getElementById('shouldShowOverview').checked = value;
}

function showHowToShowOverview(shouldShow) {
    document.getElementById('howToShowOverviewPage').style.display =
        (shouldShow ? 'none' : 'unset');
}

function onPlannerOutputTargetChanged() {

    var selectedValue = undefined;

    var radioButtons = document.getElementsByName("planner_output_target");
    for(var i = 0; i < radioButtons.length; i++) {
        if(radioButtons[i].checked == true) {
            selectedValue = radioButtons[i].value;
            break;
        }
    }

    postMessage({
        command: 'plannerOutputTarget',
        value: selectedValue
    });
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

function installIcons() {
    postMessage({
        command: 'installIcons'
    })
}

function enableIcons() {
    postMessage({
        command: 'enableIcons'
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
            shouldShow: true,
            showInstallIconsAlert: true,
            showEnableIconsAlert: true,
        });
    }
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initialize() {
    if (!vscode) { populateWithTestData(); }

    onLoad();
}

function updateConfiguration(message) {
    document.getElementById('planner').value = message.planner;
    document.getElementById('parser').value = message.parser;
    document.getElementById('validator').value = message.validator;
    setStyleDisplay('installIconsAlert', message.showInstallIconsAlert, "list-item");
    setStyleDisplay('enableIconsAlert', message.showEnableIconsAlert, "list-item");
    setStyleDisplay('enableAutoSaveAlert', message.autoSave == "off", "list-item");
    setStyleDisplay('downloadValAlert', message.downloadValAlert, "list-item");
    setStyleDisplay('updateValAlert', message.updateValAlert, "list-item");
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
    const radioButtons = document.getElementsByName("planner_output_target");
    for(let i = 0; i < radioButtons.length; i++) {
        radioButtons[i].checked = value === radioButtons[i].value;
    }
}

/**
 * Notifies the view-model that the should-show selection has changed.
 * @param {boolean} value true if hte overview page should show next time
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldShowOverviewChanged(value) {
    showHowToShowOverview(value);

    postMessage({
        command: 'shouldShowOverview',
        value: value
    });
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onPlannerOutputTargetChanged() {

    let selectedValue = undefined;

    const radioButtons = document.getElementsByName("planner_output_target");
    for(let i = 0; i < radioButtons.length; i++) {
        if(radioButtons[i].checked === true) {
            selectedValue = radioButtons[i].value;
            break;
        }
    }

    postMessage({
        command: 'plannerOutputTarget',
        value: selectedValue
    });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function clonePddlSamples() {
    postCommand('clonePddlSamples');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function tryHelloWorld() {
    postCommand('tryHelloWorld');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function openNunjucksSample() {
    postCommand('openNunjucksSample');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function installIcons() {
    postCommand('installIcons');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function enableIcons() {
    postCommand('enableIcons');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function downloadValInformed() {
    postMessage({
        command: 'downloadVal',
        informedDecision: true
    });
}

function populateWithTestData() {
    // for testing only
    updateConfiguration({
        planner: "planner.exe",
        parser: "parser.exe",
        validator: "validate.exe",
        autoSave: "off",
        shouldShow: true,
        showInstallIconsAlert: true,
        showEnableIconsAlert: true,
        downloadValAlert: true,
        updateValAlert: true
    });
}
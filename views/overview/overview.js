
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'updateConfiguration':
            updateConfiguration(message);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initialize() {
    if (!vscode) { populateWithTestData(); }

    onLoad();
}

/**
 * @typedef OverviewConfiguration Overview page configuration
 * @property {string} command
 * @property {PlannerConfig[]} planners
 * @property {string} plannerOutputTarget
 * @property {string?} parser
 * @property {string?} validator
 * @property {string} imagesPath path to images
 * @property {boolean} shouldShow
 * @property {string} autoSave
 * @property {boolean} showInstallIconsAlert
 * @property {boolean} showEnableIconsAlert
 * @property {boolean} downloadValAlert
 * @property {boolean} updateValAlert
 */

/**
 * Update the page with configuration info
 * @param {OverviewConfiguration} message configuration
 */
function updateConfiguration(message) {
    updatePlanners(message.planners, message.imagesPath);
    document.getElementById('parser').value = message.parser;
    document.getElementById('validator').value = message.validator;
    setStyleDisplay('installIconsAlert', message.showInstallIconsAlert, "list-item");
    setStyleDisplay('enableIconsAlert', message.showEnableIconsAlert, "list-item");
    setStyleDisplay('enableAutoSaveAlert', message.autoSave === "off", "list-item");
    setStyleDisplay('downloadValAlert', message.downloadValAlert, "list-item");
    setStyleDisplay('updateValAlert', message.updateValAlert, "list-item");
    setStyleDisplay('alertList', hasAnyChildrenToDisplay('alertList'), "block");
    updatePlannerOutputTarget(message.plannerOutputTarget);
    updateShowOverviewChanged(message.shouldShow);
}

/**
 * @typedef PlannerConfig Planner configuration
 * @property {string} kind planner kind 
 * @property {string} title label 
 * @property {string?} path executable path 
 * @property {string?} url service url 
 * @property {boolean} isSelected true if this planner is currently selected
 * @property {string} scope machine | workspaceFolder | workspace | extension
 * @property {boolean} canConfigure user can configure this planner
 */

/**
 * Replaces table of planner configurations
 * @param {PlannerConfig[]} planners planner configurations
 * @param {string} imagesPath path to images
 * @returns {void}
 */
function updatePlanners(planners, imagesPath) {
    const plannersTable = document.getElementById('planners');

    while (plannersTable.hasChildNodes()) {
        plannersTable.childNodes.forEach(child => child.remove());
    }

    const currentTheme = getThemeName(document.body.className);

    planners.forEach((config, index) => {
        const tr = plannersTable.appendChild(document.createElement("tr"));
        const td0 = tr.appendChild(document.createElement("td"));
        td0.className = "plannerLabel";
        const radio = td0.appendChild(document.createElement("input"));
        radio.type = "radio";
        radio.checked = config.isSelected;
        radio.id = `planner_${config.scope}_${index}`;
        radio.name = "planner";
        radio.onchange = () => selectPlanner(config);
        const label = td0.appendChild(document.createElement("label"));
        label.setAttribute("for", radio.id);
        label.innerText = config.title;

        tr.appendChild(document.createElement("td"));

        const td2 = tr.appendChild(document.createElement("td"));
        td2.className = "plannerConfig";
        if (config.canConfigure) {
            addThemedImageButton(td2, imagesPath, "gear.svg", currentTheme, () => configurePlanner(config, index));
        }
        addThemedImageButton(td2, imagesPath, "trash.svg", currentTheme, () => deletePlanner(config, index));
    });
}

/**
 * Add themed image button to a cell.
 * @param {HTMLTableDataCellElement} td cell
 * @param {string} imagesPath path to images
 * @param {string} imageName image file name
 * @param {string} currentTheme current theme
 * @param {(this: GlobalEventHandlers, ev: MouseEvent) => any} onclick onclick callback
 */
function addThemedImageButton(td, imagesPath, imageName, currentTheme, onclick) {
    ['light', 'dark'].forEach(theme => {
        addImageButton(td, theme, imagesPath, imageName, currentTheme, onclick);
    });
}

/**
 * Add image button to a cell.
 * @param {HTMLTableDataCellElement} td cell
 * @param {string} theme image theme
 * @param {string} imagesPath path to images
 * @param {string} imageName image file name
 * @param {string} currentTheme current theme
 * @param {(this: GlobalEventHandlers, ev: MouseEvent) => any} onclick onclick callback
 */
function addImageButton(td, theme, imagesPath, imageName, currentTheme, onclick) {
    const img = td.appendChild(document.createElement("img"));
    img.src = `${imagesPath}/${theme}/${imageName}`;
    img.onclick = onclick;
    img.setAttribute("theme", theme);
    img.className = "menuButton";

    // apply the visual theme to the buttons just created
    applyThemeToElement(img, currentTheme);
}

/**
 * Launches configuration of the
 * @param {PlannerConfig} selectedPlanner planner
 * @param {number} index selected index
 */
function configurePlanner(selectedPlanner, index) {
    postMessage({
        command: 'configurePlanner',
        value: selectedPlanner,
        index: index
    });
}

/**
 * Deletes planner configuration
 * @param {PlannerConfig} selectedPlanner planner
 * @param {number} index selected index
 */
function deletePlanner(selectedPlanner, index) {
    postMessage({
        command: 'deletePlanner',
        value: selectedPlanner,
        index: index
    });
}

/**
 * Selected planner.
 * @param {PlannerConfig} selectedPlanner planner
 */
function selectPlanner(selectedPlanner) {
    postMessage({
        command: 'selectPlanner',
        value: selectedPlanner
    });
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
        if (child.nodeType !== Node.ELEMENT_NODE) { continue; }

        if (child.style.display !== "none") {
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
    for (let i = 0; i < radioButtons.length; i++) {
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
    for (let i = 0; i < radioButtons.length; i++) {
        if (radioButtons[i].checked === true) {
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
        planners: [
            {
                "kind": "executable",
                "title": "Planner1",
                "path": "c:\\folder\\executable.exe",
                "isSelected": false,
                "scope": "machine",
                "canConfigure": true
            },
            {
                "kind": "service",
                "title": "Planning Domains solver",
                "url": "http://solver.planning.domains/solve",
                "isSelected": true,
                "scope": "extension",
                "canConfigure": false,
                "documentation": "http://solver.planning.domains"
            },
            {
                "kind": "executable",
                "title": "Very long title Very long title Very long title Very long title Very long title ",
                "path": "c:\\folder\\executable.exe",
                "isSelected": false,
                "scope": "machine",
                "canConfigure": true
            },
        ],
        parser: "parser.exe",
        validator: "validate.exe",
        autoSave: "off",
        imagesPath: "../../images",
        shouldShow: true,
        showInstallIconsAlert: true,
        showEnableIconsAlert: true,
        downloadValAlert: true,
        updateValAlert: true
    });
}

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
    if (!vscode) {
        populateWithTestData();
    }
    else {
        clearData();
    }

    onLoad();
}

/**
 * @typedef OverviewConfiguration Overview page configuration
 * @property {string} command
 * @property {ScopedPlannerConfig[]} planners
 * @property {string} selectedPlanner selected planner title
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
    updatePlanners(message.planners, message.selectedPlanner, message.imagesPath);
    updatePlannersError(message.plannersConfigError);
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
 * @typedef ScopedPlannerConfig Planner configuration and the scope it belongs to
 * @property {PlannerConfig} configuration 
 * @property {number} scope
 */

/**
 * @typedef PlannerConfig Planner configuration
 * @property {string} kind planner kind 
 * @property {string} title label 
 * @property {string?} path executable path 
 * @property {string?} url service url 
 * @property {boolean} canConfigure user can configure this planner
 */

/**
 * Replaces table of planner configurations
 * @param {ScopedPlannerConfig[]} planners planner configurations
 * @param {string} selectedPlanner title of the selected planner
 * @param {string} imagesPath path to images
 * @returns {void}
 */
function updatePlanners(planners, selectedPlanner, imagesPath) {
    if (!planners) { return; }
    const plannersTable = document.getElementById('planners');

    while (plannersTable.hasChildNodes()) {
        plannersTable.childNodes.forEach(child => child.remove());
    }

    const currentTheme = getThemeName(document.body.className);

    planners.forEach((scopedConfig, index) => {
        const config = scopedConfig.configuration;
        const tr = plannersTable.appendChild(document.createElement("tr"));
        const td0 = tr.appendChild(document.createElement("td"));
        td0.className = "plannerLabel";
        const radio = td0.appendChild(document.createElement("input"));
        radio.type = "radio";
        radio.checked = config.title === selectedPlanner;
        radio.id = `planner_${config.scope}_${index}`;
        radio.name = "planner";
        radio.onchange = () => selectPlanner(scopedConfig);
        const label = td0.appendChild(document.createElement("label"));
        label.setAttribute("for", radio.id);
        label.innerText = config.title;

        const td1 = tr.appendChild(document.createElement("td"));
        addScopeIcon(td1, scopedConfig.scope, imagesPath, currentTheme);

        const td2 = tr.appendChild(document.createElement("td"));
        td2.className = "plannerConfig";
        if (scopedConfig.scope !== SCOPE_DEFAULT && config.canConfigure) {
            addThemedImageButton(td2, imagesPath, "gear.svg", currentTheme, "Configure planner...", () => configurePlanner(scopedConfig, index));
        }
        if (scopedConfig.scope !== SCOPE_DEFAULT) {
            addThemedImageButton(td2, imagesPath, "trash.svg", currentTheme, "Remove this planner configuration...", () => deletePlanner(scopedConfig, index));
        }
    });
}

/**
 * Creates a themed icon for the config scope
 * @param {HTMLTableDataCellElement} td cell
 * @param {number} scope configuration scope/level
 * @param {string} imagesPath path to images
 * @param {string} currentTheme current theme
 * @param {ScopedPlannerConfig} scopedConfig planner configuration incl. scope
 * @param {number} index order within the same scope
 */
function addScopeIcon(td, scope, imagesPath, currentTheme, scopedConfig, index) {
    const imageName = toScopeIconName(scope);
    const tooltip = toScopeTooltip(scope);
    const onClick = scope > SCOPE_EXTENSION ? () => showConfiguration(scopedConfig, index) : undefined;
    addThemedImageButton(td, imagesPath, imageName, currentTheme, tooltip, onClick);
}

const SCOPE_DEFAULT = 0;
const SCOPE_EXTENSION = 1;
const SCOPE_USER = 2;
const SCOPE_WORKSPACE = 3;
const SCOPE_WORKSPACE_FOLDER = 4;

function toScopeIconName(scope) {
    switch (scope) {
        case SCOPE_DEFAULT: return "plug.svg";
        case SCOPE_EXTENSION: return "plug.svg";
        case SCOPE_USER: return "vm.svg";
        case SCOPE_WORKSPACE: return "root-folder.svg";
        case SCOPE_WORKSPACE_FOLDER: return "folder-opened.svg";
    }
}

function toScopeTooltip(scope) {
    switch (scope) {
        case SCOPE_DEFAULT: return "Default planner installed with the PDDL extension.";
        case SCOPE_EXTENSION: return "Planner installed by a VS Code extension";
        case SCOPE_USER: return "Planner from user/global configuration settings";
        case SCOPE_WORKSPACE: return "Planner from workspace file";
        case SCOPE_WORKSPACE_FOLDER: return "Planner from workspace folder";
    }
}

/**
 * Show planner configuration error
 * @param {string | undefined} error reported error message
 */
function updatePlannersError(error) {
    document.getElementById('plannerConfigurationError').style.display = error ? 'inherit' : 'none';
    document.getElementById('plannerConfigurationErrorMessage').innerText = error;
}

/**
 * Add themed image button to a cell.
 * @param {HTMLTableDataCellElement} td cell
 * @param {string} imagesPath path to images
 * @param {string} imageName image file name
 * @param {string} currentTheme current theme
 * @param {string} tooltip tooltip
 * @param {(this: GlobalEventHandlers, ev: MouseEvent) => any} onclick onclick callback
 */
function addThemedImageButton(td, imagesPath, imageName, currentTheme, tooltip, onclick) {
    ['light', 'dark'].forEach(theme => {
        addImageButton(td, theme, imagesPath, imageName, currentTheme, tooltip, onclick);
    });
}

/**
 * Add image button to a cell.
 * @param {HTMLTableDataCellElement} td cell
 * @param {string} theme image theme
 * @param {string} imagesPath path to images
 * @param {string} imageName image file name
 * @param {string} currentTheme current theme
 * @param {string} tooltip tooltip
 * @param {(this: GlobalEventHandlers, ev: MouseEvent) => any} onclick onclick callback
 */
function addImageButton(td, theme, imagesPath, imageName, currentTheme, tooltip, onclick) {
    const img = td.appendChild(document.createElement("img"));
    img.src = `${imagesPath}/${theme}/${imageName}`;
    img.onclick = onclick;
    img.title = tooltip;
    img.setAttribute("theme", theme);
    img.className = "menuButton";

    // apply the visual theme to the buttons just created
    applyThemeToElement(img, currentTheme);
}

/**
 * Launches configuration of the
 * @param {ScopedPlannerConfig} selectedPlanner planner
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
 * Launches configuration of the
 * @param {ScopedPlannerConfig} scopedConfig planner
 * @param {number} index selected index
 */
function showConfiguration(scopedConfig, index) {
    postMessage({
        command: 'showConfiguration',
        value: scopedConfig,
        index: index
    });
}

/**
 * Deletes planner configuration
 * @param {ScopedPlannerConfig} selectedPlanner planner
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
 * @param {ScopedPlannerConfig} selectedPlanner planner
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
                scope: 4,
                configuration: {
                    "kind": "executable",
                    "title": "Planner1",
                    "path": "c:\\folder\\executable.exe",
                    "canConfigure": true
                }
            },
            {
                scope: 2,
                configuration: {
                    "kind": "executable",
                    "title": "Very long title Very long title Very long title Very long title Very long title ",
                    "path": "c:\\folder\\executable.exe",
                    "canConfigure": true
                }
            },
            {
                scope: 0,
                configuration: {
                    "kind": "service",
                    "title": "http://solver.planning.domains/solve",
                    "url": "http://solver.planning.domains/solve",
                    "canConfigure": false,
                    "documentation": "http://solver.planning.domains"
                }
            }
        ],
        plannersConfigError: "Error in planner configuration xyz",
        selectedPlanner: "http://solver.planning.domains/solve",
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

function clearData() {
    updateConfiguration({
        imagesPath: "../../images",
        planners: [],
        plannersConfigError: undefined,
        autoSave: "on",
        showInstallIconsAlert: false,
        showEnableIconsAlert: false,
        downloadValAlert: false,
        updateValAlert: false
    });
}
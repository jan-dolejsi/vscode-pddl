
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'updateConfiguration':
            updateConfiguration(message);
            break;
        case 'showHint':
            showHint(message.hint);
            break;
        case 'showFeedbackRequest':
            showFeedbackRequest(message.visible);
            break;
        default:
            console.log("Unexpected message: " + message.command);
    }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initialize() {
    if (!vscode) {
        setTimeout(()=> populateWithTestData(), 2000);
    }
    else {
        clearData();
    }
    
    document.getElementById('workspaceFolders').onchange = function (ev) {
        postMessageToVsCode({
            command: 'workspaceFolderSelected',
            workspaceFolderUri: ev.target.options[ev.target.selectedIndex].value
        });
    };

    document.getElementById('settings').onclick = () => postCommand('command:pddl.settings');
    document.getElementById('plannersJsonSettings').onclick = () => postCommand('command:pddl.plannersJsonSettings');
    document.getElementById('addPlanner').onclick = () => postCommand('command:pddl.addPlanner');
    document.getElementById('configureParser').onclick = () => postCommand('command:pddl.configureParser');
    document.getElementById('configureValidate').onclick = () => postCommand('command:pddl.configureValidate');
    
    document.getElementById('hintOk').onclick = () => postCommand('hintOk');
    document.getElementById('hintLater').onclick = () => postCommand('hintLater');
    document.getElementById('hintNext').onclick = () => postCommand('hintNext');

    document.getElementById('feedbackAccepted').onclick = () => postCommand('feedbackAccepted');
    document.getElementById('feedbackLater').onclick = () => postCommand('feedbackLater');
    document.getElementById('feedbackNever').onclick = () => postCommand('feedbackNever');
    
    onLoad();
}

/**
 * @typedef OverviewConfiguration Overview page configuration
 * @property {string} command
 * @property {ScopedPlannerConfig[]} planners
 * @property {string} selectedPlanner selected planner title
 * @property {WireWorkspaceFolder[]} workspaceFolders
 * @property {WireWorkspaceFolder | undefined} selectedWorkspaceFolder
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
 * @property {boolean} showEnableFormatterAlert
 * @property {boolean} showBracketColorizationAlert
 * @property {boolean} showBracketPairGuidesAlert
 */

/**
 * @typedef WireWorkspaceFolder Workspace folder
 * @property {string} name
 * @property {string} uri
 */

/**
 * Update the page with configuration info
 * @param {OverviewConfiguration} message configuration
 */
function updateConfiguration(message) {
    try {
        updatePlanners(message.planners, message.selectedPlanner, message.imagesPath);
        updatePlannersError(message.plannersConfigError);
        updateWorkspaceFolders(message.workspaceFolders, message.selectedWorkspaceFolder);
        document.getElementById('parser').value = message.parser;
        document.getElementById('validator').value = message.validator;
        setStyleDisplay('installIconsAlert', message.showInstallIconsAlert, "table-row");
        setStyleDisplay('enableIconsAlert', message.showEnableIconsAlert, "table-row");
        setStyleDisplay('enableAutoSaveAlert', message.autoSave === "off", "table-row");
        if (message.downloadValAlert) {
            const button = document.getElementById('downloadValAlertButton');
            if (button) {
                button.disabled = false;
                button.textContent = 'Download';
            }
        }
        setStyleDisplay('downloadValAlert', message.downloadValAlert, "table-row");
        if (message.updateValAlert) {
            const button = document.getElementById('updateValAlertButton');
            if (button) {
                button.disabled = false;
                button.textContent = 'Update VAL';
            }
        }
        setStyleDisplay('updateValAlert', message.updateValAlert, "table-row");
        setStyleDisplay('enableFormatterAlert', message.showEnableFormatterAlert, "table-row");
        setStyleDisplay('enableBracketColorizationAlert', message.showBracketColorizationAlert, "table-row");
        setStyleDisplay('enableBracketPairGuidesAlert', message.showBracketPairGuidesAlert, "table-row");
        setStyleDisplay('alertList', hasAnyChildrenToDisplay('table.alertList > tbody > tr.alert'), "block");
        updatePlannerOutputTarget(message.plannerOutputTarget);
        updateShowOverviewChanged(message.shouldShow);
    } finally {
        const settingsProgress = document.getElementById('settingsProgress');
        if (settingsProgress) {
            settingsProgress.classList.remove('codicon-animation-spin');        
            settingsProgress.style.visibility = "hidden";        
        }
    }
}

/**
 * @typedef ScopedPlannerConfig Planner configuration and the scope it belongs to
 * @property {PlannerConfig} configuration Planner configuration
 * @property {number} scope configuration scope level
 * @property {number} index order within the scope
 * @property {string | undefined} workspaceFolder workspace folder Uri as string, of `scope` === `SCOPE_WORKSPACE_FOLDER`
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
 * Shows/hides and populates the workspace folder drop-down
 * @param {WireWorkspaceFolder[]} workspaceFolders
 * @param {WireWorkspaceFolder | undefined} selectedWorkspaceFolder
 */
function updateWorkspaceFolders(workspaceFolders, selectedWorkspaceFolder) {
    {
        const divEl = document.getElementById('workspaceFoldersDiv');
        divEl.style.display = workspaceFolders && workspaceFolders.length > 1 ? 'inline' : 'none';
    }
    {
        const selectEl = document.getElementById('workspaceFolders');

        // clear
        while (selectEl.hasChildNodes()) {
            selectEl.childNodes.forEach(child => child.remove());
        }

        // populate
        workspaceFolders.forEach(wf => {
            const optionEl = document.createElement("option");
            // <option label="wf1" selected value="file:///asdf/folders/wf1"/>
            optionEl.label = wf.name;
            optionEl.value = wf.uri;
            optionEl.selected = selectedWorkspaceFolder && selectedWorkspaceFolder.uri === wf.uri;
            selectEl.appendChild(optionEl);
        });
    }
}

/**
 * Replaces table of planner configurations
 * @param {ScopedPlannerConfig[]} planners planner configurations
 * @param {string} selectedPlanner title of the selected planner
 * @returns {void}
 */
function updatePlanners(planners, selectedPlanner) {
    if (!planners) { return; }
    const plannersTable = document.getElementById('planners');

    while (plannersTable.hasChildNodes()) {
        plannersTable.childNodes.forEach(child => child.remove());
    }

    planners.forEach(scopedConfig => {
        const config = scopedConfig.configuration;
        const index = scopedConfig.index;
        const tr = plannersTable.appendChild(document.createElement("tr"));
        const td0 = tr.appendChild(document.createElement("td"));
        td0.className = "plannerLabel";
        const radio = td0.appendChild(document.createElement("input"));
        radio.type = "radio";
        radio.checked = config.title === selectedPlanner;
        radio.id = `planner_${scopedConfig.scope}_${index}`;
        radio.name = "planner";
        radio.onchange = () => selectPlanner(scopedConfig);
        const label = td0.appendChild(document.createElement("label"));
        label.setAttribute("for", radio.id);
        label.innerText = config.title;

        const td1 = tr.appendChild(document.createElement("td"));
        addScopeIcon(td1, scopedConfig.scope, scopedConfig);

        const td2 = tr.appendChild(document.createElement("td"));
        td2.className = "plannerConfig";
        if (scopedConfig.scope !== SCOPE_DEFAULT && config.canConfigure) {
            addCodiconButton(td2, "gear", "Configure planner...", () => configurePlanner(scopedConfig));
        }
        if (scopedConfig.scope !== SCOPE_DEFAULT) {
            addCodiconButton(td2, "trash", "Remove this planner configuration...", () => deletePlanner(scopedConfig));
        }
    });
}

/**
 * Creates a themed icon for the config scope
 * @param {HTMLTableCellElement} td cell
 * @param {number} scope configuration scope/level
 * @param {ScopedPlannerConfig} scopedConfig planner configuration incl. scope
 */
function addScopeIcon(td, scope, scopedConfig) {
    const imageName = toScopeIconName(scope);
    const tooltip = toScopeTooltip(scope);
    const onClick = scope > SCOPE_EXTENSION ? () => showConfiguration(scopedConfig) : undefined;
    addCodiconButton(td, imageName, tooltip, onClick);
}

const SCOPE_DEFAULT = 0;
const SCOPE_EXTENSION = 1;
const SCOPE_USER = 2;
const SCOPE_WORKSPACE = 3;
const SCOPE_WORKSPACE_FOLDER = 4;

function toScopeIconName(scope) {
    switch (scope) {
        case SCOPE_DEFAULT: return "plug";
        case SCOPE_EXTENSION: return "plug";
        case SCOPE_USER: return "vm";
        case SCOPE_WORKSPACE: return "root-folder";
        case SCOPE_WORKSPACE_FOLDER: return "folder-opened";
    }
}

function toScopeTooltip(scope) {
    switch (scope) {
        case SCOPE_DEFAULT: return "Default planner installed with the PDDL extension.";
        case SCOPE_EXTENSION: return "Planner installed by a VS Code extension";
        case SCOPE_USER: return "Planner from user/machine global configuration settings. Click to show...";
        case SCOPE_WORKSPACE: return "Planner from workspace file. Click to show...";
        case SCOPE_WORKSPACE_FOLDER: return "Planner from workspace folder. Click to show...";
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
 * Add codicon based button to a cell.
 * @param {HTMLTableCellElement} td cell
 * @param {string} imageName codicon image name
 * @param {string} tooltip tooltip
 * @param {(this: GlobalEventHandlers, ev: MouseEvent) => any} onclick onclick callback
 */
function addCodiconButton(td, imageName, tooltip, onclick) {
    // <i class="clickable codicon codicon-gear" onclick="callback(argument)" title="Tooltip..."></i>
    const img = td.appendChild(document.createElement("i"));
    img.classList.add("clickable", "codicon", "codicon-" + imageName);
    img.onclick = onclick;
    img.title = tooltip;
}

/**
 * Launches configuration of the
 * @param {ScopedPlannerConfig} selectedPlanner planner
 */
function configurePlanner(selectedPlanner) {
    postMessageToVsCode({
        command: 'configurePlanner',
        value: selectedPlanner
    });
}

/**
 * Launches configuration of the
 * @param {ScopedPlannerConfig} scopedConfig planner
 */
function showConfiguration(scopedConfig) {
    postMessageToVsCode({
        command: 'showConfiguration',
        value: scopedConfig
    });
}

/**
 * Deletes planner configuration
 * @param {ScopedPlannerConfig} selectedPlanner planner
 */
function deletePlanner(selectedPlanner) {
    postMessageToVsCode({
        command: 'deletePlanner',
        value: selectedPlanner
    });
}

/**
 * Selected planner.
 * @param {ScopedPlannerConfig} selectedPlanner planner
 */
function selectPlanner(selectedPlanner) {
    postMessageToVsCode({
        command: 'selectPlanner',
        value: selectedPlanner
    });
}

function enableFormatOnTypeForPddlOnly() {
    enableFormatOnType(true);
}

function enableFormatOnType(forPddlOnly=false) {
    postMessageToVsCode({
        command: 'enableFormatOnType',
        forPddlOnly: forPddlOnly
    });
}

function enableBracketColorizationForPddlOnly() {
    enableBracketColorization(true);
}

function enableBracketColorization(forPddlOnly=false) {
    postMessageToVsCode({
        command: 'enableBracketColorization',
        forPddlOnly: forPddlOnly
    });    
}

function enableBracketPairGuidesForPddlOnly() {
    enableBracketPairGuides(true);
}

function enableBracketPairGuides(forPddlOnly=false) {
    postMessageToVsCode({
        command: 'enableBracketPairGuides',
        forPddlOnly: forPddlOnly
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
 */
function hasAnyChildrenToDisplay(filter) {
    const alerts = document.querySelectorAll(filter);
    for (const tr of alerts) {
        if (tr.style.display !== "none" || tr.style.visibility === "visible"){
            return true;
        }
    }
    return false;
}

function showFeedbackRequest(shouldShow) {
    setStyleDisplay('feedback', shouldShow, "table-row");
    setStyleDisplay('hintList', hasAnyChildrenToDisplay('table.hintList > tbody > tr.hint'), "block");
}

function showHint(hintText) {
    document.getElementById('hintText').innerHTML = hintText;
    setStyleDisplay('hint', hintText !== undefined, "table-row");

    setStyleDisplay('hintList', hasAnyChildrenToDisplay('table.hintList > tbody > tr.hint'), "block");
}

/**
 * Reflects the planner output target from configuration to the UI state.
 * @param {string} value target is output/terminal/search-debugger.
 */
function updatePlannerOutputTarget(value) {
    const radioButtons = document.getElementsByName("planner_output_target");
    for (const element of radioButtons) {
        element.checked = value === element.value;
    }
}

/**
 * Notifies the view-model that the should-show selection has changed.
 * @param {boolean} value true if hte overview page should show next time
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldShowOverviewChanged(value) {
    showHowToShowOverview(value);

    postMessageToVsCode({
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
    for (const element of radioButtons) {
        if (element.checked === true) {
            selectedValue = element.value;
            break;
        }
    }

    postMessageToVsCode({
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

/**
 * Initializes the VAL download without requesting a second approval.
 * @param {HTMLButtonElement} originButton 
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function downloadValInformed(originButton) {
    originButton.disabled = true;
    originButton.textContent = 'Downloading...'
    postMessageToVsCode({
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
        workspaceFolders: [
            { name: 'wf1', uri: 'file://asdf/folder1'},
            { name: 'wf2', uri: 'file://asdf/folder2'},
        ],
        selectedWorkspaceFolder: { name: 'wf2', uri: 'file://asdf/folder2'},
        parser: "parser.exe",
        validator: "validate.exe",
        autoSave: "off",
        imagesPath: "../../images",
        shouldShow: true,
        showInstallIconsAlert: true,
        showEnableIconsAlert: true,
        downloadValAlert: true,
        updateValAlert: true,
        showEnableFormatterAlert: true,
        showBracketColorizationAlert: true,
        showBracketPairGuidesAlert: true,
    });
    showHint('Did you know that <span class="keyboard">Ctrl</span> + <span class="keyboard">/</span> comments out the current line? Press it again to un-comment it.');
    showFeedbackRequest(true);
}

function clearData() {
    updateConfiguration({
        imagesPath: "../../images",
        planners: [],
        workspaceFolders: [],
        plannersConfigError: undefined,
        autoSave: "on",
        showInstallIconsAlert: false,
        showEnableIconsAlert: false,
        downloadValAlert: false,
        updateValAlert: false,
        enableFormatterAlert: false
    });
    showHint(undefined);
    showFeedbackRequest(false);
}
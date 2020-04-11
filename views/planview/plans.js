var selectedPlan = 0;

var vscode = null;
try {
    vscode = acquireVsCodeApi();
} catch (error) {
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

function postMessage(message) {
    if (vscode) vscode.postMessage(message);
}

function postCommand(command) {
    postMessage({ command: command });
}

function showPlan(planIndex) {
    // remember the index of the plan that is being shown for later manipulation
    selectedPlan = planIndex;
    postMessage({ "command": "selectPlan", "planIndex": planIndex});
    document.querySelectorAll("div.stateView").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.gantt").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.resourceUtilization").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.lineChart").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.planSelector").forEach(div => {
        let newClass = "planSelector";
        let planId = parseInt(div.getAttribute("plan"));
        if (planIndex == planId) newClass += " planSelector-selected";
        div.setAttribute("class", newClass);
    });
    eval("drawPlan" + planIndex + "Charts();");
}
function showPlanDiv(planIndex, div) {
    let planId = parseInt(div.getAttribute("plan"));
    let newDisplayStyle = planId == planIndex ? "block" : "none";
    let style = div.getAttribute("style");
    style = style.replace(/display: (none|block);/i, "display: " + newDisplayStyle + ';');
    div.setAttribute("style", style);
}
function scrollPlanSelectorIntoView(planIndex) {
    document.querySelectorAll('div.planSelector').forEach(div => {
        if (parseInt(div.getAttribute('plan')) == planIndex) div.scrollIntoViewIfNeeded();
    });
}

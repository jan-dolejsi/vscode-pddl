function showPlan(planIndex) {
    document.querySelectorAll("div.gantt").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.resourceUtilization").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.lineChart").forEach(div => showPlanDiv(planIndex, div));
    document.querySelectorAll("div.planSelector").forEach(div => {
        let newClass = "planSelector";
        let planId = parseInt(div.getAttribute("plan"));
        if (planIndex == planId) newClass += " planSelector-selected";
        div.setAttribute("class", newClass);
    });
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

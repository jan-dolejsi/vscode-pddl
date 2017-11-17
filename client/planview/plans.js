function showPlan(planIndex) {
    document.querySelectorAll("div.planstep").forEach(div => {
        let planId = parseInt(div.getAttribute("plan"));
        let newDisplayStyle = planId == planIndex ? "inline-flex" : "none";
        let style = div.getAttribute("style");
        style = style.replace(/display: (none|inline-flex);/i, "display: " + newDisplayStyle + ';');
        div.setAttribute("style", style);
    });
    document.querySelectorAll("div.planSelector").forEach(div => {
        let newClass = "planSelector";
        let planId = parseInt(div.getAttribute("plan"));
        if (planIndex == planId) newClass += " planSelector-selected";
        div.setAttribute("class", newClass);
    });
}
function scrollPlanSelectorIntoView(planIndex) {
    document.querySelectorAll('div.planSelector').forEach(div => {
        if (parseInt(div.getAttribute('plan')) == planIndex) div.scrollIntoViewIfNeeded();
    });
}

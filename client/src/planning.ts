/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, OutputChannel, Uri, Disposable, TextDocumentContentProvider,
    Event, EventEmitter, CancellationToken, ViewColumn, MessageItem, ExtensionContext, StatusBarItem
} from 'vscode';

const path = require('path');

import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, ProblemInfo } from '../../common/src/parser';
import { PddlConfiguration } from './configuration';
import { Plan, PlanStep, PlanningHandler } from './plan';
import { PlannerExecutable } from './PlannerExecutable';
import { PlannerService } from './PlannerService';
import { Planner } from './planner';
import { PddlPlanParser } from './PddlPlanParser';

export class Planning implements PlanningHandler {
    output: OutputChannel;
    epsilon = 1e-3;

    previewUri: Uri;
    provider: PlanDocumentContentProvider;
    planDocumentProviderRegistration: Disposable;

    planner: Planner;
    planningProcessKilled: boolean;

    constructor(public pddlWorkspace: PddlWorkspace, public plannerConfiguration: PddlConfiguration, context: ExtensionContext, public status: StatusBarItem) {
        this.output = window.createOutputChannel("Planner output");

        this.previewUri = Uri.parse('pddl-plan://authority/plan');
        this.provider = new PlanDocumentContentProvider();
        context.subscriptions.push(this.planDocumentProviderRegistration = workspace.registerTextDocumentContentProvider('pddl-plan', this.provider));
    }

    async plan(): Promise<boolean> {

        if (this.planner) {
            window.showErrorMessage("Planner is already running. Stop it using button in the status bar or wait for it to finish.");
            return false;
        }

        this.output.clear();

        const activeDocument = window.activeTextEditor.document;
        const activeFilePath = activeDocument.fileName;

        const activeFileInfo = this.pddlWorkspace.upsertFile(activeDocument.uri.toString(), activeDocument.version, activeDocument.getText());

        let problemFileInfo: ProblemInfo;
        let domainFileInfo: DomainInfo;

        if (activeFileInfo.isProblem()) {
            problemFileInfo = <ProblemInfo>activeFileInfo;

            let folder = this.pddlWorkspace.getFolderOf(problemFileInfo);

            // find domain files in the same folder that match the problem's domain name
            let domainFiles = folder.getDomainFilesFor(problemFileInfo);

            if (domainFiles.length == 1) {
                domainFileInfo = domainFiles[0];
            } else if (domainFiles.length > 1) {
                const domainFileCandidates = domainFiles
                    .map(doc => Planning.getFileName(doc.fileUri.toString()));

                const domainFileName = await window.showQuickPick(domainFileCandidates, { placeHolder: "Select domain file:" });

                if (!domainFileName) return false; // was canceled

                const domainFilePath = path.join(Planning.getFolderPath(activeFilePath), domainFileName);
                let domainFileUri = Uri.file(domainFilePath);

                domainFileInfo = domainFiles.find(doc => doc.fileUri == domainFileUri.toString());
            } else {
                window.showInformationMessage("Ensure a corresponding domain file is open in the editor.");
                return false;
            }
        }
        else if (activeFileInfo.isDomain()) {
            domainFileInfo = <DomainInfo>activeFileInfo;

            let problemFiles = this.pddlWorkspace.getProblemFiles(domainFileInfo);

            if (problemFiles.length == 1) {
                problemFileInfo = problemFiles[0];
            } else if (problemFiles.length > 1) {
                const problemFileNames = problemFiles.map(info => Planning.getFileName(info.fileUri));

                const selectedProblemFileName = await window.showQuickPick(problemFileNames, { placeHolder: "Select problem file:" });

                if (!selectedProblemFileName) return false; // was canceled

                problemFileInfo = problemFiles.find(fileInfo => fileInfo.fileUri.endsWith('/' + selectedProblemFileName));
            } else {
                window.showInformationMessage("Ensure a corresponding problem file is open in the editor.");
                return false;
            }
        }
        else {
            window.showInformationMessage("Selected file does not appear to be a valid PDDL domain or problem file.");
            return false;
        }

        let planParser = new PddlPlanParser(domainFileInfo.fileUri, this.plannerConfiguration.getEpsilonTimeStep(), plans => this.visualizePlans(plans));

        this.planner = await this.createPlanner();
        if (!this.planner) return false;

        this.planningProcessKilled = false;

        this.planner.plan(domainFileInfo, problemFileInfo, planParser, this);

        this.showStopButton();

        this.output.show();

        return true;
    }

    /**
     * Creates the right planner wrapper according to the current configuration.
     */
    async createPlanner(): Promise<Planner> {
        let plannerPath = await this.plannerConfiguration.getPlannerPath();
        if (!plannerPath) return null;

        if (PddlConfiguration.isHttp(plannerPath)) {
            return new PlannerService(plannerPath);
        }
        else {
            let plannerOptions = await this.plannerConfiguration.getPlannerOptions();
            if (plannerOptions == null) return null;

            let plannerSyntax = await this.plannerConfiguration.getPlannerSyntax();
            if (plannerSyntax == null) return null;

            return new PlannerExecutable(plannerPath, plannerOptions, plannerSyntax);
        }
    }

    stopPlanner() {
        try {
            if (this.planner) {
                this.planner.stop();
                this.planningProcessKilled = true;
                this.planner = null;
                this.output.appendLine('Process killing requested.');
            }
        }
        catch (ex) {
            console.error(ex);
        }
    }

    showStopButton() {
        this.status.show();
    }

    hideStopButton() {
        this.status.hide();
    }

    handleOutput(outputText: string): void {
        this.output.append(outputText);
    }

    handleSuccess(stdout: string, plans: Plan[]): void {
        this.output.appendLine('Process exited.');
        stdout.length; // just waste it, we did not need it here
        this.hideStopButton();

        this.visualizePlans(plans);
        this.planner = null;
    }

    handleError(error: Error, stderr: string): void {
        stderr.length;
        this.planner = null;

        window.showErrorMessage<ProcessErrorMessageItem>(error.message,
            { title: "Select planner", setPlanner: true },
            { title: "Ignore", setPlanner: false, isCloseAffordance: true }
        ).then(selection => {
            if (selection && selection.setPlanner) {
                this.plannerConfiguration.askNewPlannerPath();
            }
        });
    }

    static toPath(uri: string): string {
        return workspace.textDocuments.find(doc => doc.uri.toString() == uri).fileName;
    }

    visualizePlans(plans: Plan[]): void {
        this.provider.update(this.previewUri, plans);

        let usesViewColumnTwo = window.visibleTextEditors.some(editor => editor.viewColumn == ViewColumn.Two);
        let targetColumn = usesViewColumnTwo ? ViewColumn.Three : ViewColumn.Two;

        commands.executeCommand('vscode.previewHtml', this.previewUri, targetColumn, 'Plan')
            .then((_) => { }, (reason) => window.showErrorMessage(reason));
    }

    // copied from the Workspace class
    static getFolderUri(documentUri: string): string {
        let lastSlashIdx = documentUri.lastIndexOf("/");
        let folderUri = documentUri.substring(0, lastSlashIdx);

        return folderUri;
    }

    static getFolderPath(documentPath: string): string {
        let lastSlashIdx = documentPath.lastIndexOf(path.sep);
        let folderPath = documentPath.substring(0, lastSlashIdx);

        return folderPath;
    }

    // copied from the Workspace class
    static getFileName(documentUri: string): string {
        let lastSlashIdx = documentUri.lastIndexOf("/");
        return documentUri.substring(lastSlashIdx + 1);
    }
    static q(path: string): string {
        return path.includes(' ') ? `"${path}"` : path;
    }
}

class PlanDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private plans: Plan[]; // todo: this should not be a field, but a map against the Uri

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri, plans: Plan[]) {
        this.plans = plans;
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        if (token.isCancellationRequested) return "Canceled";

        console.log("Todo: when supporting multiple plan panes, look this up: " + uri.toString());// todo: should pick up the  plan using the uri

        let selectedPlan = this.plans.length - 1;

        let maxCost = Math.max(...this.plans.map(plan => plan.cost));

        let planSelectors = this.plans.map((plan, planIndex) => this.renderPlanSelector(plan, planIndex, selectedPlan, maxCost)).join(" ");

        let planSelectorsDisplayStyle = this.plans.length > 1 ? "flex" : "none";

        let planText = this.plans.map((plan, planIndex) => this.renderPlan(plan, planIndex, selectedPlan)).join("\n\n");

        let script = `      <script>
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
                if(planIndex == planId) newClass += " planSelector-selected";  
                div.setAttribute("class", newClass);
            });
      }
      function scrollPlanSelectorIntoView(planIndex){
        document.querySelectorAll('div.planSelector').forEach(div => {
            if(parseInt(div.getAttribute('plan')) == planIndex) div.scrollIntoViewIfNeeded();
        });
      }
    </script>
`;

        let html = `<!DOCTYPE html>        
<head>
    <style>
      div.planstep {
        position: absolute;
        white-space: pre;
        display: inline-flex;
        font-family: sans-serif;
        align-items: center;
      }
      
      div.planstep-bar {
        background-color: darkgray;
        height: 15px;
        margin: 3px;
        min-width: 1px;
      }
      
      a:link {
          text-decoration: none;
      }
      
      a:visited {
          text-decoration: none;
      }
      
      a:hover {
          text-decoration: underline;
      }
      
      a:active {
          text-decoration: underline;
      }
      .planSelector {
          margin: 3px;
          width: 50px;
          text-align: center;
          padding: 1px;
          border: transparent 2px solid;
          font-family: sans-serif;
      }
      .planSelector-selected {
        border: 2px solid lightgray;
      }
      .planSelector:hover {
          border: 2px solid darkgray;
      }
      .planMetricBar {
          background-color: lightgreen;
      }
      .planSelectors {
        margin: 5px; 
        display: flex;
        align-items: flex-end;
        overflow: auto;
      }
      </style>
      ${script}
</head>        
<body onload="scrollPlanSelectorIntoView(${selectedPlan})">
    <div class="planSelectors" style="display: ${planSelectorsDisplayStyle};">${planSelectors}</div>
    <div style="margin: 5px; position: absolute;">
        ${planText}
    </div>
</body>`;

        return html
    }

    renderPlanSelector(plan: Plan, planIndex: number, selectedPlan: number, maxCost: number): string {
        let className = "planSelector";
        if (planIndex == selectedPlan) className += " planSelector-selected";

        let normalizedCost = plan.cost / maxCost * 100;

        return `<div class="${className}" plan="${planIndex}" onclick="showPlan(${planIndex})"><span>${plan.cost}</span>
        <div class="planMetricBar" style="height: ${normalizedCost}px"></div>
        </div>`;
    }

    renderPlan(plan: Plan, planIndex: number, selectedPlan: number): string {
        return plan.steps.map((step, stepIndex) => this.renderPlanStep(step, stepIndex, plan, planIndex, selectedPlan)).join("\n");
    }

    renderPlanStep(step: PlanStep, index: number, plan: Plan, planIndex: number, selectedPlan: number): string {
        let actionLink = this.toActionLink(step.actionName, plan);

        let fromTop = index * 20;
        let fromLeft = step.time / plan.makespan * 200;
        let width = Math.max(1, step.duration / plan.makespan * 200);

        return `<div class="planstep" id="plan${planIndex}step${index}" plan="${planIndex}" style="left: ${fromLeft}px; top: ${fromTop}px; display: ${planIndex == selectedPlan ? "inline-flex" : "none"};"><div class="planstep-bar" style="width: ${width}px;"></div>${actionLink} ${step.objects.join(' ')}</div>`;
    }

    toActionLink(actionName: string, plan: Plan) {
        return `<a href="${encodeURI('command:pddl.revealAction?' + JSON.stringify([plan.domainFileUri, actionName]))}">${actionName}</a>`;
    }

}

class ProcessErrorMessageItem implements MessageItem {
    title: string;
    isCloseAffordance?: boolean;
    setPlanner: boolean;
}
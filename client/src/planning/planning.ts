/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, OutputChannel, Uri,
    ViewColumn, MessageItem, ExtensionContext, ProgressLocation, TextDocument, EventEmitter, Event
} from 'vscode';

import * as path from 'path';

import { PlanDocumentContentProvider } from './PlanDocumentContentProvider';

import { PddlWorkspace } from '../../../common/src/workspace-model';
import { DomainInfo, ProblemInfo } from '../../../common/src/parser';
import { FileInfo, PddlLanguage } from '../../../common/src/FileInfo';
import { PddlConfiguration } from '../configuration';
import { Plan } from '../../../common/src/Plan';
import { PlanningHandler } from './plan';
import { PlannerExecutable } from './PlannerExecutable';
import { PlannerService } from './PlannerService';
import { Planner } from './planner';
import { PddlPlanParser } from '../../../common/src/PddlPlanParser';
import { Authentication } from '../../../common/src/Authentication';
import { dirname } from 'path';
import { PlanningResult } from './PlanningResult';
import { PlanReportGenerator } from './PlanReportGenerator';
import { PlanExporter } from './PlanExporter';
import { PlanHappeningsExporter } from './PlanHappeningsExporter';

export const PDDL_GENERATE_PLAN_REPORT = 'pddl.planReport';
const PDDL_STOP_PLANNER = 'pddl.stopPlanner';
export const PDDL_EXPORT_PLAN = 'pddl.exportPlan';
const PDDL_CONVERT_PLAN_TO_HAPPENINGS = 'pddl.convertPlanToHappenings';

/**
 * Delegate for handling requests to run the planner and visualize the plans.
 */
export class Planning implements PlanningHandler {
    output: OutputChannel;
    epsilon = 1e-3;

    previewUri: Uri;
    provider: PlanDocumentContentProvider;

    planner: Planner;
    plans: Plan[];
    planningProcessKilled: boolean;

    extensionPath: string;

    constructor(public pddlWorkspace: PddlWorkspace, public plannerConfiguration: PddlConfiguration, context: ExtensionContext) {
        this.output = window.createOutputChannel("Planner output");

        context.subscriptions.push(commands.registerCommand('pddl.planAndDisplayResult',
            async (domainUri: Uri, problemUri: Uri, workingFolder: string, options: string) => {
                if (problemUri) {
                    await this.planByUri(domainUri, problemUri, workingFolder, options);
                } else {
                    await this.plan();
                }
            })
        );
        
        context.subscriptions.push(commands.registerCommand(PDDL_STOP_PLANNER, () => this.stopPlanner()));

        context.subscriptions.push(commands.registerCommand(PDDL_GENERATE_PLAN_REPORT, () => {
            let plans: Plan[] = this.getPlans();
            if (plans != null) {
                new PlanReportGenerator(context, 1000, true).export(plans, plans.length - 1);
            } else {
                window.showErrorMessage("There is no plan to export.");
            }
        }));
        
        context.subscriptions.push(commands.registerCommand(PDDL_EXPORT_PLAN, selectedPlan => {
            let plans: Plan[] = this.getPlans();
            if (plans != null && selectedPlan < plans.length) {
                new PlanExporter().export(plans[selectedPlan]);
            } else {
                window.showErrorMessage("There is no plan open, or the selected plan does not exist.");
            }
        }));
        
        context.subscriptions.push(commands.registerCommand(PDDL_CONVERT_PLAN_TO_HAPPENINGS, async() => {
            if (window.activeTextEditor && window.activeTextEditor.document.languageId == "plan"){
                let epsilon = plannerConfiguration.getEpsilonTimeStep();
                new PlanHappeningsExporter(window.activeTextEditor.document, epsilon).export();
            } else {
                window.showErrorMessage("There is no plan file open.");
            }
        }));
        
        this.previewUri = Uri.parse('pddl-plan://authority/plan');
        this.provider = new PlanDocumentContentProvider(context);
        context.subscriptions.push(workspace.registerTextDocumentContentProvider('pddl-plan', this.provider));

        this.extensionPath = context.extensionPath;
    }

    /**
     * Invokes the planner in context of model specified via file URIs.
     * @param domainUri domain file uri
     * @param problemUri problem file uri
     * @param workingFolder working folder
     * @param options planner options
     */
    async planByUri(domainUri: Uri, problemUri: Uri, workingFolder: string, options?: string): Promise<boolean> {
        let domainDocument = await workspace.openTextDocument(domainUri);
        let problemDocument = await workspace.openTextDocument(problemUri);

        let domainInfo = <DomainInfo>this.upsertFile(domainDocument);
        let problemInfo = <ProblemInfo>this.upsertFile(problemDocument);

        return this.planExplicit(domainInfo, problemInfo, workingFolder, options);
    }

    private upsertFile(doc: TextDocument): FileInfo {
        return this.pddlWorkspace.upsertAndParseFile(doc.uri.toString(), PddlLanguage.PDDL, doc.version, doc.getText());
    }

    /**
     * Invokes the planner in the context of the currently opened files in the workspace.
     */
    async plan(): Promise<boolean> {

        if (this.planner) {
            window.showErrorMessage("Planner is already running. Stop it using the Cancel button in the progress notification or wait for it to finish.");
            return false;
        }

        this.output.clear();

        const activeDocument = window.activeTextEditor.document;
        const activeFilePath = activeDocument.fileName;

        const activeFileInfo = this.upsertFile(activeDocument);

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
                window.showInformationMessage(`Ensure a domain '${problemFileInfo.domainName}' from the same folder is open in the editor.`);
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

        return this.planExplicit(domainFileInfo, problemFileInfo, Planning.getFolderPath(activeDocument.fileName));
    }

    private readonly _onPlansFound = new EventEmitter<PlanningResult>();
    public onPlansFound: Event<PlanningResult> = this._onPlansFound.event;

    /**
     * Invokes the planner and visualize the plan(s).
     * @param domainFileInfo domain
     * @param problemFileInfo problem
     * @param workingDirectory workflow folder for auxiliary output files
     * @param options planner options
     */
    async planExplicit(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, workingDirectory: string, options?: string): Promise<boolean> {

        let planParser = new PddlPlanParser(domainFileInfo, problemFileInfo, this.plannerConfiguration.getEpsilonTimeStep(), plans => this.visualizePlans(plans));

        this.planner = await this.createPlanner(workingDirectory, options);
        if (!this.planner) return false;

        this.planningProcessKilled = false;

        let startTime: Date;

        window.withProgress<Plan[]>({
            location: ProgressLocation.Notification,
            title: `Searching for plans for domain ${domainFileInfo.name} and problem ${problemFileInfo.name}...`,
            cancellable: true
        }, (progress, token) => {
            progress;
            token.onCancellationRequested(() => {
                this.planningProcessKilled = true;
                this.stopPlanner();
            });

            startTime = new Date();
            return this.planner.plan(domainFileInfo, problemFileInfo, planParser, this);
        })
        .then(plans => {
                let elapsedTime = new Date().getTime() - startTime.getTime();
                let result = this.planningProcessKilled ? PlanningResult.killed() : PlanningResult.success(plans, elapsedTime);
                this._onPlansFound.fire(result);
            },
            reason => this._onPlansFound.fire(PlanningResult.failure(reason.toString()))
        );

        this.output.show(true);

        return true;
    }

    getPlans(): Plan[] {
        return this.plans;
    }

    /**
     * Creates the right planner wrapper according to the current configuration.
     * 
     * @param workingDirectory directory where planner creates output files by default
     * @param options planner options
     * @returns `Planner` instance of the configured planning engine
     */
    async createPlanner(workingDirectory: string, options?: string): Promise<Planner> {
        let plannerPath = await this.plannerConfiguration.getPlannerPath();
        if (!plannerPath) return null;

        if (PddlConfiguration.isHttp(plannerPath)) {
            let useAuthentication = this.plannerConfiguration.isPddlPlannerServiceAuthenticationEnabled();
            let authentication = null;
            if (useAuthentication) {
                let configuration = this.plannerConfiguration.getPddlPlannerServiceAuthenticationConfiguration()
                authentication = new Authentication(configuration.url, configuration.requestEncoded, configuration.clientId, configuration.callbackPort, configuration.timeoutInMs,
                    configuration.tokensvcUrl, configuration.tokensvcApiKey, configuration.tokensvcAccessPath, configuration.tokensvcValidatePath,
                    configuration.tokensvcCodePath, configuration.tokensvcRefreshPath, configuration.tokensvcSvctkPath,
                    configuration.refreshToken, configuration.accessToken, configuration.sToken);
            }
            return new PlannerService(plannerPath, useAuthentication, authentication);
        }
        else {
            let plannerOptions = options != undefined ? options : await this.plannerConfiguration.getPlannerOptions();
            if (plannerOptions == null) return null;

            let plannerSyntax = await this.plannerConfiguration.getPlannerSyntax();
            if (plannerSyntax == null) return null;

            return new PlannerExecutable(plannerPath, plannerOptions, plannerSyntax, workingDirectory);
        }
    }

    stopPlanner() {
        try {
            if (this.planner) {
                this.planner.stop();

                this.planner = null;
                this.output.appendLine('Process killing requested.');
            }
        }
        catch (ex) {
            console.error(ex);
        }
    }

    handleOutput(outputText: string): void {
        this.output.append(outputText);
    }

    handleSuccess(stdout: string, plans: Plan[]): void {
        this.output.appendLine('Planner finished successfully.');
        stdout.length; // just waste it, we did not need it here

        this.visualizePlans(plans);
        this.planner = null;
    }

    handleError(error: Error, stderr: string): void {
        stderr.length;
        this.planner = null;

        window.showErrorMessage<ProcessErrorMessageItem>(error.message,
            { title: "Re-configure the planner", setPlanner: true },
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
        this.plans = plans;
        this.provider.update(this.previewUri, plans);

        let usesViewColumnTwo = window.visibleTextEditors.some(editor => editor.viewColumn == ViewColumn.Two);
        let targetColumn = usesViewColumnTwo ? ViewColumn.Three : ViewColumn.Two;

        commands.executeCommand('vscode.previewHtml', this.previewUri, targetColumn, 'Plan')
            .then((_) => { }, (reason) => window.showErrorMessage(reason));
    }

    static getFolderPath(documentPath: string): string {
        return dirname(documentPath);
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

class ProcessErrorMessageItem implements MessageItem {
    title: string;
    isCloseAffordance?: boolean;
    setPlanner: boolean;
}
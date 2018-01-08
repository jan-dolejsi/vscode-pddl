/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, OutputChannel, Uri, Disposable, 
    ViewColumn, MessageItem, ExtensionContext, StatusBarItem
} from 'vscode';

import * as path from 'path';

import { PlanDocumentContentProvider } from './PlanDocumentContentProvider';

import { PddlWorkspace } from '../../common/src/workspace-model';
import { DomainInfo, ProblemInfo } from '../../common/src/parser';
import { PddlConfiguration } from './configuration';
import { Plan, PlanningHandler } from './plan';
import { PlannerExecutable } from './PlannerExecutable';
import { PlannerService } from './PlannerService';
import { Planner } from './planner';
import { PddlPlanParser } from './PddlPlanParser';
import { Authentication } from '../../common/src/Authentication';

export class Planning implements PlanningHandler {
    output: OutputChannel;
    epsilon = 1e-3;

    previewUri: Uri;
    provider: PlanDocumentContentProvider;
    planDocumentProviderRegistration: Disposable;

    planner: Planner;
    plans: Plan[];
    planningProcessKilled: boolean;
    
    constructor(public pddlWorkspace: PddlWorkspace, public plannerConfiguration: PddlConfiguration, context: ExtensionContext, public status: StatusBarItem) {
        this.output = window.createOutputChannel("Planner output");

        this.previewUri = Uri.parse('pddl-plan://authority/plan');
        this.provider = new PlanDocumentContentProvider(context);
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

        let planParser = new PddlPlanParser(domainFileInfo, problemFileInfo, this.plannerConfiguration.getEpsilonTimeStep(), plans => this.visualizePlans(plans));

        this.planner = await this.createPlanner(Planning.getFolderPath(activeDocument.fileName));
        if (!this.planner) return false;

        this.planningProcessKilled = false;

        this.planner.plan(domainFileInfo, problemFileInfo, planParser, this);

        this.showStopButton();

        this.output.show();

        return true;
    }

    getPlans(): Plan[] {
        return this.plans;
    }

    /**
     * Creates the right planner wrapper according to the current configuration.
     */
    async createPlanner(workingDirectory: string): Promise<Planner> {
        let plannerPath = await this.plannerConfiguration.getPlannerPath();
        if (!plannerPath) return null;

        if (PddlConfiguration.isHttp(plannerPath)) {
            let useAuthentication = this.plannerConfiguration.isPddlPlannerServiceAuthenticationEnabled();
            let authentication = null;
            if(useAuthentication) {
                let configuration = this.plannerConfiguration.getPddlPlannerServiceAuthenticationConfiguration()
                authentication = new Authentication(configuration.url, configuration.requestEncoded, configuration.clientId, 
                    configuration.tokensvcUrl, configuration.tokensvcApiKey, configuration.tokensvcAccessPath, configuration.tokensvcValidatePath, 
                    configuration.tokensvcCodePath, configuration.tokensvcRefreshPath, configuration.tokensvcSvctkPath, 
                    configuration.refreshToken, configuration.accessToken, configuration.sToken);
            }
            return new PlannerService(plannerPath, useAuthentication, authentication);
        }
        else {
            let plannerOptions = await this.plannerConfiguration.getPlannerOptions();
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
        this.plans = plans;
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

class ProcessErrorMessageItem implements MessageItem {
    title: string;
    isCloseAffordance?: boolean;
    setPlanner: boolean;
}
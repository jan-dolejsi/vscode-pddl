/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, workspace, commands, OutputChannel, Uri,
    ExtensionContext, ProgressLocation, EventEmitter, Event, CancellationToken, Progress, QuickPickItem, TextDocument, Disposable
} from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { PlannerAsyncService, AsyncServiceConfiguration } from "pddl-planning-service-client";
import * as path from 'path';
import { URL } from 'url';

import {
    PddlWorkspace, parser, planner, ProblemInfo, Plan, DomainInfo, PddlLanguage, utils
} from 'pddl-workspace';
import { PddlConfiguration, PDDL_CONFIGURE_COMMAND, PDDL_PLANNER } from '../configuration/configuration';
import { PlannerExecutable } from './PlannerExecutable';
import { SAuthentication } from '../util/Authentication';
import { PlanningResult } from './PlanningResult';
import { PlanExporter } from './PlanExporter';
import { PlanHappeningsExporter } from './PlanHappeningsExporter';
import { HappeningsPlanExporter } from './HappeningsPlanExporter';
import { isHappenings, isPlan, selectFile, isPddl } from '../workspace/workspaceUtils';

import { PlanView, PDDL_EXPORT_PLAN } from '../planView/PlanView';
import { PlannerUserOptionsSelector } from './PlannerUserOptionsSelector';
import { PlannerConfigurationSelector } from './PlannerConfigurationSelector';
import { AssociationProvider } from '../workspace/AssociationProvider';
import { showError, isHttp } from '../utils';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { EXECUTION_TARGET, PDDL_CONFIGURE_PLANNER_OUTPUT_TARGET, PlannersConfiguration } from '../configuration/PlannersConfiguration';
import { PlanningAsAServiceProvider, RequestServicePlannerProvider, SolveServicePlannerProvider } from '../configuration/plannerConfigurations';
import { SearchDebuggerView } from '../searchDebugger/SearchDebuggerView';
import { SearchDebugger } from '../searchDebugger/SearchDebugger';
import { PlannerRunConfiguration } from 'pddl-workspace/dist/planner';
import { cratePlannerConfigurationMessageItems, ProcessErrorMessageItem } from './planningUtils';
import { PackagedPlannerSelector } from './PackagedPlannerSelector';
import { PlannerArgumentsSelector } from './PlannerArgumentsSelector';

const PDDL_STOP_PLANNER = 'pddl.stopPlanner';
const PDDL_CONVERT_PLAN_TO_HAPPENINGS = 'pddl.convertPlanToHappenings';
const PDDL_CONVERT_HAPPENINGS_TO_PLAN = 'pddl.convertHappeningsToPlan';
export const PDDL_PLAN_AND_DISPLAY = 'pddl.planAndDisplayResult';

/** Structure that VS Code passes, when user right-clicks on editor tab. */
interface EditorId {
    groupId: number;
    editorIndex: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instanceOfEditorId(obj: any): obj is EditorId {
    return 'groupId' in obj;
}

/**
 * Delegate for handling requests to run the planner and visualize the plans.
 */
export class Planning implements planner.PlannerResponseHandler {
    output: OutputChannel;

    planner: planner.Planner | null = null;
    plans: Plan[] = [];
    planningProcessKilled = false;
    private planView: PlanView;
    optionProviders: planner.PlannerOptionsProvider[] = [];
    userOptionsProvider: PlannerUserOptionsSelector;

    constructor(private codePddlWorkspace: CodePddlWorkspace, private pddlConfiguration: PddlConfiguration,
        private plannersConfiguration: PlannersConfiguration, private context: ExtensionContext) {

        this.userOptionsProvider = new PlannerUserOptionsSelector();
        this.output = window.createOutputChannel("Planner output");

        context.subscriptions.push(this.planView = new PlanView(context, codePddlWorkspace));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_PLAN_AND_DISPLAY,
            async (domainUri: Uri, payload: Uri | Uri[] | EditorId | undefined, workingFolder: string, options?: string) => {
                if (payload && instanceOfEditorId(payload)) {
                    // triggered from the editor tab
                    await this.planFromDocument(await workspace.openTextDocument(domainUri)).catch(showError);
                } else if (Array.isArray(payload)) {
                    // multi-selected multiple files in the Explorer
                    const selectedFiles = payload;
                    this.planByUris(selectedFiles, workingFolder, options).catch(showError);
                } else if (payload) {
                    // payload should be Uri; we ruled out other options
                    await this.planByUri(domainUri, payload, workingFolder, options).catch(showError);
                } else {
                    await this.plan().catch(showError);
                }
            })
        );

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_STOP_PLANNER, () => this.stopPlanner()));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_EXPORT_PLAN, (plan: Plan) => {
            if (plan) {
                new PlanExporter(plan).export();
            } else {
                window.showErrorMessage("There is no plan open, or the selected plan does not exist.");
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONVERT_PLAN_TO_HAPPENINGS, async () => {
            if (window.activeTextEditor && isPlan(window.activeTextEditor.document)) {
                const epsilon = pddlConfiguration.getEpsilonTimeStep();
                new PlanHappeningsExporter(window.activeTextEditor.document, epsilon).export();
            } else {
                window.showErrorMessage("Active document is not a plan.");
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONVERT_HAPPENINGS_TO_PLAN, async () => {
            if (window.activeTextEditor && isHappenings(window.activeTextEditor.document)) {
                const epsilon = pddlConfiguration.getEpsilonTimeStep();
                new HappeningsPlanExporter(window.activeTextEditor.document, epsilon).export();
            } else {
                window.showErrorMessage("Active document is not a happening.");
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand("pddl.syntaxTree", () => {
            if (window.activeTextEditor && isPddl(window.activeTextEditor.document)) {
                const index = window.activeTextEditor.document.offsetAt(window.activeTextEditor.selection.active);
                const pddlSyntaxTreeBuilder = new parser.PddlSyntaxTreeBuilder(window.activeTextEditor.document.getText());
                this.output.appendLine('');
                this.output.appendLine("PDDL Syntax Tree:");
                this.output.appendLine(pddlSyntaxTreeBuilder.getTreeAsString());

                const breadcrumbs = pddlSyntaxTreeBuilder.getBreadcrumbs(index);
                this.output.appendLine('');
                this.output.appendLine("PDDL Parser Breadcrumbs:");
                breadcrumbs.forEach(b => this.output.appendLine(b.toString()));

                this.output.show();
            }
        }));

        context.subscriptions.push(instrumentOperationAsVsCodeCommand(PDDL_CONFIGURE_PLANNER_OUTPUT_TARGET,
            () => commands.executeCommand(PDDL_CONFIGURE_COMMAND, PDDL_PLANNER + '.' + EXECUTION_TARGET)));
    }

    addOptionsProvider(optionsProvider: planner.PlannerOptionsProvider): void {
        this.optionProviders.push(optionsProvider);
    }

    providePlannerOptions(context: planner.PlanningRequestContext): string[] {
        return this.optionProviders.map(provider => provider.providePlannerOptions(context));
    }

    /**
     * Invokes the planner in context of model specified via file URIs.
     * @param domainUri domain file uri
     * @param problemUri problem file uri
     * @param workingFolder working folder
     * @param options planner options
     */
    async planByUri(domainUri: Uri, problemUri: Uri, workingFolder: string, options?: string): Promise<void> {
        const domainDocument = await workspace.openTextDocument(domainUri);
        const problemDocument = await workspace.openTextDocument(problemUri);

        const domainInfo = await this.codePddlWorkspace.upsertAndParseFile(domainDocument) as DomainInfo;
        const problemInfo = await this.codePddlWorkspace.upsertAndParseFile(problemDocument) as ProblemInfo;

        this.planExplicit(domainInfo, problemInfo, workingFolder, options);
    }

    async planByUris(selectedFiles: Uri[], workingFolder: string, options?: string): Promise<void> {
        if (selectedFiles.length === 1) {
            await this.planFromDocument(await workspace.openTextDocument(selectedFiles[0])).catch(showError);
        } else if (selectedFiles.length === 2) {

            let problemFileInfo: ProblemInfo | undefined;
            let domainFileInfo: DomainInfo | undefined;

            for (let i = 0; i < selectedFiles.length; i++) {
                const selectedFile = selectedFiles[i];
                const selectedDoc = await workspace.openTextDocument(selectedFile);

                const fileInfo = await this.codePddlWorkspace.upsertAndParseFile(selectedDoc);
                if (fileInfo === undefined) { throw new Error(`Selected file is not a PDDL document: ${selectedDoc.fileName}`); }

                if (fileInfo.isDomain()) {
                    if (domainFileInfo !== undefined) {
                        throw new Error('Two domain files were selected. Select a domain file and one problem file.');
                    }
                    domainFileInfo = fileInfo as DomainInfo;
                } else if (fileInfo.isProblem()) {
                    if (problemFileInfo !== undefined) {
                        throw new Error('Two problem files were selected. Select a domain file and one problem file.');
                    }
                    problemFileInfo = fileInfo as ProblemInfo;
                } else {
                    throw new Error(`File not supported: ${fileInfo.name}. Select a domain file and one problem file.`);
                }
            }

            if (!domainFileInfo || !problemFileInfo) {
                throw new Error('Select a domain file and one problem file.');
            }

            await this.planExplicit(domainFileInfo, problemFileInfo, workingFolder, options);
        }
    }

    /**
     * Invokes the planner in the context of the currently opened files in the workspace.
     */
    async plan(): Promise<void> {

        if (this.planner) {
            window.showErrorMessage("Planner is already running. Stop it using the Cancel button in the progress notification, or using the 'PDDL: Stop planner' command or wait for it to finish.");
            return;
        }

        if (!window.activeTextEditor) {
            window.showErrorMessage("Active document is not a PDDL file.");
            return;
        }

        const activeDocument = window.activeTextEditor.document;
        return this.planFromDocument(activeDocument);
    }

    async planFromDocument(activeDocument: TextDocument): Promise<void> {
        if (!activeDocument) { return; }
        const activeFileInfo = await this.codePddlWorkspace.upsertAndParseFile(activeDocument);
        if (activeFileInfo === undefined) { throw new Error('Selected file is not a PDDL document.'); }

        let problemFileInfo: ProblemInfo;
        let domainFileInfo: DomainInfo;

        this.output.clear();

        if (activeFileInfo.isProblem()) {
            problemFileInfo = activeFileInfo as ProblemInfo;

            // find domain file(s)
            const domainFiles = this.codePddlWorkspace.getDomainFilesFor(problemFileInfo);

            if (domainFiles.length === 1) {
                domainFileInfo = domainFiles[0];
            } else if (domainFiles.length !== 1) {
                const workspaceFolder = workspace.getWorkspaceFolder(activeDocument.uri);
                const domainFileUri = await selectFile({
                    language: PddlLanguage.PDDL,
                    promptMessage: 'Select the matching domain file...',
                    findPattern: AssociationProvider.PDDL_PATTERN,
                    fileOpenLabel: 'Select',
                    fileOpenFilters: { 'PDDL Domain Files': ['pddl'] },
                    workspaceFolder: workspaceFolder
                }, domainFiles);

                if (!domainFileUri) { return; } // was canceled

                domainFileInfo = domainFiles.find(doc => doc.fileUri.toString() === domainFileUri.toString())
                    || this.codePddlWorkspace.pddlWorkspace.getFileInfo<DomainInfo>(domainFileUri)
                    || await this.parseDomain(domainFileUri);
            } else {
                window.showInformationMessage(`Ensure a domain '${problemFileInfo.domainName}' from the same folder is open in the editor.`);
                return;
            }
        }
        else if (activeFileInfo.isDomain()) {
            domainFileInfo = activeFileInfo as DomainInfo;

            const problemFiles = this.codePddlWorkspace.pddlWorkspace.getProblemFiles(domainFileInfo);

            if (problemFiles.length === 1) {
                problemFileInfo = problemFiles[0];
            } else if (problemFiles.length > 1) {
                const problemFilePicks = problemFiles.map(info => new ProblemFilePickItem(info));

                const selectedProblemFilePick = await window.showQuickPick(problemFilePicks, { placeHolder: "Select problem file:" });

                if (!selectedProblemFilePick) { return; }// was canceled

                problemFileInfo = selectedProblemFilePick.problemInfo;
            } else {
                window.showInformationMessage("Ensure a corresponding problem file is open in the editor.");
                return;
            }
        }
        else {
            window.showInformationMessage("Selected file does not appear to be a valid PDDL domain or problem file.");
            return;
        }

        const workingDirectory = this.establishWorkingDirectory(activeDocument, problemFileInfo, domainFileInfo);
        await this.planExplicit(domainFileInfo, problemFileInfo, workingDirectory);
    }

    private readonly _onPlansFound = new EventEmitter<PlanningResult>();
    public get onPlansFound(): Event<PlanningResult> { return this._onPlansFound.event; }

    private progressUpdater: ElapsedTimeProgressUpdater | undefined;

    private establishWorkingDirectory(activeDocument: TextDocument, problemFileInfo: ProblemInfo, domainFileInfo: DomainInfo): string {
        let workingDirectory = "";
        if (activeDocument.uri.scheme === "file") {
            workingDirectory = path.dirname(activeDocument.fileName);
        }
        else if (problemFileInfo.fileUri.scheme === "file") {
            workingDirectory = path.dirname(problemFileInfo.fileUri.fsPath);
        }
        else if (domainFileInfo.fileUri.scheme === "file") {
            workingDirectory = path.dirname(domainFileInfo.fileUri.fsPath);
        }
        return workingDirectory;
    }

    private async parseDomain(domainFileUri: Uri): Promise<DomainInfo> {
        const fileInfo = await this.codePddlWorkspace.upsertAndParseFile(await workspace.openTextDocument(domainFileUri));
        if (fileInfo && !fileInfo.isDomain()) {
            throw new Error("Selected file is not a domain file.");
        }
        else {
            return fileInfo as DomainInfo;
        }
    }

    /**
     * Invokes the planner and visualize the plan(s).
     * @param domainFileInfo domain
     * @param problemFileInfo problem
     * @param workingDirectory workflow folder for auxiliary output files
     * @param options planner options
     */
    async planExplicit(domainFileInfo: DomainInfo, problemFileInfo: ProblemInfo, workingDirectory: string, options?: string): Promise<void> {

        const planParser = new parser.PddlPlannerOutputParser(domainFileInfo, problemFileInfo, {
            epsilon: this.pddlConfiguration.getEpsilonTimeStep()
        }, plans => this.visualizePlans(plans));

        workingDirectory = await this.adjustWorkingFolder(workingDirectory);

        if (!this.isSearchDebugger()) {
            this.output.show(true);
        }
        else {
            commands.executeCommand(SearchDebuggerView.COMMAND_SEARCH_DEBUGGER_START);
        }

        this.planner = await this.createPlanner(workingDirectory, options);
        if (!this.planner) { return; }
        const planner: planner.Planner = this.planner;
        if (planner instanceof Disposable) {
            this.context.subscriptions.push(planner);
        }

        this.planningProcessKilled = false;

        window.withProgress<Plan[]>({
            location: ProgressLocation.Notification,
            title: `Searching for plans for domain ${domainFileInfo.name} and problem ${problemFileInfo.name}`,
            cancellable: true,

        }, (progress, token) => {
            token.onCancellationRequested(() => {
                this.planningProcessKilled = true;
                this.stopPlanner();
            });

            this.progressUpdater = new ElapsedTimeProgressUpdater(progress, token);
            return planner.plan(domainFileInfo, problemFileInfo, planParser, this);
        })
            .then(plans => this.onPlannerFinished(plans), reason => this.onPlannerFailed(reason, planner).catch(showError));
    }

    isSearchDebugger(): boolean {
        return workspace.getConfiguration("pddlPlanner").get("executionTarget") === "Search debugger";
    }

    onPlannerFinished(plans: Plan[]): void {
        if (!this.progressUpdater) { return; }
        const elapsedTime = this.progressUpdater.getElapsedTimeInMilliSecs();
        this.progressUpdater.setFinished();
        const result = this.planningProcessKilled ? PlanningResult.killed() : PlanningResult.success(plans, elapsedTime);
        this._onPlansFound.fire(result);
        this.planner = null;

        this.output.appendLine(`Planner found ${plans.length} plan(s) in ${this.progressUpdater.getElapsedTimeInMilliSecs() / 1000}secs.`);
        this.visualizePlans(plans);
    }

    /**
     * Called when the planner run fails.
     * @param reason reason of the failure
     * @param failedPlanner planner that failed
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async onPlannerFailed(reason: any, failedPlanner: planner.Planner): Promise<void> {
        if (!this.progressUpdater) { return; }
        this.progressUpdater.setFinished();
        this._onPlansFound.fire(PlanningResult.failure(reason.toString()));

        this.planner = null;
        console.error(reason);

        // does the planner provide any trouble-shooting options?
        const troubleShootingInfo = await failedPlanner.providerConfiguration.provider?.troubleshoot?.(failedPlanner, reason as unknown);

        const options: ProcessErrorMessageItem[] = cratePlannerConfigurationMessageItems(failedPlanner);

        if (troubleShootingInfo?.options) {
            [...troubleShootingInfo.options.keys()]
                .forEach(title => {
                    options.push({ title: title, action: troubleShootingInfo.options.get(title) });
                });
        }

        options.push({ title: "Dismiss", isCloseAffordance: true });

        const message = (troubleShootingInfo?.info ?? '') + '\n\n\nError: ' + (reason.message ?? reason);

        const selection = await window.showErrorMessage<ProcessErrorMessageItem>(message, ...options);
        if (selection?.action) {
            selection.action(failedPlanner);
        }
    }

    async adjustWorkingFolder(workingDirectory: string): Promise<string> {
        if (!workingDirectory) { return ""; }

        // the working directory may be virtual, replace it
        if (!await utils.afs.exists(workingDirectory)) {
            if (workspace.workspaceFolders?.length) {
                return workspace.workspaceFolders[0].uri.fsPath;
            }
            else {
                return "";
            }
        }
        else {
            return workingDirectory;
        }
    }

    getPlans(): Plan[] {
        return this.plans;
    }

    /**
     * Creates the right planner wrapper according to the current configuration.
     *
     * @param workingDirectory directory where planner creates output files by default
     * @param options planner options or a path of a configuration file
     * @returns `Planner` instance of the configured planning engine
     */
    async createPlanner(workingDirectory: string, options?: string): Promise<planner.Planner | null> {
        const scopedPlannerConfiguration = await this.plannersConfiguration.getOrAskSelectedPlanner(workspace.getWorkspaceFolder(Uri.file(workingDirectory)));
        if (!scopedPlannerConfiguration) { return null; }

        const plannerConfiguration = scopedPlannerConfiguration.configuration;

        if (!await this.verifyConsentForSendingPddl(plannerConfiguration)) { return null; }

        if (plannerConfiguration.url !== undefined) {
            const useAuthentication = this.pddlConfiguration.isPddlPlannerServiceAuthenticationEnabled();
            let authentication = undefined;
            if (useAuthentication) {
                const configuration = this.pddlConfiguration.getPddlPlannerServiceAuthenticationConfiguration();
                authentication = new SAuthentication(configuration.url, configuration.requestEncoded, configuration.clientId, configuration.callbackPort, configuration.timeoutInMs,
                    configuration.tokensvcUrl, configuration.tokensvcApiKey, configuration.tokensvcAccessPath, configuration.tokensvcValidatePath,
                    configuration.tokensvcCodePath, configuration.tokensvcRefreshPath, configuration.tokensvcSvctkPath,
                    configuration.refreshToken, configuration.accessToken, configuration.sToken);
            }

            if (plannerConfiguration.url.endsWith("/package")) {
                const selectedEndPoint = await new PackagedPlannerSelector(new URL(plannerConfiguration.url)).select();
                if (!selectedEndPoint) {
                    return null;
                }
                console.log(`Selected package: '${selectedEndPoint.manifest.name}'`);
                plannerConfiguration.url = `${plannerConfiguration.url}/${selectedEndPoint.manifest.package_name}/${selectedEndPoint.endpoint}`;

                const plannerRunArguments = options ?
                    await PlannerArgumentsSelector.loadConfiguration(this.toAbsoluteUri(options, workingDirectory)) :
                    await new PlannerArgumentsSelector(Uri.file(workingDirectory), selectedEndPoint).getConfiguration();
                if (!plannerRunArguments) { return null; } // canceled by user

                // const plannerRunConfiguration: planner.PlannerRunConfiguration = {
                //     options: options,
                //     authentication: authentication
                // };

                const newPlanner = await this.codePddlWorkspace.pddlWorkspace.getPlannerRegistrar()
                    .getPlannerProvider(new planner.PlannerKind(plannerConfiguration.kind))?.createPlanner?.(plannerConfiguration, plannerRunArguments);

                return newPlanner ??
                    PlanningAsAServiceProvider.createDefaultPlanner(plannerConfiguration, plannerRunArguments);
            } else if (plannerConfiguration.url.endsWith("/solve")) {
                options = await this.getPlannerLineOptions(plannerConfiguration, options);
                if (options === undefined) { return null; }

                const plannerRunConfiguration: planner.PlannerRunConfiguration = {
                    options: options,
                    authentication: authentication
                };

                const newPlanner = await this.codePddlWorkspace.pddlWorkspace.getPlannerRegistrar()
                    .getPlannerProvider(new planner.PlannerKind(plannerConfiguration.kind))?.createPlanner?.(plannerConfiguration, plannerRunConfiguration);
                return newPlanner ??
                    SolveServicePlannerProvider.createDefaultPlanner(plannerConfiguration, plannerRunConfiguration);
            }
            else if (plannerConfiguration.url.endsWith("/request")) {
                const configurationUri = options ? this.toAbsoluteUri(options, workingDirectory) : await new PlannerConfigurationSelector(Uri.file(workingDirectory)).getConfiguration();
                if (!configurationUri) { return null; } // canceled by user
                const plannerRunConfiguration = await PlannerConfigurationSelector.loadConfiguration(configurationUri, PlannerAsyncService.DEFAULT_TIMEOUT) as AsyncServiceConfiguration;
                plannerRunConfiguration.authentication = authentication;
                await this.addSearchDebuggerConfig(plannerRunConfiguration);

                const newPlanner = await this.codePddlWorkspace.pddlWorkspace.getPlannerRegistrar()
                    .getPlannerProvider(new planner.PlannerKind(plannerConfiguration.kind))?.createPlanner?.(plannerConfiguration, plannerRunConfiguration);
                
                return newPlanner ??
                    RequestServicePlannerProvider.createDefaultPlanner(plannerConfiguration, plannerRunConfiguration);
            }
            else {
                throw new Error(`Planning service not supported: ${plannerConfiguration.url}. Only /solve or /request service endpoints are supported.`);
            }
        }
        else if (plannerConfiguration.path) {
            options = await this.getPlannerLineOptions(plannerConfiguration, options);
            if (options === undefined) { return null; }

            const plannerRunConfiguration: planner.PlannerExecutableRunConfiguration = {
                options: options,
                workingDirectory: workingDirectory,
                plannerSyntax: plannerConfiguration.syntax
            };
            await this.addSearchDebuggerConfig(plannerRunConfiguration);

            const providerConfiguration: planner.ProviderConfiguration = {
                configuration: plannerConfiguration
            };

            const newPlanner = await this.codePddlWorkspace.pddlWorkspace.getPlannerRegistrar()
                .getPlannerProvider(new planner.PlannerKind(plannerConfiguration.kind))?.createPlanner?.(plannerConfiguration, plannerRunConfiguration);

            return newPlanner ??
                new PlannerExecutable(plannerConfiguration.path, plannerRunConfiguration, providerConfiguration);
        } else {
            throw new Error(`Planner configuration must define at least one of the properties 'url' or 'path': ${plannerConfiguration.title}`);
        }
    }

    private async addSearchDebuggerConfig(plannerRunConfiguration: PlannerRunConfiguration) {
        if (plannerRunConfiguration.searchDebuggerEnabled = this.isSearchDebugger()) {
            plannerRunConfiguration.searchDebuggerPort = await commands.executeCommand(SearchDebugger.PORT_COMMAND);
        }
    }

    private toAbsoluteUri(configPath: string, workingDirectory: string): Uri {
        const absoluteConfigPath = path.isAbsolute(configPath) ?
            configPath :
            path.join(workingDirectory, configPath);
        return Uri.file(absoluteConfigPath);
    }

    async getPlannerLineOptions(configuration: planner.PlannerConfiguration, options: string | undefined): Promise<string | undefined> {
        if (options === undefined) {
            const plannerProvider = this.codePddlWorkspace.pddlWorkspace.getPlannerRegistrar()
                .getPlannerProvider(new planner.PlannerKind(configuration.kind));

            return await this.userOptionsProvider.getPlannerOptions(plannerProvider);
        }
        else {
            return options;
        }
    }

    PLANNING_SERVICE_CONSENTS = "planningServiceConsents";

    async verifyConsentForSendingPddl(plannerConfiguration: planner.PlannerConfiguration): Promise<boolean> {
        if (plannerConfiguration.url !== undefined && isHttp(plannerConfiguration.url)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const consents = this.context.globalState.get<any>(this.PLANNING_SERVICE_CONSENTS, {});
            if (consents[plannerConfiguration.url]) {
                return true;
            }
            else {
                const answer = await window.showWarningMessage(
                    "Confirm you want to send this PDDL to " + plannerConfiguration.url,
                    {
                        modal: true
                    },
                    "Yes, send my PDDL to this service.",
                    "No, I do not want to send this PDDL to this service."
                );
                const consentGiven = answer !== undefined && answer.toLowerCase().startsWith("yes");
                consents[plannerConfiguration.url] = consentGiven;
                this.context.globalState.update(this.PLANNING_SERVICE_CONSENTS, consents);
                return consentGiven;
            }
        }
        else {
            return true;
        }
    }

    stopPlanner(): void {
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

    handlePlan(plan: Plan): void {
        this.output.appendLine(`\nPlan found:`);
        this.output.appendLine(plan.getText());
        this.output.appendLine(`Metric: ${plan.metric}`);
        this.output.appendLine(`Makespan: ${plan.makespan}`);
        this.output.appendLine(`States evaluated: ${plan.statesEvaluated}`);
    }

    visualizePlans(plans: Plan[]): void {
        // visualize if either
        // 1. plan(s) are different
        // 2. the plan preview was closed/disposed meanwhile
        if (!this.arePlanListsEqual(this.plans, plans) || !this.planView.hasPlannerOutput()) {
            this.plans = [...plans]; // making a copy of the list, so the above comparison works
            this.planView.setPlannerOutput(plans, !this.isSearchDebugger());
        }
    }

    arePlanListsEqual(plans1: Plan[], plans2: Plan[]): boolean {
        if (plans1.length !== plans2.length) {
            return false;
        }

        for (let i = 0; i < plans1.length; i++) {
            if (!this.arePlansEqual(plans1[i], plans2[i])) {
                return false;
            }
        }

        return true;
    }

    arePlansEqual(plan1: Plan, plan2: Plan): boolean {
        if (plan1.steps.length !== plan2.steps.length) {
            return false;
        }

        for (let i = 0; i < plan1.steps.length; i++) {
            if (!plan1.steps[i].equals(plan2.steps[i], this.pddlConfiguration.getEpsilonTimeStep())) {
                return false;
            }
        }

        return true;
    }

    static q(path: string): string {
        return path.includes(' ') ? `"${path}"` : path;
    }
}

class ElapsedTimeProgressUpdater {
    startTime = new Date();
    finished = false;

    constructor(private progress: Progress<{ message?: string; increment?: number }>,
        private token: CancellationToken) {
        this.reportProgress();
    }

    getElapsedTimeInMilliSecs(): number {
        return new Date().getTime() - this.startTime.getTime();
    }

    reportProgress(): void {
        if (this.token.isCancellationRequested || this.finished) { return; }
        setTimeout(() => {
            const elapsedTime = new Date(this.getElapsedTimeInMilliSecs());
            this.progress.report({ message: "Elapsed time: " + elapsedTime.toISOString().substr(11, 8) });
            this.reportProgress();
        }, 1000);
    }

    setFinished(): void {
        this.finished = true;
    }
}

class ProblemFilePickItem implements QuickPickItem {
    label: string;
    description?: string;
    detail?: string;
    picked?: boolean;
    alwaysShow?: boolean;
    problemInfo: ProblemInfo;

    constructor(problemInfo: ProblemInfo) {
        this.label = PddlWorkspace.getFileInfoName(problemInfo);
        this.description = PddlWorkspace.getFolderPath(problemInfo.fileUri);
        this.problemInfo = problemInfo;
    }
}
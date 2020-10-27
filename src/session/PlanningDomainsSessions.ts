/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, window, Uri, commands, workspace, Disposable, WorkspaceFolder, QuickPickItem, ViewColumn, SourceControl, env } from 'vscode';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { firstIndex, showError } from '../utils';
import { utils } from 'pddl-workspace';
import * as path from 'path';
import * as opn from 'open';
import { SessionDocumentContentProvider } from './SessionDocumentContentProvider';
import { SessionSourceControl, SESSION_COMMAND_LOAD, SESSION_COMMAND_CHECKOUT, SESSION_COMMAND_REFRESH_ALL } from './SessionSourceControl';
import { SESSION_SCHEME, SessionContent, checkSession } from './SessionRepository';
import { isSessionFolder, readSessionConfiguration, saveConfiguration, SessionMode, toSessionConfiguration, SessionConfiguration } from './SessionConfiguration';
import { SessionUriHandler } from './SessionUriHandler';
import { StudentNameParser, StudentName } from './StudentNameParser';
import { Classroom, StudentSession } from './Classroom';
import { ChildProcess } from 'child_process';

/**
 * Handles the life-cycle of the planning-domains sessions.
 */
export class PlanningDomainsSessions {

    private sessionDocumentContentProvider: SessionDocumentContentProvider;

    /** There may be multiple sessions in one workspace stored in different workspace folders.  */
    private sessionSourceControlRegister = new Map<Uri, SessionSourceControl>(); // todo: replace with UriMap

    /** Triggers update of the labels in the status bar, so the relative fuzzy time keeps accurate. */
    private refreshTimer: NodeJS.Timeout | undefined;

    constructor(private context: ExtensionContext) {
        this.sessionDocumentContentProvider = new SessionDocumentContentProvider();

        this.scanWorkspaceFoldersForConfigurationFiles(context);

        this.subscribe(window.registerUriHandler(new SessionUriHandler()));

        this.subscribe(instrumentOperationAsVsCodeCommand(SESSION_COMMAND_LOAD,
            (sessionId?: string, workspaceUri?: Uri) => {
                this.tryOpenSession(context, sessionId, workspaceUri);
            }));

        this.subscribe(workspace.registerTextDocumentContentProvider(SESSION_SCHEME, this.sessionDocumentContentProvider));

        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.refresh", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { sourceControl.refresh(); }
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand(SESSION_COMMAND_REFRESH_ALL, async () => {
            this.sessionSourceControlRegister.forEach(async sourceControl => await sourceControl.refresh());
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.discard", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { sourceControl.resetFilesToCheckedOutVersion(); }
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand(SESSION_COMMAND_CHECKOUT,
            async (sourceControl: SessionSourceControl, newVersion?: number) => {
                sourceControl = sourceControl || await this.pickSourceControl();
                if (sourceControl) { sourceControl.tryCheckout(newVersion); }
            }));
        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.commit", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { sourceControl.commitAll(); }
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.open", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.openInBrowser(sourceControl.getSession()).catch(showError); }
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.duplicate", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.duplicateAsWritable(sourceControl).catch(showError); }
        }));
        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.share", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.shareByEmail(sourceControl.getSession(), 'someone@somewhere.else', false).catch(showError); }
        }));

        this.subscribe(instrumentOperationAsVsCodeCommand("pddl.planning.domains.session.generateClassroom", async (sourceControlPane: SourceControl) => {
            const sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.generateClassroom(sourceControl); }
        }));

        this.subscribe(workspace.onDidChangeWorkspaceFolders(e => {
            try {
                // initialize new source control for manually added workspace folders
                e.added.forEach(wf => {
                    this.initializeFromConfigurationFile(wf, context);
                });

            } catch (ex) {
                window.showErrorMessage(ex.message ?? ex);
            } finally {
                // dispose source control for removed workspace folders
                e.removed.forEach(wf => {
                    this.unregisterSessionSourceControl(wf.uri);
                });
            }
        }));
    }

    subscribe(disposable: Disposable): void {
        this.context.subscriptions.push(disposable);
    }

    async pickSourceControl(sourceControlPane?: SourceControl): Promise<SessionSourceControl | undefined> {
        if (sourceControlPane) {
            const rootUri = sourceControlPane.rootUri;
            return rootUri ? this.sessionSourceControlRegister.get(rootUri) : undefined;
        }

        // todo: when/if the SourceControl exposes a 'selected' property, use that instead

        if (this.sessionSourceControlRegister.size === 0) {
            return undefined;
        }
        else if (this.sessionSourceControlRegister.size === 1) {
            return [...this.sessionSourceControlRegister.values()][0];
        }
        else {

            const picks = [...this.sessionSourceControlRegister.values()].map(fsc => new RepositoryPick(fsc));

            if (window.activeTextEditor) {
                const activeWorkspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
                const activeSourceControl = activeWorkspaceFolder && this.sessionSourceControlRegister.get(activeWorkspaceFolder.uri);
                const activeIndex = firstIndex(picks, pick => pick.sessionSourceControl === activeSourceControl);

                // if there is an active editor, move its folder to be the first in the pick list
                if (activeIndex > -1) {
                    picks.unshift(...picks.splice(activeIndex, 1));
                }
            }

            const pick = await window.showQuickPick(picks, { placeHolder: 'Select repository' });
            return pick && pick.sessionSourceControl;
        }
    }


    async tryOpenSession(context: ExtensionContext, sessionId?: string, workspaceUri?: Uri): Promise<void> {
        try {
            await this.openSession(context, sessionId, workspaceUri);
        }
        catch (ex) {
            window.showErrorMessage(ex.message ?? ex);
            console.log(ex);
        }
    }

    async openSession(context: ExtensionContext, sessionId?: string, workspaceUri?: Uri): Promise<void> {
        if (workspaceUri && this.sessionSourceControlRegister.has(workspaceUri)) {
            window.showErrorMessage("Another session was already open in this workspace folder. Close it first, or select a different folder and try again.");
            return;
        }

        if (!sessionId) {
            sessionId = (await window.showInputBox({ prompt: 'Paste Planning.Domains session hash', placeHolder: 'hash e.g. XOacXgN1V7' })) ?? '';
        }

        const mode: SessionMode = (await checkSession(sessionId))[0];

        // show the file explorer with the new files
        commands.executeCommand("workbench.view.explorer");

        const workspaceFolder = await this.selectWorkspaceFolder(workspaceUri, sessionId, mode);

        if (!workspaceFolder) { return; } // canceled by user

        // unregister previous source control for this folder, if any
        this.unregisterSessionSourceControl(workspaceFolder.uri);

        // register source control
        const sessionSourceControl = await SessionSourceControl.fromSessionId(sessionId, mode, context, workspaceFolder, true);

        this.registerSessionSourceControl(sessionSourceControl, context);
    }

    registerSessionSourceControl(sessionSourceControl: SessionSourceControl, context: ExtensionContext): void {
        // update the session document content provider with the latest content
        this.sessionDocumentContentProvider.updated(sessionSourceControl.getWorkspaceFolder(), sessionSourceControl.getSession());

        // every time the repository is updated with new session version, notify the content provider
        sessionSourceControl.onRepositoryChange(session =>
            this.sessionDocumentContentProvider.updated(sessionSourceControl.getWorkspaceFolder(), session)
        );

        this.sessionSourceControlRegister.set(sessionSourceControl.getWorkspaceFolder().uri, sessionSourceControl);

        context.subscriptions.push(sessionSourceControl);

        if (!this.refreshTimer) {
            this.refreshTimer = setInterval(() => this.updateStatusBar(), 60_000);
        }
    }

    unregisterSessionSourceControl(folderUri: Uri): void {
        if (this.sessionSourceControlRegister.has(folderUri)) {
            // the folder was already under source control
            const previousSourceControl = this.sessionSourceControlRegister.get(folderUri)!;
            previousSourceControl.dispose();

            this.sessionSourceControlRegister.delete(folderUri);
        }

        if (this.sessionSourceControlRegister.size === 0 && this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    private updateStatusBar(): void {
        this.sessionSourceControlRegister.forEach(sourceControl => {
            try {
                sourceControl.refreshStatusBar();
            } catch (ex) {
                console.log(ex);
            }
        });
    }

    /**
     * When the extension is loaded for a workspace that contains the session source control configuration file, initialize the source control.
     * @param context extension context
     */
    scanWorkspaceFoldersForConfigurationFiles(context: ExtensionContext): void {
        if (!workspace.workspaceFolders) { return; }

        [...workspace.workspaceFolders]
            .sort((f1, f2) => f1.name.localeCompare(f2.name))
            .forEach(async (folder) => {
                try {
                    await this.initializeFromConfigurationFile(folder, context);
                }
                catch (err) {
                    const output = window.createOutputChannel("Planner output");
                    output.appendLine(err);
                    output.show();
                }
            });
    }

    private async initializeFromConfigurationFile(folder: WorkspaceFolder, context: ExtensionContext): Promise<void> {
        const sessionFolder = await isSessionFolder(folder);
        if (sessionFolder) {
            const sessionConfiguration = await readSessionConfiguration(folder);
            const sessionSourceControl = await SessionSourceControl.fromConfiguration(sessionConfiguration, folder, context, sessionConfiguration.versionDate === undefined);
            this.registerSessionSourceControl(sessionSourceControl, context);
        }
    }

    /**
     * Selects or validates the pre-determined workspace folder to clone into.
     * @param folderUri pre-determined folder
     * @param sessionId session ID
     * @param mode read/write mode
     */
    async selectWorkspaceFolder(folderUri: Uri | undefined, sessionId: string, mode: SessionMode): Promise<WorkspaceFolder | undefined> {
        let selectedFolder: WorkspaceFolder | undefined;
        let workspaceFolderUri: Uri | undefined;
        let workspaceFolderIndex: number | undefined;
        let folderOpeningMode: FolderOpeningMode | undefined;

        const sessionConfiguration = toSessionConfiguration(sessionId, mode);

        if (folderUri) {
            // is this a currently open workspace folder?
            const currentlyOpenWorkspaceFolder = workspace.getWorkspaceFolder(folderUri);
            if (currentlyOpenWorkspaceFolder && currentlyOpenWorkspaceFolder.uri.fsPath === folderUri.fsPath) {
                selectedFolder = currentlyOpenWorkspaceFolder;
                workspaceFolderIndex = selectedFolder.index;
                workspaceFolderUri = selectedFolder.uri;
            } else {
                if (!(await utils.afs.exists(folderUri.fsPath))) {
                    await utils.afs.mkdirIfDoesNotExist(folderUri.fsPath, 0o777);
                } else if (!(await utils.afs.stat(folderUri.fsPath)).isDirectory()) {
                    window.showErrorMessage("Selected path is not a directory.");
                    return undefined;
                }
                workspaceFolderUri = folderUri;
            }
        }

        if (!workspaceFolderUri) {

            const folderPicks: WorkspaceFolderPick[] = [newFolderPick];

            if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                folderPicks.push(newWorkspaceFolderPick);

                for (const wf of workspace.workspaceFolders) {
                    const content = await utils.afs.readdir(wf.uri.fsPath);
                    folderPicks.push(new ExistingWorkspaceFolderPick(wf, content));
                }
            }

            const selectedFolderPick =
                folderPicks.length === 1 ?
                    folderPicks[0] :
                    await window.showQuickPick(folderPicks, {
                        canPickMany: false, ignoreFocusOut: true, placeHolder: 'Pick workspace folder to create files in.'
                    });

            if (!selectedFolderPick) { return undefined; }

            if (selectedFolderPick instanceof ExistingWorkspaceFolderPick) {
                selectedFolder = selectedFolderPick.workspaceFolder;
                workspaceFolderIndex = selectedFolder.index;
                workspaceFolderUri = selectedFolder.uri;
            }

            folderOpeningMode = selectedFolderPick.folderOpeningMode;
        }

        if (!workspaceFolderUri && !selectedFolder) {
            const folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder' });
            if (!folderUris) {
                return undefined;
            }

            workspaceFolderUri = folderUris[0];
            // was such workspace folder already open?
            workspaceFolderIndex = workspace.workspaceFolders
                && workspace.workspaceFolders.findIndex(wf => wf.uri.toString() === workspaceFolderUri?.toString());
        }

        if (!workspaceFolderUri) {
            throw new Error("failed assertion: workspace folder must have been selected");
        }

        if (!await this.clearWorkspaceFolder(workspaceFolderUri)) { return undefined; }

        // save folder configuration
        await saveConfiguration(workspaceFolderUri, sessionConfiguration);

        if (folderOpeningMode === FolderOpeningMode.AddToWorkspace || folderOpeningMode === undefined) {
            const workSpacesToReplace = typeof workspaceFolderIndex === 'number' && workspaceFolderIndex > -1 ? 1 : 0;
            if (workspaceFolderIndex === undefined || workspaceFolderIndex < 0) { workspaceFolderIndex = 0; }

            // replace or insert the workspace
            if (workspaceFolderUri) {
                workspace.updateWorkspaceFolders(workspaceFolderIndex, workSpacesToReplace, { uri: workspaceFolderUri });
            }
        }
        else if (folderOpeningMode === FolderOpeningMode.OpenFolder) {
            commands.executeCommand("vscode.openFolder", workspaceFolderUri);
        }

        return selectedFolder;
    }

    async clearWorkspaceFolder(workspaceFolderUri: Uri | undefined): Promise<boolean | undefined> {

        if (!workspaceFolderUri) { return undefined; }

        // check if the workspace is empty, or clear it
        const existingWorkspaceFiles: string[] = await utils.afs.readdir(workspaceFolderUri.fsPath);
        if (existingWorkspaceFiles.length > 0) {
            const answer = await window.showQuickPick(["Yes", "No"],
                { placeHolder: `Remove ${existingWorkspaceFiles.length} file(s) from the folder ${workspaceFolderUri.fsPath} before cloning the remote repository?` });
            if (!answer) { return false; }

            if (answer === "Yes") {
                existingWorkspaceFiles
                    .forEach(async filename =>
                        await utils.afs.unlink(path.join(workspaceFolderUri.fsPath, filename)));
            }
        }

        return true;
    }

    async openDocumentInColumn(fileName: string, column: ViewColumn): Promise<void> {
        const uri = Uri.file(fileName);

        // assuming the file was saved, let's open it in a view column
        const doc = await workspace.openTextDocument(uri);

        await window.showTextDocument(doc, { viewColumn: column });
    }

    async openInBrowser(session: SessionContent): Promise<boolean> {
        const sessionUri = this.createBrowserUri(session, true);

        return env.openExternal(Uri.parse(sessionUri));
    }

    async shareByEmail(session: SessionConfiguration, email: string, readWrite: boolean): Promise<ChildProcess> {
        const subject = `Planning.Domains session ${readWrite ? session.writeHash : session.hash}`;
        const body = `Open session in your browser: ${this.createBrowserUri(session, readWrite)}
Open session in Visual Studio Code: ${this.createVSCodeUri(session, readWrite)}`;

        const mailTo = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body).replace('%23', '#')}`;

        return opn(mailTo);
    }

    private createBrowserUri(session: SessionConfiguration, readWrite: boolean): string {
        let sessionUri = "http://editor.planning.domains/";
        if (session.writeHash && readWrite) {
            sessionUri += "#edit_session=" + session.writeHash;
        }
        else {
            sessionUri += "#read_session=" + session.hash;
        }
        return sessionUri;
    }

    private createVSCodeUri(session: SessionConfiguration, readWrite: boolean): string {
        let sessionUri = "vscode://jan-dolejsi.pddl/planning.domains/session/";
        if (session.writeHash && readWrite) {
            sessionUri += "edit/" + session.writeHash;
        }
        else {
            sessionUri += session.hash;
        }
        return sessionUri;
    }

    async duplicateAsWritable(sourceControl: SessionSourceControl): Promise<void> {
        const folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder for duplicated session files' });
        if (!folderUris) {
            return undefined;
        }

        await sourceControl.duplicateAsWritable(folderUris[0], true);
    }

    async generateClassroom(templateSourceControl: SessionSourceControl): Promise<void> {
        const studentNameParser = new StudentNameParser();

        const studentNameInput = await window.showInputBox({
            ignoreFocusOut: true, prompt: 'List the student names/emails',
            placeHolder: 'Example: John Doe; student1@domain.com; Alice von Wunderland <alice@wunderland-blah-blah.com>',
            validateInput: input => studentNameParser.validateClassroomNames(input)
        });

        if (!studentNameInput) { return; }

        const students = studentNameParser.parse(studentNameInput);

        const studentSessionsPromises = students
            .map(async student => await this.duplicateClassroomSession(templateSourceControl, student));

        const studentSessions = await Promise.all(studentSessionsPromises);

        const workspacePath = await new Classroom(templateSourceControl, studentSessions).createWorkspace();

        // email students their session address
        const emailPromises = studentSessions
            .filter(studentSession => !!studentSession.identity.email)
            .map(session => this.shareByEmail(session.sessionConfiguration, session.identity.email!, true));

        await Promise.all(emailPromises);

        // display summary of sessions
        const sessionSummaryCsv = studentSessions
            .map(session => `${session.identity.getEffectiveName()}, ${session.identity.email}, ${session.sessionConfiguration.writeHash}, ${this.createBrowserUri(session.sessionConfiguration, true)}`)
            .join('\n');
        const summaryDoc = await workspace.openTextDocument({ language: 'csv', content: sessionSummaryCsv });
        window.showTextDocument(summaryDoc);
        await summaryDoc.save();

        commands.executeCommand('vscode.openFolder', Uri.file(workspacePath));
    }

    /** duplicate the session */
    async duplicateClassroomSession(templateSourceControl: SessionSourceControl, student: StudentName): Promise<StudentSession> {
        const sessionPath = Classroom.getSessionPath(templateSourceControl, student);
        const studentSessionHash = await templateSourceControl.duplicateAsWritable(Uri.file(sessionPath), false);
        return new StudentSession(student, toSessionConfiguration(studentSessionHash, SessionMode.READ_WRITE));
    }
}


class RepositoryPick implements QuickPickItem {

    constructor(public readonly sessionSourceControl: SessionSourceControl) { }

    get label(): string {
        return this.sessionSourceControl.getSourceControl().label;
    }

    get description(): string {
        return this.sessionSourceControl.getWorkspaceFolder().name;
    }
}

abstract class WorkspaceFolderPick implements QuickPickItem {
    constructor(private _label: string, public folderOpeningMode: FolderOpeningMode) { }

    get label(): string {
        return this._label;
    }
}

class ExistingWorkspaceFolderPick extends WorkspaceFolderPick {

    constructor(public readonly workspaceFolder: WorkspaceFolder, private content: string[]) {
        super(workspaceFolder.name, FolderOpeningMode.AddToWorkspace);
    }

    get description(): string {
        return this.workspaceFolder.uri.fsPath;
    }

    get detail(): string {
        return this.content.length ?
            `${this.content.length} files/directories may need to be removed..` :
            ''; // this should not happen
    }
}

class NewWorkspaceFolderPick extends WorkspaceFolderPick {
    constructor(label: string, folderOpeningMode: FolderOpeningMode) {
        super(label, folderOpeningMode);
    }
}

enum FolderOpeningMode { AddToWorkspace, OpenFolder }

const newWorkspaceFolderPick = new NewWorkspaceFolderPick("Select/create a local folder to add to this workspace...", FolderOpeningMode.AddToWorkspace);
const newFolderPick = new NewWorkspaceFolderPick("Select/create a local folder...", FolderOpeningMode.OpenFolder);

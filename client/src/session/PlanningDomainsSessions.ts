/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ExtensionContext, window, Uri, commands, workspace, Disposable, WorkspaceFolder, QuickPickItem, ViewColumn, SourceControl, env } from 'vscode';
import { firstIndex } from '../utils';
import * as afs from '../../../common/src/asyncfs';
import * as path from 'path';
import { SessionDocumentContentProvider } from './SessionDocumentContentProvider';
import { SessionSourceControl, SESSION_COMMAND_LOAD, SESSION_COMMAND_CHECKOUT, SESSION_COMMAND_REFRESH_ALL } from './SessionSourceControl';
import { SESSION_SCHEME, SessionContent, checkSession } from './SessionRepository';
import { isSessionFolder, readSessionConfiguration, saveConfiguration, SessionMode, toSessionConfiguration, SessionConfiguration } from './SessionConfiguration';
import { SessionUriHandler } from './SessionUriHandler';
import { StudentNameParser, StudentName } from './StudentNameParser';
import { Classroom, StudentSession } from './Classroom';

/**
 * Handles the life-cycle of the planning-domains sessions.
 */
export class PlanningDomainsSessions {

    private sessionDocumentContentProvider: SessionDocumentContentProvider;

    /** There may be multiple sessions in one workspace stored in different workspace folders.  */
    private sessionSourceControlRegister = new Map<Uri, SessionSourceControl>();

    /** Triggers update of the labels in the status bar, so the relative fuzzy time keeps accurate. */
    private refreshTimer: NodeJS.Timeout;

    constructor(private context: ExtensionContext) {
        this.sessionDocumentContentProvider = new SessionDocumentContentProvider();

        this.scanWorkspaceFoldersForConfigurationFiles(context);

        this.subscribe(window.registerUriHandler(new SessionUriHandler()));

        this.subscribe(commands.registerCommand(SESSION_COMMAND_LOAD,
            (sessionId?: string, workspaceUri?: Uri) => {
                this.tryOpenSession(context, sessionId, workspaceUri);
            }));

        this.subscribe(workspace.registerTextDocumentContentProvider(SESSION_SCHEME, this.sessionDocumentContentProvider));

        this.subscribe(commands.registerCommand("pddl.planning.domains.session.refresh", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { sourceControl.refresh(); }
        }));
        this.subscribe(commands.registerCommand(SESSION_COMMAND_REFRESH_ALL, async () => {
            this.sessionSourceControlRegister.forEach(async sourceControl => await sourceControl.refresh());
        }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.discard", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { sourceControl.resetFilesToCheckedOutVersion(); }
        }));
        this.subscribe(commands.registerCommand(SESSION_COMMAND_CHECKOUT,
            async (sourceControl: SessionSourceControl, newVersion?: number) => {
                sourceControl = sourceControl || await this.pickSourceControl();
                if (sourceControl) { sourceControl.tryCheckout(newVersion); }
            }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.commit", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { sourceControl.commitAll(); }
        }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.open", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.openInBrowser(sourceControl.getSession()); }
        }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.duplicate", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.duplicateAsWritable(sourceControl); }
        }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.share", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.shareByEmail(sourceControl.getSession(), '', false); }
        }));

        this.subscribe(commands.registerCommand("pddl.planning.domains.session.generateClassroom", async (sourceControlPane: SourceControl) => {
            let sourceControl = await this.pickSourceControl(sourceControlPane);
            if (sourceControl) { this.generateClassroom(sourceControl); }
        }));

        this.subscribe(workspace.onDidChangeWorkspaceFolders(e => {
            try {
                // initialize new source control for manually added workspace folders
                e.added.forEach(wf => {
                    this.initializeFromConfigurationFile(wf, context);
                });

            } catch (ex) {
                window.showErrorMessage(ex.message);
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
            let rootUri: Uri = sourceControlPane.rootUri;
            return this.sessionSourceControlRegister.get(rootUri);
        }

        // todo: when/if the SourceControl exposes a 'selected' property, use that instead

        if (this.sessionSourceControlRegister.size === 0) {
            return undefined;
        }
        else if (this.sessionSourceControlRegister.size === 1) {
            return [...this.sessionSourceControlRegister.values()][0];
        }
        else {

            let picks = [...this.sessionSourceControlRegister.values()].map(fsc => new RepositoryPick(fsc));

            if (window.activeTextEditor) {
                let activeWorkspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
                let activeSourceControl = activeWorkspaceFolder && this.sessionSourceControlRegister.get(activeWorkspaceFolder.uri);
                let activeIndex = firstIndex(picks, pick => pick.sessionSourceControl === activeSourceControl);

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
            window.showErrorMessage(ex.message);
            console.log(ex);
        }
    }

    async openSession(context: ExtensionContext, sessionId?: string, workspaceUri?: Uri): Promise<void> {
        if (workspaceUri && this.sessionSourceControlRegister.has(workspaceUri)) {
            window.showErrorMessage("Another session was already open in this workspace folder. Close it first, or select a different folder and try again.");
            return;
        }

        if (!sessionId) {
            sessionId = (await window.showInputBox({ prompt: 'Paste Planning.Domains session hash', placeHolder: 'hash e.g. XOacXgN1V7', value: 'XOacXgN1V7' })) || '';
        }

        let mode: SessionMode = (await checkSession(sessionId))[0];

        // show the file explorer with the new files
        commands.executeCommand("workbench.view.explorer");

        let workspaceFolder = await this.selectWorkspaceFolder(workspaceUri, sessionId, mode);

        if (!workspaceFolder) { return; } // canceled by user

        // unregister previous source control for this folder, if any
        this.unregisterSessionSourceControl(workspaceFolder.uri);

        // register source control
        let sessionSourceControl = await SessionSourceControl.fromSessionId(sessionId, mode, context, workspaceFolder, true);

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
            this.refreshTimer = null;
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

        workspace.workspaceFolders
            .sort((f1, f2) => f1.name.localeCompare(f2.name))
            .forEach(async folder => {
                try {
                    await this.initializeFromConfigurationFile(folder, context);
                }
                catch (err) {
                    let output = window.createOutputChannel("Planner output");
                    output.appendLine(err);
                    output.show();
                }
            });
    }

    private async initializeFromConfigurationFile(folder: WorkspaceFolder, context: ExtensionContext) {
        let sessionFolder = await isSessionFolder(folder);
        if (sessionFolder) {
            let sessionConfiguration = await readSessionConfiguration(folder);
            let sessionSourceControl = await SessionSourceControl.fromConfiguration(sessionConfiguration, folder, context, sessionConfiguration.versionDate === undefined);
            this.registerSessionSourceControl(sessionSourceControl, context);
        }
    }

    async selectWorkspaceFolder(folderUri: Uri, sessionId: string, mode: SessionMode): Promise<WorkspaceFolder | undefined> {
        var selectedFolder: WorkspaceFolder | undefined;
        var workspaceFolderUri: Uri | undefined;
        var workspaceFolderIndex: number | undefined;
        var folderOpeningMode: FolderOpeningMode;

        const sessionConfiguration = toSessionConfiguration(sessionId, mode);

        if (folderUri) {
            // is this a currently open workspace folder?
            let currentlyOpenWorkspaceFolder = workspace.getWorkspaceFolder(folderUri);
            if (currentlyOpenWorkspaceFolder && currentlyOpenWorkspaceFolder.uri.fsPath === folderUri.fsPath) {
                selectedFolder = currentlyOpenWorkspaceFolder;
                workspaceFolderIndex = selectedFolder.index;
                workspaceFolderUri = selectedFolder.uri;
            } else {
                if (!(await afs.exists(folderUri.fsPath))) {
                    await afs.mkdirIfDoesNotExist(folderUri.fsPath, 0o777);
                } else if (!(await afs.stat(folderUri.fsPath)).isDirectory()) {
                    window.showErrorMessage("Selected path is not a directory.");
                    return null;
                }
                workspaceFolderUri = folderUri;
            }
        }

        if (!workspaceFolderUri) {

            var folderPicks: WorkspaceFolderPick[] = [newFolderPick];

            if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                folderPicks.push(newWorkspaceFolderPick);

                for (const wf of workspace.workspaceFolders) {
                    let content = await afs.readdir(wf.uri.fsPath);
                    folderPicks.push(new ExistingWorkspaceFolderPick(wf, content));
                }
            }

            let selectedFolderPick: WorkspaceFolderPick =
                folderPicks.length === 1 ?
                    folderPicks[0] :
                    await window.showQuickPick(folderPicks, {
                        canPickMany: false, ignoreFocusOut: true, placeHolder: 'Pick workspace folder to create files in.'
                    });

            if (!selectedFolderPick) { return null; }

            if (selectedFolderPick instanceof ExistingWorkspaceFolderPick) {
                selectedFolder = selectedFolderPick.workspaceFolder;
                workspaceFolderIndex = selectedFolder.index;
                workspaceFolderUri = selectedFolder.uri;
            }

            folderOpeningMode = selectedFolderPick.folderOpeningMode;
        }

        if (!workspaceFolderUri && !selectedFolder) {
            let folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder' });
            if (!folderUris) {
                return null;
            }

            workspaceFolderUri = folderUris[0];
            // was such workspace folder already open?
            workspaceFolderIndex = workspace.workspaceFolders && firstIndex(workspace.workspaceFolders, (folder1: any) => folder1.uri.toString() === workspaceFolderUri!.toString());
        }

        if (! await this.clearWorkspaceFolder(workspaceFolderUri)) { return null; }

        // save folder configuration
        await saveConfiguration(workspaceFolderUri, sessionConfiguration);

        if (folderOpeningMode === FolderOpeningMode.AddToWorkspace || folderOpeningMode === undefined) {
            let workSpacesToReplace = typeof workspaceFolderIndex === 'number' && workspaceFolderIndex > -1 ? 1 : 0;
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

    async clearWorkspaceFolder(workspaceFolderUri: Uri): Promise<boolean> {

        if (!workspaceFolderUri) { return undefined; }

        // check if the workspace is empty, or clear it
        let existingWorkspaceFiles: string[] = await afs.readdir(workspaceFolderUri.fsPath);
        if (existingWorkspaceFiles.length > 0) {
            let answer = await window.showQuickPick(["Yes", "No"],
                { placeHolder: `Remove ${existingWorkspaceFiles.length} file(s) from the folder ${workspaceFolderUri.fsPath} before cloning the remote repository?` });
            if (!answer) { return false; }

            if (answer === "Yes") {
                existingWorkspaceFiles
                    .forEach(async filename =>
                        await afs.unlink(path.join(workspaceFolderUri.fsPath, filename)));
            }
        }

        return true;
    }

    async openDocumentInColumn(fileName: string, column: ViewColumn): Promise<void> {
        let uri = Uri.file(fileName);

        // assuming the file was saved, let's open it in a view column
        let doc = await workspace.openTextDocument(uri);

        await window.showTextDocument(doc, { viewColumn: column });
    }

    openInBrowser(session: SessionContent): void {
        var sessionUri = this.createBrowserUri(session, true);

        env.openExternal(Uri.parse(sessionUri));
    }

    async shareByEmail(session: SessionConfiguration, email: string, readWrite: boolean): Promise<boolean> {
        let subject = `Planning.Domains session ${readWrite ? session.writeHash : session.hash}`;
        let body = `Open session in your browser: ${this.createBrowserUri(session, readWrite)}
Open session in Visual Studio Code: ${this.createVSCodeUri(session, readWrite)}`;

        let mailTo = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body).replace('%23', '#')}`;

        return env.openExternal(Uri.parse(mailTo));
    }

    private createBrowserUri(session: SessionConfiguration, readWrite: boolean): string {
        var sessionUri = "http://editor.planning.domains/";
        if (session.writeHash && readWrite) {
            sessionUri += "#edit_session=" + session.writeHash;
        }
        else {
            sessionUri += "#read_session=" + session.hash;
        }
        return sessionUri;
    }

    private createVSCodeUri(session: SessionConfiguration, readWrite: boolean): string {
        var sessionUri = "vscode://jan-dolejsi.pddl/planning.domains/session/";
        if (session.writeHash && readWrite) {
            sessionUri += "edit/" + session.writeHash;
        }
        else {
            sessionUri += session.hash;
        }
        return sessionUri;
    }

    async duplicateAsWritable(sourceControl: SessionSourceControl): Promise<void> {
        let folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder for duplicated session files' });
        if (!folderUris) {
            return undefined;
        }

        await sourceControl.duplicateAsWritable(folderUris[0], true);
    }

    async generateClassroom(templateSourceControl: SessionSourceControl): Promise<void> {
        let studentNameParser = new StudentNameParser();

        let studentNameInput = await window.showInputBox({
            ignoreFocusOut: true, prompt: 'List the student names/emails',
            placeHolder: 'Example: Student1; name@domain.com; Student2 <name@domain.com>',
            validateInput: input => studentNameParser.validateClassroomNames(input)
        });

        if (!studentNameInput) { return; }

        let students = studentNameParser.parse(studentNameInput);

        let studentSessionsPromises = students
            .map(async student => await this.duplicateClassroomSession(templateSourceControl, student));

        let studentSessions = await Promise.all(studentSessionsPromises);

        let workspacePath = await new Classroom(templateSourceControl, studentSessions).createWorkspace();

        let emailPromises = studentSessions
            .filter(studentSession => studentSession.identity.email)
            .map(session => this.shareByEmail(session.sessionConfiguration, session.identity.email, true));

        await Promise.all(emailPromises);

        commands.executeCommand('vscode.openFolder', Uri.file(workspacePath));
    }

    /** duplicate the session */
    async duplicateClassroomSession(templateSourceControl: SessionSourceControl, student: StudentName): Promise<StudentSession> {
        let sessionPath = Classroom.getSessionPath(templateSourceControl, student);
        let studentSessionHash = await templateSourceControl.duplicateAsWritable(Uri.file(sessionPath), false);
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
    label: string;
    constructor(public folderOpeningMode: FolderOpeningMode) { }
}

class ExistingWorkspaceFolderPick extends WorkspaceFolderPick {

    constructor(public readonly workspaceFolder: WorkspaceFolder, private content: string[]) {
        super(FolderOpeningMode.AddToWorkspace);
    }

    get label(): string {
        return this.workspaceFolder.name;
    }

    get description(): string {
        return this.workspaceFolder.uri.fsPath;
    }

    get detail(): string {
        return this.content.length ? `${this.content.length} files/directories may need to be removed..` : null;
    }
}

class NewWorkspaceFolderPick extends WorkspaceFolderPick {
    constructor(public label: string, folderOpeningMode: FolderOpeningMode) {
        super(folderOpeningMode);
    }
}

enum FolderOpeningMode { AddToWorkspace, OpenFolder }

const newWorkspaceFolderPick = new NewWorkspaceFolderPick("Select/create a local folder to add to this workspace...", FolderOpeningMode.AddToWorkspace);
const newFolderPick = new NewWorkspaceFolderPick("Select/create a local folder...", FolderOpeningMode.OpenFolder);

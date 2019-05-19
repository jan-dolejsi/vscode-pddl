/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ExtensionContext, window, Uri, commands, workspace, Disposable, WorkspaceFolder, QuickPickItem, ViewColumn, SourceControl, env } from 'vscode';
import { firstIndex } from '../utils';
import * as afs from '../asyncfs';
import * as path from 'path';
import { SessionDocumentContentProvider } from './SessionDocumentContentProvider';
import { SessionSourceControl, SESSION_COMMAND_LOAD, SESSION_COMMAND_CHECKOUT, SESSION_COMMAND_REFRESH_ALL } from './SessionSourceControl';
import { SESSION_SCHEME, SessionContent, checkSession } from './SessionRepository';
import { isSessionFolder, readSessionConfiguration, saveConfiguration, SessionMode, toSessionConfiguration } from './SessionConfiguration';
import { SessionUriHandler } from './SessionUriHandler';

/**
 * Handles the life-cycle of the planning-domains sessions.
 */
export class PlanningDomainsSessions {

    private sessionDocumentContentProvider: SessionDocumentContentProvider;

    /** There may be multiple sessions in one workspace stored in different workspace folders.  */
    private sessionSourceControlRegister = new Map<Uri, SessionSourceControl>();

    constructor(private context: ExtensionContext) {
        this.sessionDocumentContentProvider = new SessionDocumentContentProvider();

        this.initializeFromConfigurationFile(context);

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

        if (this.sessionSourceControlRegister.size === 0) { return undefined; }
        else if (this.sessionSourceControlRegister.size === 1) { return [...this.sessionSourceControlRegister.values()][0]; }
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
            window.showErrorMessage(ex);
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

        let mode: SessionMode = await checkSession(sessionId);

        // show the file explorer with the new files
        commands.executeCommand("workbench.view.explorer");

        let workspaceFolder = await this.selectWorkspaceFolder(workspaceUri, sessionId, mode);

        if (!workspaceFolder) { return; } // canceled by user

        // register source control
        let sessionSourceControl = await SessionSourceControl.fromSessionId(sessionId, mode, context, workspaceFolder, true);

        this.registerSessionSourceControl(sessionSourceControl, context);
    }

    registerSessionSourceControl(sessionSourceControl: SessionSourceControl, context: ExtensionContext) {
        // update the session document content provider with the latest content
        this.sessionDocumentContentProvider.updated(sessionSourceControl.getSession());

        // every time the repository is updated with new session version, notify the content provider
        sessionSourceControl.onRepositoryChange(session => this.sessionDocumentContentProvider.updated(session));

        if (this.sessionSourceControlRegister.has(sessionSourceControl.getWorkspaceFolder().uri)) {
            // the folder was already under source control
            const previousSourceControl = this.sessionSourceControlRegister.get(sessionSourceControl.getWorkspaceFolder().uri)!;
            previousSourceControl.dispose();
        }

        this.sessionSourceControlRegister.set(sessionSourceControl.getWorkspaceFolder().uri, sessionSourceControl);

        context.subscriptions.push(sessionSourceControl);
    }

    /**
     * When the extension is loaded for a workspace that contains the session source control configuration file, initialize the source control.
     * @param context extension context
     */
    initializeFromConfigurationFile(context: ExtensionContext): void {
        if (!workspace.workspaceFolders) { return; }

        workspace.workspaceFolders
            .sort((f1, f2) => f1.name.localeCompare(f2.name))
            .forEach(async folder => {
                let sessionFolder = await isSessionFolder(folder);
                if (sessionFolder) {
                    try {
                        let sessionConfiguration = await readSessionConfiguration(folder);
                        let sessionSourceControl = await SessionSourceControl.fromConfiguration(sessionConfiguration, folder, context, sessionConfiguration.versionDate === undefined);
                        this.registerSessionSourceControl(sessionSourceControl, context);
                    } catch (err) {
                        window.showErrorMessage(err);
                    }
                }
            });
    }

    async selectWorkspaceFolder(folderUri: Uri, sessionId: string, mode: SessionMode): Promise<WorkspaceFolder | undefined> {
        var selectedFolder: WorkspaceFolder | undefined;
        var workspaceFolderUri: Uri | undefined;
        var workspaceFolderIndex: number | undefined;

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

        if (!workspaceFolderUri && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            let folderPicks = workspace.workspaceFolders
                .map(folder => new WorkspaceFolderPick(folder))
                .concat([newWorkspaceFolderPick]);

            let selectedFolderPick: WorkspaceFolderPick = await window.showQuickPick(folderPicks, { canPickMany: false, placeHolder: 'Pick workspace folder to create files in.' });
            if (!selectedFolderPick) { return null; }

            if (selectedFolderPick !== newWorkspaceFolderPick) {
                selectedFolder = selectedFolderPick.workspaceFolder;
                workspaceFolderIndex = selectedFolder.index;
                workspaceFolderUri = selectedFolder.uri;
            }
        }

        if (!workspaceFolderUri && !selectedFolder) {
            let folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder' });
            if (!folderUris) {
                return undefined;
            }

            workspaceFolderUri = folderUris[0];
            // was such workspace folder already open?
            workspaceFolderIndex = workspace.workspaceFolders && firstIndex(workspace.workspaceFolders, (folder1: any) => folder1.uri.toString() === workspaceFolderUri!.toString());
        }

        await this.clearWorkspaceFolder(workspaceFolderUri);

        // save folder configuration
        await saveConfiguration(workspaceFolderUri, sessionConfiguration);


        let workSpacesToReplace = typeof workspaceFolderIndex === 'number' && workspaceFolderIndex > -1 ? 1 : 0;
        if (workspaceFolderIndex === undefined || workspaceFolderIndex < 0) { workspaceFolderIndex = 0; }

        // replace or insert the workspace
        if (workspaceFolderUri) {
            workspace.updateWorkspaceFolders(workspaceFolderIndex, workSpacesToReplace, { uri: workspaceFolderUri });
        }

        return selectedFolder;
    }

    async clearWorkspaceFolder(workspaceFolderUri: Uri): Promise<void> {

        if (!workspaceFolderUri) { return undefined; }

        // check if the workspace is empty, or clear it
        let existingWorkspaceFiles: string[] = await afs.readdir(workspaceFolderUri.fsPath);
        if (existingWorkspaceFiles.length > 0) {
            let answer = await window.showQuickPick(["Yes", "No"],
                { placeHolder: `Remove ${existingWorkspaceFiles.length} file(s) from the folder ${workspaceFolderUri.fsPath} before cloning the remote repository?` });
            if (!answer) { return null; }

            if (answer === "Yes") {
                existingWorkspaceFiles
                    .forEach(async filename =>
                        await afs.unlink(path.join(workspaceFolderUri.fsPath, filename)));
            }
        }
    }

    async openDocumentInColumn(fileName: string, column: ViewColumn): Promise<void> {
        let uri = Uri.file(fileName);

        // assuming the file was saved, let's open it in a view column
        let doc = await workspace.openTextDocument(uri);

        await window.showTextDocument(doc, { viewColumn: column });
    }

    openInBrowser(session: SessionContent): void {
        var sessionUri = "http://editor.planning.domains/";
        if (session.writeHash) {
            sessionUri += "#edit_session=" + session.writeHash;
        } else {
            sessionUri += "#read_session=" + session.hash;
        }

        env.openExternal(Uri.parse(sessionUri));
    }

    async duplicateAsWritable(sourceControl: SessionSourceControl): Promise<void> {
        let folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder for duplicated session files' });
        if (!folderUris) {
            return undefined;
        }

        sourceControl.duplicateAsWritable(folderUris[0]);
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

class WorkspaceFolderPick implements QuickPickItem {

    constructor(public readonly workspaceFolder: WorkspaceFolder) { }

    get label(): string {
        return this.workspaceFolder ? this.workspaceFolder.name : "Create new folder...";
    }
}

const newWorkspaceFolderPick = new WorkspaceFolderPick(null);
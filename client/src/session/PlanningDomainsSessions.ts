/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ExtensionContext, window, Uri, commands, workspace, Disposable, WorkspaceFolder, QuickPickItem, ViewColumn } from 'vscode';
import { firstIndex, readdir, unlink } from '../utils';
import * as path from 'path';
import { SessionDocumentContentProvider } from './SessionDocumentContentProvider';
import { SessionSourceControl, SESSION_COMMAND_LOAD, SESSION_COMMAND_CHECKOUT, SESSION_EDIT_COMMAND_LOAD } from './SessionSourceControl';
import { SESSION_SCHEME } from './SessionRepository';
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
                this.tryOpenSession(context, SessionMode.READ_ONLY, sessionId, workspaceUri);
            }));

        this.subscribe(commands.registerCommand(SESSION_EDIT_COMMAND_LOAD,
            (sessionId?: string, workspaceUri?: Uri) => {
                this.tryOpenSession(context, SessionMode.READ_WRITE, sessionId, workspaceUri);
            }));

        this.subscribe(workspace.registerTextDocumentContentProvider(SESSION_SCHEME, this.sessionDocumentContentProvider));

        this.subscribe(commands.registerCommand("pddl.planning.domains.session.refresh", async () => {
            let sourceControl = await this.pickSourceControl();
            if (sourceControl) { sourceControl.refresh(); }
        }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.discard", async () => {
            let sourceControl = await this.pickSourceControl();
            if (sourceControl) { sourceControl.resetFilesToCheckedOutVersion(); }
        }));
        this.subscribe(commands.registerCommand(SESSION_COMMAND_CHECKOUT,
            async (sourceControl: SessionSourceControl, newVersion?: number) => {
                sourceControl = sourceControl || await this.pickSourceControl();
                if (sourceControl) { sourceControl.tryCheckout(newVersion); }
            }));
        this.subscribe(commands.registerCommand("pddl.planning.domains.session.commit", async () => {
            let sourceControl = await this.pickSourceControl();
            if (sourceControl) { sourceControl.commitAll(); }
        }));
    }

    subscribe(disposable: Disposable): void {
        this.context.subscriptions.push(disposable);
    }

    async pickSourceControl(): Promise<SessionSourceControl | undefined> {
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


    async tryOpenSession(context: ExtensionContext, mode: SessionMode, sessionId?: string, workspaceUri?: Uri): Promise<void> {
        try {
            await this.openSession(context, mode, sessionId, workspaceUri);
        }
        catch (ex) {
            window.showErrorMessage(ex);
            console.log(ex);
        }
    }

    async openSession(context: ExtensionContext, mode: SessionMode, sessionId?: string, workspaceUri?: Uri) {
        if (workspaceUri && this.sessionSourceControlRegister.has(workspaceUri)) {
            window.showErrorMessage("Another session was already open in this workspace. Open a new workspace first.");
        }

        if (!sessionId) {
            sessionId = (await window.showInputBox({ prompt: 'Paste Planning.Domains session hash', placeHolder: 'hash e.g. XOacXgN1V7', value: 'XOacXgN1V7' })) || '';
        }

        // show the file explorer with the new files
        commands.executeCommand("workbench.view.explorer");

        let workspaceFolder =
            workspaceUri ?
                workspace.getWorkspaceFolder(workspaceUri) :
                await this.selectWorkspaceFolder(sessionId, mode);

        workspaceFolder = await this.clearWorkspaceFolder(workspaceFolder);
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

    async selectWorkspaceFolder(sessionId: string, mode: SessionMode): Promise<WorkspaceFolder | undefined> {
        var selectedFolder: WorkspaceFolder | undefined;
        var workspaceFolderUri: Uri | undefined;
        var workspaceFolderIndex: number | undefined;

        const sessionConfiguration = toSessionConfiguration(sessionId, mode);

        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
            selectedFolder = await window.showWorkspaceFolderPick({ placeHolder: 'Pick workspace folder to create files in.' });
            if (!selectedFolder) { return undefined; }

            workspaceFolderIndex = selectedFolder.index;
            workspaceFolderUri = selectedFolder.uri;
        }
        else if (!workspace.workspaceFolders) {
            let folderUris = await window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select folder' });
            if (!folderUris) {
                return undefined;
            }

            workspaceFolderUri = folderUris[0];
            // was such workspace folder already open?
            workspaceFolderIndex = workspace.workspaceFolders && firstIndex(workspace.workspaceFolders, (folder1: any) => folder1.uri.toString() === workspaceFolderUri!.toString());

            // save folder configuration
            await saveConfiguration(workspaceFolderUri, sessionConfiguration);

            selectedFolder = undefined; // the extension will get reloaded in the context of the newly open workspace
        }
        else {
            selectedFolder = workspace.workspaceFolders[0];
        }

        let workSpacesToReplace = typeof workspaceFolderIndex === 'number' && workspaceFolderIndex > -1 ? 1 : 0;
        if (workspaceFolderIndex === undefined || workspaceFolderIndex < 0) { workspaceFolderIndex = 0; }

        // replace or insert the workspace
        if (workspaceFolderUri) {
            workspace.updateWorkspaceFolders(workspaceFolderIndex, workSpacesToReplace, { uri: workspaceFolderUri });
        }

        return selectedFolder;
    }

    async clearWorkspaceFolder(workspaceFolder?: WorkspaceFolder): Promise<WorkspaceFolder | undefined> {

        if (!workspaceFolder) { return undefined; }

        // check if the workspace is empty, or clear it
        let existingWorkspaceFiles: string[] = await readdir(workspaceFolder.uri.fsPath);
        if (existingWorkspaceFiles.length > 0) {
            let answer = await window.showQuickPick(["Yes", "No"],
                { placeHolder: `Remove ${existingWorkspaceFiles.length} file(s) from the workspace before cloning the remote repository?` });
            if (answer === undefined) { return undefined; }

            if (answer === "Yes") {
                existingWorkspaceFiles
                    .forEach(async filename =>
                        await unlink(path.join(workspaceFolder.uri.fsPath, filename)));
            }
        }

        return workspaceFolder;
    }

    async openDocumentInColumn(fileName: string, column: ViewColumn): Promise<void> {
        let uri = Uri.file(fileName);

        // assuming the file was saved, let's open it in a view column
        let doc = await workspace.openTextDocument(uri);

        await window.showTextDocument(doc, { viewColumn: column });
    }
}


class RepositoryPick implements QuickPickItem {

    constructor(public readonly sessionSourceControl: SessionSourceControl) { }

    get label(): string {
        return this.sessionSourceControl.getSourceControl().label;
    }
}

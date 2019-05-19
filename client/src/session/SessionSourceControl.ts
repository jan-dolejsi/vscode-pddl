/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { SessionRepository, getSession, SessionContent, uploadSession, duplicateSession, checkSession } from './SessionRepository';
import * as path from 'path';
import { toFuzzyRelativeTime } from '../utils';
import * as afs from '../asyncfs';
import { SessionConfiguration, saveConfiguration, SessionMode, toSessionConfiguration, CONFIGURATION_FILE } from './SessionConfiguration';

/**
 * Command for cloning a session to the local storage.
 * Arguments: sessionId?, localWorkspaceUri?
 */
export const SESSION_COMMAND_LOAD = 'pddl.planning.domains.session.load';
/**
 * Command for downloading the latest version of the session to the local storage.
 */
export const SESSION_COMMAND_CHECKOUT = 'pddl.planning.domains.session.checkout';

export const SESSION_COMMAND_REFRESH_ALL = 'pddl.planning.domains.session.refresh_all';

enum ChangedResourceState {
	New,
	Deleted,
	Dirty
}

/** Handles the version control for session files. */
export class SessionSourceControl implements vscode.Disposable {

	private sessionScm: vscode.SourceControl;
	private changedResources: vscode.SourceControlResourceGroup;
	private sessionRepository: SessionRepository;
	/** This represents the most recent session version on the server. */
	private latestSessionVersionDate: number = Number.MIN_VALUE; // until actual value is established
	private _onRepositoryChange = new vscode.EventEmitter<SessionContent>();
	private timeout?: NodeJS.Timer;
	private session!: SessionContent;
	private isRefreshing: boolean;

	constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder, session: SessionContent, overwrite: boolean) {
		this.sessionScm = vscode.scm.createSourceControl('planningDomainsSession', 'Session #' + session.getHash(), workspaceFolder.uri);
		this.changedResources = this.sessionScm.createResourceGroup('workingTree', 'Changes');
		this.sessionRepository = new SessionRepository(workspaceFolder, session);
		this.sessionScm.quickDiffProvider = this.sessionRepository;
		this.sessionScm.inputBox.placeholder = session.canCommit() ? '' : 'Read-only session!';

		let fileSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, "*.*"));
		fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		context.subscriptions.push(this.sessionScm);
		context.subscriptions.push(fileSystemWatcher);

		// clone the session to the local workspace
		this.setSession(session, overwrite)
			.then(_ => this.refresh()) //find out if there is a new version
			.catch(err => vscode.window.showErrorMessage(err));
	}

	static async fromSessionId(id: string, mode: SessionMode, context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, overwrite: boolean): Promise<SessionSourceControl> {
		var sessionConfiguration = toSessionConfiguration(id, mode);
		return await SessionSourceControl.fromConfiguration(sessionConfiguration, workspaceFolder, context, overwrite);
	}

	static async fromConfiguration(configuration: SessionConfiguration, workspaceFolder: vscode.WorkspaceFolder, context: vscode.ExtensionContext, overwrite: boolean): Promise<SessionSourceControl> {
		let session = configuration.versionDate ? SessionContent.from(configuration) : await getSession(configuration);
		return new SessionSourceControl(context, workspaceFolder, session, overwrite);
	}

	private refreshStatusBar() {

		let title = "$(repo) " + toFuzzyRelativeTime(this.session.versionDate);

		if (this.session.versionDate < this.latestSessionVersionDate) {
			title = `$(cloud-download) ${title} (stale)`;
		}

		if (this.getSourceControl().count) {
			title += " $(primitive-dot)";
		}

		var refreshTitle = `$(sync${this.isRefreshing ? '~spin' : ''})`;

		this.sessionScm.statusBarCommands = [
			{
				"command": SESSION_COMMAND_CHECKOUT,
				"arguments": [this],
				"title": title,
				"tooltip": "Fetch latest version of the session files."
			},
			{
				"command": SESSION_COMMAND_REFRESH_ALL,
				"title": refreshTitle,
				"tooltip": "Refresh status of all Planning.domains sessions"
			}
		];
	}

	async commitAll(): Promise<void> {
		if (!this.changedResources.resourceStates.length) {
			vscode.window.showErrorMessage("There is nothing to commit.");
			return;
		}

		if (!this.session.canCommit()) {
			vscode.window.showErrorMessage("This session was open as read-only! Save it using the Clone command.");
			return;
		}

		await this.refresh();

		if (this.session.versionDate < this.latestSessionVersionDate) {
			vscode.window.showErrorMessage("Checkout the latest session version before committing your changes.");
		}
		else {
			try {
				let currentSession = await this.getCurrentSession();
				let newSessionContent: SessionContent = await uploadSession(currentSession);

				await this.setSession(newSessionContent, false);
				this.sessionScm.inputBox.value = '';
			} catch (ex) {
				vscode.window.showErrorMessage("Cannot commit changes to Planning.Domains session. " + ex.message);
			}
		}
	}

	async getCurrentSession(): Promise<SessionContent> {
		let newFiles = new Map<string, string>();

		let localFileNames = await this.getLocalFileNames();

		for (const fileName of localFileNames) {
			newFiles.set(fileName, await this.getFileContent(fileName));
		}
		return new SessionContent(this.session.hash, this.session.writeHash, this.session.versionDate, newFiles);
	}

	/**
	 * Throws away all local changes and resets all files to the checked out version of the repository.
	 */
	resetFilesToCheckedOutVersion(): void {
		this.session.files.forEach((fileContent, fileName) => this.resetFile(fileName, fileContent));
	}

	/** Resets the given local file content to the checked-out version. */
	private async resetFile(fileName: string, fileContent: string): Promise<void> {
		let filePath = this.sessionRepository.createLocalResourcePath(fileName);
		await afs.writeFile(filePath, fileContent);
	}

	private async getFileContent(fileName: string): Promise<string> {
		let filePath = this.sessionRepository.createLocalResourcePath(fileName);
		let document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
		return document.getText();
	}

	async tryCheckout(newVersion: number | undefined): Promise<void> {
		if (!Number.isFinite(this.latestSessionVersionDate)) { return; }

		if (newVersion === undefined) {
			let allVersions = [...new Set([this.session.versionDate, this.latestSessionVersionDate])]
				.map(ver => new VersionQuickPickItem(ver, ver === this.session.versionDate));
			let newVersionPick = await vscode.window.showQuickPick(allVersions, { canPickMany: false, placeHolder: 'Select a version...' });
			if (newVersionPick) {
				newVersion = newVersionPick.version;
			}
			else {
				return;
			}
		}

		if (newVersion === this.session.versionDate) { return; } // the same version was selected

		if (this.changedResources.resourceStates.length) {
			vscode.window.showErrorMessage(`There is one or more changed resources. Discard your local changes before checking out another version.`);
		}
		else {
			try {
				let newSession = await getSession(this.session);
				await this.setSession(newSession, true);
			} catch (ex) {
				vscode.window.showErrorMessage(ex);
			}
		}
	}

	private async setSession(newSession: SessionContent, overwrite: boolean): Promise<void> {
		if (newSession.versionDate > this.latestSessionVersionDate) { this.latestSessionVersionDate = newSession.versionDate; }
		this.session = newSession;
		if (overwrite) { this.resetFilesToCheckedOutVersion(); } // overwrite local file content
		this._onRepositoryChange.fire(this.session);
		this.refreshStatusBar();
		this.updateChangedGroup();

		await this.saveCurrentConfiguration();
	}

	getSession(): SessionContent {
		return this.session;
	}

	getWorkspaceFolder(): vscode.WorkspaceFolder {
		return this.workspaceFolder;
	}

	getSourceControl(): vscode.SourceControl {
		return this.sessionScm;
	}

	getRepository(): SessionRepository {
		return this.sessionRepository;
	}

	/** save configuration for later VS Code sessions */
	private async saveCurrentConfiguration(): Promise<void> {
		return await saveConfiguration(this.workspaceFolder.uri, this.session);
	}

	/**
	 * Refresh is used when the information on the server may have changed.
	 * For example another user updates the session files online.
	 */
	async refresh(): Promise<void> {
		this.isRefreshing = true;
		this.refreshStatusBar();

		try {
			let sessionCheckResult = await checkSession(this.session.getHash());
			this.latestSessionVersionDate = sessionCheckResult[1];
		} catch (ex) {
			// typically the ex.statusCode == 404, when there is no further version
		}

		this.updateChangedGroup();

		this.isRefreshing = false;
		this.refreshStatusBar();
	}

	get onRepositoryChange(): vscode.Event<SessionContent> {
		return this._onRepositoryChange.event;
	}

	onResourceChange(_uri: vscode.Uri): void {
		if (this.timeout) { clearTimeout(this.timeout); }
		this.timeout = setTimeout(() => this.tryUpdateChangedGroup(), 500);
	}

	async tryUpdateChangedGroup(): Promise<void> {
		try {
			await this.updateChangedGroup();
		}
		catch (ex) {
			vscode.window.showErrorMessage(ex);
		}
	}

	/** Refreshes the list of changed resources under this version control. */
	async updateChangedGroup(): Promise<void> {
		// for simplicity we ignore which document was changed in this event and scan all of them
		let changedResources: vscode.SourceControlResourceState[] = [];

		let uris = this.sessionRepository.provideSourceControlledResources();

		let otherFolderFiles: string[] = await this.getLocalFileNames();

		for (const uri of uris) {
			let state: ChangedResourceState = null;

			if (await afs.exists(uri.fsPath)) {
				let document = await vscode.workspace.openTextDocument(uri);
				if (this.isDirty(document)) {
					state = ChangedResourceState.Dirty;
				}
				otherFolderFiles.splice(otherFolderFiles.indexOf(path.basename(uri.fsPath)));
			}
			else {
				state = ChangedResourceState.Deleted;
			}

			if (state) {
				let resourceState = this.toSourceControlResourceState(uri, state);
				changedResources.push(resourceState);
			}
		}

		for (const otherFile of otherFolderFiles) {
			let resourcePath = path.join(this.getWorkspaceFolder().uri.fsPath, otherFile);
			let fileStats = await afs.stat(resourcePath);
			if (fileStats.isDirectory()) { continue; }

			// add this file as a new file to the session changed resources
			let resourceUri = vscode.Uri.file(resourcePath);
			let resourceState = this.toSourceControlResourceState(resourceUri, ChangedResourceState.New);
			changedResources.push(resourceState);
		}

		this.changedResources.resourceStates = changedResources;
		this.sessionScm.count = this.changedResources.resourceStates.length;
	}

	async getLocalFileNames(): Promise<string[]> {
		let localFileNames: string[] = await afs.readdir(this.getWorkspaceFolder().uri.fsPath);
		return localFileNames
			// exclude the config file
			.filter(fileName => fileName !== CONFIGURATION_FILE);
	}

	/** Determines whether the resource is different, regardless of line endings. */
	isDirty(doc: vscode.TextDocument): boolean {
		let originalText = this.session.files.get(path.basename(doc.uri.fsPath));
		return originalText.replace('\r', '') !== doc.getText().replace('\r', '');
	}

	toSourceControlResourceState(docUri: vscode.Uri, state: ChangedResourceState): vscode.SourceControlResourceState {

		let repositoryUri = this.sessionRepository.provideOriginalResource(docUri, null);

		const fileName = path.basename(docUri.fsPath);

		let command: vscode.Command;
		let tooltip: string;

		switch (state) {
			case ChangedResourceState.Dirty:
				command = {
					title: "Show changes",
					command: "vscode.diff",
					arguments: [repositoryUri, docUri, `Session#${this.session.hash}:${fileName} ↔ Local changes`],
					tooltip: "Diff your changes"
				};
				break;
			case ChangedResourceState.New:
				command = {
					title: "Show document",
					command: 'vscode.open',
					arguments: [docUri]
				};
				tooltip = 'File will be added to the session.';
				break;
			case ChangedResourceState.Deleted:
				command = {
					title: "Show content of the removed document",
					command: 'vscode.open',
					arguments: [repositoryUri]
				};
				tooltip = 'File was locally deleted and will be removed from the session.';
				break;
			default:
				throw new Error("Unexpected resource state: " + state);
		}

		let resourceState: vscode.SourceControlResourceState = {
			resourceUri: docUri,
			command: command,
			decorations: {
				strikeThrough: state === ChangedResourceState.Deleted,
				faded: state === ChangedResourceState.New,
				tooltip: tooltip
			}
		};

		return resourceState;
	}

	/**
	 * Creates a copy of the current session on the server and requests it to be cloned to the targetLocalFolder.
	 * @param targetLocalFolder local folder uri, where the session should be cloned
	 */
	async duplicateAsWritable(targetLocalFolder: vscode.Uri) {
		try {
			let currentSession = await this.getCurrentSession();
			let newSessionWriteHash: string = await duplicateSession(currentSession);

			// trigger the command to download the new session
			vscode.commands.executeCommand(SESSION_COMMAND_LOAD, newSessionWriteHash, targetLocalFolder);
		} catch (ex) {
			vscode.window.showErrorMessage("Failed creating duplicate session in Planning.Domains session. " + ex.message);
		}
	}

	dispose() {
		this._onRepositoryChange.dispose();
		this.sessionScm.dispose();
	}
}

class VersionQuickPickItem implements vscode.QuickPickItem {

	constructor(public readonly version: number, public readonly picked: boolean) {
	}

	get label(): string {
		return `Version from ${toFuzzyRelativeTime(this.version)}`;
	}

	get description(): string {
		return this.picked ? ' (currently checked-out)' : '';
	}

	get alwaysShow(): boolean {
		return this.picked;
	}
}

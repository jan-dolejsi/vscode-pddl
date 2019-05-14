/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { SessionRepository, getSession, SessionContent } from './SessionRepository';
import * as path from 'path';
import { existsSync } from 'fs';
import { writeFile, toFuzzyRelativeTime } from '../utils';
import { SessionConfiguration, saveConfiguration, SessionMode, toSessionConfiguration } from './SessionConfiguration';

export const SESSION_COMMAND_LOAD = 'pddl.planning.domains.session.load';
export const SESSION_EDIT_COMMAND_LOAD = 'pddl.planning.domains.session.edit.load';
export const SESSION_COMMAND_CHECKOUT = 'pddl.planning.domains.session.checkout';

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
	//todo: should the previous source control that maps onto the same folder uri be disposed first?
	constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder, session: SessionContent, overwrite: boolean) {
		this.sessionScm = vscode.scm.createSourceControl('planningDomainsSession', 'Session #' + session.hash, workspaceFolder.uri);
		this.changedResources = this.sessionScm.createResourceGroup('workingTree', 'Changes');
		this.sessionRepository = new SessionRepository(workspaceFolder, session);
		this.sessionScm.quickDiffProvider = this.sessionRepository;
		this.sessionScm.inputBox.placeholder = session.canCommit() ? 'Saving back is not yet supported :-(' : 'Read-only session!';

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

		let title = `↕ ${this.session.hash} ${toFuzzyRelativeTime(this.session.versionDate)}`;

		if (this.session.versionDate < this.latestSessionVersionDate) {
			title += ' (stale)';
		}

		this.sessionScm.statusBarCommands = [
			{
				"command": SESSION_COMMAND_CHECKOUT,
				"arguments": [this],
				"title": title,
				"tooltip": "Fetch latest version of the session files.",
			}
		];
	}

	async commitAll(): Promise<void> {
		if (!this.changedResources.resourceStates.length) {
			vscode.window.showErrorMessage("There is nothing to commit.");
			return;
		}

		if (!this.session.canCommit()) {
			vscode.window.showErrorMessage("This session was open as read-only!");
			return;
		}

		await this.refresh();

		if (this.session.versionDate < this.latestSessionVersionDate) {
			vscode.window.showErrorMessage("Checkout the latest session version before committing your changes.");
		}
		else {
			// todo: get all workspace files, upload them back to the server when there is an endpoint
			// here we assume nobody updated the Session on the server since we refreshed the list of versions
			vscode.window.showErrorMessage("Writing session files back is not supported yet.");
			return;
			try {
				let newSessionContent: SessionContent = null;
				if (!newSessionContent) { return; }
				await this.setSession(newSessionContent, false);
				this.sessionScm.inputBox.value = '';
			} catch (ex) {
				vscode.window.showErrorMessage("Cannot commit changes to Planning.Domains session. " + ex.message);
			}
		}
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
		await writeFile(filePath, fileContent);
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
		try {
			let latestSession = await getSession(this.session);
			this.latestSessionVersionDate = latestSession.versionDate;
		} catch (ex) {
			// typically the ex.statusCode == 404, when there is no further version
		}

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

	async updateChangedGroup(): Promise<void> {
		// for simplicity we ignore which document was changed in this event and scan all of them
		let changedResources: vscode.SourceControlResourceState[] = [];

		let uris = this.sessionRepository.provideSourceControlledResources();

		for (const uri of uris) {
			let isDirty: boolean;
			let wasDeleted: boolean;

			if (existsSync(uri.fsPath)) {
				let document = await vscode.workspace.openTextDocument(uri);
				isDirty = this.isDirty(document);
				wasDeleted = false;
			}
			else {
				isDirty = true;
				wasDeleted = true;
			}

			if (isDirty) {
				let resourceState = this.toSourceControlResourceState(uri, wasDeleted);
				changedResources.push(resourceState);
			}
		}

		this.changedResources.resourceStates = changedResources;
	}

	/** Determines whether the resource is different, regardless of line endings. */
	isDirty(doc: vscode.TextDocument): boolean {
		let originalText = this.session.files.get(path.basename(doc.uri.fsPath));
		return originalText.replace('\r', '') !== doc.getText().replace('\r', '');
	}

	toSourceControlResourceState(docUri: vscode.Uri, deleted: boolean): vscode.SourceControlResourceState {

		let repositoryUri = this.sessionRepository.provideOriginalResource(docUri, null);

		const fileName = path.basename(docUri.fsPath);

		let command: vscode.Command = !deleted
			? {
				title: "Show changes",
				command: "vscode.diff",
				arguments: [repositoryUri, docUri, `Session#${this.session.hash}:${fileName} ↔ Local changes`],
				tooltip: "Diff your changes"
			}
			: null;

		let resourceState: vscode.SourceControlResourceState = {
			resourceUri: docUri,
			command: command,
			decorations: {
				strikeThrough: deleted,
				tooltip: 'File was locally deleted.'
			}
		};

		return resourceState;
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

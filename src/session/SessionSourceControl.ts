/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { SessionRepository, getSession, SessionContent, uploadSession, duplicateSession, checkSession, PLANNING_AS_A_SERVICE_PLUGIN_NAME, SOLVER_PLUGIN_NAME } from './SessionRepository';
import * as path from 'path';
import { toFuzzyRelativeTime } from '../utils';
import { SessionConfiguration, saveConfiguration, SessionMode, toSessionConfiguration, CONFIGURATION_FILE } from './SessionConfiguration';
import { CONF_PDDL } from '../configuration/configuration';
import { exists } from '../util/workspaceFs';
import { CONF_PLANNERS, CONF_SELECTED_PLANNER } from '../configuration/PlannersConfiguration';
import { PlanningAsAServiceProvider, SolveServicePlannerProvider } from '../configuration/plannerConfigurations';

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
	private timeout?: NodeJS.Timeout;
	private session!: SessionContent;
	private isRefreshing = false;

	constructor(context: vscode.ExtensionContext, private readonly workspaceFolder: vscode.WorkspaceFolder, session: SessionContent, overwrite: boolean) {
		this.sessionScm = vscode.scm.createSourceControl('planningDomainsSession', 'Session #' + session.getHash(), workspaceFolder.uri);
		this.changedResources = this.sessionScm.createResourceGroup('workingTree', 'Changes');
		this.sessionRepository = new SessionRepository(workspaceFolder, session);
		this.sessionScm.quickDiffProvider = this.sessionRepository;
		this.sessionScm.inputBox.placeholder = session.canCommit() ? '' : 'Read-only session!';
		this.sessionScm.inputBox.visible = false; // available from VS Code 1.45

		const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, "*.*"));
		fileSystemWatcher.onDidChange(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate(uri => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete(uri => this.onResourceChange(uri), context.subscriptions);

		context.subscriptions.push(this.sessionScm);
		context.subscriptions.push(fileSystemWatcher);

		// clone the session to the local workspace
		this.setSession(session, overwrite)
			.then(() => this.refresh()) //find out if there is a new version
			.catch(err => vscode.window.showErrorMessage(err));
	}

	static async fromSessionId(id: string, mode: SessionMode, context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, overwrite: boolean): Promise<SessionSourceControl> {
		const sessionConfiguration = toSessionConfiguration(id, mode);
		return await SessionSourceControl.fromConfiguration(sessionConfiguration, workspaceFolder, context, overwrite);
	}

	static async fromConfiguration(configuration: SessionConfiguration, workspaceFolder: vscode.WorkspaceFolder, context: vscode.ExtensionContext, overwrite: boolean): Promise<SessionSourceControl> {
		const session = configuration.versionDate ?
			SessionContent.from(configuration, configuration.versionDate) :
			await getSession(configuration);
		return new SessionSourceControl(context, workspaceFolder, session, overwrite);
	}

	refreshStatusBar(): void {

		let title = "$(repo) ";

		if (this.session.canCommit()) {
			title += '$(pencil)';
		}

		title += toFuzzyRelativeTime(this.session.versionDate);

		if (this.session.versionDate < this.latestSessionVersionDate) {
			title = `$(cloud-download) ${title} (stale)`;
		}

		if (this.getSourceControl().count) {
			title += " $(primitive-dot)";
		}

		const refreshTitle = `$(sync${this.isRefreshing ? '~spin' : ''})`;

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
				await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl, title: 'Committing...' }, async (progress) => {
					const currentSession = await this.getCurrentSession();
					progress.report({ message: 'Latest session refreshed.', increment: 33 });
					const newSessionContent: SessionContent = await uploadSession(currentSession);
					progress.report({ message: 'Session committed.', increment: 33 });
					await this.setSession(newSessionContent, false);
					progress.report({ message: 'Session re-downloaded.', increment: 34 });
					this.sessionScm.inputBox.value = '';
				});
			} catch (ex: unknown) {
				vscode.window.showErrorMessage("Cannot commit changes to Planning.Domains session. " + (ex as Error).message);
			}
		}
	}

	/** Constructs a session instance from the current set of files in the workspace. */
	async getCurrentSession(): Promise<SessionContent> {
		const newFiles = new Map<string, string>();

		const localFileNames = await this.getLocalFileNames();

		for (const fileName of localFileNames) {
			newFiles.set(fileName, await this.getFileContent(fileName));
		}
		return new SessionContent(this.session.hash, this.session.writeHash, this.session.versionDate, newFiles, new Map());
	}

	/**
	 * Throws away all local changes and resets all files to the checked out version of the repository.
	 */
	async resetFilesToCheckedOutVersion(): Promise<void> {
		if (this.getLocalModifiedResources() && this.getLocalModifiedResources().length > 0) {
			const discardAnswer = "Discard";
			const answer = await vscode.window.showWarningMessage(`Discard ${this.getLocalModifiedResources().length} changes?`, { modal: true }, discardAnswer, "Cancel");
			if (answer !== discardAnswer) {
				return;
			}
		}
		this.session.files.forEach((fileContent, fileName) => this.resetFile(fileName, fileContent));
	}

	/** Resets the given local file content to the checked-out version. */
	private async resetFile(fileName: string, fileContent: string): Promise<void> {
		const fileUri = this.sessionRepository.createLocalResourceUri(fileName);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(fileContent, "utf-8"));
	}

	private async getFileContent(fileName: string): Promise<string> {
		const fileUri = this.sessionRepository.createLocalResourceUri(fileName);
		const document = await vscode.workspace.openTextDocument(fileUri);
		return document.getText();
	}

	async tryCheckout(newVersion: number | undefined): Promise<void> {
		if (!Number.isFinite(this.latestSessionVersionDate)) { return; }

		if (newVersion === undefined) {
			const allVersions = [...new Set([this.session.versionDate, this.latestSessionVersionDate])]
				.map(ver => new VersionQuickPickItem(ver, ver === this.session.versionDate));
			const newVersionPick = await vscode.window.showQuickPick(allVersions, { canPickMany: false, placeHolder: 'Select a version...' });
			if (newVersionPick) {
				newVersion = newVersionPick.version;
			}
			else {
				return;
			}
		}

		if (newVersion === this.session.versionDate) { return; } // the same version was selected

		const localUntrackedResources = this.getLocalUntrackedResources();
		if (this.changedResources.resourceStates.length - localUntrackedResources.length) {
			vscode.window.showErrorMessage(`There is one or more changed resources. Discard your local changes before checking out another version.`, { modal: true });
		}
		else {
			try {
				const newSession = await getSession(this.session);

				// check if any of the local untracked files conflict with files in the new session
				const conflictingUntrackedResources = localUntrackedResources
					.filter(resource => newSession.files.has(path.basename(resource.resourceUri.fsPath)));

				if (conflictingUntrackedResources.length > 0) {
					const conflictingUntrackedResourceNames = conflictingUntrackedResources
						.map(resource => this.toOpenFileNotificationLink(resource.resourceUri))
						.join(", ");
					vscode.window.showErrorMessage(`Merge conflict: delete/rename your local version of following session file(s): ${conflictingUntrackedResourceNames} before checking out the session content.`, { modal: false });
				} else {
					await this.setSession(newSession, true);
				}
			} catch (ex: unknown) {
				vscode.window.showErrorMessage((ex as Error).message ?? ex);
			}
		}
	}

	private getLocalModifiedResources(): vscode.SourceControlResourceState[] {
		return this.changedResources.resourceStates.filter(resource => !resource.decorations?.faded);
	}

	private getLocalUntrackedResources(): vscode.SourceControlResourceState[] {
		return this.changedResources.resourceStates.filter(resource => resource.decorations?.faded);
	}

	toOpenFileNotificationLink(resourceUri: vscode.Uri): string {
		return `[${path.basename(resourceUri.fsPath)}](${this.toOpenFileCommand(resourceUri)})`;
	}

	toOpenFileCommand(resourceUri: vscode.Uri): string {
		return encodeURI('command:vscode.open?' + JSON.stringify([resourceUri.toString()]));
	}

	private async setSession(newSession: SessionContent, overwrite: boolean): Promise<void> {
		if (newSession.versionDate > this.latestSessionVersionDate) { this.latestSessionVersionDate = newSession.versionDate; }
		this.session = newSession;
		if (overwrite) { this.resetFilesToCheckedOutVersion(); } // overwrite local file content
		this._onRepositoryChange.fire(this.session);
		await this.updateChangedGroup();
		await this.saveWorkspaceSettings();

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

	/** Saves setting of eligible session plugins to workspace configuration. */
	async saveWorkspaceSettings(): Promise<void> {
		if (this.session.plugins.has(PLANNING_AS_A_SERVICE_PLUGIN_NAME)) {
			const solver = this.session.plugins.get(PLANNING_AS_A_SERVICE_PLUGIN_NAME);
			if (solver?.url !== "/plugins/featured/paas/plugin.js") { return; }

			const solverUrl = solver.settings["PASURL"] + '/package';
			const configuration = new PlanningAsAServiceProvider([]).createPlannerConfiguration(solverUrl);
			configuration.title += ' - from session';

			await vscode.workspace.getConfiguration(CONF_PDDL, this.workspaceFolder.uri)
				.update(CONF_PLANNERS, [configuration], vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.getConfiguration(CONF_PDDL, this.workspaceFolder.uri)
				.update(CONF_SELECTED_PLANNER, configuration.title, vscode.ConfigurationTarget.WorkspaceFolder);
		} else if (this.session.plugins.has(SOLVER_PLUGIN_NAME)) {
			const solver = this.session.plugins.get(SOLVER_PLUGIN_NAME);
			if (solver?.url !== "/plugins/solver.js") { return; }

			const solverUrl = solver.settings["url"] + "/solve";
			const configuration = new SolveServicePlannerProvider([]).createPlannerConfiguration(solverUrl);
			configuration.title += ' - from obsolete session';

			await vscode.workspace.getConfiguration(CONF_PDDL, this.workspaceFolder.uri)
				.update(CONF_PLANNERS, [configuration], vscode.ConfigurationTarget.WorkspaceFolder);
			await vscode.workspace.getConfiguration(CONF_PDDL, this.workspaceFolder.uri)
				.update(CONF_SELECTED_PLANNER, configuration.title, vscode.ConfigurationTarget.WorkspaceFolder);
		}
	}

	/**
	 * Refresh is used when the information on the server may have changed.
	 * For example another user updates the session files online.
	 */
	async refresh(): Promise<void> {
		this.setRefreshing(true);

		try {
			const sessionCheckResult = await checkSession(this.session.getHash());
			this.latestSessionVersionDate = sessionCheckResult[1];
		} catch (ex) {
			// typically the ex.statusCode == 404, when there is no further version
		}

		await this.updateChangedGroup();

		this.setRefreshing(false);
	}

	get onRepositoryChange(): vscode.Event<SessionContent> {
		return this._onRepositoryChange.event;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	onResourceChange(_uri: vscode.Uri): void {
		if (this.timeout) { clearTimeout(this.timeout); }
		this.timeout = setTimeout(() => this.tryUpdateChangedGroup(), 500);
	}

	async tryUpdateChangedGroup(): Promise<void> {
		try {
			await this.updateChangedGroup();
		}
		catch (ex: unknown) {
			vscode.window.showErrorMessage((ex as Error).message ?? ex);
		}
	}

	/** Refreshes the list of changed resources under this version control. */
	async updateChangedGroup(): Promise<void> {
		// for simplicity we ignore which document was changed in this event and scan all of them
		const changedResources: vscode.SourceControlResourceState[] = [];

		const uris = this.provideSourceControlledResources();

		const otherFolderFiles: string[] = await this.getLocalFileNames();

		for (const uri of uris) {
			let state: ChangedResourceState | undefined;

			if (await exists(uri)) {
				const document = await vscode.workspace.openTextDocument(uri);
				if (this.isDirty(document)) {
					state = ChangedResourceState.Dirty;
				}
				otherFolderFiles.splice(otherFolderFiles.indexOf(path.basename(uri.fsPath)), 1);
			}
			else {
				state = ChangedResourceState.Deleted;
			}

			if (state) {
				const resourceState = this.toSourceControlResourceState(uri, state);
				changedResources.push(resourceState);
			}
		}

		for (const otherFile of otherFolderFiles) {
			const resourceUri = vscode.Uri.joinPath(this.getWorkspaceFolder().uri, otherFile);
			const fileStats = await vscode.workspace.fs.stat(resourceUri);
			if (fileStats.type === vscode.FileType.Directory) { continue; }

			// add this file as a new file to the session changed resources
			const resourceState = this.toSourceControlResourceState(resourceUri, ChangedResourceState.New);
			changedResources.push(resourceState);
		}

		this.changedResources.resourceStates = changedResources;
		this.sessionScm.count = this.changedResources.resourceStates.length;

		// force refreshing of the status-bar commands
		this.refreshStatusBar();
	}

	/**
	 * Enumerates the resources under source control.
	 */
	provideSourceControlledResources(): vscode.Uri[] {
		return [...this.session.files.keys()]
			.map(fileName => this.sessionRepository.createLocalResourceUri(fileName));
	}

	async getLocalFileNames(): Promise<string[]> {
		const children: [string, vscode.FileType][]
			= await vscode.workspace.fs.readDirectory(this.getWorkspaceFolder().uri);

		return children
			// keep only files, not directories
			.filter(fileEnt => fileEnt[1] === vscode.FileType.File)
			.map(fileEnt => fileEnt[0])
			// keep only pddl files, exclude the config file
			.filter(fileName => fileName !== CONFIGURATION_FILE)
			// keep only pddl files, exclude VS Code workspace file
			.filter(fileName => !fileName.endsWith('.code-workspace'));
	}

	/** Determines whether the resource is different, regardless of line endings. */
	isDirty(doc: vscode.TextDocument): boolean {
		const originalText = this.session.files.get(path.basename(doc.uri.fsPath));
		return originalText?.replace('\r', '') !== doc.getText().replace('\r', '');
	}

	setRefreshing(isRefreshing: boolean): void {
		this.isRefreshing = isRefreshing;
		this.refreshStatusBar();
	}

	toSourceControlResourceState(docUri: vscode.Uri, state: ChangedResourceState): vscode.SourceControlResourceState {

		const repositoryUri = this.sessionRepository.provideOriginalResource(docUri, new vscode.CancellationTokenSource().token);

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
				tooltip = '';
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

		const resourceState: vscode.SourceControlResourceState = {
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
	 * @param downloadIt if _true_, session files are downloaded after the session is duplicated
	 * @returns new session hash
	 */
	async duplicateAsWritable(targetLocalFolder: vscode.Uri, downloadIt: boolean): Promise<string> {
		try {
			const currentSession = await this.getCurrentSession();
			const newSessionWriteHash: string = await duplicateSession(currentSession);

			if (downloadIt) {
				// trigger the command to download the new session
				vscode.commands.executeCommand(SESSION_COMMAND_LOAD, newSessionWriteHash, targetLocalFolder);
			}

			return newSessionWriteHash;
		} catch (ex: unknown) {
			throw new Error("Failed creating duplicate session in Planning.Domains. " + ((ex as Error).message ?? ex));
		}
	}

	dispose(): void {
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

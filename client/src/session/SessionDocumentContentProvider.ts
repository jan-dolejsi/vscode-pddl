/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

 import { CancellationToken, ProviderResult, TextDocumentContentProvider, Event, Uri, EventEmitter, Disposable, WorkspaceFolder } from "vscode";
import { SessionContent, SessionRepository } from "./SessionRepository";
import { basename } from "path";

/**
 * Provides the content of the Planning.Domains session documents as fetched from the server i.e. without the local edits.
 * This is used for the source control diff.
 */
export class SessionDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();

	// map of workspace folders (key is Uri::toString()) and the checked-out sessions content
	private sessions = new Map<string, SessionContent>();

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	updated(folder: WorkspaceFolder, newSession: SessionContent): void {
		this.sessions.set(folder.uri.toString(), newSession);

		// let's assume all documents actually changed and notify the quick-diff
		newSession.files.forEach((_, fileName) => {
			const uri = SessionRepository.createDocumentUri(folder.uri, fileName);
			this._onDidChange.fire(uri);
		});
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) { return "Canceled"; }

		const folderUri = Uri.file(uri.path);

		// if the file is in a sub-folder, it is not member of the session
		if (uri.query.includes('/')) { return undefined; }

		const fileName = basename(uri.query);

		const session = this.sessions.get(folderUri.toString());
		if (!session) { return "Resource not found: " + uri.toString(); }

		return session.files.get(fileName);
	}
}
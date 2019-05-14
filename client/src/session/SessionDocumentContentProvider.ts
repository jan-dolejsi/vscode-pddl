/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

 import { CancellationToken, ProviderResult, TextDocumentContentProvider, Event, Uri, EventEmitter, Disposable } from "vscode";
import { SESSION_SCHEME, SessionContent } from "./SessionRepository";
import { basename, dirname } from "path";

/**
 * Provides the content of the Planning.Domains session documents as fetched from the server i.e.  without the local edits.
 * This is used for the source control diff.
 */
export class SessionDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private sessions = new Map<string, SessionContent>();

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	updated(newSession: SessionContent): void {
		this.sessions.set(newSession.hash, newSession);

		// let's assume all documents actually changed and notify the quick-diff
		newSession.files.forEach((_, fileName) => {
			this._onDidChange.fire(Uri.parse(`${SESSION_SCHEME}:${newSession.hash}/${fileName}`));
		});
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) { return "Canceled"; }

		let sessionId = dirname(uri.fsPath);
		let fileName = basename(uri.fsPath);
		// strip off the file extension

		let session = this.sessions.get(sessionId);
		if (!session) { return "Resource not found: " + uri.toString(); }

		return session.files.get(fileName);
	}
}
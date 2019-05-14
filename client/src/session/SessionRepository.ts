/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace } from "vscode";
import * as path from 'path';
import { compareMaps } from "../utils";
import { PlanningDomains } from "../catalog/PlanningDomains";
import { SessionConfiguration } from "./SessionConfiguration";

/** Represents one Planning.Domains session and meta-data. */
export class SessionContent implements SessionConfiguration {
	constructor(public hash: string, public writeHash: string, public versionDate: number,
		public files: Map<string, string>) { }

	static from(configuration: SessionConfiguration): SessionContent {
		return new SessionContent(configuration.hash, configuration.writeHash, configuration.versionDate, configuration.files);
	}

	canCommit(): boolean {
		return this.writeHash !== null && this.writeHash !== undefined;
	}
}

export function areIdentical(first: Map<string, string>, second: Map<string, string>): boolean {
	return compareMaps(first, second);
}

export const SESSION_SCHEME = 'planning.domains.session';

/** This binds the local and remote repository. */
export class SessionRepository implements QuickDiffProvider {

	constructor(private workspaceFolder: WorkspaceFolder, private session: SessionContent) { }

	provideOriginalResource?(uri: Uri, _: CancellationToken): ProviderResult<Uri> {
		// converts the local file uri to planning.domains.session:sessionId/file.ext
		let relativePath = workspace.asRelativePath(uri.fsPath);
		let fileName = path.basename(relativePath);
		return Uri.parse(`${SESSION_SCHEME}:${this.session.hash}/${fileName}`);
	}

	/**
	 * Enumerates the resources under source control.
	 */
	provideSourceControlledResources(): Uri[] {
		return [...this.session.files.keys()]
			.map(fileName => this.createLocalResourcePath(fileName))
			.map(filePath => Uri.file(filePath));
	}

	/**
	 * Creates a local file path in the local workspace that corresponds to the given file in the session.
	 *
	 * @param fileName session file name
	 * @returns path of the locally cloned session file
	 */
	createLocalResourcePath(fileName: string) {
		return path.join(this.workspaceFolder.uri.fsPath, fileName);
	}
}

const SESSION_URL = "http://editor.planning.domains/session/";
const SESSION_TABS_PATTERN = /"save-tabs"\s*:\s*{\s*"url"\s*:\s*"[\w:/.-]+"\s*,\s*"settings"\s*:\s*{([^}]*)/;
const SESSION_DETAILS_PATTERN = /window\.session_details\s*=\s*{\s*(?:readwrite_hash:\s*"(\w+)"\s*,\s*)?read_hash:\s*"(\w+)"\s*,\s*last_change:\s*"([\w: \(\)\+]+)",?\s*}/;

export async function getSession(sessionConfiguration: SessionConfiguration): Promise<SessionContent> {
	let url = sessionConfiguration.writeHash ?
		`${SESSION_URL}edit/${sessionConfiguration.writeHash}` :
		`${SESSION_URL}${sessionConfiguration.hash}`;

	let session_content = await PlanningDomains.getText(url);

	var sessionDate: number;
	var readWriteHash: string;
	var readOnlyHash: string;

	SESSION_DETAILS_PATTERN.lastIndex = 0;
	let matchDetails = SESSION_DETAILS_PATTERN.exec(session_content);
	if (matchDetails) {
		readWriteHash = matchDetails[1];
		readOnlyHash = matchDetails[2];
		sessionDate = Date.parse(matchDetails[3]);
	}
	else {
		throw new Error("Malformed saved session. Could not extract session date.");
	}

	SESSION_TABS_PATTERN.lastIndex = 0;
	let matchTabs = SESSION_TABS_PATTERN.exec(session_content);

	if (matchTabs) {
		let domainFilesString = matchTabs[1];

		let sessionJson = JSON.parse(`{${domainFilesString}}`);

		let fileNames = Object.keys(sessionJson);
		let sessionFiles = new Map<string, string>();
		fileNames.forEach(fileName => sessionFiles.set(fileName, sessionJson[fileName]));

		return new SessionContent(readOnlyHash, readWriteHash, sessionDate, sessionFiles);
	}
	else {
		throw new Error("Session saved tabs could not be parsed.");
	}
}
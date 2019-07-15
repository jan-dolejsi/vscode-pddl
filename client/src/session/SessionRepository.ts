/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { QuickDiffProvider, Uri, CancellationToken, ProviderResult, WorkspaceFolder, workspace } from "vscode";
import * as path from 'path';
import { compareMaps } from "../utils";
import { SessionConfiguration, strMapToObj, SessionMode } from "./SessionConfiguration";
import { getText, postJson, getJson } from "../httpUtils";
import { checkResponseForError } from "../catalog/PlanningDomains";

/** Represents one Planning.Domains session and meta-data. */
export class SessionContent implements SessionConfiguration {
	constructor(public readonly hash: string, public readonly writeHash: string, public readonly versionDate: number,
		public readonly files: Map<string, string>, public readonly plugins: Map<string, RawSessionPlugin>) { }

	static from(configuration: SessionConfiguration): SessionContent {
		return new SessionContent(configuration.hash, configuration.writeHash, configuration.versionDate, configuration.files, new Map());
	}

	canCommit(): boolean {
		return this.writeHash !== null && this.writeHash !== undefined;
	}

	getHash() {
		return this.writeHash || this.hash;
	}
}

export function areIdentical(first: Map<string, string>, second: Map<string, string>): boolean {
	return compareMaps(first, second);
}

export const SESSION_SCHEME = 'planning.domains.session';

/** This binds the local and remote repository. */
export class SessionRepository implements QuickDiffProvider {

	sessionHash: string;

	constructor(private readonly workspaceFolder: WorkspaceFolder, session: SessionContent) {
		this.sessionHash = session.hash;
	}

	provideOriginalResource?(uri: Uri, _: CancellationToken): ProviderResult<Uri> {
		// converts the local file uri to planning.domains.session:sessionId/file.ext
		let workspaceFolder = workspace.getWorkspaceFolder(uri);
		let fileName = workspace.asRelativePath(uri, false);
		return SessionRepository.createDocumentUri(workspaceFolder.uri, fileName);
	}

	static createDocumentUri(workspaceFolder: Uri, fileName: string): Uri {
		return workspaceFolder.with({ scheme: SESSION_SCHEME, query: fileName });
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
const SESSION_PLUGINS_PATTERN = /define\s*\(\s*function\s*\(\s*\)\s*\{\s*return\s*{\s*meta:\s*true\s*,\s*plugins\s*:\s*({[\S\s]*})\s*}\s*}\s*\);/ms;
const SESSION_DETAILS_PATTERN = /window\.session_details\s*=\s*{\s*(?:readwrite_hash:\s*"(\w+)"\s*,\s*)?read_hash:\s*"(\w+)"\s*,\s*last_change:\s*"([\w: \(\)\+]+)",?\s*};/;

/**
 * Tests whether the session exists, determines whether it is writable and what is the last change time.
 * @param sessionId session read/write hash code
 * @throws error when session does not exist, or session type is not recognized
 */
export async function checkSession(sessionId: string): Promise<[SessionMode, number]> {
	let url = `${SESSION_URL}check/${sessionId}`;

	let response = await getJson(url);

	checkResponseForError(response);

	var sessionMode: SessionMode;
	switch ((<string>response["type"]).toLowerCase()) {
		case "read":
			sessionMode = SessionMode.READ_ONLY;
			break;
		case "readwrite":
			sessionMode = SessionMode.READ_WRITE;
			break;
		default:
			throw new Error("Unexpected session type: " + response["type"]);
	}

	// last_change contains last session change time (round it down to seconds)
	let sessionVersionDate: number = Math.floor(Date.parse(response["last_change"]) / 1000) * 1000;

	return [sessionMode, sessionVersionDate];
}

export async function getSession(sessionConfiguration: SessionConfiguration): Promise<SessionContent> {
	let rawSession = await getRawSession(sessionConfiguration);
	let savedTabsJson = JSON.parse(rawSession.domainFilesAsString);

	let fileNames = Object.keys(savedTabsJson);
	let sessionFiles = new Map<string, string>();
	fileNames.forEach(fileName => sessionFiles.set(fileName, savedTabsJson[fileName]));

	return new SessionContent(rawSession.readOnlyHash, rawSession.readWriteHash, rawSession.sessionDate, sessionFiles, rawSession.plugins);
}

function createSessionContent(pluginDefinitions: any): string {
	let sessionDefinitionAsString = JSON.stringify(pluginDefinitions, null, 4);
	return `// Put this file online somewhere and import it as a plugin

	define(function () {
    return {
        meta: true,
		plugins:
${sessionDefinitionAsString}
	}
});
`;
}

export async function uploadSession(session: SessionContent): Promise<SessionContent> {
	if (!session.writeHash) { throw new Error("Check if the session is writable first."); }

	let rawLatestSession = await getRawSession(session);

	// re-place the saved tabs in the plugins
	let newPluginList = [...rawLatestSession.plugins.keys()]
		.map(oldPluginName => {
			let oldPlugin = rawLatestSession.plugins.get(oldPluginName);
			let newPlugin: RawSessionPlugin;
			if (oldPlugin.name === SAVE_TABS_PLUGIN_NAME) {
				newPlugin = {
					name: oldPlugin.name,
					url: oldPlugin.url,
					settings: strMapToObj(session.files),
					settingsAsString: undefined
				};
			} else {
				newPlugin = oldPlugin;
			}
			return newPlugin;
		});

	// re-construct the session plugin definition
	var newPlugins = Object.create(null);
	newPluginList.forEach(plugin => {
		let newPlugin = Object.create(null);
		newPlugin["url"] = plugin.url;
		newPlugin["settings"] = plugin.settings;
		newPlugins[plugin.name] = newPlugin;
	});

	let newContent = createSessionContent(newPlugins);

	var postBody = Object.create(null);
	postBody["content"] = newContent;
	postBody["read_hash"] = session.hash;
	postBody["readwrite_hash"] = session.writeHash;

	let url = `${SESSION_URL}${session.writeHash}`;

	let postResult = await postJson(url, postBody);

	if (postResult["error"]) {
		throw new Error(postResult["message"]);
	}

	// get the latest session
	return getSession(session);
}

export async function duplicateSession(session: SessionContent): Promise<string> {
	let rawLatestOrigSession = await getRawSession(session);

	// replace the session files
	let newFilesAsString = JSON.stringify(strMapToObj(session.files), null, 4);
	let newContent = rawLatestOrigSession.sessionContent
		.replace(rawLatestOrigSession.sessionDetails, '') // strip the window.session.details= assignment
		.replace(rawLatestOrigSession.domainFilesAsString, newFilesAsString);

	var postBody = Object.create(null);
	postBody["content"] = newContent;

	let postResult = await postJson(SESSION_URL, postBody);

	if (postResult["error"]) {
		throw new Error(postResult["message"]);
	}

	// get the latest session
	return postResult["result"]["readwrite_hash"];
}

const SAVE_TABS_PLUGIN_NAME = "save-tabs";
const SOLVER_PLUGIN_NAME = "solver";

/**
 * Fetches session from the planning.domains server.
 * @param sessionConfiguration session identity
 */
async function getRawSession(sessionConfiguration: SessionConfiguration): Promise<RawSession> {
	let url = sessionConfiguration.writeHash ?
		`${SESSION_URL}edit/${sessionConfiguration.writeHash}` :
		`${SESSION_URL}${sessionConfiguration.hash}`;

	let sessionContent = await getText(url);

	if (sessionContent.match(/not found/i)) {
		throw new Error(`Session ${sessionConfiguration.writeHash || sessionConfiguration.hash} not found.`);
	}

	var sessionDetails: string;
	var sessionDate: number;
	var readWriteHash: string;
	var readOnlyHash: string;

	SESSION_DETAILS_PATTERN.lastIndex = 0;
	let matchDetails = SESSION_DETAILS_PATTERN.exec(sessionContent);
	if (matchDetails) {
		sessionDetails = matchDetails[0];
		readWriteHash = matchDetails[1];
		readOnlyHash = matchDetails[2];
		sessionDate = Date.parse(matchDetails[3]);
	}
	else {
		console.log("Malformed saved session. Could not extract session date. Session content:" + sessionContent);
		throw new Error("Malformed saved session. Could not extract session date.");
	}

	// extract plugins
	let plugins = new Map<string, RawSessionPlugin>();
	SESSION_PLUGINS_PATTERN.lastIndex = 0;
	let pluginsMatch = SESSION_PLUGINS_PATTERN.exec(sessionContent);
	if (pluginsMatch = SESSION_PLUGINS_PATTERN.exec(sessionContent)) {
		let rawPlugins = JSON.parse(pluginsMatch[1]);

		[SAVE_TABS_PLUGIN_NAME, SOLVER_PLUGIN_NAME].forEach(pluginName => {
			if (rawPlugins.hasOwnProperty(pluginName)) {
				plugins.set(pluginName, toRawSessionPlugin(pluginName, rawPlugins[pluginName]));
			}
		});
	}
	else {
		console.log("Malformed saved session plugins. Could not extract session plugins. Session content:" + sessionContent);
		throw new Error("Malformed saved session. Could not extract session plugins.");
	}

	if (!plugins.has(SAVE_TABS_PLUGIN_NAME)) {
		throw new Error("Saved session contains no saved tabs.");
	}

	var domainFilesString = plugins.get(SAVE_TABS_PLUGIN_NAME).settingsAsString;

	return {
		sessionDetails: sessionDetails,
		sessionContent: sessionContent,
		sessionDate: sessionDate,
		readOnlyHash: readOnlyHash,
		readWriteHash: readWriteHash,
		domainFilesAsString: domainFilesString,
		plugins: plugins,
	};
}

/** Session in its raw - freshly downloaded form. */
interface RawSession {
	readonly sessionDetails: string;
	readonly sessionContent: string;
	readonly sessionDate: number;
	readonly readWriteHash: string;
	readonly readOnlyHash: string;
	readonly domainFilesAsString: string;
	readonly plugins: Map<string, RawSessionPlugin>;
}

function toRawSessionPlugin(name: string, json: any): RawSessionPlugin {
	return {
		name: name,
		url: json["url"],
		settings: json["settings"],
		settingsAsString: JSON.stringify(json["settings"], null, 4)
	};
}

interface RawSessionPlugin {
	readonly name: string;
	readonly url: string;
	readonly settingsAsString: string;
	readonly settings: any;
}
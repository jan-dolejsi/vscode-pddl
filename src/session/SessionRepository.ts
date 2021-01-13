/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { QuickDiffProvider, Uri, CancellationToken, WorkspaceFolder, workspace } from "vscode";
import { utils } from "pddl-workspace";
import * as path from 'path';
import { compareMaps, throwForUndefined, assertDefined } from "../utils";
import { SessionConfiguration, SessionMode } from "./SessionConfiguration";
import { getText, postJson, getJson } from "../httpUtils";
import { checkResponseForError } from "../catalog/PlanningDomains";

/** Represents one Planning.Domains session and meta-data. */
export class SessionContent implements SessionConfiguration {
	constructor(public readonly hash: string | undefined, public readonly writeHash: string | undefined, public readonly versionDate: number,
		public readonly files: Map<string, string>, public readonly plugins: Map<string, RawSessionPlugin>) { }

	static from(configuration: SessionConfiguration, versionDate: number): SessionContent {
		if (configuration.files === undefined) {
			throw new Error("Failed assertion: SessionConfiguration.files undefined");
		}
		return new SessionContent(configuration.hash, configuration.writeHash, versionDate, configuration.files, new Map());
	}

	canCommit(): boolean {
		return this.writeHash !== null && this.writeHash !== undefined;
	}

	getHash(): string {
		return this.writeHash ?? this.hash ?? throwForUndefined("One of read/write hash codes must be set.");
	}
}

export function areIdentical(first: Map<string, string>, second: Map<string, string>): boolean {
	return compareMaps(first, second);
}

export const SESSION_SCHEME = 'planning.domains.session';

/** This binds the local and remote repository. */
export class SessionRepository implements QuickDiffProvider {

	private sessionHash: string;

	constructor(private readonly workspaceFolder: WorkspaceFolder, session: SessionContent) {
		this.sessionHash = session.getHash();
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	provideOriginalResource(uri: Uri, _: CancellationToken): Uri | undefined {
		// converts the local file uri to planning.domains.session:sessionId/file.ext
		const workspaceFolder = workspace.getWorkspaceFolder(uri);
		if (workspaceFolder) {
			const fileName = workspace.asRelativePath(uri, false);
			return SessionRepository.createDocumentUri(workspaceFolder.uri, fileName);
		}
		else {
			return undefined;
		}
	}

	static createDocumentUri(workspaceFolder: Uri, fileName: string): Uri {
		return workspaceFolder.with({ scheme: SESSION_SCHEME, query: fileName });
	}

	/**
	 * Creates a local file path in the local workspace that corresponds to the given file in the session.
	 *
	 * @param fileName session file name
	 * @returns path of the locally cloned session file
	 * @deprecated use createLocalResourceUri
	 */
	createLocalResourcePath(fileName: string): string {
		return path.join(this.workspaceFolder.uri.fsPath, fileName);
	}

	/**
	 * Creates a local file URI in the local workspace that corresponds to the given file in the session.
	 *
	 * @param fileName session file name
	 * @returns URI of the locally cloned session file
	 */
	createLocalResourceUri(fileName: string): Uri {
		return Uri.joinPath(this.workspaceFolder.uri, fileName);
	}

	/**
	 * Returns write or read session hash
	 */
	getSessionHash(): string {
		return this.sessionHash;
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
	const url = `${SESSION_URL}check/${sessionId}`;

	const response = await getJson(url);

	checkResponseForError(response);

	let sessionMode: SessionMode;
	switch ((response["type"] as string).toLowerCase()) {
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
	const sessionVersionDate: number = Math.floor(Date.parse(response["last_change"]) / 1000) * 1000;

	return [sessionMode, sessionVersionDate];
}

export async function getSession(sessionConfiguration: SessionConfiguration): Promise<SessionContent> {
	const rawSession = await getRawSession(sessionConfiguration);
	const savedTabsJson = JSON.parse(rawSession.domainFilesAsString);

	const fileNames = Object.keys(savedTabsJson);
	const sessionFiles = new Map<string, string>();
	fileNames.forEach(fileName => sessionFiles.set(fileName, savedTabsJson[fileName]));

	return new SessionContent(rawSession.readOnlyHash, rawSession.readWriteHash, rawSession.sessionDate, sessionFiles, rawSession.plugins);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSessionContent(pluginDefinitions: any): string {
	const sessionDefinitionAsString = JSON.stringify(pluginDefinitions, null, 4);
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

	const rawLatestSession = await getRawSession(session);

	// re-place the saved tabs in the plugins
	const newPluginList = [...rawLatestSession.plugins.keys()]
		.map(oldPluginName => {
			const oldPlugin = rawLatestSession.plugins.get(oldPluginName)!;
			let newPlugin: RawSessionPlugin;
			if (oldPlugin.name === SAVE_TABS_PLUGIN_NAME) {
				newPlugin = {
					name: oldPlugin.name,
					url: oldPlugin.url,
					settings: utils.serializationUtils.strMapToObj(session.files),
					settingsAsString: undefined
				};
			} else {
				newPlugin = oldPlugin;
			}
			return newPlugin;
		});

	// re-construct the session plugin definition
	const newPlugins = Object.create(null);
	newPluginList.forEach(plugin => {
		const newPlugin = Object.create(null);
		newPlugin["url"] = plugin.url;
		newPlugin["settings"] = plugin.settings;
		newPlugins[plugin.name] = newPlugin;
	});

	const newContent = createSessionContent(newPlugins);

	const postBody = Object.create(null);
	postBody["content"] = newContent;
	postBody["read_hash"] = session.hash;
	postBody["readwrite_hash"] = session.writeHash;

	const url = `${SESSION_URL}${session.writeHash}`;

	const postResult = await postJson(url, postBody);

	if (postResult["error"]) {
		throw new Error(postResult["message"]);
	}

	// get the latest session
	return getSession(session);
}

export async function duplicateSession(session: SessionContent): Promise<string> {
	const rawLatestOrigSession = await getRawSession(session);

	// replace the session files
	const newFilesAsString = JSON.stringify(utils.serializationUtils.strMapToObj(session.files), null, 4);
	const newContent = rawLatestOrigSession.sessionContent
		.replace(rawLatestOrigSession.sessionDetails, '') // strip the window.session.details= assignment
		.replace(rawLatestOrigSession.domainFilesAsString, newFilesAsString);

	const postBody = Object.create(null);
	postBody["content"] = newContent;

	const postResult = await postJson(SESSION_URL, postBody);

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
	const url = sessionConfiguration.writeHash ?
		`${SESSION_URL}edit/${sessionConfiguration.writeHash}` :
		`${SESSION_URL}${sessionConfiguration.hash}`;

	const sessionContent = await getText(url);

	if (sessionContent.match(/not found/i)) {
		throw new Error(`Session ${sessionConfiguration.writeHash ?? sessionConfiguration.hash} not found.`);
	}

	let sessionDetails: string;
	let sessionDate: number;
	let readWriteHash: string;
	let readOnlyHash: string;

	SESSION_DETAILS_PATTERN.lastIndex = 0;
	const matchDetails = SESSION_DETAILS_PATTERN.exec(sessionContent);
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
	const plugins = new Map<string, RawSessionPlugin>();
	SESSION_PLUGINS_PATTERN.lastIndex = 0;
	let pluginsMatch = SESSION_PLUGINS_PATTERN.exec(sessionContent);
	if (pluginsMatch = SESSION_PLUGINS_PATTERN.exec(sessionContent)) {
		const rawPlugins = JSON.parse(pluginsMatch[1]);

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

	const domainFilesString = plugins.get(SAVE_TABS_PLUGIN_NAME)!.settingsAsString;

	return {
		sessionDetails: sessionDetails,
		sessionContent: sessionContent,
		sessionDate: sessionDate,
		readOnlyHash: readOnlyHash,
		readWriteHash: readWriteHash,
		domainFilesAsString: assertDefined(domainFilesString, "save-tabs plugin settings"),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	readonly settingsAsString: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly settings: any;
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { WorkspaceFolder, Uri, workspace } from "vscode";
import { utils } from "pddl-workspace";
import { exists } from "../util/workspaceFs";

export const CONFIGURATION_FILE = '.planning.domains.session.json';

/** Schema for stored session repo identity and version. */
export interface SessionConfiguration {
	readonly hash?: string;
	readonly writeHash?: string;
	readonly versionDate?: number;
	readonly files?: Map<string, string>;
}

export enum SessionMode { READ_ONLY, READ_WRITE }

export function toSessionConfiguration(id: string, mode: SessionMode): SessionConfiguration {
	let sessionConfiguration: SessionConfiguration;

	switch (mode) {
		case SessionMode.READ_ONLY:
			sessionConfiguration = { hash: id };
			break;
		case SessionMode.READ_WRITE:
			sessionConfiguration = { writeHash: id };
			break;
	}

	return sessionConfiguration;
}

function toConfigurationFileUri(folder: WorkspaceFolder): Uri {
	return Uri.joinPath(folder.uri, CONFIGURATION_FILE);
}

export async function isSessionFolder(folder: WorkspaceFolder): Promise<boolean> {
	const configurationUri = toConfigurationFileUri(folder);
	return exists(configurationUri);
}

export async function readSessionConfiguration(folder: WorkspaceFolder): Promise<SessionConfiguration> {
	const configurationPath = toConfigurationFileUri(folder);
	const data = await workspace.fs.readFile(configurationPath);
	return JSON.parse(data.toString(), (key, value) => {
		if (key === "files") {
			return utils.serializationUtils.objToStrMap(value);
		}
		else if (key ==="versionDate"){
			return Date.parse(value);
		}
		else {
			return value;
		}
	}) as SessionConfiguration;
}

export async function saveConfiguration(workspaceFolderUri: Uri, sessionConfiguration: SessionConfiguration): Promise<void> {
	const sessionConfigurationString = JSON.stringify(sessionConfiguration, (name, val) => {
		if (name === "files") {
			return utils.serializationUtils.strMapToObj(val);
		}
		else if (name === "versionDate"){
			return new Date(val).toISOString();
		}
		else {
			return val;
		}
	}, 4);

	return workspace.fs.writeFile(Uri.joinPath(workspaceFolderUri, CONFIGURATION_FILE), Buffer.from(sessionConfigurationString, 'utf8'));
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { WorkspaceFolder, Uri } from "vscode";
import { utils } from 'pddl-workspace';
import * as path from 'path';
import { strMapToObj, objToStrMap } from "../utils";

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
	var sessionConfiguration: SessionConfiguration;

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

function toConfigurationFilePath(folder: WorkspaceFolder): string {
	return path.join(folder.uri.fsPath, CONFIGURATION_FILE);
}

export async function isSessionFolder(folder: WorkspaceFolder): Promise<boolean> {
	const configurationPath = toConfigurationFilePath(folder);
	return utils.afs.exists(configurationPath);
}

export async function readSessionConfiguration(folder: WorkspaceFolder): Promise<SessionConfiguration> {
	const configurationPath = toConfigurationFilePath(folder);
	let data = await utils.afs.readFile(configurationPath, { flag: 'r' });
	return <SessionConfiguration>JSON.parse(data.toString("utf-8"), (key, value) => {
		if (key === "files") {
			return objToStrMap(value);
		}
		else if (key ==="versionDate"){
			return Date.parse(value);
		}
		else {
			return value;
		}
	});
}

export async function saveConfiguration(workspaceFolderUri: Uri, sessionConfiguration: SessionConfiguration): Promise<void> {
	let sessionConfigurationString = JSON.stringify(sessionConfiguration, (name, val) => {
		if (name === "files") {
			return strMapToObj(val);
		}
		else if (name === "versionDate"){
			return new Date(val).toISOString();
		}
		else {
			return val;
		}
	}, 4);

	return utils.afs.writeFile(path.join(workspaceFolderUri.fsPath, CONFIGURATION_FILE), sessionConfigurationString);
}

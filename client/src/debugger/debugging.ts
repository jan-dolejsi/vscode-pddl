import { DebuggingSessionFiles } from './DebuggingSessionFiles';

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken, window, Uri } from 'vscode';
import { PlanDebugSession } from './PlanDebugSession';
import * as Net from 'net';
import { HAPPENINGS } from '../../../common/src/parser';
import { FileInfo } from '../../../common/src/FileInfo';
import { HappeningsInfo } from "../../../common/src/HappeningsInfo";
import { PddlWorkspace } from '../../../common/src/workspace-model';
import { toLanguage, isHappenings, getDomainAndProblemForHappenings } from '../utils';
import { PddlConfiguration } from '../configuration';
import { HappeningsExecutor } from './HappeningsExecutor';

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;

export class Debugging {

	constructor(context: vscode.ExtensionContext, private pddlWorkspace: PddlWorkspace, public plannerConfiguration: PddlConfiguration) {

		context.subscriptions.push(vscode.commands.registerCommand('extension.mock-debug.getProgramName', config => {
			config;
			return vscode.window.showInputBox({
				placeHolder: "Please enter the name of a markdown file in the workspace folder",
				value: "readme.md"
			});
		}));

		// register a configuration provider for 'pddl-plan' debug type
		const provider = new PddlPlanDebugConfigurationProvider()
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('pddl-plan', provider));
		context.subscriptions.push(provider);

		context.subscriptions.push(vscode.commands.registerCommand('pddl.happenings.debug', () => {
			return this.startDebugging();
		}));

		context.subscriptions.push(vscode.commands.registerTextEditorCommand("pddl.happenings.execute", async (editor) => {
			let context = await this.getActiveContext();
			return new HappeningsExecutor(editor, context, this.plannerConfiguration).execute();
		}));
	}

	async getActiveContext(): Promise<DebuggingSessionFiles> {

		if (!window.activeTextEditor) {
			window.showErrorMessage('There is no file active in the editor.');
			return null;
		}

		if (!isHappenings(window.activeTextEditor.document)) {
			window.showErrorMessage('Active document is not debuggable.');
			return null;
		}

		// ensure the current document is saved
		await window.activeTextEditor.document.save();

		let activeFileInfo = this.upsertAndParseFile(window.activeTextEditor.document);

		if (!(activeFileInfo instanceof HappeningsInfo)) {
			window.showErrorMessage('Active document is not debuggable.');
			return null;
		}

		let happeningsInfo = <HappeningsInfo>activeFileInfo;

		let context = getDomainAndProblemForHappenings(happeningsInfo, this.pddlWorkspace);

		return {
			domain: context.domain,
			problem: context.problem,
			happenings: happeningsInfo
		};
	}

	upsertAndParseFile(textDocument: vscode.TextDocument): FileInfo {
		return this.pddlWorkspace.upsertAndParseFile(textDocument.uri.toString(),
			toLanguage(textDocument),
			textDocument.version, textDocument.getText());
	}

	async startDebugging() {

		let context = await this.getActiveContext();

		let folder: WorkspaceFolder = undefined; // so far there is no configuration to resolve
		let debugConfiguration: vscode.DebugConfiguration = {
			"name": "PDDL Plan Happenings F5",
			"type": "pddl-plan",
			"request": "launch",
			"program": Uri.parse(context.happenings.fileUri).fsPath,
			"domain": Uri.parse(context.domain.fileUri).fsPath,
			"problem": Uri.parse(context.problem.fileUri).fsPath
		};

		await vscode.debug.startDebugging(folder, debugConfiguration);
	}
}

class PddlPlanDebugConfigurationProvider implements vscode.DebugConfigurationProvider {

	private _server?: Net.Server;

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		folder; token;
		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === HAPPENINGS) {
				config.type = 'pddl-plan';
				config.name = 'Launch';
				config.request = 'launch';
				config.program = '${file}';
				config.domain = 'domain.pddl';
				config.problem = '${fileBasenameNoExtension}.pddl'
				config.stopOnEntry = true;
			}
		}

		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		if (EMBED_DEBUG_ADAPTER) {
			// start port listener on launch of first debug session
			if (!this._server) {

				// start listening on a random port
				this._server = Net.createServer(socket => {
					const session = new PlanDebugSession();
					session.setRunAsServer(true);
					session.start(<NodeJS.ReadableStream>socket, socket);
				}).listen(0);
			}

			// make VS Code connect to debug server instead of launching debug adapter
			config.debugServer = (<Net.AddressInfo>this._server.address()).port;
		}

		return config;
	}

	dispose() {
		if (this._server) {
			this._server.close();
		}
	}
}

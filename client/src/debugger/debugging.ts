/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken, window } from 'vscode';
import { PlanDebugSession } from './PlanDebugSession';
import * as Net from 'net';

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;

export function activateDebugging(context: vscode.ExtensionContext) {

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
		return startDebugging();
	}));
}

export async function startDebugging() {

	// ensure the current document is saved
	await window.activeTextEditor.document.save();

	let folder: WorkspaceFolder = undefined; // so far there is no configuration to resolve
	let debugConfiguration: vscode.DebugConfiguration = {
		"name": "PDDL Plan Happenings F5",
		"type": "pddl-plan",
		"request": "launch",
		"program": "${file}"
	};
	let debuggingStartedConfirmation = await vscode.debug.startDebugging(folder, debugConfiguration);
	debuggingStartedConfirmation;
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
			if (editor && editor.document.languageId === 'markdown' ) {
				config.type = 'pddl-plan';
				config.name = 'Launch';
				config.request = 'launch';
				config.program = '${file}';
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
			config.debugServer = this._server.address().port;
		}

		return config;
	}

	dispose() {
		if (this._server) {
			this._server.close();
		}
	}
}

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, CancellationToken, window } from 'vscode';
import { PlanDebugSession } from './PlanDebugSession';
import * as Net from 'net';
import { HAPPENINGS } from 'pddl-workspace';
import { HappeningsInfo } from 'pddl-workspace';
import { isHappenings, getDomainAndProblemForHappenings, selectHappenings } from '../workspace/workspaceUtils';
import { PddlConfiguration } from '../configuration/configuration';
import { HappeningsExecutor } from './HappeningsExecutor';
import { DebuggingSessionFiles } from './DebuggingSessionFiles';
import { HappeningsToPlanResumeCasesConvertor } from './HappeningsToPlanResumeCasesConvertor';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;

export class Debugging {

	decorations = new Map<vscode.TextDocument, vscode.TextEditorDecorationType[]>();

	constructor(context: vscode.ExtensionContext, private pddlWorkspace: CodePddlWorkspace, public plannerConfiguration: PddlConfiguration) {

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		context.subscriptions.push(instrumentOperationAsVsCodeCommand('pddl.selectAndActivateHappenings', async(_config) => {
			return await selectHappenings();
		}));

		// register a configuration provider for 'pddl-happenings' debug type
		const provider = new PddlPlanDebugConfigurationProvider();
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('pddl-happenings', provider));
		context.subscriptions.push(provider);

		context.subscriptions.push(instrumentOperationAsVsCodeCommand('pddl.happenings.debug', () => {
			return this.startDebugging();
		}));

		context.subscriptions.push(vscode.commands.registerTextEditorCommand("pddl.happenings.execute", async (editor) => {
			try {
				this.clearDecorations(editor.document);
				const context = await this.getActiveContext();
				const decorations = await new HappeningsExecutor(editor, context, this.plannerConfiguration).execute();
				this.saveDecorations(editor.document, decorations);
			}
			catch (ex) {
				vscode.window.showErrorMessage(ex.message ?? ex);
			}
		}));

		context.subscriptions.push(vscode.commands.registerTextEditorCommand("pddl.happenings.generatePlanResumeCases", async () => {
			try {
				const context = await this.getActiveContext();
				new HappeningsToPlanResumeCasesConvertor(context, this.plannerConfiguration).generate();
			}
			catch (ex) {
				vscode.window.showErrorMessage(ex.message ?? ex);
			}
		}));

		// clear decorations, when document is updated/closed
		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(evt => this.clearDecorations(evt.document)));
		context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(d => this.clearDecorations(d)));
	}

	clearDecorations(document: vscode.TextDocument): void {
		const decorations = this.decorations.get(document);
		if (decorations) { decorations.forEach(d => d.dispose()); }
		this.decorations.set(document, []);
	}

	saveDecorations(document: vscode.TextDocument, decorations: vscode.TextEditorDecorationType[]): void {
		this.clearDecorations(document);
		this.decorations.set(document, decorations);
	}

	async getActiveContext(): Promise<DebuggingSessionFiles> {

		if (!window.activeTextEditor) {
			throw new Error('There is no file active in the editor.');
		}

		if (!isHappenings(window.activeTextEditor.document)) {
			throw new Error('Active document cannot be debugged.');
		}

		const activeFileInfo = await this.pddlWorkspace.upsertAndParseFile(window.activeTextEditor.document);

		if (!(activeFileInfo instanceof HappeningsInfo)) {
			throw new Error('Active document cannot be debugged.');
		}

		const happeningsInfo = activeFileInfo as HappeningsInfo;

		const context = getDomainAndProblemForHappenings(happeningsInfo, this.pddlWorkspace.pddlWorkspace);

		return {
			domain: context.domain,
			problem: context.problem,
			happenings: happeningsInfo
		};
	}

	async startDebugging(): Promise<void> {

		const context = await this.getActiveContext();

		let folder: WorkspaceFolder | undefined; // so far there is no configuration to resolve
		const debugConfiguration: vscode.DebugConfiguration = {
			"name": "PDDL Plan Happenings F5",
			"type": "pddl-happenings",
			"request": "launch",
			"program": context.happenings.fileUri.fsPath,
			"domain": context.domain.fileUri.fsPath,
			"problem": context.problem.fileUri.fsPath
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
	async resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration | undefined> {
		if (token?.isCancellationRequested) { return undefined; }
		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === HAPPENINGS) {
				config.type = 'pddl-happenings';
				config.name = 'PDDL: Plan Happenings (from context menu)';
				config.request = 'launch';
				config.program = '${file}';
				config.domain = 'domain.pddl';
				config.problem = '${fileBasenameNoExtension}.pddl';
				config.stopOnEntry = true;
			}
		}

		if (!config.program) {
			await vscode.window.showInformationMessage("Cannot find a program to debug");
				return undefined;	// abort launch
		}

		if (EMBED_DEBUG_ADAPTER) {
			// start port listener on launch of first debug session
			if (!this._server) {

				// start listening on a random port
				this._server = Net.createServer(socket => {
					const session = new PlanDebugSession();
					session.setRunAsServer(true);
					session.start(socket as NodeJS.ReadableStream, socket);
				}).listen(0);
			}

			// make VS Code connect to debug server instead of launching debug adapter
			config.debugServer = (this._server.address() as Net.AddressInfo).port;
		}

		return config;
	}

	dispose(): void {
		if (this._server) {
			this._server.close();
		}
	}
}

import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { SymbolRenameProvider } from '../../symbols/SymbolRenameProvider';
import { PddlWorkspace } from '../../../../common/src/PddlWorkspace';
import { CodePddlWorkspace } from '../../workspace/CodePddlWorkspace';

suite('SymbolRenameProvider Test Suite', () => {

	let tokenSource: vscode.CancellationTokenSource;

	before(async () => {
		vscode.window.showInformationMessage('Start all tests.');
		tokenSource = new vscode.CancellationTokenSource();
		// await vscode.workspace.openTextDocument({ language: 'pddl', content: 'This document forces loading of the extension.' });
	});

	testDisabled('Should not rename PDDL keywords', async () => {
		let initialText = `(define (domain domain_name)`;
		let doc = await vscode.workspace.openTextDocument({ language: 'pddl', content: initialText });

		let renameProvider = new SymbolRenameProvider(new CodePddlWorkspace(new PddlWorkspace(.3)));

		let positionZeroEdits = await renameProvider.provideRenameEdits(doc, new vscode.Position(0, 0), "asdf", tokenSource.token);
		assert.strictEqual(positionZeroEdits, null, "position 0 should have no edits");

		let positionThreeEdits = await renameProvider.provideRenameEdits(doc, new vscode.Position(0, 3), "asdf", tokenSource.token);
		assert.strictEqual(positionThreeEdits, null, "position 3 should have no edits");
	});

	testDisabled('Should rename PDDL type', async () => {
		let initialText = `(define (domain domain_name) (:types type1))`;
		let doc = await vscode.workspace.openTextDocument({ language: 'pddl', content: initialText });

		let renameProvider = new SymbolRenameProvider(new CodePddlWorkspace(new PddlWorkspace(.3)));

		let typeEdits = await renameProvider.provideRenameEdits(doc, new vscode.Position(0, 40), "asdf", tokenSource.token);
		assert.strictEqual(typeEdits.size, 1);
	});

});

function testDisabled(_name: string, _callback: any) {}

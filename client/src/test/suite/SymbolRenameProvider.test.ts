import * as assert from 'assert';
import { expect } from 'chai';
import { before } from 'mocha';

import * as vscode from 'vscode';
import { SymbolRenameProvider } from '../../symbols/SymbolRenameProvider';
import { PddlWorkspace } from 'pddl-workspace';
import { CodePddlWorkspace } from '../../workspace/CodePddlWorkspace';

suite('SymbolRenameProvider Test Suite', () => {

	let tokenSource: vscode.CancellationTokenSource;

	before(async () => {
		vscode.window.showInformationMessage('Start all tests.');
		tokenSource = new vscode.CancellationTokenSource();
		// await vscode.workspace.openTextDocument({ language: 'pddl', content: 'This document forces loading of the extension.' });
	});

	test('Should not rename PDDL keywords', async () => {
		const initialText = `(define (domain domain_name)`;
		const doc = await vscode.workspace.openTextDocument({ language: 'pddl', content: initialText });

		const renameProvider = new SymbolRenameProvider(CodePddlWorkspace.getInstanceForTestingOnly(new PddlWorkspace(.3)));

		// tslint:disable-next-line: no-unused-expression
		expect(async () => {
			const positionZeroEdits =
				await renameProvider.provideRenameEdits(doc, new vscode.Position(0, 0), "asdf", tokenSource.token);
			assert.strictEqual(positionZeroEdits, null, "position 0 should have no edits");
		}).to.throw;

		// tslint:disable-next-line: no-unused-expression
		expect(async () => {
			const positionThreeEdits =
				await renameProvider.provideRenameEdits(doc, new vscode.Position(0, 3), "asdf", tokenSource.token);
			assert.strictEqual(positionThreeEdits, null, "position 3 should have no edits");
		}).to.throw;
	});

	test('Should rename PDDL type', async () => {
		const initialText = `(define (domain domain_name) (:types type1))`;
		const doc = await vscode.workspace.openTextDocument({ language: 'pddl', content: initialText });

		const renameProvider = new SymbolRenameProvider(CodePddlWorkspace.getInstanceForTestingOnly(new PddlWorkspace(.3)));

		const typeEdits = await renameProvider.provideRenameEdits(doc, new vscode.Position(0, 40), "asdf", tokenSource.token);
		assert.strictEqual(typeEdits?.size, 1, "there should be N edits");
	});

});

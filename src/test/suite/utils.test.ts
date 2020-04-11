import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { isHttp } from '../../utils';

suite('Utils Test Suite', () => {
	before(() => {
		vscode.window.showInformationMessage('Start utils tests.');
	});

	test('isHttp', () => {
		assert.strictEqual(isHttp('http://asdf.adsf/adf'), true);
		assert.strictEqual(isHttp('https://asdf.adsf/adf'), true);
		assert.strictEqual(isHttp('c:/file.ext'), false);
		assert.strictEqual(isHttp('/file.ext'), false);
	});
});

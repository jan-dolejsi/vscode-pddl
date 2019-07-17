import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as pddlExtension from '../../extension';

suite('Extension Test Suite', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('Domain formatter test', async () => {
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file('./'));
        let editorConfiguration = vscode.workspace.getConfiguration('editor');
        editorConfiguration.update('tabSize',)
        // 'editor.tabSize' = 4
        // 'editor.insertSpaces' = 4
        // GIVEN
        let inputText = `(define (domain domain_name)
(:requirements :strips)
)`;

        vscode.workspace.getConfiguration().update("pddl.formatter", true);

        let doc = await vscode.workspace.openTextDocument({ language: 'pddl', content: inputText });
        let editor = await vscode.window.showTextDocument(doc);
        let startSelectionBefore = editor.selection.start;
        
        // todo: cursorMove command
        let documentUpdated = new Promise((resolve, reject) => {
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.fileName === doc.fileName) {
                    resolve();
                }
                else {
                    reject();
                }
            });
        });
        
        // WHEN
        await vscode.commands.executeCommand("vscode.executeFormatDocumentProvider", doc.uri);
        // mock changed document
        editor.edit(builder => builder.insert(startSelectionBefore, "mock"));
        await documentUpdated;
        
        // THEN
        let startSelectionAfter = editor.selection.start;
        let textAfter = doc.getText();
        assert.strictEqual(inputText, textAfter);
        assert.deepStrictEqual(startSelectionBefore, startSelectionAfter, "cursor position should be the same");
    });
});

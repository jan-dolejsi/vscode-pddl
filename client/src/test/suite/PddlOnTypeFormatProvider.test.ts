import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { PddlOnTypeFormatter } from '../../formatting/PddlOnTypeFormatter';
import { testDisabled, assertStrictEqualDecorated } from './testUtils';

let formatProvider: PddlOnTypeFormatter;

suite('PDDL on-type formatter Test Suite', () => {
    before(async () => {
        vscode.window.showInformationMessage('Start all tests.');
        formatProvider = new PddlOnTypeFormatter(undefined, true);
    });

    test('should indent nested text on new-line char', async () => {
        // GIVEN
        let inputTextHead = '(define ';
        let ch = '\n';
        let inputTextTail = ')';

        let expectedText = inputTextHead + ch + '\t\n' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    test('should indent nested text on new-line char in already indented line', async () => {
        // GIVEN
        let inputTextHead = '\t(define ';
        let ch = '\n';
        let inputTextTail = ')';

        let expectedText = inputTextHead + ch + '\t\t\n\t' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    test('should indent nested text on new-line char, inside 2nd level', async () => {
        // GIVEN
        let inputTextHead = '(define \n' + '\t(:requirements';
        let ch = '\n';
        let inputTextTail = ')\n)';

        let expectedText = inputTextHead + ch + '\t\t\n\t' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    test('should indent nested text on new-line char, inside action precondition', async () => {
        // GIVEN
        let inputTextHead = '(:action a \n' + '\t:precondition (and';
        let ch = '\n';
        let inputTextTail = ')\n)';

        let expectedText = inputTextHead + ch + '\t\t\n\t' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    test('should indent when adding an empty line', async () => {
        // GIVEN
        let inputTextHead = '(define \n';
        let ch = '\n';
        let inputTextTail = `)`;

        let expectedText = inputTextHead + ch + '\t\n' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    
    test('should indent when adding an empty line after 1-indented', async () => {
        // GIVEN
        let inputTextHead = '(define \n\t';
        let ch = '\n';
        let inputTextTail = `)`;

        let expectedText = inputTextHead + ch + '\t\n' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    test('should indent when adding an empty line after 2x 1-indented', async () => {
        // GIVEN
        let inputTextHead = '(define \n\t\n\t';
        let ch = '\n';
        let inputTextTail = `)`;

        let expectedText = inputTextHead + ch + '\t\n' + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });

    testDisabled('should indent nested open bracket - disabled to preserve auto-completion', async () => {
        // GIVEN
        let inputTextHead = '(define \n';
        let ch = '(';
        let inputTextTail = '\n)';

        let expectedText = inputTextHead + '\t' + ch + inputTextTail;
        await testFormatter(inputTextHead, ch, inputTextTail, expectedText, { insertSpaces: false, tabSize: 4});
    });
});

async function testFormatter(inputTextHead: string, ch: string, inputTextTail: string, expectedText: string, options: vscode.FormattingOptions): Promise<void> {
    let initialText = inputTextHead + ch + inputTextTail; 

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    let doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    let editor = await vscode.window.showTextDocument(doc);
    
    // move the cursor into the text
    let position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);
    let startSelectionBefore = editor.selection.start;
    
    // WHEN
    let edits = await formatProvider.provideOnTypeFormattingEdits(doc, position, ch, options, new vscode.CancellationTokenSource().token);
    await Promise.all(edits!.map(edit => editor.edit(builder => reBuild(builder, edit))));
    
    // THEN
    let startSelectionAfter = editor.selection.start;
    let textAfter = doc.getText();
    assertStrictEqualDecorated(textAfter, expectedText, "document text should be formatted");
    assert.deepStrictEqual(startSelectionAfter, startSelectionBefore, "cursor position should be the same");
}

function reBuild(builder: vscode.TextEditorEdit, edit: vscode.TextEdit){
    return builder.replace(edit.range, edit.newText);
}
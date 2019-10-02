import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { PddlFormatProvider } from '../../formatting/PddlFormatProvider';
import { testDisabled } from './testUtils';

let formatProvider: PddlFormatProvider;

suite('Domain formatter Test Suite', () => {
    before(async () => {
        vscode.window.showInformationMessage('Start all tests.');
        formatProvider = new PddlFormatProvider();
    });

    testDisabled('Indents requirements', async () => {
        // GIVEN
        let inputText = `(define (domain domain_name)
(:requirements                                          :strips)
)`;

        let expectedText = `(define (domain domain_name)
    (:requirements :strips)
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4});
    });

    testDisabled('Formats types', async () => {
        // GIVEN
        let inputText = `(define (domain domain_name)(:types child11 child12))`;

        let expectedText = `(define (domain domain_name)
    (:types 
        child11 child12
    )
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4});
    });

    testDisabled('Formats types with inheritance', async () => {
        // GIVEN
        let inputText = `(define (domain domain_name)(:types child11 child12 - parent1 child21 child22 - parent2))`;

        let expectedText = `(define (domain domain_name)
    (:types 
        child11 child12 - parent1
        child21 child22 - parent2
    )
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4});
    });

    testDisabled('Removes trailing whitespace', async() => {
        assert.fail('Not implemented yet');
    });
});

async function testFormatter(initialText: string, expectedText: string, options: vscode.FormattingOptions): Promise<void> {
    // we do not want the extension to actually load (it takes too much time), so use a fake language
    let doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    let editor = await vscode.window.showTextDocument(doc);
    let startSelectionBefore = editor.selection.start;
    
    // move the cursor into the text
    await vscode.commands.executeCommand("cursorMove", {to: 'right'});
    
    // WHEN
    let edits = await formatProvider.provideDocumentFormattingEdits(doc, options, new vscode.CancellationTokenSource().token);
    await Promise.all(edits.map(edit => editor.edit(builder => reBuild(builder, edit))));
    
    // THEN
    let startSelectionAfter = editor.selection.start;
    let textAfter = doc.getText();
    assert.strictEqual(textAfter, expectedText, "document text should be formatted");
    assert.deepStrictEqual(startSelectionAfter, startSelectionBefore, "cursor position should be the same");
}

function reBuild(builder: vscode.TextEditorEdit, edit: vscode.TextEdit){
    return builder.replace(edit.range, edit.newText);
}
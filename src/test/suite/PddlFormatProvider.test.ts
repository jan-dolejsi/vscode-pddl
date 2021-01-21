import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { PddlFormatProvider } from '../../formatting/PddlFormatProvider';
import { assertStrictEqualDecorated } from './testUtils';

let formatProvider: PddlFormatProvider;

/* eslint-disable @typescript-eslint/no-use-before-define */

suite('Domain formatter Test Suite', () => {
    before(async () => {
        vscode.window.showInformationMessage('Start all tests.');
        formatProvider = new PddlFormatProvider();
    });

    test('Does not modify formatted text', async () => {
        // GIVEN
        const inputText = `(define )`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Removes extra white-space', async () => {
        // GIVEN
        const inputText = `(define (domain                 domain_name))`;

        const expectedText = `(define (domain domain_name))`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test.skip('Indents requirements', async () => {
        // GIVEN
        const inputText = `(define (domain domain_name)
(:requirements :strips)
)`;

        const expectedText = `(define (domain domain_name)
    (:requirements :strips)
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test.skip('Formats types', async () => {
        // GIVEN
        const inputText = `(define (domain domain_name)(:types child11 child12))`;

        const expectedText = `(define (domain domain_name)
    (:types 
        child11 child12
    )
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test.skip('Formats types with inheritance', async () => {
        // GIVEN
        const inputText = `(define (domain domain_name)(:types child11 child12 - parent1 child21 child22 - parent2))`;

        const expectedText = `(define (domain domain_name)
    (:types 
        child11 child12 - parent1
        child21 child22 - parent2
    )
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test.skip('Removes trailing whitespace', async () => {
        assert.fail('Not implemented yet');
    });
});

async function testFormatter(initialText: string, expectedText: string, options: vscode.FormattingOptions): Promise<void> {
    // we do not want the extension to actually load (it takes too much time), so use a fake language
    const doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    const editor = await vscode.window.showTextDocument(doc);
    
    // move the cursor into the text
    await vscode.commands.executeCommand("cursorMove", { to: 'right' });
    const startSelectionBefore = editor.selection.start;
    
    // WHEN
    const edits = await formatProvider.provideDocumentFormattingEdits(doc, options, new vscode.CancellationTokenSource().token);
    if (edits) {
        await editor.edit(builder => reBuild(builder, edits));
    }
    else {
        assert.fail('no edits returned');
    }

    // THEN
    const startSelectionAfter = editor.selection.start;
    const textAfter = doc.getText();
    assertStrictEqualDecorated(textAfter, expectedText, "document text should be formatted");
    assert.deepStrictEqual(startSelectionAfter, startSelectionBefore, "cursor position should be the same");
}

function reBuild(builder: vscode.TextEditorEdit, edits: vscode.TextEdit[]): void {
    edits.forEach(edit =>
        builder.replace(edit.range, edit.newText));
}
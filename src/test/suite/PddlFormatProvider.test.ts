import * as assert from 'assert';
import { before } from 'mocha';
import { EOL } from 'os';

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

    test('Does not modify well formatted text', async () => {
        // GIVEN
        const inputText = `(define)`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Removes white space before closing bracket', async () => {
        // GIVEN
        const inputText = `(define )`;

        const expectedText = `(define)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Removes extra white-space', async () => {
        // GIVEN
        const inputText = `(define (domain                 domain_name))`;

        const expectedText = [`(define (domain domain_name)`, `)`].join(EOL);

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('does not modify comment', async () => {
        // GIVEN
        const inputText = [`(define`,
            `\t; comment`,
            `)`].join('\n');

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('does not modify flatten 2 consecutive comments', async () => {
        // GIVEN
        const inputText = [`(define`,
            `\t; comment1`,
            `\t; comment2`,
            `)`].join('\n');

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('Indents requirements', async () => {
        // GIVEN
        const inputText = `(define (domain domain_name)
(:requirements :strips)
)`;

        const expectedText = `(define (domain domain_name)
    (:requirements :strips)
)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Does not indent individual requirements', async () => {
        // GIVEN
        const inputText = `(:requirements :strips :typing)`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Does not format formatted types', async () => {
        // GIVEN
        const inputText = [`(define`,
        `    (:types`,
        `        child11 child12`,
        `    )`,
        `)`].join(EOL);

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Formats types', async () => {
        // GIVEN
        const inputText = `(define (:types child11 child12))`;

        const expectedText = [`(define`,
            `    (:types`,
            `        child11 child12`,
            `    )`,
            `)`].join(EOL);

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Formats types with a comment', async () => {
        // GIVEN
        const inputText = [
            `(define (:types child11`,
            `; comment1`,
            `child12))`
        ].join(EOL);

        const expectedText = [`(define`,
            `    (:types`,
            `        child11`,
            `        ; comment1`,
            `        child12`,
            `    )`,
            `)`].join(EOL);

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Formats types with inheritance', async () => {
        // GIVEN
        const inputText = `(define (domain domain_name)(:types child11 child12 - parent1 child21 child22 - parent2))`;

        const expectedText = [`(define (domain domain_name)`,
            `    (:types`,
            `        child11 child12 - parent1`,
            `        child21 child22 - parent2`,
            `    )`,
            `)`].join(EOL);

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });


    test('Formats constants', async () => {
        // GIVEN
        const inputText = `(define (domain domain_name)(:constants object11 object12 - type1 object21 object22 - type2))`;

        const expectedText = [`(define (domain domain_name)`,
            `    (:constants`,
            `        object11 object12 - type1`,
            `        object21 object22 - type2`,
            `    )`,
            `)`].join(EOL);

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Removes trailing whitespace (last line)', async () => {
        // GIVEN
        const inputText = `(define)               `;

        const expectedText = `(define)`;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Removes trailing whitespace', async () => {
        // GIVEN
        const inputText = [`(define (domain)\t\t`,
            `)`].join('\n');

        const expectedText = [`(define (domain)`,
            `)`].join('\n');

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Does not break line in numeric expressions', async () => {
        // GIVEN
        const inputText = `(= (f1) (f2))`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Formats numeric expression that is already broken to multiple lines', async () => {
        // GIVEN
        const inputText = `(= \n(f1)\n (f2))`;

        const expectedText = `(=\n\t(f1)\n\t(f2))`;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('Does not break line in logical expressions (not)', async () => {
        // GIVEN
        const inputText = `(not (p1))`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Does not break line in logical expressions (and)', async () => {
        // GIVEN
        const inputText = `(and (p1) (p2))`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Does not break line in temporal (at start)', async () => {
        // GIVEN
        const inputText = `(at start (p1))`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: true, tabSize: 4 });
    });

    test('Does not break action keywords', async () => {
        // GIVEN
        const inputText = [`(:action a`,
            '\t:parameters (?p1 - param1)',
            ')'
        ].join('\n');

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('Does break line before action keywords', async () => {
        // GIVEN
        const inputText = [`(:action a`,
        '\t:parameters ()',
        '\t:precondition (and)',
        ')'
        ].join('\n');

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('keeps line break before comment line', async () => {
        // GIVEN
        const inputText = [`(:functions`,
        '\t(f1)',
        '\t; (f2)',
        ')'
        ].join('\n');

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('removes excess empty lines', async () => {
        // GIVEN
        const inputText = [`(:init`,
            '\t(f1)',
            '\t',
            '     ',
            '\t(f2)',
            ')'
        ].join('\n');

        const expectedText = [`(:init`,
            '\t(f1)',
            '',
            '\t(f2)',
            ')'
        ].join('\n');

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('keeps short effects on one line', async () => {
        // GIVEN
        const inputText = `(assign (f1) 10)`;

        const expectedText = inputText;

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
    });

    test('splits long effect', async () => {
        // GIVEN
        const inputText = `(increase (ffffffffffffffffffffffffff1) (+ (gggggggggggggggggggg) 1))`;

        const expectedText = [
            `(increase`,
            `\t(ffffffffffffffffffffffffff1)`,
                `\t(+ (gggggggggggggggggggg) 1))`
        ].join(EOL);

        await testFormatter(inputText, expectedText, { insertSpaces: false, tabSize: 4 });
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
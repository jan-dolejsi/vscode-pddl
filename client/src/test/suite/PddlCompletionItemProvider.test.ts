import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { ProblemCompletionItemProvider } from '../../completion/ProblemCompletionItemProvider';
import { ProblemInfo } from '../../../../common/src/ProblemInfo';
import { PddlSyntaxTreeBuilder } from '../../../../common/src/PddlSyntaxTreeBuilder';
import { CodeDocumentPositionResolver } from '../../workspace/CodeDocumentPositionResolver';
import { UnknownPddlCompletionItemProvider } from '../../completion/UnknownPddlCompletionItemProvider';
import { DomainCompletionItemProvider } from '../../completion/DomainCompletionItemProvider';
import { PddlDomainParser } from '../../../../common/src/PddlDomainParser';

suite('PDDL Completion Item Provider', () => {
    before(async () => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('should offer to declare domain or problem', async () => {
        // GIVEN
        let inputTextHead = ' ';
        let ch = '(';
        let inputTextTail = ')';

        // WHEN
        let items = await testProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.strictEqual(items.length, 2, 'there should be N completion items');
        items.forEach(item => assert.ok(item.label.startsWith('(define')));
    });

    test('should offer to declare pre-parsing meta data instruction', async () => {
        // GIVEN
        let inputTextHead = '';
        let ch = ';';
        let inputTextTail = '\n(define (problem p) (:domain d) )';

        // WHEN
        let items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.strictEqual(items.length, 3, 'there should be N completion items');
        items.forEach(item => assert.ok(item.label.startsWith(';;')));
    });

    /* Domain keywords */

    test('should suggest domain sections upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) \n';
        let ch = '';
        let inputTextTail = '\n)';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            // '(domain',
            '(:requirements',
            '(:types',
            '(:constants',
            '(:predicates',
            '(:functions',
            '(:constraints',
            '(:action',
            '(:durative-action',
            '(:process',
            '(:event'
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest domain sections upon ( trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) \n';
        let ch = '(';
        let inputTextTail = ')\n)';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            // '(domain',
            '(:requirements',
            '(:types',
            '(:constants',
            '(:predicates',
            '(:functions',
            '(:constraints',
            '(:action',
            '(:durative-action',
            '(:process',
            '(:event'
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 2), `Range of ${item.label}`));
    });

    test('should suggest domain sections upon : trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) \n(';
        let ch = ':';
        let inputTextTail = ')\n)';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(:requirements',
            '(:types',
            '(:constants',
            '(:predicates',
            '(:functions',
            '(:constraints',
            '(:action',
            '(:durative-action',
            '(:process',
            '(:event'
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 3), `Range of '${item.label}'`));
    });

    /* Requirements */

    test('should suggest requirements upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:requirements ';
        let ch = '';
        let inputTextTail = ')\n)';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        items.some(item => (item.filterText || item.label) === ':strips');
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest requirements upon : trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:requirements ';
        let ch = ':';
        let inputTextTail = ')\n)';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        items.some(item => (item.filterText || item.label) === ':strips');
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(0, inputTextHead.length, 0, inputTextHead.length + 1), `Range of '${item.label}'`));
    });

    /* Action keywords */

    test('should suggest (:action sections upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:action\n';
        let ch = '';
        let inputTextTail = '\n))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            ':parameters',
            ':precondition',
            ':effect',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest (:action sections upon : trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:action\n';
        let ch = ':';
        let inputTextTail = '\n))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            ':parameters',
            ':precondition',
            ':effect',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 1), `Range of '${item.label}'`));
    });

    test('should suggest only :effect for partially completed (:action upon : trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:action :parameters() :precondition()\n';
        let ch = ':';
        let inputTextTail = '\n))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            ':effect',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 1), `Range of '${item.label}'`));
    });

    /* Durative Action keywords */

    test('should suggest (:durative-action sections upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:durative-action\n';
        let ch = '';
        let inputTextTail = '\n))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            ':parameters',
            ':duration',
            ':condition',
            ':effect',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest (:durative-action sections upon : trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:durative-action\n';
        let ch = ':';
        let inputTextTail = '\n))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            ':parameters',
            ':duration',
            ':condition',
            ':effect',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 1), `Range of '${item.label}'`));
    });

    /* Action effects */

    test('should suggest (:action effects upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:predicates (p1)(p2)) (:action :effect (and\n';
        let ch = '';
        let inputTextTail = '\n)))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(not", 'p1,p2');
        assertSnippetIncludes(items, "(assign", '(assign (${1:new_function}) ${2:0})$0');
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(not',
            '(assign',
            '(increase',
            '(decrease',
            '(forall',
            '(when',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of '${item.label}' should be undefined`));
    });
    
    test('should suggest (:action effects upon ( trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:predicates (p1)(p2)) (:action :effect (and\n';
        let ch = '(';
        let inputTextTail = ')\n)))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(not", 'p1,p2');
        assertSnippetIncludes(items, "(assign", '(assign (${1:new_function}) ${2:0})$0');
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(not',
            '(assign',
            '(increase',
            '(decrease',
            '(forall',
            '(when',
        ]);
        let expectedRange = new vscode.Range(1, 0, 1, 2);
        items.forEach(item => assert.deepStrictEqual(item.range, expectedRange, `Range of '${item.label}' should be ...`));
    });

    test('should suggest (:durative-action continuous effects and time-qualifiers upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:functions (f1)) (:durative-action :effect (and\n';
        let ch = '';
        let inputTextTail = '\n)))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(increase", 'f1');
        assertSnippetIncludes(items, "(decrease", '(decrease (${1|f1|}) (* #t ${2:1.0}))$0');
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(at start',
            '(at end',
            '(increase',
            '(decrease',
            '(forall',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of '${item.label}' should be undefined`));
    });
    
    test('should suggest (:process effects upon ( trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:functions (f1)) (:process :effect (and\n';
        let ch = '(';
        let inputTextTail = ')\n)))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(increase", 'f1');
        assertSnippetIncludes(items, "(decrease", '(decrease (${1|f1|}) (* #t ${2:1.0}))$0');
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(increase',
            '(decrease',
            '(forall',
        ]);
        let expectedRange = new vscode.Range(1, 0, 1, 2);
        items.forEach(item => assert.deepStrictEqual(item.range, expectedRange, `Range of '${item.label}' should be ...`));
    });

    /* Action condition */

    test('should suggest (:durative-action condition time-qualifiers upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:durative-action :condition (and\n';
        let ch = '';
        let inputTextTail = '\n)))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(at start',
            '(at end',
            '(over all',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of '${item.label}' should be undefined`));
    });

    /* Action parameters */

    test('should suggest action and forall parameters upon ? trigger', async () => {
        // GIVEN
        let inputTextHead = '(define (domain d) (:action :parameters (?pa-1 ?pa_2 - type1) :condition (forall (?pfa - type2) \n';
        let ch = '?';
        let inputTextTail = '\n)))';

        // WHEN
        let items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '?pfa',
            '?pa-1',
            '?pa_2',
        ]);
        let expectedRange = new vscode.Range(1, 0, 1, 1);
        items.forEach(item => assert.deepStrictEqual(item.range, expectedRange, `Range of '${item.label}' should be ...`));
    });

    /* Problem keywords */
    
    test('should suggest problem sections upon invoke', async () => {
        // GIVEN
        let inputTextHead = '(define \n';
        let ch = '';
        let inputTextTail = '\n)';
    
        // WHEN
        let items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });
    
        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(problem',
            '(:domain',
            '(:requirements',
            '(:objects',
            '(:init',
            '(:goal',
            '(:constraints',
            '(:metric'
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });
    
    test('should suggest problem sections upon ( trigger', async () => {
        // GIVEN
        let inputTextHead = '(define \n';
        let ch = '(';
        let inputTextTail = ')\n)';
    
        // WHEN
        let items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });
    
        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(problem',
            '(:domain',
            '(:requirements',
            '(:objects',
            '(:init',
            '(:goal',
            '(:constraints',
            '(:metric'
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 2), `Range of ${item.label}`));
    });
    
    test('should suggest problem sections upon : trigger', async () => {
        // GIVEN
        let inputTextHead = '(define \n(';
        let ch = ':';
        let inputTextTail = ')\n)';
    
        // WHEN
        let items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });
    
        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText || i.label), [
            '(:domain',
            '(:requirements',
            '(:objects',
            '(:init',
            '(:goal',
            '(:constraints',
            '(:metric'
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 3), `Range of '${item.label}'`));
    });    
});


function assertSnippetIncludes(items: vscode.CompletionItem[], filterText: string, needle: string) {
    const item = items.find(item => item.filterText === filterText);
    assert.ok(item, `Item '${filterText}' should be included`);
    const snippet = (<vscode.SnippetString>item.insertText);
    assert.ok(snippet.value.includes(needle), `snippet '${snippet.value}' should include ${needle}`);
}

async function testProvider(inputTextHead: string, ch: string, inputTextTail: string, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    let initialText = inputTextHead + ch + inputTextTail;

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    let doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    let editor = await vscode.window.showTextDocument(doc);

    // move the cursor into the text
    let position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);

    return await new UnknownPddlCompletionItemProvider().provide(doc, position, context);
}

async function testProblemProvider(inputTextHead: string, ch: string, inputTextTail: string, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    let initialText = inputTextHead + ch + inputTextTail;

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    let doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    let editor = await vscode.window.showTextDocument(doc);

    // move the cursor into the text
    let position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);

    let tree = new PddlSyntaxTreeBuilder(initialText).getTree();

    let problemInfo = new ProblemInfo('file://testProblem.pddl', 1, 'p', 'd', tree, new CodeDocumentPositionResolver(doc));

    return await new ProblemCompletionItemProvider().provide(doc, problemInfo, position, context);
}

async function testDomainProvider(inputTextHead: string, ch: string, inputTextTail: string, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    let initialText = inputTextHead + ch + inputTextTail;

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    let doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    let editor = await vscode.window.showTextDocument(doc);

    // move the cursor into the text
    let position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);

    let tree = new PddlSyntaxTreeBuilder(initialText).getTree();

    let domainNode = tree.getDefineNodeOrThrow().getFirstOpenBracketOrThrow('domain');
    let positionResolver = new CodeDocumentPositionResolver(doc);
    let domainInfo = new PddlDomainParser('file://testProblem.pddl', 1, initialText, domainNode, tree, positionResolver).getDomain();

    return await new DomainCompletionItemProvider().provide(doc, domainInfo, position, context);
}

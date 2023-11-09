import * as assert from 'assert';
import { before } from 'mocha';
import { expect } from 'chai';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { ProblemCompletionItemProvider } from '../../completion/ProblemCompletionItemProvider';
import { parser, ProblemInfo } from 'pddl-workspace';
import { CodeDocumentPositionResolver } from '../../workspace/CodeDocumentPositionResolver';
import { UnknownPddlCompletionItemProvider } from '../../completion/UnknownPddlCompletionItemProvider';
import { DomainCompletionItemProvider } from '../../completion/DomainCompletionItemProvider';

suite('PDDL Completion Item Provider', () => {
    before(async () => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('should offer to declare domain or problem', async () => {
        // GIVEN
        const inputTextHead = ' ';
        const ch = '(';
        const inputTextTail = ')';

        // WHEN
        const items = await testProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.strictEqual(items.length, 2, 'there should be N completion items');
        items.forEach(item => expect(item.label).to.startWith('(define'));
    });

    test('should offer to declare pre-parsing meta data instruction', async () => {
        // GIVEN
        const inputTextHead = '';
        const ch = ';';
        const inputTextTail = '\n(define (problem p) (:domain d) )';

        // WHEN
        const items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.strictEqual(items.length, 3, 'there should be N completion items');
        items.forEach(item => expect(item.label).to.startWith(';;'));
    });

    /* Domain keywords */

    test('should suggest domain sections upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) \n';
        const ch = '';
        const inputTextTail = '\n)';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
            '(:event',
            '(:job',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest domain sections upon ( trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) \n';
        const ch = '(';
        const inputTextTail = ')\n)';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
            '(:event',
            '(:job',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 2), `Range of ${item.label}`));
    });

    test('should suggest domain sections upon : trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) \n(';
        const ch = ':';
        const inputTextTail = ')\n)';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '(:requirements',
            '(:types',
            '(:constants',
            '(:predicates',
            '(:functions',
            '(:constraints',
            '(:action',
            '(:durative-action',
            '(:process',
            '(:event',
            '(:job',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 3), `Range of '${item.label}'`));
    });

    /* Requirements */

    test('should suggest requirements upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:requirements ';
        const ch = '';
        const inputTextTail = ')\n)';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        items.some(item => (item.filterText ?? item.label) === ':strips');
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest requirements upon : trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:requirements ';
        const ch = ':';
        const inputTextTail = ')\n)';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        items.some(item => (item.filterText ?? item.label) === ':strips');
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(0, inputTextHead.length, 0, inputTextHead.length + 1), `Range of '${item.label}'`));
    });

    /* Action keywords */

    test('should suggest (:action sections upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:action\n';
        const ch = '';
        const inputTextTail = '\n))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            ':parameters',
            ':precondition',
            ':effect',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest (:action sections upon : trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:action\n';
        const ch = ':';
        const inputTextTail = '\n))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            ':parameters',
            ':precondition',
            ':effect',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 1), `Range of '${item.label}'`));
    });

    test('should suggest only :effect for partially completed (:action upon : trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:action :parameters() :precondition()\n';
        const ch = ':';
        const inputTextTail = '\n))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            ':effect',
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 1), `Range of '${item.label}'`));
    });

    /* Durative Action keywords */

    test('should suggest (:durative-action sections upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:durative-action\n';
        const ch = '';
        const inputTextTail = '\n))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            ':parameters',
            ':duration',
            ':condition',
            ':effect',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of ${item.label} should be undefined`));
    });

    test('should suggest (:durative-action sections upon : trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:durative-action\n';
        const ch = ':';
        const inputTextTail = '\n))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
        const inputTextHead = '(define (domain d) (:predicates (p1)(p2)) (:action :effect (and\n';
        const ch = '';
        const inputTextTail = '\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(not", 'p1,p2');
        assertSnippetIncludes(items, "(assign", '(assign (${1:new_function}) ${2:0})$0');
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '(not',
            '(assign',
            '(increase',
            '(decrease',
            '(forall',
            '(when',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of '${item.label}' should be undefined`));
    });

    test('should suggest (:action effects upon invoke under :job-scheduling', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:requirements :job-scheduling) (:types cook - resource) (:predicates (has_michelin_star ?c - cook)) (:job cooking :parameters (?r - location ?c - cook)) (:action :effect (and\n';
        const ch = '';
        const inputTextTail = '\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(not", 'has_michelin_star ?c,is_available ?a,located_at ?r ?l,contains ?parent ?child,busy ?r,cooking_job_started ?r,cooking_job_done ?r');
        assertSnippetIncludes(items, "(assign", '(assign (${1|travel_time ?r ?from ?to,cooking_job_duration ?r|}) ${2:0})$0');
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
        const inputTextHead = '(define (domain d) (:predicates (p1)(p2)) (:action :effect (and\n';
        const ch = '(';
        const inputTextTail = ')\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(not", 'p1,p2');
        assertSnippetIncludes(items, "(assign", '(assign (${1:new_function}) ${2:0})$0');
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '(not',
            '(assign',
            '(increase',
            '(decrease',
            '(forall',
            '(when',
        ]);
        const expectedRange = new vscode.Range(1, 0, 1, 2);
        items.forEach(item => assert.deepStrictEqual(item.range, expectedRange, `Range of '${item.label}' should be ...`));
    });

    test('should suggest (:durative-action continuous effects and time-qualifiers upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:functions (f1)) (:durative-action :effect (and\n';
        const ch = '';
        const inputTextTail = '\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(increase", 'f1');
        assertSnippetIncludes(items, "(decrease", '(decrease (${1|f1|}) (* #t ${2:1.0}))$0');
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
        const inputTextHead = '(define (domain d) (:functions (f1)) (:process :effect (and\n';
        const ch = '(';
        const inputTextTail = ')\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assertSnippetIncludes(items, "(increase", 'f1');
        assertSnippetIncludes(items, "(decrease", '(decrease (${1|f1|}) (* #t ${2:1.0}))$0');
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '(increase',
            '(decrease',
            '(forall',
        ]);
        const expectedRange = new vscode.Range(1, 0, 1, 2);
        items.forEach(item => assert.deepStrictEqual(item.range, expectedRange, `Range of '${item.label}' should be ...`));
    });

    /* Action condition */

    test('should suggest (:durative-action condition time-qualifiers upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:durative-action :condition (and\n';
        const ch = '';
        const inputTextTail = '\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '(at start',
            '(at end',
            '(over all',
        ]);
        items.forEach(item => assert.strictEqual(item.range, undefined, `Range of '${item.label}' should be undefined`));
    });

    /* Action parameters */

    test('should suggest action and forall parameters upon ? trigger', async () => {
        // GIVEN
        const inputTextHead = '(define (domain d) (:action :parameters (?pa-1 ?pa_2 - type1) :condition (forall (?pfa - type2) \n';
        const ch = '?';
        const inputTextTail = '\n)))';

        // WHEN
        const items = await testDomainProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });

        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '?pfa',
            '?pa-1',
            '?pa_2',
        ]);
        const expectedRange = new vscode.Range(1, 0, 1, 1);
        items.forEach(item => assert.deepStrictEqual(item.range, expectedRange, `Range of '${item.label}' should be ...`));
    });

    /* Problem keywords */
    
    test('should suggest problem sections upon invoke', async () => {
        // GIVEN
        const inputTextHead = '(define \n';
        const ch = '';
        const inputTextTail = '\n)';
    
        // WHEN
        const items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.Invoke, triggerCharacter: ch });
    
        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
        const inputTextHead = '(define \n';
        const ch = '(';
        const inputTextTail = ')\n)';
    
        // WHEN
        const items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });
    
        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
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
        const inputTextHead = '(define \n(';
        const ch = ':';
        const inputTextTail = ')\n)';
    
        // WHEN
        const items = await testProblemProvider(inputTextHead, ch, inputTextTail, { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ch });
    
        // THEN
        assert.deepStrictEqual(items.map(i => i.filterText ?? i.label), [
            '(:domain',
            '(:requirements',
            '(:objects',
            '(:init',
            '(:goal',
            '(:constraints',
            '(:metric'
        ]);
        items.forEach(item => assert.deepStrictEqual(item.range, new vscode.Range(1, 0, 1, 3), `Range of '${item.label}'`));

        const objectsCompletion = items.find(i => (i.filterText ?? i.label) === '(:objects');
        expect((objectsCompletion?.insertText as vscode.SnippetString).value, ":objects template").equal('(:objects\n\t$0\n)', "does not include (and )");

        const initCompletion = items.find(i => (i.filterText ?? i.label) === '(:init');
        expect((initCompletion?.insertText as vscode.SnippetString).value, ":init template").equal('(:init\n\t$0\n)', "does not include (and )");
    });    
});


function assertSnippetIncludes(items: vscode.CompletionItem[], filterText: string, needle: string): void {
    const item = items.find(item => item.filterText === filterText);
    expect(item, `Item '${filterText}' should be included`).to.not.be.undefined;
    const snippet = (item!.insertText as vscode.SnippetString);
    expect(snippet.value, `snippet '${snippet.value}' should include ${needle}`).to.includes(needle);
}

async function testProvider(inputTextHead: string, ch: string, inputTextTail: string, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    const initialText = inputTextHead + ch + inputTextTail;

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    const doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    const editor = await vscode.window.showTextDocument(doc);

    // move the cursor into the text
    const position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);

    return await new UnknownPddlCompletionItemProvider().provide(doc, position, context);
}

async function testProblemProvider(inputTextHead: string, ch: string, inputTextTail: string, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    const initialText = inputTextHead + ch + inputTextTail;

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    const doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    const editor = await vscode.window.showTextDocument(doc);

    // move the cursor into the text
    const position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);

    const tree = new parser.PddlSyntaxTreeBuilder(initialText).getTree();

    const problemInfo = new ProblemInfo(URI.parse('file:///testProblem.pddl'), 1, 'p', 'd', tree, new CodeDocumentPositionResolver(doc));

    return await new ProblemCompletionItemProvider().provide(doc, problemInfo, position, context);
}

async function testDomainProvider(inputTextHead: string, ch: string, inputTextTail: string, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    const initialText = inputTextHead + ch + inputTextTail;

    // we do not want the extension to actually load (it takes too much time), so use a fake language
    const doc = await vscode.workspace.openTextDocument({ language: 'pddl-do-not-load-extension', content: initialText });
    const editor = await vscode.window.showTextDocument(doc);

    // move the cursor into the text
    const position = doc.positionAt((inputTextHead + ch).length);
    editor.selection = new vscode.Selection(position, position);

    const tree = new parser.PddlSyntaxTreeBuilder(initialText).getTree();

    const domainNode = tree.getDefineNodeOrThrow().getFirstOpenBracketOrThrow('domain');
    const positionResolver = new CodeDocumentPositionResolver(doc);
    const domainInfo = new parser.PddlDomainParser().parse(URI.parse('file:///testProblem.pddl'), 1, initialText, domainNode, tree, positionResolver);
    if (!domainInfo) { throw new Error(`Unable to parse test domain.`); }

    return await new DomainCompletionItemProvider().provide(doc, domainInfo, position, context);
}

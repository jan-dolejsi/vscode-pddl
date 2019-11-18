/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { SimpleDocumentPositionResolver, PddlRange } from '../src/DocumentPositionResolver';
import { DurativeActionParser } from '../src/DurativeActionParser';

describe('DurativeActionParser', () => {

    function createActionParser(actionPddl: string): DurativeActionParser {
        let syntaxTree = new PddlSyntaxTreeBuilder(actionPddl).getTree();
        return new DurativeActionParser(
            syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':durative-action'), 
            new SimpleDocumentPositionResolver(actionPddl));
    }

    describe('#getAction', () => {

        it('extracts one incomplete action', () => {
            // GIVEN
            let actionPddl = "\n; can lift crate from the surface\n(:durative-action)";

            // WHEN
            let action = createActionParser(actionPddl).getAction();

            // THEN
            assert.ok(action, 'there should be an action parsed');
            assert.strictEqual(action.name, undefined);
            assert.strictEqual(action.parameters.length, 0);
            assert.strictEqual(action.condition, undefined);
            assert.strictEqual(action.effect, undefined);
            assert.ok(action.getDocumentation().join('\n').startsWith('can lift'));
            assert.deepStrictEqual(action.getLocation(), new PddlRange(2, 0, 2, 18));
        });

        it('extracts action with a name and a parameter', () => {
            // GIVEN
            let actionPddl = "(:durative-action action1 :parameters (?p - type1))";

            // WHEN
            let action = createActionParser(actionPddl).getAction();

            // THEN
            assert.ok(action, 'there should be an action parsed');
            assert.strictEqual(action.name, 'action1');
            assert.strictEqual(action.parameters.length, 1, 'parameters');
            assert.deepStrictEqual(action.getLocation(), new PddlRange(0, 0, 0, 51));
        });

        it('extracts action with a name and a duration', () => {
            // GIVEN
            let actionPddl = "(:durative-action action1 :duration (= ?duration 1))";

            // WHEN
            let action = createActionParser(actionPddl).getAction();

            // THEN
            assert.ok(action, 'there should be an action parsed');
            assert.strictEqual(action.name, 'action1', 'action name');
            assert.strictEqual(action.duration?.getText(), '(= ?duration 1)', 'duration');
        });

        it('extracts action with single predicate pre-condition', () => {
            // GIVEN
            let actionPddl = "(:durative-action action1 :condition (at start (p)))";

            // WHEN
            let action = createActionParser(actionPddl).getAction();

            // THEN
            assert.ok(action, 'there should be an action parsed');
            assert.strictEqual(action.name, 'action1');
            assert.strictEqual(action.condition?.getText(), '(at start (p))');
        });

        it('extracts action with simple conjunction effect', () => {
            // GIVEN
            let actionPddl = "(:durative-action action1 :effect (and (at end (p)))";

            // WHEN
            let action = createActionParser(actionPddl).getAction();

            // THEN
            assert.ok(action, 'there should be an action parsed');
            assert.strictEqual(action.name, 'action1');
            assert.strictEqual(action.effect?.getText(), '(and (at end (p)))');
        });
    });
});
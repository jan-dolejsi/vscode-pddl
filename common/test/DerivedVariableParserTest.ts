/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { SimpleDocumentPositionResolver, PddlRange } from '../src/DocumentPositionResolver';
import { DerivedVariablesParser } from '../src/DerivedVariableParser';

describe('DerivedVariableParser', () => {
    describe('#getVariable', () => {

        it('extracts one derived predicate', () => {
            // GIVEN
            let derivedPredicatePddl = `
            ; can lift crate from the surface
            (:derived (can-lift ?c - crate ?s - surface) 
               (and (clear ?c) (on ?c ?s)))
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(derivedPredicatePddl).getTree();

            // WHEN
            let parser = new DerivedVariablesParser(
                syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':derived'), 
                new SimpleDocumentPositionResolver(derivedPredicatePddl));
            let derivedPredicate = parser.getVariable();

            // THEN
            assert.ok(derivedPredicate !== undefined, 'there should be one derived predicate');
            assert.strictEqual(derivedPredicate!.name, 'can-lift');
            assert.equal(derivedPredicate!.parameters.length, 2);
            assert.ok(derivedPredicate!.getDocumentation().join('\n').startsWith('can lift'));
            assert.deepStrictEqual(derivedPredicate!.getLocation(), new PddlRange(2, 12, 3, 43));
        });

        it('parses derived function', () => {
            // GIVEN
            let derivedFunctionPddl = `        (:derived (c) (+ (a) (b))`;
            let syntaxTree = new PddlSyntaxTreeBuilder(derivedFunctionPddl).getTree();

            // WHEN
            let parser = new DerivedVariablesParser(
                syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':derived'), 
                new SimpleDocumentPositionResolver(derivedFunctionPddl));
            let derivedFunction = parser.getVariable();

            // THEN
            assert.ok(derivedFunction, 'there should be one derived function');
            assert.strictEqual(derivedFunction!.name, 'c');
            assert.equal(derivedFunction!.parameters.length, 0);
            assert.deepStrictEqual(derivedFunction!.getLocation(), new PddlRange(0, 8, 0, 33));
        });
    });
});
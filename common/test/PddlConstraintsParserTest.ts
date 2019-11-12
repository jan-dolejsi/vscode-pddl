/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { PddlConstraintsParser } from '../src/PddlConstraintsParser';
import { StateSatisfyingConstraint, AfterConstraint } from '../src/constraints';

describe('PddlConstraintsParser', () => {

    describe('#parseConstraints', () => {
        it('should parse empty', () => {
            // GIVEN
            let constraintsPddl = `
            (:constraints
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(constraintsPddl).getTree();

            // WHEN
            let actual = new PddlConstraintsParser().parseConstraints(syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':constraints'));

            // THEN
            assert.deepStrictEqual(actual, [], "there should be no constraints");
        });

        it('should parse one named state-satisfying constraint', () => {
            // GIVEN
            let name = 'g1';
            let condition = '(p)';
            let constraintsPddl = `
            (:constraints
                (name ${name} ${condition})
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(constraintsPddl).getTree();

            // WHEN
            let actual = new PddlConstraintsParser().parseConstraints(syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':constraints'));

            // THEN
            assert.strictEqual(actual.length, 1, "there should be one constraint");
            assert.ok(actual.every(c => c instanceof StateSatisfyingConstraint), 'constraint type');
            assert.deepStrictEqual(
                actual
                    .map(c => c as StateSatisfyingConstraint)
                    .map(c => [c.name, c.condition?.node.getText()]),
                [[name, condition]],
                "constraint content");
        });

        it('should parse one named state-satisfying constraint inside conjunction', () => {
            // GIVEN
            let name = 'g1';
            let condition = '(p)';
            let constraintsPddl = `
            (:constraints (and
                (name ${name} ${condition})
            ))
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(constraintsPddl).getTree();

            // WHEN
            let actual = new PddlConstraintsParser().parseConstraints(syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':constraints'));

            // THEN
            assert.strictEqual(actual.length, 1, "there should be one constraint");
            assert.ok(actual.every(c => c instanceof StateSatisfyingConstraint), 'constraint type');
            assert.deepStrictEqual(
                actual
                    .map(c => c as StateSatisfyingConstraint)
                    .map(c => [c.name, c.condition?.node.getText()]),
                [[name, condition]],
                "constraint content");
        });

        it('should parse one self-contained after-constraint constraint', () => {
            // GIVEN
            let condition1 = '(p)';
            let condition2 = '(q)';
            let constraintsPddl = `
            (:constraints
                (after ${condition1} ${condition2})
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(constraintsPddl).getTree();

            // WHEN
            let actual = new PddlConstraintsParser().parseConstraints(syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':constraints'));

            // THEN
            assert.strictEqual(actual.length, 1, "there should be one constraint");
            assert.ok(actual.every(c => c instanceof AfterConstraint), 'constraint type');

            assert.deepStrictEqual(
                actual
                    .map(c => c as AfterConstraint)
                    .map(c => [c.predecessor.condition?.getText(), c.successor.condition?.getText()]),
                [[condition1, condition2]],
                "constraint content");
        });

        it('should parse one after-constraint constraint', () => {
            // GIVEN
            let name1 = 'g1';
            let name2 = 'g2';
            let constraintsPddl = `
            (:constraints
                (after ${name1} ${name2})
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(constraintsPddl).getTree();

            // WHEN
            let actual = new PddlConstraintsParser().parseConstraints(syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':constraints'));

            // THEN
            assert.strictEqual(actual.length, 1, "there should be one constraint");
            assert.ok(actual.every(c => c instanceof AfterConstraint), 'constraint type');
            assert.deepStrictEqual(
                actual
                    .map(c => c as AfterConstraint)
                    .map(c => [c.predecessor.name, c.successor.name]),
                [[name1, name2]],
                "constraint content");
        });

        it('should parse two named state-satisfying constraints and one after constraint', () => {
            // GIVEN
            let name1 = 'g1';
            let condition1 = '(p)';
            let name2 = 'g2';
            let condition2 = '(q)';
            let constraintsPddl = `
            (:constraints (and
                (name ${name1} ${condition1})
                (name ${name2} ${condition2})
                (after ${name1}, ${name2})
            ))
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(constraintsPddl).getTree();

            // WHEN
            let actual = new PddlConstraintsParser().parseConstraints(syntaxTree.getRootNode().getFirstOpenBracketOrThrow(':constraints'));

            // THEN
            assert.strictEqual(actual.length, 3, "there should be one constraint");
            assert.ok(actual[0] instanceof StateSatisfyingConstraint, 'constraint0 type');
            assert.ok(actual[1] instanceof StateSatisfyingConstraint, 'constraint1 type');
            assert.ok(actual[2] instanceof AfterConstraint, 'constraint2 type');
        });
    });
});

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';

describe('PddlBracketNode', () => {

    describe('#getText()', () => {

        it('gets single node text', () => {
            // GIVEN
            let originalPddl = `(define )`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let actual = tree.getDefineNode().getText();

            // THEN
            assert.strictEqual(actual, originalPddl);
        });

        it('gets (:types ) node text', () => {
            // GIVEN
            let originalPddl = `(:types child1 child2 - parent)`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let actual = tree.getRootNode().getSingleChild().getText();

            // THEN
            assert.strictEqual(actual, originalPddl);
        });

        it('gets (:types text when the closing bracket is missing', () => {
            // GIVEN
            let originalPddl = `(:types child1 child2`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let actual = tree.getRootNode().getSingleChild().getText();

            // THEN
            assert.strictEqual(actual, originalPddl);
        });
    });

    describe('#getNestedText()', () => {

        it('gets single node text', () => {
            // GIVEN
            let originalPddl = `(define )`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let actual = tree.getDefineNode().getNestedText();

            // THEN
            assert.strictEqual(actual, ' ');
        });

        it('gets (:types ) node text', () => {
            // GIVEN
            let originalPddl = `(:types child1 child2 - parent)`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let actual = tree.getRootNode().getSingleChild().getNestedText();

            // THEN
            assert.strictEqual(actual, ' child1 child2 - parent');
        });
    });

    describe('#getNonCommentText()', () => {
        it('should return the same when no comments are present', () => {
            // GIVEN
            let originalPddl = `(:types child1 child2 - parent)`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let node = tree.getRootNode().getSingleChild(); // note that the root node is the DOCUMENT node
            let actual = node.getNonCommentText();

            // THEN
            assert.strictEqual(actual, originalPddl);
            assert.strictEqual(actual, node.getText(), "same as getText()");
        });

        it('strips comments', () => {
            // GIVEN
            let originalPrefixPddl = `(and (or (p)`;
            let comment = `; (q)`;
            let originalSuffixPddl = `\n))`;
            let originalPddl = originalPrefixPddl + comment + originalSuffixPddl;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let node = tree.getRootNode().getSingleChild(); // note that the root node is the DOCUMENT node
            let actual = node.getNonCommentText();

            // THEN
            assert.strictEqual(actual, originalPrefixPddl + originalSuffixPddl);
        });

        it('gets (:types text when the closing bracket is missing', () => {
            // GIVEN
            let originalPddl = `(:types child1 child2`;
            let tree = new PddlSyntaxTreeBuilder(originalPddl).getTree();

            // WHEN
            let actual = tree.getRootNode().getSingleChild().getNonCommentText();

            // THEN
            assert.strictEqual(actual, originalPddl);
        });
    });
});
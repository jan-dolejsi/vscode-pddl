/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { ActionEffectParser, MakeTrueEffect, MakeFalseEffect, IncreaseEffect } from '../src/ActionEffectParser';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { Variable } from '../src/FileInfo';

describe('ActionEffectParser', () => {

    describe('#parseEffect', () => {
        it('should parse a proposition', () => {
            // GIVEN
            let predicate = 'p';
            let pddlText = `(${predicate})`;

            // WHEN
            let syntaxTree = new PddlSyntaxTreeBuilder(pddlText).getTree();
            const node = syntaxTree.getRootNode().getSingleChild();
            let actual = ActionEffectParser.parseEffect(node);

            // THEN
            assert.deepStrictEqual(actual, new MakeTrueEffect(node, new Variable(predicate)), "actual should equal expected");
        });

        it('should parse a negation', () => {
            // GIVEN
            let predicate = 'p';
            let pddlText = `(not (${predicate}))`;

            // WHEN
            let syntaxTree = new PddlSyntaxTreeBuilder(pddlText).getTree();
            const node = syntaxTree.getRootNode().getSingleChild();
            let actual = ActionEffectParser.parseEffect(node);

            // THEN
            assert.deepStrictEqual(actual, new MakeFalseEffect(node, new Variable(predicate)), "actual should equal expected");
        });
        
        it('should parse a conjunction', () => {
            // GIVEN
            let predicate = 'p';
            let pddlText = `(and (${predicate}))`;

            // WHEN
            let syntaxTree = new PddlSyntaxTreeBuilder(pddlText).getTree();
            const node = syntaxTree.getRootNode().getSingleChild();
            let actual = ActionEffectParser.parseEffect(node);

            // THEN
            assert.deepStrictEqual(actual, new MakeTrueEffect(node.getSingleNonWhitespaceChild(), new Variable(predicate)), "actual should equal expected");
        });
        
        it('should parse a at start propositional effect', () => {
            // GIVEN
            let predicate = 'p';
            let pddlText = `(at start (${predicate}))`;

            // WHEN
            let syntaxTree = new PddlSyntaxTreeBuilder(pddlText).getTree();
            const node = syntaxTree.getRootNode().getSingleChild();
            let actual = ActionEffectParser.parseEffect(node);

            // THEN
            assert.deepStrictEqual(actual, new MakeTrueEffect(node.getSingleNonWhitespaceChild(), new Variable(predicate)), "actual should equal expected");
        });
        
        it('should parse a at start increase effect', () => {
            // GIVEN
            let fluent = 'f';
            let expression = "3";
            let pddlText = `(at start (increase (${fluent}) ${expression}))`;

            // WHEN
            let syntaxTree = new PddlSyntaxTreeBuilder(pddlText).getTree();
            const increaseNode = syntaxTree.getRootNode().getSingleChild().getSingleNonWhitespaceChild();
            const expressionNode = syntaxTree.getNodeAt(pddlText.indexOf(expression) + 1);
            let actual = ActionEffectParser.parseEffect(increaseNode);

            // THEN
            assert.deepStrictEqual(actual, new IncreaseEffect(increaseNode, new Variable(fluent), expressionNode), "actual should equal expected");
        });
    });
});

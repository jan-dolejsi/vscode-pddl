/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { SimpleDocumentPositionResolver } from '../src/DocumentPositionResolver';
import { ProblemInfo, VariableValue, TimedVariableValue, SupplyDemand } from '../src/ProblemInfo';
import { PddlProblemParser } from '../src/PddlProblemParser';

describe('PddlProblemParser', () => {
    describe('#getProblemStructure', () => {
        it('parses objects for types with dashes', () => {
            // GIVEN
            let problemPddl = `
            (define (problem p1) (:domain d1)
            
            (:objects
              ta-sk1 task2 task3 - basic-task
            )
            
            (:init )
            (:goal )
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(problemPddl).getTree();
            let positionResolver = new SimpleDocumentPositionResolver(problemPddl);
            let problemInfo = new ProblemInfo("uri", 1, "p1", "d1", syntaxTree, positionResolver);

            // WHEN
            new PddlProblemParser().getProblemStructure(problemInfo);

            assert.equal(problemInfo.getObjects("basic-task").length, 3, 'there should be 3 objects');
        });

        it('parses structure even where there is a requirements section', () => {
            // GIVEN
            let problemPddl = `
            (define (problem p1) (:domain d1)
            (:requirements :strips :fluents :durative-actions :timed-initial-literals :typing :conditional-effects :negative-preconditions :duration-inequalities :equality)
            (:objects
              task1 - task
            )
            
            (:init )
            (:goal )
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(problemPddl).getTree();
            let positionResolver = new SimpleDocumentPositionResolver(problemPddl);
            let problemInfo = new ProblemInfo("uri", 1, "p1", "d1", syntaxTree, positionResolver);

            // WHEN
            new PddlProblemParser().getProblemStructure(problemInfo);

            assert.equal(problemInfo.getObjects("task").length, 1, 'there should be 1 object despite the requirements section');
        });
        
        it('parses problem with init values', () => {
            // GIVEN
            let problemPddl = `
            (define (problem p1) (:domain d1)
            (:requirements :strips :fluents)
            
            (:init 
                (p1)
                (= (f1) 1)
            )
            (:goal )
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(problemPddl).getTree();
            let positionResolver = new SimpleDocumentPositionResolver(problemPddl);
            let problemInfo = new ProblemInfo("uri", 1, "p1", "d1", syntaxTree, positionResolver);

            // WHEN
            new PddlProblemParser().getProblemStructure(problemInfo);

            assert.strictEqual(problemInfo.getInits().length, 2, 'there should be 2 initial values');
            assert.deepStrictEqual(problemInfo.getInits()[0], new TimedVariableValue(0, "p1", true));
            assert.deepStrictEqual(problemInfo.getInits()[1], new TimedVariableValue(0, "f1", 1));
        });
        
        it('parses problem with supply-demand', () => {
            // GIVEN
            let problemPddl = `
            (define (problem p1) (:domain d1)
            (:requirements :strips :supply-demand)
            
            (:init 
                (supply-demand sd4 (and (condition1)) (over all (and (condition2))) 24.105 (effect3))
            )
            (:goal )
            )
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(problemPddl).getTree();
            let positionResolver = new SimpleDocumentPositionResolver(problemPddl);
            let problemInfo = new ProblemInfo("uri", 1, "p1", "d1", syntaxTree, positionResolver);

            // WHEN
            new PddlProblemParser().getProblemStructure(problemInfo);

            assert.equal(problemInfo.getSupplyDemands().length, 1, 'there should be 1 supply demand');
        });
    });

    describe('#parseInit', () => {
        it('parses a fact', () => {
            // GIVEN
            let variableValuePddl = '(p o1 o2)';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseInit(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new TimedVariableValue(0, "p o1 o2", true));
        });

        it('parses "at" predicate fact', () => {
            // GIVEN
            let variableValuePddl = '(at car1 location2)';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseInit(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new TimedVariableValue(0, "at car1 location2", true));
        });

        it('parses a numeric value', () => {
            // GIVEN
            let variableValuePddl = '(= (f o1 o2) 3.14)';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseInit(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new TimedVariableValue(0, "f o1 o2", 3.14));
        });

        it('parses a timed fact', () => {
            // GIVEN
            let variableValuePddl = '(at 123.456 (p o1 o2))';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseInit(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new TimedVariableValue(123.456, "p o1 o2", true));
        });

        it('parses a timed numeric value', () => {
            // GIVEN
            let variableValuePddl = '(at 123.456 (= (f o1 o2) 3.14))';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseInit(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new TimedVariableValue(123.456, "f o1 o2", 3.14));
        });
    });

    describe('#parseSupplyDemand', () => {
        it('parses a supply demand contract', () => {
            // GIVEN
            let variableValuePddl = '(supply-demand sd4 (and (condition1)) (over all (and (condition2))) 24.105 (effect3))';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let supplyDemand = new PddlProblemParser().parseSupplyDemand(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(supplyDemand, new SupplyDemand("sd4"));
        });
    });

    describe('#parseVariableValue', () => {
        it('parses a fact', () => {
            // GIVEN
            let variableValuePddl = '(p o1 o2)';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseVariableValue(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new VariableValue("p o1 o2", true));
        });

        it('parses a negated fact', () => {
            // GIVEN
            let variableValuePddl = '(not (p o1 o2))';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseVariableValue(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new VariableValue("p o1 o2", false));
        });

        it('parses invalid negated fact', () => {
            // GIVEN
            let variableValuePddl = '(not )'; // intentionally invalid
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseVariableValue(syntaxTree.getRootNode().getChildren()[0]);

            assert.strictEqual(variableValue, undefined);
        });

        it('parses a numeric value', () => {
            // GIVEN
            let variableValuePddl = '(= (f o1 o2) 3.14)';
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseVariableValue(syntaxTree.getRootNode().getChildren()[0]);

            assert.deepStrictEqual(variableValue, new VariableValue("f o1 o2", 3.14));
        });

        it('parses invalid numeric value', () => {
            // GIVEN
            let variableValuePddl = '(= (f o1 o2) )'; // intentionally invalid
            let syntaxTree = new PddlSyntaxTreeBuilder(variableValuePddl).getTree();

            // WHEN
            let variableValue = new PddlProblemParser().parseVariableValue(syntaxTree.getRootNode().getChildren()[0]);

            assert.strictEqual(variableValue, undefined);
        });
    });
});
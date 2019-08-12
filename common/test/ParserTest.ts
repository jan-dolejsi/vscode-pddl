/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser, ProblemInfo } from '../src/parser';
import { DirectionalGraph } from '../src/DirectionalGraph';
import * as assert from 'assert';
import { Variable, Parameter, ObjectInstance } from '../src/FileInfo';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { SimpleDocumentPositionResolver } from '../src/DocumentPositionResolver';

describe('Parser', () => {
    var subject: Parser;

    beforeEach(function () {
        subject = new Parser();
    });

    describe('#tryDomain', () => {
        it('should parse domain meta', () => {
            // GIVEN
            let fileText = `;Header and description

            (define (domain domain_name)
            ...
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(fileText).getTree();
            let positionResolver = new SimpleDocumentPositionResolver(fileText);

            // WHEN
            let domainInfo = subject.tryDomain('file:///file', 0, fileText, syntaxTree, positionResolver);

            // THEN
            assert.notStrictEqual(domainInfo, null, 'domain should not be null');
            assert.strictEqual(domainInfo.name, 'domain_name');
        });

        it('should return null on non-domain PDDL', () => {
            // GIVEN
            let fileText = `;Header and description

            (define (problem name)
            ...
            `;
            let syntaxTree = new PddlSyntaxTreeBuilder(fileText).getTree();
            let positionResolver = new SimpleDocumentPositionResolver(fileText);

            // WHEN
            let domainInfo = subject.tryDomain('file:///file', 0, fileText, syntaxTree, positionResolver);

            // THEN
            assert.strictEqual(domainInfo, null, 'domain should be null');
        });
    });

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
            new Parser().getProblemStructure(problemPddl, problemInfo);

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
            new Parser().getProblemStructure(problemPddl, problemInfo);

            assert.equal(problemInfo.getObjects("task").length, 1, 'there should be 1 object despite the requirements section');
        });
    });
});

describe('Variable', () => {

    beforeEach(function () {
    });

    describe('#constructor', () => {

        it('constructs-lifted', () => {
            // GIVEN
            let variableName = "predicate1 ?p1 - type1";
    
            // WHEN
            let variable = new Variable(variableName, [new Parameter("p1", "type1")]);
    
            // THEN
            assert.equal(variable.getFullName(), variableName, "full name should be...");
            assert.equal(variable.declaredName, variableName, "declared name should be...");
            assert.equal(variable.name, "predicate1");
            assert.equal(variable.declaredNameWithoutTypes, "predicate1 ?p1");
            assert.equal(variable.isGrounded(), false, "should NOT be grounded");
            assert.equal(variable.parameters.length, 1);
        });
    
        it('constructs-grounded', () => {
            // GIVEN
            let variableName = "predicate1 ?p1 - type1";
    
            // WHEN
            let variable = new Variable(variableName, [new ObjectInstance("o1", "type1")]);
    
            // THEN
            assert.equal(variable.getFullName(), "predicate1 o1", "full name should be...");
            assert.equal(variable.declaredNameWithoutTypes, "predicate1 ?p1", "declared name without types should be...");
            assert.equal(variable.declaredName, variableName, "declared name should be...");
            assert.equal(variable.name, "predicate1");
            assert.equal(variable.parameters.length, 1);
            assert.equal(variable.isGrounded(), true, "should be grounded");
        });

        it('accepts names with dashes', () => {
            // GIVEN
            let variableName = "predi-cate1";
    
            // WHEN
            let variable = new Variable(variableName, []);
    
            // THEN
            assert.equal(variable.getFullName(), variableName, "full name should be...");
            assert.equal(variable.declaredName, variableName, "declared name should be...");
            assert.equal(variable.name, variableName, "the short un-parameterised name should be...");
            assert.equal(variable.declaredNameWithoutTypes, variableName, "the declared name without types should be...");
            assert.equal(variable.parameters.length, 0);
            assert.equal(variable.isGrounded(), true, "should be grounded");
        });
    });
});

describe('DirectionalGraph', () => {
    var graph: DirectionalGraph;
    beforeEach(function () {
        graph = new DirectionalGraph();
    });

    describe('#addEdge', () => {
        it('should add one edge', () => {
            // given
            var origin = 'origin';
            var target = 'target';

            // when
            graph.addEdge(origin, target);

            // then
            assert.equal(graph.getEdges().length, 1);
            assert.equal(graph.getVertices().length, 2);
            assert.ok(graph.getVertices().includes(origin));
            assert.ok(graph.getVertices().includes(target));
            assert.equal(graph.getEdges()[0][0], origin, "the edge should originate from the origin vertex");
            assert.equal(graph.getEdges()[0][1], [target], "the edge should target the target vertex");
        });

        it('should add two edges from the same origin', () => {
            // given
            var origin = 'origin';
            var target1 = 'target1';
            var target2 = 'target2';
            
            // when
            graph.addEdge(origin, target1);
            graph.addEdge(origin, target2);
            
            // then
            assert.equal(graph.getEdges().length, 2);
            assert.equal(graph.getVertices().length, 3);
            assert.ok(graph.getVertices().includes(origin));
            assert.ok(graph.getVertices().includes(target1));
            assert.ok(graph.getVertices().includes(target1));
            assert.deepEqual(graph.getEdges().map(e => e[0]), [origin, origin], "the edges should originate from the origin vertex");
            assert.ok(graph.getEdges().map(e => e[1]).includes(target1), "the edge should target the target1 vertex");
            assert.ok(graph.getEdges().map(e => e[1]).includes(target2), "the edge should target the target2 vertex");
        });

        it('should add two edges to the same target', () => {
            // given
            var origin1 = 'origin1';
            var origin2 = 'origin2';
            var target = 'target';
            
            // when
            graph.addEdge(origin1, target);
            graph.addEdge(origin2, target);
            
            // then
            assert.equal(graph.getEdges().length, 2);
            assert.equal(graph.getVertices().length, 3);
            assert.ok(graph.getVertices().includes(origin1));
            assert.ok(graph.getVertices().includes(origin2));
            assert.ok(graph.getVertices().includes(target));
            assert.ok(graph.getEdges().map(e => e[0]).includes(origin1), "an edge should originate from the origin1 vertex");
            assert.ok(graph.getEdges().map(e => e[0]).includes(origin2), "an edge should originate from the origin2 vertex");
            assert.deepEqual(graph.getEdges().map(e => e[1]), [target, target], "the edges should target the target vertex");
        });
    });
    
    describe('#getVerticesWithEdgesFrom', () => {
        it('should return one vertex with edge from origin', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var targets = graph.getVerticesWithEdgesFrom(origin);

            // then
            assert.equal(targets.length, 1);
            assert.equal(targets[0], target);
        });

        it('should return no vertices with edge from target', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var targets = graph.getVerticesWithEdgesFrom(target);

            // then
            assert.equal(targets.length, 0);
        });
    });

    describe('#getVerticesWithEdgesTo', () => {
        it('should return one vertex with edge to target', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var origins = graph.getVerticesWithEdgesTo(target);

            // then
            assert.equal(origins.length, 1);
            assert.equal(origins[0], origin);
        });

        it('should return no vertices with edge to origin', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var targets = graph.getVerticesWithEdgesTo(origin);

            // then
            assert.equal(targets.length, 0);
        });
    });
    
    describe('#getSubtreePointingTo', () => {
        it('should return one vertex as subtree pointing to target', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var originSubTree = graph.getSubtreePointingTo(target);

            // then
            assert.equal(originSubTree.length, 1);
            assert.equal(originSubTree[0], origin);
        });

        it('should return child as subtree pointing to parent', () => {
            // given
            var child = 'child';
            var parent = 'parent';
            var grandparent = 'grandparent';
            graph.addEdge(child, parent);
            graph.addEdge(parent, grandparent);
            
            // when
            var originSubTree = graph.getSubtreePointingTo(parent);

            // then
            assert.equal(originSubTree.length, 1);
            assert.equal(originSubTree[0], child);
        });

        it('should return child and parent as subtree pointing to grandparent', () => {
            // given
            var child = 'child';
            var parent = 'parent';
            var grandparent = 'grandparent';
            graph.addEdge(child, parent);
            graph.addEdge(parent, grandparent);
            
            // when
            var originSubTree = graph.getSubtreePointingTo(grandparent);

            // then
            assert.equal(originSubTree.length, 2);
            assert.ok(originSubTree.includes(child), "should include child");
            assert.ok(originSubTree.includes(parent), "should include parent");
        });
    });
    
    describe('#getSubtreePointingFrom', () => {
        it('should return one vertex as subtree pointing from origin', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var targetSubTree = graph.getSubtreePointingFrom(origin);

            // then
            assert.equal(targetSubTree.length, 1);
            assert.equal(targetSubTree[0], target);
        });

        it('should return grandparent as subtree pointing from parent', () => {
            // given
            var child = 'child';
            var parent = 'parent';
            var grandparent = 'grandparent';
            graph.addEdge(child, parent);
            graph.addEdge(parent, grandparent);
            
            // when
            var originSubTree = graph.getSubtreePointingFrom(parent);

            // then
            assert.equal(originSubTree.length, 1);
            assert.equal(originSubTree[0], grandparent);
        });

        it('should return parent and grandparent as subtree pointing from child', () => {
            // given
            var child = 'child';
            var parent = 'parent';
            var grandparent = 'grandparent';
            graph.addEdge(child, parent);
            graph.addEdge(parent, grandparent);
            
            // when
            var originSubTree = graph.getSubtreePointingFrom(child);

            // then
            assert.equal(originSubTree.length, 2);
            assert.ok(originSubTree.includes(grandparent), "should include grandparent");
            assert.ok(originSubTree.includes(parent), "should include parent");
        });
    });
});
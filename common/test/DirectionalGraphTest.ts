/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DirectionalGraph } from '../src/DirectionalGraph';
import * as assert from 'assert';

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
            assert.ok(targets !== undefined);
            assert.equal(targets!.length, 1);
            assert.equal(targets![0], target);
        });

        it('should return no vertices with edge from target', () => {
            // given
            var origin = 'origin';
            var target = 'target';
            graph.addEdge(origin, target);

            // when
            var targets = graph.getVerticesWithEdgesFrom(target);

            // then
            assert.equal(targets?.length, 0);
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
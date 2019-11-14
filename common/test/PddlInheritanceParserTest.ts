/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { DirectionalGraph } from '../src/DirectionalGraph';
import * as assert from 'assert';
import { PddlInheritanceParser } from '../src/PddlInheritanceParser';

describe('PddlInheritanceParser', () => {

    describe('#parseInheritance', () => {
        it('should parse empty declaration', () => {
            let graph = PddlInheritanceParser.parseInheritance('');
            assert.equal(0, graph.getVertices().length);
        });

        it('should parse single type declaration', () => {
            let typeName = 'type1';
            let graph = PddlInheritanceParser.parseInheritance(typeName);
            assert.ok(graph.getVertices().includes(typeName), 'should include type1');
            assert.ok(graph.getVertices().includes(PddlInheritanceParser.OBJECT), 'should include object');
        });

        it('should parse single type declaration with a dash', () => {
            let typeName = 'basic-type1';
            let graph = PddlInheritanceParser.parseInheritance(typeName);
            assert.ok(graph.getVertices().includes(typeName), 'should include basic-type1');
        });

        it('should parse two type declarations', () => {
            let typeName1 = 'type1';
            let typeName2 = 'type2';
            let graph = PddlInheritanceParser.parseInheritance(`${typeName1} ${typeName2}`);
            assert.ok(graph.getVertices().includes(typeName1), 'should include type1');
            assert.ok(graph.getVertices().includes(typeName2), 'should include type2');
        });

        it('should parse parent-child declarations', () => {
            let parent = 'parent';
            let child = 'child';
            let graph = PddlInheritanceParser.parseInheritance(`${child} - ${parent}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child), 'should include child');
            assert.ok(graph.getVerticesWithEdgesFrom(child)?.includes(parent), 'child should have parent');
            assert.deepStrictEqual(graph.getVerticesWithEdgesFrom(parent), [PddlInheritanceParser.OBJECT], 'parent should not have parent');
        });

        it('should parse parent-child declarations with new line', () => {
            let parent = 'parent';
            let child = 'child';
            let graph = PddlInheritanceParser.parseInheritance(child + "\n- " + parent);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child), 'should include child');
            assert.ok(graph.getVerticesWithEdgesFrom(child)?.includes(parent), 'child should have parent');
            assert.deepStrictEqual(graph.getVerticesWithEdgesFrom(parent), [PddlInheritanceParser.OBJECT], 'parent should not have parent');
        });

        it('should parse parent-2children declarations', () => {
            let parent = 'parent';
            let child1 = 'child1';
            let child2 = 'child2';
            let graph = PddlInheritanceParser.parseInheritance(`${child1} ${child2} - ${parent}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child1), 'should include child1');
            assert.ok(graph.getVertices().includes(child2), 'should include child2');
            assert.ok(graph.getVerticesWithEdgesFrom(child1).includes(parent), 'child1 should have parent');
            assert.ok(graph.getVerticesWithEdgesFrom(child2).includes(parent), 'child2 should have parent');
            assert.deepStrictEqual(graph.getVerticesWithEdgesFrom(parent), [PddlInheritanceParser.OBJECT], 'parent should not have parent');
        });

        it('should parse parent-child and orphan declarations', () => {
            let parent = 'parent';
            let child = 'child';
            let orphan = 'orphan';
            let graph = PddlInheritanceParser.parseInheritance(`${child} - ${parent} ${orphan}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child), 'should include child');
            assert.ok(graph.getVertices().includes(orphan), 'should include orphan');

            assert.ok(graph.getVerticesWithEdgesFrom(child).includes(parent), 'child should have parent');
            assert.deepStrictEqual(graph.getVerticesWithEdgesFrom(parent), [PddlInheritanceParser.OBJECT], 'parent should not have parent');
            assert.deepStrictEqual(graph.getVerticesWithEdgesFrom(orphan), [PddlInheritanceParser.OBJECT], 'orphan should not have "object" parent');
        });

        it('should parse 2 parent-child declarations', () => {
            let parent1 = 'parent1';
            let child1 = 'child1';
            let parent2 = 'parent2';
            let child2 = 'child2';
            let graph = PddlInheritanceParser.parseInheritance(`${child1} - ${parent1} ${child2} - ${parent2}`);
            assert.ok(graph.getVerticesWithEdgesFrom(child1).includes(parent1), 'child1 should have parent1');
            assert.ok(graph.getVerticesWithEdgesFrom(child2).includes(parent2), 'child2 should have parent2');
            assert.ok(graph.getVerticesWithEdgesFrom(parent1).includes(PddlInheritanceParser.OBJECT), 'parent1 should inherit from object');
            assert.ok(graph.getVerticesWithEdgesFrom(parent2).includes(PddlInheritanceParser.OBJECT), 'parent2 should inherit from object');
        });
    });

    describe('#toTypeObjects', () => {
        it('should form object-type map', () => {
            let type1 = "type1";
            let object1 = "object1";
            let graph = new DirectionalGraph();
            graph.addEdge(object1, type1);

            let typeObjects = PddlInheritanceParser.toTypeObjects(graph);

            assert.strictEqual(typeObjects.length, 1, 'there should be 1 type');
            const type1ObjectsMap = typeObjects.getTypeCaseInsensitive(type1);
            assert.ok(type1ObjectsMap, 'the type should be type1');
            assert.strictEqual(type1ObjectsMap.getObjects().length, 1, 'the # of objects should be 1');
            assert.strictEqual(type1ObjectsMap.getObjects()[0], object1, 'the object should be object1');
        });

        it('should form 2object-type map', () => {
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            let graph = new DirectionalGraph();
            graph.addEdge(object1, type1);
            graph.addEdge(object2, type1);

            let typeObjects = PddlInheritanceParser.toTypeObjects(graph);

            assert.strictEqual(typeObjects.length, 1, 'there should be 1 type');
            const type1ObjectsMap = typeObjects.getTypeCaseInsensitive(type1);
            assert.ok(type1ObjectsMap, 'the type should be type1');
            assert.ok(type1ObjectsMap.hasObject(object1), 'the object should be object1');
            assert.ok(type1ObjectsMap.hasObject(object2), 'the object should be object2');
        });
    });
});
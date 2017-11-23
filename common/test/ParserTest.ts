/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {Parser, DirectionalGraph} from '../src/parser'
import * as assert from 'assert';

describe('Parser', () => {
    var subject: Parser;

    beforeEach(function () { 
        subject = new Parser();
    });

    describe('#parseInheritance', () => {
        it('should parse empty declaration', () => {
            let graph = subject.parseInheritance('');
            assert.equal(0, graph.getVertices().length);
        });

        it('should parse single type declaration', () => {
            let typeName = 'type1';
            let graph = subject.parseInheritance(typeName);
            assert.ok(graph.getVertices().includes(typeName), 'should include type1');
        });

        it('should parse two type declarations', () => {
            let typeName1 = 'type1';
            let typeName2 = 'type2';
            let graph = subject.parseInheritance(`${typeName1} ${typeName2}`);
            assert.ok(graph.getVertices().includes(typeName1), 'should include type1');
            assert.ok(graph.getVertices().includes(typeName2), 'should include type2');
        });

        it('should parse parent-child declarations', () => {
            let parent = 'parent';
            let child = 'child';
            let graph = subject.parseInheritance(`${child} - ${parent}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child), 'should include child');
            assert.ok(graph.getEdgesFrom(child).includes(parent), 'child should have parent');
            assert.ok(graph.getEdgesFrom(parent).length == 0, 'parent should not have parent');
        });

        it('should parse parent-2children declarations', () => {
            let parent = 'parent';
            let child1 = 'child1';
            let child2 = 'child2';
            let graph = subject.parseInheritance(`${child1} ${child2} - ${parent}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child1), 'should include child1');
            assert.ok(graph.getVertices().includes(child2), 'should include child2');
            assert.ok(graph.getEdgesFrom(child1).includes(parent), 'child1 should have parent');
            assert.ok(graph.getEdgesFrom(child2).includes(parent), 'child2 should have parent');
            assert.ok(graph.getEdgesFrom(parent).length == 0, 'parent should not have parent');
        });

        it('should parse parent-child and orphan declarations', () => {
            let parent = 'parent';
            let child = 'child';
            let orphan = 'orphan';
            let graph = subject.parseInheritance(`${child} - ${parent} ${orphan}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child), 'should include child');
            assert.ok(graph.getVertices().includes(orphan), 'should include orphan');

            assert.ok(graph.getEdgesFrom(child).includes(parent), 'child should have parent');
            assert.ok(graph.getEdgesFrom(parent).length == 0, 'parent should not have parent');
            assert.ok(graph.getEdgesFrom(orphan).length == 0, 'orphan should not have parent');
        });

        it('should parse 2 parent-child declarations', () => {
            let parent1 = 'parent1';
            let child1 = 'child1';
            let parent2 = 'parent2';
            let child2 = 'child2';
            let graph = subject.parseInheritance(`${child1} - ${parent1} ${child2} - ${parent2}`);
            assert.ok(graph.getEdgesFrom(child1).includes(parent1), 'child1 should have parent1');
            assert.ok(graph.getEdgesFrom(child2).includes(parent2), 'child2 should have parent2');
        });
    });

    describe('#toTypeObjects', () =>{
        it('should form object-type map', () =>{
            let type1 = "type1";
            let object1 = "object1";
            let graph = new DirectionalGraph();
            graph.addEdge(object1, type1);

            let typeObjects = Parser.toTypeObjects(graph);

            assert.ok(typeObjects.length == 1, 'there should be 1 type');
            assert.ok(typeObjects[0].type == type1, 'the type should be type1');
            assert.ok(typeObjects[0].objects.length == 1, 'the # of objects should be 1');
            assert.ok(typeObjects[0].objects[0] == object1, 'the object should be object1');
        });

        it('should form 2object-type map', () =>{
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            let graph = new DirectionalGraph();
            graph.addEdge(object1, type1);
            graph.addEdge(object2, type1);
            
            let typeObjects = Parser.toTypeObjects(graph);

            assert.ok(typeObjects.length == 1, 'there should be 1 type');
            assert.ok(typeObjects[0].type == type1, 'the type should be type1');
            assert.ok(typeObjects[0].objects.includes(object1), 'the object should be object1');
            assert.ok(typeObjects[0].objects.includes(object2), 'the object should be object2');
        });
    });
});

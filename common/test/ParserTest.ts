/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser, DirectionalGraph, DomainInfo, Variable, Parameter, ProblemInfo, ObjectInstance } from '../src/parser'
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

        it('should parse single type declaration with a dash', () => {
            let typeName = 'basic-type1';
            let graph = subject.parseInheritance(typeName);
            assert.ok(graph.getVertices().includes(typeName), 'should include basic-type1');
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
            assert.ok(graph.getVerticesWithEdgesFrom(child).includes(parent), 'child should have parent');
            assert.ok(graph.getVerticesWithEdgesFrom(parent).length == 0, 'parent should not have parent');
        });

        it('should parse parent-2children declarations', () => {
            let parent = 'parent';
            let child1 = 'child1';
            let child2 = 'child2';
            let graph = subject.parseInheritance(`${child1} ${child2} - ${parent}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child1), 'should include child1');
            assert.ok(graph.getVertices().includes(child2), 'should include child2');
            assert.ok(graph.getVerticesWithEdgesFrom(child1).includes(parent), 'child1 should have parent');
            assert.ok(graph.getVerticesWithEdgesFrom(child2).includes(parent), 'child2 should have parent');
            assert.ok(graph.getVerticesWithEdgesFrom(parent).length == 0, 'parent should not have parent');
        });

        it('should parse parent-child and orphan declarations', () => {
            let parent = 'parent';
            let child = 'child';
            let orphan = 'orphan';
            let graph = subject.parseInheritance(`${child} - ${parent} ${orphan}`);
            assert.ok(graph.getVertices().includes(parent), 'should include parent');
            assert.ok(graph.getVertices().includes(child), 'should include child');
            assert.ok(graph.getVertices().includes(orphan), 'should include orphan');

            assert.ok(graph.getVerticesWithEdgesFrom(child).includes(parent), 'child should have parent');
            assert.ok(graph.getVerticesWithEdgesFrom(parent).length == 0, 'parent should not have parent');
            assert.ok(graph.getVerticesWithEdgesFrom(orphan).length == 1, 'orphan should not have "object" parent');
        });

        it('should parse 2 parent-child declarations', () => {
            let parent1 = 'parent1';
            let child1 = 'child1';
            let parent2 = 'parent2';
            let child2 = 'child2';
            let graph = subject.parseInheritance(`${child1} - ${parent1} ${child2} - ${parent2}`);
            assert.ok(graph.getVerticesWithEdgesFrom(child1).includes(parent1), 'child1 should have parent1');
            assert.ok(graph.getVerticesWithEdgesFrom(child2).includes(parent2), 'child2 should have parent2');
        });
    });

    describe('#toTypeObjects', () => {
        it('should form object-type map', () => {
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

        it('should form 2object-type map', () => {
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            let graph = new DirectionalGraph();
            graph.addEdge(object1, type1);
            graph.addEdge(object2, type1);

            let typeObjects = Parser.toTypeObjects(graph);

            assert.ok(typeObjects.length == 1, 'there should be 1 type');
            assert.equal(typeObjects[0].type, type1, 'the type should be type1');
            assert.ok(typeObjects[0].objects.includes(object1), 'the object should be object1');
            assert.ok(typeObjects[0].objects.includes(object2), 'the object should be object2');
        });
    });


    describe('#parsePredicatesOrFunctions', () => {
        it('finds one predicate', () => {
            // GIVEN
            let predicatePddl = `(said_hello)
`;
            // WHEN
            let variables = Parser.parsePredicatesOrFunctions(predicatePddl);

            assert.equal(variables.length, 1, 'there should be 1 predicate');
            assert.equal(variables[0].getFullName(), "said_hello", 'the predicate name should be...');
        });
    });

    describe('#parseParameters', () => {
        it('finds one parameter', () => {
            // GIVEN
            let predicatePddl = `predicate1 ?p - type1`;

            // WHEN
            let parameters = Parser.parseParameters(predicatePddl);

            assert.equal(parameters.length, 1, 'there should be 1 parameter');
            assert.equal(parameters[0].name, 'p', 'the parameter name should be...');
            assert.equal(parameters[0].type, 'type1', 'the parameter type should be...');
        });

        it('finds two parameters in ?p1 - type1 ?p2 - type2', () => {
            // GIVEN
            let predicatePddl = `predicate1 ?p1 - type1 ?p2 - type2`;

            // WHEN
            let parameters = Parser.parseParameters(predicatePddl);

            assert.equal(parameters.length, 2, 'there should be 2 parameters');
            assert.equal(parameters[0].name, 'p1', 'the parameter name should be...');
            assert.equal(parameters[0].type, 'type1', 'the parameter name should be...');
            assert.equal(parameters[1].name, 'p2', 'the parameter name should be...');
            assert.equal(parameters[1].type, 'type2', 'the parameter name should be...');
        });

        it('finds two parameters in ?p1 ?p2 - type2', () => {
            // GIVEN
            let predicatePddl = `predicate1 ?p1 ?p2 - type2`;

            // WHEN
            let parameters = Parser.parseParameters(predicatePddl);

            // THEN
            assert.equal(parameters.length, 2, 'there should be 2 parameters');
            assert.equal(parameters[0].name, 'p1', 'the parameter name should be...');
            assert.equal(parameters[0].type, 'type2', 'the parameter name should be...');
            assert.equal(parameters[1].name, 'p2', 'the parameter name should be...');
            assert.equal(parameters[1].type, 'type2', 'the parameter name should be...');
        });
    });

    describe('#parseDerived', () => {
        let domainPddl = `(define (domain Depot-Derived)
        (:requirements :typing :durative-actions)
        (:types place locatable - object
                depot distributor - place
                truck hoist surface - locatable
                pallet crate - surface)
        
        (:predicates (at ?x - locatable ?y - place) 
                     (on ?x - crate ?y - surface)
                     (in ?x - crate ?y - truck)
                     (lifting ?x - hoist ?y - crate)
                     (available ?x - hoist)
                     (clear ?x - surface))
        
        (:derived (can-lift ?c - crate ?s - surface) ; can lift crate from the surface
           (and (clear ?c) (on ?c ?s)))
        
        (:derived (c) (+ (a) (b))`;

        it('extracts one derived predicate', () => {
            // GIVEN
            // WHEN
            let derived = new Parser().parseDerived(domainPddl);

            // THEN
            assert.equal(derived.length, 2, 'there should be 2 derived variables');
            assert.equal(derived[0].name, 'can-lift');
            assert.equal(derived[0].parameters.length, 2);
            assert.ok(derived[0].getDocumentation().startsWith('can lift'));
            assert.equal(derived[1].name, 'c');
        });
    });

    describe('#getDomainStructure', () => {
        it('extracts structure even when the :types section is not defined', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:predicates 
                (said_hello)
            )
            )`;
            let domainInfo = new DomainInfo("uri", 1, "helloworld");

            // WHEN
            new Parser().getDomainStructure(domainPddl, domainInfo);

            // THEN
            assert.equal(1, domainInfo.getPredicates().length, 'there should be 1 predicate');
            assert.equal(0, domainInfo.getTypes().length, 'there should be 0 types');
            assert.equal(0, domainInfo.getFunctions().length, 'there should be 0 functions');
        });

        it('extracts predicate', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:predicates 
                (said_hello)
            )
            )`;
            let domainInfo = new DomainInfo("uri", 1, "helloworld");

            // WHEN
            new Parser().getDomainStructure(domainPddl, domainInfo);

            assert.equal(domainInfo.getPredicates().length, 1, 'there should be 1 predicate');
            assert.equal(domainInfo.getPredicates()[0].getFullName(), "said_hello", 'the predicate should be "said_hello"');
        });

        it('extracts function', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:functions 
                (count)
            )
            )`;
            let domainInfo = new DomainInfo("uri", 1, "helloworld");

            // WHEN
            new Parser().getDomainStructure(domainPddl, domainInfo);

            assert.equal(domainInfo.getFunctions().length, 1, 'there should be 1 function');
            assert.equal(domainInfo.getFunctions()[0].getFullName(), "count", 'the function should be "count"');
        });

        it('extracts types', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:types 
                type1
            )
            )`;
            let domainInfo = new DomainInfo("uri", 1, "helloworld");

            // WHEN
            new Parser().getDomainStructure(domainPddl, domainInfo);

            assert.equal(domainInfo.getTypes().length, 1, 'there should be 1 type');
            assert.equal(domainInfo.getTypes()[0], "type1", 'the function should be "count"');
        });

        
        it('extracts types with dashes', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:types 
                some-type1
            )
            )`;
            let domainInfo = new DomainInfo("uri", 1, "helloworld");

            // WHEN
            new Parser().getDomainStructure(domainPddl, domainInfo);

            assert.equal(domainInfo.getTypes().length, 1, 'there should be 1 type');
            assert.equal(domainInfo.getTypes()[0], "some-type1", 'the function should be "count"');
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
            let problemInfo = new ProblemInfo("uri", 1, "p1", "d1");

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
            let problemInfo = new ProblemInfo("uri", 1, "p1", "d1");

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

describe('DomainInfo', () => {

    describe('#getTypeLocation', () => {
        it('finds type location in multi-line declaration', () => {
            // GIVEN
            let domainInfo = new DomainInfo("/uri", 1.0, "name");
            domainInfo.text = `(define (domain generator)
            (:requirements :fluents :durative-actions :duration-inequalities
                    :negative-preconditions :typing)
            
            (:types generator tankstelle ; comment
            tank)
            `;
            
            // WHEN
            let range = domainInfo.getTypeLocation('tank');

            // THEN
            assert.ok(range != null, "range should not be null");
            assert.equal(range.startLine, 5);
            assert.equal(range.endLine, 5);
            assert.equal(range.startCharacter, 12);
            assert.equal(range.endCharacter, 16);
        });

        it('finds type location in single line declaration', () => {
            // GIVEN
            let domainInfo = new DomainInfo("/uri", 1.0, "name");
            domainInfo.text = `(define (domain generator) (:types generator tankstelle tank)`;
            
            // WHEN
            let range = domainInfo.getTypeLocation('tank');

            // THEN
            assert.ok(range != null, "range should not be null");
            assert.equal(range.startLine, 0);
            assert.equal(range.endLine, 0);
            assert.equal(range.startCharacter, 56);
            assert.equal(range.endCharacter, 56 + 4);
        });
    });

    describe('#getTypeReferences', () => {
        it('finds all references', () => {
            // GIVEN
            let domainInfo = new DomainInfo("/uri", 1.0, "name");
            domainInfo.text = `(define (domain generator)
            (:requirements :fluents :durative-actions :duration-inequalities
                    :negative-preconditions :typing)
            
            (:types tank - generator)
            
            (:predicates 
                (generator-ran) ; Flags that the generator ran
                (used ?t - tank) ; To force the planner to empty the entire tank in one action (rather than bit by bit), we mark the tank as 'used'
            )
            
            (:functions 
                (fuel-level ?t - generator) ; Fuel level in the generator
                (fuel-reserve ?t - tank) ; Fuel reserve in the tank
                (refuel-rate ?g - generator) ; Refuel rate of the generator
                (capacity ?g - generator) ; Total fuel-capacity of the generator
            )
            
            (:durative-action generate
                :parameters (?g - generator)
                :duration (= ?duration  100) ; arbitrarily the duration is set to 100 time-units
                :condition 
                    (over all (>= (fuel-level ?g) 0))
                :effect (and 
                    (decrease (fuel-level ?g) (* #t 1))
                    (at end (generator-ran))
                )
            )
            `;
            
            // WHEN
            let ranges = domainInfo.getTypeReferences('generator');

            // THEN
            assert.equal(ranges.length, 5, "there should be N hits");
            let range = ranges[0];
            assert.equal(range.startLine, 4);
            assert.equal(range.endLine, 4);
            assert.equal(range.startCharacter, 27);
            assert.equal(range.endCharacter, 36);
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
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { ProblemInfo } from '../src/ProblemInfo';
import { Variable, Parameter, ObjectInstance } from '../src/FileInfo';
import * as assert from 'assert';
import { Grounder } from '../src/Grounder';
import { PddlSyntaxTree } from '../src/PddlSyntaxTree';
import { SimpleDocumentPositionResolver } from '../src/DocumentPositionResolver';
import { DomainInfo, TypeObjectMap } from '../src/DomainInfo';
import { DirectionalGraph } from '../src/DirectionalGraph';

describe('Grounder', () => {

    beforeEach(function () {
    });

    describe('#ground', () => {
        it('grounds un-parameterized variable', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let liftedVariable = new Variable("cost", []);

            // WHEN
            let groundedVariables = new Grounder(domain, problem).ground(liftedVariable);

            assert.equal(groundedVariables.length, 1);
        });

        it('grounds 1-parameterized variable with no objects', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            domain.setTypeInheritance(new DirectionalGraph().addEdge("type1", "object"));
            let liftedVariable = new Variable("cost", [new Parameter("p1", "type1")]);

            // WHEN
            let groundedVariables = new Grounder(domain, problem).ground(liftedVariable);

            assert.equal(groundedVariables.length, 0);
        });

        it('grounds 1-parameterized variable with one object', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let type1 = "type1";
            let object1 = "object1";
            problem.setObjects(new TypeObjectMap().addAll(type1, [object1]));
            let liftedVariable = new Variable("cost", [new Parameter("p1", type1)]);

            // WHEN
            let groundedVariables = new Grounder(domain, problem).ground(liftedVariable);

            assert.equal(groundedVariables.length, 1, "there should be 1 grounded variable");
            assert.equal(groundedVariables[0].parameters.length, 1, "the grounded variable should have 1 parameter");
            assert.equal((<ObjectInstance>groundedVariables[0].parameters[0]).name, object1);
        });

        it('grounds 1-parameterized variable with one child-type object', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let parent = "parent";
            let child = "child";
            let object1 = "object1";
            domain.setTypeInheritance(new DirectionalGraph().addEdge("child", "parent"));
            problem.setObjects(new TypeObjectMap().add(child, object1));
            let liftedVariable = new Variable("cost", [new Parameter("p1", parent)]);

            // WHEN
            let groundedVariables = new Grounder(domain, problem).ground(liftedVariable);

            assert.equal(groundedVariables.length, 1, "there should be 1 grounded variable");
            assert.equal(groundedVariables[0].parameters.length, 1, "the grounded variable should have 1 parameter");
            assert.equal((<ObjectInstance>groundedVariables[0].parameters[0]).name, object1);
        });

        it('grounds 1-parameterized variable with two objects', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            problem.setObjects(new TypeObjectMap().addAll(type1, [object1, object2]));
            let liftedVariable = new Variable("cost", [new Parameter("p1", type1)]);

            // WHEN
            let groundedVariables = new Grounder(domain, problem).ground(liftedVariable);

            assert.equal(groundedVariables.length, 2, "there should be 2 grounded variables");
        });

        it('grounds 2-parameterized variable with two objects', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            problem.setObjects(new TypeObjectMap().addAll(type1, [object1, object2]));
            let liftedVariable = new Variable("cost", [new Parameter("p1", type1), new Parameter("p2", type1)]);

            // WHEN
            let groundedVariables = new Grounder(domain, problem).ground(liftedVariable);

            assert.equal(groundedVariables.length, 4, "there should be N grounded variables");
        });
    });

    describe('#getObjects', () => {
        it('get objects for 1 type', () => {
            // GIVEN
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            problem.setObjects(new TypeObjectMap().addAll(type1, [object1, object2]));
            domain.setTypeInheritance(new DirectionalGraph().addEdge(type1, "object"));

            // WHEN
            let objects = new Grounder(domain, problem).getObjects([type1]);

            // THEN
            assert.strictEqual(objects.length, 1, "there should be 1 set of objects for 1 type");
            assert.deepStrictEqual(objects[0], [object1, object2], "there should be 2 objects for 1 type");
        });

        it('get objects for 2 types', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());

            let type1 = "type1";
            let type1object1 = "t1object1";
            let type1object2 = "t1object2";

            let type2 = "type2";
            let type2object1 = "t2object1";
            let type2object2 = "t2object2";

            problem.setObjects(new TypeObjectMap()
                .addAll(type1, [type1object1, type1object2])
                .addAll(type2, [type2object1, type2object2])
            );

            // WHEN
            let objects = new Grounder(domain, problem).getObjects([type1, type2]);

            assert.equal(objects.length, 2, "there should be 2 sets of objects for 2 types");
            assert.deepEqual(objects[0], [type1object1, type1object2], "there should be 2 objects for type1");
            assert.deepEqual(objects[1], [type2object1, type2object2], "there should be 2 objects for type2");
        });
    });

    describe('#getObjectPermutations', () => {
        it('get object permutations for 1 type', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let type1 = "type1";
            let object1 = "object1";
            let object2 = "object2";
            problem.setObjects(new TypeObjectMap().addAll(type1, [object1, object2]));

            // WHEN
            let objects = new Grounder(domain, problem).getObjectPermutations([type1]);

            assert.equal(objects.length, 2, "there should be 2 permutations");
            assert.deepEqual(objects, [[object1], [object2]]);
        });

        it('get object permutations for 2 types', () => {
            // GIVEN            
            let domain = new DomainInfo("file://fake", 1, "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());
            let problem = new ProblemInfo("file://fake", 1, "problem1", "domain1", PddlSyntaxTree.EMPTY, createPositionResolver());

            let type1 = "type1";
            let type1object1 = "t1object1";
            let type1object2 = "t1object2";

            let type2 = "type2";
            let type2object1 = "t2object1";
            let type2object2 = "t2object2";

            problem.setObjects(new TypeObjectMap()
                .addAll(type1, [type1object1, type1object2])
                .addAll(type2, [type2object1, type2object2])
            );

            // WHEN
            assert.throws(() => {
                let objects = new Grounder(domain, problem).getObjectPermutations([type1, type2]);

                assert.equal(objects.length, 2, "there should be 2 sets of objects for 2 types");
                assert.deepEqual(objects[0], [type1object1, type1object2], "there should be 2 objects for type1");
                assert.deepEqual(objects[1], [type2object1, type2object2], "there should be 2 objects for type2");
            });
        });
    });
});

function createPositionResolver() {
    return new SimpleDocumentPositionResolver('');
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser } from '../src/parser';
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
            if (domainInfo === null) { return; }
            assert.strictEqual(domainInfo!.name, 'domain_name');
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
            assert.strictEqual(domainInfo, undefined, 'domain should be null');
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

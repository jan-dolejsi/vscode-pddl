/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlRange } from '../src/DocumentPositionResolver';
import { createPddlDomainParser } from './PddlDomainParserTest';

describe('DomainInfo', () => {

    describe('#getTypeLocation', () => {
        it('finds type location in multi-line declaration', () => {
            // GIVEN
            let domainPddl = `(define (domain generator)
            (:requirements :fluents :durative-actions :duration-inequalities
                    :negative-preconditions :typing)
            
            (:types generator tankstelle ; comment
            tank)
            `;

            let domainInfo = createPddlDomainParser(domainPddl).getDomain();           

            // WHEN
            let range = domainInfo.getTypeLocation('tank');

            // THEN
            assert.notStrictEqual(range, undefined, "range should not be null");
            assert.equal(range!.startLine, 5);
            assert.equal(range!.endLine, 5);
            assert.equal(range!.startCharacter, 12);
            assert.equal(range!.endCharacter, 16);
        });

        it('finds type location in single line declaration', () => {
            // GIVEN
            const domainPddl = `(define (domain generator) (:types generator tankstelle tank)`;
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();           
            
            // WHEN
            let range = domainInfo.getTypeLocation('tank');

            // THEN
            assert.notStrictEqual(range, null, "range should not be null");
            assert.equal(range.startLine, 0);
            assert.equal(range.endLine, 0);
            assert.equal(range.startCharacter, 56);
            assert.equal(range.endCharacter, 56 + 4);
        });
    });

    describe('#getTypeReferences', () => {
        it('finds all references', () => {
            // GIVEN
            const domainPddl = `(define (domain generator)
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
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();           
            
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

    describe('#getVariableReferences', () => {
        it('find all predicate references', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name)

(:requirements :typing)

(:types 
    tt1
)

(:constants 
    o1 - tt1
)

(:predicates 
    (p3 - tt1)
)


(:functions 
    (f11 - tt1)
)

(:action t11
    :parameters (?t1 - tt1)
    :precondition (and (p3 ?t1) (p3 ?t1) (p3 o1))
    :effect (and (increase (f11 ?t1) 1))
)
)`;
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();
            assert.deepStrictEqual(domainInfo.getTypes(), ['tt1'], 'there should be 1 type');
            assert.deepStrictEqual(domainInfo.getPredicates().map(p => p.name), ['p3'], 'there should be 1 predicate');
            let p3 = domainInfo.getPredicates()[0];

            // WHEN
            let p3ReferenceRanges = domainInfo.getVariableReferences(p3);

            // THEN
            assert.strictEqual(p3ReferenceRanges.length, 4, 'there should be 3 references to predicate p3');
            assert.deepStrictEqual(p3ReferenceRanges[0], new PddlRange(13, 4, 13, 14), "the first reference location should be"); 
        });

        it('find no predicate references', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name)

(:predicates 
    (p0)
)

(:functions 
    (f11 - tt1)
)
; (p0) appears in a comment
(:action t11
    :parameters (?t1 - tt1)
    :precondition (and (p3 ?t1) (p3 ?t1) (p3 o1))
    :effect (and (increase (f11 ?t1) 1))
)
)`;
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();
            assert.deepStrictEqual(domainInfo.getPredicates().map(p => p.name), ['p0'], 'there should be 1 predicate');
            let p0 = domainInfo.getPredicates()[0];

            // WHEN
            let p0ReferenceRanges = domainInfo.getVariableReferences(p0);

            // THEN
            assert.strictEqual(p0ReferenceRanges.length, 1, 'there should be ONE references to predicate p0 - its declaration');
        });

    });
});
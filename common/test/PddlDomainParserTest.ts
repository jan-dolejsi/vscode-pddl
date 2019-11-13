/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { SimpleDocumentPositionResolver, PddlRange } from '../src/DocumentPositionResolver';
import { PddlDomainParser } from '../src/PddlDomainParser';

describe('PddlDomainParser', () => {

    describe('#constructor', () => {
        it('should parse domain from snippet template', () =>{
            // GIVEN
            let domainPddl = `;Header and description

            (define (domain domain_name)
            
            ;remove requirements that are not needed
            (:requirements :strips :fluents :durative-actions :timed-initial-literals :typing :conditional-effects :negative-preconditions :duration-inequalities :equality)
            
            (:types ;todo: enumerate types and their hierarchy here, e.g. car truck bus - vehicle
            )
            
            ; un-comment following line if constants are needed e.g. red blue - car
            ;(:constants )
            
            (:predicates ;todo: define predicates here
            )
            
            
            (:functions ;todo: define numeric functions here
            )
            
            ;define actions here
            
            )`;

            let domainParser = createPddlDomainParser(domainPddl);

            // WHEN
            let domainInfo = domainParser.getDomain();

            // THEN
            assert.ok(domainInfo);
            assert.strictEqual(domainInfo.name, 'domain_name');
            assert.ok(domainInfo.getRequirements().length > 0, 'there should be requirements');
            assert.deepStrictEqual(domainInfo.getTypes(), [], 'there should be no types');
            assert.deepStrictEqual(domainInfo.getConstants(), [], 'there should be no constants');
            assert.deepStrictEqual(domainInfo.getPredicates(), [], 'there should be no predicates');
            assert.deepStrictEqual(domainInfo.getFunctions(), [], 'there should be no functions');
            assert.deepStrictEqual(domainInfo.getActions(), [], 'there should be no actions');
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
        
        ; can lift crate from the surface
        (:derived (can-lift ?c - crate ?s - surface) ; some additional comment within
           (and (clear ?c) (on ?c ?s)))
        
        (:derived (c) (+ (a) (b))
        ; simulate unfinished document)`;

        it('extracts one derived predicate', () => {
            // GIVEN
            let defineNode = new PddlSyntaxTreeBuilder(domainPddl).getTree().getDefineNodeOrThrow();

            // WHEN
            let derived = PddlDomainParser.parseDerived(defineNode, new SimpleDocumentPositionResolver(domainPddl));

            // THEN
            assert.equal(derived.length, 2, 'there should be 2 derived variables');
            assert.equal(derived[0].name, 'can-lift');
            assert.equal(derived[0].parameters.length, 2);
            assert.ok(derived[0].getDocumentation().join('\n').startsWith('can lift'));
            assert.equal(derived[1].name, 'c');
        });
    });

    describe('#parseDomainStructure', () => {
        it('extracts structure even when the :types section is not defined', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:predicates 
                (said_hello)
            )
            )`;

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

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

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

            assert.equal(domainInfo.getPredicates().length, 1, 'there should be 1 predicate');
            assert.equal(domainInfo.getPredicates()[0].getFullName(), "said_hello", 'the predicate should be "said_hello"');
        });

        it('extracts 2 predicates without whitespace', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips )
            (:predicates 
                (p1)(p2)
            )
            )`;

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

            assert.equal(domainInfo.getPredicates().length, 2, 'there should be 2 predicate');
            assert.equal(domainInfo.getPredicates()[0].getFullName(), "p1", 'the predicate should be "p1"');
            assert.equal(domainInfo.getPredicates()[1].getFullName(), "p2", 'the predicate should be "p2"');
        });

        it('extracts function', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:functions 
                (count)
            )
            )`;

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

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

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

            assert.equal(domainInfo.getTypes().length, 1, 'there should be 1 type');
            assert.equal(domainInfo.getTypes()[0], "type1", 'the function should be "count"');
            assert.deepStrictEqual(domainInfo.getTypeLocation('type1'), new PddlRange(3, 16, 3, 16+'type1'.length));
        });

        it('extracts types with dashes', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
            (:requirements :strips :negative-preconditions )
            (:types 
                some-type1
            )
            )`;

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

            assert.equal(domainInfo.getTypes().length, 1, 'there should be 1 type');
            assert.equal(domainInfo.getTypes()[0], "some-type1", 'the function should be "count"');
        });

        it('extracts action', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
                (:action action1
                    :parameters (?p - type)
                    :precondition (and (not (p)))
                    :effect (and (p))
                )
            )`;

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

            assert.equal(domainInfo.getActions().length, 1, 'there should be 1 action');
            assert.equal(domainInfo.getActions()[0].name, "action1", 'action name');
            assert.ok(!domainInfo.getActions()[0].isDurative(), 'action should be durative');
        });

        it('extracts durative action', () => {
            // GIVEN
            let domainPddl = `(define (domain helloworld)
                (:durative-action action1
                    :parameters (?p - type)
                    :duration (= ?duration 1)
                    :condition (and (at start (not (p))))
                    :effect (and (at end (p)))
                )
            )`;

            // WHEN
            let domainInfo = createPddlDomainParser(domainPddl).getDomain();

            assert.equal(domainInfo.getActions().length, 1, 'there should be 1 action');
            assert.equal(domainInfo.getActions()[0].name, "action1", 'action name');
            assert.ok(domainInfo.getActions()[0].isDurative(), 'action should be durative');
        });
    });
});


export function createPddlDomainParser(domainPddl: string): PddlDomainParser {
    let syntaxTree = new PddlSyntaxTreeBuilder(domainPddl).getTree();
    let domainNode = syntaxTree.getDefineNodeOrThrow().getFirstOpenBracketOrThrow('domain');
    let positionResolver = new SimpleDocumentPositionResolver(domainPddl);

    return new PddlDomainParser("uri", 1, domainPddl, domainNode, syntaxTree, positionResolver);
}

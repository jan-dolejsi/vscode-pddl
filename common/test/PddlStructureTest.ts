/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { PddlStructure } from '../src/PddlStructure';
import { PddlTokenType } from '../src/PddlTokenizer';

describe('PddlStructure', () => {

    describe('#findPrecedingSection()', () => {

        it('finds (domain when asking for :functions', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name) (:action ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();
            let defineNode = tree.getDefineNode();

            // WHEN
            let actualDomainNode = PddlStructure.findPrecedingSection(PddlStructure.FUNCTIONS, defineNode, PddlStructure.PDDL_DOMAIN_SECTIONS);

            // THEN
            assert.notStrictEqual(actualDomainNode, undefined, 'there should be a (domain element');
            assert.strictEqual(actualDomainNode.getToken().tokenText, '(domain');
        });
        
        it('finds (domain when asking for a structure', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name) (:action ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();
            let defineNode = tree.getDefineNode();

            // WHEN
            let actualDomainNode = PddlStructure.findPrecedingSection(':action', defineNode, PddlStructure.PDDL_DOMAIN_SECTIONS);

            // THEN
            assert.notStrictEqual(actualDomainNode, undefined, 'there should be a (domain element');
            assert.strictEqual(actualDomainNode.getToken().tokenText, '(domain');
        });
    });

    describe('#getPrecedingSections()', () => {

        it('preceding of predicates', () => {
            // GIVEN
            // WHEN
            let precedingSections = PddlStructure.getPrecedingSections(PddlStructure.PREDICATES, PddlStructure.PDDL_DOMAIN_SECTIONS);

            // THEN
            assert.deepStrictEqual(precedingSections, ['domain', ':requirements', ':types', ':constants']);
        });

        it('preceding of domain', () => {
            // GIVEN
            // WHEN
            let precedingSections = PddlStructure.getPrecedingSections('domain', PddlStructure.PDDL_DOMAIN_SECTIONS);

            // THEN
            assert.deepStrictEqual(precedingSections, []);
        });
    });
    
    describe('#getFollowingSections()', () => {

        it('following of predicates', () => {
            // GIVEN
            // WHEN
            let followingSections = PddlStructure.getFollowingSections(PddlStructure.PREDICATES, PddlStructure.PDDL_DOMAIN_SECTIONS);

            // THEN
            assert.deepStrictEqual(followingSections, [':functions', ':constraints']);
        });

        it('following of :constraints', () => {
            // GIVEN
            // WHEN
            let followingSections = PddlStructure.getFollowingSections(':constraints', PddlStructure.PDDL_DOMAIN_SECTIONS);

            // THEN
            assert.deepStrictEqual(followingSections, []);
        });
    });

    describe('#getSupportedSectionsHere()', () => {

        it('suggests 0 supported in fully defined PDDL', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:predicates ) `;
            let domainPddlAfter = ` (:functions ) (:action ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(currentNode, currentNode, PddlTokenType.OpenBracketOperator, PddlStructure.PDDL_DOMAIN_SECTIONS, PddlStructure.PDDL_DOMAIN_STRUCTURES);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, []);
        });

        it('suggests 2 supported', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) `;
            let domainPddlAfter = ` (:functions ) (:action ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(currentNode, currentNode, PddlTokenType.OpenBracketOperator, PddlStructure.PDDL_DOMAIN_SECTIONS, PddlStructure.PDDL_DOMAIN_STRUCTURES);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, [':requirements', ':types', ':constants', ':predicates']);
        });

        it('suggests all structures', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:constraints ) `;
            let domainPddlAfter = ` (:action ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(currentNode, currentNode, PddlTokenType.OpenBracketOperator, PddlStructure.PDDL_DOMAIN_SECTIONS, PddlStructure.PDDL_DOMAIN_STRUCTURES);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, PddlStructure.PDDL_DOMAIN_STRUCTURES);
        });

        it('suggests all structures and no sections', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:action ) `;
            let domainPddlAfter = ` )`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(currentNode, currentNode, PddlTokenType.OpenBracketOperator, PddlStructure.PDDL_DOMAIN_SECTIONS, PddlStructure.PDDL_DOMAIN_STRUCTURES);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, PddlStructure.PDDL_DOMAIN_STRUCTURES);
        });

        /* ACTIONS */
        it('suggests 0 supported in fully defined action', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:action :parameters() :precondition(and ) `;
            let domainPddlAfter = ` :effect(and ) ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(PddlStructure.getPrecedingKeywordOrSelf(currentNode), currentNode, PddlTokenType.Keyword, PddlStructure.PDDL_ACTION_SECTIONS, []);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, []);
        });

        it('suggests only :precondition', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:action :parameters() `;
            let domainPddlAfter = ` :effect(and ) ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(PddlStructure.getPrecedingKeywordOrSelf(currentNode), currentNode, PddlTokenType.Keyword, PddlStructure.PDDL_ACTION_SECTIONS, []);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, [':precondition']);
        });

        it('suggests all action keywords', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:action `;
            let domainPddlAfter = ` ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(PddlStructure.getPrecedingKeywordOrSelf(currentNode), currentNode, PddlTokenType.Keyword, PddlStructure.PDDL_ACTION_SECTIONS, []);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, [':parameters', ':precondition', ':effect']);
        });

        it('suggests only :parameters', () => {
            // GIVEN
            let domainPddlBefore = `(define (domain domain_name) (:action `;
            let domainPddlAfter = ` :precondition(and ) :effect(and ) ))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddlBefore+domainPddlAfter).getTree();
            let currentNode = tree.getNodeAt(domainPddlBefore.length);

            // WHEN
            let supportedHere = PddlStructure.getSupportedSectionsHere(PddlStructure.getPrecedingKeywordOrSelf(currentNode), currentNode, PddlTokenType.Keyword, PddlStructure.PDDL_ACTION_SECTIONS, []);

            // THEN
            assert.strictEqual(currentNode.getToken().type, PddlTokenType.Whitespace, 'should be inside whitespace');
            assert.deepStrictEqual(supportedHere, [':parameters']);
        });
    });
});

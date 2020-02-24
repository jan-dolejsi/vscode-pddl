/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { ModelHierarchy, VariableReferenceKind } from '../src/ModelHierarchy';
import { createPddlDomainParser } from './PddlDomainParserTest';

describe('ModelHierarchy', () => {

    describe('#getReferenceInfo', () => {
        it('should get predicate used in pre-condition', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:predicates (p))
            
            (:action a1
                :parameters ()
                :precondition (and (p))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const p = domainInfo?.getPredicates()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(p, pddlText.lastIndexOf('(p)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "condition", "part");
            assert.strictEqual(actual.relevantCode, "(p)", "relevant code");
        });

        it('should get predicate used in effect', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:predicates (p))
            
            (:action a1
                :parameters ()
                :effect (p)
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const p = domainInfo?.getPredicates()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(p, pddlText.lastIndexOf('(p)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.WRITE, "read/write kind");
            assert.strictEqual(actual.part, "effect", "part");
            assert.strictEqual(actual.relevantCode, "(p)", "relevant code");
        });

        it('should get negative predicate precondition', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:predicates (p))
            
            (:action a1
                :parameters ()
                :precondition (not (p))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const p = domainInfo?.getPredicates()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(p, pddlText.lastIndexOf('(p)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "condition", "part");
            assert.strictEqual(actual.relevantCode, "(not (p))", "relevant code");
        });
        
        it('should get predicate used in a not effect', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:predicates (p))
            
            (:action a1
                :parameters ()
                :effect (not (p))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const p = domainInfo?.getPredicates()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(p, pddlText.lastIndexOf('(p)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.WRITE, "read/write kind");
            assert.strictEqual(actual.part, "effect", "part");
            assert.strictEqual(actual.relevantCode, "(not (p))", "relevant code");
        });

        it('should get inequality precondition', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f))
            
            (:action a1
                :parameters ()
                :precondition (> (f) 0)
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const f = domainInfo?.getFunctions()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(f, pddlText.lastIndexOf('(f)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "condition", "part");
            assert.strictEqual(actual.relevantCode, "(> (f) 0)", "relevant code");
        });
        
        it('should get increase effect', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f))
            
            (:action a1
                :parameters ()
                :effect (increase (f) 3.14)
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const f = domainInfo?.getFunctions()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(f, pddlText.lastIndexOf('(f)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.WRITE, "read/write kind");
            assert.strictEqual(actual.part, "effect", "part");
            assert.strictEqual(actual.relevantCode, "(increase (f) 3.14)", "relevant code");
        });

        it('should get inequality at start condition', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f))
            
            (:durative-action a1
                :parameters ()
                :duration(= ?duration 1)
                :condition (at start (> (f) 0))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const f = domainInfo?.getFunctions()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(f, pddlText.lastIndexOf('(f)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "at start", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "condition", "part");
            assert.strictEqual(actual.relevantCode, "(> (f) 0)", "relevant code");
        });
        
        it('should get continuous effect', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f))
            
            (:durative-action a1
                :parameters ()
                :effect (increase (f) (* #t 3.14))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const f = domainInfo?.getFunctions()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(f, pddlText.lastIndexOf('(f)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.WRITE, "read/write kind");
            assert.strictEqual(actual.part, "effect", "part");
            assert.strictEqual(actual.relevantCode, "(increase (f) (* #t 3.14))", "relevant code");
        });

        it('should get duration', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f))
            
            (:durative-action a1
                :parameters ()
                :duration(= ?duration (f))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const f = domainInfo?.getFunctions()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(f, pddlText.lastIndexOf('(f)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "duration", "part");
            assert.strictEqual(actual.relevantCode, "(= ?duration (f))", "relevant code");
        });

        it('should get decrease right-hand side', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f)(g))
            
            (:durative-action a1
                :parameters ()
                :effect (at end (decrease (f) (g)))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const g = domainInfo?.getFunctions().find(f => f.name === 'g');
            if (!g) {
                throw new Error(`Could not find function (g).`);
            }

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(g, pddlText.lastIndexOf('(g)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "a1", "action name");
            assert.strictEqual(actual.getTimeQualifier(), "at end", "action time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "effect", "part");
            assert.strictEqual(actual.relevantCode, "(decrease (f) (g))", "relevant code");
        });

        it('should get predicate used in event pre-condition', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:predicates (p))
            
            (:event e1
                :parameters ()
                :precondition (and (p))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const p = domainInfo?.getPredicates()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(p, pddlText.lastIndexOf('(p)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "e1", "event name");
            assert.strictEqual(actual.getTimeQualifier(), "", "time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.READ, "read/write kind");
            assert.strictEqual(actual.part, "condition", "part");
            assert.strictEqual(actual.relevantCode, "(p)", "relevant code");
        });

        it('should get process effect effect', () => {
            // GIVEN
            let pddlText = `(define (domain d)

            (:functions (f))
            
            (:process p1
                :parameters ()
                :effect (increase (f) (* #t 3.14))
            )
            )`;
            
            let domainInfo = createPddlDomainParser(pddlText).getDomain();
            
            if (!domainInfo) { assert.fail("could not parse test PDDL"); }

            const f = domainInfo?.getFunctions()[0];

            // WHEN
            let actual = new ModelHierarchy(domainInfo).getReferenceInfo(f, pddlText.lastIndexOf('(f)') + 1);

            // THEN
            assert.strictEqual(actual.structure?.getNameOrEmpty(), "p1", "process name");
            assert.strictEqual(actual.getTimeQualifier(), "", "time qualifier");
            assert.strictEqual(actual.kind, VariableReferenceKind.WRITE, "read/write kind");
            assert.strictEqual(actual.part, "effect", "part");
            assert.strictEqual(actual.relevantCode, "(increase (f) (* #t 3.14))", "relevant code");
        });

    });
});

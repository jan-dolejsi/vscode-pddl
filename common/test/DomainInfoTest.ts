/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Parser, DomainInfo } from '../src/parser';
import * as assert from 'assert';
import { PddlRange } from '../src/FileInfo';

describe('DomainInfo', () => {

    describe('#findVariableReferences', () => {
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
            let domainInfo = new DomainInfo("uri", 1, "domain_name");
            domainInfo.setText(domainPddl);
            new Parser().getDomainStructure(domainPddl, domainInfo);
            assert.deepStrictEqual(domainInfo.getTypes(), ['tt1'], 'there should be 1 type');
            assert.deepStrictEqual(domainInfo.getPredicates().map(p => p.name), ['p3'], 'there should be 1 predicate');
            let p3 = domainInfo.getPredicates()[0];

            // WHEN
            let p3ReferenceRanges = domainInfo.getVariableReferences(p3);

            // THEN
            assert.strictEqual(p3ReferenceRanges.length, 4, 'there should be 3 references to predicate p3');
            assert.deepStrictEqual(p3ReferenceRanges[0], new PddlRange(13, 4, 13, 14), "the first reference location should be"); 
        });

    });
});
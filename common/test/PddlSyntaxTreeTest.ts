/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';

describe('PddlSyntaxTree', () => {

    describe('#getDefineNode()', () => {

        it('gets define node', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name))`;
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // WHEN
            let defineNode = tree.getDefineNode();

            // THEN
            assert.notStrictEqual(defineNode, undefined, 'there should be a (define element');
        });
    });
});

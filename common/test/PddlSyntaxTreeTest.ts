/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTree } from '../src/PddlSyntaxTree';
import { PddlTokenType } from '../src/PddlTokenizer';

describe('PddlSyntaxTree', () => {

    describe('#getBreadcrumbs()', () => {

        it('parses trivial whitespace', () => {
            // GIVEN
            let domainPddl = ` `;

            // WHEN
            let breadcrumbs = new PddlSyntaxTree(domainPddl, 0).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 1, 'there should be one whitespace');
            let breadcrumb0 = breadcrumbs[0];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Whitespace);
        });

        it('parses comment', () => {
            // GIVEN
            let domainPddl = `; comment`;
 
            // WHEN
            let breadcrumbs = new PddlSyntaxTree(domainPddl, 0).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 1, 'there should be one comment');
            let breadcrumb0 = breadcrumbs[0];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Comment);
        });

        it('parses comment + whitespace', () => {
            // GIVEN
            let domainPddl = ';X\r\n';

            // WHEN
            let breadcrumbs = new PddlSyntaxTree(domainPddl, 3).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 1, 'there should be one whitespace');
            let breadcrumb0 = breadcrumbs[0];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Whitespace);
        });

        it('parses one open bracket', () => {
            // GIVEN
            let domainPddl = `(define`;

            // WHEN
            let breadcrumbs = new PddlSyntaxTree(domainPddl, 3).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 1, 'there should be one whitespace');
            let breadcrumb0 = breadcrumbs[0];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.OpenBracketOperator);
            assert.strictEqual(breadcrumb0.tokenText, domainPddl);
        });

        it('parses one predicate', () => {
            // GIVEN
            let domainPddl = `(p)`;

            // WHEN
            let breadcrumbs = new PddlSyntaxTree(domainPddl, domainPddl.length).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 0, 'there should be no breadcrumbs');
        });

        it('parses define domain', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name))`;

            // WHEN
            let position = 20;
            let breadcrumbs = new PddlSyntaxTree(domainPddl, position).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 3, 'there should be 3 nodes');
            let tokenTypes = breadcrumbs.map(f => f.type);
            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Other,
            ]);
            assert.strictEqual(breadcrumbs[0].tokenText, '(define');
            assert.strictEqual(breadcrumbs[1].tokenText, '(domain');
            assert.strictEqual(breadcrumbs[2].tokenText, 'domain_name');
        });

        it('parses requirements', () => {
            // GIVEN
            let domainPddl = `(:requirements :typing :fluents)`;

            // WHEN
            let position = 26;
            let breadcrumbs = new PddlSyntaxTree(domainPddl, position).getBreadcrumbs();

            // THEN
            assert.strictEqual(breadcrumbs.length, 2, 'there should be 2 nodes');
            let tokenTypes = breadcrumbs.map(f => f.type);
            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Keyword,
            ]);
            assert.strictEqual(breadcrumbs[0].tokenText, '(:requirements');
            assert.strictEqual(breadcrumbs[1].tokenText, ':fluents');
        });
    });
});
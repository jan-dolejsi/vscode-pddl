/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlSyntaxTreeBuilder } from '../src/PddlSyntaxTreeBuilder';
import { PddlTokenType } from '../src/PddlTokenizer';

describe('PddlSyntaxTreeBuilder', () => {

    describe('#getBreadcrumbs()', () => {

        it('parses empty document', () => {
            // GIVEN
            let domainPddl = '';

            // WHEN
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(0);

            // THEN
            assert.strictEqual(breadcrumbs.length, 1, 'there should be one - document tree node');
            let breadcrumb0 = breadcrumbs[0];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Document);
        });

        it('parses trivial whitespace', () => {
            // GIVEN
            let domainPddl = ` `;

            // WHEN
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(1);

            // THEN
            assert.strictEqual(breadcrumbs.length, 2, 'there should be one whitespace');
            let breadcrumb0 = breadcrumbs[1];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Whitespace);
        });

        it('parses comment', () => {
            // GIVEN
            let domainPddl = `; comment`;
 
            // WHEN
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(1);

            // THEN
            assert.strictEqual(breadcrumbs.length, 2, 'there should be one document and one comment');
            let breadcrumb0 = breadcrumbs[1];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Comment);
        });

        it('parses comment + whitespace', () => {
            // GIVEN
            let domainPddl = ';X\r\n';

            // WHEN
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(3);

            // THEN
            assert.strictEqual(breadcrumbs.length, 2, 'there should be one document and one whitespace');
            let breadcrumb0 = breadcrumbs[1];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.Whitespace);
        });

        it('parses one open bracket', () => {
            // GIVEN
            let domainPddl = `(define`;

            // WHEN
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(3);

            // THEN
            assert.strictEqual(breadcrumbs.length, 2, 'there should be one document and one open bracket');
            let breadcrumb0 = breadcrumbs[1];
            assert.strictEqual(breadcrumb0.type, PddlTokenType.OpenBracketOperator);
            assert.strictEqual(breadcrumb0.tokenText, domainPddl);
        });

        it('parses one predicate', () => {
            // GIVEN
            let domainPddl = `(p)`;

            // WHEN
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(domainPddl.length-1);

            // THEN
            assert.strictEqual(breadcrumbs.length, 3, 'there should be # of breadcrumbs');
            let tokenTypes = breadcrumbs.map(f => f.type);
            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.Document,
                PddlTokenType.OpenBracket,
                PddlTokenType.Other,
            ]);
        });

        it('parses define domain', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name))`;

            // WHEN
            let position = 20;
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(position);

            // THEN
            assert.strictEqual(breadcrumbs.length, 4, 'there should be 4 nodes');
            let tokenTypes = breadcrumbs.map(f => f.type);
            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.Document,
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Other,
            ]);
            assert.strictEqual(breadcrumbs[1].tokenText, '(define');
            assert.strictEqual(breadcrumbs[2].tokenText, '(domain');
            assert.strictEqual(breadcrumbs[3].tokenText, 'domain_name');
        });

        it('parses requirements', () => {
            // GIVEN
            let domainPddl = `(:requirements :typing :fluents)`;

            // WHEN
            let position = 26;
            let breadcrumbs = new PddlSyntaxTreeBuilder(domainPddl).getBreadcrumbs(position);

            // THEN
            assert.strictEqual(breadcrumbs.length, 3, 'there should be 3 nodes');
            let tokenTypes = breadcrumbs.map(f => f.type);
            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.Document,
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Keyword,
            ]);
            assert.strictEqual(breadcrumbs[1].tokenText, '(:requirements');
            assert.strictEqual(breadcrumbs[2].tokenText, ':fluents');
        });
    });


    describe('#getTree()', () => {

        it('parses empty document', () => {
            // GIVEN
            let domainPddl = '';

            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getRootNode().getChildren().length, 0, 'there should be one 0 tree nodes');
            assert.strictEqual(tree.getNodeAt(0).getToken().type, PddlTokenType.Document);
        });

        it('parses trivial whitespace', () => {
            // GIVEN
            let domainPddl = ` `;

            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getNodeAt(1).getToken().type, PddlTokenType.Whitespace, 'there should be one whitespace');
        });

        it('parses comment', () => {
            // GIVEN
            let domainPddl = `; comment`;
 
            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getNodeAt(1).getToken().type, PddlTokenType.Comment, 'there should be one document and one comment');
        });

        it('parses comment + whitespace', () => {
            // GIVEN
            let domainPddl = ';X\r\n';

            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getRootNode().getChildren().length, 2, 'there should be one comment and one whitespace');
            assert.deepStrictEqual(tree.getRootNode().getChildren().map(c => c.getToken().type), [
                PddlTokenType.Comment,
                PddlTokenType.Whitespace
            ]);

            assert.strictEqual(tree.getNodeAt(1).getToken().type, PddlTokenType.Comment);
            assert.strictEqual(tree.getNodeAt(3).getToken().type, PddlTokenType.Whitespace);
        });

        it('parses one open bracket', () => {
            // GIVEN
            let domainPddl = `(define`;

            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getRootNode().getChildren().length, 1, 'there should be one open bracket');
            let node0 = tree.getNodeAt(1);
            assert.strictEqual(node0.getToken().type, PddlTokenType.OpenBracketOperator);
            assert.strictEqual(node0.getToken().tokenText, domainPddl);
        });

        it('parses one predicate', () => {
            // GIVEN
            let domainPddl = `(p)`;

            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getNodeAt(2).getToken().type, PddlTokenType.Other);
            assert.strictEqual(tree.getRootNode().getSingleChild().getToken().type, PddlTokenType.OpenBracket);
            assert.strictEqual(tree.getRootNode().getSingleChild().getSingleChild().getToken().tokenText, 'p');
        });

        it('parses define domain', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name))`;

            // WHEN
            let position = 20;
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            // THEN
            assert.strictEqual(tree.getNodeAt(position).getToken().tokenText, 'domain_name');
            assert.strictEqual(tree.getRootNode().getSingleNonWhitespaceChild().getSingleNonWhitespaceChild().getSingleNonWhitespaceChild().getToken().tokenText, 'domain_name');
        });

        it('parses requirements', () => {
            // GIVEN
            let domainPddl = `(:requirements :typing :fluents)`;

            // WHEN
            let position = 6;
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();
            let reqs = tree.getNodeAt(position);

            // THEN
            assert.strictEqual(reqs.getNonWhitespaceChildren().length, 2, 'there should be 2 reqs');
            let tokenTypes = reqs.getNestedChildren().map(f => f.getToken().type);
            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.Whitespace,
                PddlTokenType.Keyword,
                PddlTokenType.Keyword,
            ]);

            assert.strictEqual(tree.getRootNode().getStart(), 0, 'requirements start');
            assert.strictEqual(tree.getRootNode().getEnd(), 32, 'requirements end');

            assert.strictEqual(reqs.getStart(), 0, 'requirements start');
            assert.strictEqual(reqs.getEnd(), 32, 'requirements end');

            assert.strictEqual(reqs.getChildren()[1].getToken().getStart(), 15, 'typing start');
            assert.strictEqual(reqs.getChildren()[1].getToken().getEnd(), 22, 'typing end');
            assert.strictEqual(reqs.getChildren()[1].getStart(), 15, 'typing start');
            assert.strictEqual(reqs.getChildren()[1].getEnd(), 23, 'typing end');
        });

        it('parses action', () => {
            // GIVEN
            let domainPddl = `(:action name
                :parameters (?p - t)
            )`;

            // WHEN
            let tree = new PddlSyntaxTreeBuilder(domainPddl).getTree();

            let action = tree.getRootNode().getSingleChild();
            assert.strictEqual(action.getToken().tokenText, '(:action');
            let actionName = action.getNonWhitespaceChildren()[0];
            assert.strictEqual(actionName.getToken().tokenText, 'name');
            let parameters = action.getChildren()[3];
            let parametersBracket = parameters.getSingleNonWhitespaceChild();
            let parametersChildren = parametersBracket.getNestedChildren().map(c => c.getToken().type);
            assert.deepStrictEqual(parametersChildren, [
                PddlTokenType.Parameter,
                PddlTokenType.Whitespace,
                PddlTokenType.Dash,
                PddlTokenType.Whitespace,
                PddlTokenType.Other,
            ]);
        });
    });
});
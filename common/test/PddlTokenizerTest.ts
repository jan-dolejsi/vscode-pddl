/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlToken, PddlTokenizer, PddlTokenType } from '../src/PddlTokenizer';

describe('PddlTokenizer', () => {

    describe('#constructor', () => {
        it('parses domain', () => {
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
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.ok(true, 'parses the whole domain');
        });

        it('parses trivial whitespace', () => {
            // GIVEN
            let domainPddl = ` `;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 1, 'there should be one whitespace');
            let fragment0 = fragments[0];
            assert.strictEqual(fragment0.type, PddlTokenType.Whitespace);
            assert.strictEqual(fragment0.tokenText, domainPddl);
            assert.strictEqual(fragment0.getStart(), 0, 'start');
            assert.strictEqual(fragment0.getEnd(), 1, 'end');
        });

        it('parses whitespace', () => {
            // GIVEN
            let domainPddl = `
            `;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 1, 'there should be one whitespace');
            let fragment0 = fragments[0];
            assert.strictEqual(fragment0.type, PddlTokenType.Whitespace);
            assert.strictEqual(fragment0.tokenText, domainPddl);
        });

        it('parses comment', () => {
            // GIVEN
            let domainPddl = `; comment`;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 1, 'there should be one comment');
            let fragment0 = fragments[0];
            assert.strictEqual(fragment0.type, PddlTokenType.Comment);
            assert.strictEqual(fragment0.tokenText, domainPddl);
        });

        it('parses 2 comments', () => {
            // GIVEN
            let comment1 = '; comment1';
            let comment2 = '; comment2';
            let domainPddl = comment1 + '\n' + comment2;

            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 3, 'there should tokens');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.Comment,
                PddlTokenType.Whitespace,
                PddlTokenType.Comment,
            ]);

            assert.strictEqual(fragments[0].type, PddlTokenType.Comment);
            assert.strictEqual(fragments[0].tokenText, comment1);
            assert.strictEqual(fragments[2].type, PddlTokenType.Comment);
            assert.strictEqual(fragments[2].tokenText, comment2);
        });

        it('parses 3 comments', () => {
            // GIVEN
            let comment1 = ';c1';
            let comment2 = ';c22';
            let comment3 = ';c333';
            let domainPddl = comment1 + '\r\n' + comment2 + '\n' + comment3;

            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 5, 'there should tokens');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.Comment,
                PddlTokenType.Whitespace,
                PddlTokenType.Comment,
                PddlTokenType.Whitespace,
                PddlTokenType.Comment,
            ]);

            assert.strictEqual(fragments[0].type, PddlTokenType.Comment);
            assert.strictEqual(fragments[0].tokenText, comment1);
            assert.strictEqual(fragments[2].type, PddlTokenType.Comment);
            assert.strictEqual(fragments[2].tokenText, comment2);
            assert.strictEqual(fragments[4].type, PddlTokenType.Comment);
            assert.strictEqual(fragments[4].tokenText, comment3);
        });

        it('parses comment + whitespace', () => {
            // GIVEN
            let domainPddl = ';X\r\n';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 2, 'there should be two fragments');
            assert.strictEqual(fragments[0].type, PddlTokenType.Comment);
            assert.strictEqual(fragments[0].tokenText, ';X');
            assert.strictEqual(fragments[0].getStart(), 0, 'comment start');
            assert.strictEqual(fragments[0].getEnd(), 2, 'comment end');

            assert.strictEqual(fragments[1].type, PddlTokenType.Whitespace);
            assert.strictEqual(fragments[1].tokenText, '\r\n');
            assert.strictEqual(fragments[1].getStart(), 2, 'whitespce start');
            assert.strictEqual(fragments[1].getEnd(), 4, 'whitespace end');
        });

        it('parses one open bracket', () => {
            // GIVEN
            let domainPddl = `(define`;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 1, 'there should be one open bracket');
            let fragment0 = fragments[0];
            assert.strictEqual(fragment0.type, PddlTokenType.OpenBracketOperator);
            assert.strictEqual(fragment0.tokenText, domainPddl);
        });

        it('parses (not-ready) predicate', () => {
            // GIVEN
            const identifier = 'not-ready';
            let predicatePddl = '(' + identifier;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(predicatePddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 2, 'there should be one open bracket and identifier');
            let fragment0 = fragments[0];
            assert.strictEqual(fragment0.type, PddlTokenType.OpenBracket);
            assert.strictEqual(fragment0.tokenText, '(');

            let fragment1 = fragments[1];
            assert.strictEqual(fragment1.type, PddlTokenType.Other);
            assert.strictEqual(fragment1.tokenText, identifier);
        });

        it('parses define domain', () => {
            // GIVEN
            let domainPddl = `(define (domain domain_name))`;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 7, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Whitespace,
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Whitespace,
                PddlTokenType.Other,
                PddlTokenType.CloseBracket,
                PddlTokenType.CloseBracket
            ]);
            assert.strictEqual(fragments[4].tokenText, 'domain_name');
            assert.strictEqual(fragments[4].getStart(), fragments[3].getEnd(), 'fragment 4 starts where fragment 3 ends');
            assert.strictEqual(fragments[4].getEnd(), fragments[5].getStart(), 'fragment 4 ends where frament 5 starts');
        });

        it('parses requirements', () => {
            // GIVEN
            let domainPddl = `(:requirements :typing)`;
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 4, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Whitespace,
                PddlTokenType.Keyword,
                PddlTokenType.CloseBracket
            ]);
        });

        it('parses parameterized predicate', () => {
            // GIVEN
            let domainPddl = '(p3 ?t1 -type1)';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 8, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracket,
                PddlTokenType.Other,
                PddlTokenType.Whitespace,
                PddlTokenType.Parameter, //?t1
                PddlTokenType.Whitespace,
                PddlTokenType.Dash,
                PddlTokenType.Other, //type1
                PddlTokenType.CloseBracket
            ]);
        });

        it('parses 2 predicates', () => {
            // GIVEN
            let domainPddl = '(p1)(p2)';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 6, 'there should be # of fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracket,
                PddlTokenType.Other,
                PddlTokenType.CloseBracket,
                PddlTokenType.OpenBracket,
                PddlTokenType.Other,
                PddlTokenType.CloseBracket
            ]);
        });

        it ('parses a number', () => {
            let domainPddl = '-3.14';
            let fragments: PddlToken[] = [];
            
            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 1, 'there should be one fragment');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.Other, // -3.14
            ]);
        });

        it('parses multiplication', () => {
            // GIVEN
            let domainPddl = '(* 3.14 #t)';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 6, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracketOperator,
                PddlTokenType.Whitespace,
                PddlTokenType.Other, // 3.14
                PddlTokenType.Whitespace,
                PddlTokenType.Other, // #t
                PddlTokenType.CloseBracket
            ]);
        });

        it('parses continuous effect', () => {
            // GIVEN
            let domainPddl = '(increase (f ?p1) (* 3.14 #t))';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 15, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracketOperator, //(increase
                PddlTokenType.Whitespace,
                PddlTokenType.OpenBracket, //(
                PddlTokenType.Other, //f
                PddlTokenType.Whitespace,
                PddlTokenType.Parameter, //?p1
                PddlTokenType.CloseBracket,
                PddlTokenType.Whitespace,
                PddlTokenType.OpenBracketOperator, // (*
                PddlTokenType.Whitespace,
                PddlTokenType.Other, // 3.14
                PddlTokenType.Whitespace,
                PddlTokenType.Other, // #t
                PddlTokenType.CloseBracket,
                PddlTokenType.CloseBracket
            ]);
        });

        it('parses parameters', () => {
            // GIVEN
            let domainPddl = '(?t1 - tt1)';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 7, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracket, //(
                PddlTokenType.Parameter, //?t1
                PddlTokenType.Whitespace, // 
                PddlTokenType.Dash, //-
                PddlTokenType.Whitespace, // 
                PddlTokenType.Other, //tt1
                PddlTokenType.CloseBracket, //)
            ]);
        });

        it('parses action parameters', () => {
            // GIVEN
            let domainPddl = '(:action t11\n' +
                '    :parameters (?t1 - tt1)\n' +
                ')';
            let fragments: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, fragment => fragments.push(fragment));

            // THEN
            assert.strictEqual(fragments.length, 15, 'there should be fragments');
            let fragmentTypes = fragments.map(f => f.type);
            assert.deepStrictEqual(fragmentTypes, [
                PddlTokenType.OpenBracketOperator,             //(:action
                PddlTokenType.Whitespace, // 
                PddlTokenType.Other, //t11
                PddlTokenType.Whitespace, // 
                PddlTokenType.Keyword, //:parameters
                PddlTokenType.Whitespace, // 
                PddlTokenType.OpenBracket, //(
                PddlTokenType.Parameter,//?t1
                PddlTokenType.Whitespace, // 
                PddlTokenType.Dash, //-
                PddlTokenType.Whitespace, // 
                PddlTokenType.Other, //tt1
                PddlTokenType.CloseBracket, //)
                PddlTokenType.Whitespace, // 
                PddlTokenType.CloseBracket, //)
            ]);
        });

        it('parses assign effect', () => {
            // GIVEN
            let domainPddl = ':effect (assign (f11 ?t1) 1)';
            let tokens: PddlToken[] = [];

            // WHEN
            // tslint:disable-next-line:no-unused-expression
            new PddlTokenizer(domainPddl, token => tokens.push(token));

            // THEN
            assert.strictEqual(tokens.length, 12, 'there should be tokens');
            let tokenTypes = tokens.map(f => f.type);

            assert.deepStrictEqual(tokenTypes, [
                PddlTokenType.Keyword,
                PddlTokenType.Whitespace,
                PddlTokenType.OpenBracketOperator, // (assign
                PddlTokenType.Whitespace,
                PddlTokenType.OpenBracket, // (
                PddlTokenType.Other, //f11
                PddlTokenType.Whitespace,
                PddlTokenType.Parameter, // ?t1
                PddlTokenType.CloseBracket,
                PddlTokenType.Whitespace,
                PddlTokenType.Other, // 1
                PddlTokenType.CloseBracket
            ]);
        });
    });
});
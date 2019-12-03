/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlPosition, PddlRange } from '../src/DocumentPositionResolver';

describe('PddlPosition', () => {

    describe('#atOrBefore', () => {
        it('is at or before itself', () => {
            // GIVEN
            let first = new PddlPosition(1, 1);
            let expected = true;

            // WHEN
            let actual = first.atOrBefore(first);

            // THEN
            assert.strictEqual(actual, expected, "should be atOrBefore itself");
        });

        it('on the same line', () => {
            // GIVEN
            let first = new PddlPosition(1, 1);
            let second = new PddlPosition(1, 10);

            // WHEN
            let firstBeforeSecond = first.atOrBefore(second);
            let secondBeforeFirst = second.atOrBefore(first);

            // THEN
            assert.strictEqual(firstBeforeSecond, true, "1 should be before 10");
            assert.strictEqual(secondBeforeFirst, false, "10 should NOT be before 1");
        });

        it('on the different lines', () => {
            // GIVEN
            let first = new PddlPosition(1, 10);
            let second = new PddlPosition(10, 1);

            // WHEN
            let firstBeforeSecond = first.atOrBefore(second);
            let secondBeforeFirst = second.atOrBefore(first);

            // THEN
            assert.strictEqual(firstBeforeSecond, true, "1.10 should be before 10.1");
            assert.strictEqual(secondBeforeFirst, false, "10.1 should NOT be before 1.10");
        });
    });
});

describe('PddlRange', () => {

    describe('#includes', () => {
        it('is at or before itself', () => {
            // GIVEN
            let range1 = new PddlRange(1, 1, 1, 1);
            let position1 = new PddlPosition(1, 1);
            let expected = true;

            // WHEN
            let actual = range1.includes(position1);

            // THEN
            assert.strictEqual(actual, expected, "range 1.1-1.1 should include position 1.1");
        });

        it('is outside range', () => {
            // GIVEN
            let range1 = new PddlRange(1, 1, 1, 1);
            let position1 = new PddlPosition(10, 10);
            let expected = false;

            // WHEN
            let actual = range1.includes(position1);

            // THEN
            assert.strictEqual(actual, expected, "range 1.1-1.1 should NOT  include position 10.10");
        });
    });
});

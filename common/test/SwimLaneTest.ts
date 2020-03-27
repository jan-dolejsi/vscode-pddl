/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { SwimLane } from '../src/SwimLane';
import * as assert from 'assert';

describe('SwimLaneTests', () => {

    beforeEach(function () { 

    });

    describe('#placeNext', () => {
        it('first action should go to first lane', () => {
            // given
            let lanes = new SwimLane();
            let startTime = 0;
            let duration = 1;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 0, 'the first lane should be selected');
            assert.equal(lanes.laneCount(), 1, 'there should be just one lane');
            assert.equal(lanes.laneEnd(availableLane), duration, `the first lane should now finish at time ${startTime}+${duration}`);
        });

        it('first action should go to first lane and finish with the right offset', () => {
            // given
            let lanes = new SwimLane();
            let startTime = 10;
            let duration = 1;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 0, 'the first lane should be selected');
            assert.equal(lanes.laneCount(), 1, 'there should be just one lane');
            assert.equal(lanes.laneEnd(availableLane), startTime + duration, `the first lane should now finish at time ${startTime}+${duration}`);
        });

        it('second action should go to first lane after the first action', () => {
            // given
            let lanes = new SwimLane();
            lanes.placeNext(1, 1);
            let startTime = 10;
            let duration = 1;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 0, 'the first lane should be selected');
            assert.equal(lanes.laneCount(), 1, 'there should be just one lane');
            assert.equal(lanes.laneEnd(availableLane), startTime + duration, `the first lane should now finish at time ${startTime}+${duration}`);
        });

        it('second action should go to the second lane in parallel to the first action', () => {
            // given
            let lanes = new SwimLane();
            lanes.placeNext(0, 20);
            let startTime = 10;
            let duration = 1;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 1, 'the second lane should be selected');
            assert.equal(lanes.laneCount(), 2, 'there should be two lanes');
            assert.equal(lanes.laneEnd(0), 20, 'the first lane should now finish at time 20');
            assert.equal(lanes.laneEnd(availableLane), startTime + duration, `the second lane should now finish at time ${startTime}+${duration}`);
        });

        it('third action (parallel to the second) should go again to the first lane', () => {
            // given
            let lanes = new SwimLane();
            lanes.placeNext(0, 3);
            lanes.placeNext(2, 4);
            let startTime = 3.1;
            let duration = 2;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 0, 'the first lane should be selected');
            assert.equal(lanes.laneCount(), 2, 'there should be two lanes');
            assert.equal(lanes.laneEnd(availableLane), startTime + duration, `the selected lane should now finish at time ${startTime}+${duration}`);
        });

        it('third action should go again to the first lane', () => {
            // given
            let lanes = new SwimLane();
            lanes.placeNext(0, 3);
            lanes.placeNext(2, 4);
            let startTime = 8;
            let duration = 2;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 0, 'the first lane should be selected');
            assert.equal(lanes.laneCount(), 2, 'there should be two lanes');
            assert.equal(lanes.laneEnd(availableLane), startTime + duration, `the selected lane should now finish at time ${startTime}+${duration}`);
        });
    });


    describe('#placeNext with a separation', () => {

        it('second action should go to the second lane because of the separation', () => {
            // given
            let separation = 10;
            let lanes = new SwimLane(separation);
            lanes.placeNext(0, 10);
            let startTime = 15; // this would normally fit the first lane, but not because of the spacer
            let duration = 1;

            // when
            let availableLane = lanes.placeNext(startTime, duration);

            // then
            assert.equal(availableLane, 1, 'the second lane should be selected');
            assert.equal(lanes.laneCount(), 2, 'there should be two lanes');
            assert.equal(lanes.laneEnd(0), 10, `the first lane should now finish at time 10`);
            assert.equal(lanes.laneEnd(availableLane), startTime + duration, `the second lane should now finish at time ${startTime}+${duration}`);
        });
    });
});
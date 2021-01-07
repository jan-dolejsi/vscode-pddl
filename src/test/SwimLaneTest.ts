/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { SwimLane } from '../planReport/SwimLane';
import { expect } from 'chai';

describe('SwimLaneTests', () => {

    describe('#placeNext', () => {
        it('first action should go to first lane', () => {
            // given
            const lanes = new SwimLane();
            const startTime = 0;
            const duration = 1;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(0, 'the first lane should be selected');
            expect(lanes.laneCount()).to.equal(1, 'there should be just one lane');
            expect(lanes.laneEnd(availableLane)).to.equal(duration, `the first lane should now finish at time ${startTime}+${duration}`);
        });

        it('first action should go to first lane and finish with the right offset', () => {
            // given
            const lanes = new SwimLane();
            const startTime = 10;
            const duration = 1;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(0, 'the first lane should be selected');
            expect(lanes.laneCount()).to.equal(1, 'there should be just one lane');
            expect(lanes.laneEnd(availableLane)).to.equal(startTime + duration, `the first lane should now finish at time ${startTime}+${duration}`);
        });

        it('second action should go to first lane after the first action', () => {
            // given
            const lanes = new SwimLane();
            lanes.placeNext(1, 1);
            const startTime = 10;
            const duration = 1;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(0, 'the first lane should be selected');
            expect(lanes.laneCount()).to.equal(1, 'there should be just one lane');
            expect(lanes.laneEnd(availableLane)).to.equal(startTime + duration, `the first lane should now finish at time ${startTime}+${duration}`);
        });

        it('second action should go to the second lane in parallel to the first action', () => {
            // given
            const lanes = new SwimLane();
            lanes.placeNext(0, 20);
            const startTime = 10;
            const duration = 1;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(1, 'the second lane should be selected');
            expect(lanes.laneCount()).to.equal(2, 'there should be two lanes');
            expect(lanes.laneEnd(0)).to.equal(20, 'the first lane should now finish at time 20');
            expect(lanes.laneEnd(availableLane)).to.equal(startTime + duration, `the second lane should now finish at time ${startTime}+${duration}`);
        });

        it('third action (parallel to the second) should go again to the first lane', () => {
            // given
            const lanes = new SwimLane();
            lanes.placeNext(0, 3);
            lanes.placeNext(2, 4);
            const startTime = 3.1;
            const duration = 2;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(0, 'the first lane should be selected');
            expect(lanes.laneCount()).to.equal(2, 'there should be two lanes');
            expect(lanes.laneEnd(availableLane)).to.equal(startTime + duration, `the selected lane should now finish at time ${startTime}+${duration}`);
        });

        it('third action should go again to the first lane', () => {
            // given
            const lanes = new SwimLane();
            lanes.placeNext(0, 3);
            lanes.placeNext(2, 4);
            const startTime = 8;
            const duration = 2;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(0, 'the first lane should be selected');
            expect(lanes.laneCount()).to.equal(2, 'there should be two lanes');
            expect(lanes.laneEnd(availableLane)).to.equal(startTime + duration, `the selected lane should now finish at time ${startTime}+${duration}`);
        });
    });


    describe('#placeNext with a separation', () => {

        it('second action should go to the second lane because of the separation', () => {
            // given
            const separation = 10;
            const lanes = new SwimLane(separation);
            lanes.placeNext(0, 10);
            const startTime = 15; // this would normally fit the first lane, but not because of the spacer
            const duration = 1;

            // when
            const availableLane = lanes.placeNext(startTime, duration);

            // then
            expect(availableLane).to.equal(1, 'the second lane should be selected');
            expect(lanes.laneCount()).to.equal(2, 'there should be two lanes');
            expect(lanes.laneEnd(0)).to.equal(10, `the first lane should now finish at time 10`);
            expect(lanes.laneEnd(availableLane)).to.equal(startTime + duration, `the second lane should now finish at time ${startTime}+${duration}`);
        });
    });
});
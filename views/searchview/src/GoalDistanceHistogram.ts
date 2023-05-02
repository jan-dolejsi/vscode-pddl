/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { Chart, ChartData, DefaultDataPoint, registerables } from 'chart.js';
import { State, getElementByIdOrThrow } from './utils';
import { StatesView } from './StatesView';

export class GoalDistanceHistogram implements StatesView {

    private readonly stateIdToBucketMap = new Map<number, number>();
    private readonly chart: Chart;

    constructor(elementId: string) {
        const element = getElementByIdOrThrow<HTMLCanvasElement>(elementId);

        const data: ChartData<'bar', DefaultDataPoint<'bar'>, string> = {
            labels: [],
            datasets: [
                {
                    label: 'distance to goal histogram',
                    data: [],
                    borderColor: 'lightblue',
                    // backgroundColor: Utils.transparentize(Utils.CHART_COLORS.red, 0.5),
                },
            ]
        };

        Chart.register(...registerables);
        this.chart = new Chart(element, {
            type: 'bar',
            data: data,
            options: {
                indexAxis: 'y',
                // Elements options apply to all of the options unless overridden in a dataset
                // In this case, we are setting the border of each horizontal bar to be 2px wide
                elements: {
                    bar: {
                        borderWidth: 0,
                    }
                },
                responsive: true,
                scales: {
                    y: {
                        reverse: true,
                    }
                },
                plugins: {
                    // legend: {
                    // position: 'right',
                    // display: false,
                    // reverse: true,
                    // },
                    // title: {
                    //     display: true,
                    //     text: 'Chart.js Horizontal Bar Chart'
                    // }
                }
            },
        });
    }

    clear(): void {
        this.chart.data.datasets.forEach(ds => ds.data.length = 0);
    }

    addState(state: State): void {
        const h = state.h;
        if (h && !this.stateIdToBucketMap.has(state.id)) {
            this.stateIdToBucketMap.set(state.id, h);

            const datasets0 = this.chart.data.datasets[0];
            const labels = this.chart.data.labels ?? [];

            // ensure length
            this.ensureArrayLength<string>(labels as string[], h, rowIdx => "" + rowIdx);
            this.ensureArrayLength<number>(datasets0.data as number[], h, () => 0);

            datasets0.data[h] = (datasets0.data[h] as number) + 1;
            this.chart.update();
        }
    }

    private ensureArrayLength<T>(array: T[], newLength: number, valueFunction: (rowIdx: number) => T) {
        if (array.length < newLength + 1) {
            const origLength = array.length;
            array.length = newLength + 1;

            for (let i = origLength; i < array.length; i++) {
                array[i] = valueFunction(i);
            }
        }
    }
}
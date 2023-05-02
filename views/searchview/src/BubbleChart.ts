/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { Chart, ChartData, DefaultDataPoint, registerables, BubbleDataPoint, ChartDataset } from 'chart.js';
import { State, getElementByIdOrThrow } from './utils';
import { StatesView } from './StatesView';

export class ScaledBubbleDataPoint implements BubbleDataPoint {

    private count = 1;
    private maxCount = 1;
    public readonly x: number;
    public readonly y: number;

    constructor(state: { g: number, h: number, maxCount: number }) {
        this.x = state.h;
        this.y = state.g;
        this.maxCount = state.maxCount;
    }

    matches(state: State): boolean {
        return this.x === state.h && this.y === state.g;
    }

    increment(): number {
        this.count += 1;
        // fix it locally
        if (this.count > this.maxCount) {
            this.maxCount = this.count;
        }
        return this.count;
    }

    setMaxCount(maxCount: number): void {
        this.maxCount = maxCount;
    }

    get r(): number {
        return Math.min(16, this.count / this.maxCount * 14 + 2);
    }
}

export class BubbleChart implements StatesView {

    private readonly chart: Chart;
    private readonly bubbleDataset: ChartDataset<'bubble', DefaultDataPoint<'bubble'>>;
    private readonly scatterDataset: ChartDataset<'scatter', DefaultDataPoint<'scatter'>>;
    private maxCount = 1;

    constructor(elementId: string) {
        const element = getElementByIdOrThrow<HTMLCanvasElement>(elementId);

        this.bubbleDataset = {
            type: 'bubble',
            data: [],
            borderColor: 'lightgray',
        };

        this.scatterDataset = {
            type: 'scatter',
            data: [],
            showLine: true,
            borderColor: '#99999999',
            tension: 0.4,
        };

        const data: ChartData<'bubble' | 'scatter', DefaultDataPoint<'bubble' | 'scatter'>, string> = {
            labels: [],
            datasets: [
                this.scatterDataset,
                this.bubbleDataset,
            ]
        };

        Chart.register(...registerables);
        this.chart = new Chart(element, {
            type: 'bubble',
            data: data,
            options: {
                animation: {
                    duration: 0,
                },
                indexAxis: 'y',
                // Elements options apply to all of the options unless overridden in a dataset
                // In this case, we are setting the border of each horizontal bar to be 2px wide
                responsive: true,
                scales: {
                    x: {
                        min: 0,
                        reverse: true, // left-to-right progress
                        title: {
                            text: 'H',
                            display: true,
                            color: 'blue'
                        },
                        ticks: {
                            color: 'lightblue',
                        }
                    },
                    y: {
                        min: 0,
                        reverse: true, // put gen-zero on the top
                        title: {
                            text: 'G',
                            display: true,
                            color: 'green'
                        },
                        ticks: {
                            color: 'lightgreen',
                        }
                    },
                },
                plugins: {
                    legend: {
                        position: 'right',
                        display: false,
                    },
                    // title: {
                    //     display: true,
                    //     text: 'Chart.js Horizontal Bar Chart'
                    // }
                }
            },
        });
    }

    clear(): void {
        this.bubbleDataset.data.length = 0;
        this.scatterDataset.data.length = 0;
        this.maxCount = 1;
        this.chart.update();
    }

    private updateTimeout: NodeJS.Timeout | undefined;
    private updatedMeanwhile = false;

    addState(state: State): void {
        const h = state.h;
        if (h) {
            { // add to bubble chart
                const data = this.bubbleDataset.data as ScaledBubbleDataPoint[];

                // is the point already displayed?
                const point = data.find(point => point.matches(state));

                if (point) {
                    const newCount = point.increment();
                    if (newCount > this.maxCount) {
                        this.maxCount = newCount;
                        data.forEach(point => point.setMaxCount(newCount));
                    }
                } else {
                    data.push(new ScaledBubbleDataPoint({ h: h, g: state.g, maxCount: this.maxCount }));
                }
            }
            { // add to scatter plot
                this.scatterDataset.data.push({ x: h, y: state.g });
            }

            this.updatedMeanwhile = true;

            // if (this.updateTimeout === undefined) {
            //     const that = this;
            //     this.updateTimeout = setTimeout(() => {
                    this.chart.update();
            //         that.updateTimeout = undefined;
            //     }, 250);
            // }
        }
    }
}
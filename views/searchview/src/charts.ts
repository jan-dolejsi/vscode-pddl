/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { getElementByIdOrThrow, State } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace google {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace charts {
        function load(version: string, options: { packages: string[] }): void;

        export class ChartOptions {

        }

        export class Line {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            static convertOptions(options: any): ChartOptions;

        }
    }

    // eslint-disable-next-line @typescript-eslint/no-namespace
    export namespace visualization {
        export class DataTable {
            addColumn(type: string, legend: string): void;
        }

        interface Chart {
            draw(chartData: DataTable, chartOptions: charts.ChartOptions): void;
        }

        export class ComboChart implements Chart {
            constructor(host: HTMLElement);
            draw(chartData: DataTable, chartOptions: charts.ChartOptions): void;
        }

        // eslint-disable-next-line @typescript-eslint/no-namespace
        export namespace events {
            // eslint-disable-next-line @typescript-eslint/no-empty-interface
            interface ChartEventListener { }

            function addListener(chart: Chart, eventName: string, handler: () => void): ChartEventListener;
            function removeListener(chartSelectEvent: ChartEventListener): void;
        }
    }
}

let chartDefined = false;

try {
    google.charts.load('current', { packages: ['corechart', 'line'] });
    chartDefined = true;
}
catch (err) {
    console.log(err);
}

// instead of this, we initialize the chart in the page body onLoad event
// google.charts.setOnLoadCallback(initializeChart);

// see documentation at
// https://developers.google.com/chart/interactive/docs/reference#DataTable


export class StateChart {
    // following two maps help translating state IDs to chart data set rows and vice versa

    /** Translates state ID to chart dataset row ID */
    private stateIdToRowId = new Map<number, number>();
    /** Translates chart row ID to State ID */
    private rowIdToStateId = new Map<number, number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private chart: any; // todo: google.visualization.Chart; 

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private chartData: any; // todo: google.visualization.DataTable;

    private chartOptions: google.charts.ChartOptions;

    private isReDrawing = false;
    private chartNeedsReDrawing = false;


    constructor(private readonly chartDivId: string, private onStateSelected: (stateId: number | null) => void) {

        this.chartData = new google.visualization.DataTable();
        this.chartData.addColumn('number', 'State');
        this.chartData.addColumn('number', 'Now');
        this.chartData.addColumn('number', 'Makespan');
        this.chartData.addColumn('number', 'H');
        // the additional column crashes the webview (?!) for larger problems like driverlog p2
        // chartData.addColumn('number', 'Landmarks');

        const options = {
            title: 'Evaluated states',
            hAxis: { title: 'State' },
            seriesType: 'area',
            series: {
                0: {
                    targetAxisIndex: 1,
                    color: 'green',
                    lineWidth: 1
                },
                1: {
                    targetAxisIndex: 1,
                    color: 'lightgreen',
                    lineWidth: 1
                },
                2: {
                    type: 'line',
                    targetAxisIndex: 0,
                    color: 'blue'
                    /*},
                    3: { // This seems to crash the webview
                        type: 'line',
                        targetAxisIndex: 0,
                        color: 'brown',
                        lineWidth: 1,
                        lineDashStyle: [1, 1]*/
                }
            },
            vAxes: {
                0: { title: 'Heuristic value', textStyle: { color: 'blue' }, minValue: 0 },
                1: { title: 'Makespan', textStyle: { color: 'green' } }
            },
            crosshair: {
                trigger: 'both',
                orientation: 'vertical',
                color: 'gray'
            }
        };

        this.chartOptions = google.charts.Line.convertOptions(options);
        this.chart = this.reSizeChart();

        google.visualization.events.addListener(this.chart, 'ready',
            () => {
                if (this.chartNeedsReDrawing) {
                    this.reDrawChart();
                }
            }
        );
    }

    reSizeChart(): google.visualization.Chart {
        this.chart = new google.visualization.ComboChart(getElementByIdOrThrow(this.chartDivId));
        this.reDrawChart();
        return this.chart;
    }

    private reDrawChart(): void {
        if (this.isReDrawing) {
            this.chartNeedsReDrawing = true;
        }
        else {
            this.isReDrawing = true;
            this.chartNeedsReDrawing = false;
            new Promise(() => {
                this.chart.draw(this.chartData, this.chartOptions);
                this.isReDrawing = false;
            });
        }
    }

    /**
     * Selects state on the chart
     * @param stateId state id or null 
     */
    selectChartRow(stateId: number | null): void {
        if (!chartDefined) { return; }
        if (stateId !== null) {
            const rowId = this.stateIdToRowId.get(stateId);
            this.chart.setSelection([{ row: rowId }]);
        }
        else {
            this.chart.setSelection();
        }
    }

    /**
     * Adds state to chart
     * @param newState state to add 
     * @param batch batch mode on/off
     */
    addStateToChart(newState: State, batch: boolean): void {
        if (this.chartData) {
            const rowId = this.chartData.addRow([newState.id, newState.earliestTime,
            sanitizeNumber(newState.totalMakespan), sanitizeNumber(newState.h),
                // sanitizeNumber(newState.satisfiedLandmarks)
            ]);
            this.addRowId(rowId, newState.id);
            if (!batch) { this.reDrawChart(); }
        }
    }

    /**
     * Records mapping between row and state
     * @param rowId row ID
     * @param stateId state ID
     */
    addRowId(rowId: number, stateId: number): void {
        this.rowIdToStateId.set(rowId, stateId);
        this.stateIdToRowId.set(stateId, rowId);
    }

    endChartBatch(): void {
        this.reDrawChart();
    }

    /**
     * Updates state values on the chart
     * @param state state to re-paint
     */
    updateStateOnChart(state: State): void {
        const rowId = this.stateIdToRowId.get(state.id);
        this.chartData.setValue(rowId, MAKESPAN_COLUMN, sanitizeNumber(state.totalMakespan));
        this.chartData.setValue(rowId, H_COLUMN, sanitizeNumber(state.h));
        this.reDrawChart();
    }

    clearChart(): void {
        const rowsToRemove = this.chartData.getNumberOfRows();
        this.chartData.removeRows(0, rowsToRemove);
        this.stateIdToRowId.clear();
        this.rowIdToStateId.clear();
        this.reDrawChart();
        console.log("Removed " + rowsToRemove + " rows from the chart data table.");
    }

    /**
     * Shifts the selected chart data-table row by number of items given by the 'offset'.
     * @param offset number of chart rows by which to move the selection
     * @returns new selected state id, or 'null' if nothing was selected originally
     */
    navigateChart(offset: number): number | null {
        const selection = this.chart.getSelection();
        if (selection.length > 0) {
            /** todo: actually, not sure if unselected translates to null or undefined */
            const selectedRow: number | null = selection[0].row ?? null;
            if (selectedRow === null) {
                return null;
            }
            const newSelectedRow = selectedRow + offset;
            if (newSelectedRow > -1 && newSelectedRow < this.chartData.getNumberOfRows()) {
                this.chart.setSelection([{ row: newSelectedRow }]);
                return this.rowIdToStateId.get(newSelectedRow) ?? null;
            }
            else {
                return this.rowIdToStateId.get(selectedRow) ?? null;
            }
        }
        return null;
    }

    private chartSelectEvent: google.visualization.events.ChartEventListener | undefined;

    subscribeToChartEvents(): void {
        this.chartSelectEvent = google.visualization.events.addListener(this.chart, 'select', () => {
            console.log("chart selection changed");
            const selection = this.chart.getSelection();
            console.log(selection);
            if (selection && selection.length > 0) {
                const newSelectedStateId = this.rowIdToStateId.get(selection[0].row);
                this.onStateSelected(newSelectedStateId ?? null);
            }
            else {
                this.onStateSelected(null);
            }
        });
    }

    unsubscribeChartEvents(): void {
        if (this.chartSelectEvent && this.chart) {
            google.visualization.events.removeListener(this.chartSelectEvent);
        }
    }
}

/**
 * Turns NaN and infinities to `null`.
 * @param value unsanitized value
 */
function sanitizeNumber(value: number | undefined): number | null {
    if (value === undefined || !Number.isFinite(value)) {
        return null;
    }
    else {
        return value;
    }
}

const MAKESPAN_COLUMN = 2;
const H_COLUMN = 3;

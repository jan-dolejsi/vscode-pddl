import { State } from "./utils";

// following two maps help translating state IDs to chart data set rows and vice versa

/** Translates state ID to chart dataset row ID */
const stateIdToRowId = new Map<number, number>();
/** Translates chart row ID to State ID */
export const rowIdToStateId = new Map<number, number>();
let chartDefined = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare const google: any;

try {
    google.charts.load('current', { packages: ['corechart', 'line'] });
    chartDefined = true;
}
catch(err) {
    console.log(err);
}

// instead of this, we initialize the chart in the page body onLoad event
// google.charts.setOnLoadCallback(initializeChart);

// see documentation at
// https://developers.google.com/chart/interactive/docs/reference#DataTable

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let chart: any; let chartData: any; let chartOptions: any;

let isReDrawing = false;
let chartNeedsReDrawing = false;

export function initializeChart(): void {

    chartData = new google.visualization.DataTable();
    chartData.addColumn('number', 'State');
    chartData.addColumn('number', 'Now');
    chartData.addColumn('number', 'Makespan');
    chartData.addColumn('number', 'H');

  const options = {
    title : 'Evaluated states',
    hAxis: {title: 'State'},
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
        }
    },
    vAxes: {
        0: { title: 'Heuristic value', textStyle: {color: 'blue'}, minValue: 0},
        1: { title: 'Makespan', textStyle: {color: 'green'}}
    },
    crosshair: {
        trigger: 'both',
        orientation: 'vertical',
        color: 'gray'
    }
  };

  chartOptions = google.charts.Line.convertOptions(options);
  reSizeChart();

  google.visualization.events.addListener(chart, 'ready',
          function() {
              if (chartNeedsReDrawing) {
                  reDrawChart();
              }
          }
  );
}

export function reSizeChart(): void {
  chart = new google.visualization.ComboChart(document.getElementById('chart_div'));
  reDrawChart();
}

function reDrawChart(): void {
    if (isReDrawing) {
        chartNeedsReDrawing = true;
    }
    else {
        isReDrawing = true;
        chartNeedsReDrawing = false;
        new Promise(() => chart.draw(chartData, chartOptions));
        isReDrawing = false;
    }
}

/**
 * Selects state on the chart
 * @param stateId state id or null 
 */
export function selectChartRow(stateId: number | null): void {
    if (!chartDefined) { return; }
    if (stateId !== null) {
        const rowId = stateIdToRowId.get(stateId);
        chart.setSelection([{row: rowId}]);
    }
    else {
        chart.setSelection();
    }
}

/**
 * Adds state to chart
 * @param newState state to add 
 * @param batch batch mode on/off
 */
export function addStateToChart(newState: State, batch: boolean): void {
    if (chartData) {
        const rowId = chartData.addRow([newState.id, newState.earliestTime, sanitizeNumber(newState.totalMakespan), sanitizeNumber(newState.h)]);
        addRowId(rowId, newState.id);
        if (!batch) { reDrawChart(); }
    }
}

/**
 * Records mapping between row and state
 * @param rowId row ID
 * @param stateId state ID
 */
function addRowId(rowId: number, stateId: number): void {
    rowIdToStateId.set(rowId, stateId);
    stateIdToRowId.set(stateId, rowId);
}

export function endChartBatch(): void {
    reDrawChart();
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

/**
 * Updates state values on the chart
 * @param state state to re-paint
 */
export function updateStateOnChart(state: State): void {
    const rowId = stateIdToRowId.get(state.id);
    chartData.setValue(rowId, MAKESPAN_COLUMN, sanitizeNumber(state.totalMakespan));
    chartData.setValue(rowId, H_COLUMN, sanitizeNumber(state.h));
    reDrawChart();
}

export function clearChart(): void {
    const rowsToRemove = chartData.getNumberOfRows();
    chartData.removeRows(0, rowsToRemove);
    stateIdToRowId.clear();
    rowIdToStateId.clear();
    reDrawChart();
    console.log("Removed " + rowsToRemove + " rows from the chart data table.");
}

/**
 * Shifts the selected chart data-table row by number of items given by the 'offset'.
 * @param offset number of chart rows by which to move the selection
 * @returns new selected state id, or 'null' if nothing was selected originally
 */
export function navigateChart(offset: number): number | null {
    const selection = chart.getSelection();
    if (selection.length > 0) {
        /** todo: actually, not sure if unselected translates to null or undefined */
        const selectedRow: number | null = selection[0].row ?? null;
        if (selectedRow === null) {
            return null;
        }
        const newSelectedRow = selectedRow + offset;
        if (newSelectedRow > -1 && newSelectedRow < chartData.getNumberOfRows()) {
            chart.setSelection([{row: newSelectedRow}]);
            return rowIdToStateId.get(newSelectedRow) ?? null;
        }
        else {
            return rowIdToStateId.get(selectedRow) ?? null;
        }
    }
    return null;
}
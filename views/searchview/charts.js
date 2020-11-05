// two maps help translating state IDs to chart data set rows and vice versa
/** @type {Map<number, number>} */
const stateIdToRowId = new Map();
/** @type {Map<number, number>} */
const rowIdToStateId = new Map();
let chartDefined = false;

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

let chart, chartData, chartOptions, isReDrawing, chartNeedsReDrawing;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initializeChart() {

    chartData = new google.visualization.DataTable();
    chartData.addColumn('number', 'State');
    chartData.addColumn('number', 'Now');
    chartData.addColumn('number', 'Makespan');
    chartData.addColumn('number', 'H');
    // the additional column crashes the webview (?!) for larger problems like driverlog p2
    // chartData.addColumn('number', 'Landmarks');

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function reSizeChart(options) {
  chart = new google.visualization.ComboChart(document.getElementById('chart_div'));
  reDrawChart();
}

function reDrawChart() {
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
 * @param {number} stateId state id
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function selectChartRow(stateId) {
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
 * @param {State} newState state to add 
 * @param {boolean} batch batch mode on/off
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function addStateToChart(newState, batch) {
    if (chartData) {
        const rowId = chartData.addRow([newState.id, newState.earliestTime,
            sanitizeNumber(newState.totalMakespan), sanitizeNumber(newState.h),
            // sanitizeNumber(newState.satisfiedLandmarks)
        ]);
        addRowId(rowId, newState.id);
        if (!batch) { reDrawChart(); }
    }
}

/**
 * Records mapping between row and state
 * @param {number} rowId row ID
 * @param {number} stateId state ID
 */
function addRowId(rowId, stateId) {
    rowIdToStateId.set(rowId, stateId);
    stateIdToRowId.set(stateId, rowId);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function endChartBatch() {
    reDrawChart();
}

/**
 * Turns NaN and infinities to `null`.
 * @param {number} value unsanitized value
 */
function sanitizeNumber(value) {
    if (!Number.isFinite(value)) {
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
 * @param {State} state state to re-paint
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function updateStateOnChart(state) {
    const rowId = stateIdToRowId.get(state.id);
    chartData.setValue(rowId, MAKESPAN_COLUMN, sanitizeNumber(state.totalMakespan));
    chartData.setValue(rowId, H_COLUMN, sanitizeNumber(state.h));
    reDrawChart();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function clearChart() {
    const rowsToRemove = chartData.getNumberOfRows();
    chartData.removeRows(0, rowsToRemove);
    stateIdToRowId.clear();
    rowIdToStateId.clear();
    reDrawChart();
    console.log("Removed " + rowsToRemove + " rows from the chart data table.");
}

/**
 * Shifts the selected chart data-table row by number of items given by the 'offset'.
 * @param {number} offset number of chart rows by which to move the selection
 * @returns {number | null} new selected state id, or 'null' if nothing was selected originally
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function navigateChart(offset) {
    const selection = chart.getSelection();
    if (selection.length > 0) {
        /** @type{number | null | undefined} todo: actually, not sure if unselected translates to null or undefined */
        const selectedRow = selection[0].row;
        if (selectedRow === null || selectedRow === undefined) {
            return null;
        }
        const newSelectedRow = selectedRow + offset;
        if (newSelectedRow > -1 && newSelectedRow < chartData.getNumberOfRows()) {
            chart.setSelection([{row: newSelectedRow}]);
            return rowIdToStateId.get(newSelectedRow);
        }
        else {
            return rowIdToStateId.get(selectedRow);
        }
    }
    return null;
}
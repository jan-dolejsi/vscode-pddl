// two maps help translating state IDs to chart data set rows and vice versa
var stateIdToRowId = new Map();
var rowIdToStateId = new Map();
var chartDefined = false;

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

var chart, chartData, chartOptions, isReDrawing, chartNeedsReDrawing;

function initializeChart() {

    chartData = new google.visualization.DataTable();
    chartData.addColumn('number', 'State');
    chartData.addColumn('number', 'Now');
    chartData.addColumn('number', 'Makespan');
    chartData.addColumn('number', 'H');

  var options = {
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
              if (chartNeedsReDrawing) reDrawChart()
          }
  );
}

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

function selectChartRow(stateId) {
    if (!chartDefined) return;
    if (stateId !== null) {
        var rowId = stateIdToRowId.get(stateId);
        chart.setSelection([{row: rowId}]);
    }
    else {
        chart.setSelection();
    }
}

function addStateToChart(newState, batch) {
    if (chartData) {
        var rowId = chartData.addRow([newState.id, newState.earliestTime, sanitizeNumber(newState.totalMakespan), sanitizeNumber(newState.h)]);
        addRowId(rowId, newState.id);
        if (!batch) reDrawChart();
    }
}

function addRowId(rowId, stateId) {
    rowIdToStateId.set(rowId, stateId);
    stateIdToRowId.set(stateId, rowId);
}

function endChartBatch() {
    reDrawChart();
}

function sanitizeNumber(value) {
    if (!Number.isFinite(value)) return null;
    else return value;
}

const MAKESPAN_COLUMN = 2;
const H_COLUMN = 3;

function updateStateOnChart(state) {
    var rowId = stateIdToRowId.get(state.id);
    chartData.setValue(rowId, MAKESPAN_COLUMN, sanitizeNumber(state.totalMakespan));
    chartData.setValue(rowId, H_COLUMN, sanitizeNumber(state.h));
    reDrawChart();
}

function clearChart() {
    var rowsToRemove = chartData.getNumberOfRows();
    chartData.removeRows(0, rowsToRemove);
    stateIdToRowId.clear();
    rowIdToStateId.clear();
    reDrawChart();
    console.log("Removed " + rowsToRemove + " rows from the chart data table.");
}

/**
 * Shifts the selected chart data-table row by number of items given by the 'offset'.
 * @param {number} offset number of chart rows by which to move the selection
 * @returns {number} new selected state id, or 'null' if nothing was selected originally
 */
function navigateChart(offset) {
    var selection = chart.getSelection();
    if (selection.length > 0) {
        var selectedRow = selection[0].row;
        if (selectedRow == null) return null;
        var newSelectedRow = selectedRow + offset;
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
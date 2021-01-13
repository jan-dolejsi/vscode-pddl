// this file is only needed as long as the PlanReportGenerator is used to generate the standalone plan report html file

google.charts.load('current', { packages: ['corechart', 'line'] });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function drawChart(chartDivId, functionName, unit, objects, columnData) {

    const data = new google.visualization.DataTable();
    data.addColumn('number', 'X');

    objects.forEach(obj => {
        data.addColumn('number', obj);
    });

    data.addRows(columnData);

    const options = {
        hAxis: {
            title: 'Time'
        },
        vAxis: {
            title: unit,
            scaleType: 'linear' //vAxisScaleType = 'log'
        },
        interpolateNulls: true,
        title: functionName
    };

    const chart = new google.visualization.LineChart(document.getElementById(chartDivId));

    chart.draw(data, options);
}

function createDataTable(variableName, variableData) {
    const data = new google.visualization.DataTable();
    data.addColumn('number', 'X');
    data.addColumn('number', variableName);

    data.addRows(variableData);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function drawChartMultipleSeries(chartDivId, functionName, unit, objects, columnData) {

    const data = columnData.map(variableData, variableName => createDataTable(variableName, variableData));

    const options = {
        hAxis: {
            title: 'Time'
        },
        vAxis: {
            title: unit,
            scaleType: 'linear' //vAxisScaleType = 'log'
        },
        interpolateNulls: true,
        title: functionName
    };

    const chart = new google.visualization.LineChart(document.getElementById(chartDivId));

    chart.draw(data, options);
}
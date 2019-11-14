google.charts.load('current', { packages: ['corechart', 'line'] });

function drawChart(chartDivId, functionName, unit, objects, columnData) {

    var data = new google.visualization.DataTable();
    data.addColumn('number', 'X');

    objects.forEach(obj => {
        data.addColumn('number', obj);        
    });

    data.addRows(columnData);

    var options = {
        hAxis: {
            title: 'Time'
        },
        vAxis: {
            title: unit
        },
        interpolateNulls: true,
        title: functionName
    };

    var chart = new google.visualization.LineChart(document.getElementById(chartDivId));

    chart.draw(data, options);
}

function createDataTable(variableName, variableData) {
    var data = new google.visualization.DataTable();
    data.addColumn('number', 'X');
    data.addColumn('number', variableName);        

    data.addRows(variableData);
}

function drawChartMultipleSeries(chartDivId, functionName, unit, objects, columnData) {

    var data = columnData.map(variableData, variableName => createDataTable(variableName, variableData));


    var options = {
        hAxis: {
            title: 'Time'
        },
        vAxis: {
            title: unit
        },
        interpolateNulls: true,
        title: functionName
    };

    var chart = new google.visualization.LineChart(document.getElementById(chartDivId));

    chart.draw(data, options);
}
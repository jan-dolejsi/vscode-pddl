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
        title: functionName
    };

    var chart = new google.visualization.LineChart(document.getElementById(chartDivId));

    chart.draw(data, options);
}
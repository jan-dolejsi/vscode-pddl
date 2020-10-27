//@ts-check

const download = require('download-file');

const downloads = [
    {
        url: "https://unpkg.com/vis-network@7.5.2/dist/vis-network.min.js",
        options: {
            directory: "views/common",
            filename: "vis-network.min.js"
        }
    },
    {
        url: "https://unpkg.com/vis-network@7.5.2/dist/vis-network.min.js.map",
        options: {
            directory: "views/common",
            filename: "vis-network.min.js.map"
        }
    },
    {
        url: "https://unpkg.com/vis-network@7.5.2/dist/vis-network.min.css",
        options: {
            directory: "views/common",
            filename: "vis-network.min.css"
        }
    }
];

downloads.forEach(task => {
    console.log("Downloading " + task.options.directory + "/" + task.options.filename);

    download(task.url, task.options, function (error) {
        if (error) {
            console.error("Failed to download: " + task.options.directory + "/" + task.options.filename + " with error " + error);
            throw error;
        }
        console.log("Success: " + task.options.directory + "/" + task.options.filename);
    });
});

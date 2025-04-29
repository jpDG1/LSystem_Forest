
const { exec } = require("child_process");
const path = require("path");
const open = require("open");


exec('start cmd /k "node logger.js"', (error) => {
    if (error) {
        console.error(" Failed to start logger:", error);
    }
});


setTimeout(() => {
    const htmlPath = path.join(__dirname, "index.html");4
    open(htmlPath).then(() => {
        console.log(" Opened simulation in browser.");
    }).catch((err) => {
        console.error(" Failed to open browser:", err);
    });
}, 2000);

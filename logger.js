const express = require("express");
const readline = require("readline");
const fs = require("fs");
const axios = require("axios");
const chalk = require("chalk").default;


const app = express();
const port = 3001;
let currentFire = null;
let waitingForResponse = false;
let lastLog = "";

const logToFile = (text) => {
    const now = new Date().toLocaleTimeString("uk-UA");
    const line = `[${now}] ${text}\n`;
    fs.appendFile("fire-log.txt", line, (err) => {
        if (err) console.error("❗ Failed to write to file", err);
    });
};

const styledLog = (text) => {
    if (text === lastLog) return;
    lastLog = text;

    const time = new Date().toLocaleTimeString("uk-UA");
    const prefix = chalk.hex("#888888")(`[${time}]`);

    if (text.includes("🔥")) console.log(prefix, chalk.red(text));
    else if (text.includes("✅")) console.log(prefix, chalk.green(text));
    else if (text.includes("❌")) console.log(prefix, chalk.yellow(text));
    else if (text.includes("🚒")) console.log(prefix, chalk.blue(text));
    else if (text.includes("⚠") || text.includes("⌛")) console.log(prefix, chalk.keyword('orange')(text));
    else console.log(prefix, text);
};



// Allow CORS
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

app.use(express.json());

// REST логування
app.post("/log", (req, res) => {
    const { message } = req.body;
    if (message) {
        styledLog(message);
        logToFile(message);
    }
    res.sendStatus(200);
});

// 🔥 Fire confirmation request
app.post("/request-fire-response", (req, res) => {
    const { i, j } = req.body;
    if (waitingForResponse) return res.sendStatus(200);

    currentFire = { i, j };
    waitingForResponse = true;
    const text = `🔥 Fire at [${i}, ${j}] — awaiting response (Y/N)`;
    styledLog(text);
    logToFile(text);

    setTimeout(() => {
        if (waitingForResponse) {
            const msg = `⌛ No response for fire at [${currentFire.i}, ${currentFire.j}]`;
            styledLog(msg);
            logToFile(msg);
            waitingForResponse = false;
            currentFire = null;
        }
    }, 10000);

    res.sendStatus(200);
});

// User response
app.post("/fire-response", (req, res) => {
    const { i, j, response } = req.body;
    let msg = "";

    if (response === "Y") {
        msg = `🚒 Firetruck dispatched to [${i},${j}] ✅`;
    } else if (response === "N") {
        msg = `❌ No action taken for fire at [${i},${j}]`;
    } else {
        msg = `❓ Unknown response for fire at [${i},${j}]`;
    }

    styledLog(msg);
    logToFile(msg);
    waitingForResponse = false;
    currentFire = null;
    res.sendStatus(200);
});

// CLI fire confirmation
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on("line", (input) => {
    if (!waitingForResponse || !currentFire) return;

    const answer = input.trim().toUpperCase();
    const { i, j } = currentFire;

    if (answer === "Y" || answer === "N") {
        axios.post("http://localhost:3001/fire-response", { i, j, response: answer })
            .catch(() => {
                styledLog("❗ Failed to send fire response to local handler.");
            });
    }
});

app.listen(port, () => {
    console.clear();
    console.table([{ Port: port, Status: "Logger running", Logfile: "fire-log.txt" }]);
});

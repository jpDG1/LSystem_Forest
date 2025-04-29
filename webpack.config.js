const express = require("express");
const readline = require("readline");

const app = express();
const port = 3001;
let currentFire = null;
let waitingForResponse = false;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// Приймає звичайні логи
app.post('/log', (req, res) => {
    const { message } = req.body;
    if (message) {
        const now = new Date().toLocaleTimeString('uk-UA');
        console.log(`[${now}] ${message}`);
    }
    res.sendStatus(200);
});

// Приймає запит про пожежу
app.post('/request-fire-response', (req, res) => {
    const { i, j } = req.body;
    if (waitingForResponse) return res.sendStatus(200);

    currentFire = { i, j };
    waitingForResponse = true;
    console.log(`🔥 Fire at [${i}, ${j}]. Call fire truck? (Y/N):`);

    // Встановлюємо таймер — якщо не відповів, ігнорується
    setTimeout(() => {
        if (waitingForResponse) {
            console.log(`⌛ No response. Fire response skipped.`);
            waitingForResponse = false;
            currentFire = null;
        }
    }, 10000);

    res.sendStatus(200);
});

// CLI-інтерфейс
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on("line", (input) => {
    if (!waitingForResponse || !currentFire) return;

    const answer = input.trim().toUpperCase();
    const { i, j } = currentFire;

    if (answer === "Y" || answer === "N") {
        fetch("http://localhost:3002/fire-response", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ i, j, response: answer })
        }).catch(() => {
            console.log("❗ Failed to send fire response to frontend.");
        });

        waitingForResponse = false;
        currentFire = null;
    }
});

app.listen(port, () => {
    console.log(`Logger running on http://localhost:${port}`);
});

import * as L from "leaflet";
import { createSettingsPanel } from "./settingsPanel";
import axios from "axios";

const map = L.map("map").setView([52.295, 20.638], 12);
const baseLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OSM contributors" }
).addTo(map);

createSettingsPanel();

const gridSize = 6;
const cellHeight = 0.0085;
const cellWidth = 0.0135;
const startLat = 52.295 - (gridSize / 2) * cellHeight;
const startLng = 20.638 - (gridSize / 2) * cellWidth;

type CellState = "T" | "." | "F";

interface Cell {
    state: CellState;
    temp: number;
    prevTemp: number;
    hasCloud: boolean;
    raining: boolean;
    humidity: number;
}

let grid: Cell[][] = [];
let generation = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let firefighterTimer: ReturnType<typeof setInterval> | null = null;

const windDirections = ["N", "E", "S", "W"] as const;
type WindDirection = typeof windDirections[number];
let windDirection: WindDirection = (localStorage.getItem("sim_windDir") as WindDirection) || "E";
let windStrength = parseFloat(localStorage.getItem("sim_windSpeed") || (1 + Math.random() * 2).toFixed(1));
const cloudChance = 0.2;

let fireCoordinates: [number, number] | null = null;
let pendingFireResponse = false;
let fireMarkers: L.Marker[] = [];

const logAction = (msg: string) => {
    console.log("[SIM LOG]", msg);
    axios.post("http://localhost:3001/log", { message: msg }).catch(() => {
        console.warn("[LOG DOWN]", msg);
    });
};

interface Weather {
    state: "sunny" | "cloudy" | "rainy";
    humidity: number;
    fireRisk: number;
}
let currentWeather: Weather | null = null;

interface Firefighter {
    i: number;
    j: number;
}
const firefighters: Firefighter[] = [{ i: 0, j: 0 }];
let fireTruckDispatched = false;
const fireTruckThreshold = 10;

export function initGrid() {
    const baseTemp = parseInt(localStorage.getItem("sim_baseTemp") || "30", 10);
    grid = [];
    for (let i = 0; i < gridSize; i++) {
        grid[i] = [];
        for (let j = 0; j < gridSize; j++) {
            const temp = Math.floor(Math.random() * 10) + baseTemp;
            const humidity = Math.floor(Math.random() * 60) + 20;
            grid[i][j] = {
                state: "T",
                temp,
                prevTemp: temp,
                hasCloud: Math.random() < cloudChance,
                raining: false,
                humidity,
            };
        }
    }
    generation = 0;
}
initGrid();

function generateWeather(): Weather {
    const states: Weather["state"][] = ["sunny", "cloudy", "rainy"];
    const state = states[Math.floor(Math.random() * states.length)];
    const override = parseInt(localStorage.getItem("sim_humidity") || "-1", 10);
    let humidity = 0, fireRisk = 0;
    switch (state) {
        case "sunny":
            humidity = override >= 0 ? override : 20;
            fireRisk = 80;
            break;
        case "cloudy":
            humidity = override >= 0 ? override : 50;
            fireRisk = 40;
            break;
        case "rainy":
            humidity = override >= 0 ? override : 80;
            fireRisk = 10;
            break;
    }
    return { state, humidity, fireRisk };
}

setInterval(() => {
    currentWeather = generateWeather();
    logAction(`Weather: ${currentWeather.state}, Humidity: ${currentWeather.humidity}%, Risk: ${currentWeather.fireRisk}%`);

    if (currentWeather.fireRisk > 60) {
        const warningMessage = `Warning: High fire risk detected (${currentWeather.fireRisk}%). Stay alert.`;
        sendNotification(warningMessage);
        logAction(warningMessage);
    }
}, 15000);

function sendNotification(message: string) {
    if (Notification.permission === "granted") {
        new Notification("Forest Fire Simulation", { body: message });
    }
    logAction(`[NOTIFY] ${message}`);
}

function showFireMarker(i: number, j: number) {
    const lat = startLat + (i + 0.5) * cellHeight;
    const lng = startLng + (j + 0.5) * cellWidth;

    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: "fire-popup",
            html: `<div style="
                background: rgba(255,0,0,0.85);
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                box-shadow: 0 0 5px black;
            ">Attention fire!</div>`,
            iconSize: [110, 24],
            iconAnchor: [55, 12]
        })
    }).addTo(map);

    fireMarkers.push(marker);
}

function countTotalFires(): number {
    let count = 0;
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (grid[i][j].state === "F") count++;
        }
    }
    return count;
}

function dispatchFireResponse() {
    const fireCount = countTotalFires();

    if (fireCount > fireTruckThreshold && !fireTruckDispatched) {
        fireTruckDispatched = true;
        const msg = `Fire truck dispatched to large fire (${fireCount} cells)`;
        logAction(msg);
        sendNotification(msg);
        dispatchFireTruck();
    } else if (fireCount > 0) {
        const msg = `Firefighter dispatched to fire (${fireCount} cell${fireCount > 1 ? 's' : ''})`;
        logAction(msg);
        sendNotification(msg);

        if (!firefighterTimer) {
            firefighterTimer = setInterval(() => {
                moveFirefighters();
                drawGrid();
                if (countTotalFires() === 0) {
                    clearInterval(firefighterTimer!);
                    firefighterTimer = null;
                    logAction("✅ All fires extinguished by firefighter(s)");
                    sendNotification("✅ All fires extinguished");
                }
            }, 1000);
        }
    }
}

function findNearestFire(i: number, j: number): [number, number] | null {
    let minDist = Infinity;
    let closest: [number, number] | null = null;

    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            if (grid[x][y].state === "F") {
                const dist = Math.abs(i - x) + Math.abs(j - y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = [x, y];
                }
            }
        }
    }
    return closest;
}

function moveFirefighters() {
    firefighters.forEach(f => {
        const target = findNearestFire(f.i, f.j);
        if (!target) return;

        const [ti, tj] = target;
        if (f.i < ti) f.i++;
        else if (f.i > ti) f.i--;
        else if (f.j < tj) f.j++;
        else if (f.j > tj) f.j--;

        if (grid[f.i][f.j].state === "F") {
            grid[f.i][f.j].state = "T";
            const msg = `✅ Firefighter extinguished fire at [${f.i},${f.j}]`;
            logAction(msg);
            sendNotification(msg);
        }
    });
}

function dispatchFireTruck() {
    const edges = [
        [0, 0], [0, gridSize - 1],
        [gridSize - 1, 0], [gridSize - 1, gridSize - 1]
    ];

    edges.forEach(([i, j]) => {
        sprayWater(i, j, 2);
    });

    setTimeout(() => {
        fireTruckDispatched = false;
    }, 5000);
}

function sprayWater(centerI: number, centerJ: number, radius: number) {
    for (let i = centerI - radius; i <= centerI + radius; i++) {
        for (let j = centerJ - radius; j <= centerJ + radius; j++) {
            if (i >= 0 && j >= 0 && i < gridSize && j < gridSize && grid[i][j].state === "F") {
                grid[i][j].state = "T";
                const msg = `Fire truck extinguished fire at [${i},${j}]`;
                logAction(msg);
                sendNotification(msg);
            }
        }
    }
}

export function drawGrid() {
    map.eachLayer(layer => {
        if (layer instanceof L.Rectangle || layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    fireMarkers = [];

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const cell = grid[i][j];
            const bounds: L.LatLngBoundsExpression = [
                [startLat + i * cellHeight, startLng + j * cellWidth],
                [startLat + (i + 1) * cellHeight, startLng + (j + 1) * cellWidth]
            ];

            const rectangle = L.rectangle(bounds, {
                color: cell.state === "F" ? "orange" : "red",
                weight: 2,
                fillOpacity: cell.state === "F" ? 0.5 : 0,
            }).addTo(map)
                .bindTooltip(`Temperature: ${cell.temp}°C\nHumidity: ${cell.humidity}%\nState: ${cell.state}`, {
                    direction: "top",
                    offset: [0, -10]
                })
                .on("click", () => {
                    logAction(`Clicked on cell [${i},${j}]: Temp=${cell.temp}°C, Humidity=${cell.humidity}%, State=${cell.state}`);
                });

            if (cell.state === "F") {
                showFireMarker(i, j);
            }
        }
    }

    (document.getElementById("generation-label")!).innerText = `Generation: ${generation}`;
}

function nextGeneration() {
    if (pendingFireResponse || !currentWeather) return;

    const baseTemp = parseFloat(localStorage.getItem("sim_baseTemp") || "30");
    const humidityOverride = parseFloat(localStorage.getItem("sim_humidity") || "50");
    windStrength = parseFloat(localStorage.getItem("sim_windSpeed") || "2");
    windDirection = (localStorage.getItem("sim_windDir") as WindDirection) || "E";

    const newGrid = JSON.parse(JSON.stringify(grid)) as Cell[][];
    generation++;

    if (Math.random() < 0.1) {
        windDirection = windDirections[Math.floor(Math.random() * windDirections.length)];
        windStrength = parseFloat((1 + Math.random() * 2).toFixed(1));
        const msg = `Wind: ${windDirection} (${windStrength.toFixed(1)})`;
        logAction(msg);
        sendNotification(msg);
    }

    const offsets: Record<WindDirection, [number, number]> = {
        N: [-1, 0],
        E: [0, 1],
        S: [1, 0],
        W: [0, -1],
    };

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const c = grid[i][j];
            const nc = newGrid[i][j];
            nc.prevTemp = c.temp;

            if (c.hasCloud) {
                const [di, dj] = offsets[windDirection];
                const ni = i + di, nj = j + dj;
                if (ni >= 0 && nj >= 0 && ni < gridSize && nj < gridSize) {
                    newGrid[ni][nj].hasCloud = true;
                    newGrid[ni][nj].raining = Math.random() < 0.3;
                    nc.hasCloud = false;
                    nc.raining = false;
                    logAction(`Cloud moved from [${i},${j}] to [${ni},${nj}]`);
                }
            }

            if (c.raining) {
                nc.humidity = Math.min(100, nc.humidity + 10);
            } else {
                nc.humidity = Math.max(0, nc.humidity - 1);
            }

            const dryness = (100 - nc.humidity) / 100;
            const ignChance = nc.temp * dryness;

            if (c.state === "T" && ignChance > 70 && currentWeather.fireRisk > 70) {
                nc.state = "F";
                const msg = `🔥 New fire started at [${i},${j}]. Temp: ${nc.temp}°C, Humidity: ${nc.humidity}%`;
                logAction(msg);
                sendNotification(msg);
                showFireMarker(i, j);
                return;
            }

            if (c.state === "F") {
                const [di, dj] = offsets[windDirection];
                const ni = i + di, nj = j + dj;
                if (ni >= 0 && nj >= 0 && ni < gridSize && nj < gridSize && newGrid[ni][nj].state === "T") {
                    newGrid[ni][nj].state = "F";
                    logAction(`Fire spread to [${ni},${nj}]`);
                }
            }
        }
    }

    grid = newGrid;
    dispatchFireResponse();
    drawGrid();
}

const makeBtn = (t: string, left: string, fn: () => void) => {
    const b = document.createElement("button");
    b.innerText = t;
    Object.assign(b.style, { position: "absolute", top: "10px", left, zIndex: "1000" });
    b.onclick = fn;
    document.body.appendChild(b);
};

makeBtn("Start", "10px", () => {
    if (!timer) timer = setInterval(nextGeneration, 1000);
});
makeBtn("Stop", "100px", () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
});

const genDiv = document.createElement("div");
genDiv.id = "generation-label";
Object.assign(genDiv.style, {
    position: "absolute",
    top: "50px",
    left: "10px",
    background: "white",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "12px",
    zIndex: "1000",
});
genDiv.innerText = "Generation: 0";
document.body.appendChild(genDiv);

window.onload = () => {
    Notification.requestPermission();
    drawGrid();
};
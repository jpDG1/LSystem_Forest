import * as L from "leaflet";

const map = L.map("map").setView([52.295, 20.638], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const gridSize = 10;
const cellSize = 0.005;
const startLat = 52.295 - (gridSize / 2) * cellSize;
const startLng = 20.638 - (gridSize / 2) * cellSize;

type CellState = "T" | "F" | ".";

interface Cell {
    state: CellState;
    temp: number;
    fireLevel: number;
    hasCloud: boolean;
    raining: boolean;
    showFiretruck?: boolean;
}

let grid: Cell[][] = [];

const windDirections = ["N", "E", "S", "W"] as const;
type WindDirection = typeof windDirections[number];
let windDirection: WindDirection = "E";

const cloudChance = 0.2;
let windStrength = 1 + Math.random() * 2;

const initGrid = () => {
    grid = [];
    for (let i = 0; i < gridSize; i++) {
        grid[i] = [];
        for (let j = 0; j < gridSize; j++) {
            grid[i][j] = {
                state: "T",
                temp: Math.floor(Math.random() * 15) + 25,
                fireLevel: 0,
                hasCloud: Math.random() < cloudChance,
                raining: false,
            };
        }
    }
    grid[5][5].state = "F";
};

initGrid();

let timer: ReturnType<typeof setInterval> | null = null;

const fireColor = (fireLevel: number) => {
    switch (fireLevel) {
        case 0: return "yellow";
        case 1: return "orange";
        case 2: return "red";
        default: return "black";
    }
};

const drawGrid = () => {
    map.eachLayer((layer) => {
        if ((layer as any)._path || (layer as any)._icon) map.removeLayer(layer);
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const cell = grid[i][j];
            const bounds: L.LatLngBoundsExpression = [
                [startLat + i * cellSize, startLng + j * cellSize] as [number, number],
                [startLat + (i + 1) * cellSize, startLng + (j + 1) * cellSize] as [number, number],
            ];

            let fill = "green";
            if (cell.state === ".") fill = "#555";
            else if (cell.state === "F") fill = fireColor(cell.fireLevel);

            const rect = L.rectangle(bounds, {
                color: fill,
                fillColor: fill,
                fillOpacity: 0.7,
                weight: 1,
            }).addTo(map);

            const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
            const centerLng = (bounds[0][1] + bounds[1][1]) / 2;

            L.marker([bounds[0][0] + 0.0007, bounds[1][1] - 0.0007], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="background:white;padding:1px 3px;font-size:10px;border-radius:4px;">${cell.temp}°C</div>`,
                    iconSize: [40, 14]
                })
            }).addTo(map);

            if (cell.hasCloud) {
                const cloudIcon = cell.raining
                    ? 'https://img.icons8.com/emoji/48/cloud-with-rain-emoji.png'
                    : 'https://img.icons8.com/emoji/48/cloud-emoji.png';
                L.marker([centerLat, centerLng], {
                    icon: L.icon({ iconUrl: cloudIcon, iconSize: [28, 28] })
                }).addTo(map);
            }

            const angleMap: Record<WindDirection, number> = {
                N: 0,
                E: 90,
                S: 180,
                W: 270,
            };

            const arrowLat = bounds[0][0] + 0.0012;
            const arrowLng = bounds[0][1] + 0.0012;
            L.marker([arrowLat, arrowLng], {
                icon: L.divIcon({
                    html: `<div style="
                        transform: rotate(${angleMap[windDirection]}deg);
                        font-size: 10px;
                        font-weight: bold;
                        color: blue;
                    ">➡️ ${windStrength.toFixed(1)}</div>`,
                    className: '',
                    iconSize: [50, 12]
                })
            }).addTo(map);

            if (cell.showFiretruck) {
                L.marker([centerLat, centerLng], {
                    icon: L.icon({
                        iconUrl: 'https://img.icons8.com/emoji/48/fire-engine.png',
                        iconSize: [40, 40]
                    })
                }).addTo(map);
            }

            rect.on("click", () => {
                if (grid[i][j].state === "T") {
                    grid[i][j].state = "F";
                    grid[i][j].fireLevel = 0;
                    drawGrid();
                }
            });
        }
    }
};

const getNeighbors = (i: number, j: number): [number, number][] => {
    const neighbors: [number, number][] = [];

    const add = (ni: number, nj: number) => {
        if (ni >= 0 && nj >= 0 && ni < gridSize && nj < gridSize) {
            neighbors.push([ni, nj]);
        }
    };

    const windOffsets: Record<WindDirection, [number, number]> = {
        N: [-1, 0],
        E: [0, 1],
        S: [1, 0],
        W: [0, -1],
    };

    const [di, dj] = windOffsets[windDirection];
    add(i + di, j + dj);

    add(i - 1, j);
    add(i + 1, j);
    add(i, j - 1);
    add(i, j + 1);

    return neighbors;
};

const nextGeneration = () => {
    const newGrid: Cell[][] = JSON.parse(JSON.stringify(grid));

    if (Math.random() < 0.1) {
        windDirection = windDirections[Math.floor(Math.random() * windDirections.length)];
        windStrength = 1 + Math.random() * 2;
    }

    const windOffsets: Record<WindDirection, [number, number]> = {
        N: [-1, 0],
        E: [0, 1],
        S: [1, 0],
        W: [0, -1],
    };

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const cell = grid[i][j];
            const newCell = newGrid[i][j];

            newCell.showFiretruck = false;

            if (cell.state === "T") {
                const neighbors = getNeighbors(i, j);
                for (const [ni, nj] of neighbors) {
                    if (
                        ni >= 0 && nj >= 0 && ni < gridSize && nj < gridSize &&
                        grid[ni][nj].state === "F" && grid[ni][nj].fireLevel < 3 &&
                        !grid[i][j].hasCloud
                    ) {
                        if (grid[i][j].temp >= 35) {
                            newCell.state = "F";
                            newCell.fireLevel = 0;
                        }
                    }
                }
            } else if (cell.state === "F") {
                newCell.showFiretruck = true;
                if (cell.fireLevel === 0) {
                    newCell.state = ".";
                } else if (cell.raining) {
                    newCell.state = ".";
                } else if (cell.fireLevel < 3) {
                    newCell.fireLevel++;
                    newCell.temp += 5;
                } else {
                    newCell.state = ".";
                }
            }

            if (cell.hasCloud) {
                const [di, dj] = windOffsets[windDirection];
                const ni = i + di;
                const nj = j + dj;
                if (ni >= 0 && nj >= 0 && ni < gridSize && nj < gridSize) {
                    newGrid[ni][nj].hasCloud = true;
                    newGrid[ni][nj].raining = Math.random() < 0.3;
                    newCell.hasCloud = false;
                    newCell.raining = false;
                }
            }
        }
    }

    grid = newGrid;
    drawGrid();
};

const startBtn = document.createElement("button");
startBtn.innerText = "▶ Start";
startBtn.style.position = "absolute";
startBtn.style.top = "10px";
startBtn.style.left = "10px";
startBtn.style.zIndex = "1000";
startBtn.onclick = () => {
    if (!timer) timer = setInterval(nextGeneration, 1000);
};
document.body.appendChild(startBtn);

const stopBtn = document.createElement("button");
stopBtn.innerText = "⏹ Stop";
stopBtn.style.position = "absolute";
stopBtn.style.top = "10px";
stopBtn.style.left = "100px";
stopBtn.style.zIndex = "1000";
stopBtn.onclick = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};
document.body.appendChild(stopBtn);

const restartBtn = document.createElement("button");
restartBtn.innerText = "🔄 Restart";
restartBtn.style.position = "absolute";
restartBtn.style.top = "10px";
restartBtn.style.left = "190px";
restartBtn.style.zIndex = "1000";
restartBtn.onclick = () => {
    initGrid();
    drawGrid();
};
document.body.appendChild(restartBtn);

drawGrid();

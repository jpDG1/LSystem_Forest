import readline from "readline";

const gridSize = 6;
const windDirections = ["N", "E", "S", "W"] as const;
type WindDirection = typeof windDirections[number];
let windDirection: WindDirection = "E";
let windStrength = 1 + Math.random() * 2;
let generation = 0;

type CellState = "T" | "F" | ".";

interface Cell {
    state: CellState;
    temp: number;
    fireLevel: number;
    hasCloud: boolean;
    raining: boolean;
}

let grid: Cell[][] = [];
let pendingFires: [number, number][] = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const initGrid = () => {
    grid = [];
    for (let i = 0; i < gridSize; i++) {
        grid[i] = [];
        for (let j = 0; j < gridSize; j++) {
            grid[i][j] = {
                state: "T",
                temp: Math.floor(Math.random() * 15) + 25,
                fireLevel: 0,
                hasCloud: Math.random() < 0.2,
                raining: false,
            };
        }
    }
    grid[2][2].state = "F";
    generation = 0;
};

const logGrid = () => {
    console.clear();
    console.log(`GENERATION: ${generation}`);
    console.log(`WIND: ${windDirection}, Strength: ${windStrength.toFixed(1)}\n`);
    for (let i = 0; i < gridSize; i++) {
        let row = "";
        for (let j = 0; j < gridSize; j++) {
            const cell = grid[i][j];
            if (cell.state === "F") row += "🔥 ";
            else if (cell.state === "T") row += "🌲 ";
            else row += "⬛ ";
        }
        console.log(row);
    }
};

const getNeighbors = (i: number, j: number): [number, number][] => {
    const neighbors: [number, number][] = [];
    const add = (ni: number, nj: number) => {
        if (ni >= 0 && nj >= 0 && ni < gridSize && nj < gridSize) {
            neighbors.push([ni, nj]);
        }
    };

    const offsets: Record<WindDirection, [number, number]> = {
        N: [-1, 0],
        E: [0, 1],
        S: [1, 0],
        W: [0, -1],
    };

    const [di, dj] = offsets[windDirection];
    add(i + di, j + dj);
    add(i - 1, j);
    add(i + 1, j);
    add(i, j - 1);
    add(i, j + 1);

    return neighbors;
};

const askFireResponse = (i: number, j: number) => {
    rl.question(`🔥 Пожежа в клітинці [${i},${j}]! Викликати пожежну машину? (Y/N): `, (answer) => {
        const ans = answer.trim().toUpperCase();
        if (ans === "Y") {
            console.log(`🚒 Пожежна машина виїхала до клітинки [${i},${j}]!`);
            grid[i][j].state = "."; // Гасимо пожежу
        } else if (ans === "N") {
            console.log(`❌ Виклик скасовано для клітинки [${i},${j}].`);
        } else {
            console.log("⚠️ Введи Y або N.");
        }
    });
};

const nextGeneration = () => {
    generation++;

    if (Math.random() < 0.1) {
        windDirection = windDirections[Math.floor(Math.random() * windDirections.length)];
        windStrength = 1 + Math.random() * 2;
    }

    const newGrid: Cell[][] = JSON.parse(JSON.stringify(grid));
    pendingFires = [];

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const cell = grid[i][j];
            const newCell = newGrid[i][j];

            if (cell.state === "T") {
                const neighbors = getNeighbors(i, j);
                for (const [ni, nj] of neighbors) {
                    if (
                        grid[ni][nj].state === "F" &&
                        grid[ni][nj].fireLevel < 3 &&
                        !cell.hasCloud &&
                        cell.temp >= 35
                    ) {
                        newCell.state = "F";
                        newCell.fireLevel = 0;
                        console.log(`🔥 Загоряння в [${i},${j}]`);
                        pendingFires.push([i, j]);
                    }
                }
            } else if (cell.state === "F") {
                if (cell.fireLevel < 3) {
                    newCell.fireLevel++;
                    newCell.temp += 5;
                } else {
                    newCell.state = ".";
                    console.log(`🧯 Вогонь згас у [${i},${j}]`);
                }
            }

            // Хмари
            const offset = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] }[windDirection];
            if (cell.hasCloud && offset) {
                const [di, dj] = offset;
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
    logGrid();

    // 🔥 Обробка запитів на пожежу
    if (pendingFires.length > 0) {
        const [i, j] = pendingFires[0]; // перша пожежа
        askFireResponse(i, j);
    }
};

initGrid();
logGrid();
setInterval(nextGeneration, 2000);

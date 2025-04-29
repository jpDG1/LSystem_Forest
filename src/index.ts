import * as L from "leaflet";

const map = L.map("map").setView([52.295, 20.638], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// ---------------------- СІМУЛЯЦІЯ ----------------------

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
}

let grid: Cell[][] = [];
let generation = 0;

const windDirections = ["N", "E", "S", "W"] as const;
type WindDirection = typeof windDirections[number];
let windDirection: WindDirection = "E";
let windStrength = 1 + Math.random() * 2;
const cloudChance = 0.2;

let fireCoordinates: [number, number] | null = null;
let pendingFireResponse = false;

// Логер через проксі /log
const logAction = (msg: string) => {
    console.log("[SIM LOG]", msg);
    fetch("/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
    }).catch(() => console.warn("[LOG DOWN]", msg));
};

const initGrid = () => {
    grid = [];
    for (let i = 0; i < gridSize; i++) {
        grid[i] = [];
        for (let j = 0; j < gridSize; j++) {
            const temp = Math.floor(Math.random() * 15) + 25;
            grid[i][j] = {
                state: "T",
                temp,
                prevTemp: temp,
                hasCloud: Math.random() < cloudChance,
                raining: false,
            };
        }
    }
    generation = 0;
};
initGrid();

let timer: ReturnType<typeof setInterval> | null = null;

// --- Погода (без змін) ---

const weatherStates = ["sunny", "cloudy", "rainy"] as const;
type WeatherState = typeof weatherStates[number];
interface Weather { state: WeatherState; humidity: number; fireRisk: number; }
let currentWeather: Weather | null = null;

function randomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateWeather(): Weather {
    const state = weatherStates[Math.floor(Math.random() * weatherStates.length)];
    let humidity = 0, fireRisk = 0;
    switch (state) {
        case "sunny": humidity = randomInRange(10, 40); fireRisk = randomInRange(70, 90); break;
        case "cloudy": humidity = randomInRange(40, 70); fireRisk = randomInRange(30, 50); break;
        case "rainy": humidity = randomInRange(70, 90); fireRisk = randomInRange(5, 20); break;
    }
    return { state, humidity, fireRisk };
}

function describeWeather(w: Weather) {
    const desc = { sunny: "Sunny 🌞", cloudy: "Cloudy ☁️", rainy: "Rainy 🌧️" }[w.state];
    const alert = w.state === "sunny"
        ? "⚡ High fire risk!"
        : "ℹ️ Low fire risk.";
    logAction(`Weather: ${desc}, Humidity: ${w.humidity}%, Risk: ${w.fireRisk}% — ${alert}`);
}

setInterval(() => {
    currentWeather = generateWeather();
    describeWeather(currentWeather);
}, 15000);

// --- Новий попап для підтвердження пожежі ---

function showFireConfirmation(i: number, j: number, lat: number, lng: number) {
    pendingFireResponse = true;
    fireCoordinates = [i, j];

    const popupContent = document.createElement("div");
    popupContent.innerHTML = `
    <p>🔥 Fire at [${i},${j}]. Викликати пожежну машину?</p>
    <button id="fire-yes">Так</button>
    <button id="fire-no">Ні</button>
  `;

    const popup = L.popup({ closeOnClick: false, autoClose: false })
        .setLatLng([lat, lng])
        .setContent(popupContent)
        .openOn(map);

    popupContent.querySelector<HTMLButtonElement>("#fire-yes")!.onclick = () => {
        // гасять вогонь
        if (fireCoordinates) {
            const [fi, fj] = fireCoordinates;
            grid[fi][fj].state = "T";
            grid[fi][fj].temp -= 10;
            logAction(`🚒 Firetruck dispatched to [${fi},${fj}]`);
        }
        cleanup();
    };

    popupContent.querySelector<HTMLButtonElement>("#fire-no")!.onclick = () => {
        if (fireCoordinates) {
            const [fi, fj] = fireCoordinates;
            logAction(`❌ No action taken for fire at [${fi},${fj}]`);
        }
        cleanup();
    };

    function cleanup() {
        pendingFireResponse = false;
        fireCoordinates = null;
        map.closePopup(popup);
        drawGrid();
    }
}

// --- Малюємо сітку (без змін) ---

const drawGrid = () => {
    map.eachLayer(l => {
        if ((l as any)._path || (l as any)._icon) map.removeLayer(l);
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OSM contributors",
    }).addTo(map);

    const angleMap: Record<WindDirection, number> = { N:0, E:90, S:180, W:270 };

    for (let i=0; i<gridSize; i++){
        for (let j=0; j<gridSize; j++){
            const cell = grid[i][j];
            const bounds: L.LatLngBoundsExpression = [
                [startLat + i*cellHeight, startLng + j*cellWidth],
                [startLat + (i+1)*cellHeight, startLng + (j+1)*cellWidth]
            ];
            L.rectangle(bounds, {
                color: cell.state==="F" ? "orange":"red",
                weight: 2, fillOpacity: cell.state==="F"?0.5:0
            }).addTo(map)
                .bindTooltip(`🌡 ${cell.temp}°C — ${windStrength.toFixed(1)} ${windDirection}`, {
                    direction:"top", offset:[0,-10]
                });
            const [lat, lng] = [
                (bounds[0][0]+bounds[1][0])/2,
                (bounds[0][1]+bounds[1][1])/2
            ];
            if (cell.hasCloud) {
                const url = cell.raining
                    ? "https://img.icons8.com/emoji/48/cloud-with-rain-emoji.png"
                    : "https://img.icons8.com/emoji/48/cloud-emoji.png";
                L.marker([lat, lng], { icon: L.icon({ iconUrl:url, iconSize:[20,20] }) }).addTo(map);
            }
            if (cell.state==="F") {
                const truck = "https://img.icons8.com/emoji/48/fire-engine.png";
                L.marker([lat,lng], { icon: L.icon({iconUrl:truck, iconSize:[28,28]}) }).addTo(map);
            }
            // стрілка вітру
            L.marker([bounds[0][0]+0.0008, bounds[0][1]+0.0008], {
                icon: L.divIcon({
                    html:`<div style="transform:rotate(${angleMap[windDirection]}deg);font-size:8px;color:blue">
                   ${windStrength.toFixed(1)}
                 </div>`,
                    className:"", iconSize:[40,10]
                })
            }).addTo(map);
        }
    }

    (document.getElementById("generation-label")!).innerText = `Generation: ${generation}`;
};

// --- Наступне покоління з викликом попапу ---

const nextGeneration = () => {
    if (pendingFireResponse || !currentWeather) return;
    const newGrid: Cell[][] = JSON.parse(JSON.stringify(grid));
    generation++;

    // час від часу змінюємо вітер
    if (Math.random()<0.1){
        windDirection = windDirections[Math.floor(Math.random()*windDirections.length)];
        windStrength = 1 + Math.random()*2;
        logAction(`💨 Wind → ${windDirection} (${windStrength.toFixed(1)})`);
    }

    const offsets: Record<WindDirection,[number,number]> = {
        N:[-1,0], E:[0,1], S:[1,0], W:[0,-1]
    };

    for (let i=0; i<gridSize; i++){
        for (let j=0; j<gridSize; j++){
            const cell = grid[i][j];
            const newCell = newGrid[i][j];
            newCell.prevTemp = cell.temp;

            // рух хмар
            if (cell.hasCloud) {
                const [di,dj] = offsets[windDirection];
                const ni=i+di, nj=j+dj;
                if (ni>=0 && nj>=0 && ni<gridSize && nj<gridSize){
                    newGrid[ni][nj].hasCloud = true;
                    newGrid[ni][nj].raining = Math.random()<0.3;
                    newCell.hasCloud = false;
                    newCell.raining = false;
                    logAction(`☁️ Cloud moved [${i},${j}]→[${ni},${nj}]`);
                }
            }

            // пожежа
            if (cell.state==="T" && cell.temp>70 && currentWeather.fireRisk>70){
                newCell.state="F";
                // координати для попапу:
                const centerLat = startLat + (i+0.5)*cellHeight;
                const centerLng = startLng + (j+0.5)*cellWidth;
                showFireConfirmation(i, j, centerLat, centerLng);
                return; // виходимо, поки користувач не відповість
            }
        }
    }

    grid = newGrid;
    drawGrid();
};

// --- Кнопки і запуск---

const createButton = (t:string, left:string, onC:()=>void) => {
    const b=document.createElement("button");
    b.innerText=t;
    Object.assign(b.style,{position:"absolute",top:"10px",left,zIndex:"1000"});
    b.onclick=onC;
    document.body.appendChild(b);
};
createButton("▶ Start","10px",()=>{ if(!timer) timer=setInterval(nextGeneration,1000); });
createButton("⏹ Stop","100px",()=>{ if(timer){clearInterval(timer);timer=null;} });

const genDiv=document.createElement("div");
genDiv.id="generation-label";
Object.assign(genDiv.style,{
    position:"absolute",top:"50px",left:"10px",background:"white",
    padding:"2px 6px",borderRadius:"4px",fontSize:"12px",zIndex:"1000"
});
genDiv.innerText="Generation: 0";
document.body.appendChild(genDiv);

window.onload = ()=>{ if(!timer) timer = setInterval(nextGeneration,1000) };
drawGrid();

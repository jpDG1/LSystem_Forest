import { initGrid, drawGrid } from "./index";

export function createSettingsPanel() {
    const settingsBtn = document.createElement("button");
    settingsBtn.innerText = "Settings";
    Object.assign(settingsBtn.style, {
        position: "absolute", top: "10px", left: "200px", zIndex: "1000"
    });
    document.body.appendChild(settingsBtn);

    const panel = document.createElement("div");
    panel.id = "settings-panel";
    Object.assign(panel.style, {
        position: "absolute", top: "50px", left: "200px", zIndex: "1000",
        backgroundColor: "white", border: "1px solid #ccc", padding: "10px",
        display: "none", borderRadius: "4px", boxShadow: "0 0 5px rgba(0,0,0,0.3)"
    });

    panel.innerHTML = `
        <label>Base Temperature (°C): <input id="inp-temp" type="number" value="30"/></label><br>
        <label>Humidity Override (%): <input id="inp-hum" type="number" value="50"/></label><br>
        <label>Wind Speed (1-5): <input id="inp-windSpeed" type="number" value="2"/></label><br>
        <label>Wind Direction:
            <select id="inp-windDir">
                <option value="N">North</option>
                <option value="E">East</option>
                <option value="S">South</option>
                <option value="W">West</option>
            </select>
        </label><br>
        <button id="apply-settings" style="margin-top:8px;">Apply</button>
        <div id="settings-confirmation" style="color: green; margin-top: 5px; display: none;">Settings applied.</div>
    `;

    document.body.appendChild(panel);

    settingsBtn.onclick = () => {
        panel.style.display = panel.style.display === "none" ? "block" : "none";
    };

    const applyBtn = panel.querySelector<HTMLButtonElement>("#apply-settings")!;
    const confirmationMsg = panel.querySelector<HTMLDivElement>("#settings-confirmation")!;

    const inputs = panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");

    const updateSettings = () => {
        const temp = panel.querySelector<HTMLInputElement>("#inp-temp")!.value;
        const hum = panel.querySelector<HTMLInputElement>("#inp-hum")!.value;
        const wind = panel.querySelector<HTMLSelectElement>("#inp-windDir")!.value;
        const windSpeed = panel.querySelector<HTMLInputElement>("#inp-windSpeed")!.value;

        localStorage.setItem("sim_baseTemp", temp);
        localStorage.setItem("sim_humidity", hum);
        localStorage.setItem("sim_windDir", wind);
        localStorage.setItem("sim_windSpeed", windSpeed);

        initGrid();
        drawGrid();
    };

    // Автоматичне оновлення при зміні будь-якого поля
    inputs.forEach(input => {
        input.addEventListener("input", updateSettings);
    });

    // Поведінка кнопки Apply залишається
    applyBtn.addEventListener("click", () => {
        updateSettings();
        confirmationMsg.style.display = "block";
        setTimeout(() => {
            confirmationMsg.style.display = "none";
            panel.style.display = "none";
        }, 1000);
    });
}

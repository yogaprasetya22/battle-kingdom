/**
 * main.ts — Entry point
 * Orchestrates SharedArrayBuffer, Web Worker, Renderer, dan UI.
 *
 * ponytail: no framework, no DI, no event bus. Direct function calls.
 */

import { BUFFER_BYTES } from "./simulation/constants";
import {
    setSharedData,
    startRenderLoop,
    changeModel,
    spawnSkillFX,
    resetUnitsVisual,
} from "./graphics/core/renderer";
import { soundFX } from "./graphics/core/SoundFX";

// ---- Shared Buffer (bridge antara main thread & worker) ----
const sharedBuffer = new SharedArrayBuffer(BUFFER_BYTES);
const sharedData = new Float32Array(sharedBuffer);

// ---- Web Worker ----
const worker = new Worker(
    new URL("./simulation/battle.worker.ts", import.meta.url),
    { type: "module" },
);

// ---- UI Elements ----
const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;
const scoreA = document.getElementById("score-a") as HTMLSpanElement;
const scoreB = document.getElementById("score-b") as HTMLSpanElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const overlayMsg = document.getElementById(
    "overlay-msg",
) as HTMLParagraphElement;
const overlayBtn = document.getElementById("overlay-btn") as HTMLButtonElement;
const statsContainer = document.getElementById(
    "stats-container",
) as HTMLDivElement;
const workerTicks = document.getElementById("worker-ticks") as HTMLSpanElement;
const selectModel = document.getElementById(
    "select-model",
) as HTMLSelectElement;
const selectMatchup = document.getElementById(
    "select-matchup",
) as HTMLSelectElement;

let tickCount = 0;

function enableControls() {
    btnStart.disabled = false;
    btnReset.disabled = false;
    selectModel.disabled = false;
    selectMatchup.disabled = false;
}

function disableControls() {
    btnStart.disabled = true;
    btnReset.disabled = true;
    selectModel.disabled = true;
    selectMatchup.disabled = true;
}

// ---- Worker message handler ----
worker.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === "ready") {
        // Worker selesai init/reset
        enableControls();
    }

    if (type === "score") {
        scoreA.textContent = e.data.aliveA;
        scoreB.textContent = e.data.aliveB;
        tickCount++;
        if (workerTicks) workerTicks.textContent = tickCount.toString();
    }

    if (type === "end") {
        const winner: "A" | "B" = e.data.winner;
        // Determine if the current viewer's team won (assume viewer is Team A for now)
        // ponytail: play victory sound for Team A viewer, defeat otherwise
        if (winner === "A") {
            soundFX.playVictory();
        } else {
            soundFX.playDefeat();
        }
        overlayMsg.textContent =
            winner === "A" ? "🔴 Tim A Menang!" : "🔵 Tim B Menang!";

        const stats = e.data.stats;
        if (stats && statsContainer) {
            statsContainer.innerHTML = `
        <div class="stats-team-section">
          <div class="stats-team-title team-a-border">🔴 Tim A (Merah)</div>
          <div class="stats-grid stats-header">
            <div>Kelas</div>
            <div>Dmg Dealt</div>
            <div>Dmg Taken</div>
            <div>Kills</div>
            <div>Heals</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">🛡️ Tank</div>
            <div class="stats-cell">${stats.teamA.tankDealt}</div>
            <div class="stats-cell">${stats.teamA.tankTaken}</div>
            <div class="stats-cell">${stats.teamA.tankKills}</div>
            <div class="stats-cell">${stats.teamA.tankHealed}</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">🏹 Archer</div>
            <div class="stats-cell">${stats.teamA.archerDealt}</div>
            <div class="stats-cell">${stats.teamA.archerTaken}</div>
            <div class="stats-cell">${stats.teamA.archerKills}</div>
            <div class="stats-cell">${stats.teamA.archerHealed}</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">✨ Mage</div>
            <div class="stats-cell">${stats.teamA.mageDealt}</div>
            <div class="stats-cell">${stats.teamA.mageTaken}</div>
            <div class="stats-cell">${stats.teamA.mageKills}</div>
            <div class="stats-cell">${stats.teamA.mageHealed}</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">💚 Healer</div>
            <div class="stats-cell">${stats.teamA.healerDealt}</div>
            <div class="stats-cell">${stats.teamA.healerTaken}</div>
            <div class="stats-cell">${stats.teamA.healerKills}</div>
            <div class="stats-cell">${stats.teamA.healerHealed}</div>
          </div>
        </div>

        <div class="stats-team-section" style="margin-top: 15px;">
          <div class="stats-team-title team-b-border">🔵 Tim B (Biru)</div>
          <div class="stats-grid stats-header">
            <div>Kelas</div>
            <div>Dmg Dealt</div>
            <div>Dmg Taken</div>
            <div>Kills</div>
            <div>Heals</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">🛡️ Tank</div>
            <div class="stats-cell">${stats.teamB.tankDealt}</div>
            <div class="stats-cell">${stats.teamB.tankTaken}</div>
            <div class="stats-cell">${stats.teamB.tankKills}</div>
            <div class="stats-cell">${stats.teamB.tankHealed}</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">🏹 Archer</div>
            <div class="stats-cell">${stats.teamB.archerDealt}</div>
            <div class="stats-cell">${stats.teamB.archerTaken}</div>
            <div class="stats-cell">${stats.teamB.archerKills}</div>
            <div class="stats-cell">${stats.teamB.archerHealed}</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">✨ Mage</div>
            <div class="stats-cell">${stats.teamB.mageDealt}</div>
            <div class="stats-cell">${stats.teamB.mageTaken}</div>
            <div class="stats-cell">${stats.teamB.mageKills}</div>
            <div class="stats-cell">${stats.teamB.mageHealed}</div>
          </div>
          <div class="stats-grid">
            <div class="stats-class">💚 Healer</div>
            <div class="stats-cell">${stats.teamB.healerDealt}</div>
            <div class="stats-cell">${stats.teamB.healerTaken}</div>
            <div class="stats-cell">${stats.teamB.healerKills}</div>
            <div class="stats-cell">${stats.teamB.healerHealed}</div>
          </div>
        </div>
      `;
        }

        overlay.style.display = "flex";
        btnStart.disabled = true;
    }

    if (type === "skillFX") {
        spawnSkillFX(e.data);
    }
};

// ---- UI handlers ----
btnStart.addEventListener("click", () => {
    soundFX.init();
    disableControls();
    // Biarkan Reset tetap aktif saat pertempuran berjalan
    btnReset.disabled = false;
    worker.postMessage({ type: "start" });
});

btnReset.addEventListener("click", () => {
    disableControls();
    overlay.style.display = "none";
    tickCount = 0;
    if (workerTicks) workerTicks.textContent = "0";
    resetUnitsVisual();
    worker.postMessage({ type: "reset", matchup: selectMatchup.value });
});

overlayBtn.addEventListener("click", () => {
    disableControls();
    overlay.style.display = "none";
    tickCount = 0;
    if (workerTicks) workerTicks.textContent = "0";
    resetUnitsVisual();
    worker.postMessage({ type: "reset", matchup: selectMatchup.value });
});

selectModel.addEventListener("change", () => {
    disableControls();
    overlay.style.display = "none";
    tickCount = 0;
    if (workerTicks) workerTicks.textContent = "0";

    // Reset worker state & positions
    worker.postMessage({ type: "reset", matchup: selectMatchup.value });

    // Muat model baru
    changeModel(
        selectModel.value,
        selectMatchup.value,
        () => {
            // Callback sukses
            enableControls();
        },
        () => {
            // Callback error (re-enable select so they can choose another one)
            selectModel.disabled = false;
            selectMatchup.disabled = false;
        },
    );
});

selectMatchup.addEventListener("change", () => {
    disableControls();
    overlay.style.display = "none";
    tickCount = 0;
    if (workerTicks) workerTicks.textContent = "0";
    resetUnitsVisual();
    worker.postMessage({ type: "reset", matchup: selectMatchup.value });

    // Re-clone models to match the new matchup types
    changeModel(selectModel.value, selectMatchup.value, () => {
        enableControls();
    });
});

// ---- Init sequence ----
setSharedData(sharedData);
startRenderLoop();

// Kirim buffer ke worker
worker.postMessage({
    type: "init",
    buffer: sharedBuffer,
    matchup: selectMatchup.value,
});

// Load model awal secara dinamis
changeModel("Chef_Hat", selectMatchup.value);

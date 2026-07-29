/**
 * main.ts — Entry point
 * Orchestrates SharedArrayBuffer, Web Worker, Renderer, dan UI.
 *
 * ponytail: no framework, no DI, no event bus. Direct function calls.
 */

import {
    BUFFER_BYTES,
    UNIT_COUNT,
    TEAM_SIZE,
    TEAM_A,
    STRIDE,
    IDX_HP,
    IDX_TEAM,
} from "./simulation/constants";
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

// ---- Web Workers ----
const NUM_WORKERS = 2;
const workers: Worker[] = [];
for (let i = 0; i < NUM_WORKERS; i++) {
    workers.push(
        new Worker(new URL("./simulation/battle.worker.ts", import.meta.url), {
            type: "module",
        })
    );
}

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
export let isRunning = false;
let pendingTick = false;
let workersDoneCount = 0;
let lastTime = performance.now();
let readyWorkersCount = 0;
let statsReceivedCount = 0;
let battleWinner: "A" | "B" = "A";

const aggregatedStats = {
    teamA: {
        tankDealt: 0, tankTaken: 0, tankKills: 0, tankHealed: 0,
        archerDealt: 0, archerTaken: 0, archerKills: 0, archerHealed: 0,
        mageDealt: 0, mageTaken: 0, mageKills: 0, mageHealed: 0,
        healerDealt: 0, healerTaken: 0, healerKills: 0, healerHealed: 0
    },
    teamB: {
        tankDealt: 0, tankTaken: 0, tankKills: 0, tankHealed: 0,
        archerDealt: 0, archerTaken: 0, archerKills: 0, archerHealed: 0,
        mageDealt: 0, mageTaken: 0, mageKills: 0, mageHealed: 0,
        healerDealt: 0, healerTaken: 0, healerKills: 0, healerHealed: 0
    }
};

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

const mergeStats = (ws: any) => {
    for (const team of ["teamA", "teamB"] as const) {
        for (const key in aggregatedStats[team]) {
            (aggregatedStats[team] as any)[key] += (ws[team] as any)[key];
        }
    }
};

function showBattleEnd(winner: "A" | "B", stats: typeof aggregatedStats) {
    if (winner === "A") {
        soundFX.playVictory();
    } else {
        soundFX.playDefeat();
    }
    overlayMsg.textContent =
        winner === "A" ? "🔴 Tim A Menang!" : "🔵 Tim B Menang!";

    if (statsContainer) {
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

function onTickComplete() {
    pendingTick = false;
    tickCount++;
    if (workerTicks) workerTicks.textContent = tickCount.toString();

    // Count alive units on main thread to check end conditions
    let aliveOrUnspawnedA = 0;
    let aliveOrUnspawnedB = 0;
    let aliveA = 0;
    let aliveB = 0;

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const hp = sharedData[base + IDX_HP];
        if (hp > 0 || hp === -999) {
            if (sharedData[base + IDX_TEAM] === TEAM_A) {
                aliveOrUnspawnedA++;
                if (hp > 0) aliveA++;
            } else {
                aliveOrUnspawnedB++;
                if (hp > 0) aliveB++;
            }
        }
    }

    scoreA.textContent = aliveA.toString();
    scoreB.textContent = aliveB.toString();

    if (aliveOrUnspawnedA === 0 || aliveOrUnspawnedB === 0) {
        isRunning = false;

        // Reset and prepare statistics aggregation
        statsReceivedCount = 0;
        battleWinner = aliveOrUnspawnedA > 0 ? "A" : "B";

        aggregatedStats.teamA.tankDealt = 0; aggregatedStats.teamA.tankTaken = 0; aggregatedStats.teamA.tankKills = 0; aggregatedStats.teamA.tankHealed = 0;
        aggregatedStats.teamA.archerDealt = 0; aggregatedStats.teamA.archerTaken = 0; aggregatedStats.teamA.archerKills = 0; aggregatedStats.teamA.archerHealed = 0;
        aggregatedStats.teamA.mageDealt = 0; aggregatedStats.teamA.mageTaken = 0; aggregatedStats.teamA.mageKills = 0; aggregatedStats.teamA.mageHealed = 0;
        aggregatedStats.teamA.healerDealt = 0; aggregatedStats.teamA.healerTaken = 0; aggregatedStats.teamA.healerKills = 0; aggregatedStats.teamA.healerHealed = 0;

        aggregatedStats.teamB.tankDealt = 0; aggregatedStats.teamB.tankTaken = 0; aggregatedStats.teamB.tankKills = 0; aggregatedStats.teamB.tankHealed = 0;
        aggregatedStats.teamB.archerDealt = 0; aggregatedStats.teamB.archerTaken = 0; aggregatedStats.teamB.archerKills = 0; aggregatedStats.teamB.archerHealed = 0;
        aggregatedStats.teamB.mageDealt = 0; aggregatedStats.teamB.mageTaken = 0; aggregatedStats.teamB.mageKills = 0; aggregatedStats.teamB.mageHealed = 0;
        aggregatedStats.teamB.healerDealt = 0; aggregatedStats.teamB.healerTaken = 0; aggregatedStats.teamB.healerKills = 0; aggregatedStats.teamB.healerHealed = 0;

        for (let i = 0; i < NUM_WORKERS; i++) {
            workers[i].postMessage({ type: "get_stats" });
        }
    }
}

function gameLoop() {
    if (!isRunning) return;

    const now = performance.now();
    const deltaTime = now - lastTime;

    // ponytail: use 15ms threshold to prevent frame-skipping stutter on 60Hz displays (16.6ms frame time)
    if (deltaTime >= 15 && !pendingTick) {
        pendingTick = true;
        workersDoneCount = 0;
        for (let i = 0; i < NUM_WORKERS; i++) {
            workers[i].postMessage({ type: "tick" });
        }
        lastTime = now - (deltaTime % 15);
    }

    requestAnimationFrame(gameLoop);
}

// ---- Worker message handlers ----
for (let i = 0; i < NUM_WORKERS; i++) {
    workers[i].onmessage = (e: MessageEvent) => {
        const { type } = e.data;

        if (type === "ready") {
            readyWorkersCount++;
            if (readyWorkersCount === NUM_WORKERS) {
                enableControls();
            }
        }

        if (type === "tick_done") {
            workersDoneCount++;
            if (workersDoneCount === NUM_WORKERS) {
                onTickComplete();
            }
        }

        if (type === "stats") {
            mergeStats(e.data.stats);
            statsReceivedCount++;
            if (statsReceivedCount === NUM_WORKERS) {
                showBattleEnd(battleWinner, aggregatedStats);
            }
        }

        if (type === "skillFX") {
            spawnSkillFX(e.data);
        }
    };
}

function resetWorkers() {
    isRunning = false;
    pendingTick = false;
    tickCount = 0;
    readyWorkersCount = 0;
    if (workerTicks) workerTicks.textContent = "0";
    resetUnitsVisual();
    for (let i = 0; i < NUM_WORKERS; i++) {
        workers[i].postMessage({ type: "reset", matchup: selectMatchup.value });
    }
}

// ---- UI handlers ----
btnStart.addEventListener("click", () => {
    soundFX.init();
    disableControls();
    // Biarkan Reset tetap aktif saat pertempuran berjalan
    btnReset.disabled = false;
    isRunning = true;
    pendingTick = false;
    lastTime = performance.now();
    gameLoop();
});

btnReset.addEventListener("click", () => {
    disableControls();
    overlay.style.display = "none";
    resetWorkers();
});

overlayBtn.addEventListener("click", () => {
    disableControls();
    overlay.style.display = "none";
    resetWorkers();
});

selectModel.addEventListener("change", () => {
    disableControls();
    overlay.style.display = "none";
    resetWorkers();

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
    resetWorkers();

    // Re-clone models to match the new matchup types
    changeModel(selectModel.value, selectMatchup.value, () => {
        enableControls();
    });
});

// ---- Init sequence ----
setSharedData(sharedData);
startRenderLoop();

// Kirim buffer ke worker
for (let i = 0; i < NUM_WORKERS; i++) {
    workers[i].postMessage({
        type: "init",
        buffer: sharedBuffer,
        matchup: selectMatchup.value,
        startIndex: i === 0 ? 0 : TEAM_SIZE,
        endIndex: i === 0 ? TEAM_SIZE : UNIT_COUNT,
    });
}

// Load model awal secara dinamis
changeModel("Knight", selectMatchup.value);


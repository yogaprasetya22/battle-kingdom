/**
 * main.ts — Entry point
 * Orchestrates SharedArrayBuffer, Web Worker, Renderer, dan UI.
 *
 * ponytail: no framework, no DI, no event bus. Direct function calls.
 */

import { BUFFER_BYTES, UNIT_COUNT, TEAM_SIZE } from "./simulation/constants";
import {
    setSharedData,
    startRenderLoop,
    setBeforeRenderCb,
    changeModel,
    spawnSkillFX,
    resetUnitsVisual,
} from "./graphics/core/renderer";
import { soundFX } from "./graphics/core/SoundFX";
import { CharacterViewer } from "./graphics/viewer/CharacterViewer";
import { WorkerDiagnostics } from "./simulation/WorkerDiagnostics";
import { perfProfiler } from "./graphics/core/PerformanceProfiler";

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
        }),
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
const btnSettings = document.getElementById(
    "btn-settings",
) as HTMLButtonElement;

interface TeamConfig {
    tank: number;
    archer: number;
    mage: number;
    healer: number;
    gunslinger: number;
    assassin: number;
}
let teamAConfig: TeamConfig = {
    tank: 15,
    archer: 20,
    mage: 20,
    healer: 5,
    gunslinger: 20,
    assassin: 20,
};
let teamBConfig: TeamConfig = {
    tank: 15,
    archer: 20,
    mage: 20,
    healer: 5,
    gunslinger: 20,
    assassin: 20,
};

const savedA = localStorage.getItem("teamAConfig");
const savedB = localStorage.getItem("teamBConfig");
if (savedA) {
    try {
        teamAConfig = JSON.parse(savedA);
    } catch (e) {}
}
if (savedB) {
    try {
        teamBConfig = JSON.parse(savedB);
    } catch (e) {}
}

// ---- Per-Worker State Tracking (Option 1: Synchronization Fix) ----
interface WorkerTickState {
    workerId: number;
    currentTickId: number;
    aliveA: number;
    aliveB: number;
    aliveOrUnspawnedA: number;
    aliveOrUnspawnedB: number;
}

let tickCount = 0;
export let isRunning = false;
let pendingTick = false;
let lastTime = performance.now();
let readyWorkersCount = 0;
let statsReceivedCount = 0;
let battleWinner: "A" | "B" = "A";

// Track current global tick ID (incremented each time we dispatch tick)
let globalTickId = 0;

// Per-worker state tracking: indexed by workerId (0, 1, 2, 3, ...)
const workerTickStates: Map<number, WorkerTickState> = new Map();

// Diagnostics for Option 1 synchronization (disabled by default, enable with workerDiagnostics.enable())
const diagnostics = new WorkerDiagnostics(false);

const aggregatedStats = {
    teamA: {
        tankDealt: 0,
        tankTaken: 0,
        tankKills: 0,
        tankHealed: 0,
        archerDealt: 0,
        archerTaken: 0,
        archerKills: 0,
        archerHealed: 0,
        mageDealt: 0,
        mageTaken: 0,
        mageKills: 0,
        mageHealed: 0,
        healerDealt: 0,
        healerTaken: 0,
        healerKills: 0,
        healerHealed: 0,
        gunslingerDealt: 0,
        gunslingerTaken: 0,
        gunslingerKills: 0,
        gunslingerHealed: 0,
        assassinDealt: 0,
        assassinTaken: 0,
        assassinKills: 0,
        assassinHealed: 0,
    },
    teamB: {
        tankDealt: 0,
        tankTaken: 0,
        tankKills: 0,
        tankHealed: 0,
        archerDealt: 0,
        archerTaken: 0,
        archerKills: 0,
        archerHealed: 0,
        mageDealt: 0,
        mageTaken: 0,
        mageKills: 0,
        mageHealed: 0,
        healerDealt: 0,
        healerTaken: 0,
        healerKills: 0,
        healerHealed: 0,
        gunslingerDealt: 0,
        gunslingerTaken: 0,
        gunslingerKills: 0,
        gunslingerHealed: 0,
        assassinDealt: 0,
        assassinTaken: 0,
        assassinKills: 0,
        assassinHealed: 0,
    },
};

function enableControls() {
    btnStart.disabled = false;
    btnReset.disabled = false;
    selectModel.disabled = false;
    selectMatchup.disabled = false;
    btnSettings.disabled = false;
    if (btnViewer) btnViewer.disabled = false;
}

function disableControls() {
    btnStart.disabled = true;
    btnReset.disabled = true;
    selectModel.disabled = true;
    selectMatchup.disabled = true;
    btnSettings.disabled = true;
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

    // Hentikan recording & unduh report kinerja pertempuran otomatis
    perfProfiler.stopLogging();
    perfProfiler.exportReport();

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
      <div class="stats-grid">
        <div class="stats-class">🔫 Gunslinger</div>
        <div class="stats-cell">${stats.teamA.gunslingerDealt}</div>
        <div class="stats-cell">${stats.teamA.gunslingerTaken}</div>
        <div class="stats-cell">${stats.teamA.gunslingerKills}</div>
        <div class="stats-cell">${stats.teamA.gunslingerHealed}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🗡️ Assassin</div>
        <div class="stats-cell">${stats.teamA.assassinDealt}</div>
        <div class="stats-cell">${stats.teamA.assassinTaken}</div>
        <div class="stats-cell">${stats.teamA.assassinKills}</div>
        <div class="stats-cell">${stats.teamA.assassinHealed}</div>
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
      <div class="stats-grid">
        <div class="stats-class">🔫 Gunslinger</div>
        <div class="stats-cell">${stats.teamB.gunslingerDealt}</div>
        <div class="stats-cell">${stats.teamB.gunslingerTaken}</div>
        <div class="stats-cell">${stats.teamB.gunslingerKills}</div>
        <div class="stats-cell">${stats.teamB.gunslingerHealed}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🗡️ Assassin</div>
        <div class="stats-cell">${stats.teamB.assassinDealt}</div>
        <div class="stats-cell">${stats.teamB.assassinTaken}</div>
        <div class="stats-cell">${stats.teamB.assassinKills}</div>
        <div class="stats-cell">${stats.teamB.assassinHealed}</div>
      </div>
    </div>
  `;
    }

    overlay.style.display = "flex";
    btnStart.disabled = true;
}

// Accumulated from worker tick_done messages
let accumAliveA = 0;
let accumAliveB = 0;
let accumAliveOrUnspawnedA = 0;
let accumAliveOrUnspawnedB = 0;

function onTickComplete() {
    pendingTick = false;
    tickCount++;
    if (workerTicks) workerTicks.textContent = tickCount.toString();

    scoreA.textContent = accumAliveA.toString();
    scoreB.textContent = accumAliveB.toString();

    if (accumAliveOrUnspawnedA === 0 || accumAliveOrUnspawnedB === 0) {
        isRunning = false;

        // Reset and prepare statistics aggregation
        statsReceivedCount = 0;
        battleWinner = accumAliveOrUnspawnedA > 0 ? "A" : "B";

        aggregatedStats.teamA.tankDealt = 0;
        aggregatedStats.teamA.tankTaken = 0;
        aggregatedStats.teamA.tankKills = 0;
        aggregatedStats.teamA.tankHealed = 0;
        aggregatedStats.teamA.archerDealt = 0;
        aggregatedStats.teamA.archerTaken = 0;
        aggregatedStats.teamA.archerKills = 0;
        aggregatedStats.teamA.archerHealed = 0;
        aggregatedStats.teamA.mageDealt = 0;
        aggregatedStats.teamA.mageTaken = 0;
        aggregatedStats.teamA.mageKills = 0;
        aggregatedStats.teamA.mageHealed = 0;
        aggregatedStats.teamA.healerDealt = 0;
        aggregatedStats.teamA.healerTaken = 0;
        aggregatedStats.teamA.healerKills = 0;
        aggregatedStats.teamA.healerHealed = 0;
        aggregatedStats.teamA.gunslingerDealt = 0;
        aggregatedStats.teamA.gunslingerTaken = 0;
        aggregatedStats.teamA.gunslingerKills = 0;
        aggregatedStats.teamA.gunslingerHealed = 0;
        aggregatedStats.teamA.assassinDealt = 0;
        aggregatedStats.teamA.assassinTaken = 0;
        aggregatedStats.teamA.assassinKills = 0;
        aggregatedStats.teamA.assassinHealed = 0;

        aggregatedStats.teamB.tankDealt = 0;
        aggregatedStats.teamB.tankTaken = 0;
        aggregatedStats.teamB.tankKills = 0;
        aggregatedStats.teamB.tankHealed = 0;
        aggregatedStats.teamB.archerDealt = 0;
        aggregatedStats.teamB.archerTaken = 0;
        aggregatedStats.teamB.archerKills = 0;
        aggregatedStats.teamB.archerHealed = 0;
        aggregatedStats.teamB.mageDealt = 0;
        aggregatedStats.teamB.mageTaken = 0;
        aggregatedStats.teamB.mageKills = 0;
        aggregatedStats.teamB.mageHealed = 0;
        aggregatedStats.teamB.healerDealt = 0;
        aggregatedStats.teamB.healerTaken = 0;
        aggregatedStats.teamB.healerKills = 0;
        aggregatedStats.teamB.healerHealed = 0;
        aggregatedStats.teamB.gunslingerDealt = 0;
        aggregatedStats.teamB.gunslingerTaken = 0;
        aggregatedStats.teamB.gunslingerKills = 0;
        aggregatedStats.teamB.gunslingerHealed = 0;
        aggregatedStats.teamB.assassinDealt = 0;
        aggregatedStats.teamB.assassinTaken = 0;
        aggregatedStats.teamB.assassinKills = 0;
        aggregatedStats.teamB.assassinHealed = 0;

        for (let i = 0; i < NUM_WORKERS; i++) {
            workers[i].postMessage({ type: "get_stats" });
        }
    }
}

/**
 * Check if all workers have completed the same tick ID.
 * Returns true if all workers are synchronized on globalTickId.
 */
function allWorkersSyncedOnTick(): boolean {
    if (workerTickStates.size !== NUM_WORKERS) {
        return false;
    }
    for (const state of workerTickStates.values()) {
        if (state.currentTickId !== globalTickId) {
            return false;
        }
    }
    return true;
}

/**
 * Aggregate counts from all workers that are synced on the current tick.
 */
function aggregateWorkerCounts(): void {
    accumAliveA = 0;
    accumAliveB = 0;
    accumAliveOrUnspawnedA = 0;
    accumAliveOrUnspawnedB = 0;

    for (const state of workerTickStates.values()) {
        if (state.currentTickId === globalTickId) {
            accumAliveA += state.aliveA;
            accumAliveB += state.aliveB;
            accumAliveOrUnspawnedA += state.aliveOrUnspawnedA;
            accumAliveOrUnspawnedB += state.aliveOrUnspawnedB;
        }
    }
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
            const workerId = e.data.workerId ?? -1;

            // Update per-worker state with current tick results
            if (workerId >= 0 && e.data.aliveA !== undefined) {
                workerTickStates.set(workerId, {
                    workerId,
                    currentTickId: globalTickId,
                    aliveA: e.data.aliveA,
                    aliveB: e.data.aliveB,
                    aliveOrUnspawnedA: e.data.aliveOrUnspawnedA,
                    aliveOrUnspawnedB: e.data.aliveOrUnspawnedB,
                });
            }

            // Check if all workers have synced on the current tick
            if (allWorkersSyncedOnTick()) {
                aggregateWorkerCounts();

                // Record diagnostic snapshot for this tick
                diagnostics.recordTick(
                    globalTickId,
                    workerTickStates,
                    NUM_WORKERS,
                    true,
                    accumAliveA,
                    accumAliveB,
                    accumAliveOrUnspawnedA,
                    accumAliveOrUnspawnedB,
                );

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

        if (type === "skillFXBatch") {
            const events: any[] = e.data.events;
            if (events) {
                for (let k = 0; k < events.length; k++) {
                    spawnSkillFX(events[k]);
                }
            }
        }
    };
}

function getCustomClasses(): number[] {
    const badges = document.querySelectorAll(".class-badge");
    const activeTypes: number[] = [];
    badges.forEach((b: any) => {
        if (b.classList.contains("active")) {
            activeTypes.push(parseInt(b.dataset.type || "0"));
        }
    });
    return activeTypes.length > 0 ? activeTypes : [0, 1, 2, 3, 4, 5];
}

function resetWorkers() {
    isRunning = false;
    pendingTick = false;
    tickCount = 0;
    globalTickId = 0;
    readyWorkersCount = 0;
    workerTickStates.clear();
    if (workerTicks) workerTicks.textContent = "0";
    resetUnitsVisual();

    const customClasses = getCustomClasses();
    for (let i = 0; i < NUM_WORKERS; i++) {
        workers[i].postMessage({
            type: "reset",
            matchup: selectMatchup.value,
            customClasses,
            teamAConfig,
            teamBConfig,
        });
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

    // Mulai record performance profiling
    perfProfiler.startLogging();
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
    const customPanel = document.getElementById("custom-classes-panel");
    if (customPanel) {
        customPanel.style.display =
            selectMatchup.value === "custom" ? "flex" : "none";
    }

    disableControls();
    overlay.style.display = "none";
    resetWorkers();

    // Re-clone models to match the new matchup types
    changeModel(selectModel.value, selectMatchup.value, () => {
        enableControls();
    });
});

// ── Model Viewer ──
// Inisialisasi CharacterViewer (lazy — baru load saat user klik tombol)
let characterViewer: CharacterViewer | null = null;
let viewerLoaded = false;

const viewerOverlay = document.getElementById(
    "viewer-overlay",
) as HTMLDivElement;
const btnViewer = document.getElementById("btn-viewer") as HTMLButtonElement;
const btnViewerClose = document.getElementById(
    "viewer-btn-close",
) as HTMLButtonElement;
const btnViewerPrev = document.getElementById(
    "viewer-btn-prev",
) as HTMLButtonElement;
const btnViewerNext = document.getElementById(
    "viewer-btn-next",
) as HTMLButtonElement;
const viewerCanvasWrap = document.getElementById(
    "viewer-canvas-wrap",
) as HTMLDivElement;

// Handler: buka viewer
btnViewer.addEventListener("click", async () => {
    // Hentikan pertempuran agar tidak bentrok
    if (isRunning) {
        isRunning = false;
        resetWorkers();
    }

    // Tampilkan overlay
    viewerOverlay.classList.add("active");

    // Jika viewer belum pernah dibuat, buat sekarang
    if (!characterViewer) {
        characterViewer = new CharacterViewer();
        characterViewer.attachToDOM(viewerCanvasWrap);

        // Preload aset (dengan progress ke console)
        await characterViewer.preloadAssets((msg, pct) => {
            console.log(`[Viewer] ${msg} (${pct}%)`);
        });

        viewerLoaded = true;
    }

    // Mulai render loop viewer
    characterViewer.startRenderLoop();

    // Tampilkan karakter pertama
    if (viewerLoaded) {
        characterViewer.showCharacter(0);
    }
});

// Handler: tutup viewer
function closeViewer(): void {
    if (characterViewer) {
        characterViewer.stopRenderLoop();
    }
    viewerOverlay.classList.remove("active");
}

btnViewerClose.addEventListener("click", closeViewer);

// Handler: navigasi kiri/kanan
btnViewerPrev.addEventListener("click", () => {
    if (characterViewer && viewerLoaded) {
        characterViewer.prevCharacter();
    }
});

btnViewerNext.addEventListener("click", () => {
    if (characterViewer && viewerLoaded) {
        characterViewer.nextCharacter();
    }
});

// Handler: keyboard untuk navigasi viewer
document.addEventListener("keydown", (e) => {
    if (!viewerOverlay.classList.contains("active")) return;
    if (e.key === "Escape") {
        closeViewer();
    } else if (e.key === "ArrowLeft") {
        characterViewer?.prevCharacter();
    } else if (e.key === "ArrowRight") {
        characterViewer?.nextCharacter();
    }
});

// Handler: tombol animasi di viewer
document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("viewer-anim-btn")) return;

    const animState = parseInt(target.dataset.anim || "0", 10);
    if (characterViewer) {
        characterViewer.playAnimation(animState);

        // Update active state UI
        document.querySelectorAll(".viewer-anim-btn").forEach((btn) => {
            btn.classList.remove("active-anim");
        });
        target.classList.add("active-anim");
    }
});

// ---- Init sequence ----
setSharedData(sharedData);

// Inject worker tick dispatch into render loop (eliminates separate rAF)
setBeforeRenderCb((_timestamp: number, _delta: number) => {
    if (!isRunning) return;
    const now = performance.now();
    const deltaTime = now - lastTime;
    if (deltaTime >= 15 && !pendingTick) {
        pendingTick = true;
        globalTickId++;

        // Reset worker states for this tick (mark all as pending)
        for (let i = 0; i < NUM_WORKERS; i++) {
            if (!workerTickStates.has(i)) {
                workerTickStates.set(i, {
                    workerId: i,
                    currentTickId: globalTickId - 1,
                    aliveA: 0,
                    aliveB: 0,
                    aliveOrUnspawnedA: 0,
                    aliveOrUnspawnedB: 0,
                });
            }
        }

        // Dispatch tick to all workers
        for (let i = 0; i < NUM_WORKERS; i++) {
            workers[i].postMessage({ type: "tick", tickId: globalTickId });
        }
        lastTime = now - (deltaTime % 15);
    }
});

startRenderLoop();

// Kirim buffer ke worker dengan workerId untuk per-worker tracking
// Distribute units evenly across ALL workers (not by team)
const unitsPerWorker = Math.ceil(UNIT_COUNT / NUM_WORKERS);
const customClasses = getCustomClasses();
for (let i = 0; i < NUM_WORKERS; i++) {
    const startIndex = i * unitsPerWorker;
    const endIndex = Math.min((i + 1) * unitsPerWorker, UNIT_COUNT);

    workers[i].postMessage({
        type: "init",
        workerId: i,
        buffer: sharedBuffer,
        matchup: selectMatchup.value,
        customClasses,
        teamAConfig,
        teamBConfig,
        startIndex,
        endIndex,
    });
}

// ---- Settings UI Logic ----
const settingsOverlay = document.getElementById(
    "settings-overlay",
) as HTMLDivElement;
const btnSettingsClose = document.getElementById(
    "btn-settings-close",
) as HTMLButtonElement;
const btnSettingsCancel = document.getElementById(
    "btn-settings-cancel",
) as HTMLButtonElement;
const btnSettingsSave = document.getElementById(
    "btn-settings-save",
) as HTMLButtonElement;
const settingsWarning = document.getElementById(
    "settings-warning",
) as HTMLDivElement;

const presetBalanced = document.getElementById(
    "preset-balanced",
) as HTMLButtonElement;
const presetMagic = document.getElementById(
    "preset-magic",
) as HTMLButtonElement;
const presetDefense = document.getElementById(
    "preset-defense",
) as HTMLButtonElement;
const presetStealth = document.getElementById(
    "preset-stealth",
) as HTMLButtonElement;

const classes = ["tank", "archer", "mage", "healer", "gunslinger", "assassin"];

function loadConfigToUI() {
    classes.forEach((cls) => {
        const sliderA = document.getElementById(
            `slider-a-${cls}`,
        ) as HTMLInputElement;
        const chkA = document.getElementById(
            `chk-a-${cls}`,
        ) as HTMLInputElement;
        const valA = document.getElementById(`val-a-${cls}`) as HTMLSpanElement;
        const val = (teamAConfig as any)[cls] ?? 0;

        sliderA.value = val.toString();
        chkA.checked = val > 0;
        sliderA.disabled = !chkA.checked;
        valA.textContent = val.toString();

        const sliderB = document.getElementById(
            `slider-b-${cls}`,
        ) as HTMLInputElement;
        const chkB = document.getElementById(
            `chk-b-${cls}`,
        ) as HTMLInputElement;
        const valB = document.getElementById(`val-b-${cls}`) as HTMLSpanElement;
        const val2 = (teamBConfig as any)[cls] ?? 0;

        sliderB.value = val2.toString();
        chkB.checked = val2 > 0;
        sliderB.disabled = !chkB.checked;
        valB.textContent = val2.toString();
    });
    updateTotals();
}

function updateTotals() {
    let totalA = 0;
    let totalB = 0;

    classes.forEach((cls) => {
        const sliderA = document.getElementById(
            `slider-a-${cls}`,
        ) as HTMLInputElement;
        const chkA = document.getElementById(
            `chk-a-${cls}`,
        ) as HTMLInputElement;
        const valA = document.getElementById(`val-a-${cls}`) as HTMLSpanElement;
        const countA = chkA.checked ? parseInt(sliderA.value) : 0;
        totalA += countA;
        valA.textContent = countA.toString();
        sliderA.disabled = !chkA.checked;

        const sliderB = document.getElementById(
            `slider-b-${cls}`,
        ) as HTMLInputElement;
        const chkB = document.getElementById(
            `chk-b-${cls}`,
        ) as HTMLInputElement;
        const valB = document.getElementById(`val-b-${cls}`) as HTMLSpanElement;
        const countB = chkB.checked ? parseInt(sliderB.value) : 0;
        totalB += countB;
        valB.textContent = countB.toString();
        sliderB.disabled = !chkB.checked;
    });

    const totalASpan = document.getElementById(
        "total-a-units",
    ) as HTMLSpanElement;
    const totalBSpan = document.getElementById(
        "total-b-units",
    ) as HTMLSpanElement;
    if (totalASpan) totalASpan.textContent = totalA.toString();
    if (totalBSpan) totalBSpan.textContent = totalB.toString();

    // ponytail: validate using dynamic TEAM_SIZE constant
    const invalid = totalA <= 0 || totalA > TEAM_SIZE || totalB <= 0 || totalB > TEAM_SIZE;
    if (invalid) {
        settingsWarning.classList.remove("hidden");
        btnSettingsSave.disabled = true;
    } else {
        settingsWarning.classList.add("hidden");
        btnSettingsSave.disabled = false;
    }
}

function applyPreset(presetA: number[], presetB: number[]) {
    classes.forEach((cls, idx) => {
        const sliderA = document.getElementById(
            `slider-a-${cls}`,
        ) as HTMLInputElement;
        const chkA = document.getElementById(
            `chk-a-${cls}`,
        ) as HTMLInputElement;
        sliderA.value = presetA[idx].toString();
        chkA.checked = presetA[idx] > 0;

        const sliderB = document.getElementById(
            `slider-b-${cls}`,
        ) as HTMLInputElement;
        const chkB = document.getElementById(
            `chk-b-${cls}`,
        ) as HTMLInputElement;
        sliderB.value = presetB[idx].toString();
        chkB.checked = presetB[idx] > 0;
    });
    updateTotals();
}

presetBalanced.addEventListener("click", () =>
    // Scaled preset to total 50: [tank, archer, mage, healer, gunslinger, assassin]
    applyPreset([7, 10, 10, 3, 10, 10], [7, 10, 10, 3, 10, 10]),
);
presetMagic.addEventListener("click", () =>
    applyPreset([0, 0, 40, 10, 0, 0], [0, 0, 40, 10, 0, 0]),
);
presetDefense.addEventListener("click", () =>
    applyPreset([30, 15, 0, 5, 0, 0], [30, 15, 0, 5, 0, 0]),
);
presetStealth.addEventListener("click", () =>
    applyPreset([0, 10, 0, 0, 15, 25], [0, 10, 0, 0, 15, 25]),
);

classes.forEach((cls) => {
    document
        .getElementById(`slider-a-${cls}`)
        ?.addEventListener("input", updateTotals);
    document
        .getElementById(`chk-a-${cls}`)
        ?.addEventListener("change", updateTotals);
    document
        .getElementById(`slider-b-${cls}`)
        ?.addEventListener("input", updateTotals);
    document
        .getElementById(`chk-b-${cls}`)
        ?.addEventListener("change", updateTotals);
});

btnSettings.addEventListener("click", () => {
    if (isRunning) {
        isRunning = false;
        resetWorkers();
    }
    
    // ponytail: Dynamicize max properties of sliders & UI labels to match TEAM_SIZE
    const limitTexts = document.querySelectorAll(".limit-placeholder-text");
    limitTexts.forEach((el) => {
        el.textContent = ` / ${TEAM_SIZE} Unit`;
    });
    const subHeader = document.querySelector("#settings-overlay p.text-slate-400");
    if (subHeader) {
        subHeader.textContent = `Atur jumlah unit per kelas untuk setiap tim (Maks. ${TEAM_SIZE} unit per tim)`;
    }
    const warningEl = document.getElementById("settings-warning");
    if (warningEl) {
        warningEl.innerHTML = `⚠️ Total unit untuk salah satu tim melebihi ${TEAM_SIZE} atau kosong! Mohon sesuaikan kembali.`;
    }

    classes.forEach((cls) => {
        const sliderA = document.getElementById(`slider-a-${cls}`) as HTMLInputElement;
        const sliderB = document.getElementById(`slider-b-${cls}`) as HTMLInputElement;
        if (sliderA) sliderA.max = TEAM_SIZE.toString();
        if (sliderB) sliderB.max = TEAM_SIZE.toString();
    });

    loadConfigToUI();
    settingsOverlay.style.display = "flex";
});

const closeSettings = () => {
    settingsOverlay.style.display = "none";
};
btnSettingsClose.addEventListener("click", closeSettings);
btnSettingsCancel.addEventListener("click", closeSettings);

btnSettingsSave.addEventListener("click", () => {
    classes.forEach((cls) => {
        const sliderA = document.getElementById(
            `slider-a-${cls}`,
        ) as HTMLInputElement;
        const chkA = document.getElementById(
            `chk-a-${cls}`,
        ) as HTMLInputElement;
        (teamAConfig as any)[cls] = chkA.checked ? parseInt(sliderA.value) : 0;

        const sliderB = document.getElementById(
            `slider-b-${cls}`,
        ) as HTMLInputElement;
        const chkB = document.getElementById(
            `chk-b-${cls}`,
        ) as HTMLInputElement;
        (teamBConfig as any)[cls] = chkB.checked ? parseInt(sliderB.value) : 0;
    });

    localStorage.setItem("teamAConfig", JSON.stringify(teamAConfig));
    localStorage.setItem("teamBConfig", JSON.stringify(teamBConfig));

    closeSettings();
    selectMatchup.value = "custom_composition";

    disableControls();
    overlay.style.display = "none";
    resetWorkers();
    changeModel(selectModel.value, selectMatchup.value, () => {
        enableControls();
    });
});

// Expose diagnostics to browser console for debugging
(window as any).workerDiagnostics = {
    report: () => diagnostics.generateReport(),
    recentTicks: (count?: number) => diagnostics.getRecentTicks(count),
    checkSync: () => diagnostics.detectSyncIssues(),
    checkCounts: () => diagnostics.verifyCountConsistency(),
    enable: () => diagnostics.setEnabled(true),
    disable: () => diagnostics.setEnabled(false),
};

// Load model awal secara dinamis
changeModel(
    "Knight",
    selectMatchup.value,
    () => {
        enableControls();
    },
    () => {
        enableControls();
    },
);

// Click handler untuk class-badge kustom
document.querySelectorAll(".class-badge").forEach((badge) => {
    badge.addEventListener("click", () => {
        // Toggle status aktif
        badge.classList.toggle("active");

        // Set ulang dan buat kembali model serta worker
        disableControls();
        overlay.style.display = "none";
        resetWorkers();
        changeModel(selectModel.value, selectMatchup.value, () => {
            enableControls();
        });
    });
});

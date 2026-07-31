/**
 * main.ts — Entry point
 * Orchestrates SharedArrayBuffer, Web Worker, Renderer, dan UI.
 *
 * ponytail: no framework, no DI, no event bus. Direct function calls.
 */

import { BUFFER_BYTES, UNIT_COUNT } from "./simulation/constants";
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
    if (btnViewer) btnViewer.disabled = false;
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
    };
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
for (let i = 0; i < NUM_WORKERS; i++) {
    const startIndex = i * unitsPerWorker;
    const endIndex = Math.min((i + 1) * unitsPerWorker, UNIT_COUNT);

    workers[i].postMessage({
        type: "init",
        workerId: i,
        buffer: sharedBuffer,
        matchup: selectMatchup.value,
        startIndex,
        endIndex,
    });
}

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
changeModel("Knight", selectMatchup.value);

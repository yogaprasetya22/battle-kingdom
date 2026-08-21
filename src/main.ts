/**
 * main.ts — Entry point
 * Orchestrates SharedArrayBuffer, Web Worker, Renderer, dan UI.
 *
 * ponytail: no framework, no DI, no event bus. Direct function calls.
 */

import { BUFFER_BYTES, UNIT_COUNT, TEAM_SIZE, HERO_UNIT_INDEX, STRIDE, IDX_X, IDX_Y, IDX_Z, IDX_HP, IDX_ANIM, IDX_TARGET, IDX_TEAM, TEAM_A, TEAM_B, SPAWN_A_X, SPAWN_B_X } from "./simulation/constants";
import {
    setSharedData,
    startRenderLoop,
    setBeforeRenderCb,
    changeModel,
    spawnSkillFX,
    resetUnitsVisual,
    world,
    setHeroActive,
    getUnits,
} from "./graphics/core/renderer";
import { soundFX } from "./graphics/core/SoundFX";
import { CharacterViewer } from "./graphics/viewer/CharacterViewer";
import { WorkerDiagnostics } from "./simulation/WorkerDiagnostics";
import { perfProfiler } from "./graphics/core/PerformanceProfiler";
import { createHero, syncHeroToBuffer } from "./graphics/units/Hero/HeroController";
import { scene, camera } from "./graphics/core/scene";
import * as Colyseus from "colyseus.js";
import { NetworkPlayer } from "./graphics/units/Hero/NetworkPlayer";
import { GameState } from "./net/schema";
import { CartoonBlueGasExplosionNativeVFX } from "./vfx/cartoon-blue-gas-explosion/Native";
import { ProjectileSystem } from "./character/projectile-system";
import { CHARACTER_CONFIG } from "./character/character-config";
import * as THREE from "three";

// ---- Shared Buffer (bridge antara main thread & worker) ----
// Fallback to ArrayBuffer if SharedArrayBuffer is blocked by security extensions (e.g. Cyber Protect)
const sharedBuffer = typeof SharedArrayBuffer !== "undefined"
    ? new SharedArrayBuffer(BUFFER_BYTES)
    : new ArrayBuffer(BUFFER_BYTES);
const sharedData = new Float32Array(sharedBuffer);

// Initialize sharedData with sentinel values (unspawned/dead) to prevent ghost units at (0,0,0) at startup
for (let i = 0; i < UNIT_COUNT; i++) {
    const base = i * STRIDE;
    sharedData[base + IDX_HP] = -999;
    sharedData[base + IDX_X] = -9999;
    sharedData[base + IDX_Y] = -9999;
    sharedData[base + IDX_Z] = -9999;
}

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

// Compact snapshot: 7 fields per unit (x,y,z,hp,anim,target,team) — 100 × 7 × 4 = 2.8KB
// IDX_TARGET needed so Guest renderer knows which enemy each unit faces (fixes stuck animations).
// IDX_TEAM included so applyCompactSnapshot can compute scoreboard without stale worker data.
const COMPACT_FIELDS = 7;
const compactSnapshot = new Float32Array(UNIT_COUNT * COMPACT_FIELDS); // pre-allocated, no GC

function buildCompactSnapshot(): Float32Array {
    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const cBase = i * COMPACT_FIELDS;
        compactSnapshot[cBase]     = sharedData[base + IDX_X];
        compactSnapshot[cBase + 1] = sharedData[base + IDX_Y];
        compactSnapshot[cBase + 2] = sharedData[base + IDX_Z];
        compactSnapshot[cBase + 3] = sharedData[base + IDX_HP];
        compactSnapshot[cBase + 4] = sharedData[base + IDX_ANIM];
        compactSnapshot[cBase + 5] = sharedData[base + IDX_TARGET];
        compactSnapshot[cBase + 6] = sharedData[base + IDX_TEAM];
    }
    return compactSnapshot;
}

function applyCompactSnapshot(data: Float32Array) {
    let aliveA = 0;
    let aliveB = 0;
    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const cBase = i * COMPACT_FIELDS;
        sharedData[base + IDX_X]      = data[cBase];
        sharedData[base + IDX_Y]      = data[cBase + 1];
        sharedData[base + IDX_Z]      = data[cBase + 2];
        sharedData[base + IDX_HP]     = data[cBase + 3];
        sharedData[base + IDX_ANIM]   = data[cBase + 4];
        sharedData[base + IDX_TARGET] = data[cBase + 5];
        sharedData[base + IDX_TEAM]   = data[cBase + 6];
        if (data[cBase + 3] > 0) {
            if (data[cBase + 6] === TEAM_A) aliveA++;
            else if (data[cBase + 6] === TEAM_B) aliveB++;
        }
    }
    scoreA.textContent = aliveA.toString();
    scoreB.textContent = aliveB.toString();
}
// Mock selectModel object because the dropdown is removed from index.html
const selectModel = {
    value: "Knight",
    disabled: false,
    addEventListener: (type: string, listener: any) => {},
};
// Mock selectMatchup object because the dropdown is removed from index.html
const selectMatchup = {
    value: "custom_composition",
    disabled: false,
    addEventListener: (type: string, listener: any) => {},
};
const btnSettings = document.getElementById(
    "btn-settings",
) as HTMLButtonElement;

interface TeamConfig {
    tank: number;
    knight: number;
    archer: number;
    mage: number;
    healer: number;
    gunslinger: number;
    assassin: number;
    skel_tank: number;
    skel_archer: number;
    skel_mage: number;
    skel_healer: number;
    skel_gunslinger: number;
    skel_assassin: number;
}
let teamAConfig: TeamConfig = {
    tank: 7,
    knight: 8,
    archer: 15,
    mage: 10,
    healer: 5,
    gunslinger: 5,
    assassin: 0,
    skel_tank: 0,
    skel_archer: 0,
    skel_mage: 0,
    skel_healer: 0,
    skel_gunslinger: 0,
    skel_assassin: 0,
};
let teamBConfig: TeamConfig = {
    tank: 7,
    knight: 8,
    archer: 15,
    mage: 10,
    healer: 5,
    gunslinger: 5,
    assassin: 0,
    skel_tank: 0,
    skel_archer: 0,
    skel_mage: 0,
    skel_healer: 0,
    skel_gunslinger: 0,
    skel_assassin: 0,
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
        knightDealt: 0,
        knightTaken: 0,
        knightKills: 0,
        knightHealed: 0,
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
        knightDealt: 0,
        knightTaken: 0,
        knightKills: 0,
        knightHealed: 0,
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
    if (isLocalPlayerHost) {
        btnStart.disabled = false;
        btnReset.disabled = false;
        btnSettings.disabled = false;
    } else {
        btnStart.disabled = true;
        btnReset.disabled = true;
        btnSettings.disabled = true;
    }
    selectModel.disabled = false;
    selectMatchup.disabled = false;
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

function formatStatValue(val: number): string {
    if (val >= 1000000) {
        const mVal = val / 1000000;
        return mVal.toFixed(mVal % 1 === 0 ? 0 : 1) + "M";
    }
    if (val >= 1000) {
        const kVal = val / 1000;
        return kVal.toFixed(kVal % 1 === 0 ? 0 : 1) + "k";
    }
    return val.toString();
}

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
        <div class="stats-class">🪓 Barbarian</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.tankDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.tankTaken)}</div>
        <div class="stats-cell">${stats.teamA.tankKills}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.tankHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🛡️ Knight</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.knightDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.knightTaken)}</div>
        <div class="stats-cell">${stats.teamA.knightKills}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.knightHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🏹 Archer</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.archerDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.archerTaken)}</div>
        <div class="stats-cell">${stats.teamA.archerKills}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.archerHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">✨ Mage</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.mageDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.mageTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.mageKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.mageHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">💚 Healer</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.healerDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.healerTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.healerKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.healerHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🔫 Gunslinger</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.gunslingerDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.gunslingerTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.gunslingerKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.gunslingerHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🗡️ Assassin</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.assassinDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.assassinTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.assassinKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamA.assassinHealed)}</div>
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
        <div class="stats-class">🪓 Barbarian</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.tankDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.tankTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.tankKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.tankHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🛡️ Knight</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.knightDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.knightTaken)}</div>
        <div class="stats-cell">${stats.teamB.knightKills}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.knightHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🏹 Archer</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.archerDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.archerTaken)}</div>
        <div class="stats-cell">${stats.teamB.archerKills}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.archerHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">✨ Mage</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.mageDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.mageTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.mageKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.mageHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">💚 Healer</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.healerDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.healerTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.healerKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.healerHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🔫 Gunslinger</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.gunslingerDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.gunslingerTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.gunslingerKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.gunslingerHealed)}</div>
      </div>
      <div class="stats-grid">
        <div class="stats-class">🗡️ Assassin</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.assassinDealt)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.assassinTaken)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.assassinKills)}</div>
        <div class="stats-cell">${formatStatValue(stats.teamB.assassinHealed)}</div>
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

function triggerBattleEnd(winner: "A" | "B") {
    if (!isRunning) return;
    isRunning = false;

    // Reset and prepare statistics aggregation
    statsReceivedCount = 0;
    battleWinner = winner;

    aggregatedStats.teamA.tankDealt = 0;
    aggregatedStats.teamA.tankTaken = 0;
    aggregatedStats.teamA.tankKills = 0;
    aggregatedStats.teamA.tankHealed = 0;
    aggregatedStats.teamA.knightDealt = 0;
    aggregatedStats.teamA.knightTaken = 0;
    aggregatedStats.teamA.knightKills = 0;
    aggregatedStats.teamA.knightHealed = 0;
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
    aggregatedStats.teamB.knightDealt = 0;
    aggregatedStats.teamB.knightTaken = 0;
    aggregatedStats.teamB.knightKills = 0;
    aggregatedStats.teamB.knightHealed = 0;
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

function onTickComplete() {
    pendingTick = false;
    tickCount++;
    if (workerTicks) workerTicks.textContent = tickCount.toString();

    scoreA.textContent = accumAliveA.toString();
    scoreB.textContent = accumAliveB.toString();
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
        const tStartMsg = performance.now();
        const { type } = e.data;

        if (type === "ready") {
            readyWorkersCount++;
            if (readyWorkersCount === NUM_WORKERS) {
                enableControls();
            }
        }

        if (type === "tick_done") {
            const workerId = e.data.workerId ?? -1;

            if (e.data.tickTimeMs !== undefined) {
                // Gunakan latency simulasi worker untuk diagnostics profiling
                perfProfiler.setWorkerTickTime(e.data.tickTimeMs);
            }

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
            if (isLocalPlayerHost && colyseusRoom && colyseusRoom.connection.isOpen) {
                pendingUnitFXEvents.push(e.data);
            }
        }

        if (type === "skillFXBatch") {
            const events: any[] = e.data.events;
            if (events) {
                for (let k = 0; k < events.length; k++) {
                    const ev = events[k];
                    if (ev.type === "turretDamage") {
                        const isDestroyed = world.turrets.takeDamage(ev.team, ev.damage);
                        if (isDestroyed && isRunning) {
                            // If Tim A's turret is destroyed (team === 0), Tim B wins. Otherwise Tim A wins.
                            triggerBattleEnd(ev.team === 0 ? "B" : "A");
                        }
                    } else {
                        if (ev.skill === "turretShoot") {
                            world.turrets.shoot(ev.team, ev.tx, ev.ty, ev.tz);
                            const muzzlePos = world.turrets.getMuzzlePosition(ev.team);
                            if (muzzlePos) {
                                ev.fx = muzzlePos.x;
                                ev.fy = muzzlePos.y;
                                ev.fz = muzzlePos.z;
                            }
                        }
                        spawnSkillFX(ev);
                        if (isLocalPlayerHost && colyseusRoom && colyseusRoom.connection.isOpen) {
                            pendingUnitFXEvents.push(ev);
                        }
                    }
                }
            }
        }
        const tDurationMsg = performance.now() - tStartMsg;
        perfProfiler.trackSystemTime("workerMsg", perfProfiler.getSystemTime("workerMsg") + tDurationMsg);
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
    scoreA.textContent = TEAM_SIZE.toString();
    scoreB.textContent = TEAM_SIZE.toString();
    resetUnitsVisual();
    world.turrets.reset();

    const customClasses = isLocalPlayerHost ? getCustomClasses() : guestCustomClasses;
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
    // Host can reset during battle
    btnReset.disabled = !isLocalPlayerHost;
    isRunning = true;
    pendingTick = false;
    lastTime = performance.now();

    // Mulai record performance profiling
    perfProfiler.startLogging();

    // Broadcast to guests
    if (colyseusRoom && colyseusRoom.connection.isOpen && isLocalPlayerHost) {
        colyseusRoom.send("startSimulation");
    }
});

btnReset.addEventListener("click", () => {
    disableControls();
    overlay.style.display = "none";
    resetWorkers();

    // Broadcast to guests
    if (colyseusRoom && colyseusRoom.connection.isOpen && isLocalPlayerHost) {
        colyseusRoom.send("resetSimulation");
    }
});

overlayBtn.addEventListener("click", () => {
    disableControls();
    overlay.style.display = "none";
    resetWorkers();

    // Broadcast to guests
    if (colyseusRoom && colyseusRoom.connection.isOpen && isLocalPlayerHost) {
        colyseusRoom.send("resetSimulation");
    }
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
if (btnViewer) {
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
}

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

// ── Worker-Bypass: Hero Controller ──
// createHero wires CharacterController + VFX + SkillsSystem + keyboard input.
// Camera dikontrol CharacterController langsung (spring arm + mouse look).
const { ctrl: heroCtrl, skills } = createHero(scene, camera, workers);
setHeroActive(true);

// Tangani event hit proyektil (panah mengenai unit musuh)
window.addEventListener('projectile_hit', (e: any) => {
    const { targetIdx, damage } = e.detail;
    if (isLocalPlayerHost) {
        // Tentukan worker mana yang mengurus unit target ini
        const targetWorkerIdx = Math.floor(targetIdx / Math.ceil(UNIT_COUNT / NUM_WORKERS));
        const targetWorker = workers[targetWorkerIdx];
        if (targetWorker) {
            // Baca posisi unit target dari SAB (bukan posisi hero) agar radius 0.8m tepat sasaran
            const base = targetIdx * 15; // STRIDE = 15
            const unitX = sharedData[base + 0]; // IDX_X = 0
            const unitZ = sharedData[base + 2]; // IDX_Z = 2
            targetWorker.postMessage({
                type: 'PLAYER_SKILL_CAST',
                skillId: 'basic_attack',
                originX: unitX,   // pusat AoE = posisi unit target
                originZ: unitZ,
                radius: 1.5,      // radius cukup besar untuk tangkap unit tepat
                damage: damage,
                targetTeam: targetIdx < TEAM_SIZE ? 0 : 1
            });
        }
    } else {
        // Guest mengirim info hit ke server untuk diteruskan ke Host
        if (colyseusRoom && colyseusRoom.connection.isOpen) {
            colyseusRoom.send("projectileHitUnit", { targetIdx, damage });
        }
    }
});

// Set initial HUD score from TEAM_SIZE — no hardcoded values in HTML
scoreA.textContent = TEAM_SIZE.toString();
scoreB.textContent = TEAM_SIZE.toString();

// ---- Colyseus Connection ----
const SERVER_URL = (import.meta.env.VITE_SERVER_URL && !import.meta.env.VITE_SERVER_URL.includes("localhost"))
  ? import.meta.env.VITE_SERVER_URL
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:2567`;

const colyseusClient = new Colyseus.Client(SERVER_URL);
let colyseusRoom: Colyseus.Room | null = null;
const networkPlayers = new Map<string, NetworkPlayer>();
const networkProjectiles = new ProjectileSystem(scene);
const networkHitVFX = new CartoonBlueGasExplosionNativeVFX(scene, camera);
let lastNetworkSendTime = 0;
let pendingUnitFXEvents: any[] = [];
let incomingFXQueue: any[] = [];
let guestCustomClasses: number[] = [0, 1, 2, 3, 4, 5];

let roomHostId = "";
let isLocalPlayerHost = false;

const onlineCountEl = document.getElementById("online-count");
const onlineListEl = document.getElementById("online-players-list");

function updateOnlinePlayersUI() {
    if (!onlineCountEl || !onlineListEl || !colyseusRoom) return;

    const count = 1 + networkPlayers.size;
    onlineCountEl.textContent = `${count} Online`;

    const isMeHost = colyseusRoom.sessionId === roomHostId;
    let html = `
      <li class="flex items-center justify-between bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
        <span class="truncate font-medium text-slate-200 font-mono">Anda (${colyseusRoom.sessionId.slice(0, 5)}...)</span>
        <span class="text-[9px] ${isMeHost ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-400 bg-blue-500/10'} font-bold px-1.5 py-0.5 rounded">
          ${isMeHost ? 'Host' : 'Guest'}
        </span>
      </li>
    `;

    networkPlayers.forEach((_, sessionId) => {
        const isThisHost = sessionId === roomHostId;
        html += `
          <li class="flex items-center justify-between bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span class="truncate font-medium text-slate-300 font-mono">${sessionId.slice(0, 5)}...</span>
            <span class="text-[9px] ${isThisHost ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-400 bg-blue-500/10'} font-bold px-1.5 py-0.5 rounded">
              ${isThisHost ? 'Host' : 'Guest'}
            </span>
          </li>
        `;
    });

    onlineListEl.innerHTML = html;
}

async function initMultiplayer() {
    try {
        colyseusRoom = await colyseusClient.joinOrCreate("game_room");
        console.log("Connected to game room:", colyseusRoom.id);
        updateOnlinePlayersUI();

        // Receive lobby host updates
        colyseusRoom.onMessage("lobbyInfo", (data: { hostId: string }) => {
            roomHostId = data.hostId;
            const wasHost = isLocalPlayerHost;
            isLocalPlayerHost = colyseusRoom?.sessionId === roomHostId;
            updateOnlinePlayersUI();

            // Set spawn position and team based on host/guest role
            if (isLocalPlayerHost) {
                heroCtrl.position.set(SPAWN_A_X, 2, 0);
            } else {
                heroCtrl.position.set(SPAWN_B_X, 2, 0);
            }
            heroCtrl.playerGroup.position.copy(heroCtrl.position);

            // Send config to server when becoming host so it can be cached for new joiners
            if (isLocalPlayerHost && !wasHost && colyseusRoom) {
                colyseusRoom.send("updateConfig", {
                    teamAConfig,
                    teamBConfig,
                    customClasses: getCustomClasses()
                });
            }
        });

        // 1. Receive initial list of players already online
        colyseusRoom.onMessage("initialPlayers", (players: any[]) => {
            players.forEach((p) => {
                if (p.id === colyseusRoom?.sessionId) return;
                if (networkPlayers.has(p.id)) return;
                console.log("Adding initial player:", p.id);
                const np = new NetworkPlayer(scene, p.id);
                np.targetPosition.set(p.x, p.y, p.z);
                np.targetRotationY = p.rotY;
                np.playAnimationState(p.anim);
                networkPlayers.set(p.id, np);
            });
            updateOnlinePlayersUI();
        });

        // 2. New player joined the room
        colyseusRoom.onMessage("playerJoined", (p: any) => {
            if (p.id === colyseusRoom?.sessionId) return;
            if (networkPlayers.has(p.id)) {
                console.log("Player already registered, updating position:", p.id);
                const existingNp = networkPlayers.get(p.id);
                if (existingNp) {
                    existingNp.targetPosition.set(p.x, p.y, p.z);
                    existingNp.targetRotationY = p.rotY;
                    existingNp.playAnimationState(p.anim);
                }
                return;
            }
            console.log("New network player joined:", p.id);
            const np = new NetworkPlayer(scene, p.id);
            np.targetPosition.set(p.x, p.y, p.z);
            np.targetRotationY = p.rotY;
            np.playAnimationState(p.anim);
            networkPlayers.set(p.id, np);
            updateOnlinePlayersUI();
        });

        // 3. Another player moved
        colyseusRoom.onMessage("playerMoved", (p: any) => {
            if (p.id === colyseusRoom?.sessionId) return;
            const np = networkPlayers.get(p.id);
            if (np) {
                np.targetPosition.set(p.x, p.y, p.z);
                np.targetRotationY = p.rotY;
                np.playAnimationState(p.anim);
            }
        });

        // 4. A player disconnected
        colyseusRoom.onMessage("playerLeft", (p: any) => {
            console.log("Network player left:", p.id);
            const np = networkPlayers.get(p.id);
            if (np) {
                np.destroy();
                networkPlayers.delete(p.id);
            }
            updateOnlinePlayersUI();
        });

        // 5. Receive skill casting event from another player
        colyseusRoom.onMessage("playerCastSkill", (p: { id: string, skillId: string, originX: number, originZ: number }) => {
            if (p.id === colyseusRoom?.sessionId) return;
            const np = networkPlayers.get(p.id);
            skills.triggerNetworkVFX(p.skillId, p.originX, p.originZ, np?.playerMesh || undefined);
        });

        // 6. Listen to local skill casts and forward to Colyseus server
        window.addEventListener('network_skill_cast', (e: any) => {
            if (colyseusRoom && colyseusRoom.connection.isOpen) {
                colyseusRoom.send("castSkill", e.detail);
            }
        });

        // 7. Receive attack casting event from another player (basic attack arrow)
        colyseusRoom.onMessage("playerCastAttack", (p: { id: string, x: number, y: number, z: number, dx: number, dy: number, dz: number }) => {
            if (p.id === colyseusRoom?.sessionId) return;
            const startPos = new THREE.Vector3(p.x, p.y, p.z);
            const dir = new THREE.Vector3(p.dx, p.dy, p.dz);
            const casterTeam = (p.id === roomHostId) ? TEAM_A : TEAM_B;
            networkProjectiles.spawn(startPos, dir, CHARACTER_CONFIG.projectiles.speed, null, casterTeam);
        });

        // 8. Listen to local attacks and forward to Colyseus server
        window.addEventListener('network_attack_cast', (e: any) => {
            if (colyseusRoom && colyseusRoom.connection.isOpen) {
                colyseusRoom.send("castAttack", e.detail);
            }
        });

        // 9. Host-controlled action replication for guests
        colyseusRoom.onMessage("simulationStarted", () => {
            if (!isLocalPlayerHost) {
                soundFX.init();
                disableControls();
                isRunning = true;
                pendingTick = false;
                lastTime = performance.now();
                perfProfiler.startLogging();
            }
        });

        colyseusRoom.onMessage("simulationReset", () => {
            if (!isLocalPlayerHost) {
                disableControls();
                overlay.style.display = "none";
                resetWorkers();
            }
        });

        colyseusRoom.onMessage("configUpdated", (config: any) => {
            if (!isLocalPlayerHost) {
                Object.assign(teamAConfig, config.teamAConfig);
                Object.assign(teamBConfig, config.teamBConfig);
                if (config.customClasses) {
                    guestCustomClasses = config.customClasses;
                    document.querySelectorAll(".class-badge").forEach((badge: any) => {
                        const type = parseInt(badge.dataset.type || "0");
                        if (config.customClasses.includes(type)) {
                            badge.classList.add("active");
                        } else {
                            badge.classList.remove("active");
                        }
                    });
                }
                localStorage.setItem("teamAConfig", JSON.stringify(teamAConfig));
                localStorage.setItem("teamBConfig", JSON.stringify(teamBConfig));
                
                disableControls();
                overlay.style.display = "none";
                resetWorkers();
                loadConfigToUI();

                // Re-create visual unit models to match the synced configuration
                loadModel(selectModel.value, selectMatchup.value, () => {
                    enableControls();
                });
            }
        });

        // Guest listens for Host unit state compact sync (5 fields per unit)
        colyseusRoom.onMessage("unitsSynced", (data: ArrayBuffer) => {
            if (!isLocalPlayerHost) {
                const receivedArray = new Float32Array(data);
                // Compact format: UNIT_COUNT * COMPACT_FIELDS (5) floats
                if (receivedArray.length === UNIT_COUNT * COMPACT_FIELDS) {
                    applyCompactSnapshot(receivedArray);
                }
            }
        });

        // Host listens for damage events forwarded from guests
        colyseusRoom.onMessage("unitTakeDamage", (data: { targetIdx: number, damage: number }) => {
            if (isLocalPlayerHost) {
                const { targetIdx, damage } = data;
                const targetWorkerIdx = Math.floor(targetIdx / Math.ceil(UNIT_COUNT / NUM_WORKERS));
                const targetWorker = workers[targetWorkerIdx];
                if (targetWorker) {
                    const base = targetIdx * 15;
                    const unitX = sharedData[base + 0];
                    const unitZ = sharedData[base + 2];
                    targetWorker.postMessage({
                        type: 'PLAYER_SKILL_CAST',
                        skillId: 'basic_attack',
                        originX: unitX,
                        originZ: unitZ,
                        radius: 1.5,
                        damage: damage,
                        targetTeam: targetIdx < TEAM_SIZE ? 0 : 1
                    });
                }
            }
        });

        // Guest listens for visual and sound effects of all units broadcasted by Host
        colyseusRoom.onMessage("unitFXSynced", (data: { type: "single" | "batch", event?: any, events?: any[] }) => {
            if (!isLocalPlayerHost) {
                if (data.type === "single" && data.event) {
                    incomingFXQueue.push(data.event);
                } else if (data.type === "batch" && data.events) {
                    incomingFXQueue.push(...data.events);
                }
            }
        });
    } catch (e) {
        console.warn("Failed to connect to multiplayer server (offline fallback active):", e);
    }
}
initMultiplayer();

// ── Unit state replication: runs at 10Hz outside render loop to avoid frame drops ──
// SharedArrayBuffer cannot be sent over WebSocket, so we use a compact regular Float32Array copy.
window.setInterval(() => {
    if (!colyseusRoom || !colyseusRoom.connection.isOpen) return;
    if (isLocalPlayerHost && isRunning) {
        buildCompactSnapshot();
        // slice() creates a new regular ArrayBuffer from pre-allocated Float32Array (WebSocket-safe)
        colyseusRoom.send("syncUnits", compactSnapshot.slice().buffer);
    }
}, 100); // 10Hz

// ── FX replication: batch send visual/sound events at 10Hz to prevent network overload ──
window.setInterval(() => {
    if (!colyseusRoom || !colyseusRoom.connection.isOpen) return;
    if (isLocalPlayerHost && pendingUnitFXEvents.length > 0) {
        colyseusRoom.send("syncUnitFX", { type: "batch", events: pendingUnitFXEvents });
        pendingUnitFXEvents = [];
    }
}, 100); // 10Hz

// Inject worker tick dispatch into render loop (eliminates separate rAF)
setBeforeRenderCb((_timestamp: number, delta: number) => {
    // Process a limited number of incoming network FX events per frame to prevent CPU spikes on guests
    if (incomingFXQueue.length > 0) {
        const limit = Math.min(incomingFXQueue.length, 3); // Max 3 per frame
        for (let i = 0; i < limit; i++) {
            const ev = incomingFXQueue.shift();
            if (ev) {
                if (ev.skill === "turretShoot") {
                    world.turrets.shoot(ev.team, ev.tx, ev.ty, ev.tz);
                }
                spawnSkillFX(ev);
            }
        }
    }

    // Update network players and network projectiles
    networkPlayers.forEach((np) => np.update(delta));
    networkHitVFX.update(delta);
    networkProjectiles.update(delta, null, (pos: THREE.Vector3) => {
        networkHitVFX.spawn(pos.x, pos.y, pos.z);
    });

    // Send local player state to Colyseus server (rate-limited to 20Hz / 50ms)
    const tStartNet = performance.now();
    const nowMs = performance.now();
    if (nowMs - lastNetworkSendTime >= 50) {
        if (colyseusRoom && colyseusRoom.connection.isOpen) {
            colyseusRoom.send("updateState", {
                x: heroCtrl.position.x,
                y: heroCtrl.position.y,
                z: heroCtrl.position.z,
                rotY: heroCtrl.playerMesh ? heroCtrl.playerMesh.rotation.y : heroCtrl.playerGroup.rotation.y,
                anim: heroCtrl.currentActionName || "idle"
            });

        }
        lastNetworkSendTime = nowMs;
    }
    const tDurationNet = performance.now() - tStartNet;
    perfProfiler.trackSystemTime("netSync", tDurationNet);

    // ── Worker-Bypass: update hero tiap frame (zero input lag) ──
    // Mapping target unit THREE.Object3D ke character-controller untuk auto-aim
    const activeUnits = getUnits();
    const targets: any[] = [];
    // ponytail: use imported constants — local shadows caused IDX_TEAM=4 bug (real value=5)
    
    // Dapatkan tim dari hero (index 0) berdasarkan status host/guest
    const heroTeam = isLocalPlayerHost ? TEAM_A : TEAM_B;
    sharedData[HERO_UNIT_INDEX * STRIDE + IDX_TEAM] = heroTeam;
    heroCtrl.teamId = heroTeam;

    for (let i = 0; i < activeUnits.length; i++) {
        const u = activeUnits[i];
        if (u && i !== HERO_UNIT_INDEX && u.root) {
            // Hanya targetkan unit yang masih hidup (HP > 0)
            const hp = sharedData[i * STRIDE + IDX_HP];
            if (hp <= 0) continue;

            // Hanya targetkan unit yang memiliki tim BERBEDA dengan hero
            const unitTeam = sharedData[i * STRIDE + IDX_TEAM];
            if (unitTeam !== heroTeam) {
                targets.push(u.root);
            }
        }
    }
    heroCtrl.setTargets(targets);

    heroCtrl.update(delta);                                      // fisika + input + kamera
    syncHeroToBuffer(heroCtrl, sharedData, HERO_UNIT_INDEX);     // tulis x,y,z ke SAB
    skills.update(delta, heroCtrl);                                        // tick cooldown VFX partikel

    if (!isRunning) return;

    // ONLY the Host ticks their workers to run the AI simulation.
    // Guests receive unit state updates over the network directly.
    if (isLocalPlayerHost) {
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
            const tStartWorker = performance.now();
            for (let i = 0; i < NUM_WORKERS; i++) {
                workers[i].postMessage({ type: "tick", tickId: globalTickId });
            }
            const tDurationWorker = performance.now() - tStartWorker;
            perfProfiler.trackSystemTime("workerComm", tDurationWorker);
            lastTime = now - (deltaTime % 15);
        }
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

const classes = [
    "tank",
    "knight",
    "archer",
    "mage",
    "healer",
    "gunslinger",
    "assassin",
    "skel_tank",
    "skel_archer",
    "skel_mage",
    "skel_healer",
    "skel_gunslinger",
    "skel_assassin",
];

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
    // Scaled preset to total 20: [tank, knight, archer, mage, healer, gunslinger, assassin, ...skel]
    applyPreset([1, 2, 4, 4, 1, 4, 4, 0, 0, 0, 0, 0, 0], [1, 2, 4, 4, 1, 4, 4, 0, 0, 0, 0, 0, 0]),
);
presetMagic.addEventListener("click", () =>
    applyPreset([0, 0, 0, 16, 4, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 16, 4, 0, 0, 0, 0, 0, 0, 0, 0]),
);
presetDefense.addEventListener("click", () =>
    applyPreset([6, 6, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0], [6, 6, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0]),
);
presetStealth.addEventListener("click", () =>
    applyPreset([0, 0, 4, 0, 0, 6, 10, 0, 0, 0, 0, 0, 0], [0, 0, 4, 0, 0, 6, 10, 0, 0, 0, 0, 0, 0]),
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
    
    // Broadcast config update to server if Host
    if (colyseusRoom && colyseusRoom.connection.isOpen && isLocalPlayerHost) {
        colyseusRoom.send("updateConfig", {
            teamAConfig,
            teamBConfig,
            customClasses: getCustomClasses()
        });
    }

    loadModel(selectModel.value, selectMatchup.value, () => {
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

function loadModel(
    modelName: string,
    matchup: string,
    onSuccess?: () => void,
    onError?: () => void,
) {
    perfProfiler.setSkeletonMode(modelName.toLowerCase().includes("skeleton"));
    changeModel(modelName, matchup, onSuccess, onError);
}

// Load model awal secara dinamis
loadModel(
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
        loadModel(selectModel.value, selectMatchup.value, () => {
            enableControls();
        });
    });
});

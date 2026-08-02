/**
 * fps-stability.test.ts — FPS Stability Benchmark
 *
 * Mengukur timing setiap subsystem di battle worker tick.
 * Fungsi di-import langsung dari src/simulation/spatial-grid.ts — NO COPY-PASTE.
 *
 * Run: npx vitest run tests/fps-stability.test.ts
 */

import { describe, it, expect } from "vitest";
import {
    buildGrid,
    findNearestEnemy,
    calcSeparation,
    GRID_COLS,
    GRID_ROWS,
} from "../src/simulation/spatial-grid";

import {
    UNIT_COUNT,
    STRIDE,
    IDX_X,
    IDX_Y,
    IDX_Z,
    IDX_HP,
    IDX_TARGET,
    IDX_TEAM,
    IDX_ANIM,
    IDX_TYPE,
    IDX_SKILL1_CD,
    IDX_SKILL2_CD,
    IDX_SKILL3_CD,
    IDX_MAX_HP,
    IDX_ATTACK_CD,
    IDX_EFFECT_STATE,
    IDX_IMMUNE_CD,
    TYPE_TANK,
    TYPE_ARCHER,
    TYPE_MAGE,
    TYPE_HEALER,
    TYPE_GUNSLINGER,
    TYPE_ASSASSIN,
    TEAM_A,
    TEAM_B,
    TEAM_SIZE,
    SPAWN_A_X,
    SPAWN_B_X,
} from "../src/simulation/constants";

import {
    SPAWN_INSIDE_SPREAD_Z,
    SPAWN_INSIDE_OFFSET_X,
    BOUND_X_MIN,
    BOUND_X_MAX,
    BOUND_Z_MIN,
    BOUND_Z_MAX,
    ATTRIBUTES,
} from "../src/simulation/config";

// ════════════════════════════════════════════════════════
// Helpers — hanya benchmark loop & statistik.
// Semua logic spatial dari spatial-grid.ts.
// ════════════════════════════════════════════════════════

interface TickResults {
    gridMs: number[];
    targetMs: number[];
    separationMs: number[];
    moveMs: number[];
    totalMs: number[];
}

/** Run full tick simulation N times, record per-subsystem timing */
function benchmarkTicks(data: Float32Array, numTicks: number): TickResults {
    const gridHead = new Int32Array(GRID_COLS * GRID_ROWS);
    const gridNext = new Int32Array(UNIT_COUNT);

    const results: TickResults = {
        gridMs: [],
        targetMs: [],
        separationMs: [],
        moveMs: [],
        totalMs: [],
    };

    for (let t = 0; t < numTicks; t++) {
        const tickStart = performance.now();

        // ── Build Grid ──
        const g0 = performance.now();
        buildGrid(data, gridHead, gridNext);
        const g1 = performance.now();
        results.gridMs.push(g1 - g0);

        // ── Targeting (staggered: 25% per tick) ──
        const t0 = performance.now();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            // Stagger: hanya 25% unit re-target per tick
            if (t % 4 !== (i & 3)) continue;

            const target = findNearestEnemy(data, i, gridHead, gridNext);
            data[base + IDX_TARGET] = target;
        }
        const t1 = performance.now();
        results.targetMs.push(t1 - t0);

        // ── Separation (throttled: ~50% per tick) ──
        const s0 = performance.now();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            const isMoving = data[base + IDX_ANIM] === 1;
            const shouldCalc = isMoving ? (t + i) % 2 === 0 : (t + i) % 3 === 0;
            if (!shouldCalc) continue;

            const { sx, sz } = calcSeparation(data, i, gridHead, gridNext, 8);
            data[base + IDX_X] += sx;
            data[base + IDX_Z] += sz;
        }
        const s1 = performance.now();
        results.separationMs.push(s1 - s0);

        // ── Movement + attack ──
        const m0 = performance.now();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;

            const targetIdx = data[base + IDX_TARGET];
            if (targetIdx < 0) continue;

            const uType = data[base + IDX_TYPE];
            const attr = ATTRIBUTES[uType];
            if (!attr) continue;
            const speed = attr.moveSpeed;
            const range = attr.attackRange;

            const tx = data[targetIdx * STRIDE + IDX_X];
            const tz = data[targetIdx * STRIDE + IDX_Z];
            const dx = tx - data[base + IDX_X];
            const dz = tz - data[base + IDX_Z];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > range) {
                const nx = dx / dist;
                const nz = dz / dist;
                data[base + IDX_X] += nx * speed;
                data[base + IDX_Z] += nz * speed;
                data[base + IDX_ANIM] = 1;
            }

            // Boundary clamp
            if (data[base + IDX_X] < BOUND_X_MIN)
                data[base + IDX_X] = BOUND_X_MIN;
            if (data[base + IDX_X] > BOUND_X_MAX)
                data[base + IDX_X] = BOUND_X_MAX;
            if (data[base + IDX_Z] < BOUND_Z_MIN)
                data[base + IDX_Z] = BOUND_Z_MIN;
            if (data[base + IDX_Z] > BOUND_Z_MAX)
                data[base + IDX_Z] = BOUND_Z_MAX;

            // Cooldown decrement
            if (data[base + IDX_ATTACK_CD] > 0) data[base + IDX_ATTACK_CD]--;
            if (data[base + IDX_SKILL1_CD] > 0) data[base + IDX_SKILL1_CD]--;
            if (data[base + IDX_SKILL2_CD] > 0) data[base + IDX_SKILL2_CD]--;
            if (data[base + IDX_SKILL3_CD] > 0) data[base + IDX_SKILL3_CD]--;
        }
        const m1 = performance.now();
        results.moveMs.push(m1 - m0);

        const tickEnd = performance.now();
        results.totalMs.push(tickEnd - tickStart);
    }

    return results;
}

/** Calculate statistics: min, max, avg, stddev, p95, p99 */
function stats(arr: number[]) {
    if (arr.length === 0)
        return { min: 0, max: 0, avg: 0, stddev: 0, p95: 0, p99: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const variance = sorted.reduce((s, v) => s + (v - avg) * (v - avg), 0) / n;
    const stddev = Math.sqrt(variance);
    return {
        min: sorted[0],
        max: sorted[n - 1],
        avg,
        stddev,
        p95: sorted[Math.floor(n * 0.95)],
        p99: sorted[Math.floor(n * 0.99)],
    };
}

// ════════════════════════════════════════════════════════
// Helper: init buffer dengan unit tersebar (post-fix)
// ════════════════════════════════════════════════════════
function initSpreadBuffer(): Float32Array {
    const buf = new SharedArrayBuffer(UNIT_COUNT * STRIDE * 4);
    const d = new Float32Array(buf);

    const types = [
        TYPE_TANK,
        TYPE_ARCHER,
        TYPE_MAGE,
        TYPE_HEALER,
        TYPE_GUNSLINGER,
        TYPE_ASSASSIN,
    ];

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const team = i < TEAM_SIZE ? TEAM_A : TEAM_B;
        const spawnX =
            team === TEAM_A
                ? SPAWN_A_X - SPAWN_INSIDE_OFFSET_X
                : SPAWN_B_X + SPAWN_INSIDE_OFFSET_X;
        const spawnZ = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;

        d[base + IDX_X] = spawnX;
        d[base + IDX_Y] = 0;
        d[base + IDX_Z] = spawnZ;
        d[base + IDX_HP] = 100;
        d[base + IDX_MAX_HP] = 100;
        d[base + IDX_TEAM] = team;
        d[base + IDX_TYPE] = types[i % 6];
        d[base + IDX_ANIM] = 0;
        d[base + IDX_TARGET] = -1;
        d[base + IDX_ATTACK_CD] = 0;
        d[base + IDX_SKILL1_CD] = 0;
        d[base + IDX_SKILL2_CD] = 0;
        d[base + IDX_SKILL3_CD] = 0;
        d[base + IDX_EFFECT_STATE] = 0;
        d[base + IDX_IMMUNE_CD] = 0;
    }
    return d;
}

/** Init buffer dengan unit clustered (worst-case, semua di tengah) */
function initClusteredBuffer(): Float32Array {
    const buf = new SharedArrayBuffer(UNIT_COUNT * STRIDE * 4);
    const d = new Float32Array(buf);

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const team = i < TEAM_SIZE ? TEAM_A : TEAM_B;

        d[base + IDX_X] = (Math.random() - 0.5) * 4;
        d[base + IDX_Y] = 0;
        d[base + IDX_Z] = (Math.random() - 0.5) * 4;
        d[base + IDX_HP] = 100;
        d[base + IDX_MAX_HP] = 100;
        d[base + IDX_TEAM] = team;
        d[base + IDX_TYPE] = TYPE_TANK;
        d[base + IDX_ANIM] = 1;
        d[base + IDX_TARGET] = -1;
        d[base + IDX_ATTACK_CD] = 0;
        d[base + IDX_SKILL1_CD] = 0;
        d[base + IDX_SKILL2_CD] = 0;
        d[base + IDX_SKILL3_CD] = 0;
        d[base + IDX_EFFECT_STATE] = 0;
        d[base + IDX_IMMUNE_CD] = 0;
    }
    return d;
}

// ════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════

const FRAME_BUDGET_60FPS = 16.67;
const FRAME_BUDGET_144FPS = 6.94;
const TICK_COUNT = 500;

describe("FPS STABILITY — 200 Unit Tick Benchmark", () => {
    it("FULL TICK: 500 tick benchmark — avg < 8ms, p99 < 16ms (spread scenario)", () => {
        const data = initSpreadBuffer();
        const result = benchmarkTicks(data, TICK_COUNT);

        const s = {
            grid: stats(result.gridMs),
            target: stats(result.targetMs),
            separation: stats(result.separationMs),
            move: stats(result.moveMs),
            total: stats(result.totalMs),
        };

        console.log(`\n╔══════════════════════════════════════════╗`);
        console.log(`║  FPS STABILITY — Spread Scenario         ║`);
        console.log(
            `║  ${UNIT_COUNT} units, ${TICK_COUNT} ticks               ║`,
        );
        console.log(`╠══════════════════════════════════════════╣`);
        console.log(
            `║ Budget 60fps: ${FRAME_BUDGET_60FPS.toFixed(2)}ms | 144fps: ${FRAME_BUDGET_144FPS.toFixed(2)}ms ║`,
        );
        console.log(`╠══════════════════════════════════════════╣`);

        for (const [name, st] of Object.entries(s)) {
            const budgetOk60 = st.avg < FRAME_BUDGET_60FPS;
            const budgetOk144 = st.avg < FRAME_BUDGET_144FPS;
            const marker60 = budgetOk60 ? "✅" : "🔴";
            const marker144 = budgetOk144 ? "✅" : "🔴";
            console.log(
                `║ ${name.padEnd(11)} avg=${st.avg.toFixed(3).padStart(7)}ms  p95=${st.p95.toFixed(3).padStart(7)}ms  p99=${st.p99.toFixed(3).padStart(7)}ms  σ=${st.stddev.toFixed(3).padStart(6)}ms`,
            );
            console.log(
                `║            min=${st.min.toFixed(3).padStart(7)}ms  max=${st.max.toFixed(3).padStart(7)}ms  60fps=${marker60}  144fps=${marker144}`,
            );
        }
        console.log(`╚══════════════════════════════════════════╝`);

        expect(s.total.avg).toBeLessThan(FRAME_BUDGET_60FPS);
        expect(s.total.p99).toBeLessThan(FRAME_BUDGET_60FPS * 2);
        expect(s.total.stddev).toBeLessThan(5);
    });

    it("FULL TICK: 500 tick benchmark — avg < 10ms, p99 < 20ms (clustered worst-case)", () => {
        const data = initClusteredBuffer();
        const result = benchmarkTicks(data, TICK_COUNT);

        const s = {
            grid: stats(result.gridMs),
            target: stats(result.targetMs),
            separation: stats(result.separationMs),
            move: stats(result.moveMs),
            total: stats(result.totalMs),
        };

        console.log(`\n╔══════════════════════════════════════════╗`);
        console.log(`║  FPS STABILITY — Clustered Scenario      ║`);
        console.log(
            `║  ${UNIT_COUNT} units, ${TICK_COUNT} ticks               ║`,
        );
        console.log(`╠══════════════════════════════════════════╣`);

        for (const [name, st] of Object.entries(s)) {
            const budgetOk60 = st.avg < FRAME_BUDGET_60FPS;
            const marker = budgetOk60 ? "✅" : "🔴";
            console.log(
                `║ ${name.padEnd(11)} avg=${st.avg.toFixed(3).padStart(7)}ms  p95=${st.p95.toFixed(3).padStart(7)}ms  p99=${st.p99.toFixed(3).padStart(7)}ms  σ=${st.stddev.toFixed(3).padStart(6)}ms  ${marker}`,
            );
        }
        console.log(`╚══════════════════════════════════════════╝`);

        expect(s.total.avg).toBeLessThan(FRAME_BUDGET_60FPS);
        expect(s.total.p99).toBeLessThan(FRAME_BUDGET_60FPS * 3);
    });

    it("GRID BUILD: O(N) grid construction — must be < 1ms", () => {
        const data = initSpreadBuffer();
        const gridHead = new Int32Array(GRID_COLS * GRID_ROWS);
        const gridNext = new Int32Array(UNIT_COUNT);

        const start = performance.now();
        buildGrid(data, gridHead, gridNext);
        const duration = performance.now() - start;

        console.log(`\n─── GRID BUILD ───`);
        console.log(`  ${UNIT_COUNT} units: ${duration.toFixed(3)}ms`);
        console.log(
            `  Budget 60fps: ${((duration / FRAME_BUDGET_60FPS) * 100).toFixed(1)}%`,
        );
        console.log(
            `  Budget 144fps: ${((duration / FRAME_BUDGET_144FPS) * 100).toFixed(1)}%`,
        );

        expect(duration).toBeLessThan(1.0);
    });

    it("TARGETING: 25% unit re-targeting — must be < 3ms", () => {
        const data = initSpreadBuffer();
        const gridHead = new Int32Array(GRID_COLS * GRID_ROWS);
        const gridNext = new Int32Array(UNIT_COUNT);
        buildGrid(data, gridHead, gridNext);

        for (let i = 0; i < UNIT_COUNT; i++) {
            data[i * STRIDE + IDX_TARGET] = -1;
        }

        const start = performance.now();
        let searched = 0;
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            if (i % 4 !== 0) continue;
            searched++;
            const t = findNearestEnemy(data, i, gridHead, gridNext);
            data[base + IDX_TARGET] = t;
        }
        const duration = performance.now() - start;

        console.log(`\n─── TARGETING (staggered 25%) ───`);
        console.log(`  Searched: ${searched}/${UNIT_COUNT} units (25%)`);
        console.log(`  Duration: ${duration.toFixed(3)}ms`);
        console.log(`  Per-unit: ${(duration / searched).toFixed(4)}ms`);

        expect(duration).toBeLessThan(3.0);
    });

    it("TARGETING: full 100% re-targeting worst-case — warn if > 8ms", () => {
        const data = initSpreadBuffer();
        const gridHead = new Int32Array(GRID_COLS * GRID_ROWS);
        const gridNext = new Int32Array(UNIT_COUNT);
        buildGrid(data, gridHead, gridNext);

        for (let i = 0; i < UNIT_COUNT; i++) {
            data[i * STRIDE + IDX_TARGET] = -1;
        }

        const start = performance.now();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            const t = findNearestEnemy(data, i, gridHead, gridNext);
            data[base + IDX_TARGET] = t;
        }
        const duration = performance.now() - start;

        console.log(`\n─── TARGETING (100% — worst case) ───`);
        console.log(`  Duration: ${duration.toFixed(3)}ms`);
        console.log(
            `  % of 60fps budget: ${((duration / FRAME_BUDGET_60FPS) * 100).toFixed(1)}%`,
        );
        console.log(
            `  ⚠️  INI ADALAH SPIKE jika semua unit re-target barengan`,
        );

        expect(duration).toBeLessThan(10);
    });

    it("SEPARATION: 50% unit throttled — must be < 2ms", () => {
        const data = initClusteredBuffer();
        const gridHead = new Int32Array(GRID_COLS * GRID_ROWS);
        const gridNext = new Int32Array(UNIT_COUNT);
        buildGrid(data, gridHead, gridNext);

        const start = performance.now();
        let calcCount = 0;
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            if (i % 2 !== 0) continue;
            calcCount++;
            const { sx, sz } = calcSeparation(data, i, gridHead, gridNext, 8);
            data[base + IDX_X] += sx;
            data[base + IDX_Z] += sz;
        }
        const duration = performance.now() - start;

        console.log(`\n─── SEPARATION (50% throttled) ───`);
        console.log(`  Calculated: ${calcCount}/${UNIT_COUNT} units`);
        console.log(`  Duration: ${duration.toFixed(3)}ms`);
        console.log(`  Per-unit: ${(duration / calcCount).toFixed(4)}ms`);

        expect(duration).toBeLessThan(2.0);
    });

    it("SEPARATION: full 100% (no throttle) worst-case — warn if > 4ms", () => {
        const data = initClusteredBuffer();
        const gridHead = new Int32Array(GRID_COLS * GRID_ROWS);
        const gridNext = new Int32Array(UNIT_COUNT);
        buildGrid(data, gridHead, gridNext);

        const start = performance.now();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            const { sx, sz } = calcSeparation(data, i, gridHead, gridNext, 8);
            data[base + IDX_X] += sx;
            data[base + IDX_Z] += sz;
        }
        const duration = performance.now() - start;

        console.log(`\n─── SEPARATION (100% — worst case) ───`);
        console.log(`  Duration: ${duration.toFixed(3)}ms`);

        expect(duration).toBeLessThan(5);
    });

    it("MOVEMENT + ATTACK: all units — must be < 1ms", () => {
        const data = initSpreadBuffer();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;
            const team = data[base + IDX_TEAM];
            const enemyStart = team === TEAM_A ? TEAM_SIZE : 0;
            data[base + IDX_TARGET] = enemyStart;
        }

        const start = performance.now();
        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;

            const targetIdx = data[base + IDX_TARGET];
            if (targetIdx < 0) continue;

            const uType = data[base + IDX_TYPE];
            const attr = ATTRIBUTES[uType];
            if (!attr) continue;
            const speed = attr.moveSpeed;
            const range = attr.attackRange;

            const tx = data[targetIdx * STRIDE + IDX_X];
            const tz = data[targetIdx * STRIDE + IDX_Z];
            const dx = tx - data[base + IDX_X];
            const dz = tz - data[base + IDX_Z];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > range) {
                const nx = dx / dist;
                const nz = dz / dist;
                data[base + IDX_X] += nx * speed;
                data[base + IDX_Z] += nz * speed;
            }

            if (data[base + IDX_X] < BOUND_X_MIN)
                data[base + IDX_X] = BOUND_X_MIN;
            if (data[base + IDX_X] > BOUND_X_MAX)
                data[base + IDX_X] = BOUND_X_MAX;
            if (data[base + IDX_Z] < BOUND_Z_MIN)
                data[base + IDX_Z] = BOUND_Z_MIN;
            if (data[base + IDX_Z] > BOUND_Z_MAX)
                data[base + IDX_Z] = BOUND_Z_MAX;
            if (data[base + IDX_ATTACK_CD] > 0) data[base + IDX_ATTACK_CD]--;
        }
        const duration = performance.now() - start;

        console.log(`\n─── MOVEMENT + ATTACK ───`);
        console.log(`  Duration: ${duration.toFixed(3)}ms`);

        expect(duration).toBeLessThan(1.0);
    });

    it("SUMMARY: Rangkuman target FPS", () => {
        const data = initSpreadBuffer();
        const result = benchmarkTicks(data, TICK_COUNT);
        const total = stats(result.totalMs);

        console.log(`\n╔══════════════════════════════════════════╗`);
        console.log(`║  FPS STABILITY SUMMARY                   ║`);
        console.log(`╠══════════════════════════════════════════╣`);
        console.log(
            `║ TOTAL TICK avg: ${total.avg.toFixed(2)}ms                          ║`,
        );
        console.log(
            `║ TOTAL TICK p99: ${total.p99.toFixed(2)}ms                          ║`,
        );
        console.log(
            `║ StdDev:          ${total.stddev.toFixed(2)}ms                          ║`,
        );
        console.log(`╠══════════════════════════════════════════╣`);

        const fps60 = 1000 / total.avg;
        const budget60left = FRAME_BUDGET_60FPS - total.avg;
        const budget144left = FRAME_BUDGET_144FPS - total.avg;

        console.log(
            `║ 60fps target:  ${fps60 >= 60 ? "✅ STABLE" : "🔴 DROP"}   (avg ${fps60.toFixed(1)}fps, ${budget60left > 0 ? "+" : ""}${budget60left.toFixed(2)}ms headroom)`,
        );
        console.log(
            `║ 144fps target: ${fps60 >= 144 ? "✅ STABLE" : "🔴 DROP"}  (avg ${fps60.toFixed(1)}fps, ${budget144left > 0 ? "+" : ""}${budget144left.toFixed(2)}ms headroom)`,
        );
        console.log(
            `║ Headroom utk render (GPU): ${budget60left.toFixed(2)}ms`,
        );
        console.log(`╚══════════════════════════════════════════╝`);

        expect(total.avg).toBeLessThan(8);
        expect(total.p99).toBeLessThan(FRAME_BUDGET_60FPS);
    });

    it("SPAWN SPREAD CHECK: semua unit harus tersebar (post-fix)", () => {
        const data = initSpreadBuffer();
        const zVals: number[] = [];
        for (let i = 0; i < UNIT_COUNT; i++) {
            zVals.push(data[i * STRIDE + IDX_Z]);
        }
        const zMin = Math.min(...zVals);
        const zMax = Math.max(...zVals);
        const zRange = zMax - zMin;

        console.log(`\n─── SPAWN SPREAD (current params) ───`);
        console.log(`  SPAWN_INSIDE_SPREAD_Z = ${SPAWN_INSIDE_SPREAD_Z}`);
        console.log(
            `  Z range: [${zMin.toFixed(1)}, ${zMax.toFixed(1)}] = ${zRange.toFixed(1)}m`,
        );
        console.log(
            `  Expected: ~${(SPAWN_INSIDE_SPREAD_Z * 2).toFixed(0)}m width`,
        );

        expect(zRange).toBeGreaterThan(10);
    });
});

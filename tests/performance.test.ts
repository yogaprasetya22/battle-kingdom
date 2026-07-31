/**
 * Performance Stress Test - 2000 Units Scale
 * Identifies frame bottlenecks dan optimization paths
 */

import { describe, it, expect, beforeEach } from "vitest";

// Simulated constants
const UNIT_COUNT_STRESS = 2000; // 1000 per team
const STRIDE = 43;
const TEAM_SIZE_STRESS = 1000;
const NUM_WORKERS = 2;

// Index constants
const IDX_X = 0,
    IDX_Y = 1,
    IDX_Z = 2,
    IDX_HP = 3,
    IDX_TEAM = 4;
const IDX_ATTACK_CD = 5,
    IDX_SKILL1_CD = 6,
    IDX_SKILL2_CD = 7,
    IDX_SKILL3_CD = 8;
const TEAM_A = 0,
    TEAM_B = 1;

// Grid constants (critical for scale)
const cellSize = 6.0;
const BOUND_X_MIN = -150,
    BOUND_X_MAX = 150;
const BOUND_Z_MIN = -150,
    BOUND_Z_MAX = 150;

describe("Performance - 2000 Unit Scale", () => {
    let buffer: SharedArrayBuffer;
    let data: Float32Array;
    let gridHead: Int16Array;
    let gridNext: Int16Array;

    beforeEach(() => {
        // Setup stress test buffer
        buffer = new SharedArrayBuffer(UNIT_COUNT_STRESS * STRIDE * 4);
        data = new Float32Array(buffer);

        const gridCols = Math.ceil((BOUND_X_MAX - BOUND_X_MIN) / cellSize);
        const gridRows = Math.ceil((BOUND_Z_MAX - BOUND_Z_MIN) / cellSize);
        gridHead = new Int16Array(gridCols * gridRows);
        gridNext = new Int16Array(UNIT_COUNT_STRESS);

        // Initialize units - spread evenly
        for (let i = 0; i < UNIT_COUNT_STRESS; i++) {
            const base = i * STRIDE;
            data[base + IDX_TEAM] = i < TEAM_SIZE_STRESS ? TEAM_A : TEAM_B;
            data[base + IDX_HP] = 100;

            // Distribute across map
            const spread = 280 / Math.sqrt(UNIT_COUNT_STRESS);
            data[base + IDX_X] = (Math.random() - 0.5) * 280;
            data[base + IDX_Z] = (Math.random() - 0.5) * 280;
        }
    });

    it("BASELINE: Build spatial grid - measures O(N) cost", () => {
        const start = performance.now();

        // buildGrid simulation
        gridHead.fill(-1);
        gridNext.fill(-1);
        for (let i = 0; i < UNIT_COUNT_STRESS; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;

            const x = data[base + IDX_X];
            const z = data[base + IDX_Z];
            const col = Math.floor((x - BOUND_X_MIN) / cellSize);
            const row = Math.floor((z - BOUND_Z_MIN) / cellSize);

            if (col < 0 || row < 0) continue;

            const gridCols = Math.ceil((BOUND_X_MAX - BOUND_X_MIN) / cellSize);
            const cellIdx = row * gridCols + col;
            gridNext[i] = gridHead[cellIdx];
            gridHead[cellIdx] = i;
        }

        const duration = performance.now() - start;
        console.log(
            `✓ Spatial grid build: ${duration.toFixed(2)}ms for ${UNIT_COUNT_STRESS} units`,
        );
        console.log(
            `  → Per-unit: ${(duration / UNIT_COUNT_STRESS).toFixed(3)}ms`,
        );
        console.log(
            `  → At 60fps (16.67ms budget): ${((duration / 16.67) * 100).toFixed(1)}% of frame`,
        );

        // RED FLAG if > 5ms (heavy)
        expect(duration).toBeLessThan(15); // Must fit in frame budget
    });

    it("BOTTLENECK: Alive count loop - measures tick overhead", () => {
        const start = performance.now();

        let aliveA = 0,
            aliveB = 0;
        for (let i = 0; i < UNIT_COUNT_STRESS; i++) {
            const base = i * STRIDE;
            const hp = data[base + IDX_HP];
            if (hp > 0) {
                if (data[base + IDX_TEAM] === TEAM_A) {
                    aliveA++;
                } else {
                    aliveB++;
                }
            }
        }

        const duration = performance.now() - start;
        console.log(
            `✓ Alive count loop: ${duration.toFixed(3)}ms for ${UNIT_COUNT_STRESS} units`,
        );
        console.log(
            `  → Runs EVERY tick (15ms) = ${(duration * (1000 / 15)).toFixed(1)}ms/sec`,
        );

        expect(aliveA).toBe(TEAM_SIZE_STRESS);
        expect(aliveB).toBe(TEAM_SIZE_STRESS);
        expect(duration).toBeLessThan(2); // Must be < 2ms
    });

    it("CRITICAL: Skill AoE search - measures worst-case targeting", () => {
        // Simulate Fan Fire AoE hitting cluster of enemies
        const targetX = 0,
            targetZ = 0;
        const radiusSq = 6.0 * 6.0;
        const gridCols = Math.ceil((BOUND_X_MAX - BOUND_X_MIN) / cellSize);

        const start = performance.now();

        let hitCount = 0;
        const tCol = Math.floor((targetX - BOUND_X_MIN) / cellSize);
        const tRow = Math.floor((targetZ - BOUND_Z_MIN) / cellSize);

        // Search 5x5 for worst-case
        for (let r = tRow - 2; r <= tRow + 2; r++) {
            for (let c = tCol - 2; c <= tCol + 2; c++) {
                if (r < 0 || c < 0) continue;

                const cellIdx = r * gridCols + c;
                let curr = gridHead[cellIdx];
                while (curr !== -1) {
                    const jBase = curr * STRIDE;
                    if (data[jBase + IDX_HP] > 0) {
                        const jdx = data[jBase + IDX_X] - targetX;
                        const jdz = data[jBase + IDX_Z] - targetZ;
                        const dist = jdx * jdx + jdz * jdz;
                        if (dist <= radiusSq) {
                            hitCount++;
                        }
                    }
                    curr = gridNext[curr];
                }
            }
        }

        const duration = performance.now() - start;
        console.log(`✓ AoE skill search (5x5): ${duration.toFixed(3)}ms`);
        console.log(`  → Hit ${hitCount} targets`);
        console.log(
            `  → 10 skills/sec × ${hitCount} targets = ${(duration * 10).toFixed(1)}ms/sec overhead`,
        );

        expect(duration).toBeLessThan(5); // RED FLAG if > 5ms per skill cast
    });

    it("HEAVY: Mixed tick simulation - all systems", () => {
        // Simulate full tick with all overhead combined
        const tickStart = performance.now();

        // 1. Build grid
        gridHead.fill(-1);
        gridNext.fill(-1);
        for (let i = 0; i < UNIT_COUNT_STRESS; i++) {
            const base = i * STRIDE;
            const x = data[base + IDX_X];
            const z = data[base + IDX_Z];
            const col = Math.floor((x - BOUND_X_MIN) / cellSize);
            const row = Math.floor((z - BOUND_Z_MIN) / cellSize);
            const gridCols = Math.ceil((BOUND_X_MAX - BOUND_X_MIN) / cellSize);
            if (col >= 0 && row >= 0) {
                const cellIdx = row * gridCols + col;
                gridNext[i] = gridHead[cellIdx];
                gridHead[cellIdx] = i;
            }
        }

        // 2. Process all units (target finding + skill checks)
        for (let i = 0; i < UNIT_COUNT_STRESS; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] <= 0) continue;

            // Simulate target finding
            let minDist = Infinity;
            let target = -1;
            const myX = data[base + IDX_X];
            const myZ = data[base + IDX_Z];
            const myTeam = data[base + IDX_TEAM];

            for (let j = 0; j < UNIT_COUNT_STRESS; j++) {
                if (i === j) continue;
                const jBase = j * STRIDE;
                if (data[jBase + IDX_HP] <= 0) continue;
                if (data[jBase + IDX_TEAM] === myTeam) continue;

                const dx = data[jBase + IDX_X] - myX;
                const dz = data[jBase + IDX_Z] - myZ;
                const dist = dx * dx + dz * dz;
                if (dist < minDist) {
                    minDist = dist;
                    target = j;
                }
            }

            // Skill cooldown decrements
            if (data[base + IDX_ATTACK_CD] > 0) data[base + IDX_ATTACK_CD]--;
            if (data[base + IDX_SKILL1_CD] > 0) data[base + IDX_SKILL1_CD]--;
            if (data[base + IDX_SKILL2_CD] > 0) data[base + IDX_SKILL2_CD]--;
            if (data[base + IDX_SKILL3_CD] > 0) data[base + IDX_SKILL3_CD]--;
        }

        // 3. Count alive
        let aliveA = 0,
            aliveB = 0;
        for (let i = 0; i < UNIT_COUNT_STRESS; i++) {
            const base = i * STRIDE;
            if (data[base + IDX_HP] > 0) {
                if (data[base + IDX_TEAM] === TEAM_A) aliveA++;
                else aliveB++;
            }
        }

        const tickDuration = performance.now() - tickStart;
        const frameMs = 16.67; // 60fps budget

        console.log(`\n========== FULL TICK ANALYSIS ==========`);
        console.log(`Total tick time: ${tickDuration.toFixed(2)}ms`);
        console.log(`Frame budget (60fps): ${frameMs.toFixed(2)}ms`);
        console.log(
            `Utilization: ${((tickDuration / frameMs) * 100).toFixed(1)}%`,
        );
        console.log(
            `Status: ${tickDuration > frameMs ? "⚠️  OVERBUDGET" : "✅ OK"}`,
        );

        if (tickDuration > frameMs * 1.5) {
            console.log(`\n⚠️  CRITICAL: Tick exceeds 1.5× frame budget`);
            console.log(`   Current: 2000 units`);
            console.log(
                `   Max safe: ~${Math.floor(200 * (frameMs / tickDuration))} units at this complexity`,
            );
        }

        expect(tickDuration).toBeLessThan(frameMs * 2); // Must not exceed 2× budget
    });

    it("OPTIMIZATION PATH: What needs to scale?", () => {
        console.log(`\n========== SCALE ANALYSIS: 200 → 2000 UNITS ==========`);
        console.log(`\n📊 Component Complexity:`);
        console.log(
            `   1. Spatial Grid:        O(N)      → Stay spatial (critical)`,
        );
        console.log(
            `   2. Target Finding:      O(N)      → Need spatial+range culling`,
        );
        console.log(
            `   3. AoE Skills:          O(N)      → Use grid cells only`,
        );
        console.log(
            `   4. Animation Mixers:    O(N)      → Already throttled to 50%`,
        );
        console.log(`   5. Cooldown Updates:    O(N)      → Fast, stays OK`);
        console.log(`\n⚡ Recommendations for 2000 units:`);
        console.log(`   ✅ KEEP: Spatial grid (essential for scale)`);
        console.log(`   ✅ KEEP: Mixer throttle at 50%`);
        console.log(
            `   ❌ REMOVE: Full O(N) target finding → use grid 3x3 cells only`,
        );
        console.log(
            `   ❌ REMOVE: postMessage on every skill cast → batch updates`,
        );
        console.log(
            `   ⚠️  WATCH: Worker contention at 2000 units → split workload`,
        );
        console.log(`\n💡 PRACTICAL: 2000 units needs:`);
        console.log(`   - Spatial culling radius: 20m (not full map search)`);
        console.log(`   - Skill FX batching: 1 postMessage per 50 units/tick`);
        console.log(
            `   - Worker split: 4 workers (1000 units each) instead of 2`,
        );
        console.log(
            `   - Animation LOD: Far units (>50m) get no mixer updates`,
        );
    });
});

/**
 * diagnostic.test.ts — Unit test untuk diagnosa FPS drop.
 *
 * Menguji:
 *   1. Separation effectiveness — apakah SEPARATION params mencegah stacking?
 *   2. Clustering density — berapa unit menumpuk di radius 3m?
 *   3. Grid collision — seberapa sering 2+ unit di koordinat sama?
 *   4. Spawn spread — apakah spawn positions tersebar atau menumpuk?
 *
 * Run: npx vitest run tests/diagnostic.test.ts
 */

import { describe, it, expect } from "vitest";

// ── Mirror constants dari config.ts ──
const SEPARATION_RADIUS = 0.95;
const SEPARATION_STRENGTH = 0.02;
const SEPARATION_MAX = 0.04;
const SPAWN_INSIDE_SPREAD_Z = 0.75;
const SPAWN_A_X = -36;
const SPAWN_B_X = 36;
const UNIT_COUNT = 200;
const TEAM_SIZE = 100;
const BOUND_X_MIN = -119;
const BOUND_X_MAX = 119;
const BOUND_Z_MIN = -89;
const BOUND_Z_MAX = 89;

const MOVE_SPEEDS = [0.035, 0.025, 0.02, 0.024, 0.03, 0.055]; // per type 0-5

// ── Helpers ──
interface Unit {
    x: number;
    z: number;
    team: number;
    hp: number;
}

/** Simulasi 1 tick separation + movement sederhana */
function simulateTick(units: Unit[], targetX: number, targetZ: number): void {
    for (const u of units) {
        if (u.hp <= 0) continue;

        // Hitung separation force
        let sepX = 0,
            sepZ = 0;
        for (const other of units) {
            if (other === u || other.hp <= 0) continue;
            const dx = u.x - other.x;
            const dz = u.z - other.z;
            const distSq = dx * dx + dz * dz;
            const r2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
            if (distSq < r2 && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const force = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS;
                sepX += (dx / dist) * force * SEPARATION_STRENGTH;
                sepZ += (dz / dist) * force * SEPARATION_STRENGTH;
            }
        }

        const sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
        if (sepMag > SEPARATION_MAX) {
            sepX = (sepX / sepMag) * SEPARATION_MAX;
            sepZ = (sepZ / sepMag) * SEPARATION_MAX;
        }

        // Move toward target
        const dx = targetX - u.x;
        const dz = targetZ - u.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;
        const speed = u.team === 0 ? MOVE_SPEEDS[0] : MOVE_SPEEDS[0]; // simplified

        u.x += (dx / dist) * speed + sepX;
        u.z += (dz / dist) * speed + sepZ;

        // Clamp bounds
        u.x = Math.max(BOUND_X_MIN, Math.min(BOUND_X_MAX, u.x));
        u.z = Math.max(BOUND_Z_MIN, Math.min(BOUND_Z_MAX, u.z));
    }
}

/** Hitung clustering score (0-1) */
function calcClustering(
    units: Unit[],
    radius = 2.0,
): { score: number; maxStack: number } {
    const r2 = radius * radius;
    let totalNeighbors = 0;
    let maxNeighbors = 0;

    for (let i = 0; i < units.length; i++) {
        if (units[i].hp <= 0) continue;
        let neighbors = 0;
        for (let j = 0; j < units.length; j++) {
            if (i === j || units[j].hp <= 0) continue;
            const dx = units[i].x - units[j].x;
            const dz = units[i].z - units[j].z;
            if (dx * dx + dz * dz < r2) neighbors++;
        }
        totalNeighbors += neighbors;
        if (neighbors > maxNeighbors) maxNeighbors = neighbors;
    }

    const alive = units.filter((u) => u.hp > 0).length;
    return {
        score: alive > 1 ? totalNeighbors / (alive * (alive - 1)) : 0,
        maxStack: maxNeighbors,
    };
}

/** Hitung berapa unit berbagi koordinat grid yang hampir identik */
function countSamePosition(units: Unit[], threshold = 0.5): number {
    let count = 0;
    for (let i = 0; i < units.length; i++) {
        if (units[i].hp <= 0) continue;
        for (let j = i + 1; j < units.length; j++) {
            if (units[j].hp <= 0) continue;
            const dx = units[i].x - units[j].x;
            const dz = units[i].z - units[j].z;
            if (Math.abs(dx) < threshold && Math.abs(dz) < threshold) {
                count++;
                break; // hitung unit ini sekali saja
            }
        }
    }
    return count;
}

// ── Tests ──

describe("DIAGNOSTIC: Clustering & Separation", () => {
    it("SPAWN SPREAD: cek sebaran spawn awal", () => {
        const units: Unit[] = [];
        for (let i = 0; i < UNIT_COUNT; i++) {
            const team = i < TEAM_SIZE ? 0 : 1;
            const spawnX = team === 0 ? SPAWN_A_X : SPAWN_B_X;
            const zOffset = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;

            units.push({ x: spawnX, z: zOffset, team, hp: 100 });
        }

        const { score, maxStack } = calcClustering(units, 1.0);
        const samePos = countSamePosition(units, 0.3);

        console.log(`\n─── SPAWN SPREAD ANALYSIS ───`);
        console.log(`SPAWN_INSIDE_SPREAD_Z = ${SPAWN_INSIDE_SPREAD_Z}`);
        console.log(
            `Team A spawn X: ${SPAWN_A_X}, Team B spawn X: ${SPAWN_B_X}`,
        );
        console.log(`Clustering score (r=1.0): ${(score * 100).toFixed(1)}%`);
        console.log(`Max unit dalam radius 1m: ${maxStack}`);
        console.log(
            `Unit berbagi posisi sama (<0.3): ${samePos}/${UNIT_COUNT}`,
        );
        // Spread Z seharusnya minimal 3 unit lebar
        const zRange =
            Math.max(...units.map((u) => u.z)) -
            Math.min(...units.map((u) => u.z));
        console.log(
            `Z-range: [${Math.min(...units.map((u) => u.z)).toFixed(1)}, ${Math.max(...units.map((u) => u.z)).toFixed(1)}]`,
        );
        const isBad = samePos > UNIT_COUNT * 0.5 || zRange < 3;
        console.log(
            `VERDICT: ${isBad ? `🔴 SPAWN TERLALU PADAT (${samePos}/200 posisi sama, Z-range=${zRange.toFixed(1)}) — perbesar SPAWN_INSIDE_SPREAD_Z (${SPAWN_INSIDE_SPREAD_Z}→15)` : "✅ OK"}`,
        );

        expect(zRange).toBeGreaterThan(0.5); // minimal ada variasi
    });

    it("SEPARATION FORCE: test apakah separation bisa mencegah stacking", () => {
        // Buat 10 unit di posisi yang sama (simulasi stacking)
        const units: Unit[] = [];
        for (let i = 0; i < 10; i++) {
            units.push({ x: 0, z: 0, team: 0, hp: 100 });
        }

        // Simulasi 60 tick (1 detik) dengan target di kejauhan (agar unit coba jalan bareng)
        for (let tick = 0; tick < 60; tick++) {
            simulateTick(units, 10, 0);
        }

        const { score, maxStack } = calcClustering(units, 1.0);
        const samePos = countSamePosition(units, 0.1);

        console.log(`\n─── SEPARATION EFFECTIVENESS ───`);
        console.log(
            `SEPARATION_RADIUS=${SEPARATION_RADIUS}, STRENGTH=${SEPARATION_STRENGTH}, MAX=${SEPARATION_MAX}`,
        );
        console.log(`Movement speed: ${MOVE_SPEEDS[0]} per tick`);
        console.log(`Setelah 60 tick:`);
        console.log(`  Clustering score (r=1.0): ${(score * 100).toFixed(1)}%`);
        console.log(`  Max stack: ${maxStack}`);
        console.log(`  Same position (<0.1): ${samePos}/10`);
        console.log(
            `  Positions: ${units.map((u) => `(${u.x.toFixed(2)},${u.z.toFixed(2)})`).join(" ")}`,
        );

        // Ekspektasi: unit harus terpisah setelah 60 tick
        // Tapi dengan SEPARATION_MAX=0.04 dan speed=0.035, separation mungkin lambat
        const spreadX =
            Math.max(...units.map((u) => u.x)) -
            Math.min(...units.map((u) => u.x));
        console.log(`  Spread X: ${spreadX.toFixed(3)}`);
        console.log(
            `  EXPECTED spread: ~${(SEPARATION_MAX * 60).toFixed(2)} (MAX * ticks)`,
        );

        if (samePos > 3) {
            console.log(
                `  ⚠️  WARNING: Separation terlalu lemah untuk memecah stacking`,
            );
            console.log(
                `  Rekomendasi: naikkan SEPARATION_STRENGTH (${SEPARATION_STRENGTH} → 0.08) atau SEPARATION_MAX (${SEPARATION_MAX} → 0.15)`,
            );
        }
    });

    it("CLUSTERING SIMULATION: 200 unit konvergen ke 1 titik", () => {
        // Simulasi worst-case: semua unit incar titik tengah yang sama
        const units: Unit[] = [];
        for (let i = 0; i < UNIT_COUNT; i++) {
            const team = i < TEAM_SIZE ? 0 : 1;
            const startX = team === 0 ? SPAWN_A_X : SPAWN_B_X;
            const zOffset = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;
            units.push({ x: startX, z: zOffset, team, hp: 100 });
        }

        // Target: titik tengah map (0,0) — ini mensimulasi kedua tim incar musuh di tengah
        const initialClustering = calcClustering(units, 3.0);
        console.log(`\n─── CLUSTERING SIMULATION (200 unit → center) ───`);
        console.log(
            `Initial clustering (r=3.0): ${(initialClustering.score * 100).toFixed(1)}%`,
        );

        // Simulasi 200 tick (~3 detik)
        for (let tick = 0; tick < 200; tick++) {
            simulateTick(units, 0, 0);
        }

        const { score, maxStack } = calcClustering(units, 3.0);
        const samePos = countSamePosition(units, 1.0);

        console.log(`After 200 ticks:`);
        console.log(`  Clustering score (r=3.0): ${(score * 100).toFixed(1)}%`);
        console.log(`  Max unit dalam radius 3m: ${maxStack}/${UNIT_COUNT}`);
        console.log(
            `  Unit berbagi posisi hampir sama (<1.0): ${samePos}/${UNIT_COUNT}`,
        );

        // Analisis distribusi
        const alive = units.filter((u) => u.hp > 0);
        const center = { x: 0, z: 0 };
        const dists = alive.map((u) => {
            const dx = u.x - center.x;
            const dz = u.z - center.z;
            return Math.sqrt(dx * dx + dz * dz);
        });
        dists.sort((a, b) => a - b);
        const p50 = dists[Math.floor(dists.length * 0.5)];
        const p90 = dists[Math.floor(dists.length * 0.9)];

        console.log(`  Median distance from center: ${p50.toFixed(1)}`);
        console.log(`  P90 distance from center: ${p90.toFixed(1)}`);
        console.log(
            `  X-range: [${Math.min(...alive.map((u) => u.x)).toFixed(1)}, ${Math.max(...alive.map((u) => u.x)).toFixed(1)}]`,
        );
        console.log(
            `  Z-range: [${Math.min(...alive.map((u) => u.z)).toFixed(1)}, ${Math.max(...alive.map((u) => u.z)).toFixed(1)}]`,
        );

        if (score > 0.3) {
            console.log(`\n  🔴 HIGH CLUSTERING DETECTED`);
            console.log(
                `  Penyebab: semua unit incar target sama + separation terlalu lemah`,
            );
            console.log(
                `  Fix: SEPARATION_RADIUS: 0.95→2.5, STRENGTH: 0.02→0.08, MAX: 0.04→0.15`,
            );
            console.log(`  Fix: SPREAD_Z: 0.75→15 (sebar spawn lebih lebar)`);
        } else if (score > 0.15) {
            console.log(
                `\n  🟡 MODERATE CLUSTERING — acceptable tapi bisa dioptimasi`,
            );
        } else {
            console.log(`\n  ✅ LOW CLUSTERING — separation bekerja baik`);
        }
    });

    it("CONVERGENCE SPEED: seberapa cepat 200 unit mencapai titik tengah", () => {
        const units: Unit[] = [];
        for (let i = 0; i < UNIT_COUNT; i++) {
            const team = i < TEAM_SIZE ? 0 : 1;
            const startX = team === 0 ? SPAWN_A_X : SPAWN_B_X;
            units.push({ x: startX, z: 0, team, hp: 100 });
        }

        const milestones: {
            tick: number;
            p50Dist: number;
            p90Dist: number;
            clusterScore: number;
        }[] = [];

        for (let tick = 0; tick <= 200; tick += 50) {
            // Simulasi
            for (let t = 0; t < 50 && tick + t < 200; t++) {
                simulateTick(units, 0, 0);
            }

            const alive = units.filter((u) => u.hp > 0);
            const dists = alive.map((u) => {
                const dx = u.x;
                const dz = u.z;
                return Math.sqrt(dx * dx + dz * dz);
            });
            dists.sort((a, b) => a - b);
            const p50 = dists[Math.floor(dists.length * 0.5)];
            const p90 = dists[Math.floor(dists.length * 0.9)];
            const { score } = calcClustering(units, 3.0);

            milestones.push({
                tick: tick + 50,
                p50Dist: p50,
                p90Dist: p90,
                clusterScore: score,
            });
        }

        console.log(`\n─── CONVERGENCE TIMELINE ───`);
        console.log(`Tick  | Median Dist | P90 Dist | Cluster%`);
        console.log(`──────┼─────────────┼──────────┼─────────`);
        for (const m of milestones) {
            const pct = (m.clusterScore * 100).toFixed(0) + "%";
            console.log(
                `${String(m.tick).padStart(5)} | ${m.p50Dist.toFixed(1).padStart(11)} | ${m.p90Dist.toFixed(1).padStart(8)} | ${pct.padStart(7)}`,
            );
        }

        // Cek: clustering meningkat drastis di awal?
        if (milestones.length >= 2) {
            const first = milestones[0];
            const last = milestones[milestones.length - 1];
            const clusterGrowth = last.clusterScore - first.clusterScore;
            console.log(
                `Cluster growth: ${(clusterGrowth * 100).toFixed(1)}% over ${last.tick} ticks`,
            );
            if (clusterGrowth > 0.2) {
                console.log(
                    `⚠️  Clustering naik signifikan — unit konvergen ke tengah terlalu cepat`,
                );
            }
        }
    });

    it("BASELINE: berapa tick sampai semua unit mencapai center tanpa separation", () => {
        // Test ini mensimulasi tanpa separation untuk lihat seberapa cepat konvergensi natural
        const unit = { x: SPAWN_A_X, z: 0, team: 0, hp: 100 };
        const speed = MOVE_SPEEDS[0]; // Knight speed
        const targetX = 0;
        const dist = Math.abs(SPAWN_A_X - targetX);
        const ticksNeeded = Math.ceil(dist / speed);

        console.log(`\n─── BASELINE MOVEMENT ───`);
        console.log(`Spawn X: ${SPAWN_A_X}, Target X: ${targetX}`);
        console.log(`Speed: ${speed}/tick`);
        console.log(
            `Ticks to center: ${ticksNeeded} (${(ticksNeeded / 62.5).toFixed(1)} detik)`,
        );
        console.log(
            `Wave spawn interval: 20 ticks → ${Math.floor(ticksNeeded / 20)} waves bertemu`,
        );
    });

    it("SUMMARY: rekomendasi parameter", () => {
        console.log(`\n═══════════════════════════════════════`);
        console.log(`  DIAGNOSTIC SUMMARY`);
        console.log(`═══════════════════════════════════════`);
        console.log(``);
        console.log(`Current parameters:`);
        console.log(
            `  SEPARATION_RADIUS  = ${SEPARATION_RADIUS}  (unit harus <1m baru terpisah)`,
        );
        console.log(
            `  SEPARATION_STRENGTH = ${SEPARATION_STRENGTH} (dorongan per tick per unit)`,
        );
        console.log(
            `  SEPARATION_MAX      = ${SEPARATION_MAX}  (batas maksimum dorongan)`,
        );
        console.log(
            `  SPAWN_INSIDE_SPREAD_Z = ${SPAWN_INSIDE_SPREAD_Z} (variasi Z spawn)`,
        );
        console.log(``);
        console.log(
            `Movement speed range: ${Math.min(...MOVE_SPEEDS)} - ${Math.max(...MOVE_SPEEDS)}`,
        );
        console.log(
            `→ Assassin (0.055) 11× lebih cepat dari separation max (0.04)`,
        );
        console.log(
            `→ Bahkan Mage (0.02) = 50% separation max → separation tidak efektif`,
        );
        console.log(``);
        console.log(`Rekomendasi:`);
        console.log(
            `  1. SEPARATION_RADIUS:  0.95 → 2.5   (lebih luas saling dorong)`,
        );
        console.log(
            `  2. SEPARATION_STRENGTH: 0.02 → 0.08  (dorongan 4× lebih kuat)`,
        );
        console.log(
            `  3. SEPARATION_MAX:      0.04 → 0.15  (batas atas 3.75×)`,
        );
        console.log(`  4. SPAWN_INSIDE_SPREAD_Z: 0.75 → 15  (sebar spawn 20×)`);
        console.log(
            `  5. Tambah SPAWN_INSIDE_SPREAD_X: 2.0 (variasi posisi X spawn)`,
        );
        console.log(`═══════════════════════════════════════`);
    });
});

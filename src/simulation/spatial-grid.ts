/**
 * spatial-grid.ts — Shared spatial hash grid functions.
 *
 * Digunakan oleh battle.worker.ts dan tests/fps-stability.test.ts.
 * Satu source of truth — tidak ada copy-paste.
 */
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
    IDX_EFFECT_STATE,
    TEAM_A,
    TEAM_B,
    TEAM_SIZE,
} from "./constants";

import {
    BOUND_X_MIN,
    BOUND_X_MAX,
    BOUND_Z_MIN,
    BOUND_Z_MAX,
    SEPARATION_RADIUS,
    SEPARATION_STRENGTH,
    SEPARATION_MAX,
} from "./config";

// ── Grid dimensions ──
export const GRID_CELL_SIZE = 6.0;
export const GRID_COLS = Math.ceil(
    (BOUND_X_MAX - BOUND_X_MIN) / GRID_CELL_SIZE,
);
export const GRID_ROWS = Math.ceil(
    (BOUND_Z_MAX - BOUND_Z_MIN) / GRID_CELL_SIZE,
);
export const GRID_CELLS = GRID_COLS * GRID_ROWS;

// TypedArray union — worker pakai Int16Array, test pakai Int32Array
type GridArray = Int16Array | Int32Array;

/**
 * Build spatial hash grid O(N).
 * gridHead di-reset ke -1, setiap unit hidup dimasukkan ke cell berdasarkan posisi.
 */
export function buildGrid(
    d: Float32Array,
    gridHead: GridArray,
    gridNext: GridArray,
): void {
    gridHead.fill(-1);
    gridNext.fill(-1);
    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] <= 0) continue;

        const x = d[base + IDX_X];
        const z = d[base + IDX_Z];
        const col = Math.floor((x - BOUND_X_MIN) / GRID_CELL_SIZE);
        const row = Math.floor((z - BOUND_Z_MIN) / GRID_CELL_SIZE);

        if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
            const cellIdx = row * GRID_COLS + col;
            gridNext[i] = gridHead[cellIdx];
            gridHead[cellIdx] = i;
        }
    }
}

/**
 * Cari musuh terdekat pakai spatial grid.
 * 3-tier: 3×3 cells → 5×5 cells → full slice scan.
 */
export function findNearestEnemy(
    d: Float32Array,
    i: number,
    gridHead: GridArray,
    gridNext: GridArray,
): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];

    const myCol = Math.floor((myX - BOUND_X_MIN) / GRID_CELL_SIZE);
    const myRow = Math.floor((myZ - BOUND_Z_MIN) / GRID_CELL_SIZE);

    let minDist = Infinity;
    let target = -1;

    // 1. Search in 3x3 cells
    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= GRID_ROWS) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= GRID_COLS) continue;
            const cellIdx = r * GRID_COLS + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1) {
                const jBase = curr * STRIDE;
                const isStealthed =
                    d[jBase + IDX_EFFECT_STATE] >= 1000 &&
                    d[jBase + IDX_EFFECT_STATE] < 2000;
                if (
                    d[jBase + IDX_HP] > 0 &&
                    d[jBase + IDX_TEAM] !== myTeam &&
                    !isStealthed
                ) {
                    const dx = d[jBase + IDX_X] - myX;
                    const dz = d[jBase + IDX_Z] - myZ;
                    const dist = dx * dx + dz * dz;
                    if (dist < minDist) {
                        minDist = dist;
                        target = curr;
                    }
                }
                curr = gridNext[curr];
            }
        }
    }

    if (target !== -1) return target;

    // 2. Search in 5x5 cells if not found in 3x3
    for (let r = myRow - 2; r <= myRow + 2; r++) {
        if (r < 0 || r >= GRID_ROWS) continue;
        for (let c = myCol - 2; c <= myCol + 2; c++) {
            if (c < 0 || c >= GRID_COLS) continue;
            if (
                r >= myRow - 1 &&
                r <= myRow + 1 &&
                c >= myCol - 1 &&
                c <= myCol + 1
            )
                continue;

            const cellIdx = r * GRID_COLS + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1) {
                const jBase = curr * STRIDE;
                const isStealthed =
                    d[jBase + IDX_EFFECT_STATE] >= 1000 &&
                    d[jBase + IDX_EFFECT_STATE] < 2000;
                if (
                    d[jBase + IDX_HP] > 0 &&
                    d[jBase + IDX_TEAM] !== myTeam &&
                    !isStealthed
                ) {
                    const dx = d[jBase + IDX_X] - myX;
                    const dz = d[jBase + IDX_Z] - myZ;
                    const dist = dx * dx + dz * dz;
                    if (dist < minDist) {
                        minDist = dist;
                        target = curr;
                    }
                }
                curr = gridNext[curr];
            }
        }
    }

    if (target !== -1) return target;

    // 3. Fallback: Scan full slice
    const jStart = myTeam === TEAM_A ? TEAM_SIZE : 0;
    const jEnd = myTeam === TEAM_A ? UNIT_COUNT : TEAM_SIZE;

    for (let j = jStart; j < jEnd; j++) {
        const jBase = j * STRIDE;
        if (d[jBase + IDX_HP] <= 0) continue;
        const isStealthed =
            d[jBase + IDX_EFFECT_STATE] >= 1000 &&
            d[jBase + IDX_EFFECT_STATE] < 2000;
        if (isStealthed) continue;
        const dx = d[jBase + IDX_X] - myX;
        const dz = d[jBase + IDX_Z] - myZ;
        const dist = dx * dx + dz * dz;
        if (dist < minDist) {
            minDist = dist;
            target = j;
        }
    }
    return target;
}

/**
 * Hitung separation force untuk unit i.
 * Query 3×3 cells, max N tetangga terdekat (early break).
 * Magnitude di-cap ke SEPARATION_MAX.
 */
export function calcSeparation(
    d: Float32Array,
    i: number,
    gridHead: GridArray,
    gridNext: GridArray,
    maxSepChecks: number = 8,
): { sx: number; sz: number } {
    const base = i * STRIDE;
    let sepX = 0,
        sepZ = 0,
        sepCount = 0;

    const myCol = Math.floor((d[base + IDX_X] - BOUND_X_MIN) / GRID_CELL_SIZE);
    const myRow = Math.floor((d[base + IDX_Z] - BOUND_Z_MIN) / GRID_CELL_SIZE);

    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= GRID_ROWS) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= GRID_COLS) continue;
            const cellIdx = r * GRID_COLS + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1) {
                if (curr !== i) {
                    const jBase = curr * STRIDE;
                    const jHp = d[jBase + IDX_HP];
                    if (jHp > 0) {
                        const jx = d[jBase + IDX_X];
                        const jz = d[jBase + IDX_Z];
                        const dxj = d[base + IDX_X] - jx;
                        const dzj = d[base + IDX_Z] - jz;
                        const distSq = dxj * dxj + dzj * dzj;

                        if (
                            distSq < SEPARATION_RADIUS * SEPARATION_RADIUS &&
                            distSq > 0.0001
                        ) {
                            const distj = Math.sqrt(distSq);
                            const force =
                                (SEPARATION_RADIUS - distj) / SEPARATION_RADIUS;
                            sepX += (dxj / distj) * force * SEPARATION_STRENGTH;
                            sepZ += (dzj / distj) * force * SEPARATION_STRENGTH;

                            sepCount++;
                            if (sepCount >= maxSepChecks) break;
                        }
                    }
                }
                curr = gridNext[curr];
            }
            if (sepCount >= maxSepChecks) break;
        }
        if (sepCount >= maxSepChecks) break;
    }

    const sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
    if (sepMag > SEPARATION_MAX) {
        sepX = (sepX / sepMag) * SEPARATION_MAX;
        sepZ = (sepZ / sepMag) * SEPARATION_MAX;
    }
    return { sx: sepX, sz: sepZ };
}

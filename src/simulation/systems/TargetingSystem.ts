import {
    UNIT_COUNT,
    STRIDE,
    IDX_HP,
    IDX_TEAM,
    IDX_TYPE,
    IDX_X,
    IDX_Z,
    IDX_EFFECT_STATE,
    IDX_TARGET,
    IDX_MAX_HP,
    TEAM_A,
    TEAM_B,
    TEAM_SIZE,
    TARGET_TURRET,
    TYPE_HEALER,
    TYPE_TANK,
    TYPE_ASSASSIN,
    TYPE_KNIGHT,
} from "../constants";

import {
    BOUND_X_MIN,
    BOUND_X_MAX,
    BOUND_Z_MIN,
    BOUND_Z_MAX,
} from "../config";

// --- Spatial Hash Grid Configuration ---
export const cellSize = 6.0;
export const gridCols = Math.ceil((BOUND_X_MAX - BOUND_X_MIN) / cellSize);
export const gridRows = Math.ceil((BOUND_Z_MAX - BOUND_Z_MIN) / cellSize);
export const gridCells = gridCols * gridRows;

export const gridHead = new Int16Array(gridCells);
export const gridNext = new Int16Array(UNIT_COUNT);

// Pre-allocated buffers to prevent Garbage Collection spikes
export const tempCandidatesIdx = new Int32Array(64);
export const tempCandidatesDist = new Float32Array(64);
export const hitFlags = new Uint8Array(UNIT_COUNT);

export function buildGrid(d: Float32Array) {
    gridHead.fill(-1);
    gridNext.fill(-1);
    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] <= 0) continue;

        const x = d[base + IDX_X];
        const z = d[base + IDX_Z];
        const col = Math.floor((x - BOUND_X_MIN) / cellSize);
        const row = Math.floor((z - BOUND_Z_MIN) / cellSize);

        if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
            const cellIdx = row * gridCols + col;
            gridNext[i] = gridHead[cellIdx];
            gridHead[cellIdx] = i;
        }
    }
}

export function findNearestEnemy(d: Float32Array, i: number): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];

    const myCol = Math.floor((myX - BOUND_X_MIN) / cellSize);
    const myRow = Math.floor((myZ - BOUND_Z_MIN) / cellSize);

    let minDist = Infinity;
    let target = -1;

    // 1. Search in 3x3 cells
    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= gridRows) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= gridCols) continue;
            const cellIdx = r * gridCols + c;
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
        if (r < 0 || r >= gridRows) continue;
        for (let c = myCol - 2; c <= myCol + 2; c++) {
            if (c < 0 || c >= gridCols) continue;
            if (
                r >= myRow - 1 &&
                r <= myRow + 1 &&
                c >= myCol - 1 &&
                c <= myCol + 1
            )
                continue;

            const cellIdx = r * gridCols + c;
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

export function hasCombatAllies(d: Float32Array, team: number): boolean {
    const jStart = team === TEAM_A ? 0 : TEAM_SIZE;
    const jEnd = team === TEAM_A ? TEAM_SIZE : UNIT_COUNT;
    for (let j = jStart; j < jEnd; j++) {
        const jBase = j * STRIDE;
        if (d[jBase + IDX_HP] > 0) {
            const rawType = d[jBase + IDX_TYPE];
            const baseType = rawType % 6;
            if (baseType !== TYPE_HEALER) {
                return true;
            }
        }
    }
    return false;
}

export function findLowestHpAlly(d: Float32Array, i: number): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];

    const myCol = Math.floor((myX - BOUND_X_MIN) / cellSize);
    const myRow = Math.floor((myZ - BOUND_Z_MIN) / cellSize);

    let lowestHpPercent = 1.0;
    let target = -1;

    const ignoreHealers = hasCombatAllies(d, myTeam);

    // Scan allies in 3x3 cells
    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= gridRows) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= gridCols) continue;
            const cellIdx = r * gridCols + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1) {
                if (curr !== i) {
                    const jBase = curr * STRIDE;
                    if (
                        d[jBase + IDX_HP] > 0 &&
                        d[jBase + IDX_TEAM] === myTeam
                    ) {
                        const rawType = d[jBase + IDX_TYPE];
                        const baseType = rawType % 6;
                        
                        if (!(ignoreHealers && baseType === TYPE_HEALER)) {
                            const maxHp = d[jBase + IDX_MAX_HP];
                            const hpPercent = d[jBase + IDX_HP] / maxHp;

                            if (hpPercent < 0.90 && hpPercent < lowestHpPercent) {
                                lowestHpPercent = hpPercent;
                                target = curr;
                            }
                        }
                    }
                }
                curr = gridNext[curr];
            }
        }
    }

    if (target !== -1) return target;

    // Fallback: Scan allies (same team slice)
    const jStart = myTeam === TEAM_A ? 0 : TEAM_SIZE;
    const jEnd = myTeam === TEAM_A ? TEAM_SIZE : UNIT_COUNT;

    for (let j = jStart; j < jEnd; j++) {
        if (j === i) continue;
        const jBase = j * STRIDE;
        const hp = d[jBase + IDX_HP];
        if (hp <= 0) continue;

        const rawType = d[jBase + IDX_TYPE];
        const baseType = rawType % 6;
        if (ignoreHealers && baseType === TYPE_HEALER) continue;

        const maxHp = d[jBase + IDX_MAX_HP];
        const hpPercent = hp / maxHp;

        if (hpPercent < 0.90 && hpPercent < lowestHpPercent) {
            lowestHpPercent = hpPercent;
            target = j;
        }
    }
    return target;
}

export function findNearestAlly(d: Float32Array, i: number): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];

    let minDist = Infinity;
    let target = -1;

    const jStart = myTeam === TEAM_A ? 0 : TEAM_SIZE;
    const jEnd = myTeam === TEAM_A ? TEAM_SIZE : UNIT_COUNT;

    for (let j = jStart; j < jEnd; j++) {
        if (j === i) continue;
        const jBase = j * STRIDE;
        if (d[jBase + IDX_HP] > 0) {
            const dx = d[jBase + IDX_X] - myX;
            const dz = d[jBase + IDX_Z] - myZ;
            const dist = dx * dx + dz * dz;
            if (dist < minDist) {
                minDist = dist;
                target = j;
            }
        }
    }
    return target;
}

export function findLowestHpEnemy(d: Float32Array, i: number): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];

    const myCol = Math.floor((myX - BOUND_X_MIN) / cellSize);
    const myRow = Math.floor((myZ - BOUND_Z_MIN) / cellSize);

    // Count other assassins on our team already targeting this enemy
    const getAssassinTargetCount = (enemyIdx: number): number => {
        let count = 0;
        const teamStart = myTeam === TEAM_A ? 0 : TEAM_SIZE;
        const teamEnd = myTeam === TEAM_A ? TEAM_SIZE : UNIT_COUNT;
        for (let u = teamStart; u < teamEnd; u++) {
            if (u === i) continue;
            const uBase = u * STRIDE;
            const uType = d[uBase + IDX_TYPE] % 6;
            if (uType === 5 && d[uBase + IDX_HP] > 0 && d[uBase + IDX_TARGET] === enemyIdx) {
                count++;
            }
        }
        return count;
    };

    let lowestScore = Infinity;
    let target = -1;

    // Scan enemies in 3x3 cells
    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= gridRows) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= gridCols) continue;
            const cellIdx = r * gridCols + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1) {
                const jBase = curr * STRIDE;
                if (d[jBase + IDX_HP] > 0 && d[jBase + IDX_TEAM] !== myTeam) {
                    const enemyType = d[jBase + IDX_TYPE];
                    const isStealthed =
                        d[jBase + IDX_EFFECT_STATE] >= 1000 &&
                        d[jBase + IDX_EFFECT_STATE] < 2000;
                    if (
                        enemyType !== TYPE_TANK &&
                        enemyType !== TYPE_KNIGHT &&
                        enemyType !== TYPE_ASSASSIN &&
                        !isStealthed
                    ) {
                        const hp = d[jBase + IDX_HP];
                        const penalty = getAssassinTargetCount(curr) * 150000; // 150k HP soft penalty per locking assassin
                        const score = hp + penalty;
                        if (score < lowestScore) {
                            lowestScore = score;
                            target = curr;
                        }
                    }
                }
                curr = gridNext[curr];
            }
        }
    }

    if (target !== -1) return target;

    // Fallback: Scan enemies (opposite team slice)
    const jStart = myTeam === TEAM_A ? TEAM_SIZE : 0;
    const jEnd = myTeam === TEAM_A ? UNIT_COUNT : TEAM_SIZE;

    for (let j = jStart; j < jEnd; j++) {
        const jBase = j * STRIDE;
        const hp = d[jBase + IDX_HP];
        if (hp <= 0) continue;
        const enemyType = d[jBase + IDX_TYPE];
        const isStealthed =
            d[jBase + IDX_EFFECT_STATE] >= 1000 &&
            d[jBase + IDX_EFFECT_STATE] < 2000;
        if (isStealthed) continue;
        if (enemyType !== TYPE_TANK && enemyType !== TYPE_KNIGHT && enemyType !== TYPE_ASSASSIN) {
            const penalty = getAssassinTargetCount(j) * 150000;
            const score = hp + penalty;
            if (score < lowestScore) {
                lowestScore = score;
                target = j;
            }
        }
    }
    return target;
}

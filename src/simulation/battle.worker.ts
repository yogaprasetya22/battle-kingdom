/**
 * Battle Worker — berjalan di thread terpisah
 * Membaca & menulis SharedArrayBuffer yang berisi state semua unit
 *
 * ponytail: tidak ada class, tidak ada event system. Just a loop..plan/unit-archety...plan/unit-archetypes.mdplan/unit-archetypes.mdplan/unit-archetypes.mdpes.md
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
    SPAWN_SPREAD,
    getTerrainHeight,
    TURRET_A_X,
    TURRET_B_X,
    TURRET_Z,
    TURRET_ATTACK_RANGE_SQ,
    TURRET_DAMAGE,
    TURRET_ATTACK_INTERVAL,
    TARGET_TURRET,
} from "./constants";

import {
    HP_PER_TYPE,
    ATTRIBUTES,
    DEFAULT_ATTRIBUTES,
    ARMOR,
    DEFENSE_BUFF_MULTIPLIER,
    TANK_SKILLS,
    ARCHER_SKILLS,
    MAGE_SKILLS,
    HEALER_SKILLS,
    GUNSLINGER_SKILLS,
    ASSASSIN_SKILLS,
    SPAWN_INITIAL,
    SPAWN_PER_WAVE,
    SPAWN_WAVE_INTERVAL,
    SPAWN_INSIDE_OFFSET_X,
    SPAWN_INSIDE_SPREAD_Z,
    SEPARATION_RADIUS,
    SEPARATION_STRENGTH,
    SEPARATION_MAX,
    BOUND_X_MIN,
    BOUND_X_MAX,
    BOUND_Z_MIN,
    BOUND_Z_MAX,
} from "./config";

let buf: SharedArrayBuffer | ArrayBuffer | null = null;
let data: Float32Array | null = null;
let int32Data: Int32Array | null = null;
let battleTicks = 0;

let startIndex = 0;
let endIndex = UNIT_COUNT;

// Option 1: Per-Worker State Tracking — store workerId as module-level variable
let workerId = -1;
let customClasses: number[] = [0, 1, 2, 3, 4, 5];

interface TeamComposition {
    tank: number;
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
let currentMatchup = "mix";
let teamAConfig: TeamComposition = {
    tank: 15,
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
let teamBConfig: TeamComposition = {
    tank: 15,
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

// --- Spatial Hash Grid Configuration ---
const cellSize = 6.0;
const gridCols = Math.ceil((BOUND_X_MAX - BOUND_X_MIN) / cellSize);
const gridRows = Math.ceil((BOUND_Z_MAX - BOUND_Z_MIN) / cellSize);
const gridCells = gridCols * gridRows;

const gridHead = new Int16Array(gridCells);
const gridNext = new Int16Array(UNIT_COUNT);

// Pre-allocated buffers to prevent Garbage Collection spikes
const tempCandidatesIdx = new Int32Array(64);
const tempCandidatesDist = new Float32Array(64);
const hitFlags = new Uint8Array(UNIT_COUNT);

// ponytail: single pre-allocated buffer for Float32<->Int32 conversion in Atomics CAS
const _casF32 = new Float32Array(1);
const _casI32 = new Int32Array(_casF32.buffer);

function buildGrid(d: Float32Array) {
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

// --- Spawn ---
function initUnits(d: Float32Array, matchup: string = "mix") {
    currentMatchup = matchup;

    const typesA: number[] = [];
    const typesB: number[] = [];
    const fillTypes = (arr: number[], config: TeamComposition) => {
        for (let j = 0; j < (config.tank ?? 0); j++) arr.push(TYPE_TANK);
        for (let j = 0; j < (config.archer ?? 0); j++) arr.push(TYPE_ARCHER);
        for (let j = 0; j < (config.mage ?? 0); j++) arr.push(TYPE_MAGE);
        for (let j = 0; j < (config.healer ?? 0); j++) arr.push(TYPE_HEALER);
        for (let j = 0; j < (config.gunslinger ?? 0); j++) arr.push(TYPE_GUNSLINGER);
        for (let j = 0; j < (config.assassin ?? 0); j++) arr.push(TYPE_ASSASSIN);
        // Skeleton Special Roles (types 6 to 11):
        for (let j = 0; j < (config.skel_tank ?? 0); j++) arr.push(6);
        for (let j = 0; j < (config.skel_archer ?? 0); j++) arr.push(7);
        for (let j = 0; j < (config.skel_mage ?? 0); j++) arr.push(8);
        for (let j = 0; j < (config.skel_healer ?? 0); j++) arr.push(9);
        for (let j = 0; j < (config.skel_gunslinger ?? 0); j++) arr.push(10);
        for (let j = 0; j < (config.skel_assassin ?? 0); j++) arr.push(11);
    };
    fillTypes(typesA, teamAConfig);
    fillTypes(typesB, teamBConfig);

    // Only initialize units assigned to this worker's range
    for (let i = startIndex; i < endIndex; i++) {
        const base = i * STRIDE;
        const team = i < TEAM_SIZE ? TEAM_A : TEAM_B;
        const localIdx = i < TEAM_SIZE ? i : i - TEAM_SIZE;
        const row = Math.floor(localIdx / 10);
        const col = localIdx % 10;

        let unitType = 0;
        let isActive = true;

        if (matchup === "custom_composition") {
            const types = team === TEAM_A ? typesA : typesB;
            if (localIdx < types.length) {
                unitType = types[localIdx];
            } else {
                isActive = false;
            }
        } else {
            // Tentukan kategori unit berdasarkan matchup: 6 tipe (0-5: Tank,Archer,Mage,Healer,Gunslinger,Assassin)
            unitType = localIdx % 6;
            const healerCount = Math.max(1, Math.round(TEAM_SIZE * 0.02)); // 2% Healers/Acolyte
            if (localIdx < healerCount) {
                unitType = TYPE_HEALER;
            }
            if (matchup === "custom") {
                unitType = customClasses[localIdx % customClasses.length];
            } else if (matchup === "mage_vs_tank") {
                unitType = team === TEAM_A ? TYPE_MAGE : TYPE_TANK;
            } else if (matchup === "archer_vs_tank") {
                unitType = team === TEAM_A ? TYPE_ARCHER : TYPE_TANK;
            } else if (matchup === "mage_vs_archer") {
                unitType = team === TEAM_A ? TYPE_MAGE : TYPE_ARCHER;
            } else if (matchup === "only_mage") {
                unitType = TYPE_MAGE;
            } else if (matchup === "only_archer") {
                unitType = TYPE_ARCHER;
            } else if (matchup === "only_tank") {
                unitType = TYPE_TANK;
            } else if (matchup === "only_gunslinger") {
                unitType = TYPE_GUNSLINGER;
            } else if (matchup === "only_assassin") {
                unitType = TYPE_ASSASSIN;
            }
        }

        if (!isActive) {
            d[base + IDX_HP] = -1000; // inactive
            d[base + IDX_MAX_HP] = 100;
            d[base + IDX_TYPE] = 0;
            d[base + IDX_TEAM] = team;
            d[base + IDX_X] = -999;
            d[base + IDX_Y] = -999;
            d[base + IDX_Z] = -999;
            continue;
        }

        d[base + IDX_TYPE] = unitType;

        const hp = HP_PER_TYPE[unitType] ?? 100;
        d[base + IDX_MAX_HP] = hp;
        d[base + IDX_HP] = -999; // belum spawn
        d[base + IDX_TEAM] = team;
        d[base + IDX_ANIM] = 1; // move
        d[base + IDX_TARGET] = -1;

        // Reset cooldowns & states
        d[base + IDX_SKILL1_CD] = 0;
        d[base + IDX_SKILL2_CD] = 0;
        d[base + IDX_SKILL3_CD] = 0;
        d[base + IDX_ATTACK_CD] = 0;
        d[base + IDX_EFFECT_STATE] = 0;
        d[base + IDX_IMMUNE_CD] = 0;

        d[base + IDX_X] =
            team === TEAM_A ? SPAWN_A_X + col * 1.4 : SPAWN_B_X - col * 1.4;
        d[base + IDX_Z] = -SPAWN_SPREAD / 2 + row * 1.4;
        d[base + IDX_Y] = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
    }
}

// --- Find nearest enemy using Spatial Grid ---
function findNearestEnemy(d: Float32Array, i: number): number {
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

function hasCombatAllies(d: Float32Array, team: number): boolean {
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

// --- Find lowest HP percent ally using Spatial Grid ---
function findLowestHpAlly(d: Float32Array, i: number): number {
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

function findNearestAlly(d: Float32Array, i: number): number {
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

// --- Find lowest HP enemy (Assassin targeting) using Spatial Grid ---
function findLowestHpEnemy(d: Float32Array, i: number): number {
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
        if (enemyType !== TYPE_TANK && enemyType !== TYPE_ASSASSIN) {
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

// --- Hitung damage masuk setelah dikurangi Armor dan Buff ---
const statsDamageDealt = new Float32Array(UNIT_COUNT);
const statsDamageTaken = new Float32Array(UNIT_COUNT);
const statsKills = new Int32Array(UNIT_COUNT);
const statsHealDone = new Float32Array(UNIT_COUNT);

let skillFXBatch: any[] = [];

// Thread-safe applyDamage using Atomics on Casted Float32Array
function applyDamage(
    d: Float32Array,
    targetIdx: number,
    rawDamage: number,
    attackerIdx?: number,
) {
    if (targetIdx === TARGET_TURRET) {
        const attackerTeam = attackerIdx !== undefined ? d[attackerIdx * STRIDE + IDX_TEAM] : TEAM_A;
        skillFXBatch.push({
            type: "turretDamage",
            team: attackerTeam === TEAM_A ? TEAM_B : TEAM_A,
            damage: rawDamage,
        });
        return;
    }

    const tBase = targetIdx * STRIDE;

    const tx = d[tBase + IDX_X];
    const ty = d[tBase + IDX_Y];
    const tz = d[tBase + IDX_Z];

    // Cek imunitas — jika sedang imun, abaikan seluruh damage dan report miss
    if (d[tBase + IDX_IMMUNE_CD] > 0) {
        skillFXBatch.push({
            type: "skillFX",
            skill: "miss",
            position: [tx, ty, tz],
        });
        return;
    }

    const tType = d[tBase + IDX_TYPE];
    const tEffect = d[tBase + IDX_EFFECT_STATE];

    const armorReduction = ARMOR[tType] ?? 0;
    let damageMultiplier = 1.0 - armorReduction;

    // Jika memiliki Buff Pertahanan Aktif (effectState < 0), kurangi damage tambahan
    if (tEffect < 0) {
        damageMultiplier *= DEFENSE_BUFF_MULTIPLIER;
    }

    // Determine critical hit status and apply critical damage multiplier
    let isCrit = false;
    let adjustedDamage = rawDamage;

    if (attackerIdx !== undefined && attackerIdx >= 0) {
        const attackerType = d[attackerIdx * STRIDE + IDX_TYPE];
        const attr = ATTRIBUTES[attackerType] ?? DEFAULT_ATTRIBUTES;
        if (Math.random() < attr.critChance) {
            isCrit = true;
            adjustedDamage = Math.round(rawDamage * attr.critDamage);
        }

        // Cap assassin critical/burst damage to maximum of 70,000
        if (attackerType === 5 || attackerType === 11) {
            if (isCrit && adjustedDamage > 70000) {
                adjustedDamage = 70000;
            } else if (!isCrit && adjustedDamage > 50000) {
                adjustedDamage = 50000; // non-crit cap
            }
        }
    }

    const finalDamage = Math.max(1, Math.round(adjustedDamage * damageMultiplier));

    const int32 = int32Data!;
    const hpIndex = tBase + IDX_HP;

    let currentBits = Atomics.load(int32, hpIndex);
    let oldHp = 0;
    let newHp = 0;
    while (true) {
        _casI32[0] = currentBits;
        oldHp = _casF32[0];
        if (oldHp <= 0) return; // already dead

        newHp = Math.max(0, oldHp - finalDamage);
        _casF32[0] = newHp;
        const nextBits = _casI32[0];
        const oldBits = Atomics.compareExchange(
            int32,
            hpIndex,
            currentBits,
            nextBits,
        );
        if (oldBits === currentBits) {
            break;
        }
        currentBits = oldBits;
    }

    // Catat statistik pertempuran (these are thread-local)
    statsDamageTaken[targetIdx] += finalDamage;
    if (attackerIdx !== undefined && attackerIdx >= 0) {
        statsDamageDealt[attackerIdx] += finalDamage;
    }

    // Determine event metadata
    const isMagic = attackerIdx !== undefined && (d[attackerIdx * STRIDE + IDX_TYPE] % 6 === 2); // Mage

    skillFXBatch.push({
        type: "skillFX",
        skill: "damage",
        value: finalDamage,
        position: [tx, ty, tz],
        isCrit,
        isMagic,
    });

    // Cek kematian unit dan catat kill
    if (newHp <= 0) {
        d[tBase + IDX_ANIM] = 3; // animasi mati
        if (attackerIdx !== undefined && attackerIdx >= 0) {
            statsKills[attackerIdx] += 1;
        }
    }
}

// Thread-safe applyHeal using Atomics on Casted Float32Array
function applyHeal(
    d: Float32Array,
    targetIdx: number,
    healAmount: number,
    healerIdx?: number,
) {
    if (targetIdx < 0) return;
    const tBase = targetIdx * STRIDE;
    const int32 = int32Data!;
    const hpIndex = tBase + IDX_HP;

    let currentBits = Atomics.load(int32, hpIndex);
    let oldHp = 0;
    let newHp = 0;
    while (true) {
        _casI32[0] = currentBits;
        oldHp = _casF32[0];
        if (oldHp <= 0) return; // already dead

        const maxHp = d[tBase + IDX_MAX_HP];
        newHp = Math.min(maxHp, oldHp + healAmount);
        _casF32[0] = newHp;
        const nextBits = _casI32[0];
        const oldBits = Atomics.compareExchange(
            int32,
            hpIndex,
            currentBits,
            nextBits,
        );
        if (oldBits === currentBits) {
            break;
        }
        currentBits = oldBits;
    }

    const actualHealed = newHp - oldHp;
    if (healerIdx !== undefined && healerIdx >= 0) {
        statsHealDone[healerIdx] += actualHealed;
    }

    const tx = d[tBase + IDX_X];
    const ty = d[tBase + IDX_Y];
    const tz = d[tBase + IDX_Z];

    skillFXBatch.push({
        type: "skillFX",
        skill: "heal",
        value: actualHealed,
        position: [tx, ty, tz],
    });
}

interface DelayedDamage {
    targetIdx: number;
    attackerIdx?: number;
    damage: number;
    ticksLeft: number;
    effectTicks?: number;
}
const delayedDamages: DelayedDamage[] = [];

function queueDamage(
    targetIdx: number,
    damage: number,
    delayTicks: number,
    attackerIdx?: number,
    effectTicks?: number,
) {
    delayedDamages.push({
        targetIdx,
        attackerIdx,
        damage,
        ticksLeft: delayTicks,
        effectTicks,
    });
}

const animLockTicks = new Int32Array(UNIT_COUNT);

// Turret attack cooldown per team (counts down each tick)
let turretACd = 0;
let turretBCd = 0;

// --- Main tick ---
function tick(d: Float32Array) {
    battleTicks++;

    // 1. Build Spatial Grid for fast distance queries
    buildGrid(d);

    // Batch skill FX events — send as single postMessage at end of tick
    skillFXBatch = [];

    // --- TURRET SHOOTING ---
    // ponytail: turret searches for nearest unit in range, fires projectile event
    if (turretACd > 0) turretACd--;
    if (turretBCd > 0) turretBCd--;

    // Turret A (Tim A) menembak unit Tim B yang mendekat
    let nearestEnemyA = -1;
    let nearestDistA = TURRET_ATTACK_RANGE_SQ;
    for (let j = TEAM_SIZE; j < UNIT_COUNT; j++) {
        const jBase = j * STRIDE;
        if (d[jBase + IDX_HP] <= 0) continue;
        const dx = d[jBase + IDX_X] - TURRET_A_X;
        const dz = d[jBase + IDX_Z] - TURRET_Z;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistA) {
            nearestDistA = distSq;
            nearestEnemyA = j;
        }
    }

    if (nearestEnemyA !== -1) {
        if (turretACd === 0) {
            applyDamage(d, nearestEnemyA, TURRET_DAMAGE);
            skillFXBatch.push({
                type: "skillFX",
                skill: "turretShoot",
                team: TEAM_A,
                fx: TURRET_A_X, fy: 3.1, fz: TURRET_Z,
                tx: d[nearestEnemyA * STRIDE + IDX_X],
                ty: d[nearestEnemyA * STRIDE + IDX_Y] + 1,
                tz: d[nearestEnemyA * STRIDE + IDX_Z],
            });
            turretACd = TURRET_ATTACK_INTERVAL;
        }
    } else {
        turretACd = 0; // ready instantly when enemy enters
    }

    // Turret B (Tim B) menembak unit Tim A yang mendekat
    let nearestEnemyB = -1;
    let nearestDistB = TURRET_ATTACK_RANGE_SQ;
    for (let j = 0; j < TEAM_SIZE; j++) {
        const jBase = j * STRIDE;
        if (d[jBase + IDX_HP] <= 0) continue;
        const dx = d[jBase + IDX_X] - TURRET_B_X;
        const dz = d[jBase + IDX_Z] - TURRET_Z;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistB) {
            nearestDistB = distSq;
            nearestEnemyB = j;
        }
    }

    if (nearestEnemyB !== -1) {
        if (turretBCd === 0) {
            applyDamage(d, nearestEnemyB, TURRET_DAMAGE);
            skillFXBatch.push({
                type: "skillFX",
                skill: "turretShoot",
                team: TEAM_B,
                fx: TURRET_B_X, fy: 3.1, fz: TURRET_Z,
                tx: d[nearestEnemyB * STRIDE + IDX_X],
                ty: d[nearestEnemyB * STRIDE + IDX_Y] + 1,
                tz: d[nearestEnemyB * STRIDE + IDX_Z],
            });
            turretBCd = TURRET_ATTACK_INTERVAL;
        }
    } else {
        turretBCd = 0; // ready instantly when enemy enters
    }


    // Update delayed damages
    for (let i = delayedDamages.length - 1; i >= 0; i--) {
        const dd = delayedDamages[i];
        dd.ticksLeft--;
        if (dd.ticksLeft <= 0) {
            applyDamage(d, dd.targetIdx, dd.damage, dd.attackerIdx);
            if (dd.effectTicks) {
                const tBase = dd.targetIdx * STRIDE;
                const int32 = int32Data!;
                const hpIndex = tBase + IDX_HP;
                _casI32[0] = Atomics.load(int32, hpIndex);
                if (_casF32[0] > 0) {
                    d[tBase + IDX_EFFECT_STATE] = dd.effectTicks;
                    if (dd.effectTicks > 0) {
                        d[tBase + IDX_ANIM] = 0; // force idle
                        d[tBase + IDX_TARGET] = -1; // clear target
                        animLockTicks[dd.targetIdx] = 0; // clear animation lock
                    }
                }
            }
            delayedDamages.splice(i, 1);
        }
    }

    // Decrement animation lock ticks
    for (let i = startIndex; i < endIndex; i++) {
        if (animLockTicks[i] > 0) animLockTicks[i]--;
    }

    let activeCountA = TEAM_SIZE;
    let activeCountB = TEAM_SIZE;
    if (currentMatchup === "custom_composition") {
        activeCountA =
            (teamAConfig.tank ?? 0) +
            (teamAConfig.archer ?? 0) +
            (teamAConfig.mage ?? 0) +
            (teamAConfig.healer ?? 0) +
            (teamAConfig.gunslinger ?? 0) +
            (teamAConfig.assassin ?? 0) +
            (teamAConfig.skel_tank ?? 0) +
            (teamAConfig.skel_archer ?? 0) +
            (teamAConfig.skel_mage ?? 0) +
            (teamAConfig.skel_healer ?? 0) +
            (teamAConfig.skel_gunslinger ?? 0) +
            (teamAConfig.skel_assassin ?? 0);
        activeCountB =
            (teamBConfig.tank ?? 0) +
            (teamBConfig.archer ?? 0) +
            (teamBConfig.mage ?? 0) +
            (teamBConfig.healer ?? 0) +
            (teamBConfig.gunslinger ?? 0) +
            (teamBConfig.assassin ?? 0) +
            (teamBConfig.skel_tank ?? 0) +
            (teamBConfig.skel_archer ?? 0) +
            (teamBConfig.skel_mage ?? 0) +
            (teamBConfig.skel_healer ?? 0) +
            (teamBConfig.skel_gunslinger ?? 0) +
            (teamBConfig.skel_assassin ?? 0);
    }

    const unitsToSpawn =
        SPAWN_INITIAL +
        Math.floor(battleTicks / SPAWN_WAVE_INTERVAL) * SPAWN_PER_WAVE;

    // Spawn Team A units in range
    const maxSpawnA = Math.min(activeCountA, unitsToSpawn);
    for (let i = startIndex; i < Math.min(endIndex, maxSpawnA); i++) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] === -999) {
            d[base + IDX_HP] = d[base + IDX_MAX_HP];
            d[base + IDX_X] = SPAWN_A_X - SPAWN_INSIDE_OFFSET_X;
            d[base + IDX_Z] = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;
            d[base + IDX_Y] = getTerrainHeight(
                d[base + IDX_X],
                d[base + IDX_Z],
            );
            d[base + IDX_EFFECT_STATE] = 0;
            d[base + IDX_ATTACK_CD] = 0;
            d[base + IDX_SKILL1_CD] = 0;
            d[base + IDX_SKILL2_CD] = 0;
            d[base + IDX_SKILL3_CD] = 0;
            d[base + IDX_TARGET] = -1;
            d[base + IDX_IMMUNE_CD] = 0;
        }
    }
 
    // Spawn Team B units in range
    const maxSpawnB = Math.min(activeCountB, unitsToSpawn);
    const bStartIdx = TEAM_SIZE;
    for (
        let i = Math.max(startIndex, bStartIdx);
        i < Math.min(endIndex, bStartIdx + maxSpawnB);
        i++
    ) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] === -999) {
            d[base + IDX_HP] = d[base + IDX_MAX_HP];
            d[base + IDX_X] = SPAWN_B_X + SPAWN_INSIDE_OFFSET_X;
            d[base + IDX_Z] = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;
            d[base + IDX_Y] = getTerrainHeight(
                d[base + IDX_X],
                d[base + IDX_Z],
            );
            d[base + IDX_EFFECT_STATE] = 0;
            d[base + IDX_ATTACK_CD] = 0;
            d[base + IDX_SKILL1_CD] = 0;
            d[base + IDX_SKILL2_CD] = 0;
            d[base + IDX_SKILL3_CD] = 0;
            d[base + IDX_TARGET] = -1;
            d[base + IDX_IMMUNE_CD] = 0;
        }
    }

    for (let i = startIndex; i < endIndex; i++) {
        const base = i * STRIDE;

        // Jika belum di-spawn, lewati tick ini
        if (d[base + IDX_HP] === -999) {
            continue;
        }

        if (d[base + IDX_HP] <= 0) {
            d[base + IDX_ANIM] = 3; // dead
            animLockTicks[i] = 0;
            // ponytail: recycle dead units back to pool after 180 ticks (~3 seconds)
            if (d[base + IDX_HP] > -900) {
                d[base + IDX_HP] -= 1;
                if (d[base + IDX_HP] <= -180) {
                    d[base + IDX_HP] = -999; // mark as unspawned so wave spawner recycles it
                }
            }
            continue;
        }

        // Tick down imunitas
        if (d[base + IDX_IMMUNE_CD] > 0) d[base + IDX_IMMUNE_CD]--;

        // --- EFFECT STATE (Stun=1..999 / Stealth=1000..1999 / Poison=2000..2999 / Buff<0) ---
        const effect = d[base + IDX_EFFECT_STATE];
        if (effect >= 2000) {
            // Poison DoT — take damage each tick, can still act
            d[base + IDX_EFFECT_STATE]--;
            applyDamage(d, i, ASSASSIN_SKILLS.poisonBlade.damagePerTick); // poison tick damage
            if (d[base + IDX_EFFECT_STATE] < 2000)
                d[base + IDX_EFFECT_STATE] = 0;
        } else if (effect >= 1000) {
            // Stealthed — can act, enemies can't target
            d[base + IDX_EFFECT_STATE]--;
            if (d[base + IDX_EFFECT_STATE] < 1000)
                d[base + IDX_EFFECT_STATE] = 0;
        } else if (effect > 0) {
            // Stunned — skip turn
            d[base + IDX_EFFECT_STATE]--;
            d[base + IDX_ANIM] = 0; // idle/stunned
            animLockTicks[i] = 0;
            continue;
        } else if (effect < 0) {
            d[base + IDX_EFFECT_STATE]++;
        }

        // Kurangi cooldown skill & normal attack (ticks)
        if (d[base + IDX_SKILL1_CD] > 0) d[base + IDX_SKILL1_CD]--;
        if (d[base + IDX_SKILL2_CD] > 0) d[base + IDX_SKILL2_CD]--;
        if (d[base + IDX_SKILL3_CD] > 0) d[base + IDX_SKILL3_CD]--;
        if (d[base + IDX_ATTACK_CD] > 0) d[base + IDX_ATTACK_CD]--;

        const uTypeRaw = d[base + IDX_TYPE];
        const uType = uTypeRaw % 6;
        const cachedTarget = d[base + IDX_TARGET];
        let target = cachedTarget;

        // Check if current target is invalid (dead, none, or stealthed)
        let isTargetInvalid =
            cachedTarget === -1 || d[cachedTarget * STRIDE + IDX_HP] <= 0;
        if (!isTargetInvalid && cachedTarget >= 0) {
            const tEffect = d[cachedTarget * STRIDE + IDX_EFFECT_STATE];
            if (tEffect >= 1000 && tEffect < 2000) {
                isTargetInvalid = true; // Target went into stealth!
            }
        }

        // Check if healer's current ally target is still alive and injured
        if (uType === TYPE_HEALER && cachedTarget >= 0) {
            const tHp = d[cachedTarget * STRIDE + IDX_HP];
            const tMaxHp = d[cachedTarget * STRIDE + IDX_MAX_HP];
            const hpPercent = tHp / tMaxHp;
            if (tHp > 0 && hpPercent < 0.98) {
                // Ally still alive and injured — KEEP target, skip search entirely
                target = cachedTarget;
                d[base + IDX_TARGET] = target;
                isTargetInvalid = false;
            } else {
                // Ally healed or dead — force a fresh search this tick
                isTargetInvalid = true;
            }
        }

        // If target is invalid, throttle search to once every 8 ticks. If valid, re-evaluate target every 4 ticks.
        const searchInterval = isTargetInvalid ? 8 : (uType === TYPE_HEALER ? 30 : 4);
        const shouldSearch = (battleTicks + i) % searchInterval === 0;

        if (isTargetInvalid && !shouldSearch) {
            // Keep existing target (TARGET_TURRET or -1)
            if (target !== TARGET_TURRET) {
                target = (uType === TYPE_HEALER) ? TARGET_TURRET : -1;
                d[base + IDX_TARGET] = target;
            }
        } else if (isTargetInvalid || shouldSearch) {
            if (uType === TYPE_HEALER) {
                target = findLowestHpAlly(d, i);
                if (target === -1) {
                    target = TARGET_TURRET;
                }
            } else if (uType === TYPE_ASSASSIN) {
                target = findLowestHpEnemy(d, i);
                if (target === -1) {
                    target = findNearestEnemy(d, i);
                }
            } else {
                target = findNearestEnemy(d, i);
            }
            // No living enemy found — march to enemy turret
            if (target === -1) {
                target = TARGET_TURRET;
            }
            d[base + IDX_TARGET] = target;
        }

        // --- SELF-BUFF SKILLS (no target needed) ---
        // ponytail: fire before target check so units without enemy can still self-buff
        let skillActivated = false;

        if (uType === TYPE_TANK && d[base + IDX_SKILL1_CD] === 0) {
            d[base + IDX_IMMUNE_CD] = TANK_SKILLS.bulwarkStance.immuneTicks;
            d[base + IDX_SKILL1_CD] = TANK_SKILLS.bulwarkStance.cooldown;
            skillActivated = true;
            skillFXBatch.push({
                type: "skillFX",
                skill: "ironFortitude",
                team: d[base + IDX_TEAM],
                x: d[base + IDX_X],
                y: d[base + IDX_Y],
                z: d[base + IDX_Z],
            });
        } else if (uType === TYPE_HEALER && d[base + IDX_SKILL3_CD] === 0) {
            const sanctuaryTeam = d[base + IDX_TEAM];
            const rangeSq =
                HEALER_SKILLS.holySanctuary.radius *
                HEALER_SKILLS.holySanctuary.radius;

            // Target sanctuary center at the targeted ally or the most injured ally
            let centerIdx = -1;
            if (target >= 0) {
                centerIdx = target;
            } else {
                centerIdx = findLowestHpAlly(d, i);
            }

            let centerX = d[base + IDX_X];
            let centerZ = d[base + IDX_Z];
            let centerY = d[base + IDX_Y];
            if (centerIdx >= 0) {
                centerX = d[centerIdx * STRIDE + IDX_X];
                centerZ = d[centerIdx * STRIDE + IDX_Z];
                centerY = d[centerIdx * STRIDE + IDX_Y];
            }

            // Check if there is at least one nearby ally who actually needs healing in the target area
            let anyoneNeedsHealing = false;
            const hCol = Math.floor((centerX - BOUND_X_MIN) / cellSize);
            const hRow = Math.floor((centerZ - BOUND_Z_MIN) / cellSize);

            for (let r = hRow - 1; r <= hRow + 1 && !anyoneNeedsHealing; r++) {
                if (r < 0 || r >= gridRows) continue;
                for (let c = hCol - 1; c <= hCol + 1 && !anyoneNeedsHealing; c++) {
                    if (c < 0 || c >= gridCols) continue;
                    const cellIdx = r * gridCols + c;
                    let curr = gridHead[cellIdx];
                    while (curr !== -1) {
                        const jBase = curr * STRIDE;
                        if (
                            d[jBase + IDX_HP] > 0 &&
                            d[jBase + IDX_HP] < d[jBase + IDX_MAX_HP] &&
                            d[jBase + IDX_TEAM] === sanctuaryTeam
                        ) {
                            const jdx = d[jBase + IDX_X] - centerX;
                            const jdz = d[jBase + IDX_Z] - centerZ;
                            if (jdx * jdx + jdz * jdz <= rangeSq) {
                                anyoneNeedsHealing = true;
                                break;
                            }
                        }
                        curr = gridNext[curr];
                    }
                }
            }

            if (anyoneNeedsHealing) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                let healCount = 0;
                for (let r = hRow - 1; r <= hRow + 1; r++) {
                    if (r < 0 || r >= gridRows) break;
                    for (let c = hCol - 1; c <= hCol + 1; c++) {
                        if (c < 0 || c >= gridCols) break;
                        const cellIdx = r * gridCols + c;
                        let curr = gridHead[cellIdx];
                        while (curr !== -1) {
                            const jBase = curr * STRIDE;
                            if (
                                d[jBase + IDX_HP] > 0 &&
                                d[jBase + IDX_TEAM] === sanctuaryTeam
                            ) {
                                const jdx = d[jBase + IDX_X] - centerX;
                                const jdz = d[jBase + IDX_Z] - centerZ;
                                if (jdx * jdx + jdz * jdz <= rangeSq) {
                                    applyHeal(
                                        d,
                                        curr,
                                        HEALER_SKILLS.holySanctuary.healAmount,
                                        i,
                                    );
                                    healCount++;
                                    if (healCount >= 5) break;
                                }
                            }
                            curr = gridNext[curr];
                        }
                        if (healCount >= 5) break;
                    }
                    if (healCount >= 5) break;
                }
                d[base + IDX_SKILL3_CD] = HEALER_SKILLS.holySanctuary.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "holySanctuary",
                    x: centerX,
                    y: centerY,
                    z: centerZ,
                });
            }
        }

        if (target === -1) {
            if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 0; // idle
            }

            // Apply separation even when targetless so unit can be pushed out of the way (Solusi 1)
            if (!skillActivated) {
                let sepX = 0;
                let sepZ = 0;
                const myCol = Math.floor((d[base + IDX_X] - BOUND_X_MIN) / cellSize);
                const myRow = Math.floor((d[base + IDX_Z] - BOUND_Z_MIN) / cellSize);

                for (let r = myRow - 1; r <= myRow + 1; r++) {
                    if (r < 0 || r >= gridRows) continue;
                    for (let c = myCol - 1; c <= myCol + 1; c++) {
                        if (c < 0 || c >= gridCols) continue;
                        const cellIdx = r * gridCols + c;
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
                                    if (distSq < SEPARATION_RADIUS * SEPARATION_RADIUS && distSq > 0.0001) {
                                        const distj = Math.sqrt(distSq);
                                        const force = (SEPARATION_RADIUS - distj) / SEPARATION_RADIUS;
                                        const softDist = distj + 0.1;
                                        sepX += (dxj / softDist) * force * SEPARATION_STRENGTH;
                                        sepZ += (dzj / softDist) * force * SEPARATION_STRENGTH;
                                    }
                                }
                            }
                            curr = gridNext[curr];
                        }
                    }
                }

                const sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
                const attr = ATTRIBUTES[uTypeRaw] ?? DEFAULT_ATTRIBUTES;
                const mySpeed = attr.moveSpeed;
                const limitMax = Math.min(SEPARATION_MAX, mySpeed); // Solusi 2
                if (sepMag > limitMax) {
                    sepX = (sepX / sepMag) * limitMax;
                    sepZ = (sepZ / sepMag) * limitMax;
                }
                d[base + IDX_X] += sepX;
                d[base + IDX_Z] += sepZ;
            }
 
            if (d[base + IDX_X] < BOUND_X_MIN) d[base + IDX_X] = BOUND_X_MIN;
            if (d[base + IDX_X] > BOUND_X_MAX) d[base + IDX_X] = BOUND_X_MAX;
            if (d[base + IDX_Z] < BOUND_Z_MIN) d[base + IDX_Z] = BOUND_Z_MIN;
            if (d[base + IDX_Z] > BOUND_Z_MAX) d[base + IDX_Z] = BOUND_Z_MAX;
            d[base + IDX_Y] = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
 
            continue;
        }

        // --- TARGET_TURRET: unit bergerak ke dan menyerang turret musuh ---
        if (target === TARGET_TURRET) {
            const myTeam = d[base + IDX_TEAM];
            const turretX = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
            const dtx = turretX - d[base + IDX_X];
            const dtz = TURRET_Z - d[base + IDX_Z];
            const dtDist = Math.sqrt(dtx * dtx + dtz * dtz) || 0.001;
            const attr = ATTRIBUTES[uTypeRaw] ?? DEFAULT_ATTRIBUTES;
            const mySpeed = attr.moveSpeed;

            if (dtDist > attr.attackRange) {
                // Bergerak menuju turret
                const nx = dtx / dtDist;
                const nz = dtz / dtDist;
                d[base + IDX_X] += nx * mySpeed;
                d[base + IDX_Z] += nz * mySpeed;
                d[base + IDX_Y] = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
                if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 1; // move
            } else {
                // Serang turret bila attack cooldown habis
                if (d[base + IDX_ATTACK_CD] === 0) {
                    d[base + IDX_ANIM] = 2; // attack
                    animLockTicks[i] = 15;
                    d[base + IDX_ATTACK_CD] = attr.attackInterval;
                    skillFXBatch.push({
                        type: "turretDamage",
                        team: myTeam === TEAM_A ? TEAM_B : TEAM_A, // turret tim lawan
                        damage: attr.baseDamage,
                    });
                } else if (animLockTicks[i] === 0) {
                    d[base + IDX_ANIM] = 0; // idle while waiting
                }
            }

            // Bound check
            if (d[base + IDX_X] < BOUND_X_MIN) d[base + IDX_X] = BOUND_X_MIN;
            if (d[base + IDX_X] > BOUND_X_MAX) d[base + IDX_X] = BOUND_X_MAX;
            if (d[base + IDX_Z] < BOUND_Z_MIN) d[base + IDX_Z] = BOUND_Z_MIN;
            if (d[base + IDX_Z] > BOUND_Z_MAX) d[base + IDX_Z] = BOUND_Z_MAX;
            continue;
        }

        const attr = ATTRIBUTES[uTypeRaw] ?? DEFAULT_ATTRIBUTES;
        const mySpeed = attr.moveSpeed;
        const myRange = attr.attackRange;
        const baseDamage = attr.baseDamage;
        const attackInterval = attr.attackInterval;

        // Guard: target=-1 means no valid target yet — skip this unit to prevent NaN positions
        if (target < 0) continue;

        const tBase = target * STRIDE;
        let tx = 0;
        let ty = 0;
        let tz = 0;
        if (target === TARGET_TURRET) {
            const myTeam = d[base + IDX_TEAM];
            tx = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
            ty = 0;
            tz = TURRET_Z;
        } else if (target >= 0) {
            tx = d[tBase + IDX_X];
            ty = d[tBase + IDX_Y];
            tz = d[tBase + IDX_Z];
        }

        const dx = tx - d[base + IDX_X];
        const dz = tz - d[base + IDX_Z];
        const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;

        // --- TARGETED SKILLS (require enemy in range) ---

        if (uType === TYPE_TANK) {
            if (
                d[base + IDX_SKILL2_CD] === 0 &&
                dist <= TANK_SKILLS.taunt.range
            ) {
                d[tBase + IDX_TARGET] = i;
                d[base + IDX_SKILL2_CD] = TANK_SKILLS.taunt.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "taunt",
                    team: d[base + IDX_TEAM],
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y],
                    z: d[base + IDX_Z],
                    tx: tx,
                    ty: ty,
                    tz: tz,
                });
            } else if (
                d[base + IDX_SKILL3_CD] === 0 &&
                dist <= TANK_SKILLS.shieldBash.range
            ) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                queueDamage(target, TANK_SKILLS.shieldBash.damage, 15, i);
                if (target >= 0) {
                    d[tBase + IDX_X] +=
                        (dx / dist) * TANK_SKILLS.shieldBash.knockback;
                    d[tBase + IDX_Z] +=
                        (dz / dist) * TANK_SKILLS.shieldBash.knockback;
                }
                d[base + IDX_SKILL3_CD] = TANK_SKILLS.shieldBash.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "shieldBash",
                    team: d[base + IDX_TEAM],
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y],
                    z: d[base + IDX_Z],
                    tx: tx,
                    ty: ty,
                    tz: tz,
                });
            }
        } else if (uType === TYPE_ARCHER) {
            if (target >= 0 && d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                queueDamage(target, ARCHER_SKILLS.doubleShot.damage, 18, i);
                d[base + IDX_SKILL1_CD] = ARCHER_SKILLS.doubleShot.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "doubleShot",
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 0.8,
                    fz: d[base + IDX_Z],
                    tx: tx,
                    ty: ty + 0.8,
                    tz: tz,
                });
            } else if (
                target >= 0 &&
                d[base + IDX_SKILL2_CD] === 0 &&
                dist <= ARCHER_SKILLS.evasiveLeap.range
            ) {
                d[base + IDX_ANIM] = 1; // move animation
                animLockTicks[i] = 15; // lock animation
                const fromX = d[base + IDX_X];
                const fromY = d[base + IDX_Y];
                const fromZ = d[base + IDX_Z];
                d[base + IDX_X] -=
                    (dx / dist) * ARCHER_SKILLS.evasiveLeap.distance;
                d[base + IDX_Z] -=
                    (dz / dist) * ARCHER_SKILLS.evasiveLeap.distance;
                const toY = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
                d[base + IDX_SKILL2_CD] = ARCHER_SKILLS.evasiveLeap.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "evasiveLeap",
                    fx: fromX,
                    fy: fromY,
                    fz: fromZ,
                    tx: d[base + IDX_X],
                    ty: toY,
                    tz: d[base + IDX_Z],
                });
            } else if (target >= 0 && d[base + IDX_SKILL3_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const myX = d[base + IDX_X];
                const myY = d[base + IDX_Y];
                const myZ = d[base + IDX_Z];
                const targetX = tx;
                const targetZ = tz;
                const myTeam = d[base + IDX_TEAM];

                // Query 3x3 cells around target instead of full scan
                const tCol = Math.floor((targetX - BOUND_X_MIN) / cellSize);
                const tRow = Math.floor((targetZ - BOUND_Z_MIN) / cellSize);
                const radiusSq =
                    ARCHER_SKILLS.arrowVolley.radius *
                    ARCHER_SKILLS.arrowVolley.radius;

                for (let r = tRow - 1; r <= tRow + 1; r++) {
                    if (r < 0 || r >= gridRows) continue;
                    for (let c = tCol - 1; c <= tCol + 1; c++) {
                        if (c < 0 || c >= gridCols) continue;
                        const cellIdx = r * gridCols + c;
                        let curr = gridHead[cellIdx];
                        while (curr !== -1) {
                            const jBase = curr * STRIDE;
                            if (
                                d[jBase + IDX_HP] > 0 &&
                                d[jBase + IDX_TEAM] !== myTeam
                            ) {
                                const jdx = d[jBase + IDX_X] - targetX;
                                const jdz = d[jBase + IDX_Z] - targetZ;
                                const jdist = jdx * jdx + jdz * jdz;
                                if (jdist <= radiusSq) {
                                    queueDamage(
                                        curr,
                                        ARCHER_SKILLS.arrowVolley.damage,
                                        25,
                                        i,
                                    );
                                }
                            }
                            curr = gridNext[curr];
                        }
                    }
                }

                d[base + IDX_SKILL3_CD] = ARCHER_SKILLS.arrowVolley.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "arrowVolley",
                    team: d[base + IDX_TEAM],
                    fx: myX,
                    fy: myY,
                    fz: myZ,
                    x: targetX,
                    z: targetZ,
                });
            }
        } else if (uType === TYPE_MAGE) {
            // Skill 1: Frost Nova — AoE kecil, stun semua musuh dalam radius
            if (target >= 0 && d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const novaX = tx;
                const novaZ = tz;
                const novaRadiusSq =
                    MAGE_SKILLS.frostNova.radius * MAGE_SKILLS.frostNova.radius;
                const myTeamNova = d[base + IDX_TEAM];

                // Query 3x3 cells around target using pre-allocated structures
                const tCol = Math.floor((novaX - BOUND_X_MIN) / cellSize);
                const tRow = Math.floor((novaZ - BOUND_Z_MIN) / cellSize);
                let candCount = 0;

                for (let r = tRow - 1; r <= tRow + 1; r++) {
                    if (r < 0 || r >= gridRows) continue;
                    for (let c = tCol - 1; c <= tCol + 1; c++) {
                        if (c < 0 || c >= gridCols) continue;
                        const cellIdx = r * gridCols + c;
                        let curr = gridHead[cellIdx];
                        while (curr !== -1) {
                            const jBase = curr * STRIDE;
                            if (
                                d[jBase + IDX_HP] > 0 &&
                                d[jBase + IDX_TEAM] !== myTeamNova
                            ) {
                                const jdx = d[jBase + IDX_X] - novaX;
                                const jdz = d[jBase + IDX_Z] - novaZ;
                                const distSq = jdx * jdx + jdz * jdz;
                                if (distSq <= novaRadiusSq && candCount < 64) {
                                    tempCandidatesIdx[candCount] = curr;
                                    tempCandidatesDist[candCount] = distSq;
                                    candCount++;
                                }
                            }
                            curr = gridNext[curr];
                        }
                    }
                }

                // In-place sort top 3
                const limit = Math.min(3, candCount);
                for (let c = 0; c < limit; c++) {
                    let minIdx = c;
                    for (let k = c + 1; k < candCount; k++) {
                        if (
                            tempCandidatesDist[k] < tempCandidatesDist[minIdx]
                        ) {
                            minIdx = k;
                        }
                    }
                    const tIdx = tempCandidatesIdx[c];
                    tempCandidatesIdx[c] = tempCandidatesIdx[minIdx];
                    tempCandidatesIdx[minIdx] = tIdx;

                    const tDist = tempCandidatesDist[c];
                    tempCandidatesDist[c] = tempCandidatesDist[minIdx];
                    tempCandidatesDist[minIdx] = tDist;
                }

                for (let c = 0; c < limit; c++) {
                    queueDamage(
                        tempCandidatesIdx[c],
                        MAGE_SKILLS.frostNova.damage,
                        12,
                        i,
                        MAGE_SKILLS.frostNova.stunTicks,
                    );
                }
                d[base + IDX_SKILL1_CD] = MAGE_SKILLS.frostNova.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "frostNova",
                    x: novaX,
                    y: ty,
                    z: novaZ,
                });
            }
            // Skill 2: Chain Lightning — bounce 4 target
            else if (d[base + IDX_SKILL2_CD] === 0 && dist <= myRange && target >= 0) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const myTeam = d[base + IDX_TEAM];
                let chainCount = 0;

                const chainPositions: number[] = [
                    d[base + IDX_X],
                    d[base + IDX_Y],
                    d[base + IDX_Z],
                    d[tBase + IDX_X],
                    d[tBase + IDX_Y],
                    d[tBase + IDX_Z],
                ];

                queueDamage(
                    target,
                    MAGE_SKILLS.chainLightning.damagePrimary,
                    12,
                    i,
                );
                chainCount++;

                let lastX = d[tBase + IDX_X];
                let lastZ = d[tBase + IDX_Z];

                hitFlags.fill(0);
                hitFlags[target] = 1;

                const chainRadiusSq =
                    MAGE_SKILLS.chainLightning.chainRadius *
                    MAGE_SKILLS.chainLightning.chainRadius;

                while (chainCount < MAGE_SKILLS.chainLightning.maxChains) {
                    let nextTarget = -1;
                    let nextMinDist = Infinity;

                    // Query 3x3 cells around last position
                    const lCol = Math.floor((lastX - BOUND_X_MIN) / cellSize);
                    const lRow = Math.floor((lastZ - BOUND_Z_MIN) / cellSize);

                    for (let r = lRow - 1; r <= lRow + 1; r++) {
                        if (r < 0 || r >= gridRows) continue;
                        for (let c = lCol - 1; c <= lCol + 1; c++) {
                            if (c < 0 || c >= gridCols) continue;
                            const cellIdx = r * gridCols + c;
                            let curr = gridHead[cellIdx];
                            while (curr !== -1) {
                                const jBase = curr * STRIDE;
                                if (
                                    d[jBase + IDX_HP] > 0 &&
                                    d[jBase + IDX_TEAM] !== myTeam &&
                                    hitFlags[curr] === 0
                                ) {
                                    const jdx = d[jBase + IDX_X] - lastX;
                                    const jdz = d[jBase + IDX_Z] - lastZ;
                                    const jdist = jdx * jdx + jdz * jdz;
                                    if (
                                        jdist < nextMinDist &&
                                        jdist <= chainRadiusSq
                                    ) {
                                        nextMinDist = jdist;
                                        nextTarget = curr;
                                    }
                                }
                                curr = gridNext[curr];
                            }
                        }
                    }

                    if (nextTarget !== -1) {
                        queueDamage(
                            nextTarget,
                            MAGE_SKILLS.chainLightning.damageSecondary,
                            12 + chainCount * 8,
                            i,
                        );
                        hitFlags[nextTarget] = 1;
                        const nextBase = nextTarget * STRIDE;
                        lastX = d[nextBase + IDX_X];
                        lastZ = d[nextBase + IDX_Z];
                        chainPositions.push(lastX, d[nextBase + IDX_Y], lastZ);
                        chainCount++;
                    } else {
                        break;
                    }
                }
                d[base + IDX_SKILL2_CD] = MAGE_SKILLS.chainLightning.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "chainLightning",
                    team: d[base + IDX_TEAM],
                    positions: chainPositions,
                });
            }
            // Skill 3 (ULTI): Meteor Fireball — AoE besar, damage masif
            else if (d[base + IDX_SKILL3_CD] === 0 && dist <= myRange && target >= 0) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const fbX = tx;
                const fbZ = tz;
                const fbRadiusSq =
                    MAGE_SKILLS.fireball.radius * MAGE_SKILLS.fireball.radius;
                const myTeamFb = d[base + IDX_TEAM];

                queueDamage(target, MAGE_SKILLS.fireball.damageDirect, 28, i);

                const tCol = Math.floor((fbX - BOUND_X_MIN) / cellSize);
                const tRow = Math.floor((fbZ - BOUND_Z_MIN) / cellSize);
                let candCount = 0;

                for (let r = tRow - 1; r <= tRow + 1; r++) {
                    if (r < 0 || r >= gridRows) continue;
                    for (let c = tCol - 1; c <= tCol + 1; c++) {
                        if (c < 0 || c >= gridCols) continue;
                        const cellIdx = r * gridCols + c;
                        let curr = gridHead[cellIdx];
                        while (curr !== -1) {
                            if (curr !== target) {
                                const jBase = curr * STRIDE;
                                if (
                                    d[jBase + IDX_HP] > 0 &&
                                    d[jBase + IDX_TEAM] !== myTeamFb
                                ) {
                                    const jdx = d[jBase + IDX_X] - fbX;
                                    const jdz = d[jBase + IDX_Z] - fbZ;
                                    const distSq = jdx * jdx + jdz * jdz;
                                    if (
                                        distSq <= fbRadiusSq &&
                                        candCount < 64
                                    ) {
                                        tempCandidatesIdx[candCount] = curr;
                                        tempCandidatesDist[candCount] = distSq;
                                        candCount++;
                                    }
                                }
                            }
                            curr = gridNext[curr];
                        }
                    }
                }

                // In-place sort top 4
                const fbLimit = Math.min(4, candCount);
                for (let c = 0; c < fbLimit; c++) {
                    let minIdx = c;
                    for (let k = c + 1; k < candCount; k++) {
                        if (
                            tempCandidatesDist[k] < tempCandidatesDist[minIdx]
                        ) {
                            minIdx = k;
                        }
                    }
                    const tIdx = tempCandidatesIdx[c];
                    tempCandidatesIdx[c] = tempCandidatesIdx[minIdx];
                    tempCandidatesIdx[minIdx] = tIdx;

                    const tDist = tempCandidatesDist[c];
                    tempCandidatesDist[c] = tempCandidatesDist[minIdx];
                    tempCandidatesDist[minIdx] = tDist;
                }

                for (let c = 0; c < fbLimit; c++) {
                    queueDamage(
                        tempCandidatesIdx[c],
                        MAGE_SKILLS.fireball.damageSplash,
                        28,
                        i,
                    );
                }
                d[base + IDX_SKILL3_CD] = MAGE_SKILLS.fireball.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "fireball",
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 1.0,
                    fz: d[base + IDX_Z],
                    tx: fbX,
                    ty: ty + 1.0,
                    tz: fbZ,
                });
            }
        } else if (uType === TYPE_GUNSLINGER) {
            // Skill 1: High Noon — single target nuke
            if (target >= 0 && d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                queueDamage(target, GUNSLINGER_SKILLS.highNoon.damage, 12, i);
                d[base + IDX_SKILL1_CD] = GUNSLINGER_SKILLS.highNoon.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "highNoon",
                    team: d[base + IDX_TEAM],
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 0.8,
                    fz: d[base + IDX_Z],
                    tx: tx,
                    ty: ty + 0.8,
                    tz: tz,
                });
            }
            // Skill 2: Smoke Bomb — targeted stealth + damage reduction
            else if (target >= 0 && d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 15;
                d[base + IDX_EFFECT_STATE] =
                    1000 + GUNSLINGER_SKILLS.smokeBomb.stealthTicks;
                d[base + IDX_SKILL2_CD] = GUNSLINGER_SKILLS.smokeBomb.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "smokeBomb",
                    team: d[base + IDX_TEAM],
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y] + 0.5,
                    z: d[base + IDX_Z],
                });
            }
            // Skill 3: Fan Fire — AoE cone, 3 hits per enemy
            else if (d[base + IDX_SKILL3_CD] === 0 && dist <= myRange && target >= 0) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                const myTeam = d[base + IDX_TEAM];
                const targetX = d[tBase + IDX_X];
                const targetZ = d[tBase + IDX_Z];
                const radiusSq =
                    GUNSLINGER_SKILLS.fanFire.radius *
                    GUNSLINGER_SKILLS.fanFire.radius;

                const tCol = Math.floor((targetX - BOUND_X_MIN) / cellSize);
                const tRow = Math.floor((targetZ - BOUND_Z_MIN) / cellSize);

                for (let r = tRow - 1; r <= tRow + 1; r++) {
                    if (r < 0 || r >= gridRows) continue;
                    for (let c = tCol - 1; c <= tCol + 1; c++) {
                        if (c < 0 || c >= gridCols) continue;
                        const cellIdx = r * gridCols + c;
                        let curr = gridHead[cellIdx];
                        while (curr !== -1) {
                            const jBase = curr * STRIDE;
                            if (
                                d[jBase + IDX_HP] > 0 &&
                                d[jBase + IDX_TEAM] !== myTeam
                            ) {
                                const jdx = d[jBase + IDX_X] - targetX;
                                const jdz = d[jBase + IDX_Z] - targetZ;
                                const jdist = jdx * jdx + jdz * jdz;
                                if (jdist <= radiusSq) {
                                    for (
                                        let h = 0;
                                        h < GUNSLINGER_SKILLS.fanFire.hits;
                                        h++
                                    ) {
                                        queueDamage(
                                            curr,
                                            GUNSLINGER_SKILLS.fanFire.damage,
                                            15 + h * 8,
                                            i,
                                        );
                                    }
                                }
                            }
                            curr = gridNext[curr];
                        }
                    }
                }
                d[base + IDX_SKILL3_CD] = GUNSLINGER_SKILLS.fanFire.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "fanFire",
                    team: d[base + IDX_TEAM],
                    x: targetX,
                    z: targetZ,
                });
            }
        } else if (uType === TYPE_ASSASSIN) {
            // Skill 1: Shadow Step — teleport behind target
            if (d[base + IDX_SKILL1_CD] === 0 && dist <= 8.0) {
                d[base + IDX_ANIM] = 1;
                animLockTicks[i] = 10;
                const behindX =
                    tx -
                    (dx / dist) * ASSASSIN_SKILLS.shadowStep.teleportRange;
                const behindZ =
                    tz -
                    (dz / dist) * ASSASSIN_SKILLS.shadowStep.teleportRange;
                const fromX = d[base + IDX_X];
                const fromY = d[base + IDX_Y];
                const fromZ = d[base + IDX_Z];
                d[base + IDX_X] = behindX;
                d[base + IDX_Z] = behindZ;
                d[base + IDX_Y] = getTerrainHeight(behindX, behindZ);
                d[base + IDX_SKILL1_CD] = ASSASSIN_SKILLS.shadowStep.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "shadowStep",
                    fx: fromX,
                    fy: fromY,
                    fz: fromZ,
                    tx: behindX,
                    ty: d[base + IDX_Y],
                    tz: behindZ,
                });
            }
            // Skill 2: Backstab — bonus damage if behind target
            else if (target >= 0 && d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                // Check if attacking from behind (dot product of facing directions)
                // Simplified: if assassin is close enough, considered behind target
                const isBackstab = dist < 2.0;
                let dmg = isBackstab
                    ? ASSASSIN_SKILLS.backstab.damageBack
                    : ASSASSIN_SKILLS.backstab.damageFront;
                const isAttackerStealthed =
                    d[base + IDX_EFFECT_STATE] >= 1000 &&
                    d[base + IDX_EFFECT_STATE] < 2000;
                if (isAttackerStealthed) {
                    dmg = Math.round(baseDamage * 1.5); // Balanced 1.5x base damage on stealth break
                    d[base + IDX_EFFECT_STATE] = 0; // break stealth
                }
                queueDamage(target, dmg, 10, i);
                d[base + IDX_SKILL2_CD] = ASSASSIN_SKILLS.backstab.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "backstab",
                    team: d[base + IDX_TEAM],
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 0.8,
                    fz: d[base + IDX_Z],
                    tx: tx,
                    ty: ty + 0.8,
                    tz: tz,
                });
            }
            // Skill 3: Poison Blade — DoT + initial damage
            else if (target >= 0 && d[base + IDX_SKILL3_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                let dmg = ASSASSIN_SKILLS.poisonBlade.damagePerTick;
                const isAttackerStealthed =
                    d[base + IDX_EFFECT_STATE] >= 1000 &&
                    d[base + IDX_EFFECT_STATE] < 2000;
                if (isAttackerStealthed) {
                    dmg = Math.round(baseDamage * 1.5); // Balanced 1.5x base damage on stealth break
                    d[base + IDX_EFFECT_STATE] = 0; // break stealth
                }
                queueDamage(target, dmg, 10, i);
                // Apply poison effect: base 2000 + duration ticks
                if (target >= 0) {
                    d[tBase + IDX_EFFECT_STATE] =
                        2000 + ASSASSIN_SKILLS.poisonBlade.durationTicks;
                }
                d[base + IDX_SKILL3_CD] = ASSASSIN_SKILLS.poisonBlade.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "poisonBlade",
                    team: d[base + IDX_TEAM],
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 0.8,
                    fz: d[base + IDX_Z],
                    tx: tx,
                    ty: ty + 0.8,
                    tz: tz,
                });
            }
        } else if (uType === TYPE_HEALER) {
            const isTargetAlly = target >= 0 && d[tBase + IDX_TEAM] === d[base + IDX_TEAM];

            if (isTargetAlly) {
                const targetHp = d[tBase + IDX_HP];
                const targetMaxHp = d[tBase + IDX_MAX_HP];
                const needsHealing = targetHp < targetMaxHp;

                if (needsHealing && d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                    d[base + IDX_ANIM] = 2;
                    animLockTicks[i] = 20;

                    applyHeal(
                        d,
                        target,
                        HEALER_SKILLS.rejuvenation.healAmount,
                        i,
                    );

                    d[base + IDX_SKILL1_CD] =
                        HEALER_SKILLS.rejuvenation.cooldown;
                    skillActivated = true;

                    skillFXBatch.push({
                        type: "skillFX",
                        skill: "rejuvenation",
                        fx: d[base + IDX_X],
                        fy: d[base + IDX_Y] + 0.8,
                        fz: d[base + IDX_Z],
                        tx: tx,
                        ty: ty + 0.8,
                        tz: tz,
                    });
                } else if (needsHealing && d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
                    d[base + IDX_ANIM] = 2;
                    animLockTicks[i] = 20;

                    d[tBase + IDX_EFFECT_STATE] =
                        -HEALER_SKILLS.divineShield.durationTicks;

                    d[base + IDX_SKILL2_CD] =
                        HEALER_SKILLS.divineShield.cooldown;
                    skillActivated = true;

                    skillFXBatch.push({
                        type: "skillFX",
                        skill: "divineShield",
                        fx: d[base + IDX_X],
                        fy: d[base + IDX_Y] + 0.8,
                        fz: d[base + IDX_Z],
                        tx: tx,
                        ty: ty + 0.8,
                        tz: tz,
                    });
                }
                // Skill 3: Holy Sanctuary — now fires from self-buff block above
            }
        }

        // --- MOVE & NORMAL ATTACK SYSTEM ---
        if (!skillActivated) {
            let sepX = 0;
            let sepZ = 0;

            // Separation query 3x3 cells (since separation radius is 0.95 and cellSize is 6.0)
            const myCol = Math.floor(
                (d[base + IDX_X] - BOUND_X_MIN) / cellSize,
            );
            const myRow = Math.floor(
                (d[base + IDX_Z] - BOUND_Z_MIN) / cellSize,
            );

            for (let r = myRow - 1; r <= myRow + 1; r++) {
                if (r < 0 || r >= gridRows) continue;
                for (let c = myCol - 1; c <= myCol + 1; c++) {
                    if (c < 0 || c >= gridCols) continue;
                    const cellIdx = r * gridCols + c;
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
                                    distSq <
                                        SEPARATION_RADIUS * SEPARATION_RADIUS &&
                                    distSq > 0.0001
                                ) {
                                    const distj = Math.sqrt(distSq);
                                    const force =
                                        (SEPARATION_RADIUS - distj) /
                                        SEPARATION_RADIUS;
                                    const softDist = distj + 0.1;
                                    sepX +=
                                        (dxj / softDist) *
                                        force *
                                        SEPARATION_STRENGTH;
                                    sepZ +=
                                        (dzj / softDist) *
                                        force *
                                        SEPARATION_STRENGTH;
                                }
                            }
                        }
                        curr = gridNext[curr];
                    }
                }
            }

            const sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
            const limitMax = Math.min(SEPARATION_MAX, mySpeed);
            if (sepMag > limitMax) {
                sepX = (sepX / sepMag) * limitMax;
                sepZ = (sepZ / sepMag) * limitMax;
            }

            let tx = 0;
            let ty = 0;
            let tz = 0;
            if (target === TARGET_TURRET) {
                const myTeam = d[base + IDX_TEAM];
                tx = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
                ty = 0;
                tz = TURRET_Z;
            } else if (target >= 0) {
                tx = d[tBase + IDX_X];
                ty = d[tBase + IDX_Y];
                tz = d[tBase + IDX_Z];
            }

            const isTargetAlly = target >= 0 && d[tBase + IDX_TEAM] === d[base + IDX_TEAM];

            if (uType === TYPE_HEALER) {
                // Cek jarak ke musuh terdekat (termasuk turret)
                let enemyTooClose = false;
                const nearestEnemy = findNearestEnemy(d, i);
                if (nearestEnemy !== -1) {
                    const eBase = nearestEnemy * STRIDE;
                    const edx = d[eBase + IDX_X] - d[base + IDX_X];
                    const edz = d[eBase + IDX_Z] - d[base + IDX_Z];
                    const edist = Math.sqrt(edx * edx + edz * edz);
                    if (edist < 15.0) {
                        enemyTooClose = true;
                    }
                }
                const myTeam = d[base + IDX_TEAM];
                const turretX = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
                const tdx = turretX - d[base + IDX_X];
                const tdz = TURRET_Z - d[base + IDX_Z];
                const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
                if (tdist < 25.0) {
                    enemyTooClose = true;
                }

                if (isTargetAlly) {
                    const tHp = d[tBase + IDX_HP];
                    const tMaxHp = d[tBase + IDX_MAX_HP];
                    const needsHeal = tHp > 0 && (tHp < tMaxHp * 0.98);

                    // Target is an injured ally — either heal or walk towards them
                    if (dist <= myRange) {
                        if (needsHeal && d[base + IDX_ATTACK_CD] === 0) {
                            d[base + IDX_ANIM] = 2; // heal animation
                            animLockTicks[i] = 20;
                            applyHeal(d, target, baseDamage, i);
                            d[base + IDX_ATTACK_CD] = attackInterval;
                            skillFXBatch.push({
                                type: "skillFX",
                                skill: "basicHeal",
                                fx: d[base + IDX_X],
                                fy: d[base + IDX_Y] + 0.8,
                                fz: d[base + IDX_Z],
                                tx: d[tBase + IDX_X],
                                ty: d[tBase + IDX_Y] + 0.8,
                                tz: d[tBase + IDX_Z],
                            });
                        } else if (animLockTicks[i] === 0) {
                            // Target is healthy or heal is on cooldown: escort target smoothly if not too close to enemy
                            const tAnim = d[tBase + IDX_ANIM];
                            if (dist < 2.0 || enemyTooClose) {
                                // Already close enough to target or enemy is too close: stop manual forward movement!
                                d[base + IDX_ANIM] = (tAnim === 1 && !enemyTooClose) ? 1 : 0;
                            } else {
                                d[base + IDX_ANIM] = 1;
                                const nx = dx / dist;
                                const nz = dz / dist;
                                d[base + IDX_X] += nx * mySpeed;
                                d[base + IDX_Z] += nz * mySpeed;
                            }
                        }
                    } else {
                        // Walk towards injured ally only if not too close to enemy!
                        if (enemyTooClose) {
                            if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 0; // stop and stay safe
                        } else {
                            if (animLockTicks[i] === 0) {
                                d[base + IDX_ANIM] = 1; // walk towards injured ally
                            }
                            const nx = dx / dist;
                            const nz = dz / dist;
                            d[base + IDX_X] += nx * mySpeed;
                            d[base + IDX_Z] += nz * mySpeed;
                        }
                    }
                } else {
                    // No injured ally — target is enemy/turret, march forward if safe!
                    if (target >= 0 && dist <= myRange) {
                        if (d[base + IDX_ATTACK_CD] === 0) {
                            d[base + IDX_ANIM] = 2;
                            animLockTicks[i] = 20;
                            queueDamage(target, baseDamage, 22, i);
                            d[base + IDX_ATTACK_CD] = attackInterval;
                            skillFXBatch.push({
                                type: "skillFX",
                                skill: "basicAttack",
                                uType: uType,
                                fx: d[base + IDX_X],
                                fy: d[base + IDX_Y] + 0.8,
                                fz: d[base + IDX_Z],
                                tx: tx,
                                ty: ty + 0.8,
                                tz: tz,
                            });
                        } else if (animLockTicks[i] === 0) {
                            d[base + IDX_ANIM] = 0; // idle at turret
                        }
                    } else {
                        if (enemyTooClose) {
                            if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 0; // stop and stay safe
                        } else {
                            if (animLockTicks[i] === 0) {
                                d[base + IDX_ANIM] = 1; // march forward
                            }
                            const nx = dx / dist;
                            const nz = dz / dist;
                            d[base + IDX_X] += nx * mySpeed;
                            d[base + IDX_Z] += nz * mySpeed;
                        }
                    }
                }
            } else {
                if (target >= 0 && dist <= myRange) {
                    if (d[base + IDX_ATTACK_CD] === 0) {
                        d[base + IDX_ANIM] = 2; // animasi serang
                        animLockTicks[i] = 20; // lock animation
                        const attackDelay =
                            uType === TYPE_TANK
                                ? 18
                                : uType === TYPE_ARCHER
                                  ? 15
                                  : uType === TYPE_ASSASSIN
                                    ? 8
                                    : uType === TYPE_GUNSLINGER
                                      ? 12
                                      : 22;

                        let dmg = baseDamage;
                        const isAttackerStealthed =
                            d[base + IDX_EFFECT_STATE] >= 1000 &&
                            d[base + IDX_EFFECT_STATE] < 2000;
                        if (uType === TYPE_ASSASSIN && isAttackerStealthed) {
                            dmg = Math.round(baseDamage * 1.5); // Balanced 1.5x base damage on stealth break
                            d[base + IDX_EFFECT_STATE] = 0; // break stealth
                        }
                        queueDamage(target, dmg, attackDelay, i);
                        d[base + IDX_ATTACK_CD] = attackInterval; // set cooldown normal attack
                        skillFXBatch.push({
                            type: "skillFX",
                            skill: "basicAttack",
                            uType: uType,
                            fx: d[base + IDX_X],
                            fy: d[base + IDX_Y] + 0.8,
                            fz: d[base + IDX_Z],
                            tx: tx,
                            ty: ty + 0.8,
                            tz: tz,
                        });
                    } else {
                        if (animLockTicks[i] === 0) {
                            d[base + IDX_ANIM] = 0; // idle menunggu cooldown attack
                        }
                    }
                } else {
                    if (animLockTicks[i] === 0) {
                        d[base + IDX_ANIM] = 1; // move
                    }
                    const nx = dx / dist;
                    const nz = dz / dist;
                    d[base + IDX_X] += nx * mySpeed;
                    d[base + IDX_Z] += nz * mySpeed;

                    // Assassin stealth when running to target
                    if (
                        uType === TYPE_ASSASSIN &&
                        d[base + IDX_EFFECT_STATE] < 1000
                    ) {
                        d[base + IDX_EFFECT_STATE] = 1000 + 150; // Stealth for 150 ticks
                    }
                }
            }

            d[base + IDX_X] += sepX;
            d[base + IDX_Z] += sepZ;
        }

        if (d[base + IDX_X] < BOUND_X_MIN) d[base + IDX_X] = BOUND_X_MIN;
        if (d[base + IDX_X] > BOUND_X_MAX) d[base + IDX_X] = BOUND_X_MAX;
        if (d[base + IDX_Z] < BOUND_Z_MIN) d[base + IDX_Z] = BOUND_Z_MIN;
        if (d[base + IDX_Z] > BOUND_Z_MAX) d[base + IDX_Z] = BOUND_Z_MAX;

        d[base + IDX_Y] = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
    }

    // Send batched skill FX events
    if (skillFXBatch.length > 0) {
        self.postMessage({ type: "skillFXBatch", events: skillFXBatch });
    }
}

// Helper to gather stats
function getStats(d: Float32Array) {
    const stats = {
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

    for (let i = startIndex; i < endIndex; i++) {
        const base = i * STRIDE;
        const uTypeRaw = d[base + IDX_TYPE];
        const uType = uTypeRaw % 6;
        const team = d[base + IDX_TEAM];

        const dealt = statsDamageDealt[i];
        const taken = statsDamageTaken[i];
        const kills = statsKills[i];
        const healed = statsHealDone[i];

        const teamStats = team === TEAM_A ? stats.teamA : stats.teamB;

        if (uType === TYPE_TANK) {
            teamStats.tankDealt += dealt;
            teamStats.tankTaken += taken;
            teamStats.tankKills += kills;
            teamStats.tankHealed += healed;
        } else if (uType === TYPE_ARCHER) {
            teamStats.archerDealt += dealt;
            teamStats.archerTaken += taken;
            teamStats.archerKills += kills;
            teamStats.archerHealed += healed;
        } else if (uType === TYPE_MAGE) {
            teamStats.mageDealt += dealt;
            teamStats.mageTaken += taken;
            teamStats.mageKills += kills;
            teamStats.mageHealed += healed;
        } else if (uType === TYPE_HEALER) {
            teamStats.healerDealt += dealt;
            teamStats.healerTaken += taken;
            teamStats.healerKills += kills;
            teamStats.healerHealed += healed;
        } else if (uType === TYPE_GUNSLINGER) {
            teamStats.gunslingerDealt += dealt;
            teamStats.gunslingerTaken += taken;
            teamStats.gunslingerKills += kills;
            teamStats.gunslingerHealed += healed;
        } else if (uType === TYPE_ASSASSIN) {
            teamStats.assassinDealt += dealt;
            teamStats.assassinTaken += taken;
            teamStats.assassinKills += kills;
            teamStats.assassinHealed += healed;
        }
    }
    return stats;
}

// --- Message handler ---
self.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === "init") {
        if (e.data.customClasses) {
            customClasses = e.data.customClasses;
        }
        if (e.data.teamAConfig) teamAConfig = e.data.teamAConfig;
        if (e.data.teamBConfig) teamBConfig = e.data.teamBConfig;
        buf = e.data.buffer;
        data = new Float32Array(buf!);
        int32Data = new Int32Array(buf!);
        battleTicks = 0;
        startIndex = e.data.startIndex ?? 0;
        endIndex = e.data.endIndex ?? UNIT_COUNT;

        statsDamageDealt.fill(0);
        statsDamageTaken.fill(0);
        statsKills.fill(0);
        statsHealDone.fill(0);
        initUnits(data, e.data.matchup || "mix");

        // Store workerId from init message (Option 1: Per-Worker State Tracking)
        workerId = e.data.workerId ?? -1;
        self.postMessage({ type: "ready", workerId });
    }

    if (type === "tick") {
        if (data) {
            const tStart = performance.now();
            tick(data);
            const tDuration = performance.now() - tStart;
            // Compute partial alive counts for this worker's range
            let aliveA = 0,
                aliveB = 0,
                aliveOrUnspawnedA = 0,
                aliveOrUnspawnedB = 0;
            for (let i = startIndex; i < endIndex; i++) {
                const base = i * STRIDE;
                const hp = data[base + IDX_HP];
                if (hp > 0 || hp === -999) {
                    if (data[base + IDX_TEAM] === TEAM_A) {
                        aliveOrUnspawnedA++;
                        if (hp > 0) aliveA++;
                    } else {
                        aliveOrUnspawnedB++;
                        if (hp > 0) aliveB++;
                    }
                }
            }
            // Send workerId along with tick_done (Option 1: Per-Worker State Tracking)
            self.postMessage({
                type: "tick_done",
                workerId,
                aliveA,
                aliveB,
                aliveOrUnspawnedA,
                aliveOrUnspawnedB,
                tickTimeMs: tDuration,
            });
        }
    }

    if (type === "get_stats") {
        if (data) {
            const stats = getStats(data);
            self.postMessage({ type: "stats", stats });
        }
    }

    if (type === "reset") {
        if (e.data.customClasses) {
            customClasses = e.data.customClasses;
        }
        if (e.data.teamAConfig) teamAConfig = e.data.teamAConfig;
        if (e.data.teamBConfig) teamBConfig = e.data.teamBConfig;
        battleTicks = 0;
        turretACd = 0;
        turretBCd = 0;
        delayedDamages.length = 0;
        animLockTicks.fill(0);
        statsDamageDealt.fill(0);
        statsDamageTaken.fill(0);
        statsKills.fill(0);
        statsHealDone.fill(0);
        if (data) initUnits(data, e.data.matchup || "mix");
        self.postMessage({ type: "ready" });
    }
};

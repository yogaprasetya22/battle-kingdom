/**
 * Battle Worker — berjalan di thread terpisah
 * Membaca & menulis SharedArrayBuffer yang berisi state semua unit
 *
 * ponytail: tidak ada class, tidak ada event system. Just a loop..plan/unit-archetypes.md
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
    TYPE_KNIGHT,
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
    ASSASSIN_SKILLS,
    SPAWN_INITIAL,
    SPAWN_PER_WAVE,
    SPAWN_WAVE_INTERVAL,
    SPAWN_INSIDE_OFFSET_X,
    SPAWN_INSIDE_SPREAD_Z,
} from "./config";

import {
    buildGrid,
    findNearestEnemy,
    findLowestHpAlly,
    findLowestHpEnemy,
} from "./systems/TargetingSystem";

import {
    applyDamage,
    updateDelayedDamages,
    getStats,
    resetCombatStats,
    skillFXBatch,
    clearSkillFXBatch,
    decrementTurretCds,
    setTurretACd,
    setTurretBCd,
    turretACd,
    turretBCd,
} from "./systems/CombatSystem";

import { updateTank } from "./logics/Tank/TankLogic";
import { updateArcher } from "./logics/Archer/ArcherLogic";
import { updateMage } from "./logics/Mage/MageLogic";
import { updateHealer } from "./logics/Healer/HealerLogic";
import { updateGunslinger } from "./logics/Gunslinger/GunslingerLogic";
import { updateAssassin } from "./logics/Assassin/AssassinLogic";
import { updateKnight } from "./logics/Knight/KnightLogic";

let buf: SharedArrayBuffer | ArrayBuffer | null = null;
let data: Float32Array | null = null;
let int32Data: Int32Array | null = null;
let battleTicks = 0;

let startIndex = 0;
let endIndex = UNIT_COUNT;

let workerId = -1;
let customClasses: number[] = [0, 1, 2, 3, 4, 5];

interface TeamComposition {
    tank: number;
    archer: number;
    mage: number;
    healer: number;
    gunslinger: number;
    assassin: number;
    knight: number;
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
    knight: 0,
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
    knight: 0,
    skel_tank: 0,
    skel_archer: 0,
    skel_mage: 0,
    skel_healer: 0,
    skel_gunslinger: 0,
    skel_assassin: 0,
};

const animLockTicks = new Int32Array(UNIT_COUNT);

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
        for (let j = 0; j < (config.knight ?? 0); j++) arr.push(TYPE_KNIGHT);
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
            unitType = localIdx % 6;
            const healerCount = Math.max(1, Math.round(TEAM_SIZE * 0.02));
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
            d[base + IDX_HP] = -1000;
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
        d[base + IDX_HP] = -999;
        d[base + IDX_TEAM] = team;
        d[base + IDX_ANIM] = 1;
        d[base + IDX_TARGET] = -1;

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

// --- Main tick ---
function tick(d: Float32Array) {
    battleTicks++;

    // 1. Build Spatial Grid
    buildGrid(d);

    // Clear and batch skill FX events
    clearSkillFXBatch();

    // --- TURRET SHOOTING ---
    decrementTurretCds();

    // Turret A (Tim A) shoots Team B
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
            setTurretACd(TURRET_ATTACK_INTERVAL);
        }
    } else {
        setTurretACd(0);
    }

    // Turret B (Tim B) shoots Team A
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
            setTurretBCd(TURRET_ATTACK_INTERVAL);
        }
    } else {
        setTurretBCd(0);
    }

    // Update delayed damages
    updateDelayedDamages(d, animLockTicks);

    // Decrement animation lock ticks
    for (let i = startIndex; i < endIndex; i++) {
        if (animLockTicks[i] > 0) animLockTicks[i]--;
    }

    let activeCountA = TEAM_SIZE;
    let activeCountB = TEAM_SIZE;
    if (currentMatchup === "custom_composition") {
        activeCountA =
            (teamAConfig.tank ?? 0) +
            (teamAConfig.knight ?? 0) +
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
            (teamBConfig.knight ?? 0) +
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

    // Spawn Team A
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

    // Spawn Team B
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

        if (d[base + IDX_HP] === -999) {
            continue;
        }

        if (d[base + IDX_HP] <= 0) {
            d[base + IDX_ANIM] = 3; // dead
            animLockTicks[i] = 0;
            if (d[base + IDX_HP] > -900) {
                d[base + IDX_HP] -= 1;
                if (d[base + IDX_HP] <= -180) {
                    d[base + IDX_HP] = -999;
                }
            }
            continue;
        }

        if (d[base + IDX_IMMUNE_CD] > 0) d[base + IDX_IMMUNE_CD]--;

        const effect = d[base + IDX_EFFECT_STATE];
        if (effect >= 2000) {
            d[base + IDX_EFFECT_STATE]--;
            applyDamage(d, i, ASSASSIN_SKILLS.poisonBlade.damagePerTick);
            if (d[base + IDX_EFFECT_STATE] < 2000)
                d[base + IDX_EFFECT_STATE] = 0;
        } else if (effect >= 1000) {
            d[base + IDX_EFFECT_STATE]--;
            if (d[base + IDX_EFFECT_STATE] < 1000)
                d[base + IDX_EFFECT_STATE] = 0;
        } else if (effect > 0) {
            d[base + IDX_EFFECT_STATE]--;
            d[base + IDX_ANIM] = 0; // stun
            animLockTicks[i] = 0;
            continue;
        } else if (effect < 0) {
            d[base + IDX_EFFECT_STATE]++;
        }

        if (d[base + IDX_SKILL1_CD] > 0) d[base + IDX_SKILL1_CD]--;
        if (d[base + IDX_SKILL2_CD] > 0) d[base + IDX_SKILL2_CD]--;
        if (d[base + IDX_SKILL3_CD] > 0) d[base + IDX_SKILL3_CD]--;
        if (d[base + IDX_ATTACK_CD] > 0) d[base + IDX_ATTACK_CD]--;

        const uTypeRaw = d[base + IDX_TYPE];
        const uType = uTypeRaw % 6;
        const myTeam = d[base + IDX_TEAM];
        const cachedTarget = Math.round(d[base + IDX_TARGET]);
        let target = cachedTarget;

        // Check if there are any active enemies on the field
        const enemyStart = myTeam === TEAM_A ? TEAM_SIZE : 0;
        const enemyEnd = myTeam === TEAM_A ? UNIT_COUNT : TEAM_SIZE;
        let anyEnemyAlive = false;
        for (let j = enemyStart; j < enemyEnd; j++) {
            if (d[j * STRIDE + IDX_HP] > 0) {
                anyEnemyAlive = true;
                break;
            }
        }

        let isTargetInvalid = false;
        if (!anyEnemyAlive) {
            // No enemies alive. Force target to turret and skip search/resets
            target = TARGET_TURRET;
            d[base + IDX_TARGET] = TARGET_TURRET;
            isTargetInvalid = false;
        } else {
            if (cachedTarget === -1) {
                isTargetInvalid = true;
            } else if (cachedTarget === TARGET_TURRET) {
                isTargetInvalid = false; // Turret is a valid fallback destination
            } else {
                isTargetInvalid = d[cachedTarget * STRIDE + IDX_HP] <= 0;
                if (!isTargetInvalid) {
                    const tEffect = d[cachedTarget * STRIDE + IDX_EFFECT_STATE];
                    if (tEffect >= 1000 && tEffect < 2000) {
                        isTargetInvalid = true; // Target is stealthed
                    }
                }
            }

            if (uType === TYPE_HEALER && cachedTarget >= 0) {
                const tHp = d[cachedTarget * STRIDE + IDX_HP];
                const tMaxHp = d[cachedTarget * STRIDE + IDX_MAX_HP];
                const hpPercent = tHp / tMaxHp;
                if (tHp > 0 && hpPercent < 0.98) {
                    target = cachedTarget;
                    d[base + IDX_TARGET] = target;
                    isTargetInvalid = false;
                } else {
                    isTargetInvalid = true;
                }
            }

            const searchInterval = uType === TYPE_HEALER ? 30 : 4;
            const shouldSearch = (battleTicks + i) % searchInterval === 0;

            if (isTargetInvalid || shouldSearch) {
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
                if (target === -1) {
                    target = TARGET_TURRET;
                }
                d[base + IDX_TARGET] = target;
            }
        }

        // Call the specific unit logic updates
        if (uTypeRaw === TYPE_KNIGHT) {
            updateKnight(d, i, target, animLockTicks);
        } else if (uType === TYPE_TANK) {
            updateTank(d, i, target, animLockTicks);
        } else if (uType === TYPE_ARCHER) {
            updateArcher(d, i, target, animLockTicks);
        } else if (uType === TYPE_MAGE) {
            updateMage(d, i, target, animLockTicks);
        } else if (uType === TYPE_HEALER) {
            updateHealer(d, i, target, animLockTicks);
        } else if (uType === TYPE_GUNSLINGER) {
            updateGunslinger(d, i, target, animLockTicks);
        } else if (uType === TYPE_ASSASSIN) {
            updateAssassin(d, i, target, animLockTicks);
        }
    }

    // Send batched skill FX events
    if (skillFXBatch.length > 0) {
        self.postMessage({ type: "skillFXBatch", events: skillFXBatch });
    }
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

        resetCombatStats();
        initUnits(data, e.data.matchup || "mix");

        workerId = e.data.workerId ?? -1;
        self.postMessage({ type: "ready", workerId });
    }

    if (type === "tick") {
        if (data) {
            const tStart = performance.now();
            tick(data);
            const tDuration = performance.now() - tStart;
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
            const stats = getStats(data, startIndex, endIndex);
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
        animLockTicks.fill(0);
        resetCombatStats();
        if (data) initUnits(data, e.data.matchup || "mix");
        self.postMessage({ type: "ready" });
    }
};

/**
 * Battle Worker — berjalan di thread terpisah
 * Membaca & menulis SharedArrayBuffer yang berisi state semua unit
 *
 * ponytail: tidak ada class, tidak ada event system. Just a loop.
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
    TEAM_A,
    TEAM_B,
    TEAM_SIZE,
    SPAWN_A_X,
    SPAWN_B_X,
    SPAWN_SPREAD,
    getTerrainHeight,
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

let buf: SharedArrayBuffer | null = null;
let data: Float32Array | null = null;
let running = false;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let battleTicks = 0;

// --- Spawn ---
function initUnits(d: Float32Array, matchup: string = "mix") {
    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const team = i < TEAM_SIZE ? TEAM_A : TEAM_B;
        const localIdx = i < TEAM_SIZE ? i : i - TEAM_SIZE;
        const row = Math.floor(localIdx / 10);
        const col = localIdx % 10;

        // Tentukan kategori unit berdasarkan matchup
        let unitType = localIdx % 4; // 0=Tank, 1=Archer, 2=Mage, 3=Healer
        if (matchup === "mage_vs_tank") {
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

// --- Find nearest enemy ---
// ponytail: search only the enemy-team slice (half the array) — O(N/2) not O(N)
function findNearestEnemy(d: Float32Array, i: number): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];
    let minDist = Infinity;
    let target = -1;

    // Enemy team occupies the other half of the array — no need to scan own team
    const jStart = myTeam === TEAM_A ? TEAM_SIZE : 0;
    const jEnd   = myTeam === TEAM_A ? UNIT_COUNT : TEAM_SIZE;

    for (let j = jStart; j < jEnd; j++) {
        const jBase = j * STRIDE;
        if (d[jBase + IDX_HP] <= 0) continue;
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

// --- Find lowest HP percent ally ---
function findLowestHpAlly(d: Float32Array, i: number): number {
    const base = i * STRIDE;
    const myTeam = d[base + IDX_TEAM];
    let lowestHpPercent = 1.0;
    let target = -1;

    // Scan allies (same team slice)
    const jStart = myTeam === TEAM_A ? 0 : TEAM_SIZE;
    const jEnd   = myTeam === TEAM_A ? TEAM_SIZE : UNIT_COUNT;

    for (let j = jStart; j < jEnd; j++) {
        if (j === i) continue; // don't heal self as target
        const jBase = j * STRIDE;
        const hp = d[jBase + IDX_HP];
        if (hp <= 0) continue;

        const maxHp = d[jBase + IDX_MAX_HP];
        const hpPercent = hp / maxHp;

        if (hpPercent < 0.95 && hpPercent < lowestHpPercent) {
            lowestHpPercent = hpPercent;
            target = j;
        }
    }
    return target;
}

// --- Hitung damage masuk setelah dikurangi Armor dan Buff ---
const statsDamageDealt = new Float32Array(UNIT_COUNT);
const statsDamageTaken = new Float32Array(UNIT_COUNT);
const statsKills = new Int32Array(UNIT_COUNT);
const statsHealDone = new Float32Array(UNIT_COUNT);

// --- Hitung damage masuk setelah dikurangi Armor dan Buff ---
function applyDamage(d: Float32Array, targetIdx: number, rawDamage: number, attackerIdx?: number) {
    const tBase = targetIdx * STRIDE;
    if (d[tBase + IDX_HP] <= 0) return;

    // Cek imunitas — jika sedang imun, abaikan seluruh damage
    if (d[tBase + IDX_IMMUNE_CD] > 0) return;

    const tType = d[tBase + IDX_TYPE];
    const tEffect = d[tBase + IDX_EFFECT_STATE];

    const armorReduction = ARMOR[tType] ?? 0;
    let damageMultiplier = 1.0 - armorReduction;

    // Jika memiliki Buff Pertahanan Aktif (effectState < 0), kurangi damage tambahan
    if (tEffect < 0) {
        damageMultiplier *= DEFENSE_BUFF_MULTIPLIER;
    }

    const finalDamage = Math.max(1, Math.round(rawDamage * damageMultiplier));
    const oldHp = d[tBase + IDX_HP];
    const newHp = Math.max(0, oldHp - finalDamage);
    d[tBase + IDX_HP] = newHp;

    // Catat statistik pertempuran
    statsDamageTaken[targetIdx] += finalDamage;
    if (attackerIdx !== undefined && attackerIdx >= 0) {
        statsDamageDealt[attackerIdx] += finalDamage;
    }

    // Cek kematian unit dan catat kill
    if (newHp <= 0) {
        d[tBase + IDX_ANIM] = 3; // animasi mati
        if (attackerIdx !== undefined && attackerIdx >= 0) {
            statsKills[attackerIdx] += 1;
        }
    }
}

interface DelayedDamage {
    targetIdx: number;
    attackerIdx?: number;
    damage: number;
    ticksLeft: number;
    effectTicks?: number;
}
const delayedDamages: DelayedDamage[] = [];

function queueDamage(targetIdx: number, damage: number, delayTicks: number, attackerIdx?: number, effectTicks?: number) {
    delayedDamages.push({ targetIdx, attackerIdx, damage, ticksLeft: delayTicks, effectTicks });
}

const animLockTicks = new Int32Array(UNIT_COUNT);

// --- Main tick ---
function tick(d: Float32Array) {
    battleTicks++;

    // Update delayed damages
    for (let i = delayedDamages.length - 1; i >= 0; i--) {
        const dd = delayedDamages[i];
        dd.ticksLeft--;
        if (dd.ticksLeft <= 0) {
            applyDamage(d, dd.targetIdx, dd.damage, dd.attackerIdx);
            if (dd.effectTicks) {
                const tBase = dd.targetIdx * STRIDE;
                if (d[tBase + IDX_HP] > 0) {
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
    for (let i = 0; i < UNIT_COUNT; i++) {
        if (animLockTicks[i] > 0) animLockTicks[i]--;
    }

    const unitsToSpawn =
        SPAWN_INITIAL +
        Math.floor(battleTicks / SPAWN_WAVE_INTERVAL) * SPAWN_PER_WAVE;

    // Spawn Team A
    const maxSpawnA = Math.min(TEAM_SIZE, unitsToSpawn);
    for (let i = 0; i < maxSpawnA; i++) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] === -999) {
            d[base + IDX_HP] = d[base + IDX_MAX_HP];
            // Reset posisi ke dalam Kastil A (di belakang gerbang) saat spawn agar tidak terlihat muncul tiba-tiba
            d[base + IDX_X] = SPAWN_A_X - SPAWN_INSIDE_OFFSET_X;
            d[base + IDX_Z] = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;
            d[base + IDX_Y] = getTerrainHeight(
                d[base + IDX_X],
                d[base + IDX_Z],
            );
        }
    }

    // Spawn Team B
    const maxSpawnB = Math.min(TEAM_SIZE, unitsToSpawn);
    for (let i = 0; i < maxSpawnB; i++) {
        const base = (TEAM_SIZE + i) * STRIDE;
        if (d[base + IDX_HP] === -999) {
            d[base + IDX_HP] = d[base + IDX_MAX_HP];
            // Reset posisi ke dalam Kastil B (di belakang gerbang) saat spawn agar tidak terlihat muncul tiba-tiba
            d[base + IDX_X] = SPAWN_B_X + SPAWN_INSIDE_OFFSET_X;
            d[base + IDX_Z] = (Math.random() - 0.5) * 2 * SPAWN_INSIDE_SPREAD_Z;
            d[base + IDX_Y] = getTerrainHeight(
                d[base + IDX_X],
                d[base + IDX_Z],
            );
        }
    }

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;

        // Jika belum di-spawn, lewati tick ini
        if (d[base + IDX_HP] === -999) {
            continue;
        }

        if (d[base + IDX_HP] <= 0) {
            d[base + IDX_ANIM] = 3; // dead
            animLockTicks[i] = 0;
            continue;
        }

        // Tick down imunitas
        if (d[base + IDX_IMMUNE_CD] > 0) d[base + IDX_IMMUNE_CD]--;

        // --- EFFECT STATE (Stun / Buff Cooldown) ---
        const effect = d[base + IDX_EFFECT_STATE];
        if (effect > 0) {
            // Unit sedang beku/stunned. Kurangi tick stun, paksa animasi idle, batalkan gerak/aksi
            d[base + IDX_EFFECT_STATE]--;
            d[base + IDX_ANIM] = 0; // idle/stunned
            animLockTicks[i] = 0;
            continue;
        } else if (effect < 0) {
            // Unit memiliki buff aktif. Kurangi durasi buff (bergerak mendekati 0)
            d[base + IDX_EFFECT_STATE]++;
        }

        // Kurangi cooldown skill & normal attack (ticks)
        if (d[base + IDX_SKILL1_CD] > 0) d[base + IDX_SKILL1_CD]--;
        if (d[base + IDX_SKILL2_CD] > 0) d[base + IDX_SKILL2_CD]--;
        if (d[base + IDX_SKILL3_CD] > 0) d[base + IDX_SKILL3_CD]--;
        if (d[base + IDX_ATTACK_CD] > 0) d[base + IDX_ATTACK_CD]--;

        const uType = d[base + IDX_TYPE];
        // ponytail: target caching — re-search only every 4 ticks (75% fewer O(N/2) scans)
        const cachedTarget = d[base + IDX_TARGET];
        let target: number;
        if (
            cachedTarget >= 0 &&
            battleTicks % 4 !== (i & 3) &&
            d[cachedTarget * STRIDE + IDX_HP] > 0
        ) {
            target = cachedTarget; // keep existing target
        } else {
            if (uType === TYPE_HEALER) {
                target = findLowestHpAlly(d, i);
                if (target === -1) {
                    target = findNearestEnemy(d, i);
                }
            } else {
                target = findNearestEnemy(d, i);
            }
            d[base + IDX_TARGET] = target;
        }

        if (target === -1) {
            if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 0; // idle
            }
            continue;
        }

        // uType already declared above
        const attr = ATTRIBUTES[uType] ?? DEFAULT_ATTRIBUTES;
        const mySpeed = attr.moveSpeed;
        const myRange = attr.attackRange;
        const baseDamage = attr.baseDamage;
        const attackInterval = attr.attackInterval;

        const tBase = target * STRIDE;
        const dx = d[tBase + IDX_X] - d[base + IDX_X];
        const dz = d[tBase + IDX_Z] - d[base + IDX_Z];
        const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;

        // --- SKILL SYSTEM (Unique skills per class) ---
        let skillActivated = false;

        if (uType === TYPE_TANK) {
            // Skill 1: Bulwark Stance — IMUN total (hanya aktif saat bertarung/musuh dekat)
            if (d[base + IDX_SKILL1_CD] === 0 && dist <= 6.0) {
                d[base + IDX_IMMUNE_CD] = TANK_SKILLS.bulwarkStance.immuneTicks;
                d[base + IDX_SKILL1_CD] = TANK_SKILLS.bulwarkStance.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "ironFortitude",
                    team: d[base + IDX_TEAM],
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y],
                    z: d[base + IDX_Z],
                });
            }
            // Skill 2: Taunt
            else if (
                d[base + IDX_SKILL2_CD] === 0 &&
                dist <= TANK_SKILLS.taunt.range
            ) {
                d[tBase + IDX_TARGET] = i;
                d[base + IDX_SKILL2_CD] = TANK_SKILLS.taunt.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "taunt",
                    team: d[base + IDX_TEAM],
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y],
                    z: d[base + IDX_Z],
                    tx: d[tBase + IDX_X],
                    ty: d[tBase + IDX_Y],
                    tz: d[tBase + IDX_Z],
                });
            }
            // Skill 3: Shield Bash
            else if (
                d[base + IDX_SKILL3_CD] === 0 &&
                dist <= TANK_SKILLS.shieldBash.range
            ) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                queueDamage(target, TANK_SKILLS.shieldBash.damage, 15, i);
                d[tBase + IDX_X] +=
                    (dx / dist) * TANK_SKILLS.shieldBash.knockback;
                d[tBase + IDX_Z] +=
                    (dz / dist) * TANK_SKILLS.shieldBash.knockback;
                d[base + IDX_SKILL3_CD] = TANK_SKILLS.shieldBash.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "shieldBash",
                    team: d[base + IDX_TEAM],
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y],
                    z: d[base + IDX_Z],
                    tx: d[tBase + IDX_X],
                    ty: d[tBase + IDX_Y],
                    tz: d[tBase + IDX_Z],
                });
            }
        } else if (uType === TYPE_ARCHER) {
            // Skill 1: Double Shot
            if (d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                queueDamage(target, ARCHER_SKILLS.doubleShot.damage, 18, i);
                d[base + IDX_SKILL1_CD] = ARCHER_SKILLS.doubleShot.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "doubleShot",
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 0.8,
                    fz: d[base + IDX_Z],
                    tx: d[tBase + IDX_X],
                    ty: d[tBase + IDX_Y] + 0.8,
                    tz: d[tBase + IDX_Z],
                });
            }
            // Skill 2: Evasive Leap
            else if (
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
                self.postMessage({
                    type: "skillFX",
                    skill: "evasiveLeap",
                    fx: fromX,
                    fy: fromY,
                    fz: fromZ,
                    tx: d[base + IDX_X],
                    ty: toY,
                    tz: d[base + IDX_Z],
                });
            }
            // Skill 3: Arrow Volley
            else if (d[base + IDX_SKILL3_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const targetX = d[tBase + IDX_X];
                const targetZ = d[tBase + IDX_Z];
                const myTeam = d[base + IDX_TEAM];

                for (let j = 0; j < UNIT_COUNT; j++) {
                    const jBase = j * STRIDE;
                    if (
                        d[jBase + IDX_HP] <= 0 ||
                        d[jBase + IDX_TEAM] === myTeam
                    )
                        continue;
                    const jx = d[jBase + IDX_X];
                    const jz = d[jBase + IDX_Z];
                    const jdx = jx - targetX;
                    const jdz = jz - targetZ;
                    const jdist = jdx * jdx + jdz * jdz;
                    if (
                        jdist <=
                        ARCHER_SKILLS.arrowVolley.radius *
                            ARCHER_SKILLS.arrowVolley.radius
                    ) {
                        queueDamage(j, ARCHER_SKILLS.arrowVolley.damage, 25, i);
                    }
                }
                d[base + IDX_SKILL3_CD] = ARCHER_SKILLS.arrowVolley.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "arrowVolley",
                    team: d[base + IDX_TEAM],
                    x: targetX,
                    z: targetZ,
                });
            }
        } else if (uType === TYPE_MAGE) {
            // Skill 1: Frost Nova — AoE kecil, stun semua musuh dalam radius
            if (d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const novaX = d[tBase + IDX_X];
                const novaZ = d[tBase + IDX_Z];
                const novaRadiusSq = MAGE_SKILLS.frostNova.radius * MAGE_SKILLS.frostNova.radius;
                const myTeamNova = d[base + IDX_TEAM];
                // AoE: kena maksimal 3 musuh terdekat dalam radius di sekitar target
                const candidates: { index: number; distSq: number }[] = [];
                for (let j = 0; j < UNIT_COUNT; j++) {
                    const jBase = j * STRIDE;
                    if (d[jBase + IDX_HP] <= 0 || d[jBase + IDX_TEAM] === myTeamNova) continue;
                    const jdx = d[jBase + IDX_X] - novaX;
                    const jdz = d[jBase + IDX_Z] - novaZ;
                    const distSq = jdx * jdx + jdz * jdz;
                    if (distSq <= novaRadiusSq) {
                        candidates.push({ index: j, distSq });
                    }
                }
                candidates.sort((a, b) => a.distSq - b.distSq);
                const limit = Math.min(3, candidates.length);
                for (let c = 0; c < limit; c++) {
                    queueDamage(candidates[c].index, MAGE_SKILLS.frostNova.damage, 12, i, MAGE_SKILLS.frostNova.stunTicks);
                }
                d[base + IDX_SKILL1_CD] = MAGE_SKILLS.frostNova.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "frostNova",
                    x: novaX,
                    y: d[tBase + IDX_Y],
                    z: novaZ,
                });
            }
            // Skill 2: Chain Lightning — bounce 4 target
            else if (d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
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

                queueDamage(target, MAGE_SKILLS.chainLightning.damagePrimary, 12, i);
                chainCount++;

                let lastX = d[tBase + IDX_X];
                let lastZ = d[tBase + IDX_Z];
                const hitSet = new Set<number>([target]);
                const chainRadiusSq =
                    MAGE_SKILLS.chainLightning.chainRadius *
                    MAGE_SKILLS.chainLightning.chainRadius;

                while (chainCount < MAGE_SKILLS.chainLightning.maxChains) {
                    let nextTarget = -1;
                    let nextMinDist = Infinity;
                    for (let j = 0; j < UNIT_COUNT; j++) {
                        const jBase = j * STRIDE;
                        if (
                            d[jBase + IDX_HP] <= 0 ||
                            d[jBase + IDX_TEAM] === myTeam ||
                            hitSet.has(j)
                        )
                            continue;
                        const jdx = d[jBase + IDX_X] - lastX;
                        const jdz = d[jBase + IDX_Z] - lastZ;
                        const jdist = jdx * jdx + jdz * jdz;
                        if (jdist < nextMinDist && jdist <= chainRadiusSq) {
                            nextMinDist = jdist;
                            nextTarget = j;
                        }
                    }

                    if (nextTarget !== -1) {
                        queueDamage(
                            nextTarget,
                            MAGE_SKILLS.chainLightning.damageSecondary,
                            12 + chainCount * 8,
                            i
                        );
                        hitSet.add(nextTarget);
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
                self.postMessage({
                    type: "skillFX",
                    skill: "chainLightning",
                    team: d[base + IDX_TEAM],
                    positions: chainPositions,
                });
            }
            // Skill 3 (ULTI): Meteor Fireball — AoE besar, damage masif
            else if (d[base + IDX_SKILL3_CD] === 0 && dist <= myRange) {
                d[base + IDX_ANIM] = 2; // play attack animation
                animLockTicks[i] = 20; // lock animation
                const fbX = d[tBase + IDX_X];
                const fbZ = d[tBase + IDX_Z];
                const fbRadiusSq = MAGE_SKILLS.fireball.radius * MAGE_SKILLS.fireball.radius;
                const myTeamFb = d[base + IDX_TEAM];
                // Damage langsung ke target utama
                queueDamage(target, MAGE_SKILLS.fireball.damageDirect, 28, i);
                // Splash AoE ke maksimal 4 musuh terdekat di sekitar impact
                const splashCandidates: { index: number; distSq: number }[] = [];
                for (let j = 0; j < UNIT_COUNT; j++) {
                    if (j === target) continue;
                    const jBase = j * STRIDE;
                    if (d[jBase + IDX_HP] <= 0 || d[jBase + IDX_TEAM] === myTeamFb) continue;
                    const jdx = d[jBase + IDX_X] - fbX;
                    const jdz = d[jBase + IDX_Z] - fbZ;
                    const distSq = jdx * jdx + jdz * jdz;
                    if (distSq <= fbRadiusSq) {
                        splashCandidates.push({ index: j, distSq });
                    }
                }
                splashCandidates.sort((a, b) => a.distSq - b.distSq);
                const fbLimit = Math.min(4, splashCandidates.length);
                for (let c = 0; c < fbLimit; c++) {
                    queueDamage(splashCandidates[c].index, MAGE_SKILLS.fireball.damageSplash, 28, i);
                }
                d[base + IDX_SKILL3_CD] = MAGE_SKILLS.fireball.cooldown;
                skillActivated = true;
                self.postMessage({
                    type: "skillFX",
                    skill: "fireball",
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 1.0,
                    fz: d[base + IDX_Z],
                    tx: fbX,
                    ty: d[tBase + IDX_Y] + 1.0,
                    tz: fbZ,
                });
            }
        } else if (uType === TYPE_HEALER) {
            const isTargetAlly = d[tBase + IDX_TEAM] === d[base + IDX_TEAM];

            // Healer can only cast skills on allies!
            if (isTargetAlly) {
                // Skill 1: Rejuvenation — Single target heal
                if (d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
                    d[base + IDX_ANIM] = 2;
                    animLockTicks[i] = 20;

                    const maxTargetHp = d[tBase + IDX_MAX_HP];
                    const targetHp = d[tBase + IDX_HP];
                    const healAmount = Math.min(maxTargetHp - targetHp, HEALER_SKILLS.rejuvenation.healAmount);
                    d[tBase + IDX_HP] = targetHp + healAmount;
                    statsHealDone[i] += healAmount;

                    d[base + IDX_SKILL1_CD] = HEALER_SKILLS.rejuvenation.cooldown;
                    skillActivated = true;

                    self.postMessage({
                        type: "skillFX",
                        skill: "rejuvenation",
                        fx: d[base + IDX_X],
                        fy: d[base + IDX_Y] + 0.8,
                        fz: d[base + IDX_Z],
                        tx: d[tBase + IDX_X],
                        ty: d[tBase + IDX_Y] + 0.8,
                        tz: d[tBase + IDX_Z],
                    });
                }
                // Skill 2: Divine Shield — Buff pertahanan (effectState < 0)
                else if (d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
                    d[base + IDX_ANIM] = 2;
                    animLockTicks[i] = 20;

                    // Apply defense shield buff (negative value)
                    d[tBase + IDX_EFFECT_STATE] = -HEALER_SKILLS.divineShield.durationTicks;

                    d[base + IDX_SKILL2_CD] = HEALER_SKILLS.divineShield.cooldown;
                    skillActivated = true;

                    self.postMessage({
                        type: "skillFX",
                        skill: "divineShield",
                        fx: d[base + IDX_X],
                        fy: d[base + IDX_Y] + 0.8,
                        fz: d[base + IDX_Z],
                        tx: d[tBase + IDX_X],
                        ty: d[tBase + IDX_Y] + 0.8,
                        tz: d[tBase + IDX_Z],
                    });
                }
                // Skill 3: Holy Sanctuary — AoE heal
                else if (d[base + IDX_SKILL3_CD] === 0) {
                    d[base + IDX_ANIM] = 2;
                    animLockTicks[i] = 20;

                    const myTeam = d[base + IDX_TEAM];
                    const rangeSq = HEALER_SKILLS.holySanctuary.radius * HEALER_SKILLS.holySanctuary.radius;
                    let healCount = 0;

                    for (let j = 0; j < UNIT_COUNT; j++) {
                        const jBase = j * STRIDE;
                        if (d[jBase + IDX_HP] <= 0 || d[jBase + IDX_TEAM] !== myTeam) continue;

                        const jdx = d[jBase + IDX_X] - d[base + IDX_X];
                        const jdz = d[jBase + IDX_Z] - d[base + IDX_Z];
                        const jdistSq = jdx * jdx + jdz * jdz;

                        if (jdistSq <= rangeSq) {
                            const jMaxHp = d[jBase + IDX_MAX_HP];
                            const jHp = d[jBase + IDX_HP];
                            const healAmount = Math.min(jMaxHp - jHp, HEALER_SKILLS.holySanctuary.healAmount);
                            d[jBase + IDX_HP] = jHp + healAmount;
                            statsHealDone[i] += healAmount;
                            healCount++;
                            if (healCount >= 5) break; // max 5 allies
                        }
                    }

                    d[base + IDX_SKILL3_CD] = HEALER_SKILLS.holySanctuary.cooldown;
                    skillActivated = true;

                    self.postMessage({
                        type: "skillFX",
                        skill: "holySanctuary",
                        x: d[base + IDX_X],
                        y: d[base + IDX_Y],
                        z: d[base + IDX_Z],
                    });
                }
            }
        }


        // --- MOVE & NORMAL ATTACK SYSTEM ---
        if (!skillActivated) {
            // Separation
            let sepX = 0;
            let sepZ = 0;

            for (let j = 0; j < UNIT_COUNT; j++) {
                if (j === i) continue;
                const jBase = j * STRIDE;
                const jHp = d[jBase + IDX_HP];
                if (jHp <= 0 || jHp < -10) continue;

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
                }
            }

            // Clamp separation magnitude
            const sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
            if (sepMag > SEPARATION_MAX) {
                sepX = (sepX / sepMag) * SEPARATION_MAX;
                sepZ = (sepZ / sepMag) * SEPARATION_MAX;
            }

            const isTargetAlly = d[tBase + IDX_TEAM] === d[base + IDX_TEAM];

            if (uType === TYPE_HEALER) {
                if (isTargetAlly) {
                    if (dist <= myRange) {
                        if (d[base + IDX_ATTACK_CD] === 0) {
                            d[base + IDX_ANIM] = 2; // heal animation
                            animLockTicks[i] = 20;
                            const targetMaxHp = d[tBase + IDX_MAX_HP];
                            const targetHp = d[tBase + IDX_HP];
                            const finalHeal = Math.min(targetMaxHp - targetHp, baseDamage);
                            d[tBase + IDX_HP] = targetHp + finalHeal;
                            statsHealDone[i] += finalHeal;
                            d[base + IDX_ATTACK_CD] = attackInterval;
                            self.postMessage({
                                type: "skillFX",
                                skill: "basicHeal",
                                fx: d[base + IDX_X],
                                fy: d[base + IDX_Y] + 0.8,
                                fz: d[base + IDX_Z],
                                tx: d[tBase + IDX_X],
                                ty: d[tBase + IDX_Y] + 0.8,
                                tz: d[tBase + IDX_Z],
                            });
                        } else {
                            if (animLockTicks[i] === 0) {
                                d[base + IDX_ANIM] = 0; // idle
                            }
                        }
                    } else {
                        // Move towards ally target
                        if (animLockTicks[i] === 0) {
                            d[base + IDX_ANIM] = 1; // move
                        }
                        const nx = dx / dist;
                        const nz = dz / dist;
                        d[base + IDX_X] += nx * mySpeed;
                        d[base + IDX_Z] += nz * mySpeed;
                    }
                } else {
                    // Pacifist: if targeted enemy is close, move backward to stay safe!
                    if (dist < 6.0) {
                        if (animLockTicks[i] === 0) {
                            d[base + IDX_ANIM] = 1; // move backward
                        }
                        const nx = dx / dist;
                        const nz = dz / dist;
                        d[base + IDX_X] -= nx * mySpeed;
                        d[base + IDX_Z] -= nz * mySpeed;
                    } else {
                        if (animLockTicks[i] === 0) {
                            d[base + IDX_ANIM] = 0; // idle
                        }
                    }
                }
            } else {
                // Non-healers (original logic)
                if (dist <= myRange) {
                    if (d[base + IDX_ATTACK_CD] === 0) {
                        d[base + IDX_ANIM] = 2; // animasi serang
                        animLockTicks[i] = 20; // lock animation
                        const attackDelay = uType === 0 ? 18 : (uType === 1 ? 15 : 22);
                        queueDamage(target, baseDamage, attackDelay, i);
                        d[base + IDX_ATTACK_CD] = attackInterval; // set cooldown normal attack
                        self.postMessage({
                            type: "skillFX",
                            skill: "basicAttack",
                            uType: uType,
                            fx: d[base + IDX_X],
                            fy: d[base + IDX_Y] + 0.8,
                            fz: d[base + IDX_Z],
                            tx: d[tBase + IDX_X],
                            ty: d[tBase + IDX_Y] + 0.8,
                            tz: d[tBase + IDX_Z],
                        });
                    } else {
                        if (animLockTicks[i] === 0) {
                            d[base + IDX_ANIM] = 0; // idle menunggu cooldown attack
                        }
                    }
                } else {
                    // Move toward target
                    if (animLockTicks[i] === 0) {
                        d[base + IDX_ANIM] = 1; // move
                    }
                    const nx = dx / dist;
                    const nz = dz / dist;
                    d[base + IDX_X] += nx * mySpeed;
                    d[base + IDX_Z] += nz * mySpeed;
                }
            }

            // Terapkan gaya pemisah
            d[base + IDX_X] += sepX;
            d[base + IDX_Z] += sepZ;
        }

        // Clamp to battlefield bounds
        if (d[base + IDX_X] < BOUND_X_MIN) d[base + IDX_X] = BOUND_X_MIN;
        if (d[base + IDX_X] > BOUND_X_MAX) d[base + IDX_X] = BOUND_X_MAX;
        if (d[base + IDX_Z] < BOUND_Z_MIN) d[base + IDX_Z] = BOUND_Z_MIN;
        if (d[base + IDX_Z] > BOUND_Z_MAX) d[base + IDX_Z] = BOUND_Z_MAX;

        // Sesuaikan posisi Y berdasarkan lekukan pegunungan
        d[base + IDX_Y] = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
    }

    // Report score to main thread
    let aliveOrUnspawnedA = 0;
    let aliveOrUnspawnedB = 0;
    let aliveA = 0;
    let aliveB = 0;

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const hp = d[base + IDX_HP];
        if (hp > 0 || hp === -999) {
            if (d[base + IDX_TEAM] === TEAM_A) {
                aliveOrUnspawnedA++;
                if (hp > 0) aliveA++;
            } else {
                aliveOrUnspawnedB++;
                if (hp > 0) aliveB++;
            }
        }
    }
    self.postMessage({ type: "score", aliveA, aliveB });

    if (aliveOrUnspawnedA === 0 || aliveOrUnspawnedB === 0) {
        running = false;
        if (tickInterval) clearInterval(tickInterval);

        // Agregasi statistik kelas unit untuk masing-masing tim
        const stats = {
            teamA: {
                tankDealt: 0, tankTaken: 0, tankKills: 0, tankHealed: 0,
                archerDealt: 0, archerTaken: 0, archerKills: 0, archerHealed: 0,
                mageDealt: 0, mageTaken: 0, mageKills: 0, mageHealed: 0,
                healerDealt: 0, healerTaken: 0, healerKills: 0, healerHealed: 0
            },
            teamB: {
                tankDealt: 0, tankTaken: 0, tankKills: 0, tankHealed: 0,
                archerDealt: 0, archerTaken: 0, archerKills: 0, archerHealed: 0,
                mageDealt: 0, mageTaken: 0, mageKills: 0, mageHealed: 0,
                healerDealt: 0, healerTaken: 0, healerKills: 0, healerHealed: 0
            }
        };

        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * STRIDE;
            const uType = d[base + IDX_TYPE];
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
            }
        }

        self.postMessage({
            type: "end",
            winner: aliveOrUnspawnedA > 0 ? "A" : "B",
            stats
        });
    }
}

// --- Message handler ---
self.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === "init") {
        buf = e.data.buffer as SharedArrayBuffer;
        data = new Float32Array(buf);
        battleTicks = 0;
        statsDamageDealt.fill(0);
        statsDamageTaken.fill(0);
        statsKills.fill(0);
        statsHealDone.fill(0);
        initUnits(data, e.data.matchup || "mix");
        self.postMessage({ type: "ready" });
    }

    if (type === "start") {
        if (!data || running) return;
        running = true;
        tickInterval = setInterval(() => {
            if (data && running) tick(data);
        }, 16);
    }

    if (type === "reset") {
        running = false;
        if (tickInterval) clearInterval(tickInterval);
        battleTicks = 0;
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

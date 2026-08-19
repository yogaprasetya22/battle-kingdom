import {
    UNIT_COUNT,
    STRIDE,
    IDX_HP,
    IDX_TEAM,
    IDX_TYPE,
    IDX_X,
    IDX_Y,
    IDX_Z,
    IDX_EFFECT_STATE,
    IDX_IMMUNE_CD,
    IDX_ANIM,
    IDX_MAX_HP,
    IDX_TARGET,
    TEAM_A,
    TEAM_B,
    TEAM_SIZE,
    TARGET_TURRET,
    HERO_UNIT_INDEX,
} from "../constants";

import {
    ARMOR,
    DEFENSE_BUFF_MULTIPLIER,
    ATTRIBUTES,
    DEFAULT_ATTRIBUTES,
    HERO_STATS,
} from "../config";

// Pre-allocated buffers for Atomics CAS float conversion
const _casF32 = new Float32Array(1);
const _casI32 = new Int32Array(_casF32.buffer);

export const statsDamageDealt = new Float32Array(UNIT_COUNT);
export const statsDamageTaken = new Float32Array(UNIT_COUNT);
export const statsKills = new Int32Array(UNIT_COUNT);
export const statsHealDone = new Float32Array(UNIT_COUNT);

export let skillFXBatch: any[] = [];

export interface DelayedDamage {
    targetIdx: number;
    attackerIdx?: number;
    damage: number;
    ticksLeft: number;
    effectTicks?: number;
}
export const delayedDamages: DelayedDamage[] = [];

// Turret attack cooldown per team (counts down each tick)
export let turretACd = 0;
export let turretBCd = 0;

export function decrementTurretCds() {
    if (turretACd > 0) turretACd--;
    if (turretBCd > 0) turretBCd--;
}

export function setTurretACd(val: number) {
    turretACd = val;
}

export function setTurretBCd(val: number) {
    turretBCd = val;
}

export function clearSkillFXBatch() {
    skillFXBatch = [];
}

export function resetCombatStats() {
    statsDamageDealt.fill(0);
    statsDamageTaken.fill(0);
    statsKills.fill(0);
    statsHealDone.fill(0);
    delayedDamages.length = 0;
    turretACd = 0;
    turretBCd = 0;
}

export function queueDamage(
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

export function applyDamage(
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

    // Cek imunitas
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

    if (tEffect < 0) {
        damageMultiplier *= DEFENSE_BUFF_MULTIPLIER;
    }

    let isCrit = false;
    let adjustedDamage = rawDamage;

    if (attackerIdx === TARGET_TURRET) {
        // Turret high critical hit: 50% chance for 2.0x damage
        if (Math.random() < 0.50) {
            isCrit = true;
            adjustedDamage = Math.round(rawDamage * 2.0);
        }
    } else if (attackerIdx !== undefined && attackerIdx >= 0) {
        const attackerType = d[attackerIdx * STRIDE + IDX_TYPE];
        const attr = ATTRIBUTES[attackerType] ?? DEFAULT_ATTRIBUTES;
        let critChance = attr.critChance;
        let critDamage = attr.critDamage;

        // If the attacker is the hero, grant a high crit rate from HERO_STATS config
        if (attackerIdx === HERO_UNIT_INDEX) {
            critChance = HERO_STATS.critChance;
            critDamage = HERO_STATS.critDamage;
        }

        if (Math.random() < critChance) {
            isCrit = true;
            adjustedDamage = Math.round(rawDamage * critDamage);
        }

        // Cap assassin critical/burst damage to maximum of 70,000
        if (attackerType === 5 || attackerType === 11) {
            if (isCrit && adjustedDamage > 70000) {
                adjustedDamage = 70000;
            } else if (!isCrit && adjustedDamage > 50000) {
                adjustedDamage = 50000;
            }
        }
    }

    const finalDamage = Math.max(1, Math.round(adjustedDamage * damageMultiplier));

    const hpIndex = tBase + IDX_HP;
    const int32 = new Int32Array(d.buffer);

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

    statsDamageTaken[targetIdx] += finalDamage;
    if (attackerIdx !== undefined && attackerIdx >= 0) {
        statsDamageDealt[attackerIdx] += finalDamage;
    }

    const isMagic = attackerIdx !== undefined && attackerIdx >= 0 && (d[attackerIdx * STRIDE + IDX_TYPE] % 6 === 2); // Mage
    const isTurret = attackerIdx === TARGET_TURRET;

    skillFXBatch.push({
        type: "skillFX",
        skill: "damage",
        value: finalDamage,
        position: [tx, ty, tz],
        isCrit,
        isMagic,
        isTurret,
    });

    if (newHp <= 0) {
        d[tBase + IDX_ANIM] = 3; // dead
        if (attackerIdx !== undefined && attackerIdx >= 0) {
            statsKills[attackerIdx] += 1;
        }
    }
}

export function applyHeal(
    d: Float32Array,
    targetIdx: number,
    healAmount: number,
    healerIdx?: number,
) {
    if (targetIdx < 0) return;
    const tBase = targetIdx * STRIDE;
    const hpIndex = tBase + IDX_HP;
    const int32 = new Int32Array(d.buffer);

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

export function updateDelayedDamages(d: Float32Array, animLockTicks: Int32Array) {
    const int32 = new Int32Array(d.buffer);
    for (let i = delayedDamages.length - 1; i >= 0; i--) {
        const dd = delayedDamages[i];
        dd.ticksLeft--;
        if (dd.ticksLeft <= 0) {
            applyDamage(d, dd.targetIdx, dd.damage, dd.attackerIdx);
            if (dd.effectTicks) {
                const tBase = dd.targetIdx * STRIDE;
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
}

export function getStats(d: Float32Array, startIndex: number, endIndex: number) {
    const stats = {
        teamA: {
            tankDealt: 0, tankTaken: 0, tankKills: 0, tankHealed: 0,
            archerDealt: 0, archerTaken: 0, archerKills: 0, archerHealed: 0,
            mageDealt: 0, mageTaken: 0, mageKills: 0, mageHealed: 0,
            healerDealt: 0, healerTaken: 0, healerKills: 0, healerHealed: 0,
            gunslingerDealt: 0, gunslingerTaken: 0, gunslingerKills: 0, gunslingerHealed: 0,
            assassinDealt: 0, assassinTaken: 0, assassinKills: 0, assassinHealed: 0,
            knightDealt: 0, knightTaken: 0, knightKills: 0, knightHealed: 0,
        },
        teamB: {
            tankDealt: 0, tankTaken: 0, tankKills: 0, tankHealed: 0,
            archerDealt: 0, archerTaken: 0, archerKills: 0, archerHealed: 0,
            mageDealt: 0, mageTaken: 0, mageKills: 0, mageHealed: 0,
            healerDealt: 0, healerTaken: 0, healerKills: 0, healerHealed: 0,
            gunslingerDealt: 0, gunslingerTaken: 0, gunslingerKills: 0, gunslingerHealed: 0,
            assassinDealt: 0, assassinTaken: 0, assassinKills: 0, assassinHealed: 0,
            knightDealt: 0, knightTaken: 0, knightKills: 0, knightHealed: 0,
        },
    };

    for (let i = startIndex; i < endIndex; i++) {
        const base = i * STRIDE;
        const uTypeRaw = d[base + IDX_TYPE];
        const uType = uTypeRaw % 6; // Or check full type for Knight (12)
        const team = d[base + IDX_TEAM];

        const dealt = statsDamageDealt[i];
        const taken = statsDamageTaken[i];
        const kills = statsKills[i];
        const healed = statsHealDone[i];

        const teamStats = team === TEAM_A ? stats.teamA : stats.teamB;

        if (uTypeRaw === 12) { // TYPE_KNIGHT
            teamStats.knightDealt += dealt;
            teamStats.knightTaken += taken;
            teamStats.knightKills += kills;
            teamStats.knightHealed += healed;
        } else if (uType === 0) { // TYPE_BARBARIAN / TANK
            teamStats.tankDealt += dealt;
            teamStats.tankTaken += taken;
            teamStats.tankKills += kills;
            teamStats.tankHealed += healed;
        } else if (uType === 1) { // TYPE_ARCHER
            teamStats.archerDealt += dealt;
            teamStats.archerTaken += taken;
            teamStats.archerKills += kills;
            teamStats.archerHealed += healed;
        } else if (uType === 2) { // TYPE_MAGE
            teamStats.mageDealt += dealt;
            teamStats.mageTaken += taken;
            teamStats.mageKills += kills;
            teamStats.mageHealed += healed;
        } else if (uType === 3) { // TYPE_HEALER
            teamStats.healerDealt += dealt;
            teamStats.healerTaken += taken;
            teamStats.healerKills += kills;
            teamStats.healerHealed += healed;
        } else if (uType === 4) { // TYPE_GUNSLINGER
            teamStats.gunslingerDealt += dealt;
            teamStats.gunslingerTaken += taken;
            teamStats.gunslingerKills += kills;
            teamStats.gunslingerHealed += healed;
        } else if (uType === 5) { // TYPE_ASSASSIN
            teamStats.assassinDealt += dealt;
            teamStats.assassinTaken += taken;
            teamStats.assassinKills += kills;
            teamStats.assassinHealed += healed;
        }
    }
    return stats;
}

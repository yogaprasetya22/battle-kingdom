import {
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
    IDX_ATTACK_CD,
    IDX_EFFECT_STATE,
    TARGET_TURRET,
    TURRET_A_X,
    TURRET_B_X,
    TURRET_Z,
    TEAM_A,
    TEAM_B,
    getTerrainHeight,
} from "../../constants";

import { ATTRIBUTES, DEFAULT_ATTRIBUTES, ASSASSIN_SKILLS } from "../../config";

import { queueDamage, skillFXBatch } from "../../systems/CombatSystem";

import {
    computeSeparation,
    clampAndHeighten,
    applySteering,
} from "../MovementHelper";

const tempSep = new Float32Array(2);

export function updateAssassin(
    d: Float32Array,
    i: number,
    target: number,
    animLockTicks: Int32Array,
    battleTicks: number,
) {
    const base = i * STRIDE;
    const uTypeRaw = d[base + IDX_TYPE];
    const attr = ATTRIBUTES[uTypeRaw] ?? DEFAULT_ATTRIBUTES;
    const mySpeed = attr.moveSpeed;
    const myRange = attr.attackRange;
    const baseDamage = attr.baseDamage;
    const attackInterval = attr.attackInterval;

    let skillActivated = false;

    // Stagger separation calculations (run every 2 ticks per unit, ponytail style)
    if ((battleTicks + i) % 2 === 0) {
        computeSeparation(d, i, mySpeed, tempSep);
    } else {
        tempSep[0] = 0;
        tempSep[1] = 0;
    }

    if (target === -1) {
        if (animLockTicks[i] === 0) {
            d[base + IDX_ANIM] = 0; // idle
        }
        d[base + IDX_X] += tempSep[0];
        d[base + IDX_Z] += tempSep[1];
        clampAndHeighten(d, i);
        return;
    }

    // --- TARGET_TURRET ---
    if (target === TARGET_TURRET) {
        const myTeam = d[base + IDX_TEAM];
        const turretX = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
        const dtx = turretX - d[base + IDX_X];
        const dtz = TURRET_Z - d[base + IDX_Z];
        const dtDistSq = dtx * dtx + dtz * dtz;
        const attackRangeSq = attr.attackRange * attr.attackRange;

        if (dtDistSq > attackRangeSq) {
            if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 1; // move
            const dtDist = Math.sqrt(dtDistSq) || 0.001;
            applySteering(d, i, dtx, dtz, dtDist, mySpeed, tempSep);
        } else {
            if (d[base + IDX_ATTACK_CD] === 0) {
                d[base + IDX_ANIM] = 2; // attack
                animLockTicks[i] = 15;
                d[base + IDX_ATTACK_CD] = attr.attackInterval;
                skillFXBatch.push({
                    type: "turretDamage",
                    team: myTeam === TEAM_A ? TEAM_B : TEAM_A,
                    damage: attr.baseDamage,
                });
            } else if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 0;
            }
            d[base + IDX_X] += tempSep[0];
            d[base + IDX_Z] += tempSep[1];
        }
        clampAndHeighten(d, i);
        return;
    }

    const tBase = target * STRIDE;
    const tx = d[tBase + IDX_X];
    const ty = d[tBase + IDX_Y];
    const tz = d[tBase + IDX_Z];

    const dx = tx - d[base + IDX_X];
    const dz = tz - d[base + IDX_Z];
    const distSq = dx * dx + dz * dz;

    // --- TARGETED SKILLS ---
    // Skill 1: Shadow Step
    const actRange = ASSASSIN_SKILLS.shadowStep.activationRange || 30.0;
    if (d[base + IDX_SKILL1_CD] === 0 && distSq <= actRange * actRange) {
        d[base + IDX_ANIM] = 1;
        animLockTicks[i] = 30; // Cast delay 30 ticks (blueprint)
        const dist = Math.sqrt(distSq) || 0.001;
        const behindX =
            tx - (dx / dist) * ASSASSIN_SKILLS.shadowStep.teleportRange;
        const behindZ =
            tz - (dz / dist) * ASSASSIN_SKILLS.shadowStep.teleportRange;
        const fromX = d[base + IDX_X];
        const fromY = d[base + IDX_Y];
        const fromZ = d[base + IDX_Z];
        d[base + IDX_X] = behindX;
        d[base + IDX_Z] = behindZ;
        const targetY = getTerrainHeight(behindX, behindZ);
        d[base + IDX_SKILL1_CD] = ASSASSIN_SKILLS.shadowStep.cooldown;
        skillActivated = true;
        skillFXBatch.push({
            type: "skillFX",
            skill: "shadowStep",
            fx: fromX,
            fy: fromY,
            fz: fromZ,
            tx: behindX,
            ty: targetY,
            tz: behindZ,
        });
    }
    // Skill 2: Backstab
    else if (d[base + IDX_SKILL2_CD] === 0 && distSq <= myRange * myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const isBackstab = distSq < 4.0;
        let dmg = isBackstab
            ? ASSASSIN_SKILLS.backstab.damageBack
            : ASSASSIN_SKILLS.backstab.damageFront;
        const isAttackerStealthed =
            d[base + IDX_EFFECT_STATE] >= 1000 &&
            d[base + IDX_EFFECT_STATE] < 2000;
        if (isAttackerStealthed) {
            dmg = Math.round(baseDamage * 1.5);
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
    // Skill 3: Poison Blade
    else if (d[base + IDX_SKILL3_CD] === 0 && distSq <= myRange * myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        let dmg = ASSASSIN_SKILLS.poisonBlade.damagePerTick;
        const isAttackerStealthed =
            d[base + IDX_EFFECT_STATE] >= 1000 &&
            d[base + IDX_EFFECT_STATE] < 2000;
        if (isAttackerStealthed) {
            dmg = Math.round(baseDamage * 1.5);
            d[base + IDX_EFFECT_STATE] = 0; // break stealth
        }
        queueDamage(target, dmg, 10, i);
        d[tBase + IDX_EFFECT_STATE] =
            2000 + ASSASSIN_SKILLS.poisonBlade.durationTicks;
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

    // --- MOVE & NORMAL ATTACK SYSTEM ---
    if (!skillActivated) {
        const myRangeSq = myRange * myRange;
        if (distSq <= myRangeSq) {
            if (d[base + IDX_ATTACK_CD] === 0) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                let dmg = baseDamage;
                const isAttackerStealthed =
                    d[base + IDX_EFFECT_STATE] >= 1000 &&
                    d[base + IDX_EFFECT_STATE] < 2000;
                if (isAttackerStealthed) {
                    dmg = Math.round(baseDamage * 1.5);
                    d[base + IDX_EFFECT_STATE] = 0; // break stealth
                }
                queueDamage(target, dmg, 8, i); // Attack delay 8 ticks
                d[base + IDX_ATTACK_CD] = attackInterval;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "basicAttack",
                    uType: 5, // Assassin
                    fx: d[base + IDX_X],
                    fy: d[base + IDX_Y] + 0.8,
                    fz: d[base + IDX_Z],
                    tx: tx,
                    ty: ty + 0.8,
                    tz: tz,
                });
            } else if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 0;
            }
            d[base + IDX_X] += tempSep[0];
            d[base + IDX_Z] += tempSep[1];
        } else {
            if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 1;
            }
            const dist = Math.sqrt(distSq) || 0.001;
            applySteering(d, i, dx, dz, dist, mySpeed, tempSep);

            // Only apply stealth if not already stealthed (guard against per-tick re-apply)
            if (d[base + IDX_EFFECT_STATE] < 1000) {
                d[base + IDX_EFFECT_STATE] = 1000 + 150; // stealth
            }
        }
    }

    clampAndHeighten(d, i);
}

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
    TARGET_TURRET,
    TURRET_A_X,
    TURRET_B_X,
    TURRET_Z,
    TEAM_A,
    TEAM_B,
    getTerrainHeight,
} from "../../constants";

import {
    ATTRIBUTES,
    DEFAULT_ATTRIBUTES,
    ARCHER_SKILLS,
    BOUND_X_MIN,
    BOUND_Z_MIN,
} from "../../config";

import { queueDamage, skillFXBatch } from "../../systems/CombatSystem";

import {
    gridHead,
    gridNext,
    cellSize,
    gridRows,
    gridCols,
} from "../../systems/TargetingSystem";

import {
    computeSeparation,
    clampAndHeighten,
    applySteering,
} from "../MovementHelper";

const tempSep = new Float32Array(2);

export function updateArcher(
    d: Float32Array,
    i: number,
    target: number,
    animLockTicks: Int32Array,
) {
    const base = i * STRIDE;
    const uTypeRaw = d[base + IDX_TYPE];
    const attr = ATTRIBUTES[uTypeRaw] ?? DEFAULT_ATTRIBUTES;
    const mySpeed = attr.moveSpeed;
    const myRange = attr.attackRange;
    const baseDamage = attr.baseDamage;
    const attackInterval = attr.attackInterval;

    let skillActivated = false;
    computeSeparation(d, i, mySpeed, tempSep);

    if (target === -1) {
        if (animLockTicks[i] === 0) {
            d[base + IDX_ANIM] = 0; // idle
        }
        clampAndHeighten(d, i);
        return;
    }

    // --- TARGET_TURRET: unit bergerak ke dan menyerang turret musuh ---
    if (target === TARGET_TURRET) {
        const myTeam = d[base + IDX_TEAM];
        const turretX = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
        const dtx = turretX - d[base + IDX_X];
        const dtz = TURRET_Z - d[base + IDX_Z];
        const dtDistSq = dtx * dtx + dtz * dtz;
        const personalRange = attr.attackRange - (i % 4) * 0.5;
        const attackRangeSq = personalRange * personalRange;

        if (dtDistSq > attackRangeSq) {
            if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 1; // move
                const dtDist = Math.sqrt(dtDistSq) || 0.001;
                applySteering(d, i, dtx, dtz, dtDist, mySpeed, tempSep);
            }
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
        }
        clampAndHeighten(d, i);
        return;
    }

    // Target is valid unit
    const tBase = target * STRIDE;
    const tx = d[tBase + IDX_X];
    const ty = d[tBase + IDX_Y];
    const tz = d[tBase + IDX_Z];
    const targetType = d[tBase + IDX_TYPE] % 6;
    const isTargetAssassin = targetType === 5; // TYPE_ASSASSIN

    const dx = tx - d[base + IDX_X];
    const dz = tz - d[base + IDX_Z];
    const distSq = dx * dx + dz * dz;

    // --- TARGETED SKILLS ---
    // Skill 1: always allowed vs any target (incl. Assassin)
    if (d[base + IDX_SKILL1_CD] === 0 && distSq <= myRange * myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
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
        d[base + IDX_SKILL2_CD] === 0 &&
        distSq <=
            ARCHER_SKILLS.evasiveLeap.range * ARCHER_SKILLS.evasiveLeap.range
    ) {
        d[base + IDX_ANIM] = 1;
        animLockTicks[i] = 15;
        const fromX = d[base + IDX_X];
        const fromY = d[base + IDX_Y];
        const fromZ = d[base + IDX_Z];
        const dist = Math.sqrt(distSq) || 0.001;
        d[base + IDX_X] -= (dx / dist) * ARCHER_SKILLS.evasiveLeap.distance;
        d[base + IDX_Z] -= (dz / dist) * ARCHER_SKILLS.evasiveLeap.distance;
        d[base + IDX_SKILL2_CD] = ARCHER_SKILLS.evasiveLeap.cooldown;
        skillActivated = true;
        skillFXBatch.push({
            type: "skillFX",
            skill: "evasiveLeap",
            fx: fromX,
            fy: fromY,
            fz: fromZ,
            tx: d[base + IDX_X],
            ty: fromY,
            tz: d[base + IDX_Z],
        });
    } else if (
        !isTargetAssassin &&
        d[base + IDX_SKILL3_CD] === 0 &&
        distSq <= myRange * myRange
    ) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const myX = d[base + IDX_X];
        const myY = d[base + IDX_Y];
        const myZ = d[base + IDX_Z];
        const targetX = tx;
        const targetZ = tz;
        const myTeam = d[base + IDX_TEAM];

        const tCol = Math.floor((targetX - BOUND_X_MIN) / cellSize);
        const tRow = Math.floor((targetZ - BOUND_Z_MIN) / cellSize);
        const radiusSq =
            ARCHER_SKILLS.arrowVolley.radius * ARCHER_SKILLS.arrowVolley.radius;

        const startRow = Math.max(0, tRow - 1);
        const endRow = Math.min(gridRows - 1, tRow + 1);
        const startCol = Math.max(0, tCol - 1);
        const endCol = Math.min(gridCols - 1, tCol + 1);

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
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

    // --- MOVE & NORMAL ATTACK SYSTEM ---
    if (!skillActivated) {
        const personalRange = myRange - (i % 4) * 0.5;
        
        // HYSTERESIS: Berikan ekstra range 10% jika unit SEDANG MENYERANG. 
        // Ini mencegah stutter-step ketika target bergerak menjauh dengan lambat.
        const isAttacking = (d[base + IDX_ANIM] === 2);
        const effectiveRange = isAttacking ? (personalRange * 1.1) : personalRange;
        const myRangeSq = effectiveRange * effectiveRange;

        if (distSq <= myRangeSq) {
            if (d[base + IDX_ATTACK_CD] === 0) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                queueDamage(target, baseDamage, 15, i);
                d[base + IDX_ATTACK_CD] = attackInterval;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "basicAttack",
                    uType: 1, // Archer
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
        } else {
            if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 1;
                const dist = Math.sqrt(distSq) || 0.001;
                applySteering(d, i, dx, dz, dist, mySpeed, tempSep);
            }
        }
    }

    // IDLE SEPARATION: 
    // Terapkan gaya tolak-menolak dengan redaman (damping) untuk mencegah jitter visual.
    if (d[base + IDX_ANIM] !== 1 && animLockTicks[i] === 0) {
        const sepX = tempSep[0] * 0.15;
        const sepZ = tempSep[1] * 0.15;
        if (sepX * sepX + sepZ * sepZ > 0.000025) {
            d[base + IDX_X] += sepX;
            d[base + IDX_Z] += sepZ;
        }
    }

    clampAndHeighten(d, i);
}

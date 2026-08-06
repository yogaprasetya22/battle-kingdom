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

import {
    ATTRIBUTES,
    DEFAULT_ATTRIBUTES,
    GUNSLINGER_SKILLS,
    BOUND_X_MIN,
    BOUND_Z_MIN,
} from "../../config";

import {
    queueDamage,
    skillFXBatch,
} from "../../systems/CombatSystem";

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

export function updateGunslinger(
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

    if (target === -1) {
        if (animLockTicks[i] === 0) {
            d[base + IDX_ANIM] = 0; // idle
        }
        computeSeparation(d, i, mySpeed, tempSep);
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
        const dtDist = Math.sqrt(dtx * dtx + dtz * dtz) || 0.001;

        if (dtDist > attr.attackRange) {
            if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 1; // move
            computeSeparation(d, i, mySpeed, tempSep);
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
            computeSeparation(d, i, mySpeed, tempSep);
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
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;

    // --- TARGETED SKILLS ---
    // Skill 1: High Noon — single target nuke
    if (d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
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
    // Skill 2: Smoke Bomb — self-stealth
    else if (d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 15;
        d[base + IDX_EFFECT_STATE] = 1000 + GUNSLINGER_SKILLS.smokeBomb.stealthTicks;
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
    // Skill 3: Fan Fire — AoE cone
    else if (d[base + IDX_SKILL3_CD] === 0 && dist <= myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const myTeam = d[base + IDX_TEAM];
        const targetX = tx;
        const targetZ = tz;
        const radiusSq = GUNSLINGER_SKILLS.fanFire.radius * GUNSLINGER_SKILLS.fanFire.radius;

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
                    if (d[jBase + IDX_HP] > 0 && d[jBase + IDX_TEAM] !== myTeam) {
                        const jdx = d[jBase + IDX_X] - targetX;
                        const jdz = d[jBase + IDX_Z] - targetZ;
                        const jdist = jdx * jdx + jdz * jdz;
                        if (jdist <= radiusSq) {
                            for (let h = 0; h < GUNSLINGER_SKILLS.fanFire.hits; h++) {
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

    // --- MOVE & NORMAL ATTACK SYSTEM ---
    if (!skillActivated) {
        computeSeparation(d, i, mySpeed, tempSep);

        if (dist <= myRange) {
            if (d[base + IDX_ATTACK_CD] === 0) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                queueDamage(target, baseDamage, 12, i);
                d[base + IDX_ATTACK_CD] = attackInterval;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "basicAttack",
                    uType: 4, // Gunslinger
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
            applySteering(d, i, dx, dz, dist, mySpeed, tempSep);
        }
    }

    clampAndHeighten(d, i);
}

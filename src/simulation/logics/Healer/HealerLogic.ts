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
    IDX_MAX_HP,
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
    HEALER_SKILLS,
    BOUND_X_MIN,
    BOUND_Z_MIN,
} from "../../config";

import {
    applyHeal,
    queueDamage,
    skillFXBatch,
} from "../../systems/CombatSystem";

import {
    gridHead,
    gridNext,
    cellSize,
    gridRows,
    gridCols,
    findLowestHpAlly,
    findNearestEnemy,
} from "../../systems/TargetingSystem";

import {
    computeSeparation,
    clampAndHeighten,
    applySteering,
} from "../MovementHelper";

const tempSep = new Float32Array(2);

export function updateHealer(
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


    // --- PANIC SHIELD: auto Divine Shield on self when HP <= 30% (blueprint) ---
    const myHp = d[base + IDX_HP];
    const myMaxHp = d[base + IDX_MAX_HP];
    const hpPercent = myHp / myMaxHp;
    if (!skillActivated && hpPercent <= 0.3 && d[base + IDX_SKILL2_CD] === 0) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        d[base + IDX_EFFECT_STATE] = -HEALER_SKILLS.divineShield.durationTicks;
        d[base + IDX_SKILL2_CD] = HEALER_SKILLS.divineShield.cooldown;
        skillActivated = true;
        skillFXBatch.push({
            type: "skillFX",
            skill: "divineShield",
            fx: d[base + IDX_X],
            fy: d[base + IDX_Y] + 0.8,
            fz: d[base + IDX_Z],
            tx: d[base + IDX_X],
            ty: d[base + IDX_Y] + 0.8,
            tz: d[base + IDX_Z],
        });
    }

    // --- SELF-BUFF / AOE SKILL 3 (Holy Sanctuary) ---
    if (d[base + IDX_SKILL3_CD] === 0) {
        const sanctuaryTeam = d[base + IDX_TEAM];
        const rangeSq = HEALER_SKILLS.holySanctuary.radius * HEALER_SKILLS.holySanctuary.radius;

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

        let anyoneNeedsHealing = false;
        const hCol = Math.floor((centerX - BOUND_X_MIN) / cellSize);
        const hRow = Math.floor((centerZ - BOUND_Z_MIN) / cellSize);

        const startRow = Math.max(0, hRow - 1);
        const endRow = Math.min(gridRows - 1, hRow + 1);
        const startCol = Math.max(0, hCol - 1);
        const endCol = Math.min(gridCols - 1, hCol + 1);

        for (let r = startRow; r <= endRow && !anyoneNeedsHealing; r++) {
            for (let c = startCol; c <= endCol && !anyoneNeedsHealing; c++) {
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
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
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
                                applyHeal(d, curr, HEALER_SKILLS.holySanctuary.healAmount, i);
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
            d[base + IDX_ANIM] = 0;
        }
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
        const personalRange = attr.attackRange - (i % 4) * 0.5;
        const attackRangeSq = personalRange * personalRange;

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

    const isTargetAlly = d[tBase + IDX_TEAM] === d[base + IDX_TEAM];

    // --- TARGETED SKILLS (Rejuvenation, Divine Shield) ---
    if (!skillActivated && isTargetAlly) {
        const targetHp = d[tBase + IDX_HP];
        const targetMaxHp = d[tBase + IDX_MAX_HP];
        const needsHealing = targetHp < targetMaxHp;

        if (needsHealing && d[base + IDX_SKILL1_CD] === 0 && distSq <= myRange * myRange) {
            d[base + IDX_ANIM] = 2;
            animLockTicks[i] = 20;
            applyHeal(d, target, HEALER_SKILLS.rejuvenation.healAmount, i);
            d[base + IDX_SKILL1_CD] = HEALER_SKILLS.rejuvenation.cooldown;
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
        } else if (needsHealing && d[base + IDX_SKILL2_CD] === 0 && distSq <= myRange * myRange) {
            d[base + IDX_ANIM] = 2;
            animLockTicks[i] = 20;
            d[tBase + IDX_EFFECT_STATE] = -HEALER_SKILLS.divineShield.durationTicks;
            d[base + IDX_SKILL2_CD] = HEALER_SKILLS.divineShield.cooldown;
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
    }

    // --- MOVE & NORMAL ATTACK SYSTEM ---
    if (!skillActivated) {
        let enemyTooClose = false;
        const nearestEnemy = findNearestEnemy(d, i);
        if (nearestEnemy !== -1) {
            const eBase = nearestEnemy * STRIDE;
            const edx = d[eBase + IDX_X] - d[base + IDX_X];
            const edz = d[eBase + IDX_Z] - d[base + IDX_Z];
            const edistSq = edx * edx + edz * edz;
            if (edistSq < 225.0) {
                enemyTooClose = true;
            }
        }
        const myTeam = d[base + IDX_TEAM];
        const turretX = myTeam === TEAM_A ? TURRET_B_X : TURRET_A_X;
        const tdx = turretX - d[base + IDX_X];
        const tdz = TURRET_Z - d[base + IDX_Z];
        const tdistSq = tdx * tdx + tdz * tdz;
        if (tdistSq < 484.0) {
            enemyTooClose = true;
        }

        if (isTargetAlly) {
            const tHp = d[tBase + IDX_HP];
            const tMaxHp = d[tBase + IDX_MAX_HP];
            const needsHeal = tHp > 0 && (tHp < tMaxHp * 0.98);

            if (distSq <= myRange * myRange) {
                if (needsHeal && d[base + IDX_ATTACK_CD] === 0) {
                    d[base + IDX_ANIM] = 2; // heal
                    animLockTicks[i] = 20;
                    applyHeal(d, target, baseDamage, i);
                    d[base + IDX_ATTACK_CD] = attackInterval;
                    skillFXBatch.push({
                        type: "skillFX",
                        skill: "basicHeal",
                        fx: d[base + IDX_X],
                        fy: d[base + IDX_Y] + 0.8,
                        fz: d[base + IDX_Z],
                        tx: tx,
                        ty: ty + 0.8,
                        tz: tz,
                    });
                } else if (animLockTicks[i] === 0) {
                    const tAnim = d[tBase + IDX_ANIM];
                    if (distSq < 4.0 || enemyTooClose) {
                        d[base + IDX_ANIM] = (tAnim === 1 && !enemyTooClose) ? 1 : 0;
                        const sepX = tempSep[0] * 0.15;
                        const sepZ = tempSep[1] * 0.15;
                        if (sepX * sepX + sepZ * sepZ > 0.000025) {
                            d[base + IDX_X] += sepX;
                            d[base + IDX_Z] += sepZ;
                        }
                    } else {
                        d[base + IDX_ANIM] = 1;
                        const dist = Math.sqrt(distSq) || 0.001;
                        applySteering(d, i, dx, dz, dist, mySpeed, tempSep);
                    }
                }
            } else {
                if (enemyTooClose) {
                    if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 0;
                    const sepX = tempSep[0] * 0.15;
                    const sepZ = tempSep[1] * 0.15;
                    if (sepX * sepX + sepZ * sepZ > 0.000025) {
                        d[base + IDX_X] += sepX;
                        d[base + IDX_Z] += sepZ;
                    }
                } else {
                    if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 1;
                    const dist = Math.sqrt(distSq) || 0.001;
                    applySteering(d, i, dx, dz, dist, mySpeed, tempSep);
                }
            }
        } else {
            // Target is enemy/turret (no ally needs healing)
            const personalRange = myRange - (i % 4) * 0.5;
            const myRangeSq = personalRange * personalRange;
            if (distSq <= myRangeSq) {
                if (d[base + IDX_ATTACK_CD] === 0) {
                    d[base + IDX_ANIM] = 2;
                    animLockTicks[i] = 20;
                    queueDamage(target, baseDamage, 22, i);
                    d[base + IDX_ATTACK_CD] = attackInterval;
                    skillFXBatch.push({
                        type: "skillFX",
                        skill: "basicAttack",
                        uType: 3, // Healer
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
                if (enemyTooClose) {
                    if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 0;
                    const sepX = tempSep[0] * 0.15;
                    const sepZ = tempSep[1] * 0.15;
                    if (sepX * sepX + sepZ * sepZ > 0.000025) {
                        d[base + IDX_X] += sepX;
                        d[base + IDX_Z] += sepZ;
                    }
                } else {
                    if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 1;
                    const dist = Math.sqrt(distSq) || 0.001;
                    applySteering(d, i, dx, dz, dist, mySpeed, tempSep);
                }
            }
        }
    }

    clampAndHeighten(d, i);
}

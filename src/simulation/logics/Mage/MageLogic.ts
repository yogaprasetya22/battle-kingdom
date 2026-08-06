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
    MAGE_SKILLS,
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
    tempCandidatesIdx,
    tempCandidatesDist,
    hitFlags,
} from "../../systems/TargetingSystem";

import {
    computeSeparation,
    clampAndHeighten,
    applySteering,
} from "../MovementHelper";

const tempSep = new Float32Array(2);

export function updateMage(
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
    // Skill 1: Frost Nova — AoE kecil, stun semua musuh dalam radius
    if (d[base + IDX_SKILL1_CD] === 0 && dist <= myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const novaX = tx;
        const novaZ = tz;
        const novaRadiusSq = MAGE_SKILLS.frostNova.radius * MAGE_SKILLS.frostNova.radius;
        const myTeamNova = d[base + IDX_TEAM];

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
                    if (d[jBase + IDX_HP] > 0 && d[jBase + IDX_TEAM] !== myTeamNova) {
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
                if (tempCandidatesDist[k] < tempCandidatesDist[minIdx]) {
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
    else if (d[base + IDX_SKILL2_CD] === 0 && dist <= myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
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

        hitFlags.fill(0);
        hitFlags[target] = 1;

        const chainRadiusSq = MAGE_SKILLS.chainLightning.chainRadius * MAGE_SKILLS.chainLightning.chainRadius;

        while (chainCount < MAGE_SKILLS.chainLightning.maxChains) {
            let nextTarget = -1;
            let nextMinDist = Infinity;

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
                            if (jdist < nextMinDist && jdist <= chainRadiusSq) {
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
    else if (d[base + IDX_SKILL3_CD] === 0 && dist <= myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const fbX = tx;
        const fbZ = tz;
        const fbRadiusSq = MAGE_SKILLS.fireball.radius * MAGE_SKILLS.fireball.radius;
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
                        if (d[jBase + IDX_HP] > 0 && d[jBase + IDX_TEAM] !== myTeamFb) {
                            const jdx = d[jBase + IDX_X] - fbX;
                            const jdz = d[jBase + IDX_Z] - fbZ;
                            const distSq = jdx * jdx + jdz * jdz;
                            if (distSq <= fbRadiusSq && candCount < 64) {
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

        const fbLimit = Math.min(4, candCount);
        for (let c = 0; c < fbLimit; c++) {
            let minIdx = c;
            for (let k = c + 1; k < candCount; k++) {
                if (tempCandidatesDist[k] < tempCandidatesDist[minIdx]) {
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

    // --- MOVE & NORMAL ATTACK SYSTEM ---
    if (!skillActivated) {
        computeSeparation(d, i, mySpeed, tempSep);

        if (dist <= myRange) {
            if (d[base + IDX_ATTACK_CD] === 0) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                queueDamage(target, baseDamage, 22, i);
                d[base + IDX_ATTACK_CD] = attackInterval;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "basicAttack",
                    uType: 2, // Mage
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

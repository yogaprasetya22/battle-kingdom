import {
    STRIDE,
    UNIT_COUNT,
    TEAM_SIZE,
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

import { queueDamage, skillFXBatch } from "../../systems/CombatSystem";

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
    computeSeparation(d, i, mySpeed, tempSep);

    if (target === -1) {
        if (animLockTicks[i] === 0) {
            d[base + IDX_ANIM] = 0; // idle
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
    const targetType = d[tBase + IDX_TYPE] % 6;
    const isTargetAssassin = targetType === 5; // TYPE_ASSASSIN

    const dx = tx - d[base + IDX_X];
    const dz = tz - d[base + IDX_Z];
    const distSq = dx * dx + dz * dz;

    // --- TARGETED SKILLS ---
    // Skill 1: Frost Nova — always allowed vs any target (incl. Assassin)
    if (d[base + IDX_SKILL1_CD] === 0 && distSq <= myRange * myRange) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const novaX = tx;
        const novaZ = tz;
        const novaRadiusSq =
            MAGE_SKILLS.frostNova.radius * MAGE_SKILLS.frostNova.radius;
        const myTeamNova = d[base + IDX_TEAM];

        const tCol = Math.floor((novaX - BOUND_X_MIN) / cellSize);
        const tRow = Math.floor((novaZ - BOUND_Z_MIN) / cellSize);
        let candCount = 0;

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
                        d[jBase + IDX_TEAM] !== myTeamNova
                    ) {
                        const jdx = d[jBase + IDX_X] - novaX;
                        const jdz = d[jBase + IDX_Z] - novaZ;
                        const distS = jdx * jdx + jdz * jdz;
                        if (distS <= novaRadiusSq && candCount < 64) {
                            tempCandidatesIdx[candCount] = curr;
                            tempCandidatesDist[candCount] = distS;
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
    // Skill 2: Chain Lightning — blocked vs Assassin (too heavy visual)
    else if (
        !isTargetAssassin &&
        d[base + IDX_SKILL2_CD] === 0 &&
        distSq <= myRange * myRange
    ) {
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

        const chainRadiusSq =
            MAGE_SKILLS.chainLightning.chainRadius *
            MAGE_SKILLS.chainLightning.chainRadius;

        while (chainCount < MAGE_SKILLS.chainLightning.maxChains) {
            let nextTarget = -1;
            let nextMinDist = Infinity;

            const lCol = Math.floor((lastX - BOUND_X_MIN) / cellSize);
            const lRow = Math.floor((lastZ - BOUND_Z_MIN) / cellSize);

            const startRow = Math.max(0, lRow - 1);
            const endRow = Math.min(gridRows - 1, lRow + 1);
            const startCol = Math.max(0, lCol - 1);
            const endCol = Math.min(gridCols - 1, lCol + 1);

            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
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
    // Skill 3 (ULTI): Meteor Fireball — blocked vs Assassin (too heavy visual)
    else if (
        !isTargetAssassin &&
        d[base + IDX_SKILL3_CD] === 0 &&
        distSq <= myRange * myRange
    ) {
        d[base + IDX_ANIM] = 2;
        animLockTicks[i] = 20;
        const fbX = tx;
        const fbZ = tz;
        const fbRadiusSq =
            MAGE_SKILLS.fireball.radius * MAGE_SKILLS.fireball.radius;
        const myTeamFb = d[base + IDX_TEAM];

        queueDamage(target, MAGE_SKILLS.fireball.damageDirect, 28, i);

        // Simplified hit-detection: distance from blast center (blueprint)
        let candCount = 0;
        const enemyStart = myTeamFb === TEAM_A ? TEAM_SIZE : 0;
        const enemyEnd = myTeamFb === TEAM_A ? UNIT_COUNT : TEAM_SIZE;
        for (let e = enemyStart; e < enemyEnd; e++) {
            if (e === target) continue;
            const jBase = e * STRIDE;
            if (d[jBase + IDX_HP] <= 0) continue;
            const jdx = d[jBase + IDX_X] - fbX;
            const jdz = d[jBase + IDX_Z] - fbZ;
            const distS = jdx * jdx + jdz * jdz;
            if (distS <= fbRadiusSq && candCount < 64) {
                tempCandidatesIdx[candCount] = e;
                tempCandidatesDist[candCount] = distS;
                candCount++;
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
        } else {
            if (animLockTicks[i] === 0) {
                d[base + IDX_ANIM] = 1;
            }
            const dist = Math.sqrt(distSq) || 0.001;
            applySteering(d, i, dx, dz, dist, mySpeed, tempSep);
        }
    }

    clampAndHeighten(d, i);
}

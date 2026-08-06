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
    IDX_IMMUNE_CD,
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
    BARBARIAN_SKILLS,
} from "../../config";

import {
    queueDamage,
    skillFXBatch,
} from "../../systems/CombatSystem";

import {
    computeSeparation,
    clampAndHeighten,
    applySteering,
} from "../MovementHelper";

const tempSep = new Float32Array(2);

export function updateTank(
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
        if (!skillActivated) {
            computeSeparation(d, i, mySpeed, tempSep);
            d[base + IDX_X] += tempSep[0];
            d[base + IDX_Z] += tempSep[1];
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
        const dtDist = Math.sqrt(dtx * dtx + dtz * dtz) || 0.001;

        if (dtDist > attr.attackRange) {
            if (animLockTicks[i] === 0) d[base + IDX_ANIM] = 1; // move
            computeSeparation(d, i, mySpeed, tempSep);
            applySteering(d, i, dtx, dtz, dtDist, mySpeed, tempSep);
        } else {
            // Trigger Rage (Skill 1) if ready when engaging the turret
            if (d[base + IDX_SKILL1_CD] === 0) {
                d[base + IDX_IMMUNE_CD] = BARBARIAN_SKILLS.rage.immuneTicks;
                d[base + IDX_SKILL1_CD] = BARBARIAN_SKILLS.rage.cooldown;
                skillActivated = true;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "ironFortitude",
                    team: myTeam,
                    x: d[base + IDX_X],
                    y: d[base + IDX_Y],
                    z: d[base + IDX_Z],
                });
            }

            if (!skillActivated && d[base + IDX_ATTACK_CD] === 0) {
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

    // Target is valid unit
    const tBase = target * STRIDE;
    const tx = d[tBase + IDX_X];
    const ty = d[tBase + IDX_Y];
    const tz = d[tBase + IDX_Z];

    const dx = tx - d[base + IDX_X];
    const dz = tz - d[base + IDX_Z];
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.001;

    // --- TARGETED SKILLS ---
    if (!skillActivated) {
        // Barbarian Skill 1: Rage (Self Buff) - only when engaging target in combat range
        if (d[base + IDX_SKILL1_CD] === 0 && dist <= attr.attackRange + 2.0) {
            d[base + IDX_IMMUNE_CD] = BARBARIAN_SKILLS.rage.immuneTicks;
            d[base + IDX_SKILL1_CD] = BARBARIAN_SKILLS.rage.cooldown;
            skillActivated = true;
            skillFXBatch.push({
                type: "skillFX",
                skill: "ironFortitude",
                team: d[base + IDX_TEAM],
                x: d[base + IDX_X],
                y: d[base + IDX_Y],
                z: d[base + IDX_Z],
            });
        }
        // Barbarian Skill 2: Battle Cry (Challenge/Taunt)
        else if (d[base + IDX_SKILL2_CD] === 0 && dist <= BARBARIAN_SKILLS.battleCry.range) {
            d[tBase + IDX_TARGET] = i;
            d[base + IDX_SKILL2_CD] = BARBARIAN_SKILLS.battleCry.cooldown;
            skillActivated = true;
            skillFXBatch.push({
                type: "skillFX",
                skill: "taunt", // Visual equivalent for battle cry
                team: d[base + IDX_TEAM],
                x: d[base + IDX_X],
                y: d[base + IDX_Y],
                z: d[base + IDX_Z],
                tx: tx,
                ty: ty,
                tz: tz,
            });
        }
        // Barbarian Skill 3: Axe Cleave (Axe slam/ShieldBash equivalent)
        else if (d[base + IDX_SKILL3_CD] === 0 && dist <= BARBARIAN_SKILLS.axeCleave.range) {
            d[base + IDX_ANIM] = 2;
            animLockTicks[i] = 20;
            queueDamage(target, BARBARIAN_SKILLS.axeCleave.damage, 15, i);
            d[base + IDX_SKILL3_CD] = BARBARIAN_SKILLS.axeCleave.cooldown;
            skillActivated = true;
            skillFXBatch.push({
                type: "skillFX",
                skill: "shieldBash", // Visual equivalent for Axe Cleave
                team: d[base + IDX_TEAM],
                x: d[base + IDX_X],
                y: d[base + IDX_Y],
                z: d[base + IDX_Z],
                tx: tx,
                ty: ty,
                tz: tz,
            });
        }
    }

    // --- MOVE & NORMAL ATTACK SYSTEM ---
    if (!skillActivated) {
        computeSeparation(d, i, mySpeed, tempSep);

        if (dist <= myRange) {
            if (d[base + IDX_ATTACK_CD] === 0) {
                d[base + IDX_ANIM] = 2;
                animLockTicks[i] = 20;
                queueDamage(target, baseDamage, 18, i);
                d[base + IDX_ATTACK_CD] = attackInterval;
                skillFXBatch.push({
                    type: "skillFX",
                    skill: "basicAttack",
                    uType: 0, // Barbarian (0)
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

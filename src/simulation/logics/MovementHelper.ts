import {
    STRIDE,
    IDX_X,
    IDX_Z,
    IDX_Y,
    IDX_HP,
    IDX_TARGET,
    IDX_TEAM,
    IDX_TYPE,
    IDX_ANIM,
    TEAM_A,
    TEAM_SIZE,
    UNIT_COUNT,
    getTerrainHeight,
} from "../constants";

import {
    BOUND_X_MIN,
    BOUND_X_MAX,
    BOUND_Z_MIN,
    BOUND_Z_MAX,
    SEPARATION_RADIUS,
    SEPARATION_STRENGTH,
    SEPARATION_MAX,
} from "../config";

import {
    gridHead,
    gridNext,
    cellSize,
    gridRows,
    gridCols,
} from "../systems/TargetingSystem";

export function isMelee(uType: number): boolean {
    return !(uType === 1 || uType === 7 || uType === 2 || uType === 8 || uType === 3 || uType === 9 || uType === 4 || uType === 10);
}

export function computeSeparation(d: Float32Array, i: number, mySpeed: number, outSep: Float32Array) {
    const base = i * STRIDE;
    let sepX = 0;
    let sepZ = 0;

    const myX = d[base + IDX_X];
    const myZ = d[base + IDX_Z];
    const myTeam = d[base + IDX_TEAM];

    const myCol = Math.floor((myX - BOUND_X_MIN) / cellSize);
    const myRow = Math.floor((myZ - BOUND_Z_MIN) / cellSize);

    let checkCount = 0;
    const maxChecks = 6;
    const MIN_DIST = 1.2; // combined radius (0.6 + 0.6)
    const MIN_DIST_SQ = MIN_DIST * MIN_DIST; // 1.44

    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= gridRows) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= gridCols) continue;
            const cellIdx = r * gridCols + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1 && checkCount < maxChecks) {
                if (curr !== i) {
                    const jBase = curr * STRIDE;
                    const jHp = d[jBase + IDX_HP];
                    if (jHp > 0) {
                        const jx = d[jBase + IDX_X];
                        const jz = d[jBase + IDX_Z];
                        const dxj = myX - jx;
                        const dzj = myZ - jz;
                        const distSq = dxj * dxj + dzj * dzj;

                        if (distSq < MIN_DIST_SQ && distSq > 0.0001) {
                            const uTypeI = d[base + IDX_TYPE];
                            const uTypeJ = d[jBase + IDX_TYPE];
                            const isMeleeI = isMelee(uTypeI);
                            const isMeleeJ = isMelee(uTypeJ);

                            // Melee vs Ranged: ignore entirely
                            if (isMeleeI !== isMeleeJ) {
                                curr = gridNext[curr];
                                continue;
                            }

                            checkCount++;
                            let forceFactor = (MIN_DIST_SQ - distSq) / (distSq + 0.01);
                            let strength = SEPARATION_STRENGTH;

                            if (!isMeleeI && !isMeleeJ) {
                                // Ranged vs Ranged: radius 0.15 (distSq < 0.15) and strength * 0.1
                                if (distSq >= 0.15) {
                                    curr = gridNext[curr];
                                    continue;
                                }
                                forceFactor = (0.15 - distSq) / (distSq + 0.01);
                                strength = SEPARATION_STRENGTH * 0.1;
                            }

                            sepX += dxj * forceFactor * strength;
                            sepZ += dzj * forceFactor * strength;
                        }
                    }
                }
                curr = gridNext[curr];
            }
        }
    }

    const sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
    const limitMax = Math.min(SEPARATION_MAX, mySpeed);
    if (sepMag > limitMax) {
        sepX = (sepX / sepMag) * limitMax;
        sepZ = (sepZ / sepMag) * limitMax;
    }

    outSep[0] = sepX;
    outSep[1] = sepZ;
}

export function clampAndHeighten(d: Float32Array, i: number) {
    const base = i * STRIDE;
    if (d[base + IDX_X] < BOUND_X_MIN) d[base + IDX_X] = BOUND_X_MIN;
    if (d[base + IDX_X] > BOUND_X_MAX) d[base + IDX_X] = BOUND_X_MAX;
    if (d[base + IDX_Z] < BOUND_Z_MIN) d[base + IDX_Z] = BOUND_Z_MIN;
    if (d[base + IDX_Z] > BOUND_Z_MAX) d[base + IDX_Z] = BOUND_Z_MAX;
    d[base + IDX_Y] = getTerrainHeight(d[base + IDX_X], d[base + IDX_Z]);
}

export function applySteering(
    d: Float32Array,
    i: number,
    dx: number,
    dz: number,
    dist: number,
    mySpeed: number,
    tempSep: Float32Array
) {
    const base = i * STRIDE;
    const nx = dx / dist;
    const nz = dz / dist;

    let sx = nx;
    let sz = nz;

    const sepDot = (nx * tempSep[0]) + (nz * tempSep[1]);
    const isBlocked = sepDot < -0.1;

    if (isBlocked) {
        // cross product untuk mengetahui slot kosong ada di kiri atau kanan
        const cross = nx * tempSep[1] - nz * tempSep[0];
        const sign = cross >= 0 ? 1 : -1;
        
        // Tambahkan wiggle dinamis berbasis index unit untuk memecah kemacetan simetris
        const wiggle = Math.sin(i * 1.7) * 0.25;
        const finalSign = sign + wiggle;

        // Pergerakan menyisir samping dominan (85%) dengan sedikit dorongan maju (15%) agar tetap mengalir ke depan
        sx = -nz * finalSign + nx * 0.15;
        sz = nx * finalSign + nz * 0.15;

        // Normalisasi arah agar kecepatannya konsisten
        const sMag = Math.sqrt(sx * sx + sz * sz);
        if (sMag > 0.001) {
            sx /= sMag;
            sz /= sMag;
        }

        // Reduksi separation lebih agresif agar unit fleksibel menyelip di sela kawan
        tempSep[0] *= 0.1;
        tempSep[1] *= 0.1;
    }

    let vx = sx * mySpeed + tempSep[0];
    let vz = sz * mySpeed + tempSep[1];
    const vMag = Math.sqrt(vx * vx + vz * vz);
    if (vMag > mySpeed) {
        vx = (vx / vMag) * mySpeed;
        vz = (vz / vMag) * mySpeed;
    }
    d[base + IDX_X] += vx;
    d[base + IDX_Z] += vz;
}

export function getMeleeTargetOffset(
    d: Float32Array,
    i: number,
    target: number,
    myTeam: number,
    tx: number,
    tz: number,
    attackRange: number,
    outOffset: Float32Array
): number {
    const base = i * STRIDE;
    const myAngle = Math.atan2(d[base + IDX_Z] - tz, d[base + IDX_X] - tx);
    const myNormAngle = (myAngle + Math.PI * 2) % (Math.PI * 2);

    const teamStart = myTeam === TEAM_A ? 0 : TEAM_SIZE;
    const teamEnd = myTeam === TEAM_A ? TEAM_SIZE : UNIT_COUNT;

    for (let k = 1; k <= 3; k++) {
        const slotCount = 8 * k;
        const occupied = new Uint8Array(slotCount);
        const r_k = attackRange * (k === 1 ? 0.95 : k - 0.1);

        for (let j = teamStart; j < teamEnd; j++) {
            if (j === i) continue;
            const jBase = j * STRIDE;
            if (d[jBase + IDX_HP] <= 0) continue;
            if (Math.round(d[jBase + IDX_TARGET]) !== target) continue;

            const jx = d[jBase + IDX_X];
            const jz = d[jBase + IDX_Z];
            const jdx = jx - tx;
            const jdz = jz - tz;
            const jDist = Math.sqrt(jdx * jdx + jdz * jdz);

            if (Math.abs(jDist - r_k) < 0.6) {
                const allyAngle = Math.atan2(jdz, jdx);
                const normAngle = (allyAngle + Math.PI * 2) % (Math.PI * 2);
                const slotIdx = Math.round((normAngle / (Math.PI * 2)) * slotCount) % slotCount;
                occupied[slotIdx] = 1;
            }
        }

        const myPreferredSlot = Math.round((myNormAngle / (Math.PI * 2)) * slotCount) % slotCount;
        let chosenSlot = -1;
        for (let offset = 0; offset <= slotCount / 2; offset++) {
            const slot1 = (myPreferredSlot + offset) % slotCount;
            if (occupied[slot1] === 0) {
                chosenSlot = slot1;
                break;
            }
            const slot2 = (myPreferredSlot - offset + slotCount) % slotCount;
            if (occupied[slot2] === 0) {
                chosenSlot = slot2;
                break;
            }
        }

        if (chosenSlot !== -1) {
            const finalAngle = (chosenSlot * (Math.PI * 2)) / slotCount;
            outOffset[0] = Math.cos(finalAngle) * r_k;
            outOffset[1] = Math.sin(finalAngle) * r_k;
            return k;
        }
    }

    const r_fallback = attackRange * 2.9;
    outOffset[0] = Math.cos(myNormAngle) * r_fallback;
    outOffset[1] = Math.sin(myNormAngle) * r_fallback;
    return 3;
}

export function resolveCollisions(d: Float32Array) {
    const MIN_DIST = 0.8; // combined body radius threshold
    const MIN_DIST_SQ = 0.64; // 0.8 * 0.8

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] <= 0) continue;

        const myX = d[base + IDX_X];
        const myZ = d[base + IDX_Z];

        const myCol = Math.floor((myX - BOUND_X_MIN) / cellSize);
        const myRow = Math.floor((myZ - BOUND_Z_MIN) / cellSize);

        // Check 3x3 grid around us
        for (let r = myRow - 1; r <= myRow + 1; r++) {
            if (r < 0 || r >= gridRows) continue;
            for (let c = myCol - 1; c <= myCol + 1; c++) {
                if (c < 0 || c >= gridCols) continue;
                const cellIdx = r * gridCols + c;
                let curr = gridHead[cellIdx];
                while (curr !== -1) {
                    if (curr > i) { // Only process each pair once
                        const jBase = curr * STRIDE;
                        if (d[jBase + IDX_HP] > 0) {
                            // Collision filtering: only resolve hard collision for melee vs melee
                            const uTypeI = d[base + IDX_TYPE];
                            const uTypeJ = d[jBase + IDX_TYPE];
                            const isMeleeI = !(uTypeI === 1 || uTypeI === 7 || uTypeI === 2 || uTypeI === 8 || uTypeI === 3 || uTypeI === 9 || uTypeI === 4 || uTypeI === 10);
                            const isMeleeJ = !(uTypeJ === 1 || uTypeJ === 7 || uTypeJ === 2 || uTypeJ === 8 || uTypeJ === 3 || uTypeJ === 9 || uTypeJ === 4 || uTypeJ === 10);
                            if (!(isMeleeI && isMeleeJ)) {
                                curr = gridNext[curr];
                                continue;
                            }

                            const jx = d[jBase + IDX_X];
                            const jz = d[jBase + IDX_Z];
                            const dx = myX - jx;
                            const dz = myZ - jz;
                            const distSq = dx * dx + dz * dz;

                            if (distSq < MIN_DIST_SQ && distSq > 0.0001) {
                                const dist = Math.sqrt(distSq);
                                const overlap = MIN_DIST - dist;

                                const animI = d[base + IDX_ANIM];
                                const animJ = d[jBase + IDX_ANIM];

                                const isIStationary = animI === 0 || animI === 2;
                                const isJStationary = animJ === 0 || animJ === 2;

                                let pushRatioI = 0.5;
                                let pushRatioJ = 0.5;

                                if (isIStationary && !isJStationary) {
                                    pushRatioI = 0.0;
                                    pushRatioJ = 1.0;
                                } else if (!isIStationary && isJStationary) {
                                    pushRatioI = 1.0;
                                    pushRatioJ = 0.0;
                                }

                                const pushX = (dx / dist) * overlap;
                                const pushZ = (dz / dist) * overlap;

                                d[base + IDX_X] += pushX * pushRatioI;
                                d[base + IDX_Z] += pushZ * pushRatioI;
                                d[jBase + IDX_X] -= pushX * pushRatioJ;
                                d[jBase + IDX_Z] -= pushZ * pushRatioJ;
                            }
                        }
                    }
                    curr = gridNext[curr];
                }
            }
        }
    }
}



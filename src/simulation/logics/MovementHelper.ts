import {
    STRIDE,
    IDX_X,
    IDX_Z,
    IDX_Y,
    IDX_HP,
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

export function computeSeparation(d: Float32Array, i: number, mySpeed: number, outSep: Float32Array) {
    const base = i * STRIDE;
    let sepX = 0;
    let sepZ = 0;

    const myCol = Math.floor((d[base + IDX_X] - BOUND_X_MIN) / cellSize);
    const myRow = Math.floor((d[base + IDX_Z] - BOUND_Z_MIN) / cellSize);

    for (let r = myRow - 1; r <= myRow + 1; r++) {
        if (r < 0 || r >= gridRows) continue;
        for (let c = myCol - 1; c <= myCol + 1; c++) {
            if (c < 0 || c >= gridCols) continue;
            const cellIdx = r * gridCols + c;
            let curr = gridHead[cellIdx];
            while (curr !== -1) {
                if (curr !== i) {
                    const jBase = curr * STRIDE;
                    const jHp = d[jBase + IDX_HP];
                    if (jHp > 0) {
                        const jx = d[jBase + IDX_X];
                        const jz = d[jBase + IDX_Z];
                        const dxj = d[base + IDX_X] - jx;
                        const dzj = d[base + IDX_Z] - jz;
                        const distSq = dxj * dxj + dzj * dzj;

                        if (distSq < SEPARATION_RADIUS * SEPARATION_RADIUS && distSq > 0.0001) {
                            const distj = Math.sqrt(distSq);
                            const force = (SEPARATION_RADIUS - distj) / SEPARATION_RADIUS;
                            const softDist = distj + 0.1;
                            sepX += (dxj / softDist) * force * SEPARATION_STRENGTH;
                            sepZ += (dzj / softDist) * force * SEPARATION_STRENGTH;
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
    let vx = nx * mySpeed + tempSep[0];
    let vz = nz * mySpeed + tempSep[1];
    const vMag = Math.sqrt(vx * vx + vz * vz);
    if (vMag > mySpeed) {
        vx = (vx / vMag) * mySpeed;
        vz = (vz / vMag) * mySpeed;
    }
    d[base + IDX_X] += vx;
    d[base + IDX_Z] += vz;
}

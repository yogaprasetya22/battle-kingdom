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

    // ponytail: hoist type read + inline isMelee — avoids fn call overhead in hot inner loop
    const uTypeI = d[base + IDX_TYPE];
    const isMeleeI = !(uTypeI === 1 || uTypeI === 7 || uTypeI === 2 || uTypeI === 8 || uTypeI === 3 || uTypeI === 9 || uTypeI === 4 || uTypeI === 10);

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
                            const uTypeJ = d[jBase + IDX_TYPE];
                            const isMeleeJ = !(uTypeJ === 1 || uTypeJ === 7 || uTypeJ === 2 || uTypeJ === 8 || uTypeJ === 3 || uTypeJ === 9 || uTypeJ === 4 || uTypeJ === 10);

                            let forceFactor = 0;
                            let strength = 0;

                            if (isMeleeI && isMeleeJ) {
                                // 1. Melee vs Melee: radius 1.2
                                forceFactor = (MIN_DIST_SQ - distSq) / (distSq + 0.01);
                                strength = SEPARATION_STRENGTH;
                            } else if (!isMeleeI && !isMeleeJ) {
                                // 2. Ranged vs Ranged: radius 0.8 (distSq < 0.64)
                                if (distSq >= 0.64) {
                                    curr = gridNext[curr];
                                    continue;
                                }
                                forceFactor = (0.64 - distSq) / (distSq + 0.01);
                                strength = SEPARATION_STRENGTH * 0.45;
                            } else {
                                // 3. Melee vs Ranged: radius 0.9 (distSq < 0.81)
                                if (distSq >= 0.81) {
                                    curr = gridNext[curr];
                                    continue;
                                }
                                forceFactor = (0.81 - distSq) / (distSq + 0.01);
                                strength = SEPARATION_STRENGTH * 0.35;
                            }

                            checkCount++;
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

// ponytail: 3 persistent arrays, total ~3.5KB di worker heap — zero GC per tick.
// _stuckCount: frame berturut-turut tidak progress (0..200)
// _orbitDir:   arah flank yang dipilih (+1 kiri / -1 kanan), dipilih sekali dan stabil
// _lastDistSq: jarak ke slot frame sebelumnya, untuk deteksi "tidak maju"
// ceiling: expand ke Uint16Array jika UNIT_COUNT > 256.
const _stuckCount   = new Uint8Array(512);
const _orbitDir     = new Int8Array(512);
const _lastDistSq   = new Float32Array(512);

export function applySteering(
    d: Float32Array,
    i: number,
    dx: number,   // arah ke target SLOT (sudah dihitung getMeleeTargetOffset), bukan raw enemy pos
    dz: number,
    dist: number,
    mySpeed: number,
    tempSep: Float32Array
) {
    const base = i * STRIDE;
    const nx = dx / dist;  // unit vector menuju slot
    const nz = dz / dist;

    // ── 1. DETEKSI MACET: dua sinyal digabung ──────────────────────────────
    // Signal A: separation berlawanan arah slot + cukup kuat (ada tekanan fisik dari depan)
    const sepMag = Math.sqrt(tempSep[0] * tempSep[0] + tempSep[1] * tempSep[1]);
    const sepDot = sepMag > 0.001
        ? nx * (tempSep[0] / sepMag) + nz * (tempSep[1] / sepMag)
        : 0;
    const hasPressure = sepDot < -0.2 && sepMag > mySpeed * 0.25;

    // Signal B: jarak ke slot tidak berkurang frame ini (tidak ada progress nyata)
    const distSq = dx * dx + dz * dz;
    const noProgress = _lastDistSq[i] > 0 && distSq >= _lastDistSq[i] - 0.002;
    _lastDistSq[i] = distSq;

    const isBlocked = hasPressure && noProgress;

    // ── 2. UPDATE STUCK COUNTER — tidak pernah di-reset penuh ─────────────
    if (isBlocked) {
        if (_stuckCount[i] < 200) _stuckCount[i]++;

        // Pilih orbit direction sekali saja — deterministik dari posisi unit
        // (lebih stabil dari i%2 yang bisa clash jika tetangga punya index berurutan)
        if (_stuckCount[i] === 2 && _orbitDir[i] === 0) {
            _orbitDir[i] = (Math.round(d[base + IDX_X] * 7 + d[base + IDX_Z] * 3) % 2 === 0) ? 1 : -1;
        }
        // Flip hanya di frame 120 (~2 detik di 60fps) — tunggu lama sebelum flip berikutnya
        // ponytail: tidak perlu reset _stuckCount setelah flip, severity tetap tinggi = tetap flank agresif
        if (_stuckCount[i] === 120) {
            _orbitDir[i] = -_orbitDir[i] as (1 | -1);
        }
    } else {
        // Cooldown lambat: -1/frame memberi "momentum" melewati ujung celah
        if (_stuckCount[i] > 0) _stuckCount[i]--;
    }

    // ── 3. BLEND VEKTOR: lerp(ke slot, flank, severity) ───────────────────
    // severity 0 = jalan ke slot normal, severity 1 = full sideways flanking
    const severity = Math.min(_stuckCount[i] / 30.0, 1.0); // ramp-up dalam 30 frame (~0.5 detik)
    const orbitSign = _orbitDir[i] || 1;

    // Flank direction = perpendicular 90° dari arah slot — zero trig cost
    // ponytail: rotasi 90° hanya butuh swap + negasi, tidak ada sin/cos
    const flankX = -nz * orbitSign;
    const flankZ =  nx * orbitSign;

    // Lerp dari "ke slot" ke "ke samping" berdasarkan severity
    // Tidak ada retreat (mundur) — retreat memperparah clash dengan unit di belakang
    let sx = nx + (flankX - nx) * severity;
    let sz = nz + (flankZ - nz) * severity;

    // Normalisasi
    const sMag = Math.sqrt(sx * sx + sz * sz);
    if (sMag > 0.001) { sx /= sMag; sz /= sMag; }

    // ── 4. SEPARATION TIDAK DILEMAHKAN saat flanking ──────────────────────
    // Separation melindungi dari resolveCollisions() hard push — jangan dikurangi
    // ponytail: hilangkan tempSep *= 0.8 dari versi lama
    let vx = sx * mySpeed + tempSep[0];
    let vz = sz * mySpeed + tempSep[1];

    // Beri sedikit boost kecepatan saat flanking (max 1.15×) agar bisa menyusuri punggung teman
    // tanpa tersangkut, tapi tetap batas atas agar tidak hyper-speed
    const speedCap = severity > 0.3 ? mySpeed * 1.15 : mySpeed;
    const vMag = Math.sqrt(vx * vx + vz * vz);
    if (vMag > speedCap) {
        vx = (vx / vMag) * speedCap;
        vz = (vz / vMag) * speedCap;
    }

    d[base + IDX_X] += vx;
    d[base + IDX_Z] += vz;
}

// ponytail: pre-allocated ring occupancy buffers — no heap alloc per tick.
// ceiling: max 24 slots (ring k=3: 8*3). One buffer per ring, reused every call.
const _ring1 = new Uint8Array(8);
const _ring2 = new Uint8Array(16);
const _ring3 = new Uint8Array(24);
const _rings = [_ring1, _ring2, _ring3];

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
        const occupied = _rings[k - 1];
        occupied.fill(0); // reset reused buffer — cheaper than new Uint8Array
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
            const jDistSq = jdx * jdx + jdz * jdz;
            const jDist = Math.sqrt(jDistSq);

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
            if (occupied[slot1] === 0) { chosenSlot = slot1; break; }
            const slot2 = (myPreferredSlot - offset + slotCount) % slotCount;
            if (occupied[slot2] === 0) { chosenSlot = slot2; break; }
        }

        if (chosenSlot !== -1) {
            const finalAngle = (chosenSlot * (Math.PI * 2)) / slotCount;
            outOffset[0] = Math.cos(finalAngle) * r_k;
            outOffset[1] = Math.sin(finalAngle) * r_k;
            return k;
        }
    }

    // ponytail: fallback 1.2× keeps unit at the edge of the scrum with jitter to prevent stacking singularity.
    const randomJitter = (Math.random() - 0.5) * 1.5;
    const r_fallback = attackRange * (1.2 + Math.random() * 0.5);
    outOffset[0] = Math.cos(myNormAngle + randomJitter) * r_fallback;
    outOffset[1] = Math.sin(myNormAngle + randomJitter) * r_fallback;
    return 3;
}

export function resolveCollisions(d: Float32Array) {
    const MIN_DIST = 0.85; 
    const MIN_DIST_SQ = 0.7225; // 0.85 * 0.85

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        if (d[base + IDX_HP] <= 0) continue;

        // ponytail: inline type checks to avoid dynamic resolution overhead
        const uTypeI = d[base + IDX_TYPE];
        const isMeleeI = !(uTypeI === 1 || uTypeI === 7 || uTypeI === 2 || uTypeI === 8 || uTypeI === 3 || uTypeI === 9 || uTypeI === 4 || uTypeI === 10);
        if (!isMeleeI) continue;

        const myX = d[base + IDX_X];
        const myZ = d[base + IDX_Z];

        const myCol = Math.floor((myX - BOUND_X_MIN) / cellSize);
        const myRow = Math.floor((myZ - BOUND_Z_MIN) / cellSize);

        for (let r = myRow - 1; r <= myRow + 1; r++) {
            if (r < 0 || r >= gridRows) continue;
            for (let c = myCol - 1; c <= myCol + 1; c++) {
                if (c < 0 || c >= gridCols) continue;
                const cellIdx = r * gridCols + c;
                let curr = gridHead[cellIdx];
                while (curr !== -1) {
                    if (curr > i) { 
                        const jBase = curr * STRIDE;
                        if (d[jBase + IDX_HP] > 0) {
                            const uTypeJ = d[jBase + IDX_TYPE];
                            const isMeleeJ = !(uTypeJ === 1 || uTypeJ === 7 || uTypeJ === 2 || uTypeJ === 8 || uTypeJ === 3 || uTypeJ === 9 || uTypeJ === 4 || uTypeJ === 10);
                            if (isMeleeJ) {
                                const jx = d[jBase + IDX_X];
                                const jz = d[jBase + IDX_Z];
                                const dx = myX - jx;
                                const dz = myZ - jz;
                                const distSq = dx * dx + dz * dz;

                                // Zona Darurat (< 0.85)
                                if (distSq < MIN_DIST_SQ && distSq > 0.0001) {
                                    const dist = Math.sqrt(distSq);
                                    
                                    // ponytail: ganti pembagian dengan perkalian inverse distance (lebih hemat CPU cycle)
                                    const invDist = 1.0 / dist;
                                    const overlap = (MIN_DIST - dist) * 0.5;

                                    const animI = d[base + IDX_ANIM];
                                    const animJ = d[jBase + IDX_ANIM];

                                    const isIStationary = animI === 0 || animI === 2;
                                    const isJStationary = animJ === 0 || animJ === 2;

                                    let pushRatioI = 0.5;
                                    let pushRatioJ = 0.5;

                                    if (isIStationary && !isJStationary) {
                                        pushRatioI = 0.1;
                                        pushRatioJ = 0.9;
                                    } else if (!isIStationary && isJStationary) {
                                        pushRatioI = 0.9;
                                        pushRatioJ = 0.1;
                                    }

                                    // Gunakan invDist untuk menghilangkan 2 operasi pembagian
                                    const pushX = dx * invDist * overlap;
                                    const pushZ = dz * invDist * overlap;

                                    d[base + IDX_X] += pushX * pushRatioI;
                                    d[base + IDX_Z] += pushZ * pushRatioI;
                                    d[jBase + IDX_X] -= pushX * pushRatioJ;
                                    d[jBase + IDX_Z] -= pushZ * pushRatioJ;
                                }
                            }
                        }
                    }
                    curr = gridNext[curr];
                }
            }
        }
    }
}



// Total units per team
export const TEAM_SIZE = 50;
export const UNIT_COUNT = TEAM_SIZE * 2; // 100 total

// Flat ECS layout per unit (15 floats = 60 bytes each)
// [x, y, z, hp, targetIdx, teamId, animState, type, skill1Cd, skill2Cd, skill3Cd, maxHp, attackCd, effectState, immuneCd]
export const STRIDE = 15;
export const IDX_X = 0;
export const IDX_Y = 1;
export const IDX_Z = 2;
export const IDX_HP = 3;
export const IDX_TARGET = 4;
export const IDX_TEAM = 5;
export const IDX_ANIM = 6; // 0=idle,1=move,2=attack,3=dead
export const IDX_TYPE = 7; // 0=Tank, 1=Archer, 2=Mage
export const IDX_SKILL1_CD = 8;
export const IDX_SKILL2_CD = 9;
export const IDX_SKILL3_CD = 10;
export const IDX_MAX_HP = 11;
export const IDX_ATTACK_CD = 12;
export const IDX_EFFECT_STATE = 13;
export const IDX_IMMUNE_CD = 14; // Countdown imun Tank (> 0 = imun, tidak bisa menerima damage)

// LOD Culling Distance for unit meshes (larger visual range)
export const UNIT_LOD_DIST_SQ = 90000; // ~300 units (entire map)
export const WEAPON_LOD_DIST_SQ = 3600; // ~60 units

// Class Types
export const TYPE_BARBARIAN = 0;
export const TYPE_TANK = 0; // alias back compat
export const TYPE_ARCHER = 1;
export const TYPE_MAGE = 2;
export const TYPE_HEALER = 3;
export const TYPE_ACOLYTE = 3; // alias — healer upgrade
export const TYPE_GUNSLINGER = 4;
export const TYPE_ASSASSIN = 5;
export const TYPE_MERCHANT = 6;
export const TYPE_DRUID = 7;
export const TYPE_KNIGHT = 12; // New separate unit type

// Teams
export const TEAM_A = 0;
export const TEAM_B = 1;

// Turret (Tower Defense)
export const TURRET_A_X = -37.5; // posisi X turret Tim A (kiri)
export const TURRET_B_X = 37.5;  // posisi X turret Tim B (kanan)
export const TURRET_Z = 0;        // posisi Z turret (tengah)
export const TURRET_MAX_HP = 5000000;
export const TURRET_ATTACK_RANGE = 20; // jangkauan tembak turret (unit dunia)
export const TURRET_ATTACK_RANGE_SQ = TURRET_ATTACK_RANGE * TURRET_ATTACK_RANGE;
export const TURRET_DAMAGE = 5000;       // damage turret per tembakan (increased from 5000)
export const TURRET_ATTACK_INTERVAL = 8;  // ticks antar tembakan (ASPD 193 ~7.5 kali per detik @60tps)
export const TARGET_TURRET = -2; // sentinel: unit menyerang turret musuh (bukan unit)


// Combat values moved to config.ts — ATTRIBUTES, ARMOR, HP_PER_TYPE, etc.

// Spawn positions
export const SPAWN_A_X = -36; // Tim A spawn di kiri tepi
export const SPAWN_B_X = 36; // Tim B spawn di kanan tepi
export const SPAWN_SPREAD = 68; // lebar sebaran formasi (50 cols × ~1.4 = 70)

// Buffer size
export const BUFFER_BYTES =
    UNIT_COUNT * STRIDE * Float32Array.BYTES_PER_ELEMENT;

// ── Terrain height cache ──
// Quantize coordinates to 0.5-unit grid cells. Terrain varies smoothly
// (sin/cos with periods >8 units), so sub-grid error < 0.25 units — invisible.
const GRID = 0.5;
// Direct-mapped cache size (must be power of 2 for fast bitwise modulo)
const CACHE_SIZE = 4096;
const _hCacheKeys = new Int32Array(CACHE_SIZE).fill(-1);
const _hCacheVals = new Float32Array(CACHE_SIZE);

function getCacheIndex(x: number, z: number, keyOut: { key: number }): number {
    const ix = Math.round(x / GRID);
    const iz = Math.round(z / GRID);
    // Unique key generator
    const key = (ix << 16) | (iz & 0xffff);
    keyOut.key = key;
    // Fast bitwise index mapping
    return Math.abs(key) & (CACHE_SIZE - 1);
}


function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function mixVal(a: number, b: number, t: number): number {
    return a * (1.0 - t) + b * t;
}

// ── Lake definitions ──
// Bowl-shaped depressions in forest zones outside the battlefield.
// Each lake is a Gaussian depression: -depth * exp(-dist²/(2*r²))
export interface LakeDef {
    cx: number;
    cz: number;
    rx: number;
    rz: number;
    depth: number;
}

export const LAKES: LakeDef[] = [
    { cx: -68, cz: -62, rx: 22, rz: 15, depth: 1.4 }, // NW besar (was rx: 15, rz: 10)
    { cx: 68, cz: -62, rx: 20, rz: 14, depth: 1.3 }, // NE besar (was rx: 14, rz: 9)
    { cx: -68, cz: 62, rx: 19, rz: 15, depth: 1.2 }, // SW besar (was rx: 13, rz: 10)
    { cx: 68, cz: 62, rx: 22, rz: 14, depth: 1.5 }, // SE besar (was rx: 15, rz: 9)
    { cx: -88, cz: 0, rx: 14, rz: 11, depth: 1.0 }, // Barat jauh (was rx: 9, rz: 7)
    { cx: 88, cz: 0, rx: 14, rz: 11, depth: 1.0 }, // Timur jauh (was rx: 9, rz: 7)
];

function lakeBowlHeight(x: number, z: number): number {
    let h = 0;
    for (const lake of LAKES) {
        const dx = (x - lake.cx) / lake.rx;
        const dz = (z - lake.cz) / lake.rz;
        const distSq = dx * dx + dz * dz;
        h -= lake.depth * Math.exp(-distSq * 0.5);
    }
    return h;
}

// ── Battlefield zone constants (exported for other modules) ──
export const BF_HALF_X = 42;
export const BF_HALF_Z = 38;
export const BF_BLEND = 8; // transition width from flat → forest

// ponytail: temporary object to return multiple values from getCacheIndex without allocation
const _keyRef = { key: 0 };

// Terrain height: flat battlefield center, forest hills + lake bowls on sides
export function getTerrainHeight(x: number, z: number): number {
    const idx = getCacheIndex(x, z, _keyRef);
    const key = _keyRef.key;
    if (_hCacheKeys[idx] === key) {
        return _hCacheVals[idx];
    }

    // Distance from battlefield edge
    const dxEdge = Math.max(0, Math.abs(x) - BF_HALF_X);
    const dzEdge = Math.max(0, Math.abs(z) - BF_HALF_Z);
    const edgeDist = Math.sqrt(dxEdge * dxEdge + dzEdge * dzEdge);

    // 0 = inside flat battlefield, 1 = deep forest
    const forestFactor = smoothstep(0, BF_BLEND, edgeDist);

    // Forest hills — organic sine/cosine terrain
    const h1 = Math.sin(x * 0.12 + 0.5) * Math.cos(z * 0.12) * 3.5;
    const h2 = Math.sin(x * 0.28) * Math.sin(z * 0.22 + 1.2) * 1.2;
    let hills = h1 + h2;

    const WATER_LEVEL = -3.0;

    // Calculate maximum wetness of any lake at this point
    let maxWetness = 0;
    let lakeBowlDepth = 0;
    for (const lake of LAKES) {
        const dx = (x - lake.cx) / lake.rx;
        const dz = (z - lake.cz) / lake.rz;
        const distSq = dx * dx + dz * dz;
        const wet = Math.exp(-distSq * 0.5);
        if (wet > maxWetness) {
            maxWetness = wet;
        }
        // Carve down relative to the target water level (-3.0)
        // Depth multiplied by 2.2 to make sure it goes deep below -3.0
        lakeBowlDepth -= (lake.depth * 2.2) * wet;
    }

    // Interpolate hills down towards WATER_LEVEL (-3.0) near lakes
    hills = mixVal(hills, WATER_LEVEL, smoothstep(0.0, 0.8, maxWetness));

    // Forest terrain = hills (suppressed/lowered) + lake bowls carved further down
    const forestTerrain = hills + lakeBowlDepth;

    // Blend: flat (0) on battlefield → full terrain in forest
    const result = forestTerrain * forestFactor;

    _hCacheKeys[idx] = key;
    _hCacheVals[idx] = result;
    return result;
}

// ponytail: invalidate cache when terrain params change
export function invalidateTerrainCache(): void {
    _hCacheKeys.fill(-1);
    _hCacheVals.fill(0);
}

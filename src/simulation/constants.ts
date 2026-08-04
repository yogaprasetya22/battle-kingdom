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

// LOD Culling Distance for unit meshes (45 units distance squared)
export const UNIT_LOD_DIST_SQ = 6025;

// Class Types
export const TYPE_TANK = 0;
export const TYPE_KNIGHT = 0; // alias — tank
export const TYPE_ARCHER = 1;
export const TYPE_MAGE = 2;
export const TYPE_HEALER = 3;
export const TYPE_ACOLYTE = 3; // alias — healer upgrade
export const TYPE_GUNSLINGER = 4;
export const TYPE_ASSASSIN = 5;
export const TYPE_MERCHANT = 6;
export const TYPE_DRUID = 7;

// Teams
export const TEAM_A = 0;
export const TEAM_B = 1;

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
const CACHE_MAX = 1024;
const _hCache = new Map<number, number>();

function cacheKey(x: number, z: number): number {
    const ix = Math.round(x / GRID);
    const iz = Math.round(z / GRID);
    return (ix << 16) | (iz & 0xffff);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
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
    { cx: -68, cz: -62, rx: 15, rz: 10, depth: 1.4 }, // NW besar
    { cx: 68, cz: -62, rx: 14, rz: 9, depth: 1.3 }, // NE besar
    { cx: -68, cz: 62, rx: 13, rz: 10, depth: 1.2 }, // SW besar
    { cx: 68, cz: 62, rx: 15, rz: 9, depth: 1.5 }, // SE besar
    { cx: -88, cz: 0, rx: 9, rz: 7, depth: 1.0 }, // Barat jauh
    { cx: 88, cz: 0, rx: 9, rz: 7, depth: 1.0 }, // Timur jauh
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

// Terrain height: flat battlefield center, forest hills + lake bowls on sides
export function getTerrainHeight(x: number, z: number): number {
    const key = cacheKey(x, z);
    const cached = _hCache.get(key);
    if (cached !== undefined) return cached;

    // Distance from battlefield edge
    const dxEdge = Math.max(0, Math.abs(x) - BF_HALF_X);
    const dzEdge = Math.max(0, Math.abs(z) - BF_HALF_Z);
    const edgeDist = Math.sqrt(dxEdge * dxEdge + dzEdge * dzEdge);

    // 0 = inside flat battlefield, 1 = deep forest
    const forestFactor = smoothstep(0, BF_BLEND, edgeDist);

    // Forest hills — organic sine/cosine terrain
    const h1 = Math.sin(x * 0.12 + 0.5) * Math.cos(z * 0.12) * 3.5;
    const h2 = Math.sin(x * 0.28) * Math.sin(z * 0.22 + 1.2) * 1.2;
    const hills = h1 + h2;

    // Lake bowl depressions
    const bowls = lakeBowlHeight(x, z);

    // Forest terrain = hills with lake bowls carved in
    const forestTerrain = hills + bowls;

    // Blend: flat (0) on battlefield → full terrain in forest
    const result = forestTerrain * forestFactor;

    if (_hCache.size >= CACHE_MAX) {
        const firstKey = _hCache.keys().next().value;
        if (firstKey !== undefined) _hCache.delete(firstKey);
    }
    _hCache.set(key, result);
    return result;
}

// ponytail: invalidate cache when terrain params change
export function invalidateTerrainCache(): void {
    _hCache.clear();
}

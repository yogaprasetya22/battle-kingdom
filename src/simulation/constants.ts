// Total units per team
export const TEAM_SIZE = 100;
export const UNIT_COUNT = TEAM_SIZE * 2; // 1000 total

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
export const TYPE_ARCHER = 1;
export const TYPE_MAGE = 2;
export const TYPE_HEALER = 3;

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
const CACHE_MAX = 512;
const _hCache = new Map<number, number>();

function cacheKey(x: number, z: number): number {
    // Pack two 16-bit quantized ints into one 32-bit key.
    // Bounds: x∈[-120,120], z∈[-90,90] → ix∈[-240,240], iz∈[-180,180] → fits int16.
    const ix = Math.round(x / GRID);
    const iz = Math.round(z / GRID);
    return (ix << 16) | (iz & 0xffff);
}

// Shared terrain height function (hills on the sides, valley/river in the center)
export function getTerrainHeight(x: number, z: number): number {
    const key = cacheKey(x, z);
    const cached = _hCache.get(key);
    if (cached !== undefined) return cached;

    // z_factor makes the center corridor (z near 0) flatter, while outer regions have taller hills
    const zFactor = Math.min(1.0, Math.abs(z) / 14.0);

    // Sine/Cosine combination for organic mountains
    const h1 = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 3.5;
    const h2 = Math.sin(x * 0.28) * Math.sin(z * 0.22) * 1.2;

    // River valley bed in the center (x near 0)
    const riverFactor = Math.max(0, 1.0 - Math.abs(x) / 5.5);
    const riverValley = -riverFactor * 1.0;

    const result = (h1 + h2) * zFactor + riverValley;

    // ponytail: LRU eviction via Map delete of oldest entry when full
    if (_hCache.size >= CACHE_MAX) {
        const firstKey = _hCache.keys().next().value;
        if (firstKey !== undefined) _hCache.delete(firstKey);
    }
    _hCache.set(key, result);
    return result;
}

// ponytail: invalidate cache when terrain params change (currently static, placeholder)
export function invalidateTerrainCache(): void {
    _hCache.clear();
}

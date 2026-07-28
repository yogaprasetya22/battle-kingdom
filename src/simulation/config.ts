/**
 * Battle Unit Configuration
 *
 * Semua nilai balance dalam satu flat object.
 * Cooldown & durasi dalam TICKS (1 tick ≈ 16ms, ~62.5 ticks/detik).
 *
 * ponytail: flat object, no classes, no abstractions.
 * Edit angka di sini, semua file lain ikut berubah.
 */

// ============ TIMING ============
export const TICK_RATE = 62.5; // ticks per detik (1000ms / 16ms)
export const TICK_MS = 16;

// ============ SPAWN WAVES ============
export const SPAWN_INITIAL = 5; // unit awal per tim
export const SPAWN_PER_WAVE = 1; // tambahan unit per wave
export const SPAWN_WAVE_INTERVAL = 20; // ticks antar wave
export const SPAWN_INSIDE_OFFSET_X = 6.5; // jarak spawn di dalam kastil (sumbu X)
export const SPAWN_INSIDE_SPREAD_Z = 0.75; // max spread Z spawn (Math.random() - 0.5) * 2 * ini

// ============ MOVEMENT & SEPARATION ============
export const SEPARATION_RADIUS = 0.95;
export const SEPARATION_STRENGTH = 0.02;
export const SEPARATION_MAX = 0.04; // batas magnitude separation

// ============ TERRAIN BOUNDS ============
export const BOUND_X_MIN = -119;
export const BOUND_X_MAX = 119;
export const BOUND_Z_MIN = -89;
export const BOUND_Z_MAX = 89;

// ============ ARMOR (Penyesuaian: Armor Tank diturunkan agar damage tetap terasa) ============
export const ARMOR: Record<number, number> = {
    0: 0.3,  // Tank: Turun dari 40% ke 30% reduction
    1: 0.1,  // Archer: 10% reduction
    2: 0.0,  // Mage: 0% reduction
    3: 0.05, // Healer: 5% reduction
};

// ============ DEFENSE BUFF ============
export const DEFENSE_BUFF_MULTIPLIER = 0.5;

// ============ HP PER TYPE (Penyesuaian: HP Tank diturunkan agar tidak jadi spons darah) ============
export const HP_PER_TYPE: Record<number, number> = {
    0: 450, // Tank: Turun dari 650 ke 450
    1: 240, // Archer: Tetap
    2: 210, // Mage: Tetap
    3: 180, // Healer: Tetap
};

// ============ ATTRIBUT PER TYPE ============
export interface UnitAttributes {
    moveSpeed: number;
    attackRange: number;
    baseDamage: number;
    attackInterval: number; // ticks antar normal attack
}

export const ATTRIBUTES: Record<number, UnitAttributes> = {
    0: {
        moveSpeed: 0.035,
        attackRange: 1.8,
        baseDamage: 10,  // Naik dari 8 (agar tank tetap punya threat)
        attackInterval: 65,
    },
    1: {
        moveSpeed: 0.025,
        attackRange: 6.0,
        baseDamage: 12,  // Naik dari 9 (agar bisa menembus armor tank)
        attackInterval: 40,  // Lebih cepat dari 45
    },
    2: {
        moveSpeed: 0.02,
        attackRange: 12.0,
        baseDamage: 15,  // Naik dari 11 (Mage harus jadi penembus armor utama)
        attackInterval: 60,
    },
    3: {
        moveSpeed: 0.024,
        attackRange: 8.0,
        baseDamage: 3,   // TURUN DRASTIS dari 6 (Basic heal tidak boleh menandingi basic attack DPS)
        attackInterval: 75,  // Lebih lambat dari 55 (Heal interval diperlama)
    },
};

// ============ DEFAULT ATTRIBUTES (fallback) ============
export const DEFAULT_ATTRIBUTES: UnitAttributes = {
    moveSpeed: 0.04,
    attackRange: 1.8,
    baseDamage: 15,
    attackInterval: 40,
};

// ============ TANK SKILLS (Penyesuaian: Uptime kebal dikurangi) ============
export const TANK_SKILLS = {
    bulwarkStance: {
        immuneTicks: 40,  // Turun dari 90 (Hanya ~0.6 detik immune, bukan 1.5 detik)
        cooldown: 500,    // Naik dari 312 (Mencegah spam kebal)
    },
    taunt: {
        range: 4.0,
        cooldown: 450,    // Naik tipis
    },
    shieldBash: {
        range: 1.8,
        damage: 15,
        knockback: 1.2,
        cooldown: 550,
    },
};

// ============ ARCHER SKILLS ============
export const ARCHER_SKILLS = {
    doubleShot: {
        damage: 15,       // Turun tipis dari 18 karena base attack sudah naik
        cooldown: 400,    // Lebih cepat dari 450
        delayBetweenShots: 120,
    },
    evasiveLeap: {
        range: 2.5,
        distance: 4.0,
        cooldown: 380,
    },
    arrowVolley: {
        radius: 2.5,
        damage: 12,       // Naik dari 10
        cooldown: 550,
        arrowCount: 60,
    },
};

// ============ MAGE SKILLS ============
export const MAGE_SKILLS = {
    frostNova: {
        damage: 12,
        radius: 1.5,
        stunTicks: 40,    // Stun diturunkan sedikit dari 50
        cooldown: 400,
    },
    chainLightning: {
        damagePrimary: 22,
        damageSecondary: 15,
        maxChains: 4,
        chainRadius: 5.0,
        cooldown: 500,
    },
    fireball: {
        damageDirect: 60,
        damageSplash: 25,
        radius: 3.5,
        cooldown: 800,    // Dipercepat dari 900 agar Mage bisa memecah kebuntuan lebih sering
    },
};

// ============ HEALER SKILLS (Penyesuaian: Nerf berat pada angka dan cooldown) ============
export const HEALER_SKILLS = {
    rejuvenation: {
        healAmount: 12,   // Turun dari 22 (Skill heal tidak boleh over-power)
        cooldown: 350,    // Naik dari 220
    },
    divineShield: {
        cooldown: 450,    // Naik dari 320 (Mencegah spam shield ke tank)
        durationTicks: 60, // Turun dari 80 (Durasi perisai dipersingkat)
    },
    holySanctuary: {
        radius: 5.0,
        healAmount: 8,    // Turun dari 12 (AoE heal yang terlalu besar bikin 1 tim kebal)
        cooldown: 650,    // Naik dari 500
    },
};

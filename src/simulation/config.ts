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

// ============ ARMOR (damage reduction per type) ============
export const ARMOR: Record<number, number> = {
    0: 0.4, // Tank: 40% reduction
    1: 0.1, // Archer: 10% reduction
    2: 0.0, // Mage: 0% reduction
    3: 0.05, // Healer: 5% reduction
};

// ============ DEFENSE BUFF ============
export const DEFENSE_BUFF_MULTIPLIER = 0.5; // damage dikali 0.5 saat buff aktif

// ============ HP PER TYPE ============
export const HP_PER_TYPE: Record<number, number> = {
    0: 650, // Tank
    1: 240, // Archer
    2: 210, // Mage 210
    3: 200, // Healer
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
        // Tank — slow, short range, low damage, slow attack
        moveSpeed: 0.035, 
        attackRange: 1.8,
        baseDamage: 8,
        attackInterval: 65,
    },
    1: {
        // Archer — fast, mid range, mid damage, mid attack speed
        moveSpeed: 0.025, //0.025
        attackRange: 6.0,
        baseDamage: 9,
        attackInterval: 45,
    },
    2: {
        // Mage — slow, long range, high damage, slow attack
        moveSpeed: 0.020, // 0.020
        attackRange: 12.0,
        baseDamage: 11,
        attackInterval: 60,
    },
    3: {
        // Healer — mid speed, mid range, base heal power
        moveSpeed: 0.024,
        attackRange: 8.0,
        baseDamage: 12, // heal amount
        attackInterval: 50,
    },
};

// ============ DEFAULT ATTRIBUTES (fallback) ============
export const DEFAULT_ATTRIBUTES: UnitAttributes = {
    moveSpeed: 0.04,
    attackRange: 1.8,
    baseDamage: 15,
    attackInterval: 40,
};

// ============ TANK SKILLS ============
export const TANK_SKILLS = {
    // Skill 1: Bulwark Stance — imun total
    bulwarkStance: {
        immuneTicks: 90, // durasi imun (~1.5 detik)
        cooldown: 312, // cooldown (~5 detik)
    },
    // Skill 2: Taunt — paksa musuh target diri
    taunt: {
        range: 4.0, // jarak trigger
        cooldown: 400, // cooldown (~6.4 detik)
    },
    // Skill 3: Shield Bash — damage + knockback
    shieldBash: {
        range: 1.8, // jarak trigger
        damage: 15,
        knockback: 1.2, // jarak dorong
        cooldown: 550, // cooldown (~8.8 detik)
    },
};

// ============ ARCHER SKILLS ============
export const ARCHER_SKILLS = {
    // Skill 1: Double Shot — 2x damage burst
    doubleShot: {
        damage: 18, // damage ke target
        cooldown: 450, // cooldown (~7.2 detik)
        delayBetweenShots: 120, // ms antar panah (untuk FX)
    },
    // Skill 2: Evasive Leap — lompat mundur
    evasiveLeap: {
        range: 2.5, // jarak trigger (musuh terlalu dekat)
        distance: 4.0, // jarak lompat
        cooldown: 380, // cooldown (~6.1 detik)
    },
    // Skill 3: Arrow Volley — AoE di area target
    arrowVolley: {
        radius: 2.5, // radius AoE
        damage: 10, // damage per unit di area
        cooldown: 550, // cooldown (~8.8 detik) 5550
        arrowCount: 60, // jumlah panah visual (FX)
    },
};

// ============ MAGE SKILLS ============
export const MAGE_SKILLS = {
    // Skill 1: Frost Nova — AoE kecil freeze + stun (sering dipakai)
    frostNova: {
        damage: 10,
        radius: 1.5,        // AoE radius — semua musuh dalam jangkauan kena
        stunTicks: 50,      // durasi stun (~0.8 detik)
        cooldown: 380,      // cooldown (~6 detik)
    },
    // Skill 2: Chain Lightning — bounce 4 target, damage naik
    chainLightning: {
        damagePrimary: 20,   // damage ke target pertama
        damageSecondary: 16, // damage ke target bounce
        maxChains: 4,        // total target bounce (naik dari 3)
        chainRadius: 5.0,    // radius cari target bounce
        cooldown: 520,       // cooldown (~8.3 detik)
    },
    // Skill 3 (ULTI): Meteor Fireball — AoE besar, damage masif, cooldown sangat lama
    fireball: {
        damageDirect: 55,   // damage inti di center AoE
        damageSplash: 22,   // damage splash ke musuh sekitar
        radius: 3.5,        // radius AoE splash
        cooldown: 900,      // cooldown (~14.4 detik) — ini ulti
    },
};

// ============ HEALER SKILLS ============
export const HEALER_SKILLS = {
    // Skill 1: Rejuvenation — Single target heal
    rejuvenation: {
        healAmount: 35,
        cooldown: 180, // ~3 detik
    },
    // Skill 2: Divine Shield — Buff pertahanan (effectState = -100 ticks)
    divineShield: {
        cooldown: 280, // ~4.5 detik
        durationTicks: 100, // durasi shield
    },
    // Skill 3: Holy Sanctuary — AoE heal
    holySanctuary: {
        radius: 5.0,
        healAmount: 20,
        cooldown: 450, // ~7.2 detik
    }
};

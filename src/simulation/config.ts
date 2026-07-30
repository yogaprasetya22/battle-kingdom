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

// ============ ARMOR ============
export const ARMOR: Record<number, number> = {
    0: 0.3, // Knight: 30% reduction
    1: 0.1, // Archer: 10% reduction
    2: 0.0, // Mage: 0% reduction
    3: 0.05, // Acolyte: 5% reduction
    4: 0.05, // Gunslinger: light armor
    5: 0.0, // Assassin: glass cannon, no armor
    6: 0.15, // Merchant: light armor, support
    7: 0.08, // Druid: light armor, caster
};

// ============ DEFENSE BUFF ============
export const DEFENSE_BUFF_MULTIPLIER = 0.5;

// ============ HP PER TYPE ============
export const HP_PER_TYPE: Record<number, number> = {
    0: 450, // Knight
    1: 240, // Archer
    2: 210, // Mage
    3: 180, // Acolyte
    4: 200, // Gunslinger — fragile, relies on evasion
    5: 160, // Assassin — most fragile
    6: 270, // Merchant — support, moderate HP
    7: 220, // Druid — caster, moderate HP
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
        baseDamage: 10,
        attackInterval: 65,
    },
    1: {
        moveSpeed: 0.025,
        attackRange: 6.0,
        baseDamage: 12,
        attackInterval: 40,
    },
    2: {
        moveSpeed: 0.02,
        attackRange: 12.0,
        baseDamage: 15,
        attackInterval: 60,
    },
    3: {
        moveSpeed: 0.024,
        attackRange: 8.0,
        baseDamage: 3,
        attackInterval: 75,
    },
    4: {
        // Gunslinger — high single-target damage, medium range
        moveSpeed: 0.03,
        attackRange: 7.0,
        baseDamage: 22,
        attackInterval: 50,
    },
    5: {
        // Assassin — fastest, highest damage, melee
        moveSpeed: 0.055,
        attackRange: 1.2,
        baseDamage: 28,
        attackInterval: 35,
    },
    6: {
        // Merchant — support, moderate speed & range
        moveSpeed: 0.028,
        attackRange: 4.5,
        baseDamage: 8,
        attackInterval: 70,
    },
    7: {
        // Druid — moderate speed, caster range
        moveSpeed: 0.022,
        attackRange: 9.0,
        baseDamage: 14,
        attackInterval: 65,
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
        immuneTicks: 40, // Turun dari 90 (Hanya ~0.6 detik immune, bukan 1.5 detik)
        cooldown: 500, // Naik dari 312 (Mencegah spam kebal)
    },
    taunt: {
        range: 4.0,
        cooldown: 450, // Naik tipis
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
        damage: 15, // Turun tipis dari 18 karena base attack sudah naik
        cooldown: 400, // Lebih cepat dari 450
        delayBetweenShots: 120,
    },
    evasiveLeap: {
        range: 2.5,
        distance: 4.0,
        cooldown: 380,
    },
    arrowVolley: {
        radius: 2.5,
        damage: 12, // Naik dari 10
        cooldown: 550,
        arrowCount: 60,
    },
};

// ============ MAGE SKILLS ============
export const MAGE_SKILLS = {
    frostNova: {
        damage: 12,
        radius: 1.5,
        stunTicks: 40, // Stun diturunkan sedikit dari 50
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
        cooldown: 800, // Dipercepat dari 900 agar Mage bisa memecah kebuntuan lebih sering
    },
};

// ============ HEALER / ACOLYTE SKILLS ============
export const HEALER_SKILLS = {
    rejuvenation: {
        healAmount: 15,
        cooldown: 300,
    },
    divineShield: {
        cooldown: 400,
        durationTicks: 80,
    },
    holySanctuary: {
        radius: 5.0,
        healAmount: 10,
        cooldown: 600,
    },
};

// Legacy alias
export const ACOLYTE_SKILLS = HEALER_SKILLS;

// ============ GUNSLINGER SKILLS ============
export const GUNSLINGER_SKILLS = {
    highNoon: {
        damage: 35,
        cooldown: 500,
    },
    smokeBomb: {
        stealthTicks: 60,
        cooldown: 600,
    },
    fanFire: {
        radius: 2.5,
        damage: 18,
        hits: 3,
        cooldown: 700,
    },
};

// ============ ASSASSIN SKILLS ============
export const ASSASSIN_SKILLS = {
    shadowStep: {
        teleportRange: 3.0,
        cooldown: 350,
    },
    backstab: {
        damageBack: 40,
        damageFront: 15,
        cooldown: 420,
    },
    poisonBlade: {
        damagePerTick: 6,
        durationTicks: 30,
        cooldown: 550,
    },
};

// ============ MERCHANT SKILLS ============
export const MERCHANT_SKILLS = {
    tradeRoute: {
        moveSpeedBuff: 0.015, // +50% movement speed
        buffTicks: 100,
        radius: 12.0, // team-wide AoE
        cooldown: 600,
    },
    goldArmor: {
        shieldAmount: 50,
        reflectPercent: 0.5, // reflect 50% damage
        durationTicks: 120,
        cooldown: 700,
    },
    marketCrash: {
        damageDebuff: -0.3, // -30% enemy damage
        debuffTicks: 90,
        radius: 8.0, // enemy AoE
        cooldown: 800,
    },
};

// ============ DRUID SKILLS ============
export const DRUID_SKILLS = {
    summonWolf: {
        wolfdamage: 18,
        wolfHp: 120,
        duration: 80,
        cooldown: 1000,
    },
    vineTrap: {
        rootTicks: 60, // root duration
        radius: 3.0,
        cooldown: 550,
    },
    thornDoT: {
        damagePerTick: 8,
        durationTicks: 40,
        radius: 4.0, // AoE
        cooldown: 650,
    },
};

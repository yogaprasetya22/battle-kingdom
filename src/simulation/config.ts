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
export const SPAWN_WAVE_INTERVAL = 80; // ticks antar wave (increased for better pacing)
export const SPAWN_INSIDE_OFFSET_X = 6.5; // jarak spawn di dalam kastil (sumbu X)
export const SPAWN_INSIDE_SPREAD_Z = 6.0; // max spread Z spawn (Math.random() - 0.5) * 2 * ini (increased from 0.75)

// ============ MOVEMENT & SEPARATION ============
export const SEPARATION_RADIUS = 1.5; // naik dari 0.95 — tank menyebar lebih luas, kurangi klaster padat
export const SEPARATION_STRENGTH = 0.03; // naik dari 0.02 — dorong lebih kuat saat bertumpuk
export const SEPARATION_MAX = 0.06; // naik dari 0.04 — batas dorong maksimum per tick

// ============ TERRAIN BOUNDS ============
export const BOUND_X_MIN = -119;
export const BOUND_X_MAX = 119;
export const BOUND_Z_MIN = -89;
export const BOUND_Z_MAX = 89;

// ============ ARMOR ============
export const ARMOR: Record<number, number> = {
    0: 0.2, // Barbarian: 20% reduction (medium armor)
    1: 0.1, // Archer: 10% reduction
    2: 0.0, // Mage: 0% reduction
    3: 0.05, // Acolyte: 5% reduction
    4: 0.05, // Gunslinger: light armor
    5: 0.15, // Assassin: glass cannon, buffed armor
    6: 0.4, // Skeleton Tank: 40% reduction (Buffed)
    7: 0.2, // Skeleton Archer: 20% reduction (Buffed)
    8: 0.1, // Skeleton Mage: 10% reduction (Buffed)
    9: 0.15, // Skeleton Healer: 15% reduction (Buffed)
    10: 0.15, // Skeleton Gunslinger: 15% (Buffed)
    11: 0.22, // Skeleton Assassin: 22% reduction (Buffed)
    12: 0.35, // Knight: 35% reduction (high armor)
};

// ============ DEFENSE BUFF ============
export const DEFENSE_BUFF_MULTIPLIER = 0.5;

// ============ HP PER TYPE ============
export const HP_PER_TYPE: Record<number, number> = {
    0: 500000, // Barbarian (High HP)
    1: 240000, // Archer
    2: 210000, // Mage
    3: 180000, // Acolyte
    4: 200000, // Gunslinger
    5: 210000, // Assassin (Buffed HP)
    6: 600000, // Skeleton Tank (Buffed HP)
    7: 350000, // Skeleton Archer (Buffed HP)
    8: 300000, // Skeleton Mage (Buffed HP)
    9: 270000, // Skeleton Healer (Buffed HP)
    10: 300000, // Skeleton Gunslinger (Buffed HP)
    11: 310000, // Skeleton Assassin (Buffed HP)
    12: 450000, // Knight (High Armor, Balanced HP)
};

// ============ ATTRIBUT PER TYPE ============
export interface UnitAttributes {
    moveSpeed: number;
    attackRange: number;
    baseDamage: number;
    attackInterval: number; // ticks antar normal attack
    critChance: number; // critical rate (0.0 to 1.0)
    critDamage: number; // damage multiplier (e.g. 1.5 for +50% damage)
}

export const ATTRIBUTES: Record<number, UnitAttributes> = {
    0: {
        moveSpeed: 0.038, // Barbarian is slightly faster than Knight
        attackRange: 1.8,
        baseDamage: 12000, // Barbarian does more base damage
        attackInterval: 60,
        critChance: 0.08,
        critDamage: 1.6,
    },
    1: {
        moveSpeed: 0.025,
        attackRange: 6.0,
        baseDamage: 12000,
        attackInterval: 40,
        critChance: 0.15,
        critDamage: 1.6,
    },
    2: {
        moveSpeed: 0.02,
        attackRange: 12.0,
        baseDamage: 8000,
        attackInterval: 60,
        critChance: 0.1,
        critDamage: 1.5,
    },
    3: {
        moveSpeed: 0.024,
        attackRange: 22.0,
        baseDamage: 3000,
        attackInterval: 75,
        critChance: 0.05,
        critDamage: 1.5,
    },
    4: {
        moveSpeed: 0.03,
        attackRange: 7.0,
        baseDamage: 18000,
        attackInterval: 50,
        critChance: 0.2,
        critDamage: 1.8,
    },
    5: {
        moveSpeed: 0.055,
        attackRange: 1.2,
        baseDamage: 16000,
        attackInterval: 35,
        critChance: 0.4,
        critDamage: 1.8,
    },
    6: {
        // Skeleton Tank: faster, hits much harder (Buffed)
        moveSpeed: 0.04,
        attackRange: 1.8,
        baseDamage: 18000,
        attackInterval: 50,
        critChance: 0.05,
        critDamage: 1.5,
    },
    7: {
        // Skeleton Archer: faster move/atk, higher damage (Buffed)
        moveSpeed: 0.03,
        attackRange: 6.5,
        baseDamage: 20000,
        attackInterval: 32,
        critChance: 0.15,
        critDamage: 1.6,
    },
    8: {
        // Skeleton Mage: high damage (Buffed)
        moveSpeed: 0.025,
        attackRange: 12.0,
        baseDamage: 6000,
        attackInterval: 48,
        critChance: 0.1,
        critDamage: 1.5,
    },
    9: {
        // Skeleton Healer (Buffed)
        moveSpeed: 0.028,
        attackRange: 22.0,
        baseDamage: 5000,
        attackInterval: 55,
        critChance: 0.05,
        critDamage: 1.5,
    },
    10: {
        // Skeleton Gunslinger (Buffed)
        moveSpeed: 0.035,
        attackRange: 7.5,
        baseDamage: 35000,
        attackInterval: 40,
        critChance: 0.2,
        critDamage: 1.8,
    },
    11: {
        // Skeleton Assassin: lethal glass-cannon (Buffed)
        moveSpeed: 0.065,
        attackRange: 1.2,
        baseDamage: 36000,
        attackInterval: 28,
        critChance: 0.4,
        critDamage: 1.8,
    },
    12: {
        // Knight: protector attributes
        moveSpeed: 0.033,
        attackRange: 1.8,
        baseDamage: 9000,
        attackInterval: 70,
        critChance: 0.05,
        critDamage: 1.5,
    },
};

// ============ DEFAULT ATTRIBUTES (fallback) ============
export const DEFAULT_ATTRIBUTES: UnitAttributes = {
    moveSpeed: 0.04,
    attackRange: 1.8,
    baseDamage: 15000,
    attackInterval: 40,
    critChance: 0.1,
    critDamage: 1.5,
};

// ============ BARBARIAN SKILLS ============
export const BARBARIAN_SKILLS = {
    rage: {
        immuneTicks: 20, // Rage self-immunity (nerfed: 30→20, creates vulnerability window)
        cooldown: 750, // (nerfed: 600→750, longer cooldown per blueprint)
    },
    axeCleave: {
        range: 1.8,
        damage: 18000,
        cooldown: 400,
    },
    battleCry: {
        range: 4.0,
        cooldown: 500,
        damageDebuff: -0.2,
        durationTicks: 100,
    },
};

// Legacy alias
export const TANK_SKILLS = BARBARIAN_SKILLS;

// ============ KNIGHT SKILLS ============
export const KNIGHT_SKILLS = {
    bulwarkStance: {
        immuneTicks: 50, // Longer shield block
        cooldown: 450,
    },
    taunt: {
        range: 5.0,
        cooldown: 400,
    },
    shieldBash: {
        range: 1.8,
        damage: 14000,
        knockback: 1.5,
        cooldown: 500,
    },
};

// ============ ARCHER SKILLS ============
export const ARCHER_SKILLS = {
    doubleShot: {
        damage: 15000, // Turun tipis dari 18 karena base attack sudah naik
        cooldown: 400, // Lebih cepat dari 450
        delayBetweenShots: 120,
    },
    evasiveLeap: {
        range: 2.5,
        distance: 4.0,
        cooldown: 330,
    },
    arrowVolley: {
        radius: 2.5,
        damage: 18000, // Naik dari 12
        cooldown: 550,
        arrowCount: 60,
    },
};

// ============ MAGE SKILLS ============
export const MAGE_SKILLS = {
    frostNova: {
        damage: 12000,
        radius: 1.5,
        stunTicks: 40,
        cooldown: 550, // Cooldown increased from 400
    },
    chainLightning: {
        damagePrimary: 22000,
        damageSecondary: 15000,
        maxChains: 4,
        chainRadius: 5.0,
        cooldown: 700, // Cooldown increased from 500
    },
    fireball: {
        damageDirect: 60000,
        damageSplash: 25000,
        radius: 3.5,
        cooldown: 850, // Cooldown decreased from 1100 to reduce inactive time
    },
};

// ============ HEALER / ACOLYTE SKILLS ============
export const HEALER_SKILLS = {
    rejuvenation: {
        healAmount: 45000,
        cooldown: 300,
    },
    divineShield: {
        cooldown: 400,
        durationTicks: 80,
    },
    holySanctuary: {
        radius: 5.0,
        healAmount: 25000,
        cooldown: 600,
    },
};

// Legacy alias
export const ACOLYTE_SKILLS = HEALER_SKILLS;

// ============ GUNSLINGER SKILLS ============
export const GUNSLINGER_SKILLS = {
    highNoon: {
        damage: 35000,
        cooldown: 500,
    },
    smokeBomb: {
        stealthTicks: 60,
        cooldown: 600,
    },
    fanFire: {
        radius: 2.5,
        damage: 10000,
        hits: 3,
        cooldown: 700,
    },
};

// ============ ASSASSIN SKILLS ============
export const ASSASSIN_SKILLS = {
    shadowStep: {
        teleportRange: 3.0,
        activationRange: 30.0, // range to cast shadowStep directly to target (increased from 8.0)
        cooldown: 350,
    },
    backstab: {
        damageBack: 35000,
        damageFront: 18000,
        cooldown: 420,
    },
    poisonBlade: {
        damagePerTick: 1200,
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
        shieldAmount: 50000,
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
        wolfdamage: 18000,
        wolfHp: 120000,
        duration: 80,
        cooldown: 1000,
    },
    vineTrap: {
        rootTicks: 60, // root duration
        radius: 3.0,
        cooldown: 550,
    },
    thornDoT: {
        damagePerTick: 8000,
        durationTicks: 40,
        radius: 4.0, // AoE
        cooldown: 650,
    },
};

// ============ HERO STATS ============
export const HERO_STATS = {
    critChance: 0.60,
    critDamage: 2.0,
};

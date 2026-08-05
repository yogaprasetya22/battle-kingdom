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
    0: 0.3, // Knight: 30% reduction
    1: 0.1, // Archer: 10% reduction
    2: 0.0, // Mage: 0% reduction
    3: 0.05, // Acolyte: 5% reduction
    4: 0.05, // Gunslinger: light armor
    5: 0.15, // Assassin: glass cannon, buffed armor
    6: 0.4,  // Skeleton Tank: 40% reduction (Buffed)
    7: 0.2,  // Skeleton Archer: 20% reduction (Buffed)
    8: 0.1,  // Skeleton Mage: 10% reduction (Buffed)
    9: 0.15, // Skeleton Healer: 15% reduction (Buffed)
    10: 0.15, // Skeleton Gunslinger: 15% (Buffed)
    11: 0.22,  // Skeleton Assassin: 22% reduction (Buffed)
};

// ============ DEFENSE BUFF ============
export const DEFENSE_BUFF_MULTIPLIER = 0.5;

// ============ HP PER TYPE ============
export const HP_PER_TYPE: Record<number, number> = {
    0: 450000, // Knight
    1: 240000, // Archer
    2: 210000, // Mage
    3: 180000, // Acolyte
    4: 200000, // Gunslinger
    5: 280000, // Assassin (Buffed HP)
    6: 600000, // Skeleton Tank (Buffed HP)
    7: 350000, // Skeleton Archer (Buffed HP)
    8: 300000, // Skeleton Mage (Buffed HP)
    9: 270000, // Skeleton Healer (Buffed HP)
    10: 300000, // Skeleton Gunslinger (Buffed HP)
    11: 380000, // Skeleton Assassin (Buffed HP)
};

// ============ ATTRIBUT PER TYPE ============
export interface UnitAttributes {
    moveSpeed: number;
    attackRange: number;
    baseDamage: number;
    attackInterval: number; // ticks antar normal attack
    critChance: number;      // critical rate (0.0 to 1.0)
    critDamage: number;      // damage multiplier (e.g. 1.5 for +50% damage)
}

export const ATTRIBUTES: Record<number, UnitAttributes> = {
    0: {
        moveSpeed: 0.035,
        attackRange: 1.8,
        baseDamage: 10000,
        attackInterval: 65,
        critChance: 0.05,
        critDamage: 1.5,
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
        baseDamage: 4000,
        attackInterval: 60,
        critChance: 0.10,
        critDamage: 1.5,
    },
    3: {
        moveSpeed: 0.024,
        attackRange: 8.0,
        baseDamage: 3000,
        attackInterval: 75,
        critChance: 0.05,
        critDamage: 1.5,
    },
    4: {
        moveSpeed: 0.03,
        attackRange: 7.0,
        baseDamage: 22000,
        attackInterval: 50,
        critChance: 0.20,
        critDamage: 1.8,
    },
    5: {
        moveSpeed: 0.055,
        attackRange: 1.2,
        baseDamage: 30000,
        attackInterval: 35,
        critChance: 0.40,
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
        critChance: 0.10,
        critDamage: 1.5,
    },
    9: {
        // Skeleton Healer (Buffed)
        moveSpeed: 0.028,
        attackRange: 8.0,
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
        critChance: 0.20,
        critDamage: 1.8,
    },
    11: {
        // Skeleton Assassin: lethal glass-cannon (Buffed)
        moveSpeed: 0.065,
        attackRange: 1.2,
        baseDamage: 36000,
        attackInterval: 28,
        critChance: 0.40,
        critDamage: 1.8,
    },
};

// ============ DEFAULT ATTRIBUTES (fallback) ============
export const DEFAULT_ATTRIBUTES: UnitAttributes = {
    moveSpeed: 0.04,
    attackRange: 1.8,
    baseDamage: 15000,
    attackInterval: 40,
    critChance: 0.10,
    critDamage: 1.5,
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
        damage: 15000,
        knockback: 1.2,
        cooldown: 550,
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
        cooldown: 380,
    },
    arrowVolley: {
        radius: 2.5,
        damage: 12000, // Naik dari 10
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
        cooldown: 1100, // Cooldown increased from 800 to prevent fireball spamming
    },
};

// ============ HEALER / ACOLYTE SKILLS ============
export const HEALER_SKILLS = {
    rejuvenation: {
        healAmount: 15000,
        cooldown: 300,
    },
    divineShield: {
        cooldown: 400,
        durationTicks: 80,
    },
    holySanctuary: {
        radius: 5.0,
        healAmount: 10000,
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
        damage: 18000,
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
        damageBack: 35000,
        damageFront: 18000,
        cooldown: 420,
    },
    poisonBlade: {
        damagePerTick: 5000,
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

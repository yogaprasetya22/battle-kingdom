# Rencana Teknis: 8 Unit Archetype — Multi-Trade Three.js

## Ringkasan Arsitektur Saat Ini

### ECS Buffer (SharedArrayBuffer)

```
STRIDE = 15 float per unit (60 bytes)
[0] x  [1] y  [2] z  [3] hp  [4] targetIdx  [5] teamId
[6] animState  [7] type  [8] skill1Cd  [9] skill2Cd  [10] skill3Cd
[11] maxHp  [12] attackCd  [13] effectState  [14] immuneCd
```

- **Semua 15 slot terpakai.** Tidak bisa tambah field tanpa memperbesar STRIDE → mengubah buffer size & semua offset.
- Behavior berbeda antar tipe menggunakan ulang slot `skill1/2/3Cd`, `effectState`, `immuneCd` secara berbeda.

### Sistem tipe saat ini

| TYPE | Nama   | Model             | HP  | Skills                                    |
| ---- | ------ | ----------------- | --- | ----------------------------------------- |
| 0    | Tank   | Knight.glb        | 450 | Bulwark (immune), Taunt, ShieldBash       |
| 1    | Archer | Ranger.glb        | 240 | DoubleShot, EvasiveLeap, ArrowVolley      |
| 2    | Mage   | Mage.glb          | 210 | FrostNova, ChainLightning, Fireball       |
| 3    | Healer | Mage.glb (shared) | 180 | Rejuvenation, DivineShield, HolySanctuary |

### Model Loading

- **3 slot GLB** dimuat per pertempuran: tank, archer, mage.
- `getModelsForMatchup(baseModel)` memilih _nama_ model per slot.
- `UnitRenderer` memetakan `uType`: 0→gltfTank, 1→gltfArcher, 2/3→gltfMage.
- **Healer tidak punya model sendiri**, pakai model Mage.

---

## Phase 1: 6 Archetype — Tambah Skill Baru & Rebalance (Prioritas SEKARANG)

### Tujuan

Dari 4 tipe jadi 6 tipe. Tidak perlu ubah STRIDE. Tidak perlu model baru.

### 1.1 Ubah `src/simulation/constants.ts`

```typescript
// Class Types — diperluas ke 8 (Phase 1 gunakan 0-5)
export const TYPE_KNIGHT = 0; // Tank lama, tetap
export const TYPE_ARCHER = 1; // Tetap
export const TYPE_MAGE = 2; // Tetap
export const TYPE_ACOLYTE = 3; // Healer upgrade
export const TYPE_GUNSLINGER = 4; // Archer v2, range + crit burst
export const TYPE_ASSASSIN = 5; // Low HP, stealth, backstab
// Phase 3 nanti:
// export const TYPE_MERCHANT  = 6;
// export const TYPE_DRUID     = 7;
```

### 1.2 Ubah `src/simulation/config.ts`

#### HP_PER_TYPE (tambah 4,5)

```typescript
4: 200, // Gunslinger — fragile, relies on evasion
5: 160, // Assassin — most fragile
```

#### ARMOR (tambah 4,5)

```typescript
4: 0.05, // Gunslinger — light armor
5: 0.0,  // Assassin — no armor, glass cannon
```

#### ATTRIBUTES (tambah 4,5)

```typescript
4: { // Gunslinger
    moveSpeed: 0.030,
    attackRange: 7.0,
    baseDamage: 22,      // High single-target
    attackInterval: 50,   // Slow but heavy hits
},
5: { // Assassin
    moveSpeed: 0.055,     // Tercepat
    attackRange: 1.2,     // Melee
    baseDamage: 28,       // Damage tertinggi
    attackInterval: 35,   // Cepat
},
```

#### Skill Configs

##### GUNSLINGER_SKILLS (TYPE=4)

```
skill1 "High Noon"  — single target, high crit damage (35 dmg), cd 500
skill2 "Smoke Bomb" — self stealth 60 ticks, blocks targeting, cd 600
skill3 "Fan Fire"   — AoE cone (2.5 radius), 18 dmg × 3 hits spread, cd 700
```

##### ASSASSIN_SKILLS (TYPE=5)

```
skill1 "Shadow Step" — teleport behind target (+3 range instant), cd 350
skill2 "Backstab"    — if behind target: 40 dmg; else 15 dmg; cd 420
skill3 "Poison Blade" — DoT 6 dmg/tick × 30 ticks on target, cd 550
```

#### Acolyte Upgrade (TYPE=3 — ganti Healer)

Skill tetap sama tapi ubah nilai & nama:

```
skill1 "Holy Light"   — heal single 15, cd 300 (up dari 12/350)
skill2 "Blessing"     — buff ally: +30% damage 80 ticks, cd 400
skill3 "Sanctuary AoE" — heal 10 in radius 5.0, cd 600
```

### 1.3 Ubah `src/simulation/battle.worker.ts`

#### Import tambahan

```typescript
TYPE_GUNSLINGER, TYPE_ASSASSIN,
GUNSLINGER_SKILLS, ASSASSIN_SKILLS,
```

#### Spawn logic (line ~120-137)

Tambahkan distribusi Gunslinger dan Assassin dalam spawn:

```typescript
// Per tim: ~33% Knight, ~17% Archer, ~17% Mage, ~17% Acolyte, ~8% Gunslinger, ~8% Assassin
if (localIdx < tankCount)       unitType = TYPE_KNIGHT;
else if (localIdx < tankCount + archerCount) unitType = TYPE_ARCHER;
else if (...) unitType = TYPE_MAGE;
else if (...) unitType = TYPE_ACOLYTE;
else if (...) unitType = TYPE_GUNSLINGER;
else                           unitType = TYPE_ASSASSIN;
```

#### Targeting (line ~573-575)

```typescript
// Assassin targets lowest HP enemy
if (uType === TYPE_ASSASSIN) {
    target = findLowestHpEnemy(d, i);
}
// Gunslinger targets highest threat (same as archer)
else if (uType === TYPE_GUNSLINGER) {
    target = findClosestEnemy(d, i);
}
// Acolyte: same as healer logic
```

#### Skill branches (setelah blok Mage skill, sebelum Healer/Acolyte)

- **Gunslinger** branch: High Noon (single nuke), Smoke Bomb (stealth), Fan Fire (AoE cone)
- **Assassin** branch: Shadow Step (teleport), Backstab (conditional), Poison Blade (DoT)
- **Acolyte** branch: reuse Healer structure dengan nama skill baru

#### `effectState` usage untuk mechanic baru

- `effectState = 1` → stunned (existing, FrostNova)
- `effectState = -1` → defense buff (existing, DivineShield)
- `effectState = 2` → stealthed — tidak bisa di-target
- `effectState = -2` → damage buff (Blessing)
- `effectState = 3` → poisoned (DoT tick per frame di update loop)
- Kode update loop perlu cek `effectState > 0` untuk stun/stealth, `effectState < 0` untuk buff/debuff

**Ponytail: `effectState` saat ini hanya dipakai binary (>0 stun, <0 buff). Tambah nilai spesifik tidak butuh slot baru — tinggal decode di skill branch.**

Namun DoT butuh tracking _siapa yang nge-poison_. Solusi: Assassin yang kena poison menyimpan attacker di targetIdx selama poison aktif, atau gunakan slot `skill3Cd` sebagai DoT remaining ticks.

### 1.4 Ubah `src/graphics/core/UnitRenderer.ts`

#### Model mapping (line 87-117)

```typescript
// Tambah mapping: TYPE_GUNSLINGER → Archer model, TYPE_ASSASSIN → Archer model
// (pakai Rogue_Hooded atau Rogue dari yang sudah ada)
if (uType === 1 || uType === 4 || uType === 5) targetGLTF = gltfArcher;
else if (uType === 2 || uType === 3) targetGLTF = gltfMage;
else targetGLTF = gltfTank;
```

#### Scale & HP bar (line 526-530)

```typescript
if (uType === 0)
    scale = 0.85; // Knight
else if (uType === 1 || uType === 4)
    scale = 0.42; // Archer & Gunslinger
else if (uType === 2 || uType === 3)
    scale = 0.6; // Mage & Acolyte
else if (uType === 5) scale = 0.38; // Assassin — kecil
```

#### UI label (`initNameBars`, `ui_billboards.ts`)

Perlu mendeteksi `baseModel` untuk menentukan label. Tambahkan mapping type→label:

```typescript
// Knights: "Knight", Archer: "Archer", Gunslinger: "Gunner", dll
```

### 1.5 Ubah `src/graphics/ui/ui_billboards.ts`

Label texture perlu support lebih dari 2 variasi (Team A & B). Saat ini hanya `nameBarsA` (team 0) dan `nameBarsB` (team 1) — 1 label per tim. Seluruh unit dalam tim dapat label yang sama ("Tank"/"Mage" dst).

**Untuk Phase 1:** Pertahankan sistem 2 label per tim — tapi label jadi lebih generik per matchup, tidak per type. Atau tambah InstancedMesh baru per type (memory overhead: 6× TEAM_SIZE mesh).

**Ponytail: tetap 2 label. Label text menampilkan matchup name bukan unit type individu. Cukup untuk sekarang. Nanti Phase 3 jika butuh label per type, tambah 4 InstancedMesh lagi.**

---

## Phase 2: Model Diversifikasi & Visual Polish

Setelah skill system stabil:

1. **Load 1 GLB tambahan** — model Acolyte (misal dari asset baru atau re-use dengan material berbeda)
2. **Mapping visual:** Knight→Tank, Ranger→Archer, Rogue→Assassin+Gunslinger, Mage→Mage, Acolyte→Healer
3. **Material tinting:** Pakai `teamMatA/B` untuk bedakan team via warna
4. **Skill FX baru:** Smoke bomb particle, poison glow, backstab slash effect — di `SkillFX.ts` & `FXCore.ts`

---

## Phase 3: Merchant & Druid (Mechanic Kompleks)

1. **TYPE_MERCHANT (6):**
    - Skill1 "Trade Route": buff moveSpeed team AoE
    - Skill2 "Gold Armor": single ally shield + reflect 50% damage
    - Skill3 "Market Crash": AoE debuff enemy damage -30%
    - Mechanic: buff/debuff aura, tracking butuh slot — reuse effectState dengan value -3 s/d -6

2. **TYPE_DRUID (7):**
    - Skill1 "Summon Wolf": spawn entity (butuh slot baru atau re-use dead unit slot)
    - Skill2 "Vine Trap": root enemy di tempat (set moveSpeed=0 via effectState)
    - Skill3 "Thorn DoT": AoE damage over time
    - Mechanic: **Summon = tantangan terbesar**. Butuh slot unit ekstra di ECS buffer atau re-use dead entity. Ponytail: re-use dead unit HP=-999 di-reset jadi summon.

---

## File Summary — Semua yang Perlu Disentuh

| File                                | Phase 1                                    | Phase 2                  | Phase 3             |
| ----------------------------------- | ------------------------------------------ | ------------------------ | ------------------- |
| `src/simulation/constants.ts`       | Tambah TYPE_4, TYPE_5                      | -                        | TYPE_6, TYPE_7      |
| `src/simulation/config.ts`          | HP, ARMOR, ATTRIBUTES, 3 skill config baru | -                        | 2 skill config baru |
| `src/simulation/battle.worker.ts`   | Spawn + targeting + 2 skill branch         | -                        | Summon mechanic     |
| `src/graphics/core/UnitRenderer.ts` | Model mapping, scale, label                | Load GLB ke-4, tint      | Model mapping baru  |
| `src/graphics/ui/ui_billboards.ts`  | -                                          | -                        | Label per-type?     |
| `src/graphics/core/scene.ts`        | -                                          | Tambah GLB loader slot   | -                   |
| `src/graphics/effects/SkillFX.ts`   | -                                          | Smoke, poison, shadow FX | Summon FX           |
| `src/graphics/effects/FXCore.ts`    | -                                          | particle presets baru    | -                   |

---

## Check: Tidak Ada yang Pecah

- **STRIDE tetap 15** — tidak ada field baru di ECS
- **SAB buffer size tetap** — `UNIT_COUNT * STRIDE * 4` tidak berubah
- **Interface `UnitAttributes`** — tambah entry di map, tipe tetap sama
- **`effectState`** — sudah `number`, bisa negatif/positif nilai berapa pun
- **`skill1/2/3Cd`** — sudah dipakai per-type berbeda, tidak konflik
- **`immuneCd`** — hanya dipakai Tank (Bulwark), tipe lain pakai untuk hal berbeda via konvensi

---

## Execution Order (Yang Kamu Harus Lakukan)

### Phase 1 — Satu-satu, test setiap langkah:

1. ✅ `constants.ts`: tambah TYPE_KNIGHT (alias), TYPE_GUNSLINGER=4, TYPE_ASSASSIN=5
2. ✅ `config.ts`: HP_PER_TYPE[4], [5]; ARMOR[4], [5]; ATTRIBUTES[4], [5]; GUNSLINGER_SKILLS, ASSASSIN_SKILLS, rename HEALER_SKILLS → ACOLYTE_SKILLS
3. ✅ `battle.worker.ts`: import baru; spawn distribusi 6 tipe; targeting Assassin; skill branch Gunslinger + Assassin; update effectState handling
4. ✅ `UnitRenderer.ts`: model mapping uType 4,5; scale 4,5; label update
5. ✅ `ui_billboards.ts`: label text per-matchup
6. ✅ `npm run dev` — test pertempuran

### Phase 2 — Setelah Phase 1 stabil:

7. ✅ Cari/load 1 model GLB tambahan (Acolyte/Priest)
8. ✅ `UnitRenderer.ts`: mapping model ke-4
9. ✅ `SkillFX.ts`: efek visual skill baru

### Phase 3 — Setelah Phase 2 stabil:

10. ✅ TYPE_MERCHANT + TYPE_DRUID + skill + summon mechanic

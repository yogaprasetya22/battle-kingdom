# Debug Performance Report — Multi-Trade Three.js Battle Simulator

> **Tanggal:** 2026-08-03  
> **Target Analisis:** 100v100 unit, 6 tipe unit, 18 skill unik, ~66 tick/detik simulasi  
> **Metodologi:** Static code analysis seluruh codebase, tidak ada profiling runtime

---

## 1. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────┐
│ MAIN THREAD (requestAnimationFrame ~60fps)          │
│  ├─ Render loop: delta clock, scene, camera         │
│  ├─ updateFrame(data, delta): 200 unit loop         │
│  ├─ updateFX(delta): activeFX[] reverse-loop        │
│  ├─ spawnSkillFX(): dispatch 22+ skill → FX func    │
│  └─ Stats panel: fps, draw calls, triangles, etc.   │
├─────────────────────────────────────────────────────┤
│ SharedArrayBuffer (Float32Array, 200×15 = 3000)     │
│  [x,y,z,hp,target,team,anim,type,sk1cd,sk2cd,sk3cd,│
│   maxHp,attackCd,effectState,immuneCd] × 200         │
├─────────────────────────────────────────────────────┤
│ WEB WORKER 0 + WEB WORKER 1 (sharded per unit)      │
│  ├─ tick(d): spatial grid + skill + move + attack   │
│  ├─ postMessage({type:"skillFX",...}) → main thread │
│  └─ postMessage({type:"done",tickId,...}) → sync    │
└─────────────────────────────────────────────────────┘
```

**Kunci bottleneck arsitektur:**

- Main thread lakukan **semua rendering + semua FX visual** sementara worker hanya simulasi.
- Setiap `postMessage` dari worker ke main thread trigger `spawnSkillFX()` yang **synchronous dalam render loop**.
- Tidak ada batching skillFX — satu postMessage = satu spawn call.

---

## 2. Analisis Pergerakan Per Unit Type

### 2.1 Data Movement (`src/simulation/config.ts:35-56`)

| Tipe           | moveSpeed | attackRange | attackInterval | baseDamage | maxHP |
| -------------- | --------- | ----------- | -------------- | ---------- | ----- |
| Tank (0)       | 0.035     | 1.8         | 65 tick        | 10         | 450   |
| Archer (1)     | 0.025     | 6.0         | 40 tick        | 12         | 240   |
| Mage (2)       | 0.020     | 12.0        | 60 tick        | 15         | 210   |
| Healer (3)     | 0.024     | 8.0         | 75 tick        | 3 (heal)   | 180   |
| Gunslinger (4) | 0.030     | 7.0         | 50 tick        | 22         | 200   |
| Assassin (5)   | 0.055     | 1.2         | 35 tick        | 28         | 160   |

### 2.2 Movement Loop (`src/simulation/battle.worker.ts:1494-1620`)

Setiap tick, setiap unit (200 unit) jalankan:

1. **Separation force** — query 3×3 spatial grid cells, O(n) dengan batas 9 cell. Force kalkulasi `sqrt()` per neighbor dalam radius `SEPARATION_RADIUS=0.95`.
2. **Move toward target** — `pos += nx * mySpeed`, `pos += nz * mySpeed`
3. **Terrain height lookup** — `getTerrainHeight(x, z)` dengan LRU cache 1024 entry
4. **Boundary clamp** — `Math.min/max` ke `BOUND_X_MIN/MAX`, `BOUND_Z_MIN/MAX`

**Performance impact:**

- Separation: **200 unit × (avg 5-8 tetangga) × sqrt()** = ~1600 sqrt/tick. Aman.
- `getTerrainHeight()` — cache hit率高 karena pergerakan lambat, tapi setiap spawn/respawn trigger miss.
- **Tidak ada bottleneck signifikan di movement murni.**

### 2.3 Targeting System (`src/simulation/battle.worker.ts:228-443`)

- `findNearestEnemy()`: query 3×3 grid, fallback 5×5, fallback full-slice
- `findLowestHpEnemy()`: sama, tapi cari HP terendah
- `findLowestHpAlly()`: untuk Healer

**Throttle:** Target re-evaluasi di-throttle:

- Target invalid (mati/stealth): setiap 8 tick
- Target valid: setiap 4 tick  
  → Rata-rata hanya 25-50 unit re-target per tick. **Bottleneck rendah.**

### 2.4 Render-Side Movement (`src/graphics/core/UnitRenderer.ts:562-724`)

Setiap frame, 200 unit:

1. **Frustum culling** — `_frustum.intersectsSphere()` per unit
2. **Distance LOD** — `distSq < UNIT_LOD_DIST_SQ=6025` (~77 unit)
3. **Position interpolation** — LERP_SPEED=12, hanya jika `inView`
4. **Rotation slerp** — `unit.root.lookAt()` + `quaternion.slerp()` hanya jika `targetIdx !== -1`
5. **Animation state switch** — `fadeToAnimation()` jika `currentAnimState !== state`
6. **Mixer update** — `unit.mixer.update(delta)` hanya jika inView+showMesh+!assassinTooFar
7. **Billboard updates** — 4 InstancedMesh × lookAt + matrix: HP bg, HP fg, name A/B, cd/imune rings

**Bottleneck utama render movement:**

- **Billboard `lookAt()` per unit terlihat** → 4× `Object3D.lookAt()` + `updateMatrix()` per unit. Untuk ~80 unit terlihat = 320 matrix transform/frame. **Ini mahal.**
- **Animation mixer update** — Setiap mixer.update() menghitung skeleton hierarchy 50+ bones. Dengan 200 unit, bahkan yang di-throttle assassin tetap berat.

---

## 3. Analisis Skill System

### 3.1 Worker-Side Skill Processing

**Total 18 skill unik** dieksekusi di worker, masing-masing dengan:

- Cooldown check → damage/heal calculation → queueDamage/applyDamage → postMessage FX

**Skill per tipe:**

| Tipe       | Skill 1                     | Skill 2                      | Skill 3                        | Operasi Berat                                                                      |
| ---------- | --------------------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Tank       | Bulwark Stance (self-buff)  | Taunt (target force)         | Shield Bash (damage+knockback) | ShieldBash: spatial query 3×3                                                      |
| Archer     | Double Shot (single target) | Evasive Leap (teleport self) | Arrow Volley (AoE)             | ArrowVolley: spatial query 3×3, multiple queueDamage                               |
| Mage       | Frost Nova (AoE stun)       | Chain Lightning (chain 4)    | Fireball (big AoE)             | ChainLightning: loop 3×, nested spatial query; Fireball: sort top-4 selection sort |
| Healer     | Rejuvenation (heal)         | Divine Shield (buff)         | Holy Sanctuary (AoE heal)      | HolySanctuary: spatial query 3×3, max 5 heal                                       |
| Gunslinger | High Noon (single nuke)     | Smoke Bomb (self stealth)    | Fan Fire (AoE multi-hit)       | FanFire: spatial query 3×3, 3×queueDamage per target                               |
| Assassin   | Shadow Step (teleport)      | Backstab (melee nuke)        | Poison Blade (DoT)             | Semua ringan, single target                                                        |

**Bottleneck worker skill:**

- **Chain Lightning** (`battle.worker.ts:1065-1161`) — nested while loop + spatial query per chain, hingga 4 chain. O(chains × grid_cells). **Paling mahal di worker.**
- **Fireball top-4 sort** (`battle.worker.ts:1209-1227`) — selection sort O(n²) untuk candidate array ≤64. Aman, tapi tetap O(n²).
- **Banyak `postMessage`** — setiap skill activation kirim message ke main thread. Dalam 1 tick dengan 15+ skill aktif, 15 postMessage = overhead serialization.

### 3.2 Main-Thread SkillFX Dispatch

`spawnSkillFX()` di [`src/graphics/core/renderer.ts:70-246`](src/graphics/core/renderer.ts:70) dispatch 22+ tipe skill ke fungsi visual.

Setiap fungsi FX di [`src/graphics/effects/SkillFX.ts`](src/graphics/effects/SkillFX.ts) lakukan:

1. `canSpawnFX()` check — batas 150 active FX
2. Buat geometry + material (pooled atau baru)
3. Buat mesh / InstancedMesh
4. `scene.add()`
5. Push callback ke `activeFX[]`

---

## 4. Analisis FX Visual — Kategorisasi Berat

### 4.1 FX Ringan (≤5 mesh, durasi pendek)

| Skill         | Mesh Count                    | Pooled?                                | Durasi     |
| ------------- | ----------------------------- | -------------------------------------- | ---------- |
| Shadow Step   | 5 puff (pooledPlane)          | ✅ Material pooled                     | 0.25-0.45s |
| Backstab      | 3 slash (pooledPlane)         | ✅ Material pooled                     | 0.3s       |
| Poison Blade  | 5 bubble (pooledPlane)        | ✅ Material pooled                     | 0.6-0.9s   |
| Double Shot   | 2 arrow trail + 2 impact ring | ✅ Pooled                              | 0.3s       |
| Evasive Leap  | 5 puff + 1 flash              | ✅ Pooled                              | 0.2-0.4s   |
| Basic Heal    | 1 beam + particles            | ⚠️ New PlaneGeometry                   | 0.4s       |
| Divine Shield | 1 ring + 1 pillar + runes     | ❌ New RingGeometry + CylinderGeometry | 1.3s       |

### 4.2 FX Sedang (5-15 mesh, InstancedMesh)

| Skill        | Mesh Count                                    | Pooled?                               | Durasi |
| ------------ | --------------------------------------------- | ------------------------------------- | ------ |
| Taunt        | 1 sprite + InstancedMesh(particles)           | ⚠️ Canvas tex regenerated             | 1.0s   |
| Shield Bash  | 1 flash + InstancedMesh(sparks)               | ⚠️ New geometry for sparks            | 0.4s   |
| High Noon    | muzzle+trail+explosion+ring+InstancedMesh(15) | ✅ Pooled geometry, material          | 0.5s   |
| Smoke Bomb   | ring+flash+InstancedMesh(14)+InstancedMesh(8) | ✅ Pooled                             | 0.85s  |
| Frost Nova   | InstancedMesh(ice shards) + ring              | ❌ New FrostNovaMat (shader compile!) | 0.6s   |
| Rejuvenation | Heal beams + particles                        | ⚠️ New PlaneGeometry per beam         | 0.4s   |

### 4.3 FX Berat (15+ mesh, multiple InstancedMesh, geometry baru)

| Skill               | Mesh Count                                                                                  | Pooled?                                            | Durasi   | Masalah                                         |
| ------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- | ----------------------------------------------- |
| **Arrow Volley**    | 60 arrows + 60 impact rings = 120                                                           | ❌ **60× CylinderGeometry BARU** setiap spawn!     | 0.5-0.7s | **TERBERAT:** 60 geometry allocation per volley |
| **Fireball**        | Meteor trail + InstancedMesh(embers) + smoke + explosion                                    | ⚠️ Meteor: new SphereGeometry + new ShaderMaterial | 1.0s     | ShaderMaterial onBeforeCompile setiap spawn     |
| **Chain Lightning** | N-1 cylinder segments + spheres                                                             | ❌ **New CylinderGeometry per segment!**           | 1.1s     | Setiap chain bikin geometry baru                |
| **Fan Fire**        | rune(PlaneGeometry baru) + ring + InstancedMesh(12) + InstancedMesh(10) + InstancedMesh(12) | ❌ PlaneGeometry BARU + 3 InstancedMesh            | 0.55s    | Banyak InstancedMesh dispose/recreate           |
| **Holy Sanctuary**  | RingGeometry + 4 CylinderGeometry                                                           | ❌ **New geometry per spawn**                      | 0.9s     | 4 pillar cylinder baru                          |
| **Iron Fortitude**  | Aura ring + particles                                                                       | ❌ ShaderMaterial onBeforeCompile (setiap unit!)   | 2.0s     | **Shader recompile per spawn!**                 |

---

## 5. Event System & FPS Drop Triggers

### 5.1 `postMessage` Overhead

Setiap skill activation kirim `postMessage` dari worker ke main thread. Dalam battle intens dengan banyak unit, bisa 20-30 message/tick. Setiap message:

- Serialize object (posisi, tipe skill, parameter)
- Main thread process di `onmessage` handler (`main.ts:422-478`)
- Trigger `spawnSkillFX()` → synchronous scene mutation

**Bottleneck:** Tidak ada antrian atau batching. Jika 15 skill fire di 1 tick, 15 `spawnSkillFX()` dipanggil dalam 1 `onmessage` handler.

### 5.2 `activeFX[]` Update Loop

Di [`FXCore.ts:206-209`](src/graphics/effects/FXCore.ts:206), setiap frame:

```js
for (let i = activeFX.length - 1; i >= 0; i--) {
    if (!activeFX[i].update(delta)) activeFX.splice(i, 1);
}
```

- `splice()` = O(n) array shift setiap FX yang selesai
- Setiap FX update lakukan matrix calculation, InstancedMesh `setMatrixAt()`, `instanceMatrix.needsUpdate = true`
- **Dengan 100+ active FX, ini loop yang mahal.**

### 5.3 FPS Drop Skenario Spesifik

| Trigger                                   | Penyebab                                               | Severity    |
| ----------------------------------------- | ------------------------------------------------------ | ----------- |
| **10+ Archer Arrow Volley bersamaan**     | 10 × 60 = 600 CylinderGeometry baru + 600 impact plane | 🔴 KRITIKAL |
| **5+ Mage Fireball bersamaan**            | 5 ShaderMaterial compile + 5 meteor SphereGeometry     | 🔴 KRITIKAL |
| **Mass stealth break** (assassin execute) | Banyak backstab/poison FX + damage queue               | 🟡 SEDANG   |
| **Holy Sanctuary + Divine Shield combo**  | RingGeometry + CylinderGeometry baru × banyak healer   | 🟡 SEDANG   |
| **Billboard update 80+ unit**             | 320+ lookAt + updateMatrix per frame                   | 🟡 SEDANG   |
| **Animation mixer 80+ unit**              | 80 skeleton hierarchy traversal                        | 🟡 SEDANG   |
| **Spawn wave**                            | 20 unit baru spawn → init mesh, material, sound        | 🟢 RINGAN   |
| **Death sequence**                        | fadeToAnimation + death sound + ice shatter FX         | 🟢 RINGAN   |

---

## 6. Existing Optimizations (Sudah Ada)

| Optimasi                             | Lokasi                     | Efektivitas               |
| ------------------------------------ | -------------------------- | ------------------------- |
| Spatial grid (cellSize=6.0)          | `battle.worker.ts:109-127` | ✅ O(1) neighbor query    |
| Frustum culling                      | `UnitRenderer.ts:640`      | ✅ Skip off-screen render |
| LOD distance culling (77 unit)       | `UnitRenderer.ts:643`      | ✅ Skip mesh far away     |
| Billboard distance culling (80 unit) | `UnitRenderer.ts:834`      | ✅ Skip label calc        |
| Assassin weapon LOD (35 unit)        | `UnitRenderer.ts:652`      | ✅ Skip dagger render     |
| Assassin mixer throttle (>35 unit)   | `UnitRenderer.ts:811-816`  | ✅ Skip skeleton anim     |
| Target search throttle (4-8 tick)    | `battle.worker.ts:727-728` | ✅ Kurangi re-target      |
| Terrain height LRU cache (1024)      | `constants.ts:117-142`     | ✅ Kurangi kalkulasi      |
| Material pool (max 40 per key)       | `FXCore.ts:104-148`        | ✅ Material reuse         |
| Geometry pool (plane + ring)         | `FXCore.ts:29-59`          | ✅ Plane/Ring reuse       |
| FX quality scaling                   | `FXCore.ts:216-221`        | ✅ Auto turun kualitas    |
| MAX_FX_HARSH=150                     | `FXCore.ts:203`            | ✅ Cegah overflow         |
| Death early-continue (>2s)           | `UnitRenderer.ts:621`      | ✅ Skip dead unit         |
| HP atomics (CAS)                     | `battle.worker.ts:517-556` | ✅ Thread safety          |

---

## 7. Rekomendasi Optimasi

### 7.1 Prioritas TINGGI (FPS impact besar)

**1. Pool geometry untuk Arrow Volley & Chain Lightning**

- [ ] 60 CylinderGeometry di `spawnArrowVolleyFX()` → pool shared cylinder geometry
- [ ] CylinderGeometry di chain lightning → pool per segment
- Estimasi hemat: **15-25% FPS** saat banyak archer/mage

**2. Batch skillFX postMessage**

- [ ] Akumulasi skill events di worker, kirim 1 array per tick
- [ ] Main thread process array, bukan satu per satu
- Estimasi hemat: **5-10% FPS** di battle intens

**3. Billboard update throttling**

- [ ] Update billboard setiap 2-3 frame (bukan setiap frame)
- [ ] Gunakan dirty flag: hanya update jika HP berubah atau unit pindah signifikan
- Estimasi hemat: **5-8% FPS** saat >50 unit visible

### 7.2 Prioritas SEDANG

**4. ShaderMaterial pre-compile**

- [ ] `IronFortitudeMat` dan `FrostNovaMat` — pre-compile di init, jangan per-spawn
- [ ] Simpan di pool, clone dengan `material.clone()` (lebih murah dari onBeforeCompile)
- Estimasi hemat: **3-5% FPS** saat skill pertama kali dipakai

**5. activeFX splice() ganti dengan swap-pop**

- [ ] Ganti `splice(i,1)` dengan `activeFX[i] = activeFX[activeFX.length-1]; activeFX.pop()`
- [ ] Terima urutan tidak penting (callback sudah selesai)
- Estimasi hemat: **1-2% FPS**, mencegah GC spike

**6. Animation mixer batching**

- [ ] Gunakan `AnimationClockManager` yang sudah ada tapi tidak terpakai
- [ ] Throttle mixer.update() untuk unit jauh (update rate 15-30fps bukan 60fps)
- Estimasi hemat: **5-10% FPS** saat >100 unit alive

### 7.3 Prioritas RENDAH

**7. InstancedMesh untuk billboard**

- [ ] Ganti 4 individual `Object3D.lookAt()` dengan matrix kalkulasi langsung ke buffer
- [ ] Gunakan pre-allocated matrix array
- Estimasi hemat: **2-3% FPS**

**8. Fireball selection sort → partial sort**

- [ ] 4 terdekat dari 64 tidak perlu full sort — gunakan partial selection
- Estimasi hemat: negligible per tick, tapi akumulasi

---

## 8. Ringkasan Bottleneck Root Cause

| Root Cause                               | File               | Line                 | Impact                     |
| ---------------------------------------- | ------------------ | -------------------- | -------------------------- |
| 60× CylinderGeometry per Arrow Volley    | `SkillFX.ts`       | 225-260              | FPS spike setiap volley    |
| CylinderGeometry per chain segment       | `SkillFX.ts`       | 120-170              | FPS spike setiap lightning |
| Billboard 4× lookAt per unit per frame   | `UnitRenderer.ts`  | 842-871              | Konstan FPS drain          |
| Animation mixer per skeleton             | `UnitRenderer.ts`  | 820                  | Konstan FPS drain          |
| ShaderMaterial onBeforeCompile per spawn | `FXCore.ts`        | 153-177, 179-198     | Stutter saat skill pertama |
| `activeFX.splice()` di loop utama        | `FXCore.ts`        | 208                  | GC pressure                |
| SphereGeometry baru per fireball meteor  | `SkillFX.ts`       | 370-430              | FPS spike setiap fireball  |
| Tidak ada batching skill event           | `battle.worker.ts` | banyak `postMessage` | Message overhead           |

---

**Kesimpulan:**
Masalah FPS turun paling parah disebabkan oleh **alokasi geometry baru setiap skill FX**, terutama Arrow Volley (60 cylinder/volley) dan Chain Lightning (cylinder per segment). Diikuti oleh **billboard update setiap frame untuk semua unit terlihat** dan **animation mixer tanpa throttling**. Arsitektur worker sudah optimal untuk simulasi, tapi bridge `postMessage` → `spawnSkillFX` belum di-batching. Prioritas perbaikan: pool geometry untuk Arrow Volley & Chain Lightning, batch postMessage skill events, throttle billboard updates.

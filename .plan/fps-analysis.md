# ⚔️ Battle Kingdom — Analisis Root Cause FPS Drops

> Data: 1000 frames | Avg FPS: **50.2** | Low FPS frames: **61.1%** | Target: 60 FPS

---

## 🔍 Summary Eksekutif

FPS drop bukan dari satu titik, tapi dari **4 bottleneck yang saling menumpuk** di main thread setiap frame:

| # | Bottleneck | Kontribusi CPU | % Frames |
|---|-----------|---------------|---------|
| 1 | **Skeletal Mixer Update** | avg **8.23ms** / max **24.38ms** | 100% |
| 2 | **Billboard Matrix + InstancedMesh** | avg **4.11ms** / max **12.19ms** | 99% |
| 3 | **Draw Calls terlalu tinggi** | avg **521 calls** (target < 200) | 100% |
| 4 | **Triangle count terlalu tinggi** | avg **980K tris** | 100% |

Total CPU kerja per frame: **avg 17.44ms** dari budget **20.56ms** — hanya **~3ms tersisa untuk GPU**.
Saat spike terjadi (max 32.6ms), GPU tidak sempat render → frame drop ke **16-33 fps**.

---

## 🧠 Root Cause #1: Skeletal Animation Mixer — **8.23ms avg**

### Lokasi Kode
[UnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/UnitRenderer.ts#L925-L951) — baris 925–951

### Masalah yang Ditemukan

```typescript
// L926-L931: Animation LOD sudah ada, TAPI hanya 2 tier
let skipFrames = 1;
if (distSq > 1600) {      // > ~40u: update 1 per 4 frame
    skipFrames = 4;
} else if (distSq > 800) { // > ~28u: update 1 per 2 frame
    skipFrames = 2;
}

// L942-L948: Mixer tetap diupdate walaupun pakai accumulated delta
if (shouldUpdateMixer) {
    unit.accumulatedDelta += delta;
    if (unit.animationFrameSkipCount >= skipFrames) {
        unit.mixer.update(unit.accumulatedDelta); // ← tetap Three.js mixer full
        unit.accumulatedDelta = 0;
    }
}
```

**Masalah utama:**
1. **`shouldUpdateMixer` terlalu longgar** (baris 936-940): masih update unit yang `showMesh` (< 85 unit distance) dan `inView`. Dengan 200 unit, bisa 100+ unit mixer aktif per frame.
2. **MAX_MIXER_UPDATES_PER_FRAME = 20** (baris 596) didefinisikan **tapi TIDAK DIPAKAI** — `animFrameBatch` di-reset tiap frame (baris 635) tapi tidak pernah di-cap. Bug!
3. **Three.js `AnimationMixer.update()`** mahal karena menghitung bone matrices + quaternion interpolation untuk semua clip aktif.

### Data Bukti
```
animationsMs max = 24.38ms → jelas mixer spike
Pattern: FPS drop dari 42→33 fps pada frame yang animationsMs naik ke 12ms+
```

---

## 🎯 Root Cause #2: Billboard Matrix — **4.11ms avg**

### Lokasi Kode
[UnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/UnitRenderer.ts#L953-L1002) dan [VATUnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/VATUnitRenderer.ts#L640-L698)

### Masalah yang Ditemukan

Setiap frame untuk **setiap unit visible (max 200 unit)**:

```typescript
// Per unit: 2-4x dummy.updateMatrix() calls
dummy.position.set(meshX, billY, meshZ);
dummy.scale.set(1, 1, 1);
dummy.quaternion.copy(_billboardQuat);
dummy.updateMatrix();               // ← Matrix4 compose (expensive)
hpBarsBg.setMatrixAt(i, dummy.matrix);

// Lagi untuk namebar:
dummy.position.set(meshX, billY + 0.18, meshZ);
dummy.updateMatrix();               // ← lagi!
nameBarsA.setMatrixAt(i, dummy.matrix);
```

**Isu spesifik:**
1. **`dummy.updateMatrix()`** → `Matrix4.compose(position, quaternion, scale)` → decompose rotation → 9+ multiply operasi. Dipanggil **2-3x per unit** = 400-600 kali per frame!
2. **`frustumCulled = false`** di semua billboard mesh ([ui_billboards.ts:114](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/ui/ui_billboards.ts#L114)) → GPU harus proses SEMUA instance, bukan cuma yang visible.
3. Setiap `setMatrixAt` + `instanceMatrix.needsUpdate = true` upload ulang **seluruh buffer** ke GPU (UNIT_COUNT × 16 floats × 4 bytes = 200 × 64 = 12.8KB per mesh × 6 mesh = **76KB GPU upload per frame**).

### Data Bukti
```
billboardsMs max = 12.19ms → langsung korelasi dengan draw call spike
[99% frames] Billboard bottleneck terdeteksi
```

---

## 🔺 Root Cause #3: Draw Calls Tinggi — **521 avg, max 834**

### Akar Masalah

Draw calls berasal dari banyak objek scene yang **tidak di-instanced/batched**:

| Sumber | Estimasi DCs |
|--------|-------------|
| Unit meshes (200 unit × ~2-3 meshes) | ~400-600 |
| Billboard InstancedMesh (6 buah) | 6 |
| Ice InstancedMesh | 1 |
| Scenery (Trees, Grass, Flowers, Castle, Floor, Water) | ~50-100 |
| Effects / SkillFX | ~20-50 |

**Penyebab utama draw call tinggi pada unit:**
- Skeletal mode: setiap unit adalah **separate scene object** (bukan InstancedMesh) → 1 draw call per mesh per unit
- Dengan 200 unit × avg ~2.5 meshes = **500 draw calls hanya dari unit**
- Tidak ada geometry batching; setiap weapon juga draw call tersendiri

### Catatan Penting
> Data `isSkeleton: false` di semua frame → ini mode **non-skeletal (VAT)** yang lebih efisien. Tapi draw calls tetap 521 avg — artinya ada masalah lain di scene graph.

---

## 🔷 Root Cause #4: Triangle Count — **980K avg**

### Analisis

980K triangles untuk 200 unit sangat tinggi. Rata-rata per unit = **4,900 tris**.

**Kontributor:**
1. **Model karakter high-poly** — tidak ada LOD geometry swap, hanya visibility hide/show
2. **Scenery objects** (Trees, Grass, Flowers) dengan geometry detail tinggi selalu render
3. **`UNIT_LOD_DIST_SQ = 7225` (85u)** sangat jauh — unit di jarak 85 unit masih render full mesh
4. **Weapons** juga add triangle count (bow string, sword, shield dll)

---

## ⚡ Rekomendasi Fix (Prioritas)

### 🔴 P0 — Fix Bug MAX_MIXER_UPDATES_PER_FRAME

File: [UnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/UnitRenderer.ts#L594-L596)

```typescript
// SEKARANG (bug — batch tidak dipakai):
let animFrameBatch: number[] = [];
const MAX_MIXER_UPDATES_PER_FRAME = 20;
// ... animFrameBatch.length = 0; setiap frame tapi tidak pernah di-cek

// FIX — batching yang benar:
let mixerUpdatesThisFrame = 0;

// Di dalam loop:
if (shouldUpdateMixer && mixerUpdatesThisFrame < MAX_MIXER_UPDATES_PER_FRAME) {
    unit.accumulatedDelta += delta;
    if (unit.animationFrameSkipCount >= skipFrames) {
        unit.mixer.update(unit.accumulatedDelta);
        unit.accumulatedDelta = 0;
        unit.animationFrameSkipCount = 0;
        mixerUpdatesThisFrame++;
    }
}
```

**Estimasi gain: ~4-6ms → FPS naik ~10-15**

---

### 🔴 P1 — Kurangi `dummy.updateMatrix()` calls

File: [UnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/UnitRenderer.ts#L953-L990)

```typescript
// SEKARANG: 2-3x updateMatrix() per unit

// FIX — manual compose tanpa Object3D:
// _billboardQuat sudah di-copy dari camera per frame
// compose matrix langsung tanpa decompose:
const _tempMatrix = new THREE.Matrix4();

// Dalam loop (satu kali compute per unit):
_tempMatrix.makeRotationFromQuaternion(_billboardQuat);
_tempMatrix.setPosition(meshX, billY, meshZ);
hpBarsBg.setMatrixAt(i, _tempMatrix);
hpBarsFg.setMatrixAt(i, _tempMatrix);  // reuse matrix yang sama

_tempMatrix.setPosition(meshX, billY + 0.18, meshZ);
nameBarsA.setMatrixAt(i, _tempMatrix);
```

**Estimasi gain: ~1.5-2ms → FPS naik ~5**

---

### 🟡 P2 — Kurangi Mixer Animation Tier

File: [UnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/UnitRenderer.ts#L926-L931)

```typescript
// FIX — tambah tier ke-3 untuk unit sangat jauh:
let skipFrames = 1;
if (distSq > 3600) {       // > ~60u: update 1 per 8 frame (nyaris freeze)
    skipFrames = 8;
} else if (distSq > 1600) { // > ~40u: update 1 per 4 frame
    skipFrames = 4;
} else if (distSq > 800) {  // > ~28u: update 1 per 2 frame
    skipFrames = 2;
}
```

**Estimasi gain: ~2-3ms → FPS naik ~5-8**

---

### 🟡 P3 — Batasi `instanceMatrix.needsUpdate` hanya kalau berubah

File: [UnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/UnitRenderer.ts#L1015-L1024)

```typescript
// SEKARANG: needsUpdate setiap frame saat isRunning

// FIX — track dirty flag per mesh:
let _hpBgDirty = false;
let _nameDirty = false;

// Di dalam loop, set flag saat ada perubahan:
if (showBillboard) { _hpBgDirty = true; _nameDirty = true; }

// Setelah loop:
if (_hpBgDirty) { hpBarsBg.instanceMatrix.needsUpdate = true; _hpBgDirty = false; }
```

**Estimasi gain: ~0.5-1ms GPU upload**

---

### 🟢 P4 — Reduce Draw Calls via Scene Batching

Sumber draw calls paling banyak adalah unit individual objects (skeletal mode).

**Opsi A**: Pertimbangkan switch ke **VAT (Vertex Animation Texture)** mode penuh → sudah tersedia di [VATUnitRenderer.ts](file:///home/yoga/Dokumen/game_3d/multi-trade-threejs/src/graphics/core/VATUnitRenderer.ts). VAT menggunakan lebih sedikit draw calls karena mengpakai GPU instancing.

**Opsi B**: Kurangi max **programs** (39 shader programs terdeteksi!) — shader compilation juga overhead.

---

## 📊 Estimasi FPS Setelah Fix

| Fix | Gain |
|-----|------|
| P0: Fix mixer batch bug | +10-15 FPS |
| P1: Kurangi updateMatrix() | +5 FPS |
| P2: Tambah LOD tier | +5-8 FPS |
| P3: Dirty flag upload | +2-3 FPS |
| **Total estimasi** | **+20-30 FPS** |

Target realistis: **65-70 FPS** (dari avg 50.2 saat ini).

---

## 🔑 Key Insight

> **`isSkeleton: false` di semua frame** → game sudah pakai VAT mode (GPU animation via EXR texture). Tapi `animationsMs avg 8.23ms` masih tinggi — ini berasal dari **UnitRenderer.ts skeletal mode** yang masih di-load paralel sebagai fallback, atau VAT `vatInst.update()` yang dipanggil untuk 100+ unit per frame tanpa cap.

> **Billboard bottleneck (4.11ms)** relatif besar dibanding animasi → optimasi billboard matrix (P1+P3) akan memberikan gain yang paling cepat dan aman.

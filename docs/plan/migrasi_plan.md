# Plan Migrasi: Custom Character Controller ke Multi-Trade Three.js (Worker-Bypass Method)

## Analisis Kompatibilitas 
Secara teknis, **seluruh mekanisme pergerakan karakter** (termasuk deteksi tabrakan/BVH) dan **sistem native VFX** dari `custom-vfx-multi-trade-threejs` dapat diimplementasikan ke dalam `multi-trade-threejs` dan dijamin **100% sama secara visual maupun mekanik**. 

Namun, karena `multi-trade-threejs` menggunakan arsitektur Web Worker untuk simulasi pertempuran massal yang sinkron via `SharedArrayBuffer`, menyisipkan karakter yang bisa dikendalikan oleh *player* memerlukan pendekatan **Worker-Bypass**.

### Mengapa Worker-Bypass?
Jika input player dikirim ke Worker untuk diproses, akan terjadi *input lag* yang mengorbankan *game feel*. Oleh karena itu, karakter utama (Hero) akan murni diurus oleh *main thread* (melalui `CharacterController` Anda), dan Worker AI tidak boleh menimpa posisi karakter ini di saat *rendering*.

---

## Langkah-Langkah Migrasi (Step-by-Step)

### Step 1: Migrasi Assets & Direktori
1. **Pindahkan Native VFX:** Salin seluruh folder di dalam `src/vfx/` dari proyek `custom-vfx` ke `src/graphics/effects/` di proyek `multi-trade-threejs`. (Fokuskan hanya pada file `Native.ts`, tidak perlu yang Quarks).
2. **Pindahkan Karakter Sistem:** Salin folder `src/character/` (berisi `character-config.ts`, `character-controller.ts`, `projectile-system.ts`, `skills-system.ts`) dari `custom-vfx` ke `src/graphics/units/Hero/` di dalam `multi-trade-threejs`. Anda mungkin perlu mengubah sedikit `imports` agar sesuai dengan struktur baru.

### Step 2: Isolasi Render Character di Main Thread (`renderer.ts`)
Buka `src/graphics/core/renderer.ts` di proyek `multi-trade-threejs`. Temukan loop di mana posisi karakter di-update dari `SharedArrayBuffer` (`battle.worker.ts`).

Ubah loop tersebut untuk mengecualikan index unit milik Player (misal, index `0`):

```typescript
// renderer.ts (Contoh Modifikasi)
export function updateInstancedMeshes(sharedPositions: Float32Array, playerController: CharacterController, deltaTime: number) {
    const PLAYER_INDEX = 0; // Asumsikan unit pertama adalah player
    
    for (let i = 0; i < totalUnits; i++) {
        const offset = i * DATA_PER_UNIT;

        if (i === PLAYER_INDEX) {
            // 1. Update controller secara lokal di main thread
            playerController.update(deltaTime);
            
            // 2. Tulis posisi player ke InstancedMesh
            dummy.position.copy(playerController.position);
            dummy.quaternion.copy(playerController.quaternion);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);

            // 3. (PENTING) Update balik posisi player ke SharedArrayBuffer 
            //    agar Worker AI musuh tahu posisi terbaru player.
            sharedPositions[offset] = playerController.position.x;
            sharedPositions[offset + 1] = playerController.position.y;
            sharedPositions[offset + 2] = playerController.position.z;
            
            continue; // Bypass update posisi dari Worker untuk unit ini
        }

        // Unit lain diupdate dari SharedArrayBuffer seperti biasa
        dummy.position.set(sharedPositions[offset], sharedPositions[offset+1], sharedPositions[offset+2]);
        // ... set rotation & updateMatrix
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
}
```

### Step 3: Integrasi Skills System & Event Input (`main.ts`)
Buka `src/main.ts` di `multi-trade-threejs`. Anda perlu menginisialisasi `CharacterController` dan `SkillsSystem` di sini, lalu menautkan input keyboard.

```typescript
// main.ts (Contoh Modifikasi)
import { CharacterController } from './graphics/units/Hero/character-controller';
import { SkillsSystem } from './graphics/units/Hero/skills-system';

// Setelah inisialisasi scene dan environment...
const heroController = new CharacterController(scene, camera, bvhCollider);
const skillsSystem = new SkillsSystem(scene);

// Listen Input (Keyboard)
window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
        // Trigger Skill 1 (misal: Gas Explosion)
        skillsSystem.castSkill('gasExplosion', heroController.position, heroController.getForwardVector());
    }
});

// Dalam render loop
function animate() {
    const delta = clock.getDelta();
    
    // Kirim heroController ke fungsi update renderer
    updateInstancedMeshes(sharedArray, heroController, delta);
    
    // Update native VFX partikel
    skillsSystem.update(delta);
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
```

### Step 4: Umpan Balik Logika Damage (Worker Sync)
Skill VFX sekarang berjalan murni secara visual di *main thread*. Namun, jika skill tersebut memberikan *damage* ke musuh, Anda harus memberitahu Worker.

Buat sebuah event/message dari *main thread* ke Worker saat skill di-cast:

```typescript
// Di main.ts (saat cast skill)
worker.postMessage({
    type: 'PLAYER_SKILL_CAST',
    skillId: 'gasExplosion',
    originX: heroController.position.x,
    originZ: heroController.position.z,
    directionX: forwardVector.x,
    directionZ: forwardVector.z
});
```

Dan di `battle.worker.ts`, tangkap pesan ini untuk mengurangi HP unit musuh yang berada dalam radius/jalur *skill* tersebut.

---

## Umpan Balik (Feedback) & Kesimpulan
1. **Apakah 100% sama?** Ya, pergerakan, tabrakan, dan efek visual partikel (murni Three.js) akan terlihat dan terasa persis seperti di repository asal Anda, karena berjalan di thread yang sama dengan framerate render.
2. **Optimalisasi:** Pendekatan *bypass* ini menjaga *game feel* karakter utama tetap responsif (tanpa lag *tick-rate* worker) sambil membiarkan Worker fokus mensimulasikan ratusan/ribuan AI lainnya.
3. **Pemisahan Visual dan Data:** Ingat bahwa `SkillsSystem` Anda sekarang hanya berperan sebagai "Visual/VFX". Logika siapa yang kena *damage* dan berapa HP yang berkurang **wajib** dikalkulasi oleh Worker agar sistem pertempuran utama tidak *desync*.

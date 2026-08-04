/**
 * IUnitVisual.ts — Cetak Biru (Interface) untuk semua karakter.
 * Setiap tipe unit WAJIB implementasi semua method di sini.
 * Ini memastikan UnitRenderer bisa memperlakukan semua karakter secara seragam.
 */
import * as THREE from "three";

export interface IUnitVisual {
    /** Root Group yang sudah berisi model + senjata + animasi, siap ditambahkan ke scene */
    readonly root: THREE.Group;

    /** AnimationMixer untuk mengontrol animasi karakter ini */
    readonly mixer: THREE.AnimationMixer;

    /** Action clip untuk setiap state animasi */
    readonly actions: {
        idle: THREE.AnimationAction;
        run: THREE.AnimationAction;
        attack: THREE.AnimationAction;
        death: THREE.AnimationAction;
    };

    /** Daftar mesh karakter (untuk ganti material tim/buff/stun) */
    readonly meshes: THREE.Mesh[];

    /** Daftar senjata yang ditempel (untuk LOD culling & disposal) */
    readonly weapons: THREE.Group[];

    /** Flag unit spesial skeleton */
    readonly isSkeleton?: boolean;

    // ── Lifecycle ──

    /** Dipanggil sekali setelah konstruksi. Memuat model dasar + attach senjata ke bone. */
    loadAssets(): void;

    /** Setup AnimationMixer: pilih clip dari animRigs, buat actions. */
    setupAnimations(animRigs: Record<string, THREE.AnimationClip[]>): void;

    /** Mainkan animasi sesuai state: 0=idle, 1=run, 2=attack, 3=death */
    playAnimation(state: number): void;

    /** Panggil saat unit mati — set death anim ke LoopOnce */
    triggerDeath(): void;

    /** Bersihkan semua geometry, material, texture dari VRAM. PENTING untuk cegah memory leak! */
    dispose(): void;
}

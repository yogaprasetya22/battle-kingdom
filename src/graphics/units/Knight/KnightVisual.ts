/**
 * KnightVisual.ts — Karakter Jarak Dekat (Tank).
 * Model: Knight.glb, Senjata: sword_1handed (tangan kanan) + shield_round_color (tangan kiri).
 * Animasi: Melee 1H.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { IUnitVisual } from "../base/IUnitVisual";
import { attachWeapon, pickClip } from "../UnitVisualHelpers";

// ── Konfigurasi klip animasi Knight ──
const CLIP_MAP = {
    rigs: [
        "Rig_Medium_General",
        "Rig_Medium_MovementBasic",
        "Rig_Medium_CombatMelee",
    ],
    idle: ["Idle_A", "Idle_B"],
    run: ["Running_A", "Running_B", "Walking_A"],
    attack: [
        "Melee_1H_Attack_Slice_Horizontal",
        "Melee_1H_Attack_Chop",
        "Melee_1H_Attack_Stab",
    ],
    death: ["Death_A", "Death_B"],
};

export class KnightVisual implements IUnitVisual {
    readonly root: THREE.Group;
    readonly mixer: THREE.AnimationMixer;
    readonly actions: {
        idle: THREE.AnimationAction;
        run: THREE.AnimationAction;
        attack: THREE.AnimationAction;
        death: THREE.AnimationAction;
    };
    readonly meshes: THREE.Mesh[] = [];
    readonly weapons: THREE.Group[] = [];

    private _currentAnimState = 0;
    readonly isSkeleton: boolean;

    constructor(
        sourceGLTF: any,
        teamMaterial: THREE.MeshStandardMaterial,
        isSkeleton = false,
    ) {
        this.isSkeleton = isSkeleton;
        // Clone scene agar tiap unit independen (tidak share transform/material)
        this.root = SkeletonUtils.clone(sourceGLTF.scene) as THREE.Group;
        this.root.scale.setScalar(0.85); // Knight sedikit lebih besar

        // Kumpulkan semua mesh untuk material swapping
        this.root.traverse((child: any) => {
            if (child.isMesh) {
                if (!isSkeleton) {
                    child.material = teamMaterial;
                }
                this.meshes.push(child as THREE.Mesh);
            }
        });

        this.mixer = new THREE.AnimationMixer(this.root);

        // Placeholder actions — akan diisi ulang oleh setupAnimations()
        const dummyClip = new THREE.AnimationClip("_dummy", 0, []);
        const dummyAction = this.mixer.clipAction(dummyClip);
        this.actions = {
            idle: dummyAction,
            run: dummyAction,
            attack: dummyAction,
            death: dummyAction,
        };
    }

    /** Pasang pedang & perisai ke bone tangan */
    loadAssets(): void {
        const swordName = this.isSkeleton ? "Skeleton_Blade" : "sword_1handed";
        const shieldName = this.isSkeleton ? "Skeleton_Shield_Small_A" : "shield_round_color";

        const sword = attachWeapon(this.root, swordName, "hand_r");
        if (sword) {
            this.weapons.push(sword);
        }

        const shield = attachWeapon(this.root, shieldName, "hand_l");
        if (shield) {
            this.weapons.push(shield);
        }
    }

    /** Pilih klip dari animRigs yang sudah dimuat, buat actions */
    setupAnimations(animRigs: Record<string, THREE.AnimationClip[]>): void {
        // Gabungkan clip dari rig yang dibutuhkan Knight
        const allClips: THREE.AnimationClip[] = [];
        for (const rigName of CLIP_MAP.rigs) {
            const clips = animRigs[rigName];
            if (clips) allClips.push(...clips);
        }
        if (allClips.length === 0) {
            // Fallback: ambil semua clip yang ada
            Object.values(animRigs).forEach((c) => allClips.push(...c));
        }

        const idleClip = pickClip(allClips, CLIP_MAP.idle);
        const runClip = pickClip(allClips, CLIP_MAP.run);
        const attackClip = pickClip(allClips, CLIP_MAP.attack);
        const deathClip = pickClip(allClips, CLIP_MAP.death);

        // Hentikan action lama, buat yang baru
        this.mixer.stopAllAction();

        (this.actions as any).idle = this.mixer.clipAction(idleClip);
        (this.actions as any).run = this.mixer.clipAction(runClip);
        (this.actions as any).attack = this.mixer.clipAction(attackClip);
        (this.actions as any).death = this.mixer.clipAction(deathClip);

        this.actions.death.setLoop(THREE.LoopOnce, 1);
        this.actions.death.clampWhenFinished = true;

        // Mulai dari idle dengan waktu acak agar tidak seragam
        this.actions.idle.play();
        this.actions.idle.time = Math.random() * idleClip.duration;
    }

    /** Ganti animasi dengan crossfade halus */
    playAnimation(state: number): void {
        if (this._currentAnimState === state) return;
        this._currentAnimState = state;

        const name =
            (["idle", "run", "attack", "death"] as const)[state] || "idle";
        const target = this.actions[name];
        if (!target) return;

        // Cari action yang sedang aktif
        const prevName =
            (["idle", "run", "attack", "death"] as const)[
                this._currentAnimState
            ] || "idle";
        const current = this.actions[prevName];

        if (current && current !== target && current.isRunning()) {
            target.reset();
            target.play();
            current.crossFadeTo(target, 0.15, true);
        } else {
            target.play();
        }
    }

    triggerDeath(): void {
        this.actions.death.reset();
        this.actions.death.play();
        this._currentAnimState = 3;
    }

    /** Bersihkan SEMUA resource — geometry, material, texture dari GPU */
    dispose(): void {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.root);

        // Dispose senjata
        this.weapons.forEach((w) => {
            if (w.parent) w.parent.remove(w);
            w.traverse((child: any) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m: any) => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });
        this.weapons.length = 0;

        // Dispose mesh karakter sendiri (geometry/material dari clone)
        this.meshes.forEach((m) => {
            if (m.geometry) m.geometry.dispose();
            // JANGAN dispose material — material dishare antar unit (teamMatA/teamMatB)
            // Material utama di-dispose oleh changeModel()
        });
        this.meshes.length = 0;

        // Hapus root dari parent (jika masih ada)
        if (this.root.parent) {
            this.root.parent.remove(this.root);
        }
    }
}

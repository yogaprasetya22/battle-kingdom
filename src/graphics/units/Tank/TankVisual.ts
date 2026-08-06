/**
 * TankVisual.ts — Karakter Jarak Dekat (Barbarian / Tank).
 * Model: Barbarian.glb, Senjata: axe_1handed (tangan kanan).
 * Animasi: Melee 1H.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { IUnitVisual } from "../base/IUnitVisual";
import { attachWeapon, pickClip } from "../UnitVisualHelpers";

// ── Konfigurasi klip animasi Barbarian ──
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

export class TankVisual implements IUnitVisual {
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
        this.root = SkeletonUtils.clone(sourceGLTF.scene) as THREE.Group;
        this.root.scale.setScalar(0.85); // Barbarian scale

        this.root.traverse((child: any) => {
            if (child.isMesh) {
                if (!isSkeleton) {
                    child.material = teamMaterial;
                }
                this.meshes.push(child as THREE.Mesh);
            }
        });

        this.mixer = new THREE.AnimationMixer(this.root);

        const dummyClip = new THREE.AnimationClip("_dummy", 0, []);
        const dummyAction = this.mixer.clipAction(dummyClip);
        this.actions = {
            idle: dummyAction,
            run: dummyAction,
            attack: dummyAction,
            death: dummyAction,
        };
    }

    /** Pasang kapak ke bone tangan kanan */
    loadAssets(): void {
        const axeName = this.isSkeleton ? "Skeleton_Axe" : "axe_2handed";
        const axe = attachWeapon(this.root, axeName, "hand_r");
        if (axe) {
            this.weapons.push(axe);
        }
    }

    setupAnimations(animRigs: Record<string, THREE.AnimationClip[]>): void {
        const allClips: THREE.AnimationClip[] = [];
        for (const rigName of CLIP_MAP.rigs) {
            const clips = animRigs[rigName];
            if (clips) allClips.push(...clips);
        }
        if (allClips.length === 0) {
            Object.values(animRigs).forEach((c) => allClips.push(...c));
        }

        const idleClip = pickClip(allClips, CLIP_MAP.idle);
        const runClip = pickClip(allClips, CLIP_MAP.run);
        const attackClip = pickClip(allClips, CLIP_MAP.attack);
        const deathClip = pickClip(allClips, CLIP_MAP.death);

        this.mixer.stopAllAction();

        (this.actions as any).idle = this.mixer.clipAction(idleClip);
        (this.actions as any).run = this.mixer.clipAction(runClip);
        (this.actions as any).attack = this.mixer.clipAction(attackClip);
        (this.actions as any).death = this.mixer.clipAction(deathClip);

        this.actions.death.setLoop(THREE.LoopOnce, 1);
        this.actions.death.clampWhenFinished = true;

        this.actions.idle.play();
        this.actions.idle.time = Math.random() * idleClip.duration;
    }

    playAnimation(state: number): void {
        if (this._currentAnimState === state) return;
        this._currentAnimState = state;

        const name =
            (["idle", "run", "attack", "death"] as const)[state] || "idle";
        const target = this.actions[name];
        if (!target) return;

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

    dispose(): void {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.root);

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

        this.meshes.forEach((m) => {
            if (m.geometry) m.geometry.dispose();
        });
        this.meshes.length = 0;

        if (this.root.parent) {
            this.root.parent.remove(this.root);
        }
    }
}

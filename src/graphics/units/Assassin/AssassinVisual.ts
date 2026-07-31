/**
 * AssassinVisual.ts — Pembunuh Bayaran (Assassin).
 * Model: Rogue.glb, Senjata: dual daggers (tangan kanan + kiri).
 * Animasi: Melee Dualwield.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { IUnitVisual } from "../base/IUnitVisual";
import { attachWeapon, pickClip } from "../UnitVisualHelpers";

const CLIP_MAP = {
    rigs: [
        "Rig_Medium_General",
        "Rig_Medium_MovementBasic",
        "Rig_Medium_CombatMelee",
    ],
    idle: ["Melee_Unarmed_Idle", "Idle_B", "Idle_A"],
    run: ["Running_A", "Running_B"],
    attack: [
        "Melee_Dualwield_Attack_Slice",
        "Melee_Dualwield_Attack_Stab",
        "Melee_1H_Attack_Stab",
    ],
    death: ["Death_B", "Death_A"],
};

export class AssassinVisual implements IUnitVisual {
    readonly root: THREE.Group;
    readonly mixer: THREE.AnimationMixer;
    readonly actions = {} as any;
    readonly meshes: THREE.Mesh[] = [];
    readonly weapons: THREE.Group[] = [];
    private _currentAnimState = 0;

    constructor(sourceGLTF: any, teamMaterial: THREE.MeshStandardMaterial) {
        this.root = SkeletonUtils.clone(sourceGLTF.scene) as THREE.Group;
        this.root.scale.setScalar(0.5);
        this.root.traverse((child: any) => {
            if (child.isMesh) {
                child.material = teamMaterial;
                this.meshes.push(child as THREE.Mesh);
            }
        });
        this.mixer = new THREE.AnimationMixer(this.root);
    }

    loadAssets(): void {
        const d1 = attachWeapon(this.root, "dagger", "hand_r");
        if (d1) this.weapons.push(d1);
        const d2 = attachWeapon(this.root, "dagger", "hand_l");
        if (d2) this.weapons.push(d2);
    }

    setupAnimations(animRigs: Record<string, THREE.AnimationClip[]>): void {
        const allClips: THREE.AnimationClip[] = [];
        for (const rigName of CLIP_MAP.rigs) {
            const clips = animRigs[rigName];
            if (clips) allClips.push(...clips);
        }
        if (allClips.length === 0)
            Object.values(animRigs).forEach((c) => allClips.push(...c));
        this.mixer.stopAllAction();
        (this.actions as any).idle = this.mixer.clipAction(
            pickClip(allClips, CLIP_MAP.idle),
        );
        (this.actions as any).run = this.mixer.clipAction(
            pickClip(allClips, CLIP_MAP.run),
        );
        (this.actions as any).attack = this.mixer.clipAction(
            pickClip(allClips, CLIP_MAP.attack),
        );
        (this.actions as any).death = this.mixer.clipAction(
            pickClip(allClips, CLIP_MAP.death),
        );

        // Normalize animation playback speed — prevent fast/slow motion at different distances
        this.actions.idle.timeScale = 1.0;
        this.actions.run.timeScale = 0.95; // Slight slowdown for running to match movement speed
        this.actions.attack.timeScale = 1.0;
        this.actions.death.timeScale = 1.0;

        this.actions.death.setLoop(THREE.LoopOnce, 1);
        this.actions.death.clampWhenFinished = true;
        this.actions.idle.play();
        this.actions.idle.time =
            Math.random() * this.actions.idle.getClip().duration;
    }

    playAnimation(state: number): void {
        if (this._currentAnimState === state) return;
        const prevName = ["idle", "run", "attack", "death"][
            this._currentAnimState
        ] as keyof typeof this.actions;
        this._currentAnimState = state;
        const name = ["idle", "run", "attack", "death"][
            state
        ] as keyof typeof this.actions;
        const target = this.actions[name];
        if (!target) return;
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
            w.traverse((c: any) => {
                if (c.geometry) c.geometry.dispose();
                if (c.material)
                    Array.isArray(c.material)
                        ? c.material.forEach((m: any) => m.dispose())
                        : c.material.dispose();
            });
        });
        this.weapons.length = 0;
        this.meshes.forEach((m) => {
            if (m.geometry) m.geometry.dispose();
        });
        this.meshes.length = 0;
        if (this.root.parent) this.root.parent.remove(this.root);
    }
}

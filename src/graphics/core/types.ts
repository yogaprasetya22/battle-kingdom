import * as THREE from "three";

export interface UnitVisual {
    root: THREE.Group;
    mixer: THREE.AnimationMixer;
    actions: {
        idle: THREE.AnimationAction;
        run: THREE.AnimationAction;
        attack: THREE.AnimationAction;
        death: THREE.AnimationAction;
    };
    currentAnimState: number; // 0=idle, 1=run, 2=attack, 3=dead
    currentEffectState: number; // 0=none, >0=stun, <0=buff
    meshes: THREE.Mesh[]; // cache mesh references, hindari traverse tiap frame
    team: number;
    deathTime?: number;
    accumulatedDelta: number;
}

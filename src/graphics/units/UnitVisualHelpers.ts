/**
 * UnitVisualHelpers.ts — Fungsi bantuan bersama untuk semua karakter.
 * Dipisah agar tidak duplikasi di setiap file unit.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

// ── Weapon cache (diisi oleh preloadWeapons dari luar) ──
export const weaponCache: Record<string, THREE.Group> = {};

// ── Offset transform per senjata (pos, rot, scale) ──
export const WEAPON_OFFSETS: Record<
    string,
    {
        pos: [number, number, number];
        rot: [number, number, number];
        scale: [number, number, number];
    }
> = {
    sword_1handed: {
        pos: [0.08, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [1, 1, 1],
    },
    axe_1handed: {
        pos: [0.08, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [1, 1, 1],
    },
    dagger: {
        pos: [0.06, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [0.8, 0.8, 0.8],
    },
    shield_round_color: {
        pos: [0.0, 0.0, 0.05],
        rot: [0, Math.PI / 2, 0],
        scale: [0.9, 0.9, 0.9],
    },
    bow_withString: {
        pos: [0.0, 0.02, 0.0],
        rot: [Math.PI / 2, 0, Math.PI / 2],
        scale: [1, 1, 1],
    },
    quiver: { pos: [0.0, 0.15, -0.1], rot: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
    staff: { pos: [0.0, 0.3, 0.0], rot: [0, 0, Math.PI / 8], scale: [1, 1, 1] },
    wand: {
        pos: [0.04, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [0.7, 0.7, 0.7],
    },
    spellbook_open: {
        pos: [0.0, 0.0, 0.06],
        rot: [Math.PI / 2, 0, 0],
        scale: [0.7, 0.7, 0.7],
    },
    spellbook_closed: {
        pos: [0.0, 0.0, 0.06],
        rot: [Math.PI / 2, 0, 0],
        scale: [0.7, 0.7, 0.7],
    },
    crossbow_1handed: {
        pos: [0.08, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [1, 1, 1],
    },
    mug_full: {
        pos: [0.05, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [0.7, 0.7, 0.7],
    },
};

/** Cari bone dengan nama mengandung pattern (case-insensitive) */
export function findBone(
    root: THREE.Object3D,
    pattern: string,
): THREE.Bone | null {
    let found: THREE.Bone | null = null;
    root.traverse((child) => {
        if (found) return;
        if (
            child instanceof THREE.Bone &&
            child.name.toLowerCase().includes(pattern.toLowerCase())
        ) {
            found = child;
        }
    });
    return found;
}

/** Clone senjata dari cache, tempel ke bone, kembalikan Group-nya */
export function attachWeapon(
    unitRoot: THREE.Group,
    weaponName: string,
    handPattern: string,
): THREE.Group | null {
    const cached = weaponCache[weaponName];
    if (!cached) {
        console.warn(`[attachWeapon] weapon "${weaponName}" not in cache`);
        return null;
    }
    const bone = findBone(unitRoot, handPattern);
    if (!bone) {
        console.warn(`[attachWeapon] bone "${handPattern}" not found on unit`);
        return null;
    }
    const weaponClone = SkeletonUtils.clone(cached) as THREE.Group;
    const offset = WEAPON_OFFSETS[weaponName];
    if (offset) {
        weaponClone.position.set(...offset.pos);
        weaponClone.rotation.set(...offset.rot);
        weaponClone.scale.set(...offset.scale);
    }
    bone.add(weaponClone);
    return weaponClone;
}

/** Pilih klip pertama yang cocok dari daftar kandidat */
export function pickClip(
    clips: THREE.AnimationClip[],
    candidates: string[],
): THREE.AnimationClip {
    for (const name of candidates) {
        const found = clips.find((c) => c.name === name);
        if (found) return found;
    }
    // Fallback ke klip pertama yang tersedia
    return clips[0];
}

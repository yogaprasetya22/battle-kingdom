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
        pos: [-0.02, 0.08, 0.02],
        rot: [0.038, -0.012, 1.738],
        scale: [0.87, 1.0, 1.0],
    },
    axe_1handed: {
        pos: [0.08, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [1, 1, 1],
    },
    dagger: {
        pos: [0.0, 0.13, 0.0],
        rot: [-0.542, -0.142, 0.968],
        scale: [1.0, 1.0, 1.0],
    },
    shield_round_color: {
        pos: [-0.07, 0.0, 0.0],
        rot: [-0.342, -0.272, 0.618],
        scale: [1.0, 1.0, 1.0],
    },
    bow_withString: {
        pos: [0.01, 0.15, 0.0],
        rot: [0.0, -0.112, 1.458],
        scale: [1.0, 1.0, 1.0],
    },
    quiver: { pos: [0.0, 0.15, -0.1], rot: [0, 0, 0], scale: [0.8, 0.8, 0.8] },
    staff: {
        pos: [0.0, 0.09, 0.02],
        rot: [0.368, -0.512, 2.258],
        scale: [0.74, 0.88, 0.72],
    },
    wand: {
        pos: [0.0, 0.05, 0.0],
        rot: [-0.352, -0.312, 1.308],
        scale: [1.0, 1.0, 1.0],
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
        pos: [-0.04, -0.06, -0.03],
        rot: [-1.532, -0.072, 1.518],
        scale: [0.83, 0.92, 0.85],
    },
    mug_full: {
        pos: [0.05, 0.0, 0.0],
        rot: [0, 0, Math.PI / 2],
        scale: [0.7, 0.7, 0.7],
    },
};

/** Dapatkan fallback pattern untuk bone tertentu */
function getFallbackBonePatterns(pattern: string): string[] {
    const lower = pattern.toLowerCase();

    if (
        lower.includes("hand_r") ||
        lower.includes("hand.r") ||
        lower.includes("right")
    ) {
        return [
            "armature.hand.r",
            "hand.r",
            "armature_hand_r",
            "hand_r",
            "handr", // Exact match untuk Knight model
            "hand_r",
            "wristr", // Fallback ke wrist jika hand tidak ada
            "armature.r",
            "r_hand",
            "right_hand",
        ];
    }
    if (
        lower.includes("hand_l") ||
        lower.includes("hand.l") ||
        lower.includes("left")
    ) {
        return [
            "armature.hand.l",
            "hand.l",
            "armature_hand_l",
            "hand_l",
            "handl", // Exact match untuk Knight model
            "hand_l",
            "wristl", // Fallback ke wrist jika hand tidak ada
            "armature.l",
            "l_hand",
            "left_hand",
        ];
    }
    if (lower.includes("spine")) {
        return [
            "spine",
            "armature.spine",
            "armature.chest",
            "armature.torso",
            "chest",
            "torso",
            "handslotr", // Jika spine tidak ada, gunakan hand slot (backup bone untuk attach)
            "handslotl",
        ];
    }

    return [pattern];
}

/** Cari bone dengan nama mengandung pattern (case-insensitive) + fallback patterns */
export function findBone(
    root: THREE.Object3D,
    pattern: string,
): THREE.Bone | null {
    let found: THREE.Bone | null = null;
    const allBones: THREE.Bone[] = [];

    // Collect semua bones untuk debug dan fallback
    root.traverse((child) => {
        if (child instanceof THREE.Bone) {
            allBones.push(child);
            if (
                !found &&
                child.name.toLowerCase().includes(pattern.toLowerCase())
            ) {
                found = child;
            }
        }
    });

    // Jika tidak ketemu dengan pattern asal, coba fallback patterns
    if (!found) {
        const fallbackPatterns = getFallbackBonePatterns(pattern);
        for (const fbPattern of fallbackPatterns) {
            for (const bone of allBones) {
                if (bone.name.toLowerCase().includes(fbPattern.toLowerCase())) {
                    found = bone;
                    // console.info(
                    //     `[findBone] Fallback: "${pattern}" → found "${bone.name}"`,
                    // );
                    break;
                }
            }
            if (found) break;
        }
    }



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

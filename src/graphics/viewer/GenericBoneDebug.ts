/**
 * GenericBoneDebug.ts — Generic bone structure inspector untuk semua unit types
 * Dipanggil saat character di-select di viewer
 * Menampilkan: bone structure, mesh info, dan animation clips yang dipakai
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// @ts-ignore
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as THREE from "three";

export async function debugBoneStructure(
    modelName: string,
    animRigs: Record<string, THREE.AnimationClip[]>,
) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    try {
        const gltf = await loader.loadAsync(
            `/models/character/characters/${modelName}.glb`,
        );

        console.log(`\n${"=".repeat(70)}`);
        console.log(`🦴 Character Debug: ${modelName}`);
        console.log(`${"=".repeat(70)}\n`);

        const bones: THREE.Bone[] = [];
        const meshes: THREE.Mesh[] = [];

        gltf.scene.traverse((obj) => {
            if (obj instanceof THREE.Bone) {
                bones.push(obj);
            }
            if (obj instanceof THREE.Mesh) {
                meshes.push(obj);
            }
        });

        // ── BONE STRUCTURE ──
        console.log(`📊 Model Structure:`);
        console.log(`  Total Bones: ${bones.length}`);
        console.log(`  Total Meshes: ${meshes.length}\n`);

        console.log(`🦴 All Bones:`);
        bones.forEach((bone, idx) => {
            console.log(`  [${idx.toString().padStart(2, "0")}] ${bone.name}`);
        });

        console.log(`\n🎨 All Meshes:`);
        meshes.forEach((mesh, idx) => {
            console.log(`  [${idx}] ${mesh.name}`);
        });

        console.log(`\n🌳 Full Hierarchy:`);
        const printTree = (obj: THREE.Object3D, indent = 0) => {
            const lines = obj.name.split("\n");
            lines.forEach((line) => {
                const connectorPrefix =
                    indent === 0 ? "" : "  ".repeat(indent - 1) + "  ";
                const isBone = obj instanceof THREE.Bone ? "🦴" : "📦";
                const isMesh = obj instanceof THREE.Mesh ? " 🎨" : "";
                console.log(
                    `${connectorPrefix}${isBone}${isMesh} ${line.trim()}`,
                );
            });

            obj.children.forEach((child) => {
                printTree(child, indent + 1);
            });
        };

        printTree(gltf.scene);

        // ── BONE SEARCH ──
        console.log(`\n🔍 Common Bone Search Results:`);
        const searchPatterns = [
            "hand_r",
            "handr",
            "hand.r",
            "hand_l",
            "handl",
            "hand.l",
            "spine",
            "chest",
            "head",
            "armature",
        ];

        searchPatterns.forEach((pattern) => {
            let found: THREE.Bone | null = null;
            for (const bone of bones) {
                if (bone.name.toLowerCase().includes(pattern.toLowerCase())) {
                    found = bone;
                    break;
                }
            }
            const status = found ? `✓ ${found.name}` : "✗ NOT FOUND";
            console.log(`  "${pattern}": ${status}`);
        });

        // ── ANIMATION CLIPS ──
        console.log(`\n🎬 Available Animation Clips:`);

        // Map model name ke character type untuk mendapatkan animation rigs yang sesuai
        const animRigMaps: Record<string, string[]> = {
            Knight: [
                "Rig_Medium_General",
                "Rig_Medium_MovementBasic",
                "Rig_Medium_CombatMelee",
            ],
            Ranger: [
                "Rig_Medium_General",
                "Rig_Medium_MovementAdvanced",
                "Rig_Medium_CombatRanged",
            ],
            Mage: [
                "Rig_Medium_General",
                "Rig_Medium_MovementAdvanced",
                "Rig_Medium_CombatRanged",
            ],
            Rogue_Hooded: [
                "Rig_Medium_General",
                "Rig_Medium_MovementAdvanced",
                "Rig_Medium_CombatRanged",
            ],
            Rogue: [
                "Rig_Medium_General",
                "Rig_Medium_MovementAdvanced",
                "Rig_Medium_CombatRanged",
            ],
            Barbarian: [
                "Rig_Medium_General",
                "Rig_Medium_MovementBasic",
                "Rig_Medium_CombatMelee",
            ],
        };

        const rigsForModel = animRigMaps[modelName] || [];

        // Kumpulkan semua clip dari rigs yang relevan
        const allClips: THREE.AnimationClip[] = [];
        for (const rigName of rigsForModel) {
            const clips = animRigs[rigName];
            if (clips) {
                console.log(`  📁 ${rigName}:`);
                clips.forEach((clip) => {
                    console.log(
                        `    • ${clip.name} (${clip.duration.toFixed(2)}s)`,
                    );
                    allClips.push(clip);
                });
            }
        }

        if (allClips.length === 0) {
            console.log(`  ⚠️  No animation clips loaded for this model`);
        }

        console.log(`\n${"=".repeat(70)}\n`);
    } catch (err) {
        console.error(`[debugBoneStructure] Error loading ${modelName}:`, err);
    }
}

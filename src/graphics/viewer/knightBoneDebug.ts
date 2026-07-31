/**
 * Debug script: Cetak bone structure dari model Knight.glb
 * Ditambahkan ke main.ts untuk debugging
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// @ts-ignore
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export async function debugKnightBoneStructure() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    try {
        const gltf = await loader.loadAsync(
            "/models/character/characters/Knight.glb",
        );

        console.log("\n=== Knight.glb Bone Structure Debug ===\n");

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

        console.log(`Total Bones: ${bones.length}`);
        console.log(`Total Meshes: ${meshes.length}`);

        console.log("\n📦 All Bones:");
        bones.forEach((bone, idx) => {
            console.log(`  [${idx}] ${bone.name}`);
        });

        console.log("\n🎨 All Meshes:");
        meshes.forEach((mesh, idx) => {
            console.log(`  [${idx}] ${mesh.name}`);
        });

        console.log("\n🌳 Full Scene Hierarchy:");
        const printTree = (obj: THREE.Object3D, indent = 0) => {
            const prefix = "  ".repeat(indent);
            const isBone = obj instanceof THREE.Bone ? "🦴" : "📦";
            const isMesh = obj instanceof THREE.Mesh ? "🎨" : "";
            console.log(`${prefix}${isBone} ${isMesh} ${obj.name}`);

            obj.children.forEach((child) => printTree(child, indent + 1));
        };

        printTree(gltf.scene);

        // Test findBone dengan berbagai pattern
        console.log("\n🔍 Testing bone search patterns:");
        const testPatterns = [
            "hand_r",
            "hand_l",
            "hand.r",
            "hand.l",
            "armature",
            "spine",
        ];

        for (const pattern of testPatterns) {
            let found: THREE.Bone | null = null;
            for (const bone of bones) {
                if (bone.name.toLowerCase().includes(pattern.toLowerCase())) {
                    found = bone;
                    break;
                }
            }
            console.log(
                `  Pattern "${pattern}": ${found ? `✓ ${found.name}` : "✗ NOT FOUND"}`,
            );
        }
    } catch (err) {
        console.error("Debug error:", err);
    }
}

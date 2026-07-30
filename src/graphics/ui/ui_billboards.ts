import * as THREE from "three";
import { UNIT_COUNT, TEAM_SIZE } from "../../simulation/constants";
import { scene } from "../core/scene";

// ---- 1. HP Bars (thinner, always on top, Ragnarok style border) ----
const hpBgGeo = new THREE.PlaneGeometry(1.06, 0.10);
const hpFgGeo = new THREE.PlaneGeometry(1.0, 0.05);

const hpBgMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
});
const hpFgMat = new THREE.MeshBasicMaterial({
    color: 0x2ecc71, // Ragnarok neon-ish green
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
});

export const hpBarsBg = new THREE.InstancedMesh(hpBgGeo, hpBgMat, UNIT_COUNT);
export const hpBarsFg = new THREE.InstancedMesh(hpFgGeo, hpFgMat, UNIT_COUNT);
hpBarsBg.renderOrder = 998; // Background slightly behind foreground
hpBarsFg.renderOrder = 999;
scene.add(hpBarsBg);
scene.add(hpBarsFg);

// ---- 2. Cooldown Foot Rings ----
const cdRingGeo = new THREE.RingGeometry(0.35, 0.45, 16);
const cdRingMat = new THREE.MeshBasicMaterial({
    color: 0x00dfff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
});

export const cdRings = new THREE.InstancedMesh(
    cdRingGeo,
    cdRingMat,
    UNIT_COUNT,
);
cdRings.renderOrder = 1;
scene.add(cdRings);

// ---- 3. Immunity Rings ----
const immuneRingGeo = new THREE.RingGeometry(0.55, 0.72, 24);
const immuneRingMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
});

export const immuneRings = new THREE.InstancedMesh(
    immuneRingGeo,
    immuneRingMat,
    UNIT_COUNT,
);
immuneRings.renderOrder = 5;
scene.add(immuneRings);

// ---- 4. Helper & Name Labels ----
export const dummy = new THREE.Object3D();
export const _deadMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export let nameBarsA: THREE.InstancedMesh | null = null;
export let nameBarsB: THREE.InstancedMesh | null = null;
const nameGeo = new THREE.PlaneGeometry(2.0, 0.4);

function createNameTexture(text: string, color: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 128);

    ctx.font = "bold 64px 'Outfit', 'Inter', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Crisp Ragnarok-style solid black outline with rounded joints
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeText(text, 256, 64);

    // Fill with crisp high-visibility color
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export function initNameBars(modelName: string) {
    if (nameBarsA) scene.remove(nameBarsA);
    if (nameBarsB) scene.remove(nameBarsB);

    const model = modelName.toLowerCase();
    let nameA = "Knight";
    let nameB = "Knight";

    if (model.includes("mage")) {
        nameA = "Mage";
        nameB = "Mage";
    } else if (model.includes("archer") || model.includes("ranger")) {
        nameA = "Archer";
        nameB = "Archer";
    } else if (model.includes("barbarian")) {
        nameA = "Barbarian";
        nameB = "Barbarian";
    } else if (model.includes("gunslinger") || model.includes("rogue_hooded")) {
        nameA = "Gunslinger";
        nameB = "Gunslinger";
    } else if (model.includes("assassin") || model.includes("rogue")) {
        nameA = "Assassin";
        nameB = "Assassin";
    }

    const texA = createNameTexture(nameA, "#ffea00"); // Ragnarok gold/yellow name for readability
    const matA = new THREE.MeshBasicMaterial({
        map: texA,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    });
    nameBarsA = new THREE.InstancedMesh(nameGeo, matA, TEAM_SIZE);
    nameBarsA.renderOrder = 999;
    scene.add(nameBarsA);

    const texB = createNameTexture(nameB, "#00f0ff"); // High-contrast neon cyan for team B
    const matB = new THREE.MeshBasicMaterial({
        map: texB,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    });
    nameBarsB = new THREE.InstancedMesh(nameGeo, matB, TEAM_SIZE);
    nameBarsB.renderOrder = 999;
    scene.add(nameBarsB);
}

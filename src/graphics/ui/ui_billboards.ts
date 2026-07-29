import * as THREE from "three";
import { UNIT_COUNT, TEAM_SIZE } from "../../simulation/constants";
import { scene } from "../core/scene";

// ---- 1. HP Bars (thinner, always on top) ----
const hpGeo = new THREE.PlaneGeometry(1.0, 0.06);
const hpBgMat = new THREE.MeshBasicMaterial({
    color: 0x330000,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
});
const hpFgMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
});

export const hpBarsBg = new THREE.InstancedMesh(hpGeo, hpBgMat, UNIT_COUNT);
export const hpBarsFg = new THREE.InstancedMesh(hpGeo, hpFgMat, UNIT_COUNT);
hpBarsBg.renderOrder = 999;
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

    ctx.font = "bold 64px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Thick outline
    ctx.strokeStyle = "rgba(0, 0, 0, 1.0)";
    ctx.lineWidth = 12;
    ctx.strokeText(text, 256, 64);

    // Fill
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
    let nameA = "Tank";
    let nameB = "Tank";

    if (model.includes("mage")) {
        nameA = "Mage";
        nameB = "Mage";
    } else if (model.includes("archer")) {
        nameA = "Archer";
        nameB = "Archer";
    } else if (model.includes("knight") || model.includes("soldier")) {
        nameA = "Soldier";
        nameB = "Soldier";
    }

    const texA = createNameTexture(nameA, "#ff3333");
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

    const texB = createNameTexture(nameB, "#3388ff");
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

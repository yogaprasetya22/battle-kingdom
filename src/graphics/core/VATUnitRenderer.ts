import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import {
    UNIT_COUNT,
    TEAM_SIZE,
    STRIDE,
    IDX_X,
    IDX_Y,
    IDX_Z,
    IDX_HP,
    IDX_MAX_HP,
    IDX_ANIM,
    IDX_TARGET,
    TEAM_A,
    IDX_TYPE,
    IDX_EFFECT_STATE,
    UNIT_LOD_DIST_SQ,
} from "../../simulation/constants";

import type { UnitVisual } from "./types";
import { VATVisual } from "../units/base/VATVisualHelper";
import type { VATMetadata } from "../units/base/VATVisualHelper";
import { initVATMaterialPool } from "./VATMaterialPool";
import { scene, camera, gltfLoader, renderer } from "./scene";
import { isRunning } from "../../main";
import { soundFX } from "./SoundFX";
import {
    hpBarsBg,
    hpBarsFg,
    cdRings,
    immuneRings,
    _deadMatrix,
    dummy,
    nameBarsA,
    nameBarsB,
    initNameBars,
} from "../ui/ui_billboards";
import { spawnIceShatterFX } from "../effects/SkillFX";
import { getUnitScale } from "../units/UnitVisualFactory";

// ── Shared materials & loaders ──
let teamMatA: THREE.MeshStandardMaterial | null = null;
let teamMatB: THREE.MeshStandardMaterial | null = null;
let healerMatA: THREE.MeshStandardMaterial | null = null;
let healerMatB: THREE.MeshStandardMaterial | null = null;
let stunMat: THREE.MeshStandardMaterial | null = null;
let buffMatA: THREE.MeshStandardMaterial | null = null;
let buffMatB: THREE.MeshStandardMaterial | null = null;

const exrLoader = new EXRLoader();

// ── Ice InstancedMesh ──
const _iceGeo = new THREE.DodecahedronGeometry(0.65);
const _iceMat = new THREE.MeshStandardMaterial({
    color: 0x88e2ff,
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
});
const _iceInstanced = new THREE.InstancedMesh(_iceGeo, _iceMat, UNIT_COUNT);
_iceInstanced.renderOrder = 6;
_iceInstanced.count = 0;
scene.add(_iceInstanced);
const _iceMatrix = new THREE.Matrix4();
const _iceDead = new THREE.Matrix4().makeScale(0, 0, 0);

// ── Unit registry ──
const units: UnitVisual[] = [];
const unitInstances: (VATVisual | null)[] = [];
let modelLoaded = false;

const logPanel = document.getElementById("log-panel");

function logDiag(msg: string, isError = false) {
    if (logPanel) {
        logPanel.style.borderColor = isError ? "#ff4444" : "#00ffaa";
        logPanel.style.color = isError ? "#ff8888" : "#00ffaa";
        logPanel.textContent = `🔧 VAT Diagnostic:\n${msg}`;
    }
    console.log(msg);
}

// Map tipe unit ke nama foldernya di public/models/character/characters_vat/
function getCharacterNameForType(uType: number): string {
    switch (uType) {
        case 0:
            return "Knight";
        case 1:
            return "Ranger";
        case 2:
            return "Mage";
        case 3:
            return "Mage"; // Healer pakai base Mage
        case 4:
            return "Rogue_Hooded";
        case 5:
            return "Rogue";
        case 6:
            return "Knight"; // Fallback
        case 7:
            return "Mage"; // Fallback
        default:
            return "Knight";
    }
}

// Cache data VAT hasil loading agar tidak di-load berulang-ulang
const vatAssetCache: Record<
    string,
    {
        baseGLTF: any;
        vatTexture: THREE.Texture;
        metadata: VATMetadata;
    }
> = {};

async function loadVATAssetsForChar(charName: string): Promise<{
    baseGLTF: any;
    vatTexture: THREE.Texture;
    metadata: VATMetadata;
}> {
    if (vatAssetCache[charName]) {
        return vatAssetCache[charName];
    }

    const baseUrl = import.meta.env.BASE_URL;
    const pathPrefix = `${baseUrl}models/character/characters_vat/${charName}/`;

    // 1. Load Base GLB
    const baseGLTF = await new Promise<any>((resolve, reject) => {
        gltfLoader.load(
            `${pathPrefix}${charName}_base.glb`,
            (gltf) => resolve(gltf),
            undefined,
            (err) => reject(err),
        );
    });

    // 2. Load VAT EXR Texture
    const vatTexture = await new Promise<THREE.Texture>((resolve, reject) => {
        exrLoader.load(
            `${pathPrefix}${charName}_vat_pos.exr`,
            (texture) => resolve(texture),
            undefined,
            (err) => reject(err),
        );
    });

    // 3. Load Metadata JSON
    const metadata = await fetch(`${pathPrefix}${charName}_vat_meta.json`).then(
        (res) => res.json() as Promise<VATMetadata>,
    );

    const assets = { baseGLTF, vatTexture, metadata };
    vatAssetCache[charName] = assets;
    return assets;
}

export function changeModel(
    modelName: string,
    matchup: string,
    onLoadComplete?: () => void,
    onError?: () => void,
) {
    modelLoaded = false;

    // Initialize material pool for this render mode (prevent per-instance shader compilation)
    const isWebGPU = (renderer as any).isWebGPURenderer === true;
    initVATMaterialPool(isWebGPU);

    // Clean old units
    unitInstances.forEach((inst) => {
        if (inst) inst.dispose();
    });
    unitInstances.length = 0;
    units.length = 0;

    // Dispose old materials
    teamMatA?.dispose();
    teamMatB?.dispose();
    healerMatA?.dispose();
    healerMatB?.dispose();
    buffMatA?.dispose();
    buffMatB?.dispose();
    stunMat?.dispose();
    for (let k = 0; k < UNIT_COUNT; k++) _iceInstanced.setMatrixAt(k, _iceDead);
    _iceInstanced.instanceMatrix.needsUpdate = true;

    // Name bars disabled — ponytail: re-enable by calling initNameBars(modelName) here

    logDiag("Loading VAT Assets parallelly...");

    // Karakter unik yang diperlukan dalam simulasi
    const uniqueChars = ["Knight", "Mage", "Ranger", "Rogue", "Rogue_Hooded"];

    Promise.all(uniqueChars.map((char) => loadVATAssetsForChar(char)))
        .then(() => {
            logDiag(
                "VAT Assets successfully loaded! Building materials & instances...",
            );

            // Ambil mesh material default dari salah satu base GLB untuk di-clone
            let originalMat: THREE.MeshStandardMaterial | null = null;
            const knightAssets = vatAssetCache["Knight"];
            if (knightAssets) {
                knightAssets.baseGLTF.scene.traverse((child: any) => {
                    if (!originalMat && child.isMesh) {
                        originalMat =
                            child.material as THREE.MeshStandardMaterial;
                    }
                });
            }

            // Inisialisasi team/effect materials
            teamMatA = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial({ color: 0xff3333 });
            teamMatB = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial({ color: 0x3366ff });
            teamMatA!.color.setHex(0xff3333);
            teamMatB!.color.setHex(0x3366ff);

            healerMatA = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial({ color: 0xffffff });
            healerMatB = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial({ color: 0xffffff });
            healerMatA!.color.setHex(0xffffff);
            healerMatB!.color.setHex(0xffffff);
            if ((healerMatA as any).emissive)
                (healerMatA as any).emissive.setHex(0x551111);
            if ((healerMatB as any).emissive)
                (healerMatB as any).emissive.setHex(0x111155);

            buffMatA = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial();
            buffMatB = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial();
            stunMat = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial();

            if (buffMatA) {
                buffMatA.color.setHex(0xff7733);
                if ((buffMatA as any).emissive) {
                    (buffMatA as any).emissive.setHex(0xff3300);
                    (buffMatA as any).emissiveIntensity = 0.6;
                }
            }

            if (buffMatB) {
                buffMatB.color.setHex(0x33aaff);
                if ((buffMatB as any).emissive) {
                    (buffMatB as any).emissive.setHex(0x0066ff);
                    (buffMatB as any).emissiveIntensity = 0.6;
                }
            }

            if (stunMat) {
                stunMat.color.setHex(0x88ddff);
                if ((stunMat as any).emissive) {
                    (stunMat as any).emissive.setHex(0x0099ff);
                    (stunMat as any).emissiveIntensity = 0.8;
                }
            }

            // Bangun instance visual unit
            for (let i = 0; i < UNIT_COUNT; i++) {
                const team = i < TEAM_SIZE ? TEAM_A : 1;
                const localIdx = i < TEAM_SIZE ? i : i - TEAM_SIZE;
                let uType = localIdx % 6;

                const healerCount = Math.max(1, Math.round(TEAM_SIZE * 0.02));
                if (localIdx < healerCount) {
                    uType = 3; // Healer
                }

                if (matchup === "mage_vs_tank") {
                    uType = team === TEAM_A ? 2 : 0;
                } else if (matchup === "archer_vs_tank") {
                    uType = team === TEAM_A ? 1 : 0;
                } else if (matchup === "mage_vs_archer") {
                    uType = team === TEAM_A ? 2 : 1;
                } else if (matchup === "only_mage") {
                    uType = 2;
                } else if (matchup === "only_archer") {
                    uType = 1;
                } else if (matchup === "only_tank") {
                    uType = 0;
                } else if (matchup === "only_gunslinger") {
                    uType = 4;
                } else if (matchup === "only_assassin") {
                    uType = 5;
                }

                // Pilih material
                const mat =
                    uType === 3
                        ? team === TEAM_A
                            ? healerMatA!
                            : healerMatB!
                        : team === TEAM_A
                          ? teamMatA!
                          : teamMatB!;

                // Ambil base name karakter
                let charName = getCharacterNameForType(uType);
                // Khusus tank, jika modelName adalah Barbarian, pakai model Barbarian
                if (
                    uType === 0 &&
                    modelName.toLowerCase().includes("barbarian")
                ) {
                    charName = "Barbarian";
                }

                const assets = vatAssetCache[charName];
                if (!assets) {
                    throw new Error(`VAT Assets not cached for ${charName}`);
                }

                // Buat instance VATVisual
                const unitVis = new VATVisual(
                    assets.baseGLTF,
                    assets.vatTexture,
                    assets.metadata,
                    mat,
                );
                unitInstances[i] = unitVis;

                // Override scale sesuai tipe unit
                const scale = getUnitScale(uType);
                unitVis.root.scale.setScalar(scale);

                scene.add(unitVis.root);

                units.push({
                    root: unitVis.root,
                    mixer: unitVis.mixer,
                    actions: unitVis.actions,
                    currentAnimState: 0,
                    currentEffectState: 0,
                    meshes: unitVis.meshes,
                    weapons: unitVis.weapons,
                    team,
                    accumulatedDelta: 0,
                });
            }

            modelLoaded = true;
            logDiag(`Success initializing ${UNIT_COUNT} VAT units!`);
            if (onLoadComplete) onLoadComplete();
        })
        .catch((err) => {
            logDiag(
                `Failed loading VAT assets: ${err.message || err.toString()}`,
                true,
            );
            if (onError) onError();
        });
}

// Pre-allocate vectors
const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
let animFrameCount = 0;
// ponytail: dirty flag — flush ice instanceMatrix once per frame, not per unit
let _iceNeedsUpdate = false;
// ponytail: pre-computed billboard quaternion (shared across all units in one frame)
const _billboardQuat = new THREE.Quaternion();

const LERP_SPEED = 12;

const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _unitSphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
const _lastCameraMatrix = new THREE.Matrix4();

let sharedData: Float32Array | null = null;

export function setSharedData(data: Float32Array) {
    sharedData = data;
}

export function getSharedData(): Float32Array | null {
    return sharedData;
}

export function getUnits(): UnitVisual[] {
    return units;
}

export function isModelLoaded(): boolean {
    return modelLoaded;
}

export function updateFrame(data: Float32Array, delta: number) {
    if (!modelLoaded) return;

    const cameraMoved = !_lastCameraMatrix.equals(camera.matrixWorld);
    if (cameraMoved) {
        _lastCameraMatrix.copy(camera.matrixWorld);
    }
    const needsMatrixUpload = isRunning || cameraMoved;

    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _forward.set(0, 0, 1).applyQuaternion(camera.quaternion);
    animFrameCount++;

    _projScreen.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
    );
    _frustum.setFromProjectionMatrix(_projScreen);

    // ponytail: billboard quaternion = camera quaternion (all billboards face camera)
    _billboardQuat.copy(camera.quaternion);

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const hp = data[base + IDX_HP];
        const x = data[base + IDX_X];
        const y = data[base + IDX_Y];
        const z = data[base + IDX_Z];
        const targetIdx = data[base + IDX_TARGET];
        const state = data[base + IDX_ANIM];
        const uType = data[base + IDX_TYPE];
        const effect = data[base + IDX_EFFECT_STATE];

        const unit = units[i];
        const vatInst = unitInstances[i];
        if (!unit || !vatInst) continue;

        if (hp === -999) {
            unit.root.visible = false;
            if (unit.root.position.y !== -999) {
                unit.root.position.set(x, -999, z);
                unit.root.scale.setScalar(0.0001);
                (unit as any)._wasAlive = false;

                hpBarsBg.setMatrixAt(i, _deadMatrix);
                hpBarsFg.setMatrixAt(i, _deadMatrix);
                cdRings.setMatrixAt(i, _deadMatrix);
                immuneRings.setMatrixAt(i, _deadMatrix);
                if (nameBarsA && nameBarsB) {
                    if (i < TEAM_SIZE) {
                        nameBarsA.setMatrixAt(i, _deadMatrix);
                    } else {
                        nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadMatrix);
                    }
                }
            }
            continue;
        }

        const scale = getUnitScale(uType);

        const dx = x - camera.position.x;
        const dy = y - camera.position.y;
        const dz = z - camera.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (hp < -10) {
            unit.root.position.set(x, -999, z);
            unit.root.scale.setScalar(0.0001);
            unit.root.visible = false;
            (unit as any)._wasAlive = false;
        } else {
            _unitSphere.center.set(x, y, z);
            const inView = _frustum.intersectsSphere(_unitSphere);
            unit.root.visible = inView;

            const showMesh = distSq < UNIT_LOD_DIST_SQ;

            for (let m = 0; m < unit.meshes.length; m++) {
                unit.meshes[m].visible = showMesh;
            }

            if (hp > 0 && !(unit as any)._wasAlive) {
                (unit as any)._wasAlive = true;
                soundFX.playSpawn(x, y, z, camera.position);
            }

            if (hp <= 0 && unit.deathTime) {
                const elapsed = performance.now() - unit.deathTime;
                if (elapsed > 2000) {
                    unit.root.position.set(x, -999, z);
                    unit.root.scale.setScalar(0.0001);
                    unit.root.visible = false;
                } else if (elapsed > 1000) {
                    const t = (elapsed - 1000) / 1000;
                    if (inView) {
                        unit.root.position.x +=
                            (x - unit.root.position.x) *
                            Math.min(1, LERP_SPEED * delta);
                        unit.root.position.z +=
                            (z - unit.root.position.z) *
                            Math.min(1, LERP_SPEED * delta);
                    } else {
                        unit.root.position.x = x;
                        unit.root.position.z = z;
                    }
                    unit.root.position.y = y - t * 1.5;
                    unit.root.scale.setScalar(scale * (1.0 - t));
                } else {
                    if (inView) {
                        unit.root.position.x +=
                            (x - unit.root.position.x) *
                            Math.min(1, LERP_SPEED * delta);
                        unit.root.position.y +=
                            (y - unit.root.position.y) *
                            Math.min(1, LERP_SPEED * delta);
                        unit.root.position.z +=
                            (z - unit.root.position.z) *
                            Math.min(1, LERP_SPEED * delta);
                    } else {
                        unit.root.position.set(x, y, z);
                    }
                    unit.root.scale.setScalar(scale);
                }
            } else {
                if (inView) {
                    unit.root.position.x +=
                        (x - unit.root.position.x) *
                        Math.min(1, LERP_SPEED * delta);
                    unit.root.position.y +=
                        (y - unit.root.position.y) *
                        Math.min(1, LERP_SPEED * delta);
                    unit.root.position.z +=
                        (z - unit.root.position.z) *
                        Math.min(1, LERP_SPEED * delta);
                } else {
                    unit.root.position.set(x, y, z);
                }
                unit.root.scale.setScalar(scale);
            }

            if (hp <= 0) {
                if (hp >= -10) {
                    if (unit.currentAnimState !== 3) {
                        vatInst.playAnimation(3); // Death
                        unit.currentAnimState = 3;
                        unit.deathTime = performance.now();
                        soundFX.playDeath(x, y, z, camera.position);
                    }
                }
                _iceInstanced.setMatrixAt(i, _deadMatrix);
                _iceNeedsUpdate = true;
                if (unit.currentEffectState > 0) {
                    spawnIceShatterFX(
                        scene,
                        unit.root.position.x,
                        unit.root.position.y + 0.5,
                        unit.root.position.z,
                    );
                    unit.currentEffectState = 0;
                }
            } else {
                if (unit.currentEffectState !== effect) {
                    // Update material kustom (tanpa menghilangkan shader VAT)
                    let activeMat = unit.team === TEAM_A ? teamMatA : teamMatB;
                    if (uType === 3)
                        activeMat =
                            unit.team === TEAM_A ? healerMatA : healerMatB;

                    // Efek stun / frozen
                    if (effect > 0) {
                        activeMat = stunMat;
                        _iceMatrix.makeTranslation(x, y + 0.5, z);
                        _iceInstanced.setMatrixAt(i, _iceMatrix);
                        _iceNeedsUpdate = true;
                    } else {
                        _iceInstanced.setMatrixAt(i, _iceDead);
                        _iceNeedsUpdate = true;
                        if (effect < 0)
                            activeMat =
                                unit.team === TEAM_A ? buffMatA : buffMatB;
                    }

                    // ponytail: mutate color/emissive in-place — no clone, no GC
                    // VAT uniforms live in vatUniforms property, safe to mutate the material directly
                    // color mutation does NOT need needsUpdate (only structural changes do)
                    if (activeMat) {
                        for (let m = 0; m < unit.meshes.length; m++) {
                            const currentMat = vatInst.meshes[m].material;
                            if (!Array.isArray(currentMat)) {
                                (currentMat as THREE.MeshStandardMaterial).color.copy(activeMat.color);
                                const em = (currentMat as any).emissive;
                                const src = (activeMat as any).emissive;
                                if (em && src) {
                                    em.copy(src);
                                    (currentMat as any).emissiveIntensity =
                                        (activeMat as any).emissiveIntensity || 0.0;
                                }
                                // ponytail: no needsUpdate — color/emissive changes are picked up each frame
                            }
                        }
                    }
                    unit.currentEffectState = effect;
                } else if (effect > 0) {
                    _iceMatrix.makeTranslation(x, y + 0.5, z);
                    _iceInstanced.setMatrixAt(i, _iceMatrix);
                    _iceNeedsUpdate = true;
                }

                if (targetIdx !== -1) {
                    const tBase = targetIdx * STRIDE;
                    const tx = data[tBase + IDX_X];
                    const tz = data[tBase + IDX_Z];
                    _lookTarget.set(tx, y, tz);
                    _q1.copy(unit.root.quaternion);
                    unit.root.lookAt(_lookTarget);
                    unit.root.quaternion.slerp(
                        _q1,
                        1 - Math.min(1, 10 * delta),
                    );
                }

                if (unit.currentAnimState !== state) {
                    vatInst.playAnimation(state);
                    unit.currentAnimState = state;
                }
            }

            // Update frame animasi VAT di GPU
            if (inView && hp > 0 && effect <= 0) {
                vatInst.update(delta);
            }

            // Billboard positions
            const billY = unit.root.position.y + scale * 1.9 + 0.3;
            const meshX = unit.root.position.x;
            const meshZ = unit.root.position.z;

            const tooFar = distSq > 6400;
            const showBillboard = hp > 0 && !tooFar && inView;

            if (showBillboard) {
                const maxHp = data[base + IDX_MAX_HP];
                const hpRatio = maxHp > 0 ? hp / maxHp : 0;
                const clampedScaleX = Math.max(0.01, hpRatio);

                // ponytail: reuse pre-computed billboard quaternion — no lookAt per unit
                dummy.position.set(meshX, billY, meshZ);
                dummy.scale.set(1, 1, 1);
                dummy.quaternion.copy(_billboardQuat);
                dummy.updateMatrix();
                hpBarsBg.setMatrixAt(i, dummy.matrix);

                const hpOffset = (1 - clampedScaleX) * 0.5;
                dummy.position.set(
                    meshX - _right.x * hpOffset,
                    billY,
                    meshZ - _right.z * hpOffset
                );
                dummy.scale.set(clampedScaleX, 1, 1);
                dummy.quaternion.copy(_billboardQuat);
                dummy.updateMatrix();
                hpBarsFg.setMatrixAt(i, dummy.matrix);

                dummy.position.set(meshX, billY + 0.35, meshZ);
                dummy.scale.set(1, 1, 1);
                dummy.quaternion.copy(_billboardQuat);
                dummy.updateMatrix();
                if (nameBarsA && nameBarsB) {
                    if (i < TEAM_SIZE) {
                        nameBarsA.setMatrixAt(i, dummy.matrix);
                    } else {
                        nameBarsB.setMatrixAt(i - TEAM_SIZE, dummy.matrix);
                    }
                }

                cdRings.setMatrixAt(i, _deadMatrix);
                immuneRings.setMatrixAt(i, _deadMatrix);
            } else {
                hpBarsBg.setMatrixAt(i, _deadMatrix);
                hpBarsFg.setMatrixAt(i, _deadMatrix);
                cdRings.setMatrixAt(i, _deadMatrix);
                immuneRings.setMatrixAt(i, _deadMatrix);
                if (nameBarsA && nameBarsB) {
                    if (i < TEAM_SIZE) {
                        nameBarsA.setMatrixAt(i, _deadMatrix);
                    } else {
                        nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadMatrix);
                    }
                }
            }
        }
    }

    // ponytail: flush ice matrix once after loop, not per-unit
    if (_iceNeedsUpdate) {
        _iceInstanced.instanceMatrix.needsUpdate = true;
        _iceNeedsUpdate = false;
    }

    if (needsMatrixUpload) {
        hpBarsBg.instanceMatrix.needsUpdate = true;
        hpBarsFg.instanceMatrix.needsUpdate = true;
        cdRings.instanceMatrix.needsUpdate = true;
        immuneRings.instanceMatrix.needsUpdate = true;
        if (nameBarsA && nameBarsB) {
            nameBarsA.instanceMatrix.needsUpdate = true;
            nameBarsB.instanceMatrix.needsUpdate = true;
        }
    }
}

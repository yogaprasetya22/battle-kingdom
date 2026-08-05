/**
 * UnitRenderer.ts — Unit lifecycle, material management, skeletal animation, LOD.
 * Extracted from renderer.ts to reduce cohesion.
 */

import * as THREE from "three";
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
    WEAPON_LOD_DIST_SQ,
} from "../../simulation/constants";

import type { UnitVisual } from "./types";
import type { IUnitVisual } from "../units/base/IUnitVisual";
import { scene, camera, gltfLoader } from "./scene";
import { isRunning } from "../../main";
import { soundFX } from "./SoundFX";
import {
    hpBarsBg,
    hpBarsFg,
    cdRings,
    immuneRings,
    _deadMatrix,
    _deadNameMatrix,
    dummy,
    nameBarsA,
    nameBarsB,
    initNameBars,
} from "../ui/ui_billboards";
import { spawnIceShatterFX } from "../effects/SkillFX";
import { weaponCache } from "../units/UnitVisualHelpers";
import {
    createUnitVisual,
    getModelKey,
    getUnitScale,
} from "../units/UnitVisualFactory";
import { perfProfiler } from "./PerformanceProfiler";

// ── Shared materials ──
let teamMatA: THREE.MeshStandardMaterial | null = null;
let teamMatB: THREE.MeshStandardMaterial | null = null;
let healerMatA: THREE.MeshStandardMaterial | null = null;
let healerMatB: THREE.MeshStandardMaterial | null = null;
let stunMat: THREE.MeshStandardMaterial | null = null;
let buffMatA: THREE.MeshStandardMaterial | null = null;
let buffMatB: THREE.MeshStandardMaterial | null = null;
let stealthMat: THREE.MeshStandardMaterial | null = null;

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

// ── Weapon cache (Fase 1) — populated in helpers module ──
const WEAPON_ASSETS = [
    { name: "sword_1handed", path: "sword_1handed.glb" },
    { name: "shield_round_color", path: "shield_round_color.glb" },
    { name: "bow_withString", path: "bow_withString.glb" },
    { name: "quiver", path: "quiver.glb" },
    { name: "staff", path: "staff.glb" },
    { name: "wand", path: "wand.glb" },
    { name: "spellbook_open", path: "spellbook_open.glb" },
    { name: "crossbow_1handed", path: "crossbow_1handed.glb" },
    { name: "dagger", path: "dagger.glb" },
    { name: "mug_full", path: "mug_full.glb" },
    { name: "spellbook_closed", path: "spellbook_closed.glb" },
    { name: "Skeleton_Axe", path: "Skeleton_Axe.glb" },
    { name: "Skeleton_Blade", path: "Skeleton_Blade.glb" },
    { name: "Skeleton_Crossbow", path: "Skeleton_Crossbow.glb" },
    { name: "Skeleton_Quiver", path: "Skeleton_Quiver.glb" },
    { name: "Skeleton_Shield_Small_A", path: "Skeleton_Shield_Small_A.glb" },
    { name: "Skeleton_Shield_Large_A", path: "Skeleton_Shield_Large_A.glb" },
    { name: "Skeleton_Staff", path: "Skeleton_Staff.glb" },
];
let weaponsCached = false;

async function preloadWeapons(): Promise<void> {
    if (weaponsCached) return;
    const baseUrl = import.meta.env.BASE_URL;
    const results = await Promise.all(
        WEAPON_ASSETS.map(
            (w) =>
                new Promise<{ name: string; gltf: any }>((resolve, reject) => {
                    gltfLoader.load(
                        `${baseUrl}models/character/weapons/${w.path}`,
                        (gltf) => resolve({ name: w.name, gltf }),
                        undefined,
                        (err) => reject(err),
                    );
                }),
        ),
    );
    results.forEach(({ name, gltf }) => {
        weaponCache[name] = gltf.scene as THREE.Group;
    });
    weaponsCached = true;
}

// ── Unit registry ──
const units: UnitVisual[] = [];
/** Instance IUnitVisual untuk setiap unit (factory), untuk akses dispose() */
const unitInstances: (IUnitVisual | null)[] = [];
let modelLoaded = false;
let isCurrentModelSkeleton = false;

const logPanel = document.getElementById("log-panel");

function logDiag(msg: string, isError = false) {
    if (logPanel) {
        logPanel.style.borderColor = isError ? "#ff4444" : "#00ffaa";
        logPanel.style.color = isError ? "#ff8888" : "#00ffaa";
        logPanel.textContent = `🔧 Diagnostic:\n${msg}`;
    }
    console.log(msg);
}

function getModelsForMatchup(baseModel: string): {
    tank: string;
    archer: string;
    mage: string;
    gunslinger: string;
    assassin: string;
} {
    const model = baseModel.toLowerCase();
    let tank = "Knight";
    let archer = "Ranger";
    let mage = "Mage";
    let gunslinger = "Rogue_Hooded";
    let assassin = "Rogue";

    if (model.includes("barbarian")) {
        tank = "Barbarian";
        archer = "Rogue_Hooded";
        mage = "Mage";
    } else if (model.includes("knight")) {
        tank = "Knight";
        archer = "Ranger";
        mage = "Mage";
    } else if (model.includes("rogue_hooded")) {
        tank = "Knight";
        archer = "Rogue_Hooded";
        mage = "Mage";
    } else if (model.includes("rogue")) {
        tank = "Knight";
        archer = "Rogue_Hooded";
        mage = "Mage";
    } else if (model.includes("ranger")) {
        tank = "Knight";
        archer = "Ranger";
        mage = "Mage";
    } else if (model.includes("mage")) {
        tank = "Knight";
        archer = "Ranger";
        mage = "Mage";
    } else if (model.includes("skeleton")) {
        tank = "Skeleton_Warrior";
        archer = "Skeleton_Minion";
        mage = "Skeleton_Mage";
        gunslinger = "Skeleton_Rogue";
        assassin = "Skeleton_Rogue";
    }
    return { tank, archer, mage, gunslinger, assassin };
}

export function changeModel(
    modelName: string,
    matchup: string,
    onLoadComplete?: () => void,
    onError?: () => void,
) {
    modelLoaded = false;
    isCurrentModelSkeleton = modelName.toLowerCase().includes("skeleton");

    // Fase 5: Clean old units — gunakan IUnitVisual.dispose()
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
    stealthMat?.dispose();
    for (let k = 0; k < UNIT_COUNT; k++) _iceInstanced.setMatrixAt(k, _iceDead);
    _iceInstanced.instanceMatrix.needsUpdate = true;

    initNameBars(modelName);

    const classModels = getModelsForMatchup(modelName);
    logDiag(
        `Memuat model...\n🛡️ Tank: ${classModels.tank}\n🏹 Archer: ${classModels.archer}\n🧙 Mage: ${classModels.mage}`,
    );

    const loadGLB = (name: string): Promise<any> => {
        return new Promise((resolve, reject) => {
            const baseUrl = import.meta.env.BASE_URL;
            gltfLoader.load(
                `${baseUrl}models/character/characters/${name}.glb?v=gltfpack`,
                (gltf) => resolve(gltf),
                undefined,
                (err) => reject(err),
            );
        });
    };

    const loadAnimGLB = (name: string): Promise<any> => {
        return new Promise((resolve, reject) => {
            const baseUrl = import.meta.env.BASE_URL;
            gltfLoader.load(
                `${baseUrl}models/character/animation/${name}.glb?v=gltfpack`,
                (gltf) => resolve(gltf),
                undefined,
                (err) => reject(err),
            );
        });
    };

    // Fase 1: Preload weapons, then load all character + animation rigs
    preloadWeapons()
        .then(() =>
            Promise.all([
                loadGLB(classModels.tank),
                loadGLB(classModels.archer),
                loadGLB(classModels.mage),
                loadGLB(classModels.gunslinger),
                loadGLB(classModels.assassin),
                loadGLB("Skeleton_Warrior"),
                loadGLB("Skeleton_Minion"),
                loadGLB("Skeleton_Mage"),
                loadGLB("Skeleton_Rogue"),
                loadAnimGLB("Rig_Medium_General"),
                loadAnimGLB("Rig_Medium_MovementBasic"),
                loadAnimGLB("Rig_Medium_MovementAdvanced"),
                loadAnimGLB("Rig_Medium_CombatMelee"),
                loadAnimGLB("Rig_Medium_CombatRanged"),
                loadAnimGLB("Rig_Medium_Tools"),
            ]),
        )
        .then(
            ([
                gltfTank,
                gltfArcher,
                gltfMage,
                gltfGunslinger,
                gltfAssassin,
                gltfSkelTank,
                gltfSkelArcher,
                gltfSkelMage,
                gltfSkelRogue,
                animGeneral,
                animMovement,
                animMovementAdv,
                animCombat,
                animCombatRanged,
                animTools,
            ]) => {
                // Build anim rig lookup by type
                const animRigs: Record<string, THREE.AnimationClip[]> = {
                    General: animGeneral.animations,
                    MovementBasic: animMovement.animations,
                    MovementAdvanced: animMovementAdv.animations,
                    CombatMelee: animCombat.animations,
                    CombatRanged: animCombatRanged.animations,
                    Tools: animTools.animations,
                };

                logDiag("Model berhasil dimuat. Menginisialisasi visual...");

                let originalMat: THREE.MeshStandardMaterial | null = null;
                gltfTank.scene.traverse((child: any) => {
                    if (!originalMat && child.isMesh) {
                        originalMat =
                            child.material as THREE.MeshStandardMaterial;
                    }
                });

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
                    if ((stunMat as any).roughness !== undefined) {
                        (stunMat as any).roughness = 0.1;
                        (stunMat as any).metalness = 0.1;
                    }
                }

                stealthMat = originalMat
                    ? (originalMat as any).clone()
                    : new THREE.MeshStandardMaterial();
                if (stealthMat) {
                    stealthMat.color.setHex(0x88ffdd);
                    stealthMat.transparent = true;
                    stealthMat.opacity = 0.22;
                    if ((stealthMat as any).emissive) {
                        (stealthMat as any).emissive.setHex(0x00ff88);
                        (stealthMat as any).emissiveIntensity = 0.7;
                    }
                    stealthMat.depthWrite = false;
                }

                try {
                    const gltfModels: Record<number, any> = {
                        0: gltfTank,
                        1: gltfArcher,
                        2: gltfMage,
                        3: gltfMage, // Healer uses Mage model
                        4: gltfGunslinger,
                        5: gltfAssassin,
                        6: gltfSkelTank,
                        7: gltfSkelArcher,
                        8: gltfSkelMage,
                        9: gltfSkelMage,
                        10: gltfSkelRogue,
                        11: gltfSkelRogue,
                    };

                    const customPanel = document.getElementById(
                        "custom-classes-panel",
                    );
                    const activeBadges = customPanel
                        ? customPanel.querySelectorAll(".class-badge.active")
                        : [];
                    const customTypes: number[] = [];
                    activeBadges.forEach((b: any) =>
                        customTypes.push(parseInt(b.dataset.type || "0")),
                    );
                    const enabledTypes =
                        customTypes.length > 0
                            ? customTypes
                            : [0, 1, 2, 3, 4, 5];

                    for (let i = 0; i < UNIT_COUNT; i++) {
                        const team = i < TEAM_SIZE ? TEAM_A : 1;
                        const localIdx = i < TEAM_SIZE ? i : i - TEAM_SIZE;
                        let uType = 0;

                        if (matchup === "custom_composition") {
                            const configAStr =
                                localStorage.getItem("teamAConfig");
                            const configBStr =
                                localStorage.getItem("teamBConfig");
                            const defComp = {
                                tank: 15,
                                archer: 20,
                                mage: 20,
                                healer: 5,
                                gunslinger: 20,
                                assassin: 20,
                            };
                            const confA = configAStr
                                ? JSON.parse(configAStr)
                                : defComp;
                            const confB = configBStr
                                ? JSON.parse(configBStr)
                                : defComp;

                            const typesA: number[] = [];
                            const typesB: number[] = [];
                            const fillTypes = (arr: number[], config: any) => {
                                for (let j = 0; j < (config.tank ?? 0); j++) arr.push(0);
                                for (let j = 0; j < (config.archer ?? 0); j++) arr.push(1);
                                for (let j = 0; j < (config.mage ?? 0); j++) arr.push(2);
                                for (let j = 0; j < (config.healer ?? 0); j++) arr.push(3);
                                for (let j = 0; j < (config.gunslinger ?? 0); j++) arr.push(4);
                                for (let j = 0; j < (config.assassin ?? 0); j++) arr.push(5);
                                for (let j = 0; j < (config.skel_tank ?? 0); j++) arr.push(6);
                                for (let j = 0; j < (config.skel_archer ?? 0); j++) arr.push(7);
                                for (let j = 0; j < (config.skel_mage ?? 0); j++) arr.push(8);
                                for (let j = 0; j < (config.skel_healer ?? 0); j++) arr.push(9);
                                for (let j = 0; j < (config.skel_gunslinger ?? 0); j++) arr.push(10);
                                for (let j = 0; j < (config.skel_assassin ?? 0); j++) arr.push(11);
                            };
                            fillTypes(typesA, confA);
                            fillTypes(typesB, confB);

                            const types = team === TEAM_A ? typesA : typesB;
                            if (localIdx < types.length) {
                                uType = types[localIdx];
                            } else {
                                uType = 0; // inactive fallback model setup (will be hidden by HP < -10)
                            }
                        } else {
                            uType = localIdx % 6;
                            const healerCount = Math.max(
                                1,
                                Math.round(TEAM_SIZE * 0.02),
                            );
                            if (localIdx < healerCount) {
                                uType = 3;
                            }
                            if (matchup === "custom") {
                                uType =
                                    enabledTypes[
                                        localIdx % enabledTypes.length
                                    ];
                            } else if (matchup === "mage_vs_tank") {
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
                        }

                        const baseType = uType % 6;

                        // Pilih material berdasarkan tim & tipe
                        const mat =
                            baseType === 3
                                ? team === TEAM_A
                                    ? healerMatA!
                                    : healerMatB!
                                : team === TEAM_A
                                  ? teamMatA!
                                  : teamMatB!;

                        const isSkeleton = uType >= 6 || modelName.toLowerCase().includes("skeleton");

                        const srcGLTF = gltfModels[uType];
                        const unitVis = createUnitVisual(
                            baseType,
                            srcGLTF,
                            mat,
                            animRigs,
                            isSkeleton,
                        );
                        unitInstances[i] = unitVis;

                        // Save original materials for skeleton units
                        const originalMaterials = isSkeleton ? unitVis.meshes.map((m) => m.material) : undefined;

                        // Override scale sesuai tipe unit
                        const scale = getUnitScale(baseType);
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
                            originalMaterials,
                        });
                    }

                    modelLoaded = true;
                    logDiag(`Sukses menginisialisasi ${UNIT_COUNT} unit!`);
                    if (onLoadComplete) onLoadComplete();
                } catch (err: any) {
                    logDiag(`Error kloning/inisialisasi: ${err.message}`, true);
                    if (onError) onError();
                }
            },
        )
        .catch((err) => {
            logDiag(
                `Gagal mengunduh file model: ${err.message || err.toString()}`,
                true,
            );
            if (onError) onError();
        });
}

function fadeToAnimation(
    unit: UnitVisual,
    name: "idle" | "run" | "attack" | "death",
) {
    const targetAction = unit.actions[name];
    if (!targetAction) return;

    const currentName = ["idle", "run", "attack", "death"][
        unit.currentAnimState
    ] as "idle" | "run" | "attack" | "death";
    const currentAction = unit.actions[currentName];

    if (currentAction && currentAction !== targetAction) {
        targetAction.reset();
        targetAction.play();
        currentAction.crossFadeTo(targetAction, 0.15, true);
    } else {
        targetAction.play();
    }
}

// ponytail: Pre-allocate per-frame vectors
const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
let animFrameCount = 0;
// ponytail: dirty flag — flush ice instanceMatrix once per frame, not per unit
let _iceNeedsUpdate = false;
// ponytail: pre-computed billboard quaternion (shared across all units in one frame)
const _billboardQuat = new THREE.Quaternion();
const _billboardMatrix = new THREE.Matrix4();
const _fgMatrix = new THREE.Matrix4();
const _tempColor = new THREE.Color();

const LERP_SPEED = 12;

// ── Animation batch optimization ──
let animFrameBatch: number[] = []; // track units yang perlu mixer update
const MAX_MIXER_UPDATES_PER_FRAME = 20; // batch limit untuk prevent frame drops

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
    let billboardUpdatedThisFrame = false;

    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _forward.set(0, 0, 1).applyQuaternion(camera.quaternion);
    animFrameCount++;

    // Reset mixer batch queue setiap frame
    animFrameBatch.length = 0;

    _projScreen.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
    );
    _frustum.setFromProjectionMatrix(_projScreen);

    // ponytail: billboard quaternion = camera quaternion (all billboards face camera)
    _billboardQuat.copy(camera.quaternion);
    _billboardMatrix.makeRotationFromQuaternion(_billboardQuat);

    let animTimeTotal = 0;
    let billTimeTotal = 0;

    for (let i = 0; i < UNIT_COUNT; i++) {
        const base = i * STRIDE;
        const hp = data[base + IDX_HP];
        const x = data[base + IDX_X];
        const y = data[base + IDX_Y];
        const z = data[base + IDX_Z];
        const targetIdx = data[base + IDX_TARGET];
        const state = data[base + IDX_ANIM];
        const uType = data[base + IDX_TYPE];
        const baseType = uType % 6;
        const effect = data[base + IDX_EFFECT_STATE];
        const isStealthed = effect >= 1000 && effect < 2000;

        const unit = units[i];
        if (!unit) continue;

        if (hp === -999) {
            unit.root.visible = false;
            if (unit.root.position.y !== -999) {
                unit.root.position.set(x, -999, z);
                unit.root.scale.setScalar(0.0001);
                (unit as any)._wasAlive = false;

                hpBarsBg.setMatrixAt(i, _deadNameMatrix);
                hpBarsFg.setMatrixAt(i, _deadNameMatrix);
                cdRings.setMatrixAt(i, _deadNameMatrix);
                immuneRings.setMatrixAt(i, _deadNameMatrix);
                if (nameBarsA && nameBarsB) {
                    if (i < TEAM_SIZE) {
                        nameBarsA.setMatrixAt(i, _deadNameMatrix);
                    } else {
                        nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadNameMatrix);
                    }
                }
            }
            continue;
        }

        // Handle death state and early continue for fully dead units
        if (hp <= 0 && unit.deathTime) {
            const elapsed = performance.now() - unit.deathTime;
            if (elapsed > 2000) {
                if (unit.root.visible || (unit as any)._wasAlive) {
                    unit.root.position.set(x, -999, z);
                    unit.root.scale.setScalar(0.0001);
                    unit.root.visible = false;
                    (unit as any)._wasAlive = false;

                    hpBarsBg.setMatrixAt(i, _deadNameMatrix);
                    hpBarsFg.setMatrixAt(i, _deadNameMatrix);
                    cdRings.setMatrixAt(i, _deadNameMatrix);
                    immuneRings.setMatrixAt(i, _deadNameMatrix);
                    if (nameBarsA && nameBarsB) {
                        if (i < TEAM_SIZE) {
                            nameBarsA.setMatrixAt(i, _deadNameMatrix);
                        } else {
                            nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadNameMatrix);
                        }
                    }
                }
                continue; // CRITICAL OPTIMIZATION: skip updating fully dead units
            }
        }

        const scale = getUnitScale(baseType);

        // ponytail: compute distSq once, used for LOD + mixer throttle
        const dx = x - camera.position.x;
        const dy = y - camera.position.y;
        const dz = z - camera.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (hp < -10) {
            unit.root.position.set(x, -999, z);
            unit.root.scale.setScalar(0.0001);
            unit.root.visible = false;
            (unit as any)._wasAlive = false;
            // Sembunyikan semua billboard untuk unit yang belum spawn
            hpBarsBg.setMatrixAt(i, _deadNameMatrix);
            hpBarsFg.setMatrixAt(i, _deadNameMatrix);
            cdRings.setMatrixAt(i, _deadNameMatrix);
            immuneRings.setMatrixAt(i, _deadNameMatrix);
            if (nameBarsA && nameBarsB) {
                if (i < TEAM_SIZE) {
                    nameBarsA.setMatrixAt(i, _deadNameMatrix);
                } else {
                    nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadNameMatrix);
                }
            }

        } else {
            _unitSphere.center.set(x, y, z);
            const inView = _frustum.intersectsSphere(_unitSphere);
            unit.root.visible = inView;

            const showMesh = distSq < UNIT_LOD_DIST_SQ;

            for (let m = 0; m < unit.meshes.length; m++) {
                unit.meshes[m].visible = showMesh;
            }

            // Fast path for weapon LOD
            const weaponLodDist = baseType === 5 ? 300 : WEAPON_LOD_DIST_SQ;
            const showWeapons = distSq < weaponLodDist;
 
            if (unit.weapons && unit.weapons.length > 0) {
                for (let w = 0; w < unit.weapons.length; w++) {
                    unit.weapons[w].visible = showMesh && showWeapons;
                }
            } else if (baseType === 5 && inView && showMesh) {
                const assassinVisual = unit as any;
                if (assassinVisual.getWeaponsForLOD) {
                    assassinVisual.getWeaponsForLOD();
                }
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
                        fadeToAnimation(unit, "death");
                        unit.currentAnimState = 3;
                        unit.deathTime = performance.now();
                        soundFX.playDeath(x, y, z, camera.position);
                    }
                }
                _iceInstanced.setMatrixAt(i, _iceDead);
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
                    let activeMat = unit.team === TEAM_A ? teamMatA : teamMatB;
                    if (baseType === 3)
                        activeMat =
                            unit.team === TEAM_A ? healerMatA : healerMatB;
                    if (isStealthed) {
                        activeMat = stealthMat;
                        _iceInstanced.setMatrixAt(i, _iceDead);
                        _iceNeedsUpdate = true;
                        if (activeMat) {
                            for (let m = 0; m < unit.meshes.length; m++) {
                                unit.meshes[m].material = activeMat;
                            }
                        }
                    } else if (effect > 0) {
                        activeMat = stunMat;
                        _iceMatrix.makeTranslation(x, y + 0.5, z);
                        _iceInstanced.setMatrixAt(i, _iceMatrix);
                        _iceNeedsUpdate = true;
                        if (activeMat) {
                            for (let m = 0; m < unit.meshes.length; m++) {
                                unit.meshes[m].material = activeMat;
                            }
                        }
                    } else {
                        _iceInstanced.setMatrixAt(i, _iceDead);
                        _iceNeedsUpdate = true;
                        if (effect < 0) {
                            activeMat = unit.team === TEAM_A ? buffMatA : buffMatB;
                            if (activeMat) {
                                for (let m = 0; m < unit.meshes.length; m++) {
                                    unit.meshes[m].material = activeMat;
                                }
                            }
                        } else {
                            if (unit.originalMaterials) {
                                for (let m = 0; m < unit.meshes.length; m++) {
                                    unit.meshes[m].material = unit.originalMaterials[m];
                                }
                            } else if (activeMat) {
                                for (let m = 0; m < unit.meshes.length; m++) {
                                    unit.meshes[m].material = activeMat;
                                }
                            }
                        }
                    }
                    unit.currentEffectState = effect;
                } else if (!isStealthed && effect > 0) {
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
                    if (state === 0) fadeToAnimation(unit, "idle");
                    else if (state === 1) fadeToAnimation(unit, "run");
                    else if (state === 2) fadeToAnimation(unit, "attack");
                    unit.currentAnimState = state;
                }
            }

            const isDying =
                hp <= 0 &&
                hp >= -10 &&
                unit.deathTime &&
                performance.now() - unit.deathTime < 2000;

            // ★ ANIMATION LOD
            let skipFrames = 1;
            if (distSq > 1600) {
                skipFrames = 4;
            } else if (distSq > 800) {
                skipFrames = 2;
            }
            if (unit.animationFrameSkipCount === undefined) unit.animationFrameSkipCount = 0;
            unit.animationFrameSkipCount++;

            const assassinTooFar = baseType === 5 && distSq > 12225;
            const shouldUpdateMixer =
                inView &&
                showMesh &&
                (isDying || (hp > 0 && !(effect > 0 && effect < 1000))) &&
                !assassinTooFar;

            if (shouldUpdateMixer) {
                unit.accumulatedDelta += delta;
                if (unit.animationFrameSkipCount >= skipFrames) {
                    unit.mixer.update(unit.accumulatedDelta);
                    unit.accumulatedDelta = 0;
                    unit.animationFrameSkipCount = 0;
                }
            } else {
                unit.accumulatedDelta = 0;
            }

            // Billboard positions
            const billY = unit.root.position.y + scale * 1.9 + 0.3;
            const meshX = unit.root.position.x;
            const meshZ = unit.root.position.z;

            const tooFar = distSq > 6400;
            const showBillboard = hp > 0 && !tooFar && inView;
            const maxHp = data[base + IDX_MAX_HP];
            const hpRatio = maxHp > 0 ? hp / maxHp : 0;

            if (showBillboard) {

                const lastState = (unit as any)._lastBBState;
                const stateChanged = !lastState ||
                    lastState.hp !== hp ||
                    lastState.maxHp !== maxHp ||
                    lastState.x !== meshX ||
                    lastState.y !== billY ||
                    lastState.z !== meshZ ||
                    lastState.showBillboard !== showBillboard;

                if (cameraMoved || stateChanged) {
                    billboardUpdatedThisFrame = true;
                    if (!lastState) {
                        (unit as any)._lastBBState = { hp, maxHp, x: meshX, y: billY, z: meshZ, showBillboard };
                    } else {
                        lastState.hp = hp;
                        lastState.maxHp = maxHp;
                        lastState.x = meshX;
                        lastState.y = billY;
                        lastState.z = meshZ;
                        lastState.showBillboard = showBillboard;
                    }

                    // ponytail: optimized direct matrix elements modification (no dummy compose/decompose)
                    _billboardMatrix.elements[12] = meshX;
                    _billboardMatrix.elements[13] = billY;
                    _billboardMatrix.elements[14] = meshZ;
                    hpBarsBg.setMatrixAt(i, _billboardMatrix);

                    const teamId = i < TEAM_SIZE ? 0.0 : 1.0;
                    _fgMatrix.copy(_billboardMatrix);
                    _fgMatrix.elements[0] *= hpRatio;
                    _fgMatrix.elements[1] *= hpRatio;
                    _fgMatrix.elements[2] *= hpRatio;

                    _fgMatrix.elements[4] *= teamId;
                    _fgMatrix.elements[5] *= teamId;
                    _fgMatrix.elements[6] *= teamId;

                    _fgMatrix.elements[8] *= maxHp;
                    _fgMatrix.elements[9] *= maxHp;
                    _fgMatrix.elements[10] *= maxHp;
                    hpBarsFg.setMatrixAt(i, _fgMatrix);
                    _tempColor.setRGB(hpRatio, teamId, maxHp);
                    hpBarsFg.setColorAt(i, _tempColor);

                    _billboardMatrix.elements[13] = billY + 0.18;
                    if (nameBarsA && nameBarsB) {
                        if (i < TEAM_SIZE) {
                            nameBarsA.setMatrixAt(i, _billboardMatrix);
                        } else {
                            nameBarsB.setMatrixAt(i - TEAM_SIZE, _billboardMatrix);
                        }
                    }

                    cdRings.setMatrixAt(i, _deadNameMatrix);
                    immuneRings.setMatrixAt(i, _deadNameMatrix);
                }
            } else {
                const lastState = (unit as any)._lastBBState;
                const stateChanged = !lastState || lastState.showBillboard !== showBillboard;

                if (stateChanged) {
                    billboardUpdatedThisFrame = true;
                    if (!lastState) {
                        (unit as any)._lastBBState = { hp, maxHp, x: meshX, y: billY, z: meshZ, showBillboard };
                    } else {
                        lastState.showBillboard = showBillboard;
                    }

                    hpBarsBg.setMatrixAt(i, _deadNameMatrix);
                    hpBarsFg.setMatrixAt(i, _deadNameMatrix);
                    cdRings.setMatrixAt(i, _deadNameMatrix);
                    immuneRings.setMatrixAt(i, _deadNameMatrix);
                    if (nameBarsA && nameBarsB) {
                        if (i < TEAM_SIZE) {
                            nameBarsA.setMatrixAt(i, _deadNameMatrix);
                        } else {
                            nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadNameMatrix);
                        }
                    }
                }
            }
        }
    }

    perfProfiler.trackSystemTime("animations", delta * 1000 * 0.4); // Simplified estimation
    perfProfiler.trackSystemTime("billboards", delta * 1000 * 0.2); // Simplified estimation

    // ponytail: flush ice matrix once after loop, not per-unit
    if (_iceNeedsUpdate) {
        _iceInstanced.instanceMatrix.needsUpdate = true;
        _iceNeedsUpdate = false;
    }

    if (cameraMoved || billboardUpdatedThisFrame) {
        hpBarsBg.instanceMatrix.needsUpdate = true;
        hpBarsFg.instanceMatrix.needsUpdate = true;
        if (hpBarsFg.instanceColor) {
            hpBarsFg.instanceColor.needsUpdate = true;
        }
        cdRings.instanceMatrix.needsUpdate = true;
        immuneRings.instanceMatrix.needsUpdate = true;
        if (nameBarsA && nameBarsB) {
            nameBarsA.instanceMatrix.needsUpdate = true;
            nameBarsB.instanceMatrix.needsUpdate = true;
        }
    }
}

export function resetUnitsVisual() {
    units.forEach((unit, i) => {
        unit.currentAnimState = 0;
        unit.currentEffectState = 0;
        unit.accumulatedDelta = 0;
        unit.deathTime = undefined;
        _iceInstanced.setMatrixAt(i, _iceDead);

        // Hide billboards on reset
        hpBarsBg.setMatrixAt(i, _deadNameMatrix);
        hpBarsFg.setMatrixAt(i, _deadNameMatrix);
        cdRings.setMatrixAt(i, _deadNameMatrix);
        immuneRings.setMatrixAt(i, _deadNameMatrix);
        if (nameBarsA && nameBarsB) {
            if (i < TEAM_SIZE) {
                nameBarsA.setMatrixAt(i, _deadNameMatrix);
            } else {
                nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadNameMatrix);
            }
        }

        const uType = sharedData ? sharedData[i * STRIDE + IDX_TYPE] : 0;
        const baseType = uType % 6;
        let defaultMat = unit.team === TEAM_A ? teamMatA! : teamMatB!;
        if (baseType === 3) {
            defaultMat = unit.team === TEAM_A ? healerMatA! : healerMatB!;
        }
        if (unit.originalMaterials) {
            for (let m = 0; m < unit.meshes.length; m++) {
                unit.meshes[m].material = unit.originalMaterials[m];
            }
        } else {
            for (let m = 0; m < unit.meshes.length; m++) {
                unit.meshes[m].material = defaultMat;
            }
        }
        if (unit.mixer) {
            unit.mixer.stopAllAction();
        }
        if (unit.actions.idle) {
            unit.actions.idle.play();
        }
    });

    _iceInstanced.instanceMatrix.needsUpdate = true;
    hpBarsBg.instanceMatrix.needsUpdate = true;
    hpBarsFg.instanceMatrix.needsUpdate = true;
    cdRings.instanceMatrix.needsUpdate = true;
    immuneRings.instanceMatrix.needsUpdate = true;
    if (nameBarsA && nameBarsB) {
        nameBarsA.instanceMatrix.needsUpdate = true;
        nameBarsB.instanceMatrix.needsUpdate = true;
    }
}

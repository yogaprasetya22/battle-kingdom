/**
 * UnitRenderer.ts — Unit lifecycle, material management, skeletal animation, LOD.
 * Extracted from renderer.ts to reduce cohesion.
 */

import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
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
import { scene, camera, gltfLoader } from "./scene";
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

// ── Shared materials ──
let teamMatA: THREE.MeshStandardMaterial | null = null;
let teamMatB: THREE.MeshStandardMaterial | null = null;
let healerMatA: THREE.MeshStandardMaterial | null = null;
let healerMatB: THREE.MeshStandardMaterial | null = null;
let stunMat: THREE.MeshStandardMaterial | null = null;
let buffMatA: THREE.MeshStandardMaterial | null = null;
let buffMatB: THREE.MeshStandardMaterial | null = null;

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
let modelLoaded = false;

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
} {
    const model = baseModel.toLowerCase();
    let tank = "Knight";
    let archer = "Ranger";
    let mage = "Mage";

    if (model.includes("barbarian")) {
        tank = "Barbarian";
        archer = "Rogue";
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
        archer = "Rogue";
        mage = "Mage";
    } else if (model.includes("ranger")) {
        tank = "Knight";
        archer = "Ranger";
        mage = "Mage";
    } else if (model.includes("mage")) {
        tank = "Knight";
        archer = "Ranger";
        mage = "Mage";
    }
    return { tank, archer, mage };
}

export function changeModel(
    modelName: string,
    matchup: string,
    onLoadComplete?: () => void,
    onError?: () => void,
) {
    modelLoaded = false;

    // Clean old units
    units.forEach((unit) => {
        scene.remove(unit.root);
        if (unit.mixer) {
            unit.mixer.stopAllAction();
            unit.mixer.uncacheRoot(unit.root);
        }
    });
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

    Promise.all([
        loadGLB(classModels.tank),
        loadGLB(classModels.archer),
        loadGLB(classModels.mage),
        loadAnimGLB("Rig_Medium_General"),
        loadAnimGLB("Rig_Medium_MovementBasic"),
        loadAnimGLB("Rig_Medium_CombatMelee"),
    ])
        .then(
            ([
                gltfTank,
                gltfArcher,
                gltfMage,
                animGeneral,
                animMovement,
                animCombat,
            ]) => {
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

                try {
                    for (let i = 0; i < UNIT_COUNT; i++) {
                        const team = i < TEAM_SIZE ? TEAM_A : 1;
                        const localIdx = i < TEAM_SIZE ? i : i - TEAM_SIZE;
                        let uType = localIdx % 3;
                        const healerCount = Math.max(
                            1,
                            Math.round(TEAM_SIZE * 0.02),
                        );
                        if (localIdx < healerCount) {
                            uType = 3;
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
                        }

                        let targetGLTF = gltfTank;
                        if (uType === 1) targetGLTF = gltfArcher;
                        else if (uType === 2 || uType === 3)
                            targetGLTF = gltfMage;

                        const clonedScene = SkeletonUtils.clone(
                            targetGLTF.scene,
                        ) as THREE.Group;
                        clonedScene.scale.setScalar(0.6);

                        const meshes: THREE.Mesh[] = [];
                        clonedScene.traverse((child: any) => {
                            if (child.isMesh) {
                                const mesh = child as THREE.Mesh;
                                mesh.material =
                                    uType === 3
                                        ? team === TEAM_A
                                            ? healerMatA!
                                            : healerMatB!
                                        : team === TEAM_A
                                          ? teamMatA!
                                          : teamMatB!;
                                meshes.push(mesh);
                            }
                        });

                        scene.add(clonedScene);

                        const mixer = new THREE.AnimationMixer(clonedScene);
                        const clips = [
                            ...animGeneral.animations,
                            ...animMovement.animations,
                            ...animCombat.animations,
                        ];

                        const idleClip =
                            clips.find(
                                (c) =>
                                    c.name === "Idle_A" ||
                                    c.name.toLowerCase() === "idle",
                            ) || clips[0];
                        const runClip =
                            clips.find(
                                (c) =>
                                    c.name === "Running_A" ||
                                    c.name.toLowerCase() === "run" ||
                                    c.name.toLowerCase().includes("walk"),
                            ) || clips[0];
                        const attackClip =
                            clips.find(
                                (c) =>
                                    c.name === "Melee_1H_Attack_Chop" ||
                                    c.name.toLowerCase() === "punch" ||
                                    c.name.toLowerCase().includes("attack") ||
                                    c.name.toLowerCase().includes("slash"),
                            ) || clips[0];
                        const deathClip =
                            clips.find(
                                (c) =>
                                    c.name === "Death_A" ||
                                    c.name.toLowerCase() === "death",
                            ) || clips[0];

                        const actions = {
                            idle: mixer.clipAction(idleClip),
                            run: mixer.clipAction(runClip),
                            attack: mixer.clipAction(attackClip),
                            death: mixer.clipAction(deathClip),
                        };

                        if (actions.death) {
                            actions.death.setLoop(THREE.LoopOnce, 1);
                            actions.death.clampWhenFinished = true;
                        }
                        if (actions.idle) {
                            actions.idle.play();
                            actions.idle.time =
                                Math.random() * idleClip.duration;
                        }

                        units.push({
                            root: clonedScene,
                            mixer,
                            actions,
                            currentAnimState: 0,
                            currentEffectState: 0,
                            meshes,
                            team,
                            accumulatedDelta: 0,
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

// ── Billboard spatial hash for smart stacking ──
interface BillEntry {
    idx: number;
    x: number;
    yBase: number;
    z: number;
    distSq: number;
    hpRatio: number;
    team: number; // 0 = team A, 1 = team B
    yOffset: number;
}
const _billData: BillEntry[] = [];
let _billCount = 0;

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
        if (!unit) continue;

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

        let scale = 0.6;
        if (uType === 0) scale = 0.85;
        else if (uType === 1) scale = 0.42;
        else if (uType === 2) scale = 0.6;
        else if (uType === 3) scale = 0.5;

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
            _iceInstanced.instanceMatrix.needsUpdate = true;
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
                if (uType === 3)
                    activeMat = unit.team === TEAM_A ? healerMatA : healerMatB;
                if (effect > 0) {
                    activeMat = stunMat;
                    _iceMatrix.makeTranslation(x, y + 0.5, z);
                    _iceInstanced.setMatrixAt(i, _iceMatrix);
                    _iceInstanced.instanceMatrix.needsUpdate = true;
                } else {
                    _iceInstanced.setMatrixAt(i, _iceDead);
                    _iceInstanced.instanceMatrix.needsUpdate = true;
                    if (effect < 0)
                        activeMat = unit.team === TEAM_A ? buffMatA : buffMatB;
                }
                if (activeMat) {
                    for (let m = 0; m < unit.meshes.length; m++) {
                        unit.meshes[m].material = activeMat;
                    }
                }
                unit.currentEffectState = effect;
            } else if (effect > 0) {
                _iceMatrix.makeTranslation(x, y + 0.5, z);
                _iceInstanced.setMatrixAt(i, _iceMatrix);
                _iceInstanced.instanceMatrix.needsUpdate = true;
            }

            if (targetIdx !== -1) {
                const tBase = targetIdx * STRIDE;
                const tx = data[tBase + IDX_X];
                const tz = data[tBase + IDX_Z];
                _lookTarget.set(tx, y, tz);
                _q1.copy(unit.root.quaternion);
                unit.root.lookAt(_lookTarget);
                unit.root.quaternion.slerp(_q1, 1 - Math.min(1, 10 * delta));
            }

            if (unit.currentAnimState !== state) {
                if (state === 0) fadeToAnimation(unit, "idle");
                else if (state === 1) fadeToAnimation(unit, "run");
                else if (state === 2) fadeToAnimation(unit, "attack");
                unit.currentAnimState = state;
            }
        }

        unit.accumulatedDelta += delta;

        const isDying =
            hp <= 0 &&
            hp >= -10 &&
            unit.deathTime &&
            performance.now() - unit.deathTime < 2000;

        // ponytail: throttle skeletal animation — 30fps for units beyond 45m
        // use (animFrameCount + i) so half the far units update each frame, distributed evenly
        const _mixerThrottle =
            ((animFrameCount + i) & 1) === 0 || distSq < 2025;

        if (isDying) {
            unit.mixer.update(unit.accumulatedDelta);
            unit.accumulatedDelta = 0;
        } else if (hp > 0 && _mixerThrottle) {
            if (effect <= 0) {
                unit.mixer.update(unit.accumulatedDelta);
            }
            unit.accumulatedDelta = 0;
        }

        // Billboard positions — height based on unit scale
        // ponytail: throttle billboard matrix update to every 3rd frame
        const _billUpdate = animFrameCount % 3 === 0;
        if (_billUpdate) {
            const billY = y + scale * 1.9 + 0.3;
            // Distance culling: hide billboard beyond 80 world units
            const tooFar = distSq > 6400;
            if (hp > 0 && !tooFar) {
                const maxHp = data[base + IDX_MAX_HP];
                const hpRatio = maxHp > 0 ? hp / maxHp : 0;
                // Defer to spatial hash pass
                _billData[_billCount] = {
                    idx: i,
                    x,
                    yBase: billY,
                    z,
                    distSq,
                    hpRatio,
                    team: i < TEAM_SIZE ? 0 : 1,
                    yOffset: 0,
                };
                _billCount++;
            } else {
                // Dead or too far — hide
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

    // ── Pass 2: spatial hash for smart stacking ──
    if (_billCount > 0) {
        // Simple grid hash: 2-unit cell size; hash key = floor(x/2) | floor(z/2) << 16
        const hashToIndices = new Map<number, number[]>();
        for (let b = 0; b < _billCount; b++) {
            const entry = _billData[b];
            const key =
                (Math.floor(entry.x * 0.5) & 0xffff) |
                ((Math.floor(entry.z * 0.5) & 0xffff) << 16);
            let arr = hashToIndices.get(key);
            if (!arr) {
                arr = [];
                hashToIndices.set(key, arr);
            }
            arr.push(b);
        }

        // For each cluster: sort by distSq (nearest first), assign yOffset
        hashToIndices.forEach((cluster) => {
            if (cluster.length <= 1) return;
            // Sort by distSq ascending (nearest = lowest yOffset)
            cluster.sort((a, b) => _billData[a].distSq - _billData[b].distSq);
            const baseY = _billData[cluster[0]].yBase;
            for (let c = 0; c < cluster.length; c++) {
                _billData[cluster[c]].yOffset = baseY + c * 0.45;
            }
        });

        // Write matrices
        for (let b = 0; b < _billCount; b++) {
            const { idx, x, z, hpRatio, team, yOffset } = _billData[b];
            const i = idx;

            // HP bar background
            dummy.position.set(x, yOffset, z);
            dummy.scale.set(1, 1, 1);
            dummy.lookAt(camera.position);
            dummy.updateMatrix();
            hpBarsBg.setMatrixAt(i, dummy.matrix);

            // HP bar foreground
            const clampedScaleX = Math.max(0.01, hpRatio);
            dummy.position.set(x - (1 - clampedScaleX) * 0.5, yOffset, z);
            dummy.scale.set(clampedScaleX, 1, 1);
            dummy.lookAt(camera.position);
            dummy.updateMatrix();
            hpBarsFg.setMatrixAt(i, dummy.matrix);

            // Name label — above HP bar
            dummy.position.set(x, yOffset + 0.35, z);
            dummy.scale.set(1, 1, 1);
            dummy.lookAt(camera.position);
            dummy.updateMatrix();
            if (nameBarsA && nameBarsB) {
                if (team === 0) {
                    nameBarsA.setMatrixAt(i, dummy.matrix);
                } else {
                    nameBarsB.setMatrixAt(i - TEAM_SIZE, dummy.matrix);
                }
            }

            cdRings.setMatrixAt(i, _deadMatrix);
            immuneRings.setMatrixAt(i, _deadMatrix);
        }
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

    // Reset for next frame
    _billCount = 0;
}

export function resetUnitsVisual() {
    units.forEach((unit, i) => {
        unit.currentAnimState = 0;
        unit.currentEffectState = 0;
        unit.accumulatedDelta = 0;
        unit.deathTime = undefined;
        _iceInstanced.setMatrixAt(i, _iceDead);
        const uType = sharedData ? sharedData[i * STRIDE + IDX_TYPE] : 0;
        let defaultMat = unit.team === TEAM_A ? teamMatA! : teamMatB!;
        if (uType === 3) {
            defaultMat = unit.team === TEAM_A ? healerMatA! : healerMatB!;
        }
        for (let m = 0; m < unit.meshes.length; m++) {
            unit.meshes[m].material = defaultMat;
        }
        if (unit.mixer) {
            unit.mixer.stopAllAction();
        }
        if (unit.actions.idle) {
            unit.actions.idle.play();
        }
    });
    _iceInstanced.instanceMatrix.needsUpdate = true;
}

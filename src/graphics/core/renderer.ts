/**
 * renderer.ts — Pure Three.js setup dengan dukungan animasi Skeletal + OPTIMASI MATERIAL SHARING
 */

import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { WindEffectManager } from "../effects/WindLines";
import {
    UNIT_COUNT,
    TEAM_SIZE,
    STRIDE,
    IDX_X,
    IDX_Y,
    IDX_Z,
    IDX_HP,
    IDX_ANIM,
    IDX_TARGET,
    TEAM_A,
    IDX_TYPE,
    IDX_MAX_HP,
    IDX_EFFECT_STATE,
    IDX_SKILL1_CD,
    IDX_SKILL2_CD,
    IDX_SKILL3_CD,
    IDX_IMMUNE_CD,
    getTerrainHeight,
} from "../../simulation/constants";

import type { UnitVisual } from "./types";
import { scene, camera, renderer, controls, gltfLoader } from "./scene";
import { World } from "../scenery/World";
import {
    hpBarsBg,
    hpBarsFg,
    cdRings,
    immuneRings,
    dummy,
    _deadMatrix,
    nameBarsA,
    nameBarsB,
    initNameBars,
} from "../ui/ui_billboards";

import {
    spawnLightningFX,
    spawnArrowVolleyFX,
    spawnFireballFX,
    spawnDoubleShotFX,
    spawnTauntFX,
    spawnShieldBashFX,
    spawnEvasiveLeapFX,
    spawnFrostNovaBurstFX,
    spawnIronFortitudeAuraFX,
    spawnBasicAttackFX,
    spawnIceShatterFX,
    updateFX,
    canSpawnFX,
    effectUniforms,
} from "../effects/SkillFX";

// Global shared materials
let teamMatA: THREE.MeshStandardMaterial | null = null;
let teamMatB: THREE.MeshStandardMaterial | null = null;
let stunMat: THREE.MeshStandardMaterial | null = null;
let buffMatA: THREE.MeshStandardMaterial | null = null;
let buffMatB: THREE.MeshStandardMaterial | null = null;

const units: UnitVisual[] = [];
let modelLoaded = false;
let clock = new THREE.Clock();

const logPanel = document.getElementById("log-panel");

function logDiag(msg: string, isError = false) {
    if (logPanel) {
        logPanel.style.borderColor = isError ? "#ff4444" : "#00ffaa";
        logPanel.style.color = isError ? "#ff8888" : "#00ffaa";
        logPanel.textContent = `🔧 Diagnostic:\n${msg}`;
    }
    console.log(msg);
}

// Inisialisasi World Environment
const world = new World(scene, gltfLoader);

// Inisialisasi efek angin
const windEffect = new WindEffectManager(scene);
windEffect.start();

function getModelsForMatchup(baseModel: string): {
    tank: string;
    archer: string;
    mage: string;
} {
    const model = baseModel.toLowerCase();
    let tank = "Knight_Golden_Male";
    let archer = "Elf";
    let mage = "Wizard";

    if (model.includes("knight")) {
        tank = "Knight_Golden_Male";
        archer = "Knight_Golden_Female";
        mage = "Wizard";
    } else if (model.includes("bluesoldier")) {
        tank = "BlueSoldier_Male";
        archer = "BlueSoldier_Female";
        mage = "Wizard";
    } else if (model.includes("soldier")) {
        tank = "Soldier_Male";
        archer = "Soldier_Female";
        mage = "Witch";
    } else if (model.includes("ninja")) {
        tank = "Ninja_Sand";
        archer = "Ninja_Female";
        mage = "Ninja_Male";
    } else if (model.includes("zombie")) {
        tank = "Zombie_Male";
        archer = "Zombie_Female";
        mage = "Witch";
    } else if (model.includes("chef")) {
        tank = "Chef_Male";
        archer = "Chef_Female";
        mage = "Chef_Hat";
    } else if (model.includes("cowboy")) {
        tank = "Cowboy_Male";
        archer = "Cowboy_Female";
        mage = "Elf";
    } else if (model.includes("doctor")) {
        tank = "Doctor_Male_Old";
        archer = "Doctor_Female_Young";
        mage = "Doctor_Male_Young";
    } else if (model.includes("casual")) {
        tank = "Casual_Male";
        archer = "Casual_Female";
        mage = "Casual_Bald";
    } else if (model === "wizard" || model === "witch") {
        tank = "Knight_Male";
        archer = "Elf";
        mage = baseModel;
    } else if (model === "elf") {
        tank = "Knight_Golden_Male";
        archer = "Elf";
        mage = "Wizard";
    } else if (model === "cow" || model === "pug") {
        tank = "Cow";
        archer = "Pug";
        mage = "Elf";
    } else {
        tank = baseModel;
    }
    return { tank, archer, mage };
}

export function changeModel(
    modelName: string,
    onLoadComplete?: () => void,
    onError?: () => void,
) {
    modelLoaded = false;

    // Bersihkan unit lama
    units.forEach((unit) => {
        scene.remove(unit.root);
        if (unit.mixer) {
            unit.mixer.stopAllAction();
            unit.mixer.uncacheRoot(unit.root);
        }
    });
    units.length = 0;

    // Dispose old materials to prevent texture/VRAM leaks on model change
    teamMatA?.dispose();
    teamMatB?.dispose();
    buffMatA?.dispose();
    buffMatB?.dispose();
    stunMat?.dispose();

    // Bersihkan billboard nama via helper
    initNameBars(modelName);

    const classModels = getModelsForMatchup(modelName);
    logDiag(
        `Memuat model...\n🛡️ Tank: ${classModels.tank}\n🏹 Archer: ${classModels.archer}\n🧙 Mage: ${classModels.mage}`,
    );

    const loadGLB = (name: string): Promise<any> => {
        return new Promise((resolve, reject) => {
            gltfLoader.load(
                `/models/npc/${name}.glb`,
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
    ])
        .then(([gltfTank, gltfArcher, gltfMage]) => {
            logDiag("Model berhasil dimuat. Menginisialisasi visual...");

            let originalMat: THREE.MeshStandardMaterial | null = null;
            gltfTank.scene.traverse((child: any) => {
                if (!originalMat && child.isMesh) {
                    originalMat = child.material as THREE.MeshStandardMaterial;
                }
            });

            // Material sharing — kloning dari originalMat agar menjaga properti skinning/animasi tulang tetap aktif
            teamMatA = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial({ color: 0xff3333 });
            teamMatB = originalMat
                ? (originalMat as any).clone()
                : new THREE.MeshStandardMaterial({ color: 0x3366ff });
            teamMatA!.color.setHex(0xff3333);
            teamMatB!.color.setHex(0x3366ff);

            // Buat material efek dengan mengkloning material asli agar deformasi tulang tidak rusak/hilang
            buffMatA = originalMat ? (originalMat as any).clone() : new THREE.MeshStandardMaterial();
            buffMatB = originalMat ? (originalMat as any).clone() : new THREE.MeshStandardMaterial();
            stunMat = originalMat ? (originalMat as any).clone() : new THREE.MeshStandardMaterial();

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
                    const uType = sharedData
                        ? sharedData[i * STRIDE + IDX_TYPE]
                        : (i % 100) % 3;

                    let targetGLTF = gltfTank;
                    if (uType === 1) targetGLTF = gltfArcher;
                    else if (uType === 2) targetGLTF = gltfMage;

                    const clonedScene = SkeletonUtils.clone(
                        targetGLTF.scene,
                    ) as THREE.Group;
                    clonedScene.scale.setScalar(0.6);

                    const meshes: THREE.Mesh[] = [];
                    clonedScene.traverse((child: any) => {
                        if (child.isMesh) {
                            const mesh = child as THREE.Mesh;
                            mesh.material =
                                team === TEAM_A ? teamMatA! : teamMatB!;
                            meshes.push(mesh);
                        }
                    });

                    scene.add(clonedScene);

                    const mixer = new THREE.AnimationMixer(clonedScene);
                    const clips =
                        targetGLTF.animations as THREE.AnimationClip[];

                    const idleClip =
                        clips.find((c) => c.name.toLowerCase() === "idle") ||
                        clips[0];
                    const runClip =
                        clips.find((c) => c.name.toLowerCase() === "run") ||
                        clips.find((c) =>
                            c.name.toLowerCase().includes("walk"),
                        ) ||
                        clips[0];
                    const attackClip =
                        clips.find((c) => c.name.toLowerCase() === "punch") ||
                        clips.find(
                            (c) => c.name.toLowerCase() === "swordslash",
                        ) ||
                        clips.find((c) =>
                            c.name.toLowerCase().includes("attack"),
                        ) ||
                        clips.find((c) =>
                            c.name.toLowerCase().includes("slash"),
                        ) ||
                        clips[0];
                    const deathClip =
                        clips.find((c) => c.name.toLowerCase() === "death") ||
                        clips.find((c) =>
                            c.name.toLowerCase().includes("death"),
                        ) ||
                        clips[0];

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
                        actions.idle.time = Math.random() * idleClip.duration;
                    }

                    units.push({
                        root: clonedScene,
                        mixer,
                        actions,
                        currentAnimState: 0,
                        currentEffectState: 0,
                        meshes,
                        team,
                    });
                }

                modelLoaded = true;
                logDiag(`Sukses menginisialisasi ${UNIT_COUNT} unit!`);
                if (onLoadComplete) onLoadComplete();
            } catch (err: any) {
                logDiag(`Error kloning/inisialisasi: ${err.message}`, true);
                if (onError) onError();
            }
        })
        .catch((err) => {
            logDiag(
                `Gagal mengunduh file model: ${err.message || err.toString()}`,
                true,
            );
            if (onError) onError();
        });
}

let sharedData: Float32Array | null = null;
export function setSharedData(data: Float32Array) {
    sharedData = data;
}

export function spawnSkillFX(event: { skill: string; [key: string]: any }) {
    if (!canSpawnFX()) return; // ponytail: early return if effects budget is exhausted
    if (event.skill === "arrowVolley") {
        const groundY = getTerrainHeight(event.x, event.z);
        spawnArrowVolleyFX(scene, event.x, event.z, groundY, 3.5, event.team);
    } else if (event.skill === "chainLightning") {
        const pos: THREE.Vector3[] = [];
        const arr: number[] = event.positions;
        for (let i = 0; i + 2 < arr.length; i += 3) {
            pos.push(new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]));
        }
        spawnLightningFX(scene, pos, event.team);
    } else if (event.skill === "ironFortitude") {
        spawnIronFortitudeAuraFX(scene, event.x, event.y, event.z, event.team);
    } else if (event.skill === "taunt") {
        spawnTauntFX(
            scene,
            event.x,
            event.y,
            event.z,
            event.tx,
            event.ty,
            event.tz,
            event.team,
        );
    } else if (event.skill === "shieldBash") {
        spawnShieldBashFX(
            scene,
            event.x,
            event.y,
            event.z,
            event.tx,
            event.ty,
            event.tz,
            event.team,
        );
    } else if (event.skill === "doubleShot") {
        spawnDoubleShotFX(
            scene,
            event.fx,
            event.fy,
            event.fz,
            event.tx,
            event.ty,
            event.tz,
        );
    } else if (event.skill === "evasiveLeap") {
        const fy = event.fy !== undefined ? event.fy : getTerrainHeight(event.fx, event.fz);
        const ty = event.ty !== undefined ? event.ty : getTerrainHeight(event.tx, event.tz);
        spawnEvasiveLeapFX(scene, event.fx, fy, event.fz, event.tx, ty, event.tz);
    } else if (event.skill === "fireball") {
        spawnFireballFX(
            scene,
            event.fx,
            event.fy,
            event.fz,
            event.tx,
            event.ty,
            event.tz,
        );
    } else if (event.skill === "frostNova") {
        spawnFrostNovaBurstFX(scene, event.x, event.y, event.z);
    } else if (event.skill === "basicAttack") {
        spawnBasicAttackFX(
            scene,
            event.uType,
            event.fx,
            event.fy,
            event.fz,
            event.tx,
            event.ty,
            event.tz,
        );
    }
}

let animId = 0;

// ponytail: Pre-allocate per-frame vectors — avoid 1000 new THREE.Vector3 per frame
const _right      = new THREE.Vector3();
const _forward    = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _q1         = new THREE.Quaternion();
let   _hpThrottle = 0; // HP bar update every 2nd frame

// Lerp speed: nilai 1.0 = langsung snap, 0.1 = smooth.  ~12 = responsive tapi tanpa jitter.
const LERP_SPEED = 12;

// Frustum culling — 1 frustum dihitung per frame, dipakai 200x
const _frustum   = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _unitSphere = new THREE.Sphere(new THREE.Vector3(), 1.5); // radius 1.5 = cukup untuk semua unit types

function updateFrame(data: Float32Array, delta: number) {
    if (!modelLoaded) return;

    // Compute billboard orientation ONCE per frame (not per unit)
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _forward.set(0, 0, 1).applyQuaternion(camera.quaternion);
    _hpThrottle = (_hpThrottle + 1) & 1; // toggle 0/1 each frame

    // Build frustum ONCE per frame from current camera matrices
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
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
        const maxHp = data[base + IDX_MAX_HP];
        const effect = data[base + IDX_EFFECT_STATE];

        const unit = units[i];
        if (!unit) continue;

        // ponytail: fast-skip units that haven't spawned yet
        if (hp === -999) {
            unit.root.position.set(x, -999, z);
            unit.root.scale.setScalar(0.0001);
            
            // ponytail: Reset all instanced matrices to hide them, otherwise they float at old positions when reset!
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
            continue;
        }

        let scale = 0.6;
        if (uType === 0) scale = 0.85;
        else if (uType === 1) scale = 0.42;
        else if (uType === 2) scale = 0.6;

        if (hp < -10) {
            unit.root.position.set(x, -999, z);
            unit.root.scale.setScalar(0.0001);
            unit.root.visible = false;
        } else {
            // Cek frustum berdasarkan koordinat target simulasi (x, y, z) yang selalu up-to-date
            _unitSphere.center.set(x, y, z);
            const inView = _frustum.intersectsSphere(_unitSphere);
            unit.root.visible = inView;

            if (hp <= 0 && unit.deathTime) {
                const elapsed = performance.now() - unit.deathTime;
                if (elapsed > 2000) {
                    unit.root.position.set(x, -999, z);
                    unit.root.scale.setScalar(0.0001);
                    unit.root.visible = false;
                } else if (elapsed > 1000) {
                    const t = (elapsed - 1000) / 1000;
                    if (inView) {
                        unit.root.position.x += (x - unit.root.position.x) * Math.min(1, LERP_SPEED * delta);
                        unit.root.position.z += (z - unit.root.position.z) * Math.min(1, LERP_SPEED * delta);
                    } else {
                        unit.root.position.x = x;
                        unit.root.position.z = z;
                    }
                    unit.root.position.y = y - t * 1.5;
                    unit.root.scale.setScalar(scale * (1.0 - t));
                } else {
                    if (inView) {
                        unit.root.position.x += (x - unit.root.position.x) * Math.min(1, LERP_SPEED * delta);
                        unit.root.position.y += (y - unit.root.position.y) * Math.min(1, LERP_SPEED * delta);
                        unit.root.position.z += (z - unit.root.position.z) * Math.min(1, LERP_SPEED * delta);
                    } else {
                        unit.root.position.set(x, y, z);
                    }
                    unit.root.scale.setScalar(scale);
                }
            } else {
                if (inView) {
                    // Hanya lakukan perhitungan smooth lerp posisi jika unit terlihat di layar
                    unit.root.position.x += (x - unit.root.position.x) * Math.min(1, LERP_SPEED * delta);
                    unit.root.position.y += (y - unit.root.position.y) * Math.min(1, LERP_SPEED * delta);
                    unit.root.position.z += (z - unit.root.position.z) * Math.min(1, LERP_SPEED * delta);
                } else {
                    // Jika di luar layar, langsung snap posisi di background agar saat kamera menoleh unit langsung di tempatnya
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
                }
            }
            if ((unit as any).iceMesh) {
                const ice = (unit as any).iceMesh;
                unit.root.remove(ice);
                ice.geometry.dispose();
                (ice.material as THREE.Material).dispose();
                (unit as any).iceMesh = null;
                spawnIceShatterFX(
                    scene,
                    unit.root.position.x,
                    unit.root.position.y + 0.5,
                    unit.root.position.z
                );
            }
        } else {
            if (unit.currentEffectState !== effect) {
                let activeMat = unit.team === TEAM_A ? teamMatA : teamMatB;
                if (effect > 0) {
                    activeMat = stunMat;
                    if (!(unit as any).iceMesh) {
                        const iceGeo = new THREE.DodecahedronGeometry(0.65);
                        const iceMat = new THREE.MeshStandardMaterial({
                            color: 0x88e2ff,
                            roughness: 0.05,
                            metalness: 0.2,
                            transparent: true,
                            opacity: 0.55,
                            depthWrite: false,
                        });
                        const ice = new THREE.Mesh(iceGeo, iceMat);
                        ice.position.set(0, 0.5, 0);
                        unit.root.add(ice);
                        (unit as any).iceMesh = ice;
                    }
                } else {
                    if ((unit as any).iceMesh) {
                        const ice = (unit as any).iceMesh;
                        unit.root.remove(ice);
                        ice.geometry.dispose();
                        (ice.material as THREE.Material).dispose();
                        (unit as any).iceMesh = null;
                        spawnIceShatterFX(
                            scene,
                            unit.root.position.x,
                            unit.root.position.y + 0.5,
                            unit.root.position.z
                        );
                    }
                }
                if (effect < 0) {
                    activeMat = unit.team === TEAM_A ? buffMatA : buffMatB;
                }
                if (activeMat) {
                    for (let m = 0; m < unit.meshes.length; m++) {
                        unit.meshes[m].material = activeMat;
                    }
                }
                unit.currentEffectState = effect;
            }

            if (targetIdx !== -1) {
                const tBase = targetIdx * STRIDE;
                const tx = data[tBase + IDX_X];
                const tz = data[tBase + IDX_Z];
                // ponytail: slerp rotasi — tidak perlu lookAt setiap frame, eliminasi rotation jitter
                _lookTarget.set(tx, y, tz);
                _q1.copy(unit.root.quaternion);
                unit.root.lookAt(_lookTarget);
                unit.root.quaternion.slerp(_q1, 1 - Math.min(1, 10 * delta)); // 10 = kecepatan rotate
            }

            if (unit.currentAnimState !== state) {
                if (state === 0) fadeToAnimation(unit, "idle");
                else if (state === 1) fadeToAnimation(unit, "run");
                else if (state === 2) fadeToAnimation(unit, "attack");
                unit.currentAnimState = state;
            }
        }

        // Update mixer jika unit hidup ATAU sedang memainkan animasi mati (elapsed < 2000ms)
        const isDying = hp <= 0 && hp >= -10 && unit.deathTime && (performance.now() - unit.deathTime < 2000);
        if (isDying) {
            unit.mixer.update(delta);
        } else if (hp > 0) {
            // Update mixer berselang-seling ganjil/genap untuk memangkas CPU skinning overhead ~50%
            // Hanya update jika unit sedang terlihat oleh kamera (unit.root.visible === true)
            if (unit.root.visible && ((i + _hpThrottle) & 1) === 0) {
                if (effect <= 0) {
                    unit.mixer.update(delta * 2);
                }
            }
        }

        // Cooldown Ring (hanya pasang jika unit hidup & terlihat)
        const cd1 = data[base + IDX_SKILL1_CD];
        const cd2 = data[base + IDX_SKILL2_CD];
        const cd3 = data[base + IDX_SKILL3_CD];
        const immuneCd = data[base + IDX_IMMUNE_CD];

        if (hp > 0 && unit.root.visible && (cd1 > 0 || cd2 > 0 || cd3 > 0)) {
            dummy.position.set(x, y + 0.02, z);
            dummy.rotation.set(-Math.PI / 2, 0, 0);
            dummy.scale.set(scale * 1.5, scale * 1.5, 1.0);
            dummy.updateMatrix();
            cdRings.setMatrixAt(i, dummy.matrix);
        } else {
            cdRings.setMatrixAt(i, _deadMatrix);
        }

        // Immunity Ring (hanya pasang jika unit hidup & terlihat)
        if (hp > 0 && unit.root.visible && immuneCd > 0) {
            const angle = performance.now() * 0.003;
            dummy.position.set(x, y + 0.5, z);
            dummy.rotation.set(-Math.PI / 2, 0, angle);
            dummy.scale.set(scale * 2.0, scale * 2.0, 1.0);
            dummy.updateMatrix();
            immuneRings.setMatrixAt(i, dummy.matrix);
        } else {
            immuneRings.setMatrixAt(i, _deadMatrix);
        }

        let headY = 1.85; // Raised from 1.35
        if (uType === 0) headY = 2.45; // Raised from 1.95 (Tank)
        else if (uType === 1) headY = 1.6; // Raised from 1.1 (Archer)
        else if (uType === 2) headY = 1.95; // Raised from 1.45 (Mage)

        // ponytail: use pre-computed _right / _forward (no new Vector3 per unit)
        if (hp <= 0 || !unit.root.visible) {
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
        } else {
            dummy.position.set(x, y + headY, z);
            dummy.quaternion.copy(camera.quaternion);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            hpBarsBg.setMatrixAt(i, dummy.matrix);

            const hpPercent = Math.max(0, hp / maxHp);
            dummy.position.set(x, y + headY, z);
            dummy.quaternion.copy(camera.quaternion);
            dummy.position.addScaledVector(_right, -0.5 * (1.0 - hpPercent));
            dummy.scale.set(hpPercent, 1, 1);
            dummy.updateMatrix();
            hpBarsFg.setMatrixAt(i, dummy.matrix);

            if (nameBarsA && nameBarsB) {
                dummy.position.set(x, y + headY + 0.22, z); // Raised name offset to 0.22
                dummy.scale.set(1.0, 1.0, 1.0);
                dummy.quaternion.copy(camera.quaternion);
                dummy.position.addScaledVector(_forward, 0.03);
                dummy.updateMatrix();

                if (i < TEAM_SIZE) {
                    nameBarsA.setMatrixAt(i, dummy.matrix);
                } else {
                    nameBarsB.setMatrixAt(i - TEAM_SIZE, dummy.matrix);
                }
            }
        }
    }

    hpBarsBg.instanceMatrix.needsUpdate = true;
    hpBarsFg.instanceMatrix.needsUpdate = true;
    cdRings.instanceMatrix.needsUpdate = true;
    immuneRings.instanceMatrix.needsUpdate = true;
    if (nameBarsA) nameBarsA.instanceMatrix.needsUpdate = true;
    if (nameBarsB) nameBarsB.instanceMatrix.needsUpdate = true;
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

const fpsVal = document.getElementById("fps-val");
const msVal = document.getElementById("ms-val");

const dcVal = document.getElementById("dc-val");
const triVal = document.getElementById("tri-val");
const geoVal = document.getElementById("geo-val");
const texVal = document.getElementById("tex-val");
const progVal = document.getElementById("prog-val");

let lastFpsUpdate = 0;
let frameCount = 0;

export function startRenderLoop() {
    const loop = (timestamp: number) => {
        animId = requestAnimationFrame(loop);
        controls.update();

        const delta = clock.getDelta();
        world.update(delta);
        effectUniforms.uTime.value += delta;

        updateFX(delta);
        windEffect.update(delta); // ponytail: gantikan gsap — delta math langsung di render loop

        frameCount++;
        if (timestamp > lastFpsUpdate + 1000) {
            if (fpsVal) {
                fpsVal.textContent = Math.round(
                    (frameCount * 1000) / (timestamp - lastFpsUpdate),
                ).toString();
            }
            if (dcVal)
                dcVal.textContent = renderer.info.render.calls.toString();
            if (triVal)
                triVal.textContent = renderer.info.render.triangles.toString();
            if (geoVal)
                geoVal.textContent = renderer.info.memory.geometries.toString();
            if (texVal)
                texVal.textContent = renderer.info.memory.textures.toString();
            if (progVal)
                progVal.textContent = renderer.info.programs
                    ? renderer.info.programs.length.toString()
                    : "0";

            frameCount = 0;
            lastFpsUpdate = timestamp;
        }
        if (msVal) {
            msVal.textContent = (delta * 1000).toFixed(1);
        }

        if (sharedData) updateFrame(sharedData, delta);
        renderer.render(scene, camera);
    };
    animId = requestAnimationFrame(loop);
}

export function stopRenderLoop() {
    if (animId) cancelAnimationFrame(animId);
}

export function resetUnitsVisual() {
    units.forEach((unit) => {
        unit.currentAnimState = 0;
        unit.currentEffectState = 0;
        unit.deathTime = undefined;
        if ((unit as any).iceMesh) {
            const ice = (unit as any).iceMesh;
            unit.root.remove(ice);
            ice.geometry.dispose();
            (ice.material as THREE.Material).dispose();
            (unit as any).iceMesh = null;
        }
        if (unit.mixer) {
            unit.mixer.stopAllAction();
        }
        if (unit.actions.idle) {
            unit.actions.idle.play();
        }
    });
}

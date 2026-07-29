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
    // IDX_MAX_HP,
    IDX_EFFECT_STATE,
    // IDX_SKILL1_CD,
    // IDX_SKILL2_CD,
    // IDX_SKILL3_CD,
    // IDX_IMMUNE_CD,
    getTerrainHeight,
} from "../../simulation/constants";

import type { UnitVisual } from "./types";
import { scene, camera, renderer, controls, gltfLoader } from "./scene";
import { isRunning } from "../../main";
import { soundFX } from "./SoundFX";
import { World } from "../scenery/World";
import {
    hpBarsBg,
    hpBarsFg,
    cdRings,
    immuneRings,
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
    spawnHealFX,
    spawnDivineShieldFX,
    spawnHolySanctuaryFX,
    updateFX,
    canSpawnFX,
    effectUniforms,
    activeFX,
} from "../effects/SkillFX";

// Global shared materials
let teamMatA: THREE.MeshStandardMaterial | null = null;
let teamMatB: THREE.MeshStandardMaterial | null = null;
let healerMatA: THREE.MeshStandardMaterial | null = null;
let healerMatB: THREE.MeshStandardMaterial | null = null;
let stunMat: THREE.MeshStandardMaterial | null = null;
let buffMatA: THREE.MeshStandardMaterial | null = null;
let buffMatB: THREE.MeshStandardMaterial | null = null;

// ponytail: one InstancedMesh for ice — 1 draw call instead of up to 200
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
_iceInstanced.count = 0; // start with 0 visible
scene.add(_iceInstanced);
const _iceMatrix = new THREE.Matrix4();
const _iceDead = new THREE.Matrix4().makeScale(0, 0, 0);

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
    healerMatA?.dispose();
    healerMatB?.dispose();
    buffMatA?.dispose();
    buffMatB?.dispose();
    stunMat?.dispose();
    // Reset ice instanced mesh
    for (let _k = 0; _k < UNIT_COUNT; _k++) _iceInstanced.setMatrixAt(_k, _iceDead);
    _iceInstanced.instanceMatrix.needsUpdate = true;

    // Bersihkan billboard nama via helper
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
        .then(([gltfTank, gltfArcher, gltfMage, animGeneral, animMovement, animCombat]) => {
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

            // Healer: white base + soft team emissive glow
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

            // Buat material efek dengan mengkloning material asli agar deformasi tulang tidak rusak/hilang
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
                    const healerCount = Math.max(1, Math.round(TEAM_SIZE * 0.02));
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
                    else if (uType === 2 || uType === 3) targetGLTF = gltfMage; // Healers share Mage visual model base

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
                        clips.find((c) => c.name === "Idle_A" || c.name.toLowerCase() === "idle") ||
                        clips[0];
                    const runClip =
                        clips.find((c) => c.name === "Running_A" || c.name.toLowerCase() === "run" || c.name.toLowerCase().includes("walk")) ||
                        clips[0];
                    const attackClip =
                        clips.find((c) => c.name === "Melee_1H_Attack_Chop" || c.name.toLowerCase() === "punch" || c.name.toLowerCase().includes("attack") || c.name.toLowerCase().includes("slash")) ||
                        clips[0];
                    const deathClip =
                        clips.find((c) => c.name === "Death_A" || c.name.toLowerCase() === "death") ||
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
        const sx = event.fx ?? event.x;
        const sy = event.fy ?? groundY;
        const sz = event.fz ?? event.z;
        soundFX.playArrowVolley(sx, sy, sz, camera.position);
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
        soundFX.playShieldBash(event.x, event.y, event.z, camera.position);
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
        soundFX.playBow(event.fx, event.fy, event.fz, camera.position);
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
        soundFX.playDash(event.fx, event.fy, event.fz, camera.position);
        const fy =
            event.fy !== undefined
                ? event.fy
                : getTerrainHeight(event.fx, event.fz);
        const ty =
            event.ty !== undefined
                ? event.ty
                : getTerrainHeight(event.tx, event.tz);
        spawnEvasiveLeapFX(
            scene,
            event.fx,
            fy,
            event.fz,
            event.tx,
            ty,
            event.tz,
        );
    } else if (event.skill === "fireball") {
        soundFX.playFireball(event.fx, event.fy, event.fz, camera.position);
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
    } else if (event.skill === "basicHeal") {
        soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
        spawnHealFX(
            scene,
            new THREE.Vector3(event.fx, event.fy, event.fz),
            new THREE.Vector3(event.tx, event.ty, event.tz),
            false,
        );
    } else if (event.skill === "rejuvenation") {
        soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
        spawnHealFX(
            scene,
            new THREE.Vector3(event.fx, event.fy, event.fz),
            new THREE.Vector3(event.tx, event.ty, event.tz),
            true,
        );
    } else if (event.skill === "divineShield") {
        soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
        spawnDivineShieldFX(
            scene,
            new THREE.Vector3(event.tx, event.ty, event.tz),
        );
    } else if (event.skill === "holySanctuary") {
        soundFX.playHeal(event.x, event.y, event.z, camera.position);
        spawnHolySanctuaryFX(
            scene,
            new THREE.Vector3(event.x, event.y, event.z),
        );
    }
}

let animId = 0;

// ponytail: Pre-allocate per-frame vectors — avoid 1000 new THREE.Vector3 per frame
const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
let _hpThrottle = 0; // HP bar update every 2nd frame
let animFrameCount = 0;

// ponytail: Pre-allocate matrix composition variables to avoid Object3D composition overhead (1200x per frame)
// const _billboardMatrix = new THREE.Matrix4();
// const _billboardPos = new THREE.Vector3();
// const _unitScale = new THREE.Vector3();
// const _ringPos = new THREE.Vector3();
// const _ringRot = new THREE.Euler();
// const _ringQuat = new THREE.Quaternion();
// const _ringScale = new THREE.Vector3();

// Lerp speed: nilai 1.0 = langsung snap, 0.1 = smooth.  ~12 = responsive tapi tanpa jitter.
const LERP_SPEED = 12;

// Frustum culling — 1 frustum dihitung per frame, dipakai 200x
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _unitSphere = new THREE.Sphere(new THREE.Vector3(), 1.5); // radius 1.5 = cukup untuk semua unit types
const _lastCameraMatrix = new THREE.Matrix4();

function updateFrame(data: Float32Array, delta: number) {
    if (!modelLoaded) return;

    const cameraMoved = !_lastCameraMatrix.equals(camera.matrixWorld);
    if (cameraMoved) {
        _lastCameraMatrix.copy(camera.matrixWorld);
    }
    // ponytail: Only upload matrices if simulation is running or camera is moving
    const needsMatrixUpload = isRunning || cameraMoved;

    // Compute billboard orientation ONCE per frame (not per unit)
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _forward.set(0, 0, 1).applyQuaternion(camera.quaternion);
    _hpThrottle = (_hpThrottle + 1) & 1; // toggle 0/1 each frame
    animFrameCount++;

    // Build frustum ONCE per frame from current camera matrices
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
        // const maxHp = data[base + IDX_MAX_HP];
        const effect = data[base + IDX_EFFECT_STATE];

        const unit = units[i];
        if (!unit) continue;

        // ponytail: fast-skip units that haven't spawned yet, only update position/scale once on transition to save CPU
        if (hp === -999) {
            unit.root.visible = false; // ponytail: hide completely to disable skeletal updates and rendering
            if (unit.root.position.y !== -999) {
                unit.root.position.set(x, -999, z);
                unit.root.scale.setScalar(0.0001);
                (unit as any)._wasAlive = false;

                // Reset all instanced matrices to hide them, otherwise they float at old positions when reset!
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
        else if (uType === 3) scale = 0.5; // Healer scale

        if (hp < -10) {
            unit.root.position.set(x, -999, z);
            unit.root.scale.setScalar(0.0001);
            unit.root.visible = false;
            (unit as any)._wasAlive = false;
        } else {
            // Cek frustum berdasarkan koordinat target simulasi (x, y, z) yang selalu up-to-date
            _unitSphere.center.set(x, y, z);
            const inView = _frustum.intersectsSphere(_unitSphere);
            unit.root.visible = inView;

            // LOD (Level of Detail): Sembunyikan mesh karakter jika sangat jauh (jarak > 45 unit)
            // untuk menghemat draw calls & perhitungan skinning CPU. HP bar & nama tetap terlihat.
            const dx = x - camera.position.x;
            const dy = y - camera.position.y;
            const dz = z - camera.position.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const showMesh = distSq < 2025; // 45^2 = 2025
            
            for (let m = 0; m < unit.meshes.length; m++) {
                unit.meshes[m].visible = showMesh;
            }

            // Spawn sound: unit transisi dari mati/unspawned ke hidup
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
                    // Hanya lakukan perhitungan smooth lerp posisi jika unit terlihat di layar
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
                    soundFX.playDeath(x, y, z, camera.position);
                }
            }
            // Hide ice for dead units via instanced mesh
            _iceInstanced.setMatrixAt(i, _iceDead);
            _iceInstanced.instanceMatrix.needsUpdate = true;
            // Spawn shatter FX when previously frozen
            if (unit.currentEffectState > 0) {
                spawnIceShatterFX(
                    scene,
                    unit.root.position.x,
                    unit.root.position.y + 0.5,
                    unit.root.position.z,
                );
                unit.currentEffectState = 0; // ponytail: reset effect state so shatter FX only spawns ONCE
            }
        } else {
            if (unit.currentEffectState !== effect) {
                let activeMat = unit.team === TEAM_A ? teamMatA : teamMatB;
                if (uType === 3) activeMat = unit.team === TEAM_A ? healerMatA : healerMatB;
                if (effect > 0) {
                    activeMat = stunMat;
                    // Show ice on instanced mesh
                    _iceMatrix.makeTranslation(x, y + 0.5, z);
                    _iceInstanced.setMatrixAt(i, _iceMatrix);
                    _iceInstanced.instanceMatrix.needsUpdate = true;
                } else {
                    // Hide ice — use dead matrix
                    _iceInstanced.setMatrixAt(i, _iceDead);
                    _iceInstanced.instanceMatrix.needsUpdate = true;
                    if (effect < 0) activeMat = unit.team === TEAM_A ? buffMatA : buffMatB;
                }
                if (activeMat) {
                    for (let m = 0; m < unit.meshes.length; m++) {
                        unit.meshes[m].material = activeMat;
                    }
                }
                unit.currentEffectState = effect;
            } else if (effect > 0) {
                // Keep ice position in sync while frozen
                _iceMatrix.makeTranslation(x, y + 0.5, z);
                _iceInstanced.setMatrixAt(i, _iceMatrix);
                _iceInstanced.instanceMatrix.needsUpdate = true;
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

        // Accumulate delta time for correct animation speed when throttled
        unit.accumulatedDelta += delta;

        // Update mixer jika unit hidup ATAU sedang memainkan animasi mati (elapsed < 2000ms)
        const isDying =
            hp <= 0 &&
            hp >= -10 &&
            unit.deathTime &&
            performance.now() - unit.deathTime < 2000;
        if (isDying) {
            unit.mixer.update(unit.accumulatedDelta);
            unit.accumulatedDelta = 0;
        } else if (hp > 0) {
            let updateInterval = 1;
            if (!unit.root.visible) {
                updateInterval = 16; // off-screen: update every 16 frames
            } else {
                const dx = x - camera.position.x;
                const dy = y - camera.position.y;
                const dz = z - camera.position.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < 225) {
                    updateInterval = 2; // Near: update every 2 frames
                } else if (distSq < 900) {
                    updateInterval = 4; // Mid-near: update every 4 frames
                } else if (distSq < 2025) {
                    updateInterval = 8; // Mid-far: update every 8 frames
                } else {
                    updateInterval = 16; // Far: update every 16 frames
                }
            }

            if ((animFrameCount + i) % updateInterval === 0) {
                if (effect <= 0) {
                    unit.mixer.update(unit.accumulatedDelta);
                }
                unit.accumulatedDelta = 0;
            }
        }

        // Cooldown Ring, Immunity Ring, HP Bars, Name Bars are temporarily disabled to debug performance
        cdRings.setMatrixAt(i, _deadMatrix);
        immuneRings.setMatrixAt(i, _deadMatrix);
        hpBarsBg.setMatrixAt(i, _deadMatrix);
        hpBarsFg.setMatrixAt(i, _deadMatrix);
        if (nameBarsA && nameBarsB) {
            if (i < TEAM_SIZE) {
                nameBarsA.setMatrixAt(i, _deadMatrix);
            } else {
                nameBarsB.setMatrixAt(i - TEAM_SIZE, _deadMatrix);
            }
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
            let totalMeshes = 0;
            let totalGroups = 0;
            let totalInstanced = 0;
            const meshTypes = new Map<string, number>();

            scene.traverse((obj: any) => {
                if (obj instanceof THREE.InstancedMesh) {
                    totalInstanced++;
                    const name = "InstancedMesh (" + (obj.name || "unnamed") + ")";
                    meshTypes.set(name, (meshTypes.get(name) || 0) + 1);
                } else if (obj.isMesh) {
                    totalMeshes++;
                    let name = "Mesh (" + (obj.name || "unnamed") + ")";
                    if (!obj.name) {
                        const geomType = obj.geometry ? obj.geometry.constructor.name : "no-geo";
                        const matMap = (obj.material && obj.material.map) ? "has-texture" : "no-texture";
                        name = `Mesh (unnamed: ${geomType}, ${matMap})`;
                    }
                    meshTypes.set(name, (meshTypes.get(name) || 0) + 1);
                } else if (obj.isGroup) {
                    totalGroups++;
                }
            });

            let diagMsg = `Meshes: ${totalMeshes}, Groups: ${totalGroups}, Instanced: ${totalInstanced}, activeFX: ${activeFX.length}\n`;
            meshTypes.forEach((count, name) => {
                diagMsg += `  - ${name}: ${count}\n`;
            });
            logDiag(diagMsg);

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
    units.forEach((unit, i) => {
        unit.currentAnimState = 0;
        unit.currentEffectState = 0;
        unit.accumulatedDelta = 0;
        unit.deathTime = undefined;
        // Reset ice instanced mesh position for this unit
        _iceInstanced.setMatrixAt(i, _iceDead);
        // Restore default team materials to prevent units staying white/buffed on reset
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

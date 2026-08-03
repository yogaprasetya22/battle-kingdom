/**
 * SkillFX.ts — Skill effect spawn functions.
 * Infrastructure (pools, textures, easing, updateFX) lives in FXCore.ts.
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import { soundFX } from "../core/SoundFX";

import {
    easeOutCubic,
    easeOutQuad,
    easeOutBack,
    pooledPlane,
    pooledRing,
    pooledCylinder,
    starTex,
    circleTex,
    sparkTex,
    smokeTex,
    fireTex,
    flameTex,
    scorchTex,
    lightTex,
    magicTex,
    star2Tex,
    effectUniforms,
    getPooledMaterial,
    releasePooledMaterial,
    createIronFortitudeMat,
    createFrostNovaMat,
    activeFX,
    updateFX,
    canSpawnFX,
    fxQualityScale,
    getCamQuad,
    _tempObj,
    spawnScreenFlash,
    spawnExplosion,
} from "./FXCore";

// Pre-rendered taunt emoji — one canvas, recycled
let _tauntTex: THREE.CanvasTexture | null = null;
function getTauntTex(): THREE.CanvasTexture {
    if (_tauntTex) return _tauntTex;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 96px Inter, sans-serif";
    ctx.fillText("💢", 64, 64);
    _tauntTex = new THREE.CanvasTexture(canvas);
    _tauntTex.minFilter = THREE.LinearFilter;
    _tauntTex.magFilter = THREE.LinearFilter;
    return _tauntTex;
}

// Re-export shared infrastructure for external consumers
export {
    effectUniforms,
    activeFX,
    updateFX,
    canSpawnFX,
    fxQualityScale,
    createIronFortitudeMat,
    createFrostNovaMat,
};

// ═══════════════════════════════════════════════════════════════
// 2. Chain Lightning — zigzag with intense flicker + hit sparks
// ═══════════════════════════════════════════════════════════════
export function spawnLightningFX(
    scene: THREE.Scene,
    points: THREE.Vector3[],
    team?: number,
): void {
    if (points.length < 2) return;
    soundFX.playLightning(
        points[0].x,
        points[0].y,
        points[0].z,
        camera.position,
    );
    const SEGMENTS = 8; // 8 segments per hop

    const isBlue = team === 1;
    const colorLightning = isBlue ? 0x88ddff : 0xffa055;
    const colorSpark = isBlue ? 0x00aaff : 0xff6600;

    const meshes: THREE.Mesh[] = [];
    const mat = new THREE.MeshBasicMaterial({
        color: colorLightning,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const cylinderGeoPool: THREE.CylinderGeometry[] = [];

    for (let pi = 0; pi < points.length - 1; pi++) {
        const from = points[pi].clone();
        from.y += 1.0;
        const to = points[pi + 1].clone();
        to.y += 1.0;

        let lastPt = from.clone();
        for (let s = 1; s <= SEGMENTS; s++) {
            const t = s / SEGMENTS;
            const lx = from.x + (to.x - from.x) * t;
            const ly = from.y + (to.y - from.y) * t;
            const lz = from.z + (to.z - from.z) * t;
            const jx = s === SEGMENTS ? 0 : (Math.random() - 0.5) * 0.7;
            const jy = s === SEGMENTS ? 0 : (Math.random() - 0.5) * 0.5;
            const jz = s === SEGMENTS ? 0 : (Math.random() - 0.5) * 0.7;
            const nextPt = new THREE.Vector3(lx + jx, ly + jy, lz + jz);

            // Create segment cylinder — use pooled geometry with Y-scale for variable distance
            const dist = lastPt.distanceTo(nextPt);
            const geo = pooledCylinder(0.06, 0.06, 1.0, 4); // fixed height=1, scale Y by dist
            cylinderGeoPool.push(geo);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
            mesh.scale.set(1, dist, 1);
            // Position at midpoint
            const mid = new THREE.Vector3()
                .copy(lastPt)
                .add(nextPt)
                .multiplyScalar(0.5);
            mesh.position.copy(mid);
            mesh.lookAt(nextPt);
            mesh.rotateX(Math.PI / 2);
            scene.add(mesh);
            meshes.push(mesh);

            lastPt.copy(nextPt);
        }
        // Impact spark explosion
        spawnExplosion(scene, to, colorSpark, 10, 0.1);
    }

    let age = 0;
    const duration = 0.25; // lightning is very fast

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                meshes.forEach((m) => scene.remove(m));
                mat.dispose();
                return false;
            }

            // Flicker effect: random opacity drops
            const flicker = Math.random() > 0.35 ? 1.0 : 0.15;
            mat.opacity = 0.95 * (1 - t) * flicker;

            // Jitter scale slightly to simulate high voltage vibration
            const jitterS = 0.85 + Math.random() * 0.3;
            meshes.forEach((m) => {
                const baseY = m.scale.y; // preserve Y-scale (distance)
                m.scale.set(jitterS, baseY, jitterS); // jitter X/Z thickness only, keep Y
            });

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 3. Arrow Volley — dense star rain + ground runes + light pillar
// ═══════════════════════════════════════════════════════════════
export function spawnArrowVolleyFX(
    scene: THREE.Scene,
    centerX: number,
    centerZ: number,
    groundY: number,
    radius: number = 4.0,
    team?: number,
): void {
    const isBlue = team === 1;
    const colorCircle = isBlue ? 0x00aaff : 0xff4433;
    const colorRune = isBlue ? 0x88ccff : 0xffaa44;
    const colorStar = isBlue ? 0x99ddff : 0xffdd66;

    // Ground rune circle
    const ringGeo = new THREE.PlaneGeometry(radius * 2.4, radius * 2.4);
    const ringMat = new THREE.MeshBasicMaterial({
        map: circleTex,
        color: colorCircle,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(centerX, groundY + 0.03, centerZ);
    scene.add(ring);

    // Rotating inner rune
    const innerGeo = new THREE.PlaneGeometry(radius * 1.6, radius * 1.6);
    const innerMat = new THREE.MeshBasicMaterial({
        map: magicTex,
        color: colorRune,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(centerX, groundY + 0.04, centerZ);
    scene.add(inner);

    // Falling arrows — instanced, use pooled geometry (60 arrows per volley)
    const COUNT = 60;
    const arrowGeo = pooledCylinder(0.01, 0.035, 1.0, 4);

    const arrowMat = new THREE.MeshBasicMaterial({
        color: colorStar,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, COUNT);
    arrows.frustumCulled = false;
    scene.add(arrows);

    // Arrow impact rings — instanced, use pooled geometry
    const impactRingGeo = pooledPlane(1.2, 1.2);
    const impactRingMat = new THREE.MeshBasicMaterial({
        map: starTex,
        color: colorStar,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const impacts = new THREE.InstancedMesh(
        impactRingGeo,
        impactRingMat,
        COUNT,
    );
    impacts.frustumCulled = false;
    scene.add(impacts);

    const data: {
        ax: number;
        az: number;
        startY: number;
        speed: number;
        hitTime: number;
    }[] = [];

    for (let k = 0; k < COUNT; k++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        const targetX = centerX + Math.cos(angle) * r;
        const targetZ = centerZ + Math.sin(angle) * r;
        const startY = groundY + 9 + Math.random() * 6;
        const speed = 0.015 + Math.random() * 0.01; // units per ms
        const height = startY - groundY;
        const hitTime = height / speed;

        data.push({
            ax: targetX,
            az: targetZ,
            startY,
            speed,
            hitTime,
        });
    }

    const DURATION = 1.8;
    const startTime = performance.now();

    activeFX.push({
        update(_delta) {
            const elapsed = performance.now() - startTime;
            if (elapsed > DURATION * 1000) {
                scene.remove(arrows);
                scene.remove(impacts);
                scene.remove(ring);
                scene.remove(inner);

                ringGeo.dispose();
                ringMat.dispose();
                innerGeo.dispose();
                innerMat.dispose();
                arrowMat.dispose();
                impactRingMat.dispose();
                return false;
            }

            const t = elapsed / (DURATION * 1000);
            const et = easeOutCubic(t);

            ring.rotation.z += 0.02;
            ringMat.opacity = 0.95 * (1 - et);
            inner.rotation.z -= 0.025;
            innerMat.opacity = 0.7 * (1 - et);

            for (let k = 0; k < COUNT; k++) {
                const d = data[k];

                if (elapsed < d.hitTime) {
                    // Falling phase: move straight down
                    const distY = d.speed * elapsed;
                    const ax = d.ax;
                    const ay = d.startY - distY;
                    const az = d.az;

                    _tempObj.position.set(ax, ay, az);
                    _tempObj.scale.set(1, 1, 1);
                    _tempObj.rotation.set(0, 0, 0);
                    _tempObj.updateMatrix();
                    arrows.setMatrixAt(k, _tempObj.matrix);

                    // Impact is inactive
                    _tempObj.scale.setScalar(0);
                    _tempObj.updateMatrix();
                    impacts.setMatrixAt(k, _tempObj.matrix);
                } else {
                    // Arrow has hit the ground, arrow is hidden
                    _tempObj.scale.setScalar(0);
                    _tempObj.updateMatrix();
                    arrows.setMatrixAt(k, _tempObj.matrix);

                    // Animate impact ring
                    const tHit = elapsed - d.hitTime;
                    const impactDuration = 300; // ms
                    if (tHit < impactDuration) {
                        const hitT = tHit / impactDuration;
                        _tempObj.position.set(d.ax, groundY + 0.02, d.az);
                        _tempObj.rotation.set(-Math.PI / 2, 0, 0);
                        const scaleFactor = hitT * 1.5;
                        _tempObj.scale.set(scaleFactor, scaleFactor, 1);
                        _tempObj.updateMatrix();
                        impacts.setMatrixAt(k, _tempObj.matrix);
                    } else {
                        // Impact has finished, hide
                        _tempObj.scale.setScalar(0);
                        _tempObj.updateMatrix();
                        impacts.setMatrixAt(k, _tempObj.matrix);
                    }
                }
            }

            arrows.instanceMatrix.needsUpdate = true;
            impacts.instanceMatrix.needsUpdate = true;
            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 4. Meteor Explosion — scorch, shockwave, smoke, embers, screen flash
// ═══════════════════════════════════════════════════════════════
function spawnMeteorExplosion(scene: THREE.Scene, pos: THREE.Vector3) {
    // Scorch mark
    const scorchGeo = new THREE.PlaneGeometry(3.2, 3.2);
    const scorchMat = new THREE.MeshBasicMaterial({
        map: scorchTex,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(pos.x, pos.y + 0.02, pos.z);
    scene.add(scorch);

    // Flash
    const flash = spawnScreenFlash(
        scene,
        pos.clone().setY(pos.y + 0.6),
        0xffffff,
        4.0,
    );

    // Shockwave
    const ringGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
        map: circleTex,
        color: 0xff6600,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.05, pos.z);
    scene.add(ring);

    // Second shockwave (delayed, larger)
    const ring2Geo = new THREE.PlaneGeometry(0.3, 0.3);
    const ring2Mat = new THREE.MeshBasicMaterial({
        map: circleTex,
        color: 0xff3300,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(pos.x, pos.y + 0.07, pos.z);
    scene.add(ring2);

    // Smoke
    const smokeGeo = pooledPlane(1.2, 1.2);
    const smokeMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        color: 0x443322,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
    });
    const SMOKE = Math.round(12 * fxQualityScale());
    const smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE);
    smokeMesh.frustumCulled = false;
    scene.add(smokeMesh);

    const smokePositions: THREE.Vector3[] = [];
    const smokeVels: THREE.Vector3[] = [];
    const smokeScales: number[] = [];
    for (let i = 0; i < SMOKE; i++) {
        smokePositions.push(
            new THREE.Vector3(
                pos.x + (Math.random() - 0.5) * 1.0,
                pos.y + 0.3,
                pos.z + (Math.random() - 0.5) * 1.0,
            ),
        );
        smokeVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                1.0 + Math.random() * 1.0,
                (Math.random() - 0.5) * 0.5,
            ),
        );
        smokeScales.push(0.3 + Math.random() * 0.5);
    }

    // Embers
    const sparkGeo = pooledPlane(0.6, 0.6);
    const sparkMat = new THREE.MeshBasicMaterial({
        map: sparkTex,
        color: 0xffaa00,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const EMBER = Math.round(35 * fxQualityScale());
    const emberMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, EMBER);
    emberMesh.frustumCulled = false;
    scene.add(emberMesh);

    const emberPositions: THREE.Vector3[] = [];
    const emberVels: THREE.Vector3[] = [];
    const emberRotations: number[] = [];
    const emberScales: number[] = [];
    for (let i = 0; i < EMBER; i++) {
        emberPositions.push(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z));
        emberRotations.push(Math.random() * Math.PI * 2);
        emberScales.push(0.6 + Math.random() * 0.8);
        const a = Math.random() * Math.PI * 2;
        const s = 2.5 + Math.random() * 5;
        emberVels.push(
            new THREE.Vector3(
                Math.cos(a) * s,
                1.5 + Math.random() * 5,
                Math.sin(a) * s,
            ),
        );
    }

    let age = 0;
    const duration = 0.8;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(scorch);
                scene.remove(flash);
                scene.remove(ring);
                scene.remove(ring2);
                scene.remove(smokeMesh);
                scene.remove(emberMesh);

                smokeMesh.dispose();
                emberMesh.dispose();
                smokeMat.dispose();
                sparkMat.dispose();
                scorchGeo.dispose();
                scorchMat.dispose();
                (flash.material as THREE.MeshBasicMaterial).dispose();
                flash.geometry.dispose();
                ringGeo.dispose();
                ringMat.dispose();
                ring2Geo.dispose();
                ring2Mat.dispose();
                return false;
            }
            const et = easeOutCubic(t);
            scorchMat.opacity = 1 - et;

            const ft = Math.min(1, age / 0.12);
            flash.scale.setScalar(1 + ft * 2);
            (flash.material as THREE.MeshBasicMaterial).opacity = 1 - ft;

            const rs = 1 + t * 14;
            ring.scale.set(rs, rs, 1);
            ring.rotation.z += 0.03;
            ringMat.opacity = 1 - t;

            const rs2 = 1 + Math.max(0, t - 0.15) * 10;
            ring2.scale.set(rs2, rs2, 1);
            ring2.rotation.z -= 0.02;
            ring2Mat.opacity = Math.max(0, 1 - (t - 0.1) / 0.9);

            const cq = camera.quaternion;

            // Update smoke
            for (let i = 0; i < SMOKE; i++) {
                smokePositions[i].addScaledVector(smokeVels[i], delta);
                smokeScales[i] += delta * 2;

                _tempObj.position.copy(smokePositions[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(smokeScales[i]);
                _tempObj.updateMatrix();
                smokeMesh.setMatrixAt(i, _tempObj.matrix);
            }
            smokeMesh.instanceMatrix.needsUpdate = true;
            smokeMat.opacity = 0.6 * (1 - et);

            // Update embers
            for (let i = 0; i < EMBER; i++) {
                emberPositions[i].addScaledVector(emberVels[i], delta);
                emberVels[i].y -= 9.8 * delta;

                _tempObj.position.copy(emberPositions[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar((1 - et) * emberScales[i]);
                _tempObj.rotateZ(emberRotations[i]);
                _tempObj.updateMatrix();
                emberMesh.setMatrixAt(i, _tempObj.matrix);
            }
            emberMesh.instanceMatrix.needsUpdate = true;
            sparkMat.opacity = 1 - et;

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 5. Fireball — projectile with dual trail + explosion
// ═══════════════════════════════════════════════════════════════
export function spawnFireballFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
) {
    const dir = new THREE.Vector3(tx - fx, 0, tz - fz).normalize();
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 1).normalize();
    const start = new THREE.Vector3(tx - dir.x * 4, fy + 9, tz - dir.z * 4);
    const end = new THREE.Vector3(tx, ty, tz);

    // Core
    const coreGeo = pooledPlane(1.0, 1.0);
    const coreMat = new THREE.MeshBasicMaterial({
        map: lightTex,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.frustumCulled = false;
    coreMesh.position.copy(start);
    scene.add(coreMesh);

    // Fire wrapper
    const wrapGeo = pooledPlane(2.0, 2.0);
    const wrapMat = new THREE.MeshBasicMaterial({
        map: fireTex,
        color: 0xff5500,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const wrapMesh = new THREE.Mesh(wrapGeo, wrapMat);
    wrapMesh.frustumCulled = false;
    wrapMesh.position.copy(start);
    scene.add(wrapMesh);

    // Trail system
    const trails: {
        mesh: THREE.Mesh;
        mat: THREE.MeshBasicMaterial;
        vel: THREE.Vector3;
        age: number;
        maxAge: number;
    }[] = [];

    let age = 0;
    const flightDuration = 0.45;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / flightDuration);
            const et = easeOutQuad(t);
            const cq = camera.quaternion;

            coreMesh.quaternion.copy(cq);
            wrapMesh.quaternion.copy(cq);
            wrapMesh.rotation.z += 0.15;

            const pos = new THREE.Vector3().lerpVectors(start, end, et);
            coreMesh.position.copy(pos);
            wrapMesh.position.copy(pos);

            // Spawn trails
            if (t < 1) {
                // Flame puff
                if (Math.random() < 0.7) {
                    const gm = pooledPlane(1.0, 1.0);
                    const mm = new THREE.MeshBasicMaterial({
                        map: flameTex,
                        color: 0xff4400,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const m = new THREE.Mesh(gm, mm);
                    m.position
                        .copy(pos)
                        .add(
                            new THREE.Vector3(
                                (Math.random() - 0.5) * 0.3,
                                (Math.random() - 0.5) * 0.3,
                                (Math.random() - 0.5) * 0.3,
                            ),
                        );
                    m.quaternion.copy(cq);
                    m.rotateZ(Math.random() * Math.PI * 2);
                    scene.add(m);
                    trails.push({
                        mesh: m,
                        mat: mm,
                        vel: new THREE.Vector3(
                            (Math.random() - 0.5) * 0.5,
                            0.3 + Math.random() * 0.4,
                            (Math.random() - 0.5) * 0.5,
                        ),
                        age: 0,
                        maxAge: 0.35,
                    });
                }
                // Spark
                if (Math.random() < 0.5) {
                    const gm = pooledPlane(0.5, 0.5);
                    const mm = new THREE.MeshBasicMaterial({
                        map: sparkTex,
                        color: 0xffcc00,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const m = new THREE.Mesh(gm, mm);
                    m.position.copy(pos);
                    m.quaternion.copy(cq);
                    scene.add(m);
                    trails.push({
                        mesh: m,
                        mat: mm,
                        vel: new THREE.Vector3(
                            (Math.random() - 0.5) * 1.5,
                            (Math.random() - 0.5) * 1.5,
                            (Math.random() - 0.5) * 1.5,
                        ),
                        age: 0,
                        maxAge: 0.25,
                    });
                }
            }

            for (let i = trails.length - 1; i >= 0; i--) {
                const tr = trails[i];
                tr.age += delta;
                const tp = tr.age / tr.maxAge;
                if (tp >= 1) {
                    scene.remove(tr.mesh);
                    tr.mat.dispose();
                    trails.splice(i, 1);
                } else {
                    tr.mesh.position.addScaledVector(tr.vel, delta);
                    tr.mesh.scale.setScalar(1 - easeOutQuad(tp));
                    tr.mat.opacity = 1 - easeOutQuad(tp);
                    tr.mesh.quaternion.copy(camera.quaternion);
                }
            }

            if (t >= 1 && trails.length === 0) {
                scene.remove(coreMesh);
                scene.remove(wrapMesh);
                coreMat.dispose();
                wrapMat.dispose();
                spawnMeteorExplosion(scene, end);
                return false;
            }
            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 6. Double Shot — 2 arrows 120ms apart with trail + spark hit
// ═══════════════════════════════════════════════════════════════
export function spawnDoubleShotFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
) {
    const start = new THREE.Vector3(fx, fy, fz);
    const end = new THREE.Vector3(tx, ty, tz);

    const shootArrow = (delay: number) => {
        let age = -delay;
        const flight = 0.28;
        let mesh: THREE.Mesh | null = null;
        let mat: THREE.MeshBasicMaterial | null = null;

        activeFX.push({
            update(delta) {
                age += delta;
                if (age < 0) return true;
                if (!mesh) {
                    const geo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8);
                    mat = new THREE.MeshBasicMaterial({
                        color: 0xffdd44,
                        transparent: true,
                        opacity: 0.9,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.frustumCulled = false;
                    mesh.position.copy(start);
                    mesh.lookAt(end);
                    mesh.rotateX(Math.PI / 2);
                    scene.add(mesh);
                }
                const t = Math.min(1, age / flight);
                if (t >= 1) {
                    scene.remove(mesh!);
                    mesh!.geometry.dispose();
                    mat!.dispose();
                    spawnExplosion(scene, end, 0xffbb44, 8, 0.12);
                    return false;
                }
                mesh!.position.lerpVectors(start, end, easeOutQuad(t));
                return true;
            },
        });
    };

    shootArrow(0);
    shootArrow(0.12);
}

// ═══════════════════════════════════════════════════════════════
// 7. Taunt — shockwave + dual rings + scorch + emoji + spark burst
// ═══════════════════════════════════════════════════════════════
export function spawnTauntFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    team?: number,
) {
    const isBlue = team === 1;
    const colorPrimary = isBlue ? 0x2288ff : 0xff2244;
    const colorSecondary = isBlue ? 0x00dfff : 0xff0033;
    const colorTertiary = isBlue ? 0x00ffcc : 0xff8822;
    const colorScorch = isBlue ? 0x3366ff : 0xff1111;
    const colorSparks = isBlue ? 0x33ccff : 0xff4444;

    // Shockwave — fast outward
    const swGeo = pooledRing(0.1, 0.35, 16);
    const swMat = getPooledMaterial({
        color: colorPrimary,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const sw = new THREE.Mesh(swGeo, swMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(x, y + 0.05, z);
    scene.add(sw);

    // Pulsing inner ring
    const ringGeo = pooledRing(0.5, 0.7, 12);
    const ringMat = getPooledMaterial({
        color: colorSecondary,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.06, z);
    scene.add(ring);

    // Counter ring
    const ring2Geo = pooledRing(0.25, 0.38, 12);
    const ring2Mat = getPooledMaterial({
        color: colorTertiary,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(x, y + 0.07, z);
    scene.add(ring2);

    // Ground scorch at target
    const scorchGeo = pooledRing(0.7, 1.3, 16);
    const scorchMat = getPooledMaterial({
        color: colorScorch,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(tx, 0.03, tz);
    scene.add(scorch);

    // Emoji — recycled texture
    const tTex = getTauntTex();
    const iconGeo = pooledPlane(1.0, 1.0);
    const iconMat = getPooledMaterial({
        map: tTex,
        transparent: true,
        depthTest: false,
    });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.set(tx, ty + 2.2, tz);
    icon.renderOrder = 10;
    scene.add(icon);

    // Spark burst around taunter — now instanced
    const pGeo = pooledPlane(0.25, 0.25);
    const pMat = getPooledMaterial({
        map: sparkTex,
        color: colorSparks,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const PCOUNT = Math.round(12 * fxQualityScale());
    const instMesh = new THREE.InstancedMesh(pGeo, pMat, PCOUNT);
    instMesh.frustumCulled = false;
    scene.add(instMesh);

    const pVels: THREE.Vector3[] = [];
    const pOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < PCOUNT; i++) {
        pOffsets.push(new THREE.Vector3(x, y + 0.4, z));
        const a = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.5;
        pVels.push(
            new THREE.Vector3(
                Math.cos(a) * speed,
                1.5 + Math.random() * 3,
                Math.sin(a) * speed,
            ),
        );
    }

    let age = 0;
    const duration = 0.9;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(sw);
                scene.remove(ring);
                scene.remove(ring2);
                scene.remove(scorch);
                scene.remove(icon);
                scene.remove(instMesh);

                releasePooledMaterial(swMat);
                releasePooledMaterial(ringMat);
                releasePooledMaterial(ring2Mat);
                releasePooledMaterial(scorchMat);
                releasePooledMaterial(iconMat);
                releasePooledMaterial(pMat);
                instMesh.dispose();
                return false;
            }
            const et = easeOutBack(t);

            // Shockwave expands and fades fast
            sw.scale.setScalar(1 + t * 4);
            swMat.opacity = 1.0 * (1 - t) * (1 - t);

            // Pulsing rings — expand + rotate + pulse opacity
            const s = 1 + et * 4.5;
            ring.scale.set(s, s, 1);
            ring.rotation.z += 0.05;
            ringMat.opacity = (1 - t) * (0.35 + 0.65 * Math.sin(t * 15));

            ring2.scale.set(s * 0.65, s * 0.65, 1);
            ring2.rotation.z -= 0.09;
            ring2Mat.opacity = (1 - t) * (0.3 + 0.7 * Math.sin(t * 11 + 1.5));

            // Ground scorch fades
            scorch.scale.setScalar(1.0 + t * 0.3);
            scorchMat.opacity = 0.65 * (1 - t);

            // Emoji rises + bobs
            icon.position.y = ty + 2.2 + et * 1.5;
            icon.scale.setScalar(1 + et * 0.5);
            icon.rotation.y += 0.015;
            icon.quaternion.copy(camera.quaternion);
            iconMat.opacity = Math.max(0, 1 - t * 1.2);

            // Sparks instanced update
            const cq = camera.quaternion;
            for (let i = 0; i < PCOUNT; i++) {
                pOffsets[i].addScaledVector(pVels[i], delta);
                pVels[i].y -= 8 * delta;

                _tempObj.position.copy(pOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(1.0 - et * 0.5);
                _tempObj.updateMatrix();
                instMesh.setMatrixAt(i, _tempObj.matrix);
            }
            instMesh.instanceMatrix.needsUpdate = true;
            pMat.opacity = 1 - t;

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 8. Shield Bash — golden arc wave + dual shock rings + heavy impact sparks
// ═══════════════════════════════════════════════════════════════
export function spawnShieldBashFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    team?: number,
) {
    const isBlue = team === 1;
    const colorArc = isBlue ? 0x33aaff : 0xffcc33;
    const colorShock = isBlue ? 0x00dfff : 0xffdd44;
    const colorShock2 = isBlue ? 0x3366ff : 0xffaa00;
    const colorSparks = isBlue ? 0x66ccff : 0xffdd66;

    const start = new THREE.Vector3(x, y + 0.9, z);
    const end = new THREE.Vector3(tx, ty + 0.9, tz);

    // Golden arc wave — travels from attacker to target
    const arcGeo = pooledRing(0.9, 1.3, 12, -Math.PI / 3, Math.PI * 0.66);
    const arcMat = getPooledMaterial({
        color: colorArc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
    });
    const wave = new THREE.Mesh(arcGeo, arcMat);
    wave.position.copy(start);
    wave.lookAt(end);
    scene.add(wave);

    // Shock ring at impact — expands outward
    const shockGeo = pooledRing(0.3, 0.6, 16);
    const shockMat = getPooledMaterial({
        color: colorShock,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const shock = new THREE.Mesh(shockGeo, shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(tx, 0.04, tz);
    scene.add(shock);

    // Secondary shock ring — slightly delayed
    const shock2Geo = pooledRing(0.1, 0.3, 12);
    const shock2Mat = getPooledMaterial({
        color: colorShock2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const shock2 = new THREE.Mesh(shock2Geo, shock2Mat);
    shock2.rotation.x = -Math.PI / 2;
    shock2.position.set(tx, 0.05, tz);
    scene.add(shock2);

    // Impact sparks — dense burst outward, now instanced
    const sparkGeo = pooledPlane(0.3, 0.3);
    const sparkMat = getPooledMaterial({
        map: sparkTex,
        color: colorSparks,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const SK = Math.round(8 * fxQualityScale());
    const instMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SK);
    instMesh.frustumCulled = false;
    scene.add(instMesh);

    const sparkVels: THREE.Vector3[] = [];
    const sparkOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < SK; i++) {
        sparkOffsets.push(end.clone());
        const a = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        sparkVels.push(
            new THREE.Vector3(
                Math.cos(a) * speed,
                2.5 + Math.random() * 4,
                Math.sin(a) * speed,
            ),
        );
    }

    // Flash at impact — brief white disc
    const flashGeo = pooledPlane(2.5, 2.5);
    const flashMat = getPooledMaterial({
        map: lightTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(end);
    flash.quaternion.copy(getCamQuad());
    scene.add(flash);

    let age = 0;
    const duration = 0.45;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(wave);
                scene.remove(shock);
                scene.remove(shock2);
                scene.remove(flash);
                scene.remove(instMesh);

                releasePooledMaterial(arcMat);
                releasePooledMaterial(shockMat);
                releasePooledMaterial(shock2Mat);
                releasePooledMaterial(flashMat);
                releasePooledMaterial(sparkMat);
                instMesh.dispose();
                return false;
            }
            const et = easeOutCubic(t);

            // Arc wave travels and fades
            wave.position.lerpVectors(start, end, et);
            wave.scale.setScalar(0.8 + et * 1.2);
            arcMat.opacity = 0.95 * (1 - et);

            // Shock rings — expand then fade
            const shockStart = Math.max(0, (t - 0.1) / 0.9);
            shock.scale.setScalar(1 + shockStart * 3.0);
            shockMat.opacity = 0.9 * (1 - shockStart) * (1 - shockStart);

            shock2.scale.setScalar(1 + shockStart * 4.0);
            shock2Mat.opacity = 0.8 * (1 - shockStart) * (1 - shockStart);

            // Flash — quick pop
            flashMat.opacity = 0.7 * (1 - t) * (1 - t);
            flash.scale.setScalar(0.8 + t * 2);

            // Sparks
            const cq = camera.quaternion;
            for (let i = 0; i < SK; i++) {
                sparkOffsets[i].addScaledVector(sparkVels[i], delta);
                sparkVels[i].y -= 12 * delta;

                _tempObj.position.copy(sparkOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(1 - et);
                _tempObj.updateMatrix();
                instMesh.setMatrixAt(i, _tempObj.matrix);
            }
            instMesh.instanceMatrix.needsUpdate = true;
            sparkMat.opacity = 1 - et;

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 9. Evasive Leap — dust puffs + afterimage trail
// ═══════════════════════════════════════════════════════════════
export function spawnEvasiveLeapFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
) {
    const startY = fy;
    const endY = ty;
    const cq = getCamQuad();

    // Smoke puffs at start
    const smokeGeo = pooledPlane(0.5, 0.5);
    const smokeMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
    });
    const puffs: THREE.Mesh[] = [];
    const pVels: THREE.Vector3[] = [];
    const PUFFS = Math.round(14 * fxQualityScale());
    for (let i = 0; i < PUFFS; i++) {
        const m = new THREE.Mesh(smokeGeo, smokeMat); // shared mat
        m.position.set(
            fx + (Math.random() - 0.5) * 0.5,
            startY + 0.25,
            fz + (Math.random() - 0.5) * 0.5,
        );
        m.quaternion.copy(cq);
        m.scale.setScalar(0.5 + Math.random() * 0.5);
        scene.add(m);
        puffs.push(m);
        pVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 1.0,
                Math.random() * 1.2 + 0.4,
                (Math.random() - 0.5) * 1.0,
            ),
        );
    }

    // Afterimage dash trail
    const dashGeo = pooledPlane(1.0, 4.0);
    const dashMat = new THREE.MeshBasicMaterial({
        color: 0x88e0ff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.frustumCulled = false;
    const midX = (fx + tx) / 2,
        midY = (startY + endY) / 2,
        midZ = (fz + tz) / 2;
    dash.position.set(midX, midY + 0.6, midZ);
    dash.lookAt(tx, endY + 0.6, tz);
    dash.rotateX(Math.PI / 2);
    scene.add(dash);

    let age = 0;
    const duration = 0.55;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                puffs.forEach((m) => {
                    scene.remove(m);
                    (m.material as THREE.MeshBasicMaterial).dispose();
                });
                scene.remove(dash);
                smokeMat.dispose();
                dashMat.dispose();
                return false;
            }
            const et = easeOutCubic(t);
            for (let i = 0; i < puffs.length; i++) {
                puffs[i].position.addScaledVector(pVels[i], delta);
                puffs[i].scale.addScalar(delta * 2.5);
                puffs[i].quaternion.copy(camera.quaternion);
                (puffs[i].material as THREE.MeshBasicMaterial).opacity =
                    0.7 * (1 - et);
            }
            dashMat.opacity = 0.5 * (1 - et);
            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 10. Frost Nova Burst — expanding ice ring + spikes + chill mist
// ═══════════════════════════════════════════════════════════════
export function spawnFrostNovaBurstFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
) {
    // Expanding frost ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.25, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x55ccff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.04, z);
    scene.add(ring);

    // Inner ring
    const innerGeo = new THREE.RingGeometry(0.05, 0.12, 24);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0xaae8ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(x, y + 0.05, z);
    scene.add(inner);

    // Ice spikes
    const SPIKE = 10;
    const spikeGeo = new THREE.ConeGeometry(0.1, 1.0, 4);
    const spikeMat = new THREE.MeshBasicMaterial({
        color: 0x88e0ff,
        transparent: true,
        opacity: 0.85,
    });
    const spikes: THREE.Mesh[] = [];
    const spikeAngles: number[] = [];
    for (let i = 0; i < SPIKE; i++) {
        const sp = new THREE.Mesh(spikeGeo, spikeMat);
        const angle = (i / SPIKE) * Math.PI * 2;
        sp.position.set(
            x + Math.cos(angle) * 0.8,
            y - 0.5,
            z + Math.sin(angle) * 0.8,
        );
        sp.rotation.x = Math.PI + (Math.random() - 0.5) * 0.35;
        sp.rotation.y = angle;
        scene.add(sp);
        spikes.push(sp);
        spikeAngles.push(angle);
    }

    // Chill mist particles
    const mistGeo = pooledPlane(0.6, 0.6);
    const mistMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        color: 0x88ccff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
    });
    const mists: THREE.Mesh[] = [];
    const mistVels: THREE.Vector3[] = [];
    const MISTS = Math.round(8 * fxQualityScale());
    for (let i = 0; i < MISTS; i++) {
        const m = new THREE.Mesh(mistGeo, mistMat); // shared mat
        m.position.set(
            x + (Math.random() - 0.5) * 0.6,
            y + 0.1,
            z + (Math.random() - 0.5) * 0.6,
        );
        m.quaternion.copy(getCamQuad());
        scene.add(m);
        mists.push(m);
        mistVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 0.6,
                0.3 + Math.random() * 0.6,
                (Math.random() - 0.5) * 0.6,
            ),
        );
    }

    let age = 0;
    const duration = 0.9;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(ring);
                scene.remove(inner);
                spikes.forEach((s) => scene.remove(s));
                mists.forEach((m) => {
                    scene.remove(m);
                    (m.material as THREE.MeshBasicMaterial).dispose();
                });
                ringGeo.dispose();
                ringMat.dispose();
                innerGeo.dispose();
                innerMat.dispose();
                spikeGeo.dispose();
                spikeMat.dispose();
                mistMat.dispose();
                return false;
            }
            const s = 1 + t * 18;
            ring.scale.set(s, s, 1);
            ringMat.opacity = 0.95 * (1 - t);

            const si = 1 + t * 10;
            inner.scale.set(si, si, 1);
            inner.rotation.z += 0.04;
            innerMat.opacity = 0.8 * (1 - t);

            // Spikes: rise then sink
            const rise = Math.sin(t * Math.PI) * 1.1;
            for (let i = 0; i < SPIKE; i++) {
                const a = spikeAngles[i];
                const r = 0.8 + t * 1.2;
                spikes[i].position.x = x + Math.cos(a) * r;
                spikes[i].position.z = z + Math.sin(a) * r;
                spikes[i].position.y = y - 0.5 + rise;
                spikes[i].scale.setScalar(0.7 + rise * 0.5);
            }
            spikeMat.opacity = 0.85 * (1 - t);

            for (let i = 0; i < mists.length; i++) {
                mists[i].position.addScaledVector(mistVels[i], delta);
                mists[i].scale.addScalar(delta * 1.5);
                mists[i].quaternion.copy(camera.quaternion);
                (mists[i].material as THREE.MeshBasicMaterial).opacity =
                    0.4 * (1 - t);
            }
            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 11. Iron Fortitude Aura — triple golden rings + shield glyph + sparkle column
// ═══════════════════════════════════════════════════════════════
export function spawnIronFortitudeAuraFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    team?: number,
) {
    const isBlue = team === 1;
    const colorRing1 = isBlue ? 0x00dfff : 0xffd700;
    const colorRing2 = isBlue ? 0x3366ff : 0xffaa00;
    const colorRing3 = isBlue ? 0xaaddff : 0xffeebb;
    const colorGlyph = isBlue ? 0xeef9ff : 0xffffee;
    const colorSparks = isBlue ? 0x33c0ff : 0xffd700;
    // Outer heavy ring — rises and expands
    const ringGeo = pooledRing(1.0, 1.25, 16);
    const ringMat = getPooledMaterial({
        color: colorRing1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    scene.add(ring);

    // Middle ring — counter-rotating
    const ring2Geo = pooledRing(0.55, 0.7, 12);
    const ring2Mat = getPooledMaterial({
        color: colorRing2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(x, y + 0.07, z);
    scene.add(ring2);

    // Inner bright ring — fastest rotation
    const ring3Geo = pooledRing(0.3, 0.4, 12);
    const ring3Mat = getPooledMaterial({
        color: colorRing3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.x = -Math.PI / 2;
    ring3.position.set(x, y + 0.08, z);
    scene.add(ring3);

    // Shield glyph — custom diamond shape via ring
    const glyphGeo = pooledRing(0.15, 0.55, 4);
    const glyphMat = getPooledMaterial({
        color: colorGlyph,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const glyph = new THREE.Mesh(glyphGeo, glyphMat);
    glyph.rotation.x = -Math.PI / 2;
    glyph.position.set(x, y + 0.09, z);
    scene.add(glyph);

    // Sparkle column, now instanced
    const spGeo = pooledPlane(0.22, 0.22);
    const spMat = getPooledMaterial({
        map: star2Tex,
        color: colorSparks,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const SPS = Math.round(10 * fxQualityScale());
    const instMesh = new THREE.InstancedMesh(spGeo, spMat, SPS);
    instMesh.frustumCulled = false;
    scene.add(instMesh);

    const spVels: THREE.Vector3[] = [];
    const spOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < SPS; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 1.2;
        spOffsets.push(
            new THREE.Vector3(
                x + Math.cos(a) * r,
                y + 0.1,
                z + Math.sin(a) * r,
            ),
        );
        spVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 0.6,
                1.8 + Math.random() * 3.5,
                (Math.random() - 0.5) * 0.6,
            ),
        );
    }

    let age = 0;
    const duration = 0.85;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(ring);
                scene.remove(ring2);
                scene.remove(ring3);
                scene.remove(glyph);
                scene.remove(instMesh);

                releasePooledMaterial(ringMat);
                releasePooledMaterial(ring2Mat);
                releasePooledMaterial(ring3Mat);
                releasePooledMaterial(glyphMat);
                releasePooledMaterial(spMat);
                instMesh.dispose();
                return false;
            }
            const et = easeOutCubic(t);

            // Outer ring — rise and expand, slow rotation
            ring.position.y = y + 0.05 + et * 3.0;
            ring.scale.setScalar(1 + et * 1.5);
            ring.rotation.z += 0.02;
            ringMat.opacity = 1.0 * (1 - et) * (1 - et);

            // Middle ring — rise faster, counter-rotate
            ring2.position.y = y + 0.07 + et * 4.5;
            ring2.scale.setScalar(1 + et * 1.2);
            ring2.rotation.z -= 0.06;
            ring2Mat.opacity = 0.85 * (1 - et) * (1 - et);

            // Inner ring — fastest
            ring3.position.y = y + 0.08 + et * 5.5;
            ring3.scale.setScalar(1 + et * 0.8);
            ring3.rotation.z += 0.1;
            ring3Mat.opacity = 0.9 * (1 - et) * (1 - et);

            // Glyph — rotates and fades
            glyph.position.y = y + 0.09 + et * 2.0;
            glyph.rotation.z += 0.04;
            glyph.scale.setScalar(1 + Math.sin(t * Math.PI) * 1.0);
            glyphMat.opacity = 0.8 * Math.sin(t * Math.PI);

            // Sparkles rise and swirl
            const cq = camera.quaternion;
            for (let i = 0; i < SPS; i++) {
                spOffsets[i].addScaledVector(spVels[i], delta);
                spVels[i].y += Math.sin(age * 8 + i) * 0.3 * delta;

                _tempObj.position.copy(spOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(1 - et);
                _tempObj.updateMatrix();
                instMesh.setMatrixAt(i, _tempObj.matrix);
            }
            instMesh.instanceMatrix.needsUpdate = true;
            spMat.opacity = 1 - et;

            return true;
        },
    });
}

export function spawnBasicAttackFX(
    scene: THREE.Scene,
    uType: number,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
) {
    if (!canSpawnFX()) return;
    const start = new THREE.Vector3(fx, fy, fz);
    const end = new THREE.Vector3(tx, ty, tz);

    if (uType === 0) {
        // Tank: Melee impact spark/slash at target position immediately
        soundFX.playSlash(end.x, end.y, end.z, camera.position);
        spawnExplosion(scene, end, 0xffdd66, 6, 0.1);
    } else if (uType === 1) {
        // Archer: Single arrow projectile
        soundFX.playBow(start.x, start.y, start.z, camera.position);
        let age = 0;
        const flight = 0.24; // slightly faster than double shot
        let mesh: THREE.Mesh | null = null;
        let mat: THREE.MeshBasicMaterial | null = null;

        activeFX.push({
            update(delta) {
                age += delta;
                if (!mesh) {
                    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5);
                    mat = new THREE.MeshBasicMaterial({
                        color: 0xffeaad,
                        transparent: true,
                        opacity: 0.8,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.frustumCulled = false;
                    mesh.position.copy(start);
                    mesh.lookAt(end);
                    mesh.rotateX(Math.PI / 2);
                    scene.add(mesh);
                }
                const t = Math.min(1, age / flight);
                if (t >= 1) {
                    scene.remove(mesh!);
                    mesh!.geometry.dispose();
                    mat!.dispose();
                    spawnExplosion(scene, end, 0xffbb44, 4, 0.1);
                    return false;
                }
                mesh!.position.lerpVectors(start, end, easeOutQuad(t));
                return true;
            },
        });
    } else if (uType === 2) {
        // Mage: Small glowing magic projectile
        soundFX.playMagicCast(start.x, start.y, start.z, camera.position);
        let age = 0;
        const flight = 0.35; // slower than arrow
        let mesh: THREE.Mesh | null = null;
        let mat: THREE.MeshBasicMaterial | null = null;

        activeFX.push({
            update(delta) {
                age += delta;
                if (!mesh) {
                    const geo = new THREE.SphereGeometry(0.15, 6, 6);
                    mat = new THREE.MeshBasicMaterial({
                        color: 0x88e0ff,
                        transparent: true,
                        opacity: 0.9,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.frustumCulled = false;
                    mesh.position.copy(start);
                    scene.add(mesh);
                }
                const t = Math.min(1, age / flight);
                if (t >= 1) {
                    scene.remove(mesh!);
                    mesh!.geometry.dispose();
                    mat!.dispose();
                    spawnExplosion(scene, end, 0x44ccff, 6, 0.1);
                    return false;
                }
                mesh!.position.lerpVectors(start, end, easeOutQuad(t));
                return true;
            },
        });
    } else if (uType === 4) {
        // Gunslinger: Fast bullet trail projectile with impact
        soundFX.playBow(start.x, start.y, start.z, camera.position);
        let age = 0;
        const flight = 0.15;
        let trail: THREE.Mesh | null = null;
        let trailMat: THREE.MeshBasicMaterial | null = null;

        activeFX.push({
            update(delta) {
                age += delta;
                if (!trail) {
                    const trailGeo = new THREE.CylinderGeometry(
                        0.04,
                        0.04,
                        1.0,
                        4,
                    );
                    trailMat = new THREE.MeshBasicMaterial({
                        color: 0xffcc44,
                        transparent: true,
                        opacity: 0.95,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    trail = new THREE.Mesh(trailGeo, trailMat);
                    trail.frustumCulled = false;
                    trail.position.copy(start);
                    trail.lookAt(end);
                    trail.rotateX(Math.PI / 2);
                    scene.add(trail);
                }
                const t = Math.min(1, age / flight);
                if (t >= 1) {
                    scene.remove(trail!);
                    trail!.geometry.dispose();
                    trailMat!.dispose();
                    spawnExplosion(scene, end, 0xffaa22, 10, 0.12);
                    return false;
                }
                trail!.position.lerpVectors(start, end, easeOutQuad(t));
                return true;
            },
        });
    } else if (uType === 5) {
        // Assassin: Quick melee slash with impact sparks
        soundFX.playSlash(end.x, end.y, end.z, camera.position);
        let age = 0;
        const slashLife = 0.15;
        const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
        mid.y += 0.3;

        activeFX.push({
            update(delta) {
                age += delta;
                const t = age / slashLife;
                if (t < 0.03) {
                    const arcGeo = new THREE.PlaneGeometry(1.4, 0.3);
                    const arcMat = new THREE.MeshBasicMaterial({
                        color: 0xff5533,
                        transparent: true,
                        opacity: 0.75,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        side: THREE.DoubleSide,
                    });
                    const arcMesh = new THREE.Mesh(arcGeo, arcMat);
                    arcMesh.position.copy(mid);
                    arcMesh.quaternion.copy(getCamQuad());
                    arcMesh.frustumCulled = false;
                    scene.add(arcMesh);

                    let arcAge = 0;
                    activeFX.push({
                        update(d2) {
                            arcAge += d2;
                            const at = arcAge / 0.16;
                            if (at >= 1) {
                                scene.remove(arcMesh);
                                arcMesh.geometry.dispose();
                                arcMat.dispose();
                                return false;
                            }
                            arcMat.opacity = 0.75 * (1 - at);
                            arcMesh.scale.set(1 + at * 0.4, 1, 1);
                            return true;
                        },
                    });
                }
                if (t >= 1) {
                    spawnExplosion(scene, end, 0xff4422, 5, 0.08);
                    return false;
                }
                return true;
            },
        });
    }
}

export function spawnIceShatterFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
) {
    soundFX.playIceShatter(x, y, z, camera.position);
    const shardGeo = new THREE.ConeGeometry(0.12, 0.35, 4);
    const shardMat = new THREE.MeshStandardMaterial({
        color: 0xaae5ff,
        transparent: true,
        opacity: 0.85,
        roughness: 0.15,
        metalness: 0.1,
    });

    const SHARDS = 12;
    const meshes: THREE.Mesh[] = [];
    const vels: THREE.Vector3[] = [];
    const rotVels: THREE.Vector3[] = [];

    for (let i = 0; i < SHARDS; i++) {
        const mesh = new THREE.Mesh(shardGeo, shardMat);
        mesh.frustumCulled = false;
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.4,
            y + (Math.random() - 0.5) * 0.4,
            z + (Math.random() - 0.5) * 0.4,
        );
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI,
        );
        // Random scale for variety
        const scale = 0.5 + Math.random() * 0.8;
        mesh.scale.set(scale, scale, scale);
        scene.add(mesh);
        meshes.push(mesh);

        // Random velocities flying outwards
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.0 + Math.random() * 2.0;
        vels.push(
            new THREE.Vector3(
                Math.cos(angle) * speed,
                2.0 + Math.random() * 2.5, // fly up initially
                Math.sin(angle) * speed,
            ),
        );
        rotVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
            ),
        );
    }

    let age = 0;
    const duration = 0.6;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                meshes.forEach((mesh) => {
                    scene.remove(mesh);
                });
                shardGeo.dispose();
                shardMat.dispose();
                return false;
            }

            for (let i = 0; i < SHARDS; i++) {
                const mesh = meshes[i];
                const vel = vels[i];
                // Apply gravity and update position
                vel.y -= 9.8 * delta; // gravity
                mesh.position.addScaledVector(vel, delta);
                // Rotate
                mesh.rotation.x += rotVels[i].x * delta;
                mesh.rotation.y += rotVels[i].y * delta;
                mesh.rotation.z += rotVels[i].z * delta;
                // Fade out
                (mesh.material as THREE.MeshStandardMaterial).opacity =
                    0.85 * (1 - t);
            }
            return true;
        },
    });
}

export function spawnHealFX(
    scene: THREE.Scene,
    start: THREE.Vector3,
    end: THREE.Vector3,
    isRejuvenation: boolean = false,
) {
    const color = isRejuvenation ? 0x00ff88 : 0x33ff66; // bright neon green / mint green

    // 1. Soft glowing main connecting beam
    const distance = start.distanceTo(end);
    const geo = new THREE.CylinderGeometry(0.06, 0.06, distance, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    beam.lookAt(end);
    beam.rotateX(Math.PI / 2);
    scene.add(beam);

    // 2. Spiral vortex sparkles at the target
    const sparkleCount = isRejuvenation ? 18 : 10;
    const sparkles: THREE.Mesh[] = [];

    const sGeo = new THREE.DodecahedronGeometry(0.08);
    const sMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    for (let i = 0; i < sparkleCount; i++) {
        const sp = new THREE.Mesh(sGeo, sMat);
        sp.position.copy(end);
        scene.add(sp);
        sparkles.push(sp);
    }

    let age = 0;
    const duration = isRejuvenation ? 0.75 : 0.45;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1.0, age / duration);

            // Fade and shrink connecting beam
            mat.opacity = 0.75 * (1.0 - t);
            beam.scale.set(1.0 - t, 1.0, 1.0 - t);

            // Animate sparkles in an upward spiral vortex around the healed unit
            for (let i = 0; i < sparkles.length; i++) {
                const offsetTime = age + i * (duration / sparkleCount);
                const theta = offsetTime * 14.0; // rotation speed
                const radius = 0.5 * (1.0 - t * 0.7); // spiral narrows slightly
                const height = (offsetTime * 2.5) % 2.0; // rise up to 2 units

                sparkles[i].position.set(
                    end.x + radius * Math.cos(theta),
                    end.y - 0.2 + height,
                    end.z + radius * Math.sin(theta),
                );
                sparkles[i].scale.setScalar((1.0 - t) * 0.9);
            }

            if (t >= 1.0) {
                scene.remove(beam);
                geo.dispose();
                mat.dispose();

                for (const sp of sparkles) {
                    scene.remove(sp);
                }
                sGeo.dispose();
                sMat.dispose();
                return false;
            }
            return true;
        },
    });
}

export function spawnDivineShieldFX(
    scene: THREE.Scene,
    targetPos: THREE.Vector3,
) {
    // ── Golden Rune Circle + Rising Light Pillar ──

    // 1. Rune ring on ground — rotates, scales up, fades
    const ringGeo = new THREE.RingGeometry(0.3, 1.1, 48, 1, 0, Math.PI * 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(targetPos.x, targetPos.y + 0.05, targetPos.z);
    scene.add(ring);

    // 2. Rising light pillar
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.5, 3.5, 16, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
        color: 0xffdf80,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(targetPos.x, targetPos.y + 1.75, targetPos.z);
    scene.add(pillar);

    // 3. Floating golden rune particles orbiting the unit
    const runeCount = 10;
    const runeGeo = new THREE.DodecahedronGeometry(0.05);
    const runeMat = new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const runes: THREE.Mesh[] = [];
    const runeAngles: number[] = [];
    const runeSpeeds: number[] = [];
    const runeHeights: number[] = [];

    for (let i = 0; i < runeCount; i++) {
        const r = new THREE.Mesh(runeGeo, runeMat);
        scene.add(r);
        runes.push(r);
        runeAngles.push((Math.PI * 2 * i) / runeCount);
        runeSpeeds.push(2.5 + Math.random() * 3.5);
        runeHeights.push(0.6 + Math.random() * 2.0);
    }

    let age = 0;
    const duration = 1.3;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1.0, age / duration);

            // Ring: expand + rotate + fade
            const ringScale = 0.2 + easeOutBack(t) * 2.0;
            ring.scale.setScalar(ringScale);
            ring.rotation.z += delta * 3.0;
            ringMat.opacity = 0.9 * (1.0 - t * t);

            // Pillar: rise + narrow top + fade
            pillar.position.y = targetPos.y + 1.75 + t * 2.0;
            pillar.scale.set(1.0 - t * 0.7, 1.0, 1.0 - t * 0.7);
            pillarMat.opacity = 0.6 * (1.0 - t);

            // Runes: spiral orbit around unit
            for (let i = 0; i < runeCount; i++) {
                const angle = runeAngles[i] + age * runeSpeeds[i];
                const radius = 1.0 + Math.sin(age * 2.0 + i) * 0.25;
                runes[i].position.set(
                    targetPos.x + Math.cos(angle) * radius,
                    targetPos.y +
                        runeHeights[i] +
                        Math.sin(age * 4.0 + i) * 0.2,
                    targetPos.z + Math.sin(angle) * radius,
                );
                runes[i].scale.setScalar(1.0 - t);
            }

            if (t >= 1.0) {
                scene.remove(ring);
                ringGeo.dispose();
                ringMat.dispose();
                scene.remove(pillar);
                pillarGeo.dispose();
                pillarMat.dispose();
                for (const r of runes) scene.remove(r);
                runeGeo.dispose();
                runeMat.dispose();
                return false;
            }
            return true;
        },
    });
}

export function spawnHolySanctuaryFX(
    scene: THREE.Scene,
    center: THREE.Vector3,
) {
    // 1. Glowing ground ring
    const geoRing = new THREE.RingGeometry(0.1, 5.0, 32);
    const matRing = new THREE.MeshBasicMaterial({
        color: 0x00ffaa, // Emerald-green holy aura
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const sanctuary = new THREE.Mesh(geoRing, matRing);
    sanctuary.rotation.x = -Math.PI / 2;
    sanctuary.position.copy(center).y += 0.06;
    scene.add(sanctuary);

    // 2. Pillars of Light at the perimeter edges
    const pillarCount = 4;
    const pillars: THREE.Mesh[] = [];
    const geoPillar = new THREE.CylinderGeometry(0.18, 0.18, 5.0, 8, 1, true);
    const matPillar = new THREE.MeshBasicMaterial({
        color: 0x33ffaa,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    const angleStep = (Math.PI * 2) / pillarCount;
    for (let i = 0; i < pillarCount; i++) {
        const p = new THREE.Mesh(geoPillar, matPillar);
        const radius = 4.3; // slightly inside sanctuary boundary
        p.position.set(
            center.x + radius * Math.cos(i * angleStep),
            center.y + 2.5, // Center offset for cylinder
            center.z + radius * Math.sin(i * angleStep),
        );
        scene.add(p);
        pillars.push(p);
    }

    let age = 0;
    const duration = 0.9;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1.0, age / duration);

            // Expand floor ring
            const scale = easeOutCubic(t);
            sanctuary.scale.setScalar(scale);
            matRing.opacity = 0.65 * (1.0 - t);

            // Move pillars upwards and fade
            matPillar.opacity = 0.35 * (1.0 - t);
            for (let i = 0; i < pillars.length; i++) {
                pillars[i].position.y += delta * 1.5; // rising speed
                pillars[i].scale.set(1.0 - t, 1.0, 1.0 - t);
            }

            if (t >= 1.0) {
                scene.remove(sanctuary);
                geoRing.dispose();
                matRing.dispose();

                for (const p of pillars) {
                    scene.remove(p);
                }
                geoPillar.dispose();
                matPillar.dispose();
                return false;
            }
            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// HIGH NOON — single shot trail with muzzle flash
// ═══════════════════════════════════════════════════════════════
export function spawnHighNoonFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    _team?: number,
): void {
    if (!canSpawnFX()) return;

    const isBlue = _team === 1;
    const beamColor = isBlue ? 0x44aaff : 0xff8800;
    const flashColor = isBlue ? 0x88ccff : 0xffcc44;
    const sparkColor = isBlue ? 0xaaddff : 0xffdd88;

    // ── 1. Large muzzle flash at shooter ──
    const mGeo = pooledPlane(1.2, 1.2);
    const mMat = getPooledMaterial({
        map: sparkTex,
        color: flashColor,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const muzzle = new THREE.Mesh(mGeo, mMat);
    muzzle.position.set(fx, fy, fz);
    muzzle.quaternion.copy(getCamQuad());
    scene.add(muzzle);

    // ── 2. Thick beam trail ──
    const dist = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2 + (tz - fz) ** 2);
    const tGeo = pooledPlane(0.2, dist);
    const tMat = getPooledMaterial({
        map: sparkTex,
        color: beamColor,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const trail = new THREE.Mesh(tGeo, tMat);
    trail.position.set((fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5);
    trail.quaternion.copy(getCamQuad());
    scene.add(trail);

    // ── 3. Explosion at target (matching Archer quality) ──
    const end = new THREE.Vector3(tx, ty, tz);
    spawnExplosion(scene, end, flashColor, 25, 0.18);

    // ── 4. Expanding hit ring ──
    const ringGeo = pooledRing(0.2, 0.5, 16);
    const ringMat = getPooledMaterial({
        color: sparkColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tx, ty + 0.04, tz);
    scene.add(ring);

    // ── 5. Hit sparks (instanced for performance) ──
    const pGeo = pooledPlane(0.2, 0.2);
    const pMat = getPooledMaterial({
        map: starTex,
        color: sparkColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const PARTICLE = Math.round(15 * fxQualityScale());
    const instMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE);
    instMesh.frustumCulled = false;
    scene.add(instMesh);

    const pVels: THREE.Vector3[] = [];
    const pOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < PARTICLE; i++) {
        pOffsets.push(new THREE.Vector3(tx, ty + 0.3, tz));
        const a = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.0;
        pVels.push(
            new THREE.Vector3(
                Math.cos(a) * speed,
                2.0 + Math.random() * 3.5,
                Math.sin(a) * speed,
            ),
        );
    }

    let age = 0;
    const duration = 0.5;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(muzzle);
                releasePooledMaterial(mMat);
                scene.remove(trail);
                releasePooledMaterial(tMat);
                scene.remove(ring);
                releasePooledMaterial(ringMat);
                scene.remove(instMesh);
                releasePooledMaterial(pMat);
                instMesh.dispose();
                return false;
            }
            const fade = 1 - t;
            const et = easeOutCubic(t);

            // Muzzle flash quickly fades
            mMat.opacity = fade * fade;
            muzzle.scale.setScalar(1.0 + et * 0.5);

            // Beam fades
            tMat.opacity = 0.95 * fade;

            // Ring expands & fades
            const rs = 1 + t * 8;
            ring.scale.set(rs, rs, 1);
            ringMat.opacity = 0.9 * fade;

            // Hit sparks
            const cq = camera.quaternion;
            for (let i = 0; i < PARTICLE; i++) {
                pOffsets[i].addScaledVector(pVels[i], delta);
                pVels[i].y -= 9.8 * delta;

                _tempObj.position.copy(pOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(1.0 - et * 0.5);
                _tempObj.updateMatrix();
                instMesh.setMatrixAt(i, _tempObj.matrix);
            }
            instMesh.instanceMatrix.needsUpdate = true;
            pMat.opacity = 1.0 * fade;

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// SMOKE BOMB — thick smoke ring + expanding clouds + particles
// ═══════════════════════════════════════════════════════════════
export function spawnSmokeBombFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    _team?: number,
): void {
    if (!canSpawnFX()) return;

    const isBlue = _team === 1;
    const smokeColor = isBlue ? 0x334455 : 0x555555;
    const ringColor = isBlue ? 0x556688 : 0x777777;
    const sparkColor = isBlue ? 0x88aacc : 0x888888;

    // ── 1. Thick expanding smoke ring ──
    const ringGeo = pooledRing(0.3, 0.8, 16);
    const ringMat = getPooledMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    scene.add(ring);

    // ── 2. Inner flash core ──
    const flashGeo = pooledPlane(1.0, 1.0);
    const flashMat = getPooledMaterial({
        map: lightTex,
        color: 0xcccccc,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(x, y + 0.1, z);
    flash.quaternion.copy(getCamQuad());
    scene.add(flash);

    // ── 3. Smoke puffs (using instanced mesh) ──
    const PUFFS = Math.round(14 * fxQualityScale());
    const pGeo = pooledPlane(0.7, 0.7);
    const pMat = getPooledMaterial({
        map: smokeTex,
        color: smokeColor,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const instMesh = new THREE.InstancedMesh(pGeo, pMat, PUFFS);
    instMesh.frustumCulled = false;
    scene.add(instMesh);

    const pVels: THREE.Vector3[] = [];
    const pOffsets: THREE.Vector3[] = [];
    const pScales: number[] = [];
    for (let i = 0; i < PUFFS; i++) {
        const a = (i / PUFFS) * Math.PI * 2;
        const r = 0.3 + Math.random() * 0.5;
        pOffsets.push(
            new THREE.Vector3(
                x + Math.cos(a) * r,
                y + 0.15,
                z + Math.sin(a) * r,
            ),
        );
        const speed = 1.5 + Math.random() * 2.0;
        pVels.push(
            new THREE.Vector3(
                Math.cos(a) * speed,
                1.0 + Math.random() * 2.0,
                Math.sin(a) * speed,
            ),
        );
        pScales.push(0.4 + Math.random() * 0.6);
    }

    // ── 4. Sparkles ──
    const SPS = Math.round(8 * fxQualityScale());
    const spGeo = pooledPlane(0.15, 0.15);
    const spMat = getPooledMaterial({
        map: starTex,
        color: sparkColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const spMesh = new THREE.InstancedMesh(spGeo, spMat, SPS);
    spMesh.frustumCulled = false;
    scene.add(spMesh);

    const spVels: THREE.Vector3[] = [];
    const spOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < SPS; i++) {
        spOffsets.push(new THREE.Vector3(x, y + 0.3, z));
        const a = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.5;
        spVels.push(
            new THREE.Vector3(
                Math.cos(a) * speed,
                0.5 + Math.random() * 1.2,
                Math.sin(a) * speed,
            ),
        );
    }

    let age = 0;
    const duration = 0.85;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(ring);
                scene.remove(flash);
                scene.remove(instMesh);
                scene.remove(spMesh);
                releasePooledMaterial(ringMat);
                releasePooledMaterial(flashMat);
                releasePooledMaterial(pMat);
                releasePooledMaterial(spMat);
                instMesh.dispose();
                spMesh.dispose();
                return false;
            }
            const et = easeOutCubic(t);
            const fade = 1 - et;

            // Ring expands & fades
            ring.scale.setScalar(1 + t * 6);
            ringMat.opacity = 0.85 * fade;

            // Flash core quickly fades
            flash.scale.setScalar(1 + t * 3);
            flashMat.opacity = 0.6 * fade;

            // Smoke puffs rise & swell
            const cq = camera.quaternion;
            for (let i = 0; i < PUFFS; i++) {
                pOffsets[i].addScaledVector(pVels[i], delta);
                _tempObj.position.copy(pOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(pScales[i] + t * 2.5);
                _tempObj.updateMatrix();
                instMesh.setMatrixAt(i, _tempObj.matrix);
            }
            instMesh.instanceMatrix.needsUpdate = true;
            pMat.opacity = 0.8 * fade;

            // Sparkles
            for (let i = 0; i < SPS; i++) {
                spOffsets[i].addScaledVector(spVels[i], delta);
                _tempObj.position.copy(spOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(1.0 - et * 0.6);
                _tempObj.updateMatrix();
                spMesh.setMatrixAt(i, _tempObj.matrix);
            }
            spMesh.instanceMatrix.needsUpdate = true;
            spMat.opacity = 0.85 * fade;

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// FAN FIRE — cone burst of bullet trails with ground impacts
// ═══════════════════════════════════════════════════════════════
export function spawnFanFireFX(
    scene: THREE.Scene,
    x: number,
    z: number,
    groundY: number,
    radius: number,
    _team?: number,
): void {
    if (!canSpawnFX()) return;

    const isBlue = _team === 1;
    const trailColor = isBlue ? 0x44ccff : 0xffcc00;
    const hitColor = isBlue ? 0x88ddff : 0xffee66;
    const sparkColor = isBlue ? 0xaaddff : 0xffdd88;

    // ── 1. Ground rune ring (like Arrow Volley) ──
    const runeGeo = new THREE.PlaneGeometry(radius * 2.4, radius * 2.4);
    const runeMat = new THREE.MeshBasicMaterial({
        map: magicTex,
        color: trailColor,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(x, groundY + 0.03, z);
    scene.add(rune);

    // ── 2. Cone wave ring (expanding) ──
    const ringGeo = pooledRing(0.1, 0.4, 16);
    const ringMat = getPooledMaterial({
        color: trailColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, groundY + 0.05, z);
    scene.add(ring);

    // ── 3. Bullet trails (instanced) ──
    const BULLETS = Math.round(12 * fxQualityScale());
    const trailGeo = pooledPlane(0.08, 0.5);
    const trailMat = getPooledMaterial({
        map: sparkTex,
        color: trailColor,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const trailMesh = new THREE.InstancedMesh(trailGeo, trailMat, BULLETS);
    trailMesh.frustumCulled = false;
    scene.add(trailMesh);

    const trailTargets: number[] = [];
    for (let i = 0; i < BULLETS; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        trailTargets.push(x + Math.cos(a) * r, z + Math.sin(a) * r);
    }

    // ── 4. Hit impact sparks (instanced) ──
    const HITS = Math.round(10 * fxQualityScale());
    const hitGeo = pooledPlane(0.2, 0.2);
    const hitMat = getPooledMaterial({
        map: starTex,
        color: hitColor,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const hitMesh = new THREE.InstancedMesh(hitGeo, hitMat, HITS);
    hitMesh.frustumCulled = false;
    scene.add(hitMesh);

    const hitOffsets: THREE.Vector3[] = [];
    const hitScales: number[] = [];
    for (let i = 0; i < HITS; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        hitOffsets.push(
            new THREE.Vector3(
                x + Math.cos(a) * r,
                groundY + 0.15,
                z + Math.sin(a) * r,
            ),
        );
        hitScales.push(0.3 + Math.random() * 0.4);
    }

    // ── 5. High-impact sparks ──
    const SPS = Math.round(12 * fxQualityScale());
    const spGeo = pooledPlane(0.12, 0.12);
    const spMat = getPooledMaterial({
        map: starTex,
        color: sparkColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const spMesh = new THREE.InstancedMesh(spGeo, spMat, SPS);
    spMesh.frustumCulled = false;
    scene.add(spMesh);

    const spVels: THREE.Vector3[] = [];
    const spOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < SPS; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * radius * 0.8;
        spOffsets.push(
            new THREE.Vector3(
                x + Math.cos(a) * r,
                groundY + 0.2,
                z + Math.sin(a) * r,
            ),
        );
        spVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                1.5 + Math.random() * 2.5,
                (Math.random() - 0.5) * 1.5,
            ),
        );
    }

    let age = 0;
    const duration = 0.55;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(rune);
                scene.remove(ring);
                scene.remove(trailMesh);
                scene.remove(hitMesh);
                scene.remove(spMesh);
                runeGeo.dispose();
                runeMat.dispose();
                releasePooledMaterial(ringMat);
                releasePooledMaterial(trailMat);
                releasePooledMaterial(hitMat);
                releasePooledMaterial(spMat);
                trailMesh.dispose();
                hitMesh.dispose();
                spMesh.dispose();
                return false;
            }
            const et = easeOutCubic(t);
            const fade = 1 - et;

            // Rune rotates & fades
            rune.rotation.z += 0.04;
            runeMat.opacity = 0.65 * fade;

            // Ring expands
            ring.scale.setScalar(1 + t * 10);
            ring.rotation.z += 0.05;
            ringMat.opacity = 0.9 * fade;

            const cq = camera.quaternion;

            // Bullet trails (fly outward)
            for (let i = 0; i < BULLETS; i++) {
                const bx = trailTargets[i * 2];
                const bz = trailTargets[i * 2 + 1];
                const sx = x + (bx - x) * et;
                const sz = z + (bz - z) * et;
                _tempObj.position.set(
                    (x + sx) * 0.5,
                    groundY + 0.6,
                    (z + sz) * 0.5,
                );
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.set(1.0 - et * 0.7, 1, 1);
                _tempObj.updateMatrix();
                trailMesh.setMatrixAt(i, _tempObj.matrix);
            }
            trailMesh.instanceMatrix.needsUpdate = true;
            trailMat.opacity = 0.95 * fade;

            // Hit impact rings
            for (let i = 0; i < HITS; i++) {
                _tempObj.position.copy(hitOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(hitScales[i] + t * 0.8);
                _tempObj.updateMatrix();
                hitMesh.setMatrixAt(i, _tempObj.matrix);
            }
            hitMesh.instanceMatrix.needsUpdate = true;
            hitMat.opacity = 0.85 * fade;

            // Sparks
            for (let i = 0; i < SPS; i++) {
                spOffsets[i].addScaledVector(spVels[i], delta);
                spVels[i].y -= 6 * delta;
                _tempObj.position.copy(spOffsets[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(1.0 - et);
                _tempObj.updateMatrix();
                spMesh.setMatrixAt(i, _tempObj.matrix);
            }
            spMesh.instanceMatrix.needsUpdate = true;
            spMat.opacity = 1.0 * fade;

            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// SHADOW STEP — dark puffs along teleport path
// ═══════════════════════════════════════════════════════════════
export function spawnShadowStepFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    _team?: number,
): void {
    if (!canSpawnFX()) return;

    for (let i = 0; i < 5; i++) {
        const t0 = i / 4;
        const sx = fx + (tx - fx) * t0;
        const sy = fy + (ty - fy) * t0;
        const sz = fz + (tz - fz) * t0;

        const geo = pooledPlane(0.35, 0.35);
        const mat = getPooledMaterial({
            map: smokeTex,
            color: 0x1a1a3a,
            transparent: true,
            opacity: 0.8,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const puff = new THREE.Mesh(geo, mat);
        puff.position.set(sx, sy, sz);
        puff.quaternion.copy(getCamQuad());
        puff.scale.setScalar(0.4);
        scene.add(puff);

        let age = 0;
        const duration = 0.25 + t0 * 0.2;
        activeFX.push({
            update(delta) {
                age += delta;
                const t = Math.min(1, age / duration);
                if (t >= 1) {
                    scene.remove(puff);
                    releasePooledMaterial(mat);
                    return false;
                }
                puff.scale.setScalar(0.4 + t * 0.8);
                mat.opacity = 0.8 * (1 - t);
                return true;
            },
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// BACKSTAB — red slash arcs at target position
// ═══════════════════════════════════════════════════════════════
export function spawnBackstabFX(
    scene: THREE.Scene,
    _fx: number,
    _fy: number,
    _fz: number,
    tx: number,
    ty: number,
    tz: number,
    _team?: number,
): void {
    if (!canSpawnFX()) return;

    const slashCount = 3;
    for (let i = 0; i < slashCount; i++) {
        const geo = pooledPlane(0.45, 0.45);
        const mat = getPooledMaterial({
            map: sparkTex,
            color: 0xff2222,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const slash = new THREE.Mesh(geo, mat);
        slash.position.set(tx, ty + 0.8, tz);
        slash.quaternion.copy(getCamQuad());
        slash.rotateZ((i / slashCount) * Math.PI * 0.6 - 0.3);
        scene.add(slash);

        let age = 0;
        const duration = 0.3;
        activeFX.push({
            update(delta) {
                age += delta;
                const t = Math.min(1, age / duration);
                if (t >= 1) {
                    scene.remove(slash);
                    releasePooledMaterial(mat);
                    return false;
                }
                slash.scale.setScalar(0.5 + t * 0.4);
                mat.opacity = 0.9 * (1 - t);
                return true;
            },
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// POISON BLADE — green rising bubbles at target
// ═══════════════════════════════════════════════════════════════
export function spawnPoisonBladeFX(
    scene: THREE.Scene,
    tx: number,
    ty: number,
    tz: number,
): void {
    if (!canSpawnFX()) return;

    const bubbleCount = Math.floor(5 * fxQualityScale());

    for (let i = 0; i < bubbleCount; i++) {
        const geo = pooledPlane(0.15, 0.15);
        const mat = getPooledMaterial({
            map: circleTex,
            color: 0x22cc22,
            transparent: true,
            opacity: 0.6,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const bubble = new THREE.Mesh(geo, mat);
        bubble.position.set(
            tx + (Math.random() - 0.5) * 0.8,
            ty + 0.6,
            tz + (Math.random() - 0.5) * 0.8,
        );
        bubble.quaternion.copy(getCamQuad());
        const vy = 0.3 + Math.random() * 0.5;
        scene.add(bubble);

        let age = 0;
        const duration = 0.6 + Math.random() * 0.3;
        activeFX.push({
            update(delta) {
                age += delta;
                const t = Math.min(1, age / duration);
                if (t >= 1) {
                    scene.remove(bubble);
                    releasePooledMaterial(mat);
                    return false;
                }
                bubble.position.y += vy * delta;
                bubble.scale.setScalar(1.0 + t * 0.5);
                mat.opacity = 0.6 * (1 - t);
                return true;
            },
        });
    }
}

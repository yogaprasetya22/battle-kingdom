/**
 * SkillFX_Projectiles.ts — Arrow Volley, Fireball, Double Shot, Basic Attack
 * Extracted untuk mengurangi memory pressure selama type checking
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import {
    easeOutCubic,
    easeOutQuad,
    pooledPlane,
    starTex,
    circleTex,
    sparkTex,
    fireTex,
    flameTex,
    lightTex,
    blueFlameSmokeTex,
    activeFX,
    fxQualityScale,
    getPooledMaterial,
    releasePooledMaterial,
    _tempObj,
    spawnExplosion,
    spawnGasExplosionFX,
} from "./FXCore";

// Cached shader materials for fireball trail particles — avoids per-fireball GPU shader compilation
const _flameMatCache = new Map<string, THREE.ShaderMaterial>();
const _smokeMatCache = new Map<string, THREE.ShaderMaterial>();

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

    const innerGeo = new THREE.PlaneGeometry(radius * 1.6, radius * 1.6);
    const innerMat = new THREE.MeshBasicMaterial({
        map: circleTex,
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

    const COUNT = 60;
    const arrowGeo = new THREE.CylinderGeometry(0.01, 0.035, 1.0, 4);

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

    const impactRingGeo = new THREE.PlaneGeometry(1.2, 1.2);
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
        const speed = 0.015 + Math.random() * 0.01;
        const height = startY - groundY;
        const hitTime = height / speed;

        data.push({ ax: targetX, az: targetZ, startY, speed, hitTime });
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
                arrowGeo.dispose();
                arrowMat.dispose();
                impactRingGeo.dispose();
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
                    const distY = d.speed * elapsed;
                    const ax = d.ax;
                    const ay = d.startY - distY;
                    const az = d.az;

                    _tempObj.position.set(ax, ay, az);
                    _tempObj.scale.set(1, 1, 1);
                    _tempObj.rotation.set(0, 0, 0);
                    _tempObj.updateMatrix();
                    arrows.setMatrixAt(k, _tempObj.matrix);

                    _tempObj.scale.setScalar(0);
                    _tempObj.updateMatrix();
                    impacts.setMatrixAt(k, _tempObj.matrix);
                } else {
                    _tempObj.scale.setScalar(0);
                    _tempObj.updateMatrix();
                    arrows.setMatrixAt(k, _tempObj.matrix);

                    const tHit = elapsed - d.hitTime;
                    const impactDuration = 300;
                    if (tHit < impactDuration) {
                        const hitT = tHit / impactDuration;
                        _tempObj.position.set(d.ax, groundY + 0.02, d.az);
                        _tempObj.rotation.set(-Math.PI / 2, 0, 0);
                        const scaleFactor = hitT * 1.5;
                        _tempObj.scale.set(scaleFactor, scaleFactor, 1);
                        _tempObj.updateMatrix();
                        impacts.setMatrixAt(k, _tempObj.matrix);
                    } else {
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

export function spawnFireballFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    team?: number,
) {
    const dir = new THREE.Vector3(tx - fx, 0, tz - fz).normalize();
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 1).normalize();
    const start = new THREE.Vector3(tx - dir.x * 4, fy + 9, tz - dir.z * 4);
    const end = new THREE.Vector3(tx, ty, tz);
    const isBlue = team === 1;

    const coreGeo = pooledPlane(1.2, 1.2);
    const coreMat = getPooledMaterial({
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

    const wrapGeo = pooledPlane(2.4, 2.4);
    const wrapMat = getPooledMaterial({
        map: fireTex,
        color: isBlue ? 0x00aaff : 0xff5500,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const wrapMesh = new THREE.Mesh(wrapGeo, wrapMat);
    wrapMesh.frustumCulled = false;
    wrapMesh.position.copy(start);
    scene.add(wrapMesh);

    const qs = fxQualityScale();
    const maxFlame = Math.max(6, Math.round(25 * qs));
    const maxSmoke = Math.max(6, Math.round(25 * qs));
    const geo = pooledPlane(1.0, 1.0);

    // Cache shader materials by color to avoid per-fireball GPU shader compilation
    const flameCacheKey = isBlue ? "blue" : "red";
    if (!_flameMatCache.has(flameCacheKey)) {
        _flameMatCache.set(
            flameCacheKey,
            new THREE.ShaderMaterial({
                uniforms: {
                    uMap: { value: flameTex },
                    uColor: {
                        value: isBlue
                            ? new THREE.Color(0.0, 0.4, 1.0)
                            : new THREE.Color(1.0, 0.3, 0.0),
                    },
                },
                vertexShader: /* glsl */ `
                attribute float aOpacity;
                varying vec2 vUv;
                varying float vOpacity;
                void main() {
                    vUv = uv;
                    vOpacity = aOpacity;
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
                fragmentShader: /* glsl */ `
                uniform sampler2D uMap;
                uniform vec3 uColor;
                varying vec2 vUv;
                varying float vOpacity;
                void main() {
                    vec4 tex = texture2D(uMap, vUv);
                    if (tex.a < 0.05) discard;
                    gl_FragColor = vec4(tex.rgb * uColor, tex.a * vOpacity);
                }
            `,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
            }),
        );
    }
    if (!_smokeMatCache.has(flameCacheKey)) {
        _smokeMatCache.set(
            flameCacheKey,
            new THREE.ShaderMaterial({
                uniforms: {
                    uMap: { value: blueFlameSmokeTex },
                    uColor: {
                        value: isBlue
                            ? new THREE.Color(0.0, 0.2, 0.8)
                            : new THREE.Color(0.8, 0.2, 0.0),
                    },
                },
                vertexShader: /* glsl */ `
                attribute float aFrameIdx;
                attribute float aOpacity;
                varying vec2 vUv;
                varying float vOpacity;
                void main() {
                    float c = mod(aFrameIdx, 2.0);
                    float r = floor(aFrameIdx / 2.0);
                    vUv = vec2((c + uv.x) / 2.0, 1.0 - (r + 1.0 - uv.y) / 2.0);
                    vOpacity = aOpacity;
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
                fragmentShader: /* glsl */ `
                uniform sampler2D uMap;
                uniform vec3 uColor;
                varying vec2 vUv;
                varying float vOpacity;
                void main() {
                    vec4 tex = texture2D(uMap, vUv);
                    if (tex.a < 0.05) discard;
                    gl_FragColor = vec4(tex.rgb * uColor, tex.a * vOpacity * 0.4);
                }
            `,
                transparent: true,
                depthWrite: false,
                blending: THREE.NormalBlending,
                side: THREE.DoubleSide,
            }),
        );
    }
    const flameMat = _flameMatCache.get(flameCacheKey)!;
    const smokeMat = _smokeMatCache.get(flameCacheKey)!;

    const aFlameOpacity = new Float32Array(maxFlame);
    const flameMesh = new THREE.InstancedMesh(geo, flameMat, maxFlame);
    flameMesh.frustumCulled = false;
    flameMesh.geometry.setAttribute(
        "aOpacity",
        new THREE.InstancedBufferAttribute(aFlameOpacity, 1),
    );
    scene.add(flameMesh);

    const aSmokeFrameIdx = new Float32Array(maxSmoke);
    const aSmokeOpacity = new Float32Array(maxSmoke);
    const smokeMesh = new THREE.InstancedMesh(geo, smokeMat, maxSmoke);
    smokeMesh.frustumCulled = false;
    smokeMesh.geometry.setAttribute(
        "aFrameIdx",
        new THREE.InstancedBufferAttribute(aSmokeFrameIdx, 1),
    );
    smokeMesh.geometry.setAttribute(
        "aOpacity",
        new THREE.InstancedBufferAttribute(aSmokeOpacity, 1),
    );
    scene.add(smokeMesh);

    const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxFlame; i++) {
        flameMesh.setMatrixAt(i, hideMatrix);
        aFlameOpacity[i] = 0;
    }
    for (let i = 0; i < maxSmoke; i++) {
        smokeMesh.setMatrixAt(i, hideMatrix);
        aSmokeOpacity[i] = 0;
    }

    interface Trail {
        pos: THREE.Vector3;
        vel: THREE.Vector3;
        scale: number;
        maxScale: number;
        age: number;
        life: number;
        rotation: number;
        rotVel: number;
    }

    const flames: Trail[] = [];
    const smokes: Trail[] = [];

    let age = 0;
    const flightDuration = 0.85; // Slow down meteor fall rate (was 0.45)
    let spawnAccumulator = 0;
    const spawnRate = 25; // particles per second
    let exploded = false;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / flightDuration);
            const et = easeOutQuad(t);
            const cq = camera.quaternion;

            const pos = new THREE.Vector3().lerpVectors(start, end, et);

            if (!exploded) {
                coreMesh.quaternion.copy(cq);
                wrapMesh.quaternion.copy(cq);
                wrapMesh.rotation.z += 0.15;
                coreMesh.position.copy(pos);
                wrapMesh.position.copy(pos);
            }

            if (t >= 1 && !exploded) {
                exploded = true;
                scene.remove(coreMesh);
                scene.remove(wrapMesh);
                spawnGasExplosionFX(scene, end, team);
            }

            // Spawn trails while meteor is in flight
            if (t < 1) {
                spawnAccumulator += delta * spawnRate;
                while (spawnAccumulator >= 1.0) {
                    spawnAccumulator -= 1.0;

                    // Spawn blue flame trail
                    if (flames.length < maxFlame) {
                        flames.push({
                            pos: pos
                                .clone()
                                .add(
                                    new THREE.Vector3(
                                        (Math.random() - 0.5) * 0.4,
                                        (Math.random() - 0.5) * 0.4,
                                        (Math.random() - 0.5) * 0.4,
                                    ),
                                ),
                            vel: new THREE.Vector3(
                                (Math.random() - 0.5) * 0.5,
                                0.5 + Math.random() * 0.5,
                                (Math.random() - 0.5) * 0.5,
                            ),
                            scale: 0.2,
                            maxScale: 1.2 + Math.random() * 0.4,
                            age: 0,
                            life: 0.4,
                            rotation: Math.random() * Math.PI * 2,
                            rotVel: (Math.random() - 0.5) * 2,
                        });
                    }

                    // Spawn blue smoke trail
                    if (smokes.length < maxSmoke) {
                        smokes.push({
                            pos: pos
                                .clone()
                                .add(
                                    new THREE.Vector3(
                                        (Math.random() - 0.5) * 0.5,
                                        (Math.random() - 0.5) * 0.5,
                                        (Math.random() - 0.5) * 0.5,
                                    ),
                                ),
                            vel: new THREE.Vector3(
                                (Math.random() - 0.5) * 0.8,
                                1.0 + Math.random() * 1.0,
                                (Math.random() - 0.5) * 0.8,
                            ),
                            scale: 0.3,
                            maxScale: 1.5 + Math.random() * 0.5,
                            age: 0,
                            life: 0.6,
                            rotation: Math.random() * Math.PI * 2,
                            rotVel: (Math.random() - 0.5) * 1.0,
                        });
                    }
                }
            }

            // Cleanup when flight is done and all trails are dead
            if (t >= 1 && flames.length === 0 && smokes.length === 0) {
                scene.remove(flameMesh);
                scene.remove(smokeMesh);
                releasePooledMaterial(coreMat);
                releasePooledMaterial(wrapMat);
                flameMesh.dispose();
                smokeMesh.dispose();
                // ShaderMaterials are cached, do NOT dispose
                return false;
            }

            // Update and render active flames
            for (let i = flames.length - 1; i >= 0; i--) {
                const p = flames[i];
                p.age += delta;
                if (p.age >= p.life) {
                    flames.splice(i, 1);
                    continue;
                }
                const tp = p.age / p.life;
                p.pos.addScaledVector(p.vel, delta);
                p.scale = THREE.MathUtils.lerp(
                    p.maxScale * 0.2,
                    p.maxScale,
                    tp,
                );
                p.rotation += p.rotVel * delta;
            }

            for (let i = 0; i < maxFlame; i++) {
                if (i < flames.length) {
                    const p = flames[i];
                    const tp = p.age / p.life;
                    _tempObj.position.copy(p.pos);
                    _tempObj.quaternion.copy(cq);
                    _tempObj.rotateZ(p.rotation);
                    _tempObj.scale.setScalar(p.scale);
                    _tempObj.updateMatrix();

                    flameMesh.setMatrixAt(i, _tempObj.matrix);
                    aFlameOpacity[i] = 1 - easeOutQuad(tp);
                } else {
                    flameMesh.setMatrixAt(i, hideMatrix);
                    aFlameOpacity[i] = 0;
                }
            }
            flameMesh.instanceMatrix.needsUpdate = true;
            (
                flameMesh.geometry.attributes
                    .aOpacity as THREE.InstancedBufferAttribute
            ).needsUpdate = true;

            // Update and render active smoke
            for (let i = smokes.length - 1; i >= 0; i--) {
                const p = smokes[i];
                p.age += delta;
                if (p.age >= p.life) {
                    smokes.splice(i, 1);
                    continue;
                }
                const tp = p.age / p.life;
                p.pos.addScaledVector(p.vel, delta);
                p.scale = THREE.MathUtils.lerp(
                    p.maxScale * 0.3,
                    p.maxScale,
                    tp,
                );
                p.rotation += p.rotVel * delta;
            }

            for (let i = 0; i < maxSmoke; i++) {
                if (i < smokes.length) {
                    const p = smokes[i];
                    const tp = p.age / p.life;
                    _tempObj.position.copy(p.pos);
                    _tempObj.quaternion.copy(cq);
                    _tempObj.rotateZ(p.rotation);
                    _tempObj.scale.setScalar(p.scale);
                    _tempObj.updateMatrix();

                    smokeMesh.setMatrixAt(i, _tempObj.matrix);
                    aSmokeOpacity[i] = 0.5 * (1 - easeOutQuad(tp));
                    aSmokeFrameIdx[i] = Math.min(3, Math.floor(tp * 4));
                } else {
                    smokeMesh.setMatrixAt(i, hideMatrix);
                    aSmokeOpacity[i] = 0;
                }
            }
            smokeMesh.instanceMatrix.needsUpdate = true;
            (
                smokeMesh.geometry.attributes
                    .aFrameIdx as THREE.InstancedBufferAttribute
            ).needsUpdate = true;
            (
                smokeMesh.geometry.attributes
                    .aOpacity as THREE.InstancedBufferAttribute
            ).needsUpdate = true;
            return true;
        },
    });
}

export function spawnDoubleShotFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    isTurret?: boolean,
    team?: number,
) {
    const start = new THREE.Vector3(fx, fy, fz);
    const end = new THREE.Vector3(tx, ty, tz);
    const isBlue = team === 1;

    if (isTurret) {
        // --- 1. LUXURIOUS MUZZLE FLASH ---
        const flareGeo = pooledPlane(1.8, 1.8);
        const flareMat = new THREE.MeshBasicMaterial({
            map: lightTex,
            color: isBlue ? 0x00dfff : 0xffaa00,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const flareMesh = new THREE.Mesh(flareGeo, flareMat);
        flareMesh.position.copy(start);
        scene.add(flareMesh);

        const ringGeo = pooledPlane(1.2, 1.2);
        const ringMat = new THREE.MeshBasicMaterial({
            map: circleTex,
            color: isBlue ? 0x0066ff : 0xff6600,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(start);
        ringMesh.rotation.x = -Math.PI / 2;
        scene.add(ringMesh);

        // --- 2. SCI-FI LASER BEAM (INSTANT TRACER BOLT) ---
        const dir = new THREE.Vector3().subVectors(end, start);
        const dist = dir.length();
        const mid = new THREE.Vector3()
            .addVectors(start, end)
            .multiplyScalar(0.5);

        // White core cylinder
        const coreGeo = new THREE.CylinderGeometry(0.04, 0.04, dist, 6);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);

        // Neon orange/red outer aura cylinder
        const glowGeo = new THREE.CylinderGeometry(0.18, 0.18, dist, 6);
        const glowMat = new THREE.MeshBasicMaterial({
            color: isBlue ? 0x0044ff : 0xff3300,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);

        // Create laser group and rotate to point from start to end
        const laserGroup = new THREE.Group();
        laserGroup.add(coreMesh);
        laserGroup.add(glowMesh);

        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(
            up,
            dir.clone().normalize(),
        );

        laserGroup.position.copy(mid);
        laserGroup.quaternion.copy(quat);
        scene.add(laserGroup);

        // --- 3. SPECTACULAR IMPACT SHOCKWAVE ---
        const shockGeo = pooledPlane(1.5, 1.5);
        const shockMat = new THREE.MeshBasicMaterial({
            map: circleTex,
            color: isBlue ? 0x0044ff : 0xff3300,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const shockMesh = new THREE.Mesh(shockGeo, shockMat);
        shockMesh.position.copy(end).y += 0.05;
        shockMesh.rotation.x = -Math.PI / 2;
        scene.add(shockMesh);

        const flashGeo = pooledPlane(3.0, 3.0);
        const flashMat = new THREE.MeshBasicMaterial({
            map: lightTex,
            color: isBlue ? 0x00aaff : 0xffaa44,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const flashMesh = new THREE.Mesh(flashGeo, flashMat);
        flashMesh.position.copy(end);
        scene.add(flashMesh);

        // Sparks explosion
        spawnExplosion(scene, end, isBlue ? 0x0088ff : 0xff7700, 36, 0.5);

        let age = 0;
        const duration = 0.16; // 160ms lifetime for the laser flash
        activeFX.push({
            update(delta) {
                age += delta;
                const t = Math.min(1, age / duration);
                if (t >= 1) {
                    scene.remove(flareMesh);
                    scene.remove(ringMesh);
                    scene.remove(laserGroup);
                    scene.remove(shockMesh);
                    scene.remove(flashMesh);

                    flareMat.dispose();
                    ringMat.dispose();
                    coreGeo.dispose();
                    coreMat.dispose();
                    glowGeo.dispose();
                    glowMat.dispose();
                    shockMat.dispose();
                    flashMat.dispose();
                    return false;
                }

                // Fade muzzle flash
                flareMesh.scale.setScalar(0.4 + t * 2.2);
                flareMesh.quaternion.copy(camera.quaternion);
                flareMat.opacity = 1 - easeOutCubic(t);

                ringMesh.scale.setScalar(0.5 + t * 3.0);
                ringMat.opacity = 0.8 * (1 - easeOutQuad(t));

                // Fade & shrink laser beam
                coreMat.opacity = 1.0 - t;
                glowMat.opacity = 0.8 * (1.0 - t);
                const scaleX = 1.0 - t * 0.7;
                laserGroup.scale.set(scaleX, 1.0, scaleX);

                // Expand ground shockwave
                shockMesh.scale.setScalar(1.0 + t * 4.0);
                shockMat.opacity = 1.0 - easeOutCubic(t);

                // Fade impact flash
                flashMesh.scale.setScalar(0.5 + t * 2.2);
                flashMesh.quaternion.copy(camera.quaternion);
                flashMat.opacity = 1.0 - easeOutQuad(t);

                return true;
            },
        });
    } else {
        // Regular Archer double shot (moving projectile)
        const shootArrow = (delay: number) => {
            let age = -delay;
            const flight = 0.28;
            let meshGroup: THREE.Group | null = null;
            let glowMat: THREE.MeshBasicMaterial | null = null;

            activeFX.push({
                update(delta) {
                    age += delta;
                    if (age < 0) return true;

                    if (!meshGroup) {
                        meshGroup = new THREE.Group();
                        const geo = new THREE.CylinderGeometry(
                            0.12,
                            0.12,
                            1.2,
                            8,
                        );
                        glowMat = new THREE.MeshBasicMaterial({
                            color: isBlue ? 0x00dfff : 0xffdd44,
                            transparent: true,
                            opacity: 0.9,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false,
                        });
                        const coreMesh = new THREE.Mesh(geo, glowMat);
                        coreMesh.rotateX(Math.PI / 2);
                        meshGroup.add(coreMesh);

                        meshGroup.position.copy(start);
                        meshGroup.lookAt(end);
                        scene.add(meshGroup);
                    }

                    const t = Math.min(1, age / flight);
                    const currentPos = new THREE.Vector3().lerpVectors(
                        start,
                        end,
                        easeOutQuad(t),
                    );
                    meshGroup.position.copy(currentPos);

                    if (t >= 1) {
                        scene.remove(meshGroup);
                        meshGroup.traverse((child) => {
                            if (child instanceof THREE.Mesh) {
                                child.geometry.dispose();
                            }
                        });
                        if (glowMat) glowMat.dispose();

                        spawnExplosion(
                            scene,
                            end,
                            isBlue ? 0x0088ff : 0xffbb44,
                            8,
                            0.12,
                        );
                        return false;
                    }
                    return true;
                },
            });
        };

        shootArrow(0);
        shootArrow(0.12);
    }
}

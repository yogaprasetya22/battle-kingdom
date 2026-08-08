/**
 * SkillFX_Projectiles.ts — Arrow Volley, Fireball, Double Shot, Basic Attack
 * Extracted untuk mengurangi memory pressure selama type checking
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import {
    easeOutCubic,
    easeOutQuad,
    easeOutBack,
    pooledPlane,
    starTex,
    circleTex,
    sparkTex,
    fireTex,
    flameTex,
    lightTex,
    activeFX,
    fxQualityScale,
    _tempObj,
    spawnExplosion,
} from "./FXCore";

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
) {
    const dir = new THREE.Vector3(tx - fx, 0, tz - fz).normalize();
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 1).normalize();
    const start = new THREE.Vector3(tx - dir.x * 4, fy + 9, tz - dir.z * 4);
    const end = new THREE.Vector3(tx, ty, tz);

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

            if (t < 1) {
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
                spawnExplosion(scene, end, 0xff6600, 20, 0.3);
                return false;
            }
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
) {
    const start = new THREE.Vector3(fx, fy, fz);
    const end = new THREE.Vector3(tx, ty, tz);

    if (isTurret) {
        // --- 1. LUXURIOUS MUZZLE FLASH ---
        const flareGeo = pooledPlane(1.8, 1.8);
        const flareMat = new THREE.MeshBasicMaterial({
            map: lightTex,
            color: 0xffaa00,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const flareMesh = new THREE.Mesh(flareGeo, flareMat);
        flareMesh.position.copy(start);
        scene.add(flareMesh);

        const ringGeo = pooledPlane(1.2, 1.2);
        const ringMat = new THREE.MeshBasicMaterial({
            map: circleTex,
            color: 0xff6600,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(start);
        ringMesh.rotation.x = -Math.PI / 2;
        scene.add(ringMesh);

        // --- 2. SCI-FI LASER BEAM (INSTANT TRACER BOLT) ---
        const dir = new THREE.Vector3().subVectors(end, start);
        const dist = dir.length();
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

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
            color: 0xff3300,
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
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        
        laserGroup.position.copy(mid);
        laserGroup.quaternion.copy(quat);
        scene.add(laserGroup);

        // --- 3. SPECTACULAR IMPACT SHOCKWAVE ---
        const shockGeo = pooledPlane(1.5, 1.5);
        const shockMat = new THREE.MeshBasicMaterial({
            map: circleTex,
            color: 0xff3300,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const shockMesh = new THREE.Mesh(shockGeo, shockMat);
        shockMesh.position.copy(end).y += 0.05;
        shockMesh.rotation.x = -Math.PI / 2;
        scene.add(shockMesh);

        const flashGeo = pooledPlane(3.0, 3.0);
        const flashMat = new THREE.MeshBasicMaterial({
            map: lightTex,
            color: 0xffaa44,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const flashMesh = new THREE.Mesh(flashGeo, flashMat);
        flashMesh.position.copy(end);
        scene.add(flashMesh);

        // Sparks explosion
        spawnExplosion(scene, end, 0xff7700, 36, 0.5);

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
            }
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
                        const geo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8);
                        glowMat = new THREE.MeshBasicMaterial({
                            color: 0xffdd44,
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
                    const currentPos = new THREE.Vector3().lerpVectors(start, end, easeOutQuad(t));
                    meshGroup.position.copy(currentPos);

                    if (t >= 1) {
                        scene.remove(meshGroup);
                        meshGroup.traverse((child) => {
                            if (child instanceof THREE.Mesh) {
                                child.geometry.dispose();
                            }
                        });
                        if (glowMat) glowMat.dispose();

                        spawnExplosion(scene, end, 0xffbb44, 8, 0.12);
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

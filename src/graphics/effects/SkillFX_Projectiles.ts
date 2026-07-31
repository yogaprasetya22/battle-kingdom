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

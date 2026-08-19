/**
 * SkillFX_Lightning.ts — Chain Lightning & basic projectile effects
 * Extracted to reduce SkillFX.ts size and improve type checking performance
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import { easeOutCubic, easeOutQuad, activeFX, spawnExplosion } from "./FXCore";

export function spawnLightningFX(
    scene: THREE.Scene,
    points: THREE.Vector3[],
    team?: number,
): void {
    if (points.length < 2) return;

    const SEGMENTS = 8;
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
    const jointPositions: THREE.Vector3[] = [];

    for (let pi = 0; pi < points.length - 1; pi++) {
        const from = points[pi].clone();
        from.y += 1.0;
        const to = points[pi + 1].clone();
        to.y += 1.0;

        let lastPt = from.clone();
        jointPositions.push(from.clone());

        for (let s = 1; s <= SEGMENTS; s++) {
            const t = s / SEGMENTS;
            const lx = from.x + (to.x - from.x) * t;
            const ly = from.y + (to.y - from.y) * t;
            const lz = from.z + (to.z - from.z) * t;
            const jx = s === SEGMENTS ? 0 : (Math.random() - 0.5) * 0.7;
            const jy = s === SEGMENTS ? 0 : (Math.random() - 0.5) * 0.5;
            const jz = s === SEGMENTS ? 0 : (Math.random() - 0.5) * 0.7;
            const nextPt = new THREE.Vector3(lx + jx, ly + jy, lz + jz);

            if (s < SEGMENTS) {
                jointPositions.push(nextPt.clone());
            }

            const dist = lastPt.distanceTo(nextPt);
            // Petir lebih tebal dan megah
            const geo = new THREE.CylinderGeometry(0.09, 0.09, dist, 4);
            cylinderGeoPool.push(geo);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
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
        jointPositions.push(to.clone());
        spawnExplosion(scene, to, colorSpark, 10, 0.1);
    }

    // Instanced glow particles at each joint/bend of the lightning bolts
    const glowCount = jointPositions.length;
    const glowGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: colorLightning,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    // Re-use an instanced mesh to render all joint glows efficiently
    const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, glowCount);
    glowMesh.frustumCulled = false;
    scene.add(glowMesh);

    const tempObj = new THREE.Object3D();
    for (let i = 0; i < glowCount; i++) {
        tempObj.position.copy(jointPositions[i]);
        tempObj.scale.setScalar(0.8 + Math.random() * 0.4);
        tempObj.updateMatrix();
        glowMesh.setMatrixAt(i, tempObj.matrix);
    }
    glowMesh.instanceMatrix.needsUpdate = true;

    let age = 0;
    const duration = 0.25;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                meshes.forEach((m) => scene.remove(m));
                scene.remove(glowMesh);
                cylinderGeoPool.forEach((g) => g.dispose());
                glowGeo.dispose();
                glowMat.dispose();
                mat.dispose();
                return false;
            }

            // Flicker effect to mimic real lightning dynamics
            const flicker = Math.random() > 0.3 ? 1.0 : 0.2;
            const alpha = 0.95 * (1 - t) * flicker;
            mat.opacity = alpha;
            glowMat.opacity = alpha * 0.9;

            const scale = (0.85 + Math.random() * 0.3) * (1 - t * 0.5);
            meshes.forEach((m) => {
                m.scale.set(scale, 1.0, scale);
            });

            // Make joint glows pulsate dynamically
            const cq = camera.quaternion;
            for (let i = 0; i < glowCount; i++) {
                tempObj.position.copy(jointPositions[i]);
                tempObj.quaternion.copy(cq);
                tempObj.scale.setScalar((1.0 + Math.sin(age * 50 + i) * 0.2) * (1 - t));
                tempObj.updateMatrix();
                glowMesh.setMatrixAt(i, tempObj.matrix);
            }
            glowMesh.instanceMatrix.needsUpdate = true;

            return true;
        },
    });
}

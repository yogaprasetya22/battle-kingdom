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

            const dist = lastPt.distanceTo(nextPt);
            const geo = new THREE.CylinderGeometry(0.06, 0.06, dist, 4);
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
        spawnExplosion(scene, to, colorSpark, 10, 0.1);
    }

    let age = 0;
    const duration = 0.25;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                meshes.forEach((m) => scene.remove(m));
                cylinderGeoPool.forEach((g) => g.dispose());
                mat.dispose();
                return false;
            }

            const flicker = Math.random() > 0.35 ? 1.0 : 0.15;
            mat.opacity = 0.95 * (1 - t) * flicker;

            const scale = 0.85 + Math.random() * 0.3;
            meshes.forEach((m) => {
                m.scale.set(scale, 1.0, scale);
            });

            return true;
        },
    });
}

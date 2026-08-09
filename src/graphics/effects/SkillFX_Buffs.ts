/**
 * SkillFX_Buffs.ts — Buff/Aura effects: Iron Fortitude, Frost Nova, Divine Shield, Holy Sanctuary
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import {
    easeOutCubic,
    pooledPlane,
    pooledRing,
    getPooledMaterial,
    releasePooledMaterial,
    star2Tex,
    smokeTex,
    activeFX,
    fxQualityScale,
    _tempObj,
    getCamQuad,
} from "./FXCore";

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

            ring.position.y = y + 0.05 + et * 3.0;
            ring.scale.setScalar(1 + et * 1.5);
            ring.rotation.z += 0.02;
            ringMat.opacity = 1.0 * (1 - et) * (1 - et);

            ring2.position.y = y + 0.07 + et * 4.5;
            ring2.scale.setScalar(1 + et * 1.2);
            ring2.rotation.z -= 0.06;
            ring2Mat.opacity = 0.85 * (1 - et) * (1 - et);

            ring3.position.y = y + 0.08 + et * 5.5;
            ring3.scale.setScalar(1 + et * 0.8);
            ring3.rotation.z += 0.1;
            ring3Mat.opacity = 0.9 * (1 - et) * (1 - et);

            glyph.position.y = y + 0.09 + et * 2.0;
            glyph.rotation.z += 0.04;
            glyph.scale.setScalar(1 + Math.sin(t * Math.PI) * 1.0);
            glyphMat.opacity = 0.8 * Math.sin(t * Math.PI);

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

export function spawnFrostNovaBurstFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    team?: number,
) {
    const isBlue = team === 1;
    const colorRing = isBlue ? 0x55ccff : 0xff7744;
    const colorInner = isBlue ? 0xaae8ff : 0xffccaa;
    const colorSpike = isBlue ? 0x88e0ff : 0xffaa66;
    const colorMist = isBlue ? 0x88ccff : 0xff9977;

    const ringGeo = new THREE.RingGeometry(0.15, 0.25, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: colorRing,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.04, z);
    scene.add(ring);

    const innerGeo = new THREE.RingGeometry(0.05, 0.12, 24);
    const innerMat = new THREE.MeshBasicMaterial({
        color: colorInner,
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

    const SPIKE = 10;
    const spikeGeo = new THREE.ConeGeometry(0.1, 1.0, 4);
    const spikeMat = new THREE.MeshBasicMaterial({
        color: colorSpike,
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

    const mistGeo = pooledPlane(0.6, 0.6);
    const mistMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        color: colorMist,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
    });
    const mists: THREE.Mesh[] = [];
    const mistVels: THREE.Vector3[] = [];
    const MISTS = Math.round(8 * fxQualityScale());
    for (let i = 0; i < MISTS; i++) {
        const m = new THREE.Mesh(mistGeo, mistMat);
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

export function spawnDivineShieldFX(
    scene: THREE.Scene,
    targetPos: THREE.Vector3,
    team?: number,
) {
    const isBlue = team === 1;
    const colorRing = isBlue ? 0x00dfff : 0xffd700;
    const colorPillar = isBlue ? 0xaae8ff : 0xffdf80;
    const colorRune = isBlue ? 0xeef9ff : 0xffe066;

    const ringGeo = new THREE.RingGeometry(0.3, 1.1, 48, 1, 0, Math.PI * 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: colorRing,
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

    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.5, 3.5, 16, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
        color: colorPillar,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(targetPos.x, targetPos.y + 1.75, targetPos.z);
    scene.add(pillar);

    const runeCount = 10;
    const runeGeo = new THREE.DodecahedronGeometry(0.05);
    const runeMat = new THREE.MeshBasicMaterial({
        color: colorRune,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const runes: THREE.Mesh[] = [];

    for (let i = 0; i < runeCount; i++) {
        const r = new THREE.Mesh(runeGeo, runeMat);
        r.position.copy(targetPos).add(new THREE.Vector3(0, 0.5, 0));
        scene.add(r);
        runes.push(r);
    }

    let age = 0;
    const duration = 0.7;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);

            if (t >= 1) {
                scene.remove(ring);
                scene.remove(pillar);
                runes.forEach((r) => scene.remove(r));
                ringGeo.dispose();
                ringMat.dispose();
                pillarGeo.dispose();
                pillarMat.dispose();
                runeGeo.dispose();
                runeMat.dispose();
                return false;
            }

            ring.scale.setScalar(1 + t * 1.5);
            ring.rotation.z += 0.03;
            ringMat.opacity = 0.9 * (1 - t);

            pillar.scale.setScalar(1 + t * 0.5);
            pillarMat.opacity = 0.6 * (1 - t);

            for (let i = 0; i < runeCount; i++) {
                const angle = (i / runeCount) * Math.PI * 2 + age * 2;
                const radius = 0.4 + Math.sin(age * 3 + i) * 0.2;
                const height = 0.5 + Math.cos(age * 2.5 + i) * 0.3;
                runes[i].position.set(
                    targetPos.x + Math.cos(angle) * radius,
                    targetPos.y + height,
                    targetPos.z + Math.sin(angle) * radius,
                );
                runes[i].scale.setScalar((1 - t) * 0.8);
            }

            return true;
        },
    });
}

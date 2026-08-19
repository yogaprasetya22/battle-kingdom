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
    const colorRing = isBlue ? 0x00dfff : 0xffaa44;
    const colorInner = isBlue ? 0xaae8ff : 0xffccaa;
    const colorSpike = isBlue ? 0x88e0ff : 0xffaa66;
    const colorMist = isBlue ? 0x88ccff : 0xff9977;

    // Ring visual
    const ringGeo = pooledRing(0.15, 0.25, 32);
    const ringMat = getPooledMaterial({
        color: colorRing,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.04, z);
    scene.add(ring);

    // Inner glow
    const innerGeo = pooledRing(0.05, 0.12, 24);
    const innerMat = getPooledMaterial({
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

    // High-end instanced shards
    const shardCount = 20;
    const shardGeo = new THREE.DodecahedronGeometry(0.2, 0);
    const shardMat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(colorSpike) },
        },
        vertexShader: `
            attribute float aOpacity;
            varying float vOpacity;
            void main() {
                vOpacity = aOpacity;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            varying float vOpacity;
            void main() {
                gl_FragColor = vec4(uColor * 1.5, vOpacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, shardCount);
    shardMesh.frustumCulled = false;
    scene.add(shardMesh);

    const aShardOpacity = new Float32Array(shardCount);
    shardMesh.geometry.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(aShardOpacity, 1));

    const shardOffsets: THREE.Vector3[] = [];
    const shardVels: THREE.Vector3[] = [];
    const shardScales: number[] = [];
    for (let i = 0; i < shardCount; i++) {
        const angle = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const dist = 0.5 + Math.random() * 1.5;
        shardOffsets.push(new THREE.Vector3(x + Math.cos(angle) * dist, y - 0.2, z + Math.sin(angle) * dist));
        shardVels.push(new THREE.Vector3((Math.random() - 0.5) * 0.4, 2.0 + Math.random() * 2.0, (Math.random() - 0.5) * 0.4));
        shardScales.push(0.5 + Math.random() * 0.8);
    }

    // Swirling mist using instanced texture loader (reusing smokeTex)
    const mistCount = 12;
    const mistGeo = pooledPlane(0.8, 0.8);
    const mistMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        color: colorMist,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const mistMesh = new THREE.InstancedMesh(mistGeo, mistMat, mistCount);
    mistMesh.frustumCulled = false;
    scene.add(mistMesh);

    const mistPositions: THREE.Vector3[] = [];
    const mistVels: THREE.Vector3[] = [];
    const mistScales: number[] = [];
    for (let i = 0; i < mistCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 2.0;
        mistPositions.push(new THREE.Vector3(x + Math.cos(angle) * dist, y + 0.1, z + Math.sin(angle) * dist));
        mistVels.push(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5));
        mistScales.push(1.0 + Math.random() * 1.0);
    }

    let age = 0;
    const duration = 0.85;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);
            if (t >= 1) {
                scene.remove(ring);
                scene.remove(inner);
                scene.remove(shardMesh);
                scene.remove(mistMesh);
                releasePooledMaterial(ringMat);
                releasePooledMaterial(innerMat);
                shardGeo.dispose();
                shardMat.dispose();
                mistMesh.dispose();
                return false;
            }

            const s = 1 + t * 15;
            ring.scale.set(s, s, 1);
            ringMat.opacity = 0.95 * (1 - t);

            const si = 1 + t * 8;
            inner.scale.set(si, si, 1);
            inner.rotation.z += 0.04;
            innerMat.opacity = 0.8 * (1 - t);

            // Update shard positions and matrices
            const cq = camera.quaternion;
            for (let i = 0; i < shardCount; i++) {
                const p = shardOffsets[i];
                const vel = shardVels[i];
                vel.y -= 9.8 * delta; // gravity drop
                p.addScaledVector(vel, delta);

                _tempObj.position.copy(p);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(shardScales[i] * Math.sin(t * Math.PI));
                _tempObj.updateMatrix();
                shardMesh.setMatrixAt(i, _tempObj.matrix);
                aShardOpacity[i] = (1 - t);
            }
            shardMesh.instanceMatrix.needsUpdate = true;
            (shardMesh.geometry.getAttribute("aOpacity") as THREE.InstancedBufferAttribute).needsUpdate = true;

            // Update mist positions and matrices
            for (let i = 0; i < mistCount; i++) {
                const p = mistPositions[i];
                p.addScaledVector(mistVels[i], delta);

                _tempObj.position.copy(p);
                _tempObj.quaternion.copy(cq);
                _tempObj.scale.setScalar(mistScales[i] * (1.0 + t * 1.5));
                _tempObj.updateMatrix();
                mistMesh.setMatrixAt(i, _tempObj.matrix);
            }
            mistMesh.instanceMatrix.needsUpdate = true;
            mistMat.opacity = 0.5 * (1 - t) * (1 - t);

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

    // Instanced glowing shield shield particles (reusing star2Tex for luxury look)
    const particleCount = 12;
    const particleGeo = pooledPlane(0.4, 0.4);
    const particleMat = new THREE.MeshBasicMaterial({
        map: star2Tex,
        color: colorRune,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    let age = 0;
    const duration = 0.7;
    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);

            if (t >= 1) {
                scene.remove(ring);
                scene.remove(pillar);
                scene.remove(particleMesh);
                ringGeo.dispose();
                ringMat.dispose();
                pillarGeo.dispose();
                pillarMat.dispose();
                particleGeo.dispose();
                particleMat.dispose();
                return false;
            }

            ring.scale.setScalar(1 + t * 1.5);
            ring.rotation.z += 0.03;
            ringMat.opacity = 0.9 * (1 - t);

            pillar.scale.setScalar(1 + t * 0.5);
            pillarMat.opacity = 0.6 * (1 - t);

            // Update orbit particles using billboard rotation
            const cq = camera.quaternion;
            const tempObj = new THREE.Object3D();
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2 + age * 4.5;
                const radius = 0.5 + Math.sin(age * 4.0 + i) * 0.15;
                const height = 0.8 + Math.cos(age * 3.5 + i) * 0.3;
                
                tempObj.position.set(
                    targetPos.x + Math.cos(angle) * radius,
                    targetPos.y + height,
                    targetPos.z + Math.sin(angle) * radius
                );
                tempObj.quaternion.copy(cq);
                tempObj.scale.setScalar((1 - t) * (0.8 + Math.sin(age * 10 + i) * 0.2));
                tempObj.updateMatrix();
                particleMesh.setMatrixAt(i, tempObj.matrix);
            }
            particleMesh.instanceMatrix.needsUpdate = true;
            particleMat.opacity = 0.9 * (1 - t);

            return true;
        },
    });
}

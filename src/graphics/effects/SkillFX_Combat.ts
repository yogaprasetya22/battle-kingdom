/**
 * SkillFX_Combat.ts — Combat effects: Taunt, Shield Bash, Evasive Leap
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import {
    easeOutCubic,
    easeOutBack,
    pooledPlane,
    pooledRing,
    getPooledMaterial,
    releasePooledMaterial,
    sparkTex,
    smokeTex,
    activeFX,
    fxQualityScale,
    _tempObj,
    getCamQuad,
    spawnExplosion,
} from "./FXCore";

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

            sw.scale.setScalar(1 + t * 4);
            swMat.opacity = 1.0 * (1 - t) * (1 - t);

            const s = 1 + et * 4.5;
            ring.scale.set(s, s, 1);
            ring.rotation.z += 0.05;
            ringMat.opacity = (1 - t) * (0.35 + 0.65 * Math.sin(t * 15));

            ring2.scale.set(s * 0.65, s * 0.65, 1);
            ring2.rotation.z -= 0.09;
            ring2Mat.opacity = (1 - t) * (0.3 + 0.7 * Math.sin(t * 11 + 1.5));

            scorch.scale.setScalar(1.0 + t * 0.3);
            scorchMat.opacity = 0.65 * (1 - t);

            icon.position.y = ty + 2.2 + et * 1.5;
            icon.scale.setScalar(1 + et * 0.5);
            icon.rotation.y += 0.015;
            icon.quaternion.copy(camera.quaternion);
            iconMat.opacity = Math.max(0, 1 - t * 1.2);

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

    const flashGeo = pooledPlane(2.5, 2.5);
    const flashMat = getPooledMaterial({
        map: sparkTex,
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

            wave.position.lerpVectors(start, end, et);
            wave.scale.setScalar(0.8 + et * 1.2);
            arcMat.opacity = 0.95 * (1 - et);

            const shockStart = Math.max(0, (t - 0.1) / 0.9);
            shock.scale.setScalar(1 + shockStart * 3.0);
            shockMat.opacity = 0.9 * (1 - shockStart) * (1 - shockStart);

            shock2.scale.setScalar(1 + shockStart * 4.0);
            shock2Mat.opacity = 0.8 * (1 - shockStart) * (1 - shockStart);

            flashMat.opacity = 0.7 * (1 - t) * (1 - t);
            flash.scale.setScalar(0.8 + t * 2);

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
        const m = new THREE.Mesh(smokeGeo, smokeMat);
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

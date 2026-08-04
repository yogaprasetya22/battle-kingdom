/**
 * SkillFX_Misc.ts — Misc effects: Basic Attack, Heal, High Noon, Smoke Bomb, Fan Fire, Shadow Step, Backstab, Poison Blade, Ice Shatter, Holy Sanctuary
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import {
    easeOutCubic,
    easeOutQuad,
    pooledPlane,
    sparkTex,
    smokeTex,
    activeFX,
    canSpawnFX,
    fxQualityScale,
    _tempObj,
    getCamQuad,
    spawnExplosion,
} from "./FXCore";
import { soundFX } from "../core/SoundFX";

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
        soundFX.playSlash(end.x, end.y, end.z, camera.position);
        spawnExplosion(scene, end, 0xffdd66, 6, 0.1);
    } else if (uType === 1) {
        soundFX.playBow(start.x, start.y, start.z, camera.position);
        let age = 0;
        const flight = 0.24;
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
        soundFX.playMagicCast(start.x, start.y, start.z, camera.position);
        let age = 0;
        const flight = 0.35;
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

export function spawnHealFX(
    scene: THREE.Scene,
    start: THREE.Vector3,
    end: THREE.Vector3,
    isRejuvenation: boolean = false,
) {
    const color = isRejuvenation ? 0x00ff88 : 0x33ff66;

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

            mat.opacity = 0.75 * (1.0 - t);
            beam.scale.set(1.0 - t, 1.0, 1.0 - t);

            for (let i = 0; i < sparkles.length; i++) {
                const offsetTime = age + i * (duration / sparkleCount);
                const theta = offsetTime * 14.0;
                const radius = 0.5 * (1.0 - t * 0.7);
                const height = (offsetTime * 2.5) % 2.0;

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

export function spawnHighNoonFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    team?: number,
) {
    const isBlue = team === 1;
    const color = isBlue ? 0x00ffff : 0xffff00;
    spawnExplosion(scene, new THREE.Vector3(tx, ty, tz), color, 15, 0.15);
}

export function spawnSmokeBombFX(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    team?: number,
) {
    const smokeGeo = pooledPlane(0.8, 0.8);
    const smokeMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        color: 0x555555,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
    });

    const SMOKE_COUNT = Math.round(16 * fxQualityScale());
    const positions: THREE.Vector3[] = [];
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < SMOKE_COUNT; i++) {
        positions.push(new THREE.Vector3(x, y, z));
        const a = Math.random() * Math.PI * 2;
        const s = 1.5 + Math.random() * 2;
        velocities.push(
            new THREE.Vector3(
                Math.cos(a) * s,
                0.5 + Math.random() * 1.5,
                Math.sin(a) * s,
            ),
        );
    }

    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
        const m = new THREE.Mesh(smokeGeo, smokeMat);
        m.position.copy(positions[i]);
        m.quaternion.copy(getCamQuad());
        m.scale.setScalar(0.5);
        scene.add(m);
        meshes.push(m);
    }

    let age = 0;
    const duration = 1.2;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);

            if (t >= 1) {
                meshes.forEach((m) => {
                    scene.remove(m);
                    (m.material as THREE.MeshBasicMaterial).dispose();
                });
                smokeMat.dispose();
                return false;
            }

            for (let i = 0; i < SMOKE_COUNT; i++) {
                positions[i].addScaledVector(velocities[i], delta);
                velocities[i].y -= 1.5 * delta;

                meshes[i].position.copy(positions[i]);
                meshes[i].quaternion.copy(camera.quaternion);
                meshes[i].scale.addScalar(delta * 1.5);
                (meshes[i].material as THREE.MeshBasicMaterial).opacity =
                    0.6 * (1 - t);
            }

            return true;
        },
    });
}

export function spawnFanFireFX(
    scene: THREE.Scene,
    x: number,
    z: number,
    groundY: number,
    radius: number,
    team?: number,
): void {
    const isBlue = team === 1;
    const color = isBlue ? 0x0088ff : 0xff8800;

    const COUNT = 40;
    const projectileGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const projectileMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const projectiles = new THREE.InstancedMesh(
        projectileGeo,
        projectileMat,
        COUNT,
    );
    projectiles.frustumCulled = false;
    scene.add(projectiles);

    const data: { angle: number; speed: number; age: number }[] = [];
    for (let k = 0; k < COUNT; k++) {
        const angle = (k / COUNT) * Math.PI * 2;
        data.push({ angle, speed: 3 + Math.random() * 2, age: 0 });
    }

    let age = 0;
    const duration = 1.0;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);

            if (t >= 1) {
                scene.remove(projectiles);
                projectiles.dispose();
                projectileMat.dispose();
                return false;
            }

            for (let k = 0; k < COUNT; k++) {
                const d = data[k];
                const distance = d.speed * age;
                const px = x + Math.cos(d.angle) * distance;
                const py = groundY + 0.5;
                const pz = z + Math.sin(d.angle) * distance;

                _tempObj.position.set(px, py, pz);
                _tempObj.scale.setScalar(1 - t);
                _tempObj.updateMatrix();
                projectiles.setMatrixAt(k, _tempObj.matrix);
            }

            projectiles.instanceMatrix.needsUpdate = true;
            projectileMat.opacity = 0.9 * (1 - t);
            return true;
        },
    });
}

export function spawnShadowStepFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    team?: number,
) {
    const startPos = new THREE.Vector3(fx, fy, fz);
    const endPos = new THREE.Vector3(tx, ty, tz);

    const dashGeo = pooledPlane(0.6, 2.0);
    const dashMat = new THREE.MeshBasicMaterial({
        color: 0x330066,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    const midPos = new THREE.Vector3()
        .copy(startPos)
        .add(endPos)
        .multiplyScalar(0.5);
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.copy(midPos);
    dash.lookAt(endPos);
    dash.rotateX(Math.PI / 2);
    scene.add(dash);

    let age = 0;
    const duration = 0.4;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);

            if (t >= 1) {
                scene.remove(dash);
                dashMat.dispose();
                return false;
            }

            dashMat.opacity = 0.8 * (1 - t);
            dash.scale.setScalar(1 + t * 0.5);
            return true;
        },
    });
}

export function spawnBackstabFX(
    scene: THREE.Scene,
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    team?: number,
) {
    spawnExplosion(scene, new THREE.Vector3(tx, ty, tz), 0xff3333, 8, 0.1);
}

export function spawnPoisonBladeFX(
    scene: THREE.Scene,
    tx: number,
    ty: number,
    tz: number,
) {
    spawnExplosion(scene, new THREE.Vector3(tx, ty, tz), 0x00dd00, 6, 0.12);
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
        const scale = 0.5 + Math.random() * 0.8;
        mesh.scale.set(scale, scale, scale);
        scene.add(mesh);
        meshes.push(mesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = 1.0 + Math.random() * 2.0;
        vels.push(
            new THREE.Vector3(
                Math.cos(angle) * speed,
                2.0 + Math.random() * 2.5,
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
                vel.y -= 9.8 * delta;
                mesh.position.addScaledVector(vel, delta);
                mesh.rotation.x += rotVels[i].x * delta;
                mesh.rotation.y += rotVels[i].y * delta;
                mesh.rotation.z += rotVels[i].z * delta;
                (mesh.material as THREE.MeshStandardMaterial).opacity =
                    0.85 * (1 - t);
            }
            return true;
        },
    });
}

export function spawnHolySanctuaryFX(
    scene: THREE.Scene,
    centerPos: THREE.Vector3,
) {
    const ringGeo = new THREE.RingGeometry(0.4, 1.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(centerPos.x, centerPos.y + 0.02, centerPos.z);
    scene.add(ring);

    const PILLARS = 6;
    const pillars: THREE.Mesh[] = [];
    for (let i = 0; i < PILLARS; i++) {
        const pillarGeo = new THREE.CylinderGeometry(
            0.08,
            0.15,
            2.0,
            8,
            1,
            false,
        );
        const pillarMat = new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        const angle = (i / PILLARS) * Math.PI * 2;
        const radius = 1.0;
        pillar.position.set(
            centerPos.x + Math.cos(angle) * radius,
            centerPos.y + 1.0,
            centerPos.z + Math.sin(angle) * radius,
        );
        scene.add(pillar);
        pillars.push(pillar);
    }

    let age = 0;
    const duration = 1.0;

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1, age / duration);

            if (t >= 1) {
                scene.remove(ring);
                pillars.forEach((p) => scene.remove(p));
                ringGeo.dispose();
                ringMat.dispose();
                pillars.forEach((p) => {
                    (p.material as THREE.MeshBasicMaterial).dispose();
                    p.geometry.dispose();
                });
                return false;
            }

            ring.scale.setScalar(1 + t * 1.5);
            ring.rotation.z += 0.02;
            ringMat.opacity = 0.8 * (1 - t);

            for (let i = 0; i < pillars.length; i++) {
                pillars[i].scale.setScalar(1 + Math.sin(t * Math.PI) * 0.3);
                (pillars[i].material as THREE.MeshBasicMaterial).opacity =
                    0.7 * (1 - t);
            }

            return true;
        },
    });
}

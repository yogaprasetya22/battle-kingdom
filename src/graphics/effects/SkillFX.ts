/**
 * SkillFX.ts — Luxury skill effects with geometry pooling, easing curves, screen shake.
 *
 * ponytail: camera imported directly (no scene.getObjectByName perf hit),
 * shared geo pool avoids new/dispose churn, activeFX[] central update retained.
 */

import * as THREE from "three";
import { camera } from "../core/scene";
import { soundFX } from "../core/SoundFX";

// ═══════════════════════════════════════════════════════════════
// Easing curves — cheap math, big visual upgrade
// ═══════════════════════════════════════════════════════════════
function easeOutCubic(t: number): number {
    const u = 1 - t;
    return 1 - u * u * u;
}
function easeOutQuad(t: number): number {
    return t * (2 - t);
}
function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ═══════════════════════════════════════════════════════════════
// Shared geometry pool — reuse PlaneGeometry to avoid GC churn
// ═══════════════════════════════════════════════════════════════
const _geoPool = new Map<string, THREE.PlaneGeometry>();
function pooledPlane(w: number, h: number): THREE.PlaneGeometry {
    const key = `${w.toFixed(2)}x${h.toFixed(2)}`;
    if (!_geoPool.has(key)) _geoPool.set(key, new THREE.PlaneGeometry(w, h));
    return _geoPool.get(key)!;
}

// ═══════════════════════════════════════════════════════════════
// Texture loading — once at module init
// ═══════════════════════════════════════════════════════════════
const texLoader = new THREE.TextureLoader();
const baseUrl = import.meta.env.BASE_URL;
function loadTex(path: string) {
    return texLoader.load(baseUrl + path);
}

const starTex = loadTex("particle-pack/PNG (Transparent)/star_05.png");
const circleTex = loadTex("particle-pack/PNG (Transparent)/circle_03.png");
const sparkTex = loadTex("particle-pack/PNG (Transparent)/spark_04.png");
const smokeTex = loadTex("particle-pack/PNG (Transparent)/smoke_04.png");

const fireTex = loadTex("particle-pack/PNG (Transparent)/fire_01.png");
const flameTex = loadTex("particle-pack/PNG (Transparent)/flame_01.png");
const scorchTex = loadTex("particle-pack/PNG (Transparent)/scorch_01.png");
const lightTex = loadTex("particle-pack/PNG (Transparent)/light_02.png");
const magicTex = loadTex("particle-pack/PNG (Transparent)/magic_01.png");
const star2Tex = loadTex("particle-pack/PNG (Transparent)/star_08.png");

// ═══════════════════════════════════════════════════════════════
// Shared uniform for shader-based effects
// ═══════════════════════════════════════════════════════════════
export const effectUniforms = { uTime: { value: 0 } };

// Generic MeshBasicMaterial pool to avoid GPU compile & GC memory churn
interface MatSpecs {
    color?: number;
    map?: THREE.Texture | null;
    transparent?: boolean;
    opacity?: number;
    blending?: THREE.Blending;
    depthWrite?: boolean;
    depthTest?: boolean;
    side?: THREE.Side;
}
const _matPool = new Map<string, THREE.MeshBasicMaterial[]>();
function getPooledMaterial(specs: MatSpecs): THREE.MeshBasicMaterial {
    const mapKey = specs.map ? specs.map.uuid : "none";
    const key = `${specs.color ?? 0xffffff}_${mapKey}_${specs.transparent ?? false}_${specs.blending ?? THREE.NormalBlending}_${specs.depthWrite ?? true}_${specs.depthTest ?? true}_${specs.side ?? THREE.FrontSide}`;
    
    let list = _matPool.get(key);
    if (!list) {
        list = [];
        _matPool.set(key, list);
    }
    
    if (list.length > 0) {
        const mat = list.pop()!;
        if (specs.opacity !== undefined) mat.opacity = specs.opacity;
        return mat;
    }
    
    return new THREE.MeshBasicMaterial({
        color: specs.color,
        map: specs.map,
        transparent: specs.transparent,
        opacity: specs.opacity,
        blending: specs.blending,
        depthWrite: specs.depthWrite,
        depthTest: specs.depthTest,
        side: specs.side
    });
}
function releasePooledMaterial(mat: THREE.MeshBasicMaterial) {
    const mapKey = mat.map ? mat.map.uuid : "none";
    const key = `${mat.color.getHex()}_${mapKey}_${mat.transparent}_${mat.blending}_${mat.depthWrite}_${mat.depthTest}_${mat.side}`;
    
    let list = _matPool.get(key);
    if (!list) {
        list = [];
        _matPool.set(key, list);
    }
    if (list.length < 40) {
        list.push(mat);
    } else {
        mat.dispose();
    }
}


// ═══════════════════════════════════════════════════════════════
// Material factories for vertex effects (Iron Fortitude, Frost Nova)
// ═══════════════════════════════════════════════════════════════
export function createIronFortitudeMat(
    baseColor: THREE.Color,
): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.2,
        metalness: 0.8,
    });
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uEffectTime = effectUniforms.uTime;
        shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            `float p = sin(uEffectTime * 5.0) * 0.5 + 0.5;
transformed += objectNormal * p * 0.18;
#include <project_vertex>`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <dithering_fragment>",
            `float fp = sin(uEffectTime * 5.0) * 0.5 + 0.5;
gl_FragColor.rgb += vec3(1.0, 0.55, 0.0) * fp * 1.1;
#include <dithering_fragment>`,
        );
    };
    return mat;
}

export function createFrostNovaMat(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x33aaff),
        roughness: 0.05,
        metalness: 0.1,
        emissive: new THREE.Color(0x0033cc),
        emissiveIntensity: 0.7,
    });
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uEffectTime = effectUniforms.uTime;
        shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            `float len = length(transformed);
float n = sin(len * 12.0 + uEffectTime * 3.0) * 0.5 + 0.5;
transformed += objectNormal * n * 0.22;
#include <project_vertex>`,
        );
    };
    return mat;
}

// ═══════════════════════════════════════════════════════════════
// Central FX update list + budget
// ═══════════════════════════════════════════════════════════════
// ponytail: 500v500 fires ~5x more skills/sec — tighter budget & steeper quality falloff
const MAX_FX_HARSH = 20;
export const activeFX: Array<{ update: (delta: number) => boolean }> = [];
export function updateFX(delta: number) {
    for (let i = activeFX.length - 1; i >= 0; i--) {
        if (!activeFX[i].update(delta)) activeFX.splice(i, 1);
    }
}
export function canSpawnFX(): boolean {
    return activeFX.length < MAX_FX_HARSH;
}
/** Scale particle count when busy: <5 FX = 1.0, 5-12 FX = 0.4, >12 FX = 0.15 */
export function fxQualityScale(): number {
    const n = activeFX.length;
    if (n < 5)  return 1.0;
    if (n < 12) return 0.4;
    return 0.15;
}

// Pooled ring geometry — reuse for tank rings
const _ringGeoPool = new Map<string, THREE.RingGeometry>();
function pooledRing(inner: number, outer: number, segs: number, thetaStart = 0, thetaLength = Math.PI * 2): THREE.RingGeometry {
    const key = `${inner.toFixed(2)}_${outer.toFixed(2)}_${segs}_${thetaStart.toFixed(2)}_${thetaLength.toFixed(2)}`;
    if (!_ringGeoPool.has(key)) _ringGeoPool.set(key, new THREE.RingGeometry(inner, outer, segs, 1, thetaStart, thetaLength));
    return _ringGeoPool.get(key)!;
}

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

// ═══════════════════════════════════════════════════════════════
// Reusable helpers
// ═══════════════════════════════════════════════════════════════
const _camQuad = new THREE.Quaternion();
const _tempObj = new THREE.Object3D();
function getCamQuad(): THREE.Quaternion {
    _camQuad.copy(camera.quaternion);
    return _camQuad;
}

// Screen flash overlay — huge billboard flash at position
function spawnScreenFlash(
    scene: THREE.Scene,
    pos: THREE.Vector3,
    color: number,
    size: number,
): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
        map: lightTex,
        color,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.quaternion.copy(getCamQuad());
    scene.add(mesh);
    return mesh;
}

// ═══════════════════════════════════════════════════════════════
// 1. Generic Explosion — shared material, no clone, quality-scaled
// ═══════════════════════════════════════════════════════════════
function spawnExplosion(
    scene: THREE.Scene,
    pos: THREE.Vector3,
    color: number,
    count: number = 20,
    size: number = 0.25,
) {
    const qScale = fxQualityScale();
    const actualCount = Math.max(4, Math.round(count * qScale));
    if (!canSpawnFX()) return;

    const geo = pooledPlane(size, size);
    const mat = new THREE.MeshBasicMaterial({
        map: sparkTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const instancedMesh = new THREE.InstancedMesh(geo, mat, actualCount);
    instancedMesh.frustumCulled = false;
    scene.add(instancedMesh);

    const positions: THREE.Vector3[] = [];
    const velocities: THREE.Vector3[] = [];
    const rotations: number[] = [];

    for (let i = 0; i < actualCount; i++) {
        positions.push(pos.clone());
        rotations.push(Math.random() * Math.PI * 2);
        
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = 1.2 + Math.random() * 2.5;
        velocities.push(
            new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed + 0.7,
                Math.cos(phi) * speed,
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
                scene.remove(instancedMesh);
                instancedMesh.dispose();
                mat.dispose();
                return false;
            }
            const et = easeOutCubic(t);
            mat.opacity = 1 - et;
            
            const cq = camera.quaternion;
            for (let i = 0; i < actualCount; i++) {
                positions[i].addScaledVector(velocities[i], delta);
                
                _tempObj.position.copy(positions[i]);
                _tempObj.quaternion.copy(cq);
                _tempObj.rotateZ(rotations[i]);
                _tempObj.scale.setScalar(1 - et);
                _tempObj.updateMatrix();
                
                instancedMesh.setMatrixAt(i, _tempObj.matrix);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            return true;
        },
    });
}

// ═══════════════════════════════════════════════════════════════
// 2. Chain Lightning — zigzag with intense flicker + hit sparks
// ═══════════════════════════════════════════════════════════════
export function spawnLightningFX(
    scene: THREE.Scene,
    points: THREE.Vector3[],
    team?: number,
): void {
    if (points.length < 2) return;
    soundFX.playLightning(points[0].x, points[0].y, points[0].z, camera.position);
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

            // Create segment cylinder
            const dist = lastPt.distanceTo(nextPt);
            const geo = new THREE.CylinderGeometry(0.06, 0.06, dist, 4); // 4-sided is fast and sharp
            cylinderGeoPool.push(geo);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
            // Position at midpoint
            const mid = new THREE.Vector3().copy(lastPt).add(nextPt).multiplyScalar(0.5);
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
                cylinderGeoPool.forEach((g) => g.dispose());
                mat.dispose();
                return false;
            }

            // Flicker effect: random opacity drops
            const flicker = Math.random() > 0.35 ? 1.0 : 0.15;
            mat.opacity = 0.95 * (1 - t) * flicker;
            
            // Jitter scale slightly to simulate high voltage vibration
            const scale = 0.85 + Math.random() * 0.3;
            meshes.forEach((m) => {
                m.scale.set(scale, 1.0, scale); // jitter thickness only
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
    const colorBeam = isBlue ? 0x44bbff : 0xff7722;
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

    // Light pillar
    const beamGeo = new THREE.CylinderGeometry(
        0.05,
        radius * 0.9,
        8,
        16,
        1,
        true,
    );
    const beamMat = new THREE.MeshBasicMaterial({
        color: colorBeam,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(centerX, groundY + 4.0, centerZ);
    scene.add(beam);

    // Falling stars — instanced
    const COUNT = 60;
    const starGeo = pooledPlane(0.5, 0.5);
    const starMat = new THREE.MeshBasicMaterial({
        map: starTex,
        color: colorStar,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const stars = new THREE.InstancedMesh(starGeo, starMat, COUNT);
    stars.frustumCulled = false;

    const data: {
        ax: number;
        az: number;
        startY: number;
        speed: number;
        rotSpeed: number;
        texIdx: number;
    }[] = [];
    for (let k = 0; k < COUNT; k++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        data.push({
            ax: centerX + Math.cos(angle) * r,
            az: centerZ + Math.sin(angle) * r,
            startY: groundY + 9 + Math.random() * 6,
            speed: 0.14 + Math.random() * 0.12,
            rotSpeed: (Math.random() - 0.5) * 6,
            texIdx: k % 2, // alternate star textures
        });
    }
    scene.add(stars);

    const DURATION = 1.6;
    const startTime = performance.now();

    activeFX.push({
        update(_delta) {
            const elapsed = performance.now() - startTime;
            if (elapsed > DURATION * 1000) {
                scene.remove(stars);
                scene.remove(ring);
                scene.remove(inner);
                scene.remove(beam);
                ringGeo.dispose();
                ringMat.dispose();
                innerGeo.dispose();
                innerMat.dispose();
                beamGeo.dispose();
                beamMat.dispose();
                starGeo.dispose();
                starMat.dispose();
                return false;
            }
            const t = elapsed / (DURATION * 1000);
            const et = easeOutCubic(t);

            ring.rotation.z += 0.02;
            ringMat.opacity = 0.95 * (1 - et);
            inner.rotation.z -= 0.025;
            innerMat.opacity = 0.7 * (1 - et);
            beamMat.opacity = 0.3 * (1 - et);

            const cq = camera.quaternion;
            for (let k = 0; k < COUNT; k++) {
                const d = data[k];
                const ay = Math.max(
                    groundY,
                    d.startY - d.speed * elapsed * 0.08,
                );
                _tempObj.position.set(d.ax, ay, d.az);
                _tempObj.quaternion.copy(cq);
                _tempObj.rotateZ(elapsed * 0.001 * d.rotSpeed);
                if (ay <= groundY + 0.15) {
                    const landT = Math.max(
                        0,
                        1 -
                            (elapsed * 0.08 - (d.startY - groundY) / d.speed) *
                                0.15,
                    );
                    _tempObj.scale.setScalar(landT);
                } else {
                    _tempObj.scale.setScalar(1);
                }
                _tempObj.updateMatrix();
                stars.setMatrixAt(k, _tempObj.matrix);
            }
            stars.instanceMatrix.needsUpdate = true;
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
        smokePositions.push(new THREE.Vector3(
            pos.x + (Math.random() - 0.5) * 1.0,
            pos.y + 0.3,
            pos.z + (Math.random() - 0.5) * 1.0,
        ));
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
        spOffsets.push(new THREE.Vector3(x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r));
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
            ring3.rotation.z += 0.10;
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
            z + (Math.random() - 0.5) * 0.4
        );
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
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
                Math.sin(angle) * speed
            )
        );
        rotVels.push(
            new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6
            )
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
                (mesh.material as THREE.MeshStandardMaterial).opacity = 0.85 * (1 - t);
            }
            return true;
        },
    });
}

export function spawnHealFX(
    scene: THREE.Scene,
    start: THREE.Vector3,
    end: THREE.Vector3,
    isRejuvenation: boolean = false
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
        depthWrite: false
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
        depthWrite: false
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
                    end.z + radius * Math.sin(theta)
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
        }
    });
}

export function spawnDivineShieldFX(scene: THREE.Scene, targetPos: THREE.Vector3) {
    // 1. Double-shell golden shield (Outer wireframe + Inner solid glowing sphere)
    const geoOuter = new THREE.SphereGeometry(0.8, 14, 14);
    const matOuter = new THREE.MeshBasicMaterial({
        color: 0xffd700, // Shiny gold
        transparent: true,
        opacity: 0.55,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const shieldOuter = new THREE.Mesh(geoOuter, matOuter);
    shieldOuter.position.copy(targetPos);
    scene.add(shieldOuter);

    const geoInner = new THREE.SphereGeometry(0.72, 12, 12);
    const matInner = new THREE.MeshBasicMaterial({
        color: 0xffaa00, // Orange-gold
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const shieldInner = new THREE.Mesh(geoInner, matInner);
    shieldInner.position.copy(targetPos);
    scene.add(shieldInner);

    // 2. Small orbiting golden stars
    const starCount = 6;
    const stars: THREE.Mesh[] = [];
    const starGeo = new THREE.DodecahedronGeometry(0.06);
    const starMat = new THREE.MeshBasicMaterial({
        color: 0xffe875,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    for (let i = 0; i < starCount; i++) {
        const star = new THREE.Mesh(starGeo, starMat);
        scene.add(star);
        stars.push(star);
    }

    let age = 0;
    const duration = 1.3; // Visually matches shield active state

    activeFX.push({
        update(delta) {
            age += delta;
            const t = Math.min(1.0, age / duration);

            // Counter-rotation of inner/outer shield shells
            shieldOuter.rotation.y += delta * 1.8;
            shieldOuter.rotation.x += delta * 0.7;
            shieldInner.rotation.y -= delta * 1.2;

            // Pulsate shield scale slightly
            const pulse = 1.0 + 0.05 * Math.sin(age * 12.0);
            shieldOuter.scale.setScalar(pulse);
            shieldInner.scale.setScalar(pulse);

            // Fade out
            matOuter.opacity = 0.55 * (1.0 - t);
            matInner.opacity = 0.25 * (1.0 - t);

            // Orbit stars around the shield
            for (let i = 0; i < stars.length; i++) {
                const angle = age * 6.0 + i * ((Math.PI * 2) / starCount);
                stars[i].position.set(
                    targetPos.x + 0.95 * Math.cos(angle),
                    targetPos.y + 0.15 * Math.sin(age * 3.0 + i),
                    targetPos.z + 0.95 * Math.sin(angle)
                );
                stars[i].scale.setScalar(1.0 - t);
            }

            if (t >= 1.0) {
                scene.remove(shieldOuter);
                scene.remove(shieldInner);
                geoOuter.dispose();
                geoInner.dispose();
                matOuter.dispose();
                matInner.dispose();

                for (const star of stars) {
                    scene.remove(star);
                }
                starGeo.dispose();
                starMat.dispose();
                return false;
            }
            return true;
        }
    });
}

export function spawnHolySanctuaryFX(scene: THREE.Scene, center: THREE.Vector3) {
    // 1. Glowing ground ring
    const geoRing = new THREE.RingGeometry(0.1, 5.0, 32);
    const matRing = new THREE.MeshBasicMaterial({
        color: 0x00ffaa, // Emerald-green holy aura
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false
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
        side: THREE.DoubleSide
    });

    const angleStep = (Math.PI * 2) / pillarCount;
    for (let i = 0; i < pillarCount; i++) {
        const p = new THREE.Mesh(geoPillar, matPillar);
        const radius = 4.3; // slightly inside sanctuary boundary
        p.position.set(
            center.x + radius * Math.cos(i * angleStep),
            center.y + 2.5, // Center offset for cylinder
            center.z + radius * Math.sin(i * angleStep)
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
        }
    });
}

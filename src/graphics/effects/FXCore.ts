/**
 * FXCore.ts — Shared FX infrastructure: easing curves, geometry/material pools,
 * texture loading, activeFX management, shader materials, reusable helpers.
 * Extracted from SkillFX.ts to reduce cohesion.
 */

import * as THREE from "three";
import { camera } from "../core/scene";

// ═══════════════════════════════════════════════════════════════
// Easing curves
// ═══════════════════════════════════════════════════════════════
export function easeOutCubic(t: number): number {
    const u = 1 - t;
    return 1 - u * u * u;
}
export function easeOutQuad(t: number): number {
    return t * (2 - t);
}
export function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ═══════════════════════════════════════════════════════════════
// Shared geometry pool
// ═══════════════════════════════════════════════════════════════
const _geoPool = new Map<string, THREE.PlaneGeometry>();
export function pooledPlane(w: number, h: number): THREE.PlaneGeometry {
    const key = `${w.toFixed(2)}x${h.toFixed(2)}`;
    if (!_geoPool.has(key)) _geoPool.set(key, new THREE.PlaneGeometry(w, h));
    return _geoPool.get(key)!;
}

// Pooled ring geometry
const _ringGeoPool = new Map<string, THREE.RingGeometry>();
export function pooledRing(
    inner: number,
    outer: number,
    segs: number,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
): THREE.RingGeometry {
    const key = `${inner.toFixed(2)}_${outer.toFixed(2)}_${segs}_${thetaStart.toFixed(2)}_${thetaLength.toFixed(2)}`;
    if (!_ringGeoPool.has(key))
        _ringGeoPool.set(
            key,
            new THREE.RingGeometry(
                inner,
                outer,
                segs,
                1,
                thetaStart,
                thetaLength,
            ),
        );
    return _ringGeoPool.get(key)!;
}

// ═══════════════════════════════════════════════════════════════
// Texture loading — once at module init
// ═══════════════════════════════════════════════════════════════
const texLoader = new THREE.TextureLoader();
const baseUrl = import.meta.env.BASE_URL;
function loadTex(path: string) {
    return texLoader.load(baseUrl + path);
}

export const starTex = loadTex("particle-pack/PNG (Transparent)/star_05.png");
export const circleTex = loadTex(
    "particle-pack/PNG (Transparent)/circle_03.png",
);
export const sparkTex = loadTex("particle-pack/PNG (Transparent)/spark_04.png");
export const smokeTex = loadTex("particle-pack/PNG (Transparent)/smoke_04.png");
export const fireTex = loadTex("particle-pack/PNG (Transparent)/fire_01.png");
export const flameTex = loadTex("particle-pack/PNG (Transparent)/flame_01.png");
export const scorchTex = loadTex(
    "particle-pack/PNG (Transparent)/scorch_01.png",
);
export const lightTex = loadTex("particle-pack/PNG (Transparent)/light_02.png");
export const magicTex = loadTex("particle-pack/PNG (Transparent)/magic_01.png");
export const star2Tex = loadTex("particle-pack/PNG (Transparent)/star_08.png");

// ═══════════════════════════════════════════════════════════════
// Shared uniform for shader-based effects
// ═══════════════════════════════════════════════════════════════
export const effectUniforms = { uTime: { value: 0 } };

// ═══════════════════════════════════════════════════════════════
// Material pool
// ═══════════════════════════════════════════════════════════════
export interface MatSpecs {
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
export function getPooledMaterial(specs: MatSpecs): THREE.MeshBasicMaterial {
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

    const config: any = {};
    if (specs.color !== undefined) config.color = specs.color;
    if (specs.map !== undefined) config.map = specs.map;
    if (specs.transparent !== undefined) config.transparent = specs.transparent;
    if (specs.opacity !== undefined) config.opacity = specs.opacity;
    if (specs.blending !== undefined) config.blending = specs.blending;
    if (specs.depthWrite !== undefined) config.depthWrite = specs.depthWrite;
    if (specs.depthTest !== undefined) config.depthTest = specs.depthTest;
    if (specs.side !== undefined) config.side = specs.side;

    return new THREE.MeshBasicMaterial(config);
}

export function releasePooledMaterial(mat: THREE.MeshBasicMaterial) {
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
// Material factories for vertex effects
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
// Active FX management
// ═══════════════════════════════════════════════════════════════
const MAX_FX_HARSH = 40;
export const activeFX: Array<{ update: (delta: number) => boolean }> = [];

export function updateFX(delta: number) {
    for (let i = activeFX.length - 1; i >= 0; i--) {
        if (!activeFX[i].update(delta)) activeFX.splice(i, 1);
    }
}

export function canSpawnFX(): boolean {
    return activeFX.length < MAX_FX_HARSH;
}

export function fxQualityScale(): number {
    const n = activeFX.length;
    if (n < 5) return 1.0;
    if (n < 12) return 0.3;
    if (n < 25) return 0.12;
    return 0.05;
}

// ═══════════════════════════════════════════════════════════════
// Reusable helpers
// ═══════════════════════════════════════════════════════════════
const _camQuad = new THREE.Quaternion();
export function getCamQuad(): THREE.Quaternion {
    _camQuad.copy(camera.quaternion);
    return _camQuad;
}

export const _tempObj = new THREE.Object3D();

export function spawnScreenFlash(
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

// Generic explosion helper
export function spawnExplosion(
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
    const mat = getPooledMaterial({
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
                releasePooledMaterial(mat);
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

/**
 * Forcefully updates all active FX with a huge delta to trigger their cleanup routines,
 * and clears the active FX list. Prevents orphaned visual effects from leaking.
 */
export function clearAllFX(scene: THREE.Scene) {
    for (let i = activeFX.length - 1; i >= 0; i--) {
        try {
            activeFX[i].update(9999);
        } catch (e) {
            console.error("Error clearing FX:", e);
        }
    }
    activeFX.length = 0;
}

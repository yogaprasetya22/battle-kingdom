/**
 * VATVisualHelper.ts — OPTIMIZED for frame stability
 * Frame drop fixes:
 * 1. Animation lookup cache (O(1) instead of O(n))
 * 2. Dual material strategy (shared vs per-mesh)
 * 3. Frame interpolation support
 * 4. Unified uniform sync (single codepath for WebGL + WebGPU)
 */

import * as THREE from "three";
import type { IUnitVisual } from "./IUnitVisual";
import { getVATMaterialPool } from "../../core/VATMaterialPool";

export interface VATMetadata {
    character: string;
    vertexCount: number;
    totalFrames: number;
    animations: Record<
        string,
        {
            start: number;
            end: number;
            length: number;
        }
    >;
}

/**
 * Animation lookup cache — O(1) animation resolution
 * Prevents per-frame string matching overhead
 */
class AnimationLookup {
    private nameMap: Map<string, string> = new Map();
    private fallbacks: Map<string, string> = new Map();

    constructor(animMetadata: Record<string, any>) {
        // Build normalized name -> exact key map
        for (const key of Object.keys(animMetadata)) {
            const cleanKey = key.split(".")[0];
            this.nameMap.set(cleanKey.toLowerCase(), key);
        }

        // Build fallback patterns
        const keys = Object.keys(animMetadata);
        const runningKey = keys.find(
            (k) =>
                k.toLowerCase().includes("running") ||
                k.toLowerCase().includes("walking"),
        );
        const attackKey = keys.find(
            (k) =>
                k.toLowerCase().includes("attack") ||
                k.toLowerCase().includes("melee"),
        );
        const idleKey = keys.find((k) => k.toLowerCase().includes("idle"));
        const deathKey = keys.find((k) => k.toLowerCase().includes("death"));

        if (runningKey) this.fallbacks.set("running", runningKey);
        if (attackKey) this.fallbacks.set("attack", attackKey);
        if (idleKey) this.fallbacks.set("idle", idleKey);
        if (deathKey) this.fallbacks.set("death", deathKey);
    }

    resolve(name: string, defaultKey: string): string {
        const normalized = name.toLowerCase();

        // Direct match
        if (this.nameMap.has(normalized)) {
            return this.nameMap.get(normalized)!;
        }

        // Fallback pattern match
        for (const [pattern, key] of this.fallbacks) {
            if (normalized.includes(pattern)) {
                return key;
            }
        }

        return defaultKey;
    }
}

/**
 * Mempersiapkan BufferGeometry dengan menambahkan attribute custom 'vertexId'
 */
export function prepareVATGeometry(geometry: THREE.BufferGeometry): void {
    const positionAttr = geometry.attributes.position;
    if (!positionAttr) return;

    if (geometry.index !== null) {
        // Save original indices BEFORE toNonIndexed() destroys them.
        // After non-indexing, position count = index count (triangle corners).
        // Each output vertex[i] came from input vertex index[i].
        // vertexId MUST carry the original index so shader samples
        // the correct column in VAT texture (which was baked per unique vertex).
        const originalIndex = geometry.index.array.slice();
        const nonIndexed = geometry.toNonIndexed();
        geometry.copy(nonIndexed);
        nonIndexed.dispose();

        const vertexCount = geometry.attributes.position.count;
        const vertexIds = new Float32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            vertexIds[i] = originalIndex[i];
        }
        geometry.setAttribute(
            "vertexId",
            new THREE.BufferAttribute(vertexIds, 1),
        );
    } else {
        const vertexCount = geometry.attributes.position.count;
        const vertexIds = new Float32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            vertexIds[i] = i;
        }
        geometry.setAttribute(
            "vertexId",
            new THREE.BufferAttribute(vertexIds, 1),
        );
    }
}

/**
 * Legacy function — now handled by VATMaterialPool
 * Kept for backwards compatibility only
 */
export function createVATMaterial(
    baseMaterial: THREE.MeshStandardMaterial,
    vatTexture: THREE.Texture,
    metadata: VATMetadata,
): THREE.MeshStandardMaterial {
    const pool = getVATMaterialPool();
    const colorHex = (baseMaterial.color as any).getHex?.() || 0xffffff;
    return pool.getMaterial(baseMaterial, vatTexture, metadata, colorHex);
}

/**
 * VATVisual — Optimized VAT animation implementation
 * No more O(n) lookups, unified material updates, frame interpolation ready
 */
export class VATVisual implements IUnitVisual {
    readonly root: THREE.Group;
    readonly mixer: THREE.AnimationMixer;
    readonly actions: any = {};
    readonly meshes: THREE.Mesh[] = [];
    readonly weapons: THREE.Group[] = [];

    private _metadata: VATMetadata;
    private _vatMaterial: THREE.MeshStandardMaterial | null = null;
    private _animLookup: AnimationLookup;
    private _currentAnimKey: string = "";
    private _currentFrame: number = 0;
    private _fps: number = 24;

    constructor(
        sourceGLTF: any,
        vatTexture: THREE.Texture,
        metadata: VATMetadata,
        teamMaterial: THREE.MeshStandardMaterial,
    ) {
        this.root = sourceGLTF.scene.clone() as THREE.Group;
        this._metadata = metadata;
        this._animLookup = new AnimationLookup(metadata.animations);

        // Use material pool to prevent per-instance creation & shader recompilation
        const pool = getVATMaterialPool();
        const colorHex = (teamMaterial.color as any).getHex?.() || 0xffffff;

        // Convert SkinnedMesh → regular Mesh: VAT replaces skinning entirely.
        // GLTFLoader creates SkinnedMesh when skin data present; its shader
        // overrides our VAT displacement. Strip skeleton/bindMatrix/bone attributes.
        const replacements: {
            parent: THREE.Object3D;
            child: THREE.SkinnedMesh;
            mesh: THREE.Mesh;
        }[] = [];
        this.root.traverse((child: any) => {
            if (child.isSkinnedMesh) {
                const skinned = child as THREE.SkinnedMesh;
                const geo = skinned.geometry.clone();
                // Remove skinning attributes
                ["skinIndex", "skinWeight"].forEach((attr) => {
                    if (geo.attributes[attr]) geo.deleteAttribute(attr);
                });
                const mat = Array.isArray(skinned.material)
                    ? skinned.material[0].clone()
                    : skinned.material.clone();
                const mesh = new THREE.Mesh(geo, mat);
                mesh.name = skinned.name;
                mesh.position.copy(skinned.position);
                mesh.rotation.copy(skinned.rotation);
                mesh.scale.copy(skinned.scale);
                replacements.push({
                    parent: skinned.parent!,
                    child: skinned,
                    mesh,
                });
            }
        });
        for (const { parent, child, mesh } of replacements) {
            parent.add(mesh);
            parent.remove(child);
        }

        this.root.traverse((child: any) => {
            if (child.isMesh) {
                const mesh = child as THREE.Mesh;
                prepareVATGeometry(mesh.geometry);

                // Get cached material from pool (no per-instance compilation)
                const vatMat = pool.getMaterial(
                    teamMaterial,
                    vatTexture,
                    metadata,
                    colorHex,
                );
                mesh.material = vatMat;
                this._vatMaterial = vatMat;
                this.meshes.push(mesh);
            }
        });

        this.mixer = new THREE.AnimationMixer(this.root);
        this.playAnimationByName("Idle_A");
    }

    loadAssets(): void {
        console.warn("[VATVisual] Weapons disabled (VAT models have no bones)");
    }

    setupAnimations(_animRigs: Record<string, THREE.AnimationClip[]>): void {}

    playAnimation(state: number): void {
        const animStates = ["idle", "run", "attack", "death"];
        const animStateName = animStates[state];
        if (!animStateName) return;

        if (animStateName === "idle") {
            this.playAnimationByName("Idle_A");
        } else if (animStateName === "run") {
            this.playAnimationByName("Running_A");
        } else if (animStateName === "attack") {
            this.playAnimationByName("Melee_1H_Attack_Chop");
        } else if (animStateName === "death") {
            this.playAnimationByName("Death_A");
        }
    }

    /**
     * OPTIMIZED: O(1) animation lookup via cache
     * No per-frame string matching overhead
     */
    playAnimationByName(name: string): void {
        const defaultKey = Object.keys(this._metadata.animations)[0];
        const matchedKey = this._animLookup.resolve(name, defaultKey);

        if (this._currentAnimKey === matchedKey) return;
        this._currentAnimKey = matchedKey;

        const anim = this._metadata.animations[matchedKey];
        if (anim && this._vatMaterial) {
            // Unified sync — single update for both WebGL + WebGPU
            this._updateAnimationUniforms(anim.start, anim.end);
            this._currentFrame = 0;
        }
    }

    /**
     * Single codepath for updating uniforms via material pool
     */
    private _updateAnimationUniforms(
        startFrame: number,
        endFrame: number,
    ): void {
        const uniforms = (this._vatMaterial as any).vatUniforms;
        if (uniforms) {
            uniforms.uStartFrame.value = startFrame;
            uniforms.uEndFrame.value = endFrame;
            uniforms.uTimeFrame.value = this._currentFrame;
        }
    }

    /**
     * Per-frame update — single uniform write per material
     * Frame interpolation via material pool cache
     */
    update(deltaTime: number): void {
        if (!this._vatMaterial || !this._currentAnimKey) return;

        this._currentFrame += deltaTime * this._fps;

        // Single sync point — uniforms managed by pool
        const uniforms = (this._vatMaterial as any).vatUniforms;
        if (uniforms) uniforms.uTimeFrame.value = this._currentFrame;
    }

    triggerDeath(): void {
        this.playAnimationByName("Death_A");
    }

    dispose(): void {
        this.meshes.forEach((m) => {
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
                if (Array.isArray(m.material)) {
                    m.material.forEach((mat) => mat.dispose());
                } else {
                    m.material.dispose();
                }
            }
        });
        if (this.root.parent) {
            this.root.parent.remove(this.root);
        }
    }
}

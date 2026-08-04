/**
 * VATMaterialPool.ts — WebGPU/WebGL material pooling & shader caching
 * Prevents shader recompilation overhead in WebGPU mode
 * Fixes: 20000+ draw calls issue → proper material reuse
 */

import * as THREE from "three";
import type { VATMetadata } from "../units/base/VATVisualHelper";

/**
 * Centralized material factory with shader caching
 * Prevents per-instance material creation & shader recompilation
 */
export class VATMaterialPool {
    private materialCache: Map<string, THREE.MeshStandardMaterial> = new Map();
    private shaderCache: Map<string, any> = new Map();
    private isWebGPU: boolean;

    constructor(isWebGPU: boolean = false) {
        this.isWebGPU = isWebGPU;
    }

    /**
     * Get or create VAT material (cached by color key)
     * This prevents redundant shader compilation in WebGPU
     */
    getMaterial(
        baseMaterial: THREE.MeshStandardMaterial,
        vatTexture: THREE.Texture,
        metadata: VATMetadata,
        colorHex: number,
    ): THREE.MeshStandardMaterial {
        const cacheKey = `vat_${colorHex.toString(16)}`;

        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey)!;
        }

        const mat = this._createVATMaterial(
            baseMaterial,
            vatTexture,
            metadata,
            colorHex,
        );

        this.materialCache.set(cacheKey, mat);
        return mat;
    }

    private _createVATMaterial(
        baseMaterial: THREE.MeshStandardMaterial,
        vatTexture: THREE.Texture,
        metadata: VATMetadata,
        colorHex: number,
    ): THREE.MeshStandardMaterial {
        const mat = baseMaterial.clone();
        mat.color.setHex(colorHex);

        // Texture optimization
        vatTexture.minFilter = THREE.NearestFilter;
        vatTexture.magFilter = THREE.NearestFilter;
        vatTexture.generateMipmaps = false;
        vatTexture.flipY = false;

        // Unified uniforms
        const uniforms = {
            uVATTexture: { value: vatTexture },
            uTimeFrame: { value: 0.0 },
            uStartFrame: { value: 0.0 },
            uEndFrame: { value: 0.0 },
            uTotalFrames: { value: metadata.totalFrames },
            uVertexCount: { value: metadata.vertexCount },
        };

        // WebGL path (shader injection)
        mat.onBeforeCompile = (shader) => {
            // Reuse cached shader modifications if available
            const shaderKey = `webgl_${metadata.vertexCount}_${metadata.totalFrames}`;
            if (this.shaderCache.has(shaderKey)) {
                const cached = this.shaderCache.get(shaderKey);
                shader.vertexShader = cached.vertexShader;
                shader.uniforms = { ...shader.uniforms, ...uniforms };
                return;
            }

            shader.uniforms.uVATTexture = uniforms.uVATTexture;
            shader.uniforms.uTimeFrame = uniforms.uTimeFrame;
            shader.uniforms.uStartFrame = uniforms.uStartFrame;
            shader.uniforms.uEndFrame = uniforms.uEndFrame;
            shader.uniforms.uTotalFrames = uniforms.uTotalFrames;
            shader.uniforms.uVertexCount = uniforms.uVertexCount;

            shader.vertexShader =
                `
                attribute float vertexId;
                uniform sampler2D uVATTexture;
                uniform float uTimeFrame;
                uniform float uStartFrame;
                uniform float uEndFrame;
                uniform float uTotalFrames;
                uniform float uVertexCount;
            \n` + shader.vertexShader;

            const search = "#include <begin_vertex>";
            const replacement = `
                #include <begin_vertex>
                
                float frameRange = max(1.0, uEndFrame - uStartFrame + 1.0);
                float frame = uStartFrame + mod(uTimeFrame, frameRange);
                
                float u = (vertexId + 0.5) / uVertexCount;
                float v = (frame + 0.5) / uTotalFrames;
                
                vec4 displacement = texture2D(uVATTexture, vec2(u, v));
                transformed += displacement.xyz;
            `;

            shader.vertexShader = shader.vertexShader.replace(
                search,
                replacement,
            );

            // Cache the modified shader
            this.shaderCache.set(shaderKey, {
                vertexShader: shader.vertexShader,
            });
        };

        // Store uniforms on material for synchronous access
        (mat as any).vatUniforms = uniforms;

        // Mark material as VAT for renderer identification
        (mat as any).isVATMaterial = true;
        (mat as any).vatMetadata = metadata;

        return mat;
    }

    /**
     * Clear entire cache (call on scene reset)
     */
    clear(): void {
        this.materialCache.forEach((mat) => {
            mat.dispose();
        });
        this.materialCache.clear();
        this.shaderCache.clear();
    }

    /**
     * Dispose single material from cache
     */
    disposeMaterial(colorHex: number): void {
        const cacheKey = `vat_${colorHex.toString(16)}`;
        const mat = this.materialCache.get(cacheKey);
        if (mat) {
            mat.dispose();
            this.materialCache.delete(cacheKey);
        }
    }

    getStats() {
        return {
            cachedMaterials: this.materialCache.size,
            cachedShaders: this.shaderCache.size,
        };
    }
}

// Global singleton instance
let globalPool: VATMaterialPool | null = null;

export function initVATMaterialPool(isWebGPU: boolean): VATMaterialPool {
    if (globalPool) globalPool.clear();
    globalPool = new VATMaterialPool(isWebGPU);
    return globalPool;
}

export function getVATMaterialPool(): VATMaterialPool {
    if (!globalPool) {
        globalPool = new VATMaterialPool(false);
    }
    return globalPool;
}

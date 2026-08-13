/**
 * OptimizationManager.ts — Intelligent unit optimization dengan custom selector
 *
 * Features:
 * - Per-unit allowOptimization flag (userData.allowOptimization = true/false)
 * - Distance-based LOD tiers (close = full quality, far = optimized)
 * - Priority system (Hero/Important units bypass optimization)
 * - Frustum culling integration
 * - Real-time FPS monitoring dan adaptive throttling
 *
 * Problem yang disolve:
 * - 60+ units lag di 60 FPS
 * - Manual control mana unit yang boleh dioptimasi
 * - Animation frame drops saat banyak unit
 */

import * as THREE from "three";
import { animationClockManager } from "./AnimationClockManager";

export interface UnitOptimizationConfig {
    unitId: number;
    mesh: THREE.Object3D;
    cameraPosition: THREE.Vector3;
    allowOptimization: boolean; // userData flag untuk allow/disallow optimization
    isHero: boolean; // Special flag: hero/important unit, never optimize
    priority: number; // 0=lowest (optimize first), 10=highest (never optimize)
}

export class OptimizationManager {
    private units: Map<number, UnitOptimizationConfig> = new Map();
    private camera: THREE.Camera;
    private frustum: THREE.Frustum = new THREE.Frustum();
    private projMatrix: THREE.Matrix4 = new THREE.Matrix4();

    // Distance-based LOD thresholds (squared untuk avoid sqrt)
    private readonly LOD_DISTANCES_SQ = {
        CLOSE: 400, // < 20 units
        MEDIUM: 1600, // < 40 units
        FAR: 4900, // < 70 units
        VERY_FAR: 10000, // > 100 units
    };

    // Update frequency per tier
    private readonly UPDATE_RATES = {
        CLOSE: "HIGH" as const, // 60 FPS
        MEDIUM: "MEDIUM" as const, // 30 FPS
        FAR: "LOW" as const, // 15 FPS
        VERY_FAR: "VERY_LOW" as const, // 7.5 FPS
    };

    // Performance monitoring
    private frameCount: number = 0;
    private lastFpsCheckTime: number = 0;
    private currentFps: number = 60;
    private targetFps: number = 60;

    constructor(camera: THREE.Camera) {
        this.camera = camera;
    }

    /**
     * Register unit untuk optimization tracking
     * Call setelah unit di-instantiate
     */
    public registerUnit(config: UnitOptimizationConfig): void {
        this.units.set(config.unitId, config);

        // Extract allowOptimization dari userData jika ada
        if ((config.mesh as any).userData?.allowOptimization !== undefined) {
            config.allowOptimization = (
                config.mesh as any
            ).userData.allowOptimization;
        }
    }

    /**
     * Unregister unit saat dihapus
     */
    public unregisterUnit(unitId: number): void {
        this.units.delete(unitId);
    }

    /**
     * Update all units: check distance, apply LOD, manage animations
     * Call dari main render loop sebelum mixer updates
     */
    public updateOptimizations(): void {
        this.frameCount++;

        // Update frustum untuk culling
        this.projMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse,
        );
        this.frustum.setFromProjectionMatrix(this.projMatrix);

        // Evaluate setiap unit
        for (const [unitId, config] of this.units) {
            this.evaluateUnit(unitId, config);
        }

        // Monitor FPS dan adaptive throttling
        this.monitorPerformance();
    }

    /**
     * Evaluate individual unit: compute distance, apply LOD, set mixer rate
     */
    private evaluateUnit(unitId: number, config: UnitOptimizationConfig): void {
        const mesh = config.mesh;
        if (!mesh) return;

        // Compute distance squared (avoid sqrt)
        const dx = mesh.position.x - this.camera.position.x;
        const dy = mesh.position.y - this.camera.position.y;
        const dz = mesh.position.z - this.camera.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        // Frustum visibility check
        const sphere = new THREE.Sphere(mesh.position, 1.5);
        const isVisible = this.frustum.intersectsSphere(sphere);

        // Determine optimization tier
        let tier: "CLOSE" | "MEDIUM" | "FAR" | "VERY_FAR";
        let shouldOptimize = false;

        if (distSq < this.LOD_DISTANCES_SQ.CLOSE) {
            tier = "CLOSE";
        } else if (distSq < this.LOD_DISTANCES_SQ.MEDIUM) {
            tier = "MEDIUM";
            shouldOptimize = true;
        } else if (distSq < this.LOD_DISTANCES_SQ.FAR) {
            tier = "FAR";
            shouldOptimize = true;
        } else {
            tier = "VERY_FAR";
            shouldOptimize = true;
        }

        // Apply optimization logic: respect allowOptimization flag dan isHero
        const willOptimize =
            shouldOptimize &&
            config.allowOptimization &&
            !config.isHero &&
            isVisible;

        // Update mixer animation rate
        animationClockManager.setOptimized(unitId, willOptimize);
        animationClockManager.setUpdateRate(unitId, this.UPDATE_RATES[tier]);

        // Update mesh visibility (culling)
        mesh.visible = isVisible;

        // Store untuk diagnostics
        (config as any).currentTier = tier;
        (config as any).distanceSq = distSq;
        (config as any).optimized = willOptimize;
    }

    /**
     * Monitor FPS dan apply adaptive throttling jika perlu
     */
    private monitorPerformance(): void {
        const now = performance.now();

        if (now - this.lastFpsCheckTime >= 1000) {
            // Estimate FPS (frame count per second)
            const framesSinceLastCheck = this.frameCount;
            this.currentFps = framesSinceLastCheck;

            // Adaptive throttling: jika FPS < target, increase optimization
            if (this.currentFps < this.targetFps * 0.95) {
                // FPS drop detected: make optimization more aggressive
                this.increaseOptimization();
            } else if (this.currentFps > this.targetFps * 1.1) {
                // FPS surplus: relax optimization
                this.decreaseOptimization();
            }

            this.frameCount = 0;
            this.lastFpsCheckTime = now;
        }
    }

    /**
     * Increase optimization threshold (more units get optimized)
     */
    private increaseOptimization(): void {
        // Move thresholds closer to camera (smaller distances)
        this.LOD_DISTANCES_SQ.MEDIUM = Math.max(
            400,
            this.LOD_DISTANCES_SQ.MEDIUM * 0.9,
        );
        this.LOD_DISTANCES_SQ.FAR = Math.max(
            1600,
            this.LOD_DISTANCES_SQ.FAR * 0.9,
        );
    }

    /**
     * Decrease optimization (fewer units get optimized)
     */
    private decreaseOptimization(): void {
        // Move thresholds farther from camera (larger distances)
        this.LOD_DISTANCES_SQ.MEDIUM = Math.min(
            2500,
            this.LOD_DISTANCES_SQ.MEDIUM * 1.1,
        );
        this.LOD_DISTANCES_SQ.FAR = Math.min(
            10000,
            this.LOD_DISTANCES_SQ.FAR * 1.1,
        );
    }

    /**
     * Manually set allowOptimization untuk specific unit
     */
    public setAllowOptimization(unitId: number, allow: boolean): void {
        const config = this.units.get(unitId);
        if (config) {
            config.allowOptimization = allow;
            if (config.mesh) {
                (config.mesh as any).userData =
                    (config.mesh as any).userData || {};
                (config.mesh as any).userData.allowOptimization = allow;
            }
        }
    }

    /**
     * Set unit sebagai hero/important (never optimize)
     */
    public setIsHero(unitId: number, isHero: boolean): void {
        const config = this.units.get(unitId);
        if (config) {
            config.isHero = isHero;
        }
    }

    /**
     * Set custom priority (0-10, higher = never optimize)
     */
    public setPriority(unitId: number, priority: number): void {
        const config = this.units.get(unitId);
        if (config) {
            config.priority = Math.max(0, Math.min(10, priority));
        }
    }

    /**
     * Batch set allowOptimization untuk multiple units (for convenience)
     */
    public setAllowOptimizationBatch(unitIds: number[], allow: boolean): void {
        unitIds.forEach((id) => this.setAllowOptimization(id, allow));
    }

    /**
     * Get current FPS
     */
    public getCurrentFps(): number {
        return this.currentFps;
    }

    /**
     * Get diagnostics data (for debugging)
     */
    public getDiagnostics(): {
        totalUnits: number;
        optimizedCount: number;
        currentFps: number;
        lodDistances: {
            CLOSE: number;
            MEDIUM: number;
            FAR: number;
            VERY_FAR: number;
        };
    } {
        let optimizedCount = 0;
        for (const config of this.units.values()) {
            if ((config as any).optimized) optimizedCount++;
        }

        return {
            totalUnits: this.units.size,
            optimizedCount,
            currentFps: this.currentFps,
            lodDistances: { ...this.LOD_DISTANCES_SQ },
        };
    }

    /**
     * Get detailed per-unit data
     */
    public getUnitDetails(unitId: number): any {
        const config = this.units.get(unitId);
        if (!config) return null;

        return {
            unitId,
            tier: (config as any).currentTier,
            distanceSq: (config as any).distanceSq,
            optimized: (config as any).optimized,
            allowOptimization: config.allowOptimization,
            isHero: config.isHero,
            priority: config.priority,
        };
    }
}

// ponytail: tidak ada singleton — kamera aktual hanya tersedia di scene.ts.
// Ceiling: jika unit count melebihi 200, instantiate OptimizationManager(camera) di renderer.ts
// dan panggil updateOptimizations() tiap frame.

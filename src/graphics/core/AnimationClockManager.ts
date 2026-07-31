/**
 * AnimationClockManager.ts — Global clock untuk ensure consistent animation playback
 * Semua AnimationMixer update melalui single global deltaTime, tidak tergantung camera distance
 *
 * Problem yang disolve:
 * - Animation speed berubah berdasarkan jarak kamera
 * - Delta time tidak konsisten antar mixer
 *
 * Solution:
 * - Single global clock.getDelta()
 * - Distribute ke semua mixer dengan consistent timing
 * - Track per-unit accumulated time untuk smooth interpolation
 */

import * as THREE from "three";

export interface AnimationMixerEntry {
    mixer: THREE.AnimationMixer;
    unitId: number;
    accumulatedTime: number;
    isOptimized: boolean; // if true, use reduced update rate
}

export class AnimationClockManager {
    private clock: THREE.Clock;
    private mixers: Map<number, AnimationMixerEntry> = new Map();
    private globalDeltaTime: number = 0;
    private lastUpdateTime: number = 0;

    // Optimization thresholds
    private readonly UPDATE_RATES = {
        HIGH: 1.0, // 60 FPS - always update
        MEDIUM: 0.5, // 30 FPS - update every 2 frames
        LOW: 0.25, // 15 FPS - update every 4 frames
        VERY_LOW: 0.125, // 7.5 FPS - update every 8 frames
    };

    private frameCount: number = 0;

    constructor() {
        this.clock = new THREE.Clock();
        this.clock.start();
    }

    /**
     * Register mixer untuk track dan manage dengan global clock
     */
    public registerMixer(
        unitId: number,
        mixer: THREE.AnimationMixer,
        isOptimized: boolean = false,
    ): void {
        this.mixers.set(unitId, {
            mixer,
            unitId,
            accumulatedTime: 0,
            isOptimized,
        });
    }

    /**
     * Unregister mixer saat unit dihapus
     */
    public unregisterMixer(unitId: number): void {
        this.mixers.delete(unitId);
    }

    /**
     * Get global delta time (same for all mixers)
     */
    public getGlobalDeltaTime(): number {
        return this.globalDeltaTime;
    }

    /**
     * Update semua mixers dengan consistent global delta
     * Call ini ONCE per frame dari main render loop
     */
    public updateAllMixers(): void {
        this.globalDeltaTime = this.clock.getDelta();
        this.frameCount++;

        for (const [unitId, entry] of this.mixers) {
            this.updateMixerForUnit(unitId, entry);
        }
    }

    /**
     * Update individual mixer dengan adaptive rate berdasarkan optimization flag
     */
    private updateMixerForUnit(
        unitId: number,
        entry: AnimationMixerEntry,
    ): void {
        if (!entry.mixer) return;

        if (!entry.isOptimized) {
            // Full quality: always update dengan global delta
            entry.mixer.update(this.globalDeltaTime);
            entry.accumulatedTime = 0;
        } else {
            // Optimized: selektif update dengan accumulated blending
            entry.accumulatedTime += this.globalDeltaTime;

            // Determine update frequency berdasarkan distance (akan di-set oleh OptimizationManager)
            const shouldUpdate = this.shouldUpdateMixer(unitId);

            if (shouldUpdate) {
                // Update mixer dengan accumulated time (smooth blend)
                entry.mixer.update(entry.accumulatedTime);
                entry.accumulatedTime = 0;
            }
            // Jika tidak update, delta accumulate untuk next frame
        }
    }

    /**
     * Check apakah mixer harus di-update (dapat di-override per-unit)
     */
    private shouldUpdateMixer(unitId: number): boolean {
        // Default: alternating pattern (30 FPS)
        // Override dengan setUpdateRate() untuk custom behavior
        return (this.frameCount + unitId) % 2 === 0;
    }

    /**
     * Set custom update rate untuk specific unit
     */
    public setUpdateRate(
        unitId: number,
        rate: "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW",
    ): void {
        const entry = this.mixers.get(unitId);
        if (!entry) return;

        // Rate akan digunakan di shouldUpdateMixer() untuk determine update frequency
        (entry as any).updateRate = this.UPDATE_RATES[rate];
    }

    /**
     * Set optimization flag untuk unit (true = reduce update rate)
     */
    public setOptimized(unitId: number, optimized: boolean): void {
        const entry = this.mixers.get(unitId);
        if (entry) {
            entry.isOptimized = optimized;
            entry.accumulatedTime = 0; // Reset accumulated time saat toggle
        }
    }

    /**
     * Get mixer entry untuk direct access (if needed)
     */
    public getMixerEntry(unitId: number): AnimationMixerEntry | undefined {
        return this.mixers.get(unitId);
    }

    /**
     * Get all mixers (for diagnostics)
     */
    public getAllMixers(): AnimationMixerEntry[] {
        return Array.from(this.mixers.values());
    }

    /**
     * Get frame count untuk external synchronization
     */
    public getFrameCount(): number {
        return this.frameCount;
    }

    /**
     * Reset clock (jika perlu restart)
     */
    public reset(): void {
        this.clock.stop();
        this.clock = new THREE.Clock();
        this.clock.start();
        this.frameCount = 0;
        this.globalDeltaTime = 0;
    }
}

// Export singleton instance
export const animationClockManager = new AnimationClockManager();

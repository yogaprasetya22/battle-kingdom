/**
 * DayCycleManager.ts — Siklus waktu: Pagi → Siang → Sore → Malam
 * Inspirasi dari folio-2025/DayCycles.js
 *
 * Menginterpolasi:
 * - Light color & intensity
 * - Fog color & distance
 * - Shadow color
 * - Scene ambient properties
 */

import * as THREE from "three";

interface TimePreset {
    lightColor: THREE.Color;
    lightIntensity: number;
    shadowColor: THREE.Color;
    fogColorA: THREE.Color;
    fogColorB: THREE.Color;
    fogDensity: number;
    ambientIntensity: number;
}

const PRESETS: Record<string, TimePreset> = {
    pagi: {
        // Sunrise: warm amber
        lightColor: new THREE.Color("#ffb366"),
        lightIntensity: 0.8,
        shadowColor: new THREE.Color("#6d3fff"),
        fogColorA: new THREE.Color("#ffcc99"),
        fogColorB: new THREE.Color("#99ddff"),
        fogDensity: 0.002,
        ambientIntensity: 0.5,
    },
    siang: {
        // Noon: bright white-yellow
        lightColor: new THREE.Color("#ffffff"),
        lightIntensity: 1.2,
        shadowColor: new THREE.Color("#4466cc"),
        fogColorA: new THREE.Color("#5f7dff"),
        fogColorB: new THREE.Color("#9b89ff"),
        fogDensity: 0.001,
        ambientIntensity: 0.8,
    },
    sore: {
        // Sunset: orange-red
        lightColor: new THREE.Color("#ff8844"),
        lightIntensity: 0.9,
        shadowColor: new THREE.Color("#db004f"),
        fogColorA: new THREE.Color("#ff7d24"),
        fogColorB: new THREE.Color("#ff4ce4"),
        fogDensity: 0.002,
        ambientIntensity: 0.6,
    },
    malam: {
        // Night: deep blue
        lightColor: new THREE.Color("#3366ff"),
        lightIntensity: 0.4,
        shadowColor: new THREE.Color("#2f00db"),
        fogColorA: new THREE.Color("#10266f"),
        fogColorB: new THREE.Color("#490a42"),
        fogDensity: 0.003,
        ambientIntensity: 0.3,
    },
};

export class DayCycleManager {
    private cycleDuration: number; // seconds
    private startTime: number; // performance.now() ketika cycle dimulai
    private currentProgress: number = 0; // 0-1

    // Current interpolated values
    public lightColor: THREE.Color = new THREE.Color();
    public lightIntensity: number = 1;
    public shadowColor: THREE.Color = new THREE.Color();
    public fogColorA: THREE.Color = new THREE.Color();
    public fogColorB: THREE.Color = new THREE.Color();
    public fogDensity: number = 0.008;
    public ambientIntensity: number = 0.5;

    // References
    private directionalLight: THREE.DirectionalLight | null = null;
    private ambientLight: THREE.Light | null = null;
    private scene: THREE.Scene;

    private skyCanvas: HTMLCanvasElement;
    private skyContext: CanvasRenderingContext2D;
    private skyTexture: THREE.CanvasTexture;
    private lastSkyUpdateTime: number = 0;

    constructor(scene: THREE.Scene, cycleDurationSeconds: number = 60) {
        this.scene = scene;
        this.cycleDuration = cycleDurationSeconds;
        this.startTime = performance.now();

        // Inisialisasi Canvas untuk gradient langit dinamis
        this.skyCanvas = document.createElement("canvas");
        this.skyCanvas.width = 2;
        this.skyCanvas.height = 256;
        this.skyContext = this.skyCanvas.getContext("2d")!;
        this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
        this.skyTexture.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = this.skyTexture;

        this.initializeValues();
    }

    private initializeValues() {
        const pagi = PRESETS.pagi;
        this.lightColor.copy(pagi.lightColor);
        this.lightIntensity = pagi.lightIntensity;
        this.shadowColor.copy(pagi.shadowColor);
        this.fogColorA.copy(pagi.fogColorA);
        this.fogColorB.copy(pagi.fogColorB);
        this.fogDensity = pagi.fogDensity;
        this.ambientIntensity = pagi.ambientIntensity;
    }

    public setDirectionalLight(light: THREE.DirectionalLight) {
        this.directionalLight = light;
    }

    public setAmbientLight(light: THREE.Light) {
        this.ambientLight = light;
    }

    /**
     * Update cycle progress dan interpolate properties
     * Called setiap frame
     */
    public update() {
        const elapsed = (performance.now() - this.startTime) / 1000; // convert to seconds
        this.currentProgress = (elapsed / this.cycleDuration) % 1;

        // Keyframe positions (0-1 progress)
        const keyframes = [
            { stop: 0.0, preset: PRESETS.pagi }, // Pagi
            { stop: 0.25, preset: PRESETS.siang }, // Siang
            { stop: 0.5, preset: PRESETS.sore }, // Sore
            { stop: 0.75, preset: PRESETS.malam }, // Malam
            { stop: 1.0, preset: PRESETS.pagi }, // Loop back to Pagi
        ];

        // Find surrounding keyframes
        let prevKeyframe = keyframes[0];
        let nextKeyframe = keyframes[1];

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (
                this.currentProgress >= keyframes[i].stop &&
                this.currentProgress < keyframes[i + 1].stop
            ) {
                prevKeyframe = keyframes[i];
                nextKeyframe = keyframes[i + 1];
                break;
            }
        }

        // Interpolation ratio linear untuk transisi konstan tanpa jeda/berhenti di keyframe
        const mixRatio = (this.currentProgress - prevKeyframe.stop) / (nextKeyframe.stop - prevKeyframe.stop);

        // Interpolate all properties
        this.interpolateColor(
            this.lightColor,
            prevKeyframe.preset.lightColor,
            nextKeyframe.preset.lightColor,
            mixRatio,
        );
        this.lightIntensity = this.lerp(
            prevKeyframe.preset.lightIntensity,
            nextKeyframe.preset.lightIntensity,
            mixRatio,
        );

        this.interpolateColor(
            this.shadowColor,
            prevKeyframe.preset.shadowColor,
            nextKeyframe.preset.shadowColor,
            mixRatio,
        );

        this.interpolateColor(
            this.fogColorA,
            prevKeyframe.preset.fogColorA,
            nextKeyframe.preset.fogColorB,
            mixRatio,
        );

        this.interpolateColor(
            this.fogColorB,
            prevKeyframe.preset.fogColorB,
            nextKeyframe.preset.fogColorA,
            mixRatio,
        );

        this.fogDensity = this.lerp(
            prevKeyframe.preset.fogDensity,
            nextKeyframe.preset.fogDensity,
            mixRatio,
        );

        this.ambientIntensity = this.lerp(
            prevKeyframe.preset.ambientIntensity,
            nextKeyframe.preset.ambientIntensity,
            mixRatio,
        );

        // Apply to lights
        this.applyToLights();
    }

    private applyToLights() {
        if (this.directionalLight) {
            this.directionalLight.color.copy(this.lightColor);
            this.directionalLight.intensity = this.lightIntensity;
        }

        if (this.ambientLight) {
            this.ambientLight.intensity = this.ambientIntensity;
        }

        // Update scene fog (THREE.Fog)
        if (this.scene.fog instanceof THREE.Fog) {
            this.scene.fog.color.lerpColors(
                this.fogColorA,
                this.fogColorB,
                0.5,
            );
            // Jauhkan sedikit saja: naikkan targetFar dan naikkan near ke 25% dari far agar tidak menutup unit depan
            const targetFar = 90 + (1 - this.fogDensity / 0.003) * 60;
            this.scene.fog.near = targetFar * 0.25;
            this.scene.fog.far = targetFar;
        }

        // Update langit gradient dinamis agar menyatu dengan fog horizon (throttled to 100ms / 10Hz to prevent GPU upload stalls)
        const now = performance.now();
        if (now - this.lastSkyUpdateTime > 100) {
            this.lastSkyUpdateTime = now;

            const gradient = this.skyContext.createLinearGradient(0, 0, 0, 256);
            gradient.addColorStop(0.0, "#" + this.fogColorB.getHexString()); // Bagian atas langit
            gradient.addColorStop(0.6, "#" + this.fogColorA.getHexString()); // Bagian tengah/cakrawala

            // Interpolate colors directly on components to avoid GC allocation/clone overhead
            const r = this.fogColorA.r + (this.fogColorB.r - this.fogColorA.r) * 0.15;
            const g = this.fogColorA.g + (this.fogColorB.g - this.fogColorA.g) * 0.15;
            const b = this.fogColorA.b + (this.fogColorB.b - this.fogColorA.b) * 0.15;
            const hex = ((1 << 24) + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255)).toString(16).slice(1);
            gradient.addColorStop(1.0, "#" + hex);

            this.skyContext.fillStyle = gradient;
            this.skyContext.fillRect(0, 0, 2, 256);
            this.skyTexture.needsUpdate = true;
        }
    }

    /**
     * Get current time period name (untuk debug/UI)
     */
    public getCurrentPeriod(): string {
        if (this.currentProgress < 0.25) return "Pagi";
        if (this.currentProgress < 0.5) return "Siang";
        if (this.currentProgress < 0.75) return "Sore";
        return "Malam";
    }

    /**
     * Get progress (0-1) dalam periode saat ini
     */
    public getPeriodProgress(): number {
        if (this.currentProgress < 0.25) return this.currentProgress / 0.25;
        if (this.currentProgress < 0.5)
            return (this.currentProgress - 0.25) / 0.25;
        if (this.currentProgress < 0.75)
            return (this.currentProgress - 0.5) / 0.25;
        return (this.currentProgress - 0.75) / 0.25;
    }

    /**
     * Utilities
     */
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    private interpolateColor(
        target: THREE.Color,
        colorA: THREE.Color,
        colorB: THREE.Color,
        t: number,
    ) {
        target.lerpColors(colorA, colorB, t);
    }

    /**
     * Smoothstep interpolation (curved easing)
     * Memberikan transisi yang lebih smooth antara keyframes
     */
    private smoothstep(x: number, a: number, b: number): number {
        if (x <= a) return 0;
        if (x >= b) return 1;

        const t = (x - a) / (b - a);
        return t * t * (3 - 2 * t); // Cubic Hermite
    }

    /**
     * Smootherstep (Ken Perlin quintic S-curve)
     * Memberikan transisi dengan zero first & second derivatives di batas akhir
     */
    private smootherstep(x: number, a: number, b: number): number {
        if (x <= a) return 0;
        if (x >= b) return 1;

        const t = (x - a) / (b - a);
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Setter untuk custom cycle duration (testing/debug)
     */
    public setCycleDuration(seconds: number) {
        this.cycleDuration = seconds;
    }

    /**
     * Getter untuk current progress
     */
    public getProgress(): number {
        return this.currentProgress;
    }

    /**
     * Reset cycle ke awal
     */
    public reset() {
        this.startTime = performance.now();
        this.currentProgress = 0;
        this.initializeValues();
    }
}

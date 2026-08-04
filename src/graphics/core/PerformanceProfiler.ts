/**
 * PerformanceProfiler.ts
 * A high-accuracy performance profiling and diagnostics utility for Three.js,
 * Web Workers, animations, skills, targeting, and physics tick tracking.
 * 
 * Usage:
 * 1. Import `perfProfiler` in `renderer.ts` or `main.ts`
 * 2. Call `perfProfiler.startFrame()` at the beginning of the render loop.
 * 3. Call `perfProfiler.endFrame()` at the end of the render loop.
 * 4. Call specific markers: `perfProfiler.trackAnimUpdate()`, `perfProfiler.trackSkillFX(...)`, etc.
 */

import * as THREE from "three";

export interface ProfilerReport {
    timestamp: number;
    fps: number;
    frameTimeMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
    workerTickTimeMs: number;
    systems: {
        animationsMs: number;
        billboardsMs: number;
        movementPhysicsMs: number;
        targetingMs: number;
        renderTimeMs: number;
    };
    activity: {
        skillsTriggered: Record<string, number>;
        basicAttacks: number;
        activeStuns: number;
        activeBuffs: number;
        activeDeaths: number;
    };
    bottlenecks: string[];
}

// Rolling window — 60 frames (~1s at 60fps) to match what the eye perceives
const FPS_WINDOW = 60;

class PerformanceProfiler {
    private isProfiling = false;
    private logHistory: ProfilerReport[] = [];
    private maxHistory = 1000; // Simpan 1000 frame terakhir
    private isSkeletonMode = false;

    // rAF-to-rAF ring buffer — the only accurate way to measure FPS
    // (CPU work time alone excludes vSync wait, giving falsely high numbers)
    private frameTimes: number[] = [];
    private prevRafTs = 0;

    // Wall-clock start of CPU work (for renderTimeMs only, NOT for fps)
    private frameStart = 0;

    private systemTimes = {
        animations: 0,
        billboards: 0,
        movementPhysics: 0,
        targeting: 0,
        render: 0
    };

    private activityMetrics = {
        skillsTriggered: {} as Record<string, number>,
        basicAttacks: 0,
        activeStuns: 0,
        activeBuffs: 0,
        activeDeaths: 0
    };

    private lastWorkerTickTime = 0;
    private webGLRendererRef: THREE.WebGLRenderer | null = null;

    constructor() {
        // Expose to window for console control
        if (typeof window !== "undefined") {
            (window as any).perfProfiler = this;
            console.log("🚀 Performance Profiler Initialized. Type `perfProfiler.exportReport()` in console to download performance diagnostics data.");
        }
    }

    public setRenderer(renderer: THREE.WebGLRenderer) {
        this.webGLRendererRef = renderer;
    }

    public setSkeletonMode(enabled: boolean) {
        this.isSkeletonMode = enabled;
    }

    /**
     * Call with the rAF `timestamp` argument — this is the inter-frame clock
     * the browser itself uses, so it matches hardware overlays and DevTools FPS.
     * Passing performance.now() here would include vSync wait and report 2-3x
     * the real FPS (e.g. 192 instead of 60 on a 60Hz display).
     */
    public startFrame(rafTimestamp?: number) {
        this.frameStart = performance.now(); // CPU work start

        if (rafTimestamp !== undefined && rafTimestamp > 0) {
            if (this.prevRafTs > 0) {
                const dt = rafTimestamp - this.prevRafTs;
                // Ignore tab-wake spikes (>5s gap) which would collapse the average
                if (dt > 0 && dt < 5000) {
                    this.frameTimes.push(dt);
                    if (this.frameTimes.length > FPS_WINDOW) this.frameTimes.shift();
                }
            }
            this.prevRafTs = rafTimestamp;
        }

        // Reset per-frame activity counters
        this.activityMetrics.basicAttacks = 0;
        this.activityMetrics.skillsTriggered = {};
    }

    public endFrame() {
        const cpuWorkMs = performance.now() - this.frameStart; // CPU time only

        if (!this.isProfiling) return;

        // Use rAF-to-rAF interval for FPS — matches what the device actually displays
        // Fallback to cpuWorkMs only if no rAF timestamps recorded yet
        const lastDt = this.frameTimes.length > 0
            ? this.frameTimes[this.frameTimes.length - 1]
            : cpuWorkMs;
        const fps = this._smoothedFps();

        // Ambil info dari renderer Three.js
        let drawCalls = 0;
        let triangles = 0;
        let geometries = 0;
        let textures = 0;
        let programs = 0;

        if (this.webGLRendererRef) {
            drawCalls = this.webGLRendererRef.info.render.calls;
            triangles = this.webGLRendererRef.info.render.triangles;
            geometries = this.webGLRendererRef.info.memory.geometries;
            textures = this.webGLRendererRef.info.memory.textures;
            programs = this.webGLRendererRef.info.programs ? this.webGLRendererRef.info.programs.length : 0;
        }

        const frameTimeMs = this.frameTimes.length > 0
            ? this.frameTimes[this.frameTimes.length - 1]
            : cpuWorkMs;

        const report: ProfilerReport = {
            timestamp: Date.now(),
            fps: Math.round(fps),
            frameTimeMs: parseFloat(frameTimeMs.toFixed(2)),
            drawCalls,
            triangles,
            geometries,
            textures,
            programs,
            workerTickTimeMs: this.lastWorkerTickTime,
            systems: {
                animationsMs: parseFloat(this.systemTimes.animations.toFixed(2)),
                billboardsMs: parseFloat(this.systemTimes.billboards.toFixed(2)),
                movementPhysicsMs: parseFloat(this.systemTimes.movementPhysics.toFixed(2)),
                targetingMs: parseFloat(this.systemTimes.targeting.toFixed(2)),
                renderTimeMs: parseFloat(cpuWorkMs.toFixed(2))
            },
            activity: {
                skillsTriggered: { ...this.activityMetrics.skillsTriggered },
                basicAttacks: this.activityMetrics.basicAttacks,
                activeStuns: this.activityMetrics.activeStuns,
                activeBuffs: this.activityMetrics.activeBuffs,
                activeDeaths: this.activityMetrics.activeDeaths
            },
            bottlenecks: this.detectBottlenecks(fps, frameTimeMs, drawCalls, triangles)
        };

        this.logHistory.push(report);
        if (this.logHistory.length > this.maxHistory) {
            this.logHistory.shift();
        }

        // Reset times
        this.systemTimes.animations = 0;
        this.systemTimes.billboards = 0;
        this.systemTimes.movementPhysics = 0;
        this.systemTimes.targeting = 0;
    }

    // System duration trackers
    public trackSystemTime(systemName: keyof typeof PerformanceProfiler.prototype.systemTimes, durationMs: number) {
        this.systemTimes[systemName] = durationMs;
    }

    public setWorkerTickTime(durationMs: number) {
        this.lastWorkerTickTime = durationMs;
    }

    // Event & action triggers
    public logSkill(skillName: string) {
        this.activityMetrics.skillsTriggered[skillName] = (this.activityMetrics.skillsTriggered[skillName] || 0) + 1;
    }

    public logBasicAttack() {
        this.activityMetrics.basicAttacks++;
    }

    public setSimulationStates(stuns: number, buffs: number, deaths: number) {
        this.activityMetrics.activeStuns = stuns;
        this.activityMetrics.activeBuffs = buffs;
        this.activityMetrics.activeDeaths = deaths;
    }

    /** Live FPS reading for HUD — same rolling average used in logged data. */
    public getLiveFps(): number {
        return Math.round(this._smoothedFps());
    }

    /** 1000 / mean(frameTimes) — harmonic mean of FPS, matches browser/overlay display */
    private _smoothedFps(): number {
        const n = this.frameTimes.length;
        if (n === 0) return 0;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += this.frameTimes[i];
        return 1000 / (sum / n);
    }

    public startLogging() {
        this.isProfiling = true;
        this.logHistory = [];
        this.frameTimes = [];
        this.prevRafTs = 0;
        console.log("📊 Performance recording STARTED.");
    }

    public stopLogging() {
        this.isProfiling = false;
        console.log("📊 Performance recording STOPPED.");
    }

    private detectBottlenecks(fps: number, frameTimeMs: number, drawCalls: number, triangles: number): string[] {
        const issues: string[] = [];
        // Threshold: 55fps gives ~8% headroom below 60Hz vSync — avoids false alarms
        // where the rolling average naturally sits at 59.8 on a 60Hz display.
        // ponytail: hardcoded 55 — upgrade path is user-configurable targetFps field
        if (fps > 0 && fps < 55) {
            issues.push(`Low FPS (${Math.round(fps)} fps, frame ${Math.round(frameTimeMs)}ms)`);
        }
        if (drawCalls > 150) {
            issues.push(`High Draw Calls (${drawCalls}) - CPU/GPU overhead`);
        }
        if (triangles > 500000) {
            issues.push(`High Triangle Count (${triangles}) - GPU geometry limit`);
        }
        
        // Threshold: Skeletal animations (CPU skinning/mixing) is heavier than VAT (GPU shader uniform updates)
        const animThreshold = this.isSkeletonMode ? 4.0 : 1.5;
        if (this.systemTimes.animations > animThreshold) {
            const animType = this.isSkeletonMode ? "Skeletal CPU Animation" : "VAT GPU Animation";
            issues.push(`${animType} bottleneck (${this.systemTimes.animations.toFixed(1)}ms)`);
        }
        
        if (this.systemTimes.billboards > 3) {
            issues.push(`Billboard UI/Matrix computation bottleneck (${this.systemTimes.billboards.toFixed(1)}ms)`);
        }
        if (this.lastWorkerTickTime > 12) {
            issues.push(`Web Worker CPU simulation delay (${this.lastWorkerTickTime.toFixed(1)}ms)`);
        }
        return issues;
    }

    public exportReport() {
        if (this.logHistory.length === 0) {
            console.warn("No data captured yet. Run `perfProfiler.startLogging()` first.");
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.logHistory, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `battle_performance_diagnostics_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        console.log("⬇️ Performance report downloaded successfully.");
    }
}

export const perfProfiler = new PerformanceProfiler();

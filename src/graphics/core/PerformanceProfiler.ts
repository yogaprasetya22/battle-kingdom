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

class PerformanceProfiler {
    private isProfiling = false;
    private logHistory: ProfilerReport[] = [];
    private maxHistory = 1000; // Simpan 1000 frame terakhir

    // Ticks & timing accumulators
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

    public startFrame() {
        this.frameStart = performance.now();
        // Reset per-frame activity counters
        this.activityMetrics.basicAttacks = 0;
        this.activityMetrics.skillsTriggered = {};
    }

    public endFrame() {
        const frameEnd = performance.now();
        const frameTime = frameEnd - this.frameStart;
        const fps = frameTime > 0 ? 1000 / frameTime : 0;

        if (!this.isProfiling) return;

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

        const report: ProfilerReport = {
            timestamp: Date.now(),
            fps: Math.round(fps),
            frameTimeMs: parseFloat(frameTime.toFixed(2)),
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
                renderTimeMs: parseFloat((frameTime - (this.systemTimes.animations + this.systemTimes.billboards)).toFixed(2))
            },
            activity: {
                skillsTriggered: { ...this.activityMetrics.skillsTriggered },
                basicAttacks: this.activityMetrics.basicAttacks,
                activeStuns: this.activityMetrics.activeStuns,
                activeBuffs: this.activityMetrics.activeBuffs,
                activeDeaths: this.activityMetrics.activeDeaths
            },
            bottlenecks: this.detectBottlenecks(frameTime, drawCalls, triangles)
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

    public startLogging() {
        this.isProfiling = true;
        this.logHistory = [];
        console.log("📊 Performance recording STARTED.");
    }

    public stopLogging() {
        this.isProfiling = false;
        console.log("📊 Performance recording STOPPED.");
    }

    private detectBottlenecks(frameTime: number, drawCalls: number, triangles: number): string[] {
        const issues: string[] = [];
        if (frameTime > 16.67) {
            issues.push("Low FPS (Frame Time > 16.67ms)");
        }
        if (drawCalls > 150) {
            issues.push(`High Draw Calls (${drawCalls}) - CPU/GPU overhead`);
        }
        if (triangles > 500000) {
            issues.push(`High Triangle Count (${triangles}) - GPU geometry limit`);
        }
        if (this.systemTimes.animations > 4) {
            issues.push(`Skeletal Animation bottleneck (${this.systemTimes.animations.toFixed(1)}ms)`);
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

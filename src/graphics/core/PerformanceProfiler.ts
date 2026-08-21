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
    isSkeleton?: boolean;
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
    private isSkeletonMode = false;

    // rAF-to-rAF circular ring buffer — zero allocation
    private frameTimes: Float32Array = new Float32Array(FPS_WINDOW);
    private frameTimesIdx = 0;
    private frameTimesCount = 0;
    private prevRafTs = 0;

    // Wall-clock start of CPU work (for renderTimeMs only, NOT for fps)
    private frameStart = 0;

    private systemTimes = {
        animations: 0,
        billboards: 0,
        movementPhysics: 0,
        targeting: 0,
        render: 0,
        workerComm: 0,
        workerMsg: 0,
        netSync: 0,
    };

    private activityMetrics = {
        skillsTriggered: {} as Record<string, number>,
        basicAttacks: 0,
        activeStuns: 0,
        activeBuffs: 0,
        activeDeaths: 0,
    };

    private lastWorkerTickTime = 0;
    private webGLRendererRef: THREE.WebGLRenderer | null = null;
    private logCounter = 0;

    constructor() {
        // Expose to window for console control
        if (typeof window !== "undefined") {
            (window as any).perfProfiler = this;
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
        const now = performance.now();
        this.frameStart = now; // CPU work start

        // Use wall-clock time (performance.now() difference) to measure the actual rendering intervals.
        // This is immune to browser/compositor virtual timestamp alignment issues and accurately
        // captures frame drops caused by GPU/CPU load.
        if (this.prevRafTs > 0) {
            const dt = now - this.prevRafTs;
            // Ignore tab-wake spikes (>5s gap) which would collapse the average
            if (dt > 0 && dt < 5000) {
                // ponytail: circular buffer write — zero dynamic array shift/push overhead.
                this.frameTimes[this.frameTimesIdx] = dt;
                this.frameTimesIdx = (this.frameTimesIdx + 1) % FPS_WINDOW;
                if (this.frameTimesCount < FPS_WINDOW) {
                    this.frameTimesCount++;
                }
            }
        }
        this.prevRafTs = now;

        // Reset per-frame activity counters
        this.activityMetrics.basicAttacks = 0;
        this.activityMetrics.skillsTriggered = {};
    }

    public endFrame() {
        // Periodically log profiling breakdown (every 300 frames ~ 5 seconds)
        this.logCounter++;
        if (this.logCounter >= 300) {
            this.logCounter = 0;
            this.printProfilingBreakdown();
        }

        // Reset system times for next frame
        this.systemTimes.animations = 0;
        this.systemTimes.billboards = 0;
        this.systemTimes.movementPhysics = 0;
        this.systemTimes.targeting = 0;
        this.systemTimes.workerComm = 0;
        this.systemTimes.workerMsg = 0;
        this.systemTimes.netSync = 0;
        this.systemTimes.render = 0;
    }

    public startLogging() {
        this.isProfiling = true;
    }

    public stopLogging() {
        this.isProfiling = false;
    }

    // System duration trackers
    public trackSystemTime(
        systemName: keyof typeof PerformanceProfiler.prototype.systemTimes,
        durationMs: number,
    ) {
        this.systemTimes[systemName] = durationMs;
    }

    public getSystemTime(systemName: keyof typeof PerformanceProfiler.prototype.systemTimes): number {
        return this.systemTimes[systemName];
    }

    public setWorkerTickTime(durationMs: number) {
        this.lastWorkerTickTime = durationMs;
    }

    // Event & action triggers
    public logSkill(skillName: string) {
        this.activityMetrics.skillsTriggered[skillName] =
            (this.activityMetrics.skillsTriggered[skillName] || 0) + 1;
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

    /** Live Frame Time reading for HUD (Latency) */
    public getLastFrameTime(): number {
        if (this.frameTimesCount > 0) {
            // Get the last written element: (index - 1 + length) % length
            const lastIdx = (this.frameTimesIdx - 1 + FPS_WINDOW) % FPS_WINDOW;
            return this.frameTimes[lastIdx];
        }
        return 16.67; // Default 60Hz fallback
    }

    /** 1000 / mean(frameTimes) — harmonic mean of FPS, matches browser/overlay display */
    private _smoothedFps(): number {
        const n = this.frameTimesCount;
        if (n === 0) return 0;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += this.frameTimes[i];
        return 1000 / (sum / n);
    }

    private printProfilingBreakdown() {
        const totalMeasured = 
            this.systemTimes.workerComm +
            this.systemTimes.workerMsg +
            this.systemTimes.netSync +
            this.systemTimes.render +
            this.systemTimes.animations;

        if (totalMeasured <= 0) return;

        const pWorkerComm = (this.systemTimes.workerComm / totalMeasured) * 100;
        const pWorkerMsg = (this.systemTimes.workerMsg / totalMeasured) * 100;
        const pNetSync = (this.systemTimes.netSync / totalMeasured) * 100;
        const pRender = (this.systemTimes.render / totalMeasured) * 100;
        const pAnim = (this.systemTimes.animations / totalMeasured) * 100;

        console.log(`%c[PerfProfiler] FRAME TIME BREAKDOWN (Total CPU/Render: ${totalMeasured.toFixed(2)}ms)
  - Worker postMessage (Tick Dispatch): ${this.systemTimes.workerComm.toFixed(2)}ms (${pWorkerComm.toFixed(1)}%)
  - Worker onMessage (Response Handling): ${this.systemTimes.workerMsg.toFixed(2)}ms (${pWorkerMsg.toFixed(1)}%)
  - Network state sync: ${this.systemTimes.netSync.toFixed(2)}ms (${pNetSync.toFixed(1)}%)
  - GPU Render: ${this.systemTimes.render.toFixed(2)}ms (${pRender.toFixed(1)}%)
  - Skeletal Animations LOD / Blend: ${this.systemTimes.animations.toFixed(2)}ms (${pAnim.toFixed(1)}%)
  - Live FPS: ${this.getLiveFps()} FPS`, "color: #00dfff; font-weight: bold;");
    }
}

export const perfProfiler = new PerformanceProfiler();

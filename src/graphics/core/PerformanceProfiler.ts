/**
 * PerformanceProfiler.ts — Runtime diagnostic untuk identifikasi bottleneck FPS.
 *
 * Dipanggil dari render loop. Mengukur:
 *   - Frame time total vs budget 16.67ms
 *   - Unit update time (CPU — simulation + animation)
 *   - Render time (GPU — WebGL draw)
 *   - Spatial clustering density (berapa unit menumpuk)
 *   - Draw calls & triangles
 *
 * Mode: sampling setiap N frame, akumulasi min/max/avg.
 * Report bisa dipanggil manual via console: `window.__profiler.report()`
 */

// ── Types ──
export interface ProfilerSnapshot {
    frameTimeMs: number;
    unitUpdateMs: number;
    renderMs: number;
    clusterScore: number; // 0..1, semakin tinggi = semakin padat
    clusteredUnitCount: number; // jumlah unit dalam radius 3m dari unit lain
    drawCalls: number;
    triangles: number;
    fps: number;
}

interface ProfilerStats {
    min: ProfilerSnapshot;
    max: ProfilerSnapshot;
    avg: ProfilerSnapshot;
    samples: number;
    overBudgetFrames: number; // frame > 16.67ms
}

// ── Singleton ──
let _instance: PerformanceProfiler | null = null;

export class PerformanceProfiler {
    // ── Config ──
    private readonly SAMPLE_INTERVAL = 10; // sample setiap 10 frame
    private readonly FRAME_BUDGET_MS = 1000 / 60;
    private readonly CLUSTER_RADIUS = 3.0;
    private readonly CLUSTER_RADIUS_SQ = 9.0; // 3^2
    private readonly MAX_SAMPLES = 120; // rolling window ~2 detik

    // ── State ──
    private _frameCount = 0;
    private _snapshots: ProfilerSnapshot[] = [];
    private _stats: ProfilerStats | null = null;
    private _enabled = false;
    private _unitPositions: Float32Array | null = null;
    private _getDrawCalls: () => number = () => 0;
    private _getTriangles: () => number = () => 0;
    private _stride = 15;

    // ── Per-frame accumulators ──
    private _frameStart = 0;
    private _unitUpdateStart = 0;
    private _unitUpdateAccum = 0;

    // ── Public API ──

    static getInstance(): PerformanceProfiler {
        if (!_instance) _instance = new PerformanceProfiler();
        return _instance;
    }

    /** Panggil sekali saat init renderer */
    setup(
        getDrawCalls: () => number,
        getTriangles: () => number,
        stride: number,
    ): void {
        this._getDrawCalls = getDrawCalls;
        this._getTriangles = getTriangles;
        this._stride = stride;
    }

    enable(): void {
        this._enabled = true;
    }
    disable(): void {
        this._enabled = false;
    }
    isEnabled(): boolean {
        return this._enabled;
    }

    /** Panggil dari render loop SEBELUM updateFrame */
    frameStart(sharedData: Float32Array | null): void {
        if (!this._enabled) return;
        this._frameCount++;
        this._frameStart = performance.now();
        this._unitPositions = sharedData;
        // Reset accumulators per frame (bukan per sample — diakumulasi manual di unitUpdateStart/End)
    }

    /** Panggil SEBELUM updateFrame diproses */
    unitUpdateStart(): void {
        if (!this._enabled) return;
        this._unitUpdateStart = performance.now();
    }

    /** Panggil SETELAH updateFrame selesai */
    unitUpdateEnd(): void {
        if (!this._enabled) return;
        this._unitUpdateAccum += performance.now() - this._unitUpdateStart;
    }

    /** Panggil SETELAH renderer.render() — sample & reset */
    frameEnd(): void {
        if (!this._enabled) return;
        if (this._frameCount % this.SAMPLE_INTERVAL !== 0) {
            // Reset accumulators even on non-sample frames
            this._unitUpdateAccum = 0;
            return;
        }

        const now = performance.now();
        const totalMs = now - this._frameStart;
        const unitMs = this._unitUpdateAccum;
        const renderMs = totalMs - unitMs;

        // Analisis clustering dari posisi unit
        const { clusterScore, clusteredCount } = this._analyzeClustering();

        const snap: ProfilerSnapshot = {
            frameTimeMs: totalMs,
            unitUpdateMs: unitMs,
            renderMs: Math.max(0, renderMs),
            clusterScore,
            clusteredUnitCount: clusteredCount,
            drawCalls: this._getDrawCalls(),
            triangles: this._getTriangles(),
            fps: 1000 / Math.max(1, totalMs),
        };

        this._snapshots.push(snap);
        if (this._snapshots.length > this.MAX_SAMPLES) {
            this._snapshots.shift();
        }

        // Reset accumulators
        this._unitUpdateAccum = 0;
        this._recalcStats();
    }

    /** Dapatkan statistik terbaru */
    getStats(): ProfilerStats | null {
        return this._stats;
    }

    /** Print report ke console */
    report(): string {
        if (!this._stats || this._snapshots.length === 0) {
            return "[Profiler] No data yet. Tunggu beberapa detik...";
        }

        const s = this._stats;
        const lines: string[] = [];

        lines.push("═══════════════════════════════════════");
        lines.push("  PERFORMANCE PROFILER REPORT");
        lines.push("═══════════════════════════════════════");
        lines.push(
            `  Samples: ${s.samples} frames (interval: ${this.SAMPLE_INTERVAL})`,
        );
        lines.push(
            `  Over-budget frames: ${s.overBudgetFrames} (${((s.overBudgetFrames / s.samples) * 100).toFixed(1)}%)`,
        );
        lines.push("");
        lines.push("  ── Frame Time (target: <16.67ms) ──");
        lines.push(
            `    MIN: ${s.min.frameTimeMs.toFixed(2)}ms | AVG: ${s.avg.frameTimeMs.toFixed(2)}ms | MAX: ${s.max.frameTimeMs.toFixed(2)}ms`,
        );
        lines.push(
            `    FPS: MIN ${s.max.fps.toFixed(0)} | AVG ${s.avg.fps.toFixed(0)} | MAX ${s.min.fps.toFixed(0)}`,
        );
        lines.push("");
        lines.push("  ── CPU (Unit Update) ──");
        lines.push(
            `    MIN: ${s.min.unitUpdateMs.toFixed(2)}ms | AVG: ${s.avg.unitUpdateMs.toFixed(2)}ms | MAX: ${s.max.unitUpdateMs.toFixed(2)}ms`,
        );
        lines.push(
            `    % of frame: ${((s.avg.unitUpdateMs / s.avg.frameTimeMs) * 100).toFixed(1)}%`,
        );
        lines.push("");
        lines.push("  ── GPU (Render) ──");
        lines.push(
            `    MIN: ${s.min.renderMs.toFixed(2)}ms | AVG: ${s.avg.renderMs.toFixed(2)}ms | MAX: ${s.max.renderMs.toFixed(2)}ms`,
        );
        lines.push(
            `    Draw calls: MIN ${s.min.drawCalls} | AVG ${s.avg.drawCalls.toFixed(0)} | MAX ${s.max.drawCalls}`,
        );
        lines.push(
            `    Triangles: MIN ${s.min.triangles} | AVG ${s.avg.triangles.toFixed(0)} | MAX ${s.max.triangles}`,
        );
        lines.push("");
        lines.push("  ── Spatial Clustering (0=tersebar, 1=menumpuk) ──");
        lines.push(
            `    Cluster score: MIN ${s.min.clusterScore.toFixed(2)} | AVG ${s.avg.clusterScore.toFixed(2)} | MAX ${s.max.clusterScore.toFixed(2)}`,
        );
        lines.push(
            `    Clustered units: MIN ${s.min.clusteredUnitCount} | AVG ${s.avg.clusteredUnitCount.toFixed(0)} | MAX ${s.max.clusteredUnitCount}`,
        );
        lines.push("");
        lines.push("  ── DIAGNOSIS ──");
        lines.push(this._diagnose(s));
        lines.push("═══════════════════════════════════════");

        return lines.join("\n");
    }

    // ── Private ──

    /** Hitung berapa unit yang berdesakan dalam radius CLUSTER_RADIUS */
    private _analyzeClustering(): {
        clusterScore: number;
        clusteredCount: number;
    } {
        const data = this._unitPositions;
        if (!data) return { clusterScore: 0, clusteredCount: 0 };

        // Ambil sample unit hidup (max 100 untuk perf)
        const IDX_X = 0,
            IDX_HP = 3;
        const positions: { x: number; z: number }[] = [];
        const UNIT_COUNT = data.length / this._stride;

        for (let i = 0; i < UNIT_COUNT; i++) {
            const base = i * this._stride;
            if (data[base + IDX_HP] <= 0) continue;
            positions.push({
                x: data[base + IDX_X],
                z: data[base + IDX_X + 2], // IDX_Z = 2
            });
            if (positions.length >= 150) break; // cap sample size
        }

        if (positions.length < 2) return { clusterScore: 0, clusteredCount: 0 };

        // Hitung berapa unit punya tetangga dalam radius
        let clustered = 0;
        const R2 = this.CLUSTER_RADIUS_SQ;

        for (let i = 0; i < positions.length; i++) {
            const px = positions[i].x;
            const pz = positions[i].z;
            let hasNeighbor = false;

            // Cek 10 random tetangga untuk hemat
            const step = Math.max(1, Math.floor(positions.length / 10));
            for (let j = 0; j < positions.length; j += step) {
                if (i === j) continue;
                const dx = positions[j].x - px;
                const dz = positions[j].z - pz;
                if (dx * dx + dz * dz < R2) {
                    hasNeighbor = true;
                    break;
                }
            }

            if (hasNeighbor) clustered++;
        }

        return {
            clusterScore: clustered / positions.length,
            clusteredCount: clustered,
        };
    }

    private _recalcStats(): void {
        if (this._snapshots.length === 0) {
            this._stats = null;
            return;
        }

        const n = this._snapshots.length;
        let overBudget = 0;

        // Init with first snapshot
        const min: ProfilerSnapshot = { ...this._snapshots[0] };
        const max: ProfilerSnapshot = { ...this._snapshots[0] };
        const sum: ProfilerSnapshot = {
            frameTimeMs: 0,
            unitUpdateMs: 0,
            renderMs: 0,
            clusterScore: 0,
            clusteredUnitCount: 0,
            drawCalls: 0,
            triangles: 0,
            fps: 0,
        };

        for (const s of this._snapshots) {
            if (s.frameTimeMs > this.FRAME_BUDGET_MS) overBudget++;

            min.frameTimeMs = Math.min(min.frameTimeMs, s.frameTimeMs);
            min.unitUpdateMs = Math.min(min.unitUpdateMs, s.unitUpdateMs);
            min.renderMs = Math.min(min.renderMs, s.renderMs);
            min.clusterScore = Math.min(min.clusterScore, s.clusterScore);
            min.clusteredUnitCount = Math.min(
                min.clusteredUnitCount,
                s.clusteredUnitCount,
            );
            min.drawCalls = Math.min(min.drawCalls, s.drawCalls);
            min.triangles = Math.min(min.triangles, s.triangles);

            max.frameTimeMs = Math.max(max.frameTimeMs, s.frameTimeMs);
            max.unitUpdateMs = Math.max(max.unitUpdateMs, s.unitUpdateMs);
            max.renderMs = Math.max(max.renderMs, s.renderMs);
            max.clusterScore = Math.max(max.clusterScore, s.clusterScore);
            max.clusteredUnitCount = Math.max(
                max.clusteredUnitCount,
                s.clusteredUnitCount,
            );
            max.drawCalls = Math.max(max.drawCalls, s.drawCalls);
            max.triangles = Math.max(max.triangles, s.triangles);

            sum.frameTimeMs += s.frameTimeMs;
            sum.unitUpdateMs += s.unitUpdateMs;
            sum.renderMs += s.renderMs;
            sum.clusterScore += s.clusterScore;
            sum.clusteredUnitCount += s.clusteredUnitCount;
            sum.drawCalls += s.drawCalls;
            sum.triangles += s.triangles;
        }

        min.fps = 1000 / Math.max(1, max.frameTimeMs);
        max.fps = 1000 / Math.max(1, min.frameTimeMs);
        sum.fps = min.fps + max.fps; // placeholder

        const avg: ProfilerSnapshot = {
            frameTimeMs: sum.frameTimeMs / n,
            unitUpdateMs: sum.unitUpdateMs / n,
            renderMs: sum.renderMs / n,
            clusterScore: sum.clusterScore / n,
            clusteredUnitCount: sum.clusteredUnitCount / n,
            drawCalls: sum.drawCalls / n,
            triangles: sum.triangles / n,
            fps: 1000 / Math.max(1, sum.frameTimeMs / n),
        };

        this._stats = {
            min,
            max,
            avg,
            samples: n,
            overBudgetFrames: overBudget,
        };
    }

    private _diagnose(s: ProfilerStats): string {
        const issues: string[] = [];

        // Cek frame time
        if (s.avg.frameTimeMs > this.FRAME_BUDGET_MS) {
            issues.push(
                `❌ FRAME OVER-BUDGET: avg ${s.avg.frameTimeMs.toFixed(1)}ms > ${this.FRAME_BUDGET_MS.toFixed(1)}ms budget`,
            );
        }

        // Cek CPU vs GPU bottleneck
        const cpuRatio = s.avg.unitUpdateMs / Math.max(0.1, s.avg.frameTimeMs);
        const gpuRatio = s.avg.renderMs / Math.max(0.1, s.avg.frameTimeMs);

        if (cpuRatio > 0.6) {
            issues.push(
                `🔴 CPU-BOUND: unit update ${(cpuRatio * 100).toFixed(0)}% frame time — kurangi beban simulasi/animation mixer`,
            );
        }
        if (gpuRatio > 0.6) {
            issues.push(
                `🔴 GPU-BOUND: render ${(gpuRatio * 100).toFixed(0)}% frame time — kurangi draw calls/triangles`,
            );
        }

        // Cek clustering
        if (s.avg.clusterScore > 0.5) {
            issues.push(
                `🟡 HIGH CLUSTERING: ${(s.avg.clusterScore * 100).toFixed(0)}% unit berdesakan — perbesar SEPARATION_RADIUS/STRENGTH`,
            );
        }
        if (s.max.clusterScore > 0.8) {
            issues.push(
                `🔴 EXTREME CLUSTERING: ${(s.max.clusterScore * 100).toFixed(0)}% unit menumpuk di titik sama — spawn spread/formasi terlalu sempit`,
            );
        }

        // Cek draw calls
        if (s.avg.drawCalls > 800) {
            issues.push(
                `🟡 HIGH DRAW CALLS: avg ${s.avg.drawCalls.toFixed(0)} — pertimbangkan instancing/merging mesh`,
            );
        }
        if (s.avg.drawCalls > 1500) {
            issues.push(
                `🔴 EXTREME DRAW CALLS: avg ${s.avg.drawCalls.toFixed(0)} — bottleneck WebGL state changes`,
            );
        }

        if (issues.length === 0) {
            issues.push(`✅ No major bottleneck detected. Frame time sehat.`);
        }

        return issues.join("\n    ");
    }
}

// ── Window binding untuk console ──
if (typeof window !== "undefined") {
    (window as any).__profiler = {
        report: () => {
            const report = PerformanceProfiler.getInstance().report();
            console.log(report);
            return report;
        },
        enable: () => PerformanceProfiler.getInstance().enable(),
        disable: () => PerformanceProfiler.getInstance().disable(),
    };
}

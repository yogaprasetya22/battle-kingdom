/**
 * PerformanceRecorder.ts — Perekam data performa real-time per-frame.
 *
 * Bukan sampling — setiap frame direkam. Ring buffer 600 frame (~10 detik @60fps).
 * Export via `window.__recorder.export()` → JSON lengkap untuk analisis spreadsheet.
 *
 * Dipanggil dari render loop. Overhead minimal: pre-allocated buffer, no GC.
 */

// ── Types ──

export interface FrameRecord {
    /** Frame timestamp relatif ke start recording (ms) */
    elapsedMs: number;
    /** Total frame time (delta * 1000) */
    frameTimeMs: number;
    /** Waktu dispatch worker tick → semua worker reply */
    simTickMs: number;
    /** Waktu updateFrame() — positioning, animation, mixer, billboards */
    unitUpdateMs: number;
    /** Waktu renderer.render() — GPU draw */
    renderMs: number;
    /** Jumlah activeFX saat ini */
    fxCount: number;
    /** Jumlah mixer.update() untuk tank yang diproses frame ini */
    tankMixerCount: number;
    /** Draw calls (renderer.info.render.calls) */
    drawCalls: number;
    /** Triangles (renderer.info.render.triangles) */
    triangles: number;
    /** FPS instant (1000 / frameTimeMs) */
    fps: number;
    /** Estimasi unit dalam radius 3m (cluster density proxy) */
    clusteredUnits: number;
    /** Total unit hidup */
    aliveUnits: number;
    /** Apakah frame ini over-budget (>16.67ms) */
    overBudget: boolean;
    /** Tick ID dari simulation */
    tickId: number;
}

export interface RecordingStats {
    durationMs: number;
    totalFrames: number;
    avgFps: number;
    minFps: number;
    maxFps: number;
    overBudgetPercent: number;
    avgFrameTimeMs: number;
    maxFrameTimeMs: number;
    avgSimTickMs: number;
    maxSimTickMs: number;
    avgUnitUpdateMs: number;
    maxUnitUpdateMs: number;
    avgRenderMs: number;
    maxRenderMs: number;
    avgDrawCalls: number;
    maxDrawCalls: number;
    avgTriangles: number;
    maxTriangles: number;
    avgFxCount: number;
    maxFxCount: number;
    avgTankMixerCount: number;
    maxTankMixerCount: number;
    avgClusteredUnits: number;
    maxClusteredUnits: number;
}

// ── Singleton ──

let _instance: PerformanceRecorder | null = null;

export class PerformanceRecorder {
    private readonly MAX_FRAMES = 3000; // ~25 detik @120fps — cukup untuk tangkap seluruh battle
    private readonly CLUSTER_RADIUS_SQ = 9.0; // 3m^2

    private _ringBuffer: FrameRecord[];
    private _writeIndex = 0;
    private _totalWritten = 0;
    private _startTime = 0;
    private _recording = false;

    // ── Accumulators (direset per frame) ──
    private _frameStart = 0;
    private _unitUpdateAccum = 0;
    private _simTickStart = 0;
    private _pendingSimTick = false;
    /** Last completed sim tick latency — persists across render frames sampai tick berikutnya selesai */
    private _lastSimTickMs = 0;

    private _getDrawCalls: () => number = () => 0;
    private _getTriangles: () => number = () => 0;
    private _getUnitData: () => Float32Array | null = () => null;
    private _getStride: () => number = () => 15;
    private _getUnitCount: () => number = () => 200;
    private _getAliveCount: () => number = () => 0;
    private _getTickId: () => number = () => 0;
    private _getTankMixerCount: () => number = () => 0;
    private _getActiveFXCount: () => number = () => 0;

    // ── Pre-allocated untuk clustering ──
    private _clusterPositions: { x: number; z: number }[] = [];

    constructor() {
        this._ringBuffer = new Array<FrameRecord>(this.MAX_FRAMES);
        // Pre-allocate untuk zero-GC
        for (let i = 0; i < this.MAX_FRAMES; i++) {
            this._ringBuffer[i] = {
                elapsedMs: 0,
                frameTimeMs: 0,
                simTickMs: 0,
                unitUpdateMs: 0,
                renderMs: 0,
                fxCount: 0,
                tankMixerCount: 0,
                drawCalls: 0,
                triangles: 0,
                fps: 0,
                clusteredUnits: 0,
                aliveUnits: 0,
                overBudget: false,
                tickId: 0,
            };
        }
        // Pre-allocate cluster positions array (max 200 unit)
        for (let i = 0; i < 200; i++) {
            this._clusterPositions.push({ x: 0, z: 0 });
        }
    }

    static getInstance(): PerformanceRecorder {
        if (!_instance) _instance = new PerformanceRecorder();
        return _instance;
    }

    /** Setup hooks — panggil sekali saat init */
    setup(opts: {
        getDrawCalls: () => number;
        getTriangles: () => number;
        getUnitData: () => Float32Array | null;
        getStride: () => number;
        getUnitCount: () => number;
        getAliveCount: () => number;
        getTickId: () => number;
        getTankMixerCount: () => number;
        getActiveFXCount: () => number;
    }): void {
        this._getDrawCalls = opts.getDrawCalls;
        this._getTriangles = opts.getTriangles;
        this._getUnitData = opts.getUnitData;
        this._getStride = opts.getStride;
        this._getUnitCount = opts.getUnitCount;
        this._getAliveCount = opts.getAliveCount;
        this._getTickId = opts.getTickId;
        this._getTankMixerCount = opts.getTankMixerCount;
        this._getActiveFXCount = opts.getActiveFXCount;
    }

    // ── Recording control ──

    start(): void {
        this._writeIndex = 0;
        this._totalWritten = 0;
        this._startTime = performance.now();
        this._recording = true;
        this._pendingSimTick = false;
        this._lastSimTickMs = 0;
        console.log(`[PerfRecorder] Recording started — ${this.MAX_FRAMES} frame buffer`);
    }

    stop(): RecordingStats {
        this._recording = false;
        const stats = this._computeStats();
        console.log(
            `[PerfRecorder] Recording stopped — ${this._totalWritten} frames, ${stats.durationMs.toFixed(0)}ms`,
        );
        return stats;
    }

    isRecording(): boolean {
        return this._recording;
    }

    // ── Frame lifecycle (dipanggil dari render loop) ──

    /** Panggil di awal render loop, sebelum apa pun */
    frameStart(): void {
        if (!this._recording) return;
        this._frameStart = performance.now();
        this._unitUpdateAccum = 0;
    }

    /** Panggil saat dispatch worker tick dimulai */
    simTickStart(): void {
        if (!this._recording) return;
        this._simTickStart = performance.now();
        this._pendingSimTick = true;
    }

    /** Panggil saat semua worker reply untuk tick ini — update _lastSimTickMs yang persisten */
    simTickEnd(): void {
        if (!this._recording || !this._pendingSimTick) return;
        this._lastSimTickMs = performance.now() - this._simTickStart;
        this._pendingSimTick = false;
    }

    /** Panggil sebelum updateFrame */
    unitUpdateStart(): void {
        if (!this._recording) return;
        this._frameStart = this._frameStart || performance.now(); // fallback
    }

    /** Panggil setelah updateFrame */
    unitUpdateEnd(): void {
        if (!this._recording) return;
        this._unitUpdateAccum = performance.now() - this._frameStart;
    }

    /** Panggil setelah renderer.render() — commit frame record */
    frameEnd(): void {
        if (!this._recording) return;

        const now = performance.now();
        const totalMs = now - this._frameStart;
        const unitMs = this._unitUpdateAccum;
        const renderMs = Math.max(0, totalMs - unitMs);
        const simMs = this._lastSimTickMs;
        const fxCount = this._getActiveFXCount();
        const tankCount = this._getTankMixerCount();
        const drawCalls = this._getDrawCalls();
        const triangles = this._getTriangles();
        const aliveUnits = this._getAliveCount();
        const tickId = this._getTickId();

        // Cluster analysis — O(n) dengan sample
        const clusteredUnits = this._countClusteredUnits();

        const record = this._ringBuffer[this._writeIndex];
        record.elapsedMs = now - this._startTime;
        record.frameTimeMs = totalMs;
        record.simTickMs = simMs;
        record.unitUpdateMs = unitMs;
        record.renderMs = renderMs;
        record.fxCount = fxCount;
        record.tankMixerCount = tankCount;
        record.drawCalls = drawCalls;
        record.triangles = triangles;
        record.fps = 1000 / Math.max(0.001, totalMs);
        record.clusteredUnits = clusteredUnits;
        record.aliveUnits = aliveUnits;
        record.overBudget = totalMs > 16.67;
        record.tickId = tickId;

        this._writeIndex = (this._writeIndex + 1) % this.MAX_FRAMES;
        this._totalWritten++;

        // Reset per-frame accumulators — _lastSimTickMs PERSISTS antar frame
        this._unitUpdateAccum = 0;
    }

    // ── Export ──

    /** Export semua frame sebagai JSON string */
    exportJSON(): string {
        const frames = this._getOrderedFrames();
        const stats = this._computeStats();
        return JSON.stringify(
            {
                meta: {
                    timestamp: new Date().toISOString(),
                    bufferSize: this.MAX_FRAMES,
                    totalFrames: this._totalWritten,
                    exportedFrames: frames.length,
                },
                stats,
                frames,
            },
            null,
            2,
        );
    }

    /** Download JSON file via browser */
    downloadJSON(filename?: string): void {
        const json = this.exportJSON();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || `perf-record-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log(
            `[PerfRecorder] Downloaded: ${a.download} (${(blob.size / 1024).toFixed(1)}KB)`,
        );
    }

    /** Export CSV untuk spreadsheet (columns: frame,elapsed,frameTime,fps,simTick,unitUpdate,render,fxCount,tankMixer,drawCalls,triangles,clustered,alive,overBudget,tickId) */
    exportCSV(): string {
        const frames = this._getOrderedFrames();
        const header =
            "frame,elapsedMs,frameTimeMs,fps,simTickMs,unitUpdateMs,renderMs,fxCount,tankMixerCount,drawCalls,triangles,clusteredUnits,aliveUnits,overBudget,tickId";
        const rows = frames.map((f, i) =>
            [
                i,
                f.elapsedMs.toFixed(1),
                f.frameTimeMs.toFixed(2),
                f.fps.toFixed(1),
                f.simTickMs.toFixed(2),
                f.unitUpdateMs.toFixed(2),
                f.renderMs.toFixed(2),
                f.fxCount,
                f.tankMixerCount,
                f.drawCalls,
                f.triangles,
                f.clusteredUnits,
                f.aliveUnits,
                f.overBudget ? 1 : 0,
                f.tickId,
            ].join(","),
        );
        return [header, ...rows].join("\n");
    }

    /** Print summary report ke console */
    report(): string {
        const s = this._computeStats();
        const frames = this._getOrderedFrames();

        // Temukan worst frames
        const sorted = [...frames]
            .sort((a, b) => b.frameTimeMs - a.frameTimeMs)
            .slice(0, 5);

        const lines: string[] = [];
        lines.push("═══════════════════════════════════════════");
        lines.push("  PERFORMANCE RECORDER — FULL REPORT");
        lines.push("═══════════════════════════════════════════");
        lines.push(`  Duration: ${(s.durationMs / 1000).toFixed(1)}s`);
        lines.push(`  Frames recorded: ${s.totalFrames}`);
        lines.push(
            `  FPS: AVG ${s.avgFps.toFixed(0)} | MIN ${s.minFps.toFixed(0)} | MAX ${s.maxFps.toFixed(0)}`,
        );
        lines.push(`  Over-budget: ${s.overBudgetPercent.toFixed(1)}%`);
        lines.push("");
        lines.push("  ── Frame Time ──");
        lines.push(
            `    AVG: ${s.avgFrameTimeMs.toFixed(2)}ms | MAX: ${s.maxFrameTimeMs.toFixed(2)}ms`,
        );
        lines.push("");
        lines.push("  ── Simulation Tick ──");
        lines.push(
            `    AVG: ${s.avgSimTickMs.toFixed(2)}ms | MAX: ${s.maxSimTickMs.toFixed(2)}ms`,
        );
        lines.push(
            `    % of frame: ${((s.avgSimTickMs / s.avgFrameTimeMs) * 100).toFixed(1)}%`,
        );
        lines.push("");
        lines.push("  ── Unit Update (Animation + Positioning) ──");
        lines.push(
            `    AVG: ${s.avgUnitUpdateMs.toFixed(2)}ms | MAX: ${s.maxUnitUpdateMs.toFixed(2)}ms`,
        );
        lines.push(
            `    % of frame: ${((s.avgUnitUpdateMs / s.avgFrameTimeMs) * 100).toFixed(1)}%`,
        );
        lines.push("");
        lines.push("  ── GPU Render ──");
        lines.push(
            `    AVG: ${s.avgRenderMs.toFixed(2)}ms | MAX: ${s.maxRenderMs.toFixed(2)}ms`,
        );
        lines.push(
            `    Draw calls: AVG ${s.avgDrawCalls.toFixed(0)} | MAX ${s.maxDrawCalls}`,
        );
        lines.push(
            `    Triangles: AVG ${s.avgTriangles.toFixed(0)} | MAX ${s.maxTriangles}`,
        );
        lines.push("");
        lines.push("  ── FX & Mixer ──");
        lines.push(
            `    Active FX: AVG ${s.avgFxCount.toFixed(0)} | MAX ${s.maxFxCount}`,
        );
        lines.push(
            `    Tank mixer/frame: AVG ${s.avgTankMixerCount.toFixed(0)} | MAX ${s.maxTankMixerCount}`,
        );
        lines.push("");
        lines.push("  ── Clustering ──");
        lines.push(
            `    Clustered units: AVG ${s.avgClusteredUnits.toFixed(0)} | MAX ${s.maxClusteredUnits}`,
        );
        lines.push("");
        lines.push("  ── Worst 5 Frames ──");
        sorted.forEach((f, i) => {
            lines.push(
                `    #${i + 1}: ${f.frameTimeMs.toFixed(1)}ms | FPS ${f.fps.toFixed(0)} | Sim:${f.simTickMs.toFixed(1)} Unit:${f.unitUpdateMs.toFixed(1)} Render:${f.renderMs.toFixed(1)} | FX:${f.fxCount} Tank:${f.tankMixerCount} | Draw:${f.drawCalls} Tri:${f.triangles} | Cluster:${f.clusteredUnits}`,
            );
        });
        lines.push("");
        lines.push("  ── DIAGNOSIS ──");
        lines.push(this._diagnose(s));
        lines.push("═══════════════════════════════════════════");

        return lines.join("\n");
    }

    // ── Private ──

    /** Ambil frame dalam urutan kronologis dari ring buffer */
    private _getOrderedFrames(): FrameRecord[] {
        const count = Math.min(this._totalWritten, this.MAX_FRAMES);
        const result: FrameRecord[] = [];

        if (this._totalWritten <= this.MAX_FRAMES) {
            // Belum wrap — ambil dari 0..writeIndex
            for (let i = 0; i < this._writeIndex; i++) {
                result.push(this._ringBuffer[i]);
            }
        } else {
            // Sudah wrap — ambil dari writeIndex..end lalu 0..writeIndex
            for (let i = this._writeIndex; i < this.MAX_FRAMES; i++) {
                result.push(this._ringBuffer[i]);
            }
            for (let i = 0; i < this._writeIndex; i++) {
                result.push(this._ringBuffer[i]);
            }
        }

        return result;
    }

    private _computeStats(): RecordingStats {
        const frames = this._getOrderedFrames();
        const n = frames.length;

        if (n === 0) {
            return {
                durationMs: 0,
                totalFrames: 0,
                avgFps: 0,
                minFps: 0,
                maxFps: 0,
                overBudgetPercent: 0,
                avgFrameTimeMs: 0,
                maxFrameTimeMs: 0,
                avgSimTickMs: 0,
                maxSimTickMs: 0,
                avgUnitUpdateMs: 0,
                maxUnitUpdateMs: 0,
                avgRenderMs: 0,
                maxRenderMs: 0,
                avgDrawCalls: 0,
                maxDrawCalls: 0,
                avgTriangles: 0,
                maxTriangles: 0,
                avgFxCount: 0,
                maxFxCount: 0,
                avgTankMixerCount: 0,
                maxTankMixerCount: 0,
                avgClusteredUnits: 0,
                maxClusteredUnits: 0,
            };
        }

        let sumFt = 0,
            sumSim = 0,
            sumUnit = 0,
            sumRender = 0,
            sumDC = 0,
            sumTri = 0,
            sumFx = 0,
            sumTank = 0,
            sumCluster = 0;
        let maxFt = 0,
            maxSim = 0,
            maxUnit = 0,
            maxRender = 0,
            maxDC = 0,
            maxTri = 0,
            maxFx = 0,
            maxTank = 0,
            maxCluster = 0;
        let minFps = Infinity,
            maxFps = -Infinity;
        let overBudget = 0;

        for (const f of frames) {
            sumFt += f.frameTimeMs;
            sumSim += f.simTickMs;
            sumUnit += f.unitUpdateMs;
            sumRender += f.renderMs;
            sumDC += f.drawCalls;
            sumTri += f.triangles;
            sumFx += f.fxCount;
            sumTank += f.tankMixerCount;
            sumCluster += f.clusteredUnits;

            if (f.frameTimeMs > maxFt) maxFt = f.frameTimeMs;
            if (f.simTickMs > maxSim) maxSim = f.simTickMs;
            if (f.unitUpdateMs > maxUnit) maxUnit = f.unitUpdateMs;
            if (f.renderMs > maxRender) maxRender = f.renderMs;
            if (f.drawCalls > maxDC) maxDC = f.drawCalls;
            if (f.triangles > maxTri) maxTri = f.triangles;
            if (f.fxCount > maxFx) maxFx = f.fxCount;
            if (f.tankMixerCount > maxTank) maxTank = f.tankMixerCount;
            if (f.clusteredUnits > maxCluster) maxCluster = f.clusteredUnits;

            if (f.fps < minFps) minFps = f.fps;
            if (f.fps > maxFps) maxFps = f.fps;
            if (f.overBudget) overBudget++;
        }

        return {
            durationMs:
                frames.length > 0 ? frames[frames.length - 1].elapsedMs : 0,
            totalFrames: n,
            avgFps: 1000 / (sumFt / n),
            minFps,
            maxFps,
            overBudgetPercent: (overBudget / n) * 100,
            avgFrameTimeMs: sumFt / n,
            maxFrameTimeMs: maxFt,
            avgSimTickMs: sumSim / n,
            maxSimTickMs: maxSim,
            avgUnitUpdateMs: sumUnit / n,
            maxUnitUpdateMs: maxUnit,
            avgRenderMs: sumRender / n,
            maxRenderMs: maxRender,
            avgDrawCalls: sumDC / n,
            maxDrawCalls: maxDC,
            avgTriangles: sumTri / n,
            maxTriangles: maxTri,
            avgFxCount: sumFx / n,
            maxFxCount: maxFx,
            avgTankMixerCount: sumTank / n,
            maxTankMixerCount: maxTank,
            avgClusteredUnits: sumCluster / n,
            maxClusteredUnits: maxCluster,
        };
    }

    /** Hitung unit berdesakan dalam radius 3m (sample-based untuk O(n)) */
    private _countClusteredUnits(): number {
        const data = this._getUnitData();
        if (!data) return 0;

        const stride = this._getStride();
        const unitCount = this._getUnitCount();
        const positions = this._clusterPositions;
        let posCount = 0;

        // Collect alive unit positions (cap 150)
        for (let i = 0; i < unitCount && posCount < 150; i++) {
            const base = i * stride;
            if (data[base + 3] <= 0) continue; // IDX_HP = 3
            positions[posCount].x = data[base + 0]; // IDX_X = 0
            positions[posCount].z = data[base + 2]; // IDX_Z = 2
            posCount++;
        }

        if (posCount < 2) return 0;

        let clustered = 0;
        const R2 = this.CLUSTER_RADIUS_SQ;
        const step = Math.max(1, Math.floor(posCount / 10));

        for (let i = 0; i < posCount; i++) {
            const px = positions[i].x;
            const pz = positions[i].z;
            for (let j = 0; j < posCount; j += step) {
                if (i === j) continue;
                const dx = positions[j].x - px;
                const dz = positions[j].z - pz;
                if (dx * dx + dz * dz < R2) {
                    clustered++;
                    break;
                }
            }
        }

        return clustered;
    }

    private _diagnose(s: RecordingStats): string {
        const issues: string[] = [];

        if (s.avgFrameTimeMs > 16.67) {
            issues.push(
                `❌ FRAME OVER-BUDGET: avg ${s.avgFrameTimeMs.toFixed(1)}ms`,
            );
        }

        const simRatio = s.avgSimTickMs / Math.max(0.1, s.avgFrameTimeMs);
        const unitRatio = s.avgUnitUpdateMs / Math.max(0.1, s.avgFrameTimeMs);
        const renderRatio = s.avgRenderMs / Math.max(0.1, s.avgFrameTimeMs);

        if (simRatio > 0.5) {
            issues.push(
                `🔴 SIM-BOUND: simulation tick ${(simRatio * 100).toFixed(0)}% — worker terlalu lambat`,
            );
        }
        if (unitRatio > 0.5) {
            issues.push(
                `🔴 UNIT-BOUND: unit update ${(unitRatio * 100).toFixed(0)}% — animation mixer/positioning bottleneck`,
            );
        }
        if (renderRatio > 0.5) {
            issues.push(
                `🔴 GPU-BOUND: render ${(renderRatio * 100).toFixed(0)}% — draw calls/triangles terlalu tinggi`,
            );
        }

        if (s.avgClusteredUnits > 50) {
            issues.push(
                `🟡 HIGH CLUSTERING: avg ${s.avgClusteredUnits.toFixed(0)} unit berdesakan`,
            );
        }

        if (s.maxTankMixerCount >= 80) {
            issues.push(
                `🟡 TANK MIXER CAP HIT: max ${s.maxTankMixerCount} — mixer throttle aktif, animasi bisa patah`,
            );
        }

        if (issues.length === 0) {
            issues.push("✅ No bottleneck detected.");
        }

        return issues.join("\n    ");
    }
}

// ── Window binding ──
if (typeof window !== "undefined") {
    (window as any).__recorder = {
        start: () => PerformanceRecorder.getInstance().start(),
        stop: () => PerformanceRecorder.getInstance().stop(),
        report: () => {
            const r = PerformanceRecorder.getInstance().report();
            console.log(r);
            return r;
        },
        exportJSON: () => {
            const j = PerformanceRecorder.getInstance().exportJSON();
            console.log(j);
            return j;
        },
        downloadJSON: (name?: string) =>
            PerformanceRecorder.getInstance().downloadJSON(name),
        exportCSV: () => {
            const csv = PerformanceRecorder.getInstance().exportCSV();
            console.log(csv);
            return csv;
        },
        isRecording: () => PerformanceRecorder.getInstance().isRecording(),
    };
}

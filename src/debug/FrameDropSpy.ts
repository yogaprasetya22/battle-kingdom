/**
 * FrameDropSpy.ts — Real-time performance profiling & session recorder.
 */

interface SpySample {
    last: number; peak: number; avg: number;
    buf: Float32Array; idx: number; count: number;
}

interface FrameRecord {
    timestamp: number;
    frameTime: number;
    fps: number;
    systems: Record<string, number>;
    isHost: boolean;
    activeProjectilesCount: number;
    networkPlayersCount: number;
}

const WINDOW = 60;
const SPIKE_MS = 20;

class FrameDropSpy {
    private systems = new Map<string, SpySample>();
    private frameStart = 0;
    private lastFrameMs = 0;
    private overlayEl: HTMLDivElement | null = null;
    private visible = true;
    private tick = 0;

    // Recording properties
    private isRecording = false;
    private records: FrameRecord[] = [];
    private recordBtn: HTMLButtonElement | null = null;

    // Context metadata
    public isHost = false;
    public activeProjectilesCount = 0;
    public networkPlayersCount = 0;

    constructor() {
        this._buildOverlay();
        (window as any).frameSpy = this;
        console.log('%c[FrameDropSpy] Active. window.frameSpy.toggle() to show/hide', 'color:#0ff;font-weight:bold');
    }

    private lastFrameTimeTs = 0;

    beginFrame() { 
        const now = performance.now();
        if (this.lastFrameTimeTs > 0) {
            this.lastFrameMs = now - this.lastFrameTimeTs;
        } else {
            this.lastFrameMs = 16.67; // fallback 60fps
        }
        this.lastFrameTimeTs = now;
        this.frameStart = now; 
    }

    endFrame() {
        // CPU active execution time for profiling breakdown
        const cpuElapsed = performance.now() - this.frameStart;
        this.systems.set('cpuActiveJS', { 
            last: cpuElapsed, 
            peak: Math.max(cpuElapsed, this.systems.get('cpuActiveJS')?.peak || 0), 
            avg: cpuElapsed, 
            buf: new Float32Array(1), idx: 0, count: 1 
        });
        
        if (this.lastFrameMs > SPIKE_MS) {
            this._spike();
        }

        if (this.isRecording) {
            const sysMap: Record<string, number> = {};
            this.systems.forEach((val, key) => {
                sysMap[key] = val.last;
            });
            this.records.push({
                timestamp: performance.now(),
                frameTime: this.lastFrameMs,
                fps: 1000 / Math.max(0.1, this.lastFrameMs),
                systems: sysMap,
                isHost: this.isHost,
                activeProjectilesCount: this.activeProjectilesCount,
                networkPlayersCount: this.networkPlayersCount
            });
        }

        if (++this.tick % 6 === 0 && this.visible) {
            this._draw();
        }
    }

    mark(): number { return performance.now(); }

    end(name: string, t0: number) {
        const ms = performance.now() - t0;
        let s = this.systems.get(name);
        if (!s) {
            s = { last:0, peak:0, avg:0, buf: new Float32Array(WINDOW), idx:0, count:0 };
            this.systems.set(name, s);
        }
        s.last = ms;
        s.buf[s.idx] = ms;
        s.idx = (s.idx + 1) % WINDOW;
        if (s.count < WINDOW) s.count++;
        let sum = 0, pk = 0;
        for (let i = 0; i < s.count; i++) { sum += s.buf[i]; if (s.buf[i] > pk) pk = s.buf[i]; }
        s.avg = sum / s.count; s.peak = pk;
    }

    toggle() {
        this.visible = !this.visible;
        if (this.overlayEl) this.overlayEl.style.display = this.visible ? 'block' : 'none';
    }

    // Record controls
    public startRecording() {
        this.records = [];
        this.isRecording = true;
        console.log('%c[FrameDropSpy] Recording started...', 'color:#4f9;font-weight:bold');
        this._updateBtnStyle();
    }

    public stopAndDownload() {
        this.isRecording = false;
        console.log(`%c[FrameDropSpy] Recording stopped. Captured ${this.records.length} frames. Downloading...`, 'color:#fa0;font-weight:bold');
        this._updateBtnStyle();

        if (this.records.length === 0) {
            alert("No data recorded!");
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
            sessionDate: new Date().toISOString(),
            totalFrames: this.records.length,
            records: this.records
        }, null, 2));
        
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `combat_perf_profile_${this.isHost ? 'host' : 'guest'}_${Date.now()}.json`);
        dlAnchorElem.click();
    }

    private _updateBtnStyle() {
        if (!this.recordBtn) return;
        if (this.isRecording) {
            this.recordBtn.textContent = "⏹ Stop & Download Profile";
            this.recordBtn.style.background = "#ff4d4d";
        } else {
            this.recordBtn.textContent = "🔴 Record Perf Profile";
            this.recordBtn.style.background = "#333";
        }
    }

    private _spike() {
        const rows: string[] = [];
        let measured = 0;
        const sorted = [...this.systems.entries()].sort((a,b) => b[1].last - a[1].last);
        for (const [n, s] of sorted) {
            if (s.last < 0.05) continue;
            rows.push(`  ${n.padEnd(24)}: ${s.last.toFixed(3).padStart(7)}ms  avg=${s.avg.toFixed(2)}ms  peak=${s.peak.toFixed(2)}ms`);
            measured += s.last;
        }
        rows.push(`  ${'[GPU/unaccounted]'.padEnd(24)}: ${Math.max(0, this.lastFrameMs - measured).toFixed(3).padStart(7)}ms`);
        console.warn(`%c[FrameDropSpy] SPIKE ${this.lastFrameMs.toFixed(2)}ms (~${(1000/this.lastFrameMs).toFixed(0)}fps)\n${rows.join('\n')}`, 'color:#f55;font-weight:bold');
    }

    private _buildOverlay() {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.85);color:#ddd;font:11px/1.6 monospace;padding:8px 12px;border-radius:7px;border:1px solid #333;min-width:280px;pointer-events:auto';
        
        const content = document.createElement('div');
        content.id = 'frame-spy-content';
        el.appendChild(content);

        // Record Button
        const btn = document.createElement('button');
        btn.style.cssText = 'width:100%;margin-top:8px;background:#333;border:1px solid #555;color:#fff;font:bold 10px monospace;padding:4px;border-radius:3px;cursor:pointer';
        btn.textContent = "🔴 Record Perf Profile";
        btn.onclick = () => {
            if (this.isRecording) {
                this.stopAndDownload();
            } else {
                this.startRecording();
            }
        };
        el.appendChild(btn);
        this.recordBtn = btn;

        document.body.appendChild(el);
        this.overlayEl = el;
    }

    private _draw() {
        const content = document.getElementById('frame-spy-content');
        if (!content) return;
        const fc = this.lastFrameMs > 20 ? '#f55' : this.lastFrameMs > 12 ? '#fa0' : '#4f9';
        let h = `<b style="color:${fc}">&#9203; ${this.lastFrameMs.toFixed(2)}ms &nbsp; ~${(1000/Math.max(0.1,this.lastFrameMs)).toFixed(0)} fps</b>`;
        h += `<div>Role: ${this.isHost ? '<span style="color:#0ff">Host</span>' : '<span style="color:#fa0">Guest</span>'}</div>`;
        h += `<div style="color:#888;font-size:9px">Proj: ${this.activeProjectilesCount} | Players: ${this.networkPlayersCount}</div>`;
        h += `<div style="color:#444;border-top:1px solid #222;margin:3px 0 4px;padding-top:3px;font-size:10px">per-system breakdown (last frame)</div>`;
        const sorted = [...this.systems.entries()].sort((a,b) => b[1].avg - a[1].avg);
        for (const [n, s] of sorted) {
            if (s.avg < 0.01) continue;
            const c = s.last > 4 ? '#f55' : s.last > 1 ? '#fa0' : '#4f9';
            h += `<div style="display:flex;gap:8px"><span style="color:#666;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n}</span><span style="color:${c};white-space:nowrap">${s.last.toFixed(2)}ms</span><span style="color:#444;white-space:nowrap;font-size:9px">avg${s.avg.toFixed(1)}</span></div>`;
        }
        content.innerHTML = h;
    }
}

export const frameSpy = new FrameDropSpy();

#!/usr/bin/env python3
"""
Performance Report Analyzer
Reads perf-record JSON, diagnoses bottlenecks, outputs decisions.
Usage: python scripts/analyze_perf.py public/report/perf-record-XXXX.json
"""

import json
import sys
import math
from collections import defaultdict
from pathlib import Path


FPS_TARGET = 60
BUDGET_MS = 1000 / FPS_TARGET  # 16.67ms
SIM_BUDGET_MS = BUDGET_MS * 0.6  # 10ms — sim should not eat >60% frame
GPU_BUDGET_MS = BUDGET_MS * 0.7  # 11.67ms — render should not eat >70% frame


def load_report(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0
    k = (len(sorted_vals) - 1) * p / 100
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def classify_bottleneck(f: dict) -> str:
    """Classify single frame bottleneck."""
    sim = f.get("simTickMs", 0)
    render = f.get("renderMs", 0)
    tank = f.get("tankMixerCount", 0)
    clustered = f.get("clusteredUnits", 0)

    reasons = []
    if sim > SIM_BUDGET_MS:
        reasons.append("SIM")
    if render > GPU_BUDGET_MS:
        reasons.append("GPU")
    if tank >= 70:
        reasons.append("MIXER_CAP")
    if clustered >= 80:
        reasons.append("CLUSTER")

    return "+".join(reasons) if reasons else "NONE"


def find_consecutive_runs(frames: list[dict], key: str = "overBudget") -> list[dict]:
    """Find consecutive runs where key is truthy."""
    runs = []
    start = None
    for i, f in enumerate(frames):
        if f.get(key):
            if start is None:
                start = i
        else:
            if start is not None:
                runs.append({
                    "start": start,
                    "end": i - 1,
                    "length": i - start,
                    "startElapsedMs": frames[start]["elapsedMs"],
                    "endElapsedMs": frames[i - 1]["elapsedMs"],
                })
                start = None
    if start is not None:
        runs.append({
            "start": start,
            "end": len(frames) - 1,
            "length": len(frames) - start,
            "startElapsedMs": frames[start]["elapsedMs"],
            "endElapsedMs": frames[-1]["elapsedMs"],
        })
    return runs


def pearson_r(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    std_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    std_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if std_x == 0 or std_y == 0:
        return 0
    return cov / (std_x * std_y)


def analyze(report: dict) -> str:
    stats = report["stats"]
    frames = report["frames"]
    n = len(frames)

    # ── sorted lists for percentiles ──
    frame_times = sorted(f["frameTimeMs"] for f in frames)
    sim_ticks = sorted(f["simTickMs"] for f in frames)
    render_times = sorted(f["renderMs"] for f in frames)
    unit_updates = sorted(f["unitUpdateMs"] for f in frames)
    draw_calls = sorted(f["drawCalls"] for f in frames)
    triangles = sorted(f["triangles"] for f in frames)
    tank_mixers = sorted(f["tankMixerCount"] for f in frames)
    clustered = sorted(f["clusteredUnits"] for f in frames)
    fps_vals = sorted(f["fps"] for f in frames)

    # ── bottleneck classification ──
    bottleneck_counts: dict[str, int] = defaultdict(int)
    for f in frames:
        bottleneck_counts[classify_bottleneck(f)] += 1

    # ── over-budget runs ──
    over_runs = find_consecutive_runs(frames, "overBudget")
    long_runs = [r for r in over_runs if r["length"] >= 30]  # >0.5s sustained

    # ── worst frames ──
    worst_frame_time = max(frames, key=lambda f: f["frameTimeMs"])
    worst_sim = max(frames, key=lambda f: f["simTickMs"])
    worst_render = max(frames, key=lambda f: f["renderMs"])

    # ── correlations ──
    ft = [f["frameTimeMs"] for f in frames]
    st = [f["simTickMs"] for f in frames]
    rt = [f["renderMs"] for f in frames]
    uu = [f["unitUpdateMs"] for f in frames]
    cu = [f["clusteredUnits"] for f in frames]
    tm = [f["tankMixerCount"] for f in frames]
    dc = [f["drawCalls"] for f in frames]
    tri = [f["triangles"] for f in frames]

    corr_sim_frame = pearson_r(st, ft)
    corr_render_frame = pearson_r(rt, ft)
    corr_cluster_render = pearson_r(cu, rt)
    corr_tank_unit = pearson_r(tm, uu)
    corr_cluster_frame = pearson_r(cu, ft)
    corr_draw_frame = pearson_r(dc, ft)

    # ── decision engine ──
    decisions: list[tuple[str, str]] = []  # (priority, recommendation)

    over_pct = stats["overBudgetPercent"]
    avg_fps = stats["avgFps"]
    min_fps = stats["minFps"]
    avg_sim = stats["avgSimTickMs"]
    avg_render = stats["avgRenderMs"]
    max_sim = stats["maxSimTickMs"]
    max_render = stats["maxRenderMs"]
    max_cluster = stats["maxClusteredUnits"]
    avg_cluster = stats["avgClusteredUnits"]
    max_tank = stats["maxTankMixerCount"]
    avg_tank = stats["avgTankMixerCount"]
    max_draw = stats["maxDrawCalls"]
    avg_draw = stats["avgDrawCalls"]
    max_tri = stats["maxTriangles"]
    avg_tri = stats["avgTriangles"]

    # Priority 1: SIM spikes causing severe frame drops
    sim_bound_pct = bottleneck_counts.get("SIM", 0) + bottleneck_counts.get("SIM+GPU", 0) + bottleneck_counts.get("SIM+GPU+MIXER_CAP", 0) + bottleneck_counts.get("SIM+GPU+CLUSTER", 0)
    sim_bound_pct = (sim_bound_pct / n) * 100

    if max_sim > 100 or sim_bound_pct > 30:
        decisions.append(("P1-CRITICAL", f"SIM-BOUND: maxSimTickMs={max_sim:.0f}ms, {sim_bound_pct:.0f}% frames SIM-heavy. Profile worker tick dispatch. Consider: batch unit updates, reduce per-tick entity count, stagger worker ticks."))

    # Priority 2: GPU bound
    gpu_bound_pct = bottleneck_counts.get("GPU", 0) + bottleneck_counts.get("SIM+GPU", 0) + bottleneck_counts.get("GPU+CLUSTER", 0) + bottleneck_counts.get("SIM+GPU+MIXER_CAP", 0)
    gpu_bound_pct = (gpu_bound_pct / n) * 100

    if max_render > 80 or gpu_bound_pct > 30:
        decisions.append(("P1-CRITICAL", f"GPU-BOUND: maxRenderMs={max_render:.0f}ms, {gpu_bound_pct:.0f}% frames GPU-heavy. avgDrawCalls={avg_draw:.0f}, maxDrawCalls={max_draw}, avgTri={avg_tri/1e6:.2f}M. Consider: VAT instanced rendering, LOD reduction, frustum cull aggressiveness."))

    # Priority 3: Tank mixer cap hit
    if max_tank >= 75 or avg_tank > 50:
        decisions.append(("P2-HIGH", f"MIXER CAP HIT: max={max_tank}, avg={avg_tank:.0f}. Tank mixer throttle at limit. Consider: raise MAX_TANK_MIXER_PER_FRAME >80, or prioritize nearest-to-camera tanks, or simplify tank animation blend tree."))

    # Priority 4: High clustering
    if max_cluster > 80 or avg_cluster > 50:
        corr_str = f"cluster→render r={corr_cluster_render:.2f}"
        decisions.append(("P2-HIGH", f"HIGH CLUSTERING: max={max_cluster}, avg={avg_cluster:.0f} units within 3m. {corr_str}. Consider: spread spawn positions, reduce unit density, or instanced crowd rendering."))

    # Priority 5: Sustained frame drops
    if long_runs:
        longest = max(long_runs, key=lambda r: r["length"])
        decisions.append(("P2-HIGH", f"SUSTAINED DROPS: {len(long_runs)} runs of ≥30 consecutive over-budget frames. Longest: {longest['length']} frames ({longest['length']/60:.1f}s). Investigate what triggers these runs."))

    # Priority 6: Draw calls / triangles
    if max_draw > 700 or max_tri > 1_300_000:
        decisions.append(("P3-MEDIUM", f"DRAW CALLS: avg={avg_draw:.0f}, max={max_draw}. TRIANGLES: avg={avg_tri/1e6:.2f}M, max={max_tri/1e6:.2f}M. Consider: merge static geometry, reduce shadow maps, limit visible units."))

    # Priority 7: Overall FPS
    if avg_fps < 55:
        decisions.append(("P3-MEDIUM", f"LOW AVG FPS: {avg_fps:.1f} (target 60). {over_pct:.1f}% frames over budget. minFps={min_fps:.1f}. Root cause above."))

    # ── build output ──
    lines: list[str] = []
    sep = "=" * 70

    lines.append(sep)
    lines.append("  PERFORMANCE REPORT ANALYSIS")
    lines.append(sep)
    lines.append(f"  File:         {report['meta'].get('timestamp', 'N/A')}")
    lines.append(f"  Frames:       {n} exported / {report['meta']['totalFrames']} total")
    lines.append(f"  Duration:     {stats['durationMs']/1000:.1f}s")
    lines.append(sep)

    # ── FPS summary ──
    lines.append("")
    lines.append("── FPS ──")
    lines.append(f"  avg={avg_fps:.1f}  min={min_fps:.1f}  max={stats['maxFps']:.1f}")
    lines.append(f"  p50={percentile(fps_vals, 50):.1f}  p10={percentile(fps_vals, 10):.1f}  p1={percentile(fps_vals, 1):.1f}")
    lines.append(f"  overBudget: {over_pct:.1f}% frames  ({sum(1 for f in frames if f['overBudget'])}/{n})")

    # ── Frame time breakdown ──
    lines.append("")
    lines.append("── FRAME TIME (ms) ──")
    lines.append(f"  {'':>12} {'avg':>8} {'p95':>8} {'p99':>8} {'max':>8}")
    lines.append(f"  {'frameTime':>12} {stats['avgFrameTimeMs']:8.2f} {percentile(frame_times, 95):8.2f} {percentile(frame_times, 99):8.2f} {stats['maxFrameTimeMs']:8.2f}")
    lines.append(f"  {'simTick':>12} {avg_sim:8.2f} {percentile(sim_ticks, 95):8.2f} {percentile(sim_ticks, 99):8.2f} {max_sim:8.2f}")
    lines.append(f"  {'unitUpdate':>12} {stats['avgUnitUpdateMs']:8.2f} {percentile(unit_updates, 95):8.2f} {percentile(unit_updates, 99):8.2f} {stats['maxUnitUpdateMs']:8.2f}")
    lines.append(f"  {'render':>12} {avg_render:8.2f} {percentile(render_times, 95):8.2f} {percentile(render_times, 99):8.2f} {max_render:8.2f}")

    # ── GPU metrics ──
    lines.append("")
    lines.append("── GPU ──")
    lines.append(f"  drawCalls:  avg={avg_draw:.0f}  max={max_draw}  p95={percentile(draw_calls, 95):.0f}")
    lines.append(f"  triangles:  avg={avg_tri/1e6:.2f}M  max={max_tri/1e6:.2f}M  p95={percentile(triangles, 95)/1e6:.2f}M")

    # ── Unit metrics ──
    lines.append("")
    lines.append("── UNITS ──")
    lines.append(f"  clustered:  avg={avg_cluster:.1f}  max={max_cluster}  p95={percentile(clustered, 95):.0f}")
    lines.append(f"  tankMixer:  avg={avg_tank:.1f}  max={max_tank}  p95={percentile(tank_mixers, 95):.0f}")
    lines.append(f"  fxCount:    avg={stats['avgFxCount']:.1f}  max={stats['maxFxCount']}")

    # ── Bottleneck distribution ──
    lines.append("")
    lines.append("── BOTTLENECK DISTRIBUTION ──")
    total_bn = sum(bottleneck_counts.values())
    for bn, cnt in sorted(bottleneck_counts.items(), key=lambda x: -x[1]):
        pct = cnt / total_bn * 100 if total_bn > 0 else 0
        lines.append(f"  {bn:<25} {cnt:>5} frames ({pct:5.1f}%)")

    # ── Worst frames ──
    lines.append("")
    lines.append("── WORST FRAMES ──")
    lines.append(f"  worst frameTime:  {worst_frame_time['frameTimeMs']:.1f}ms  (sim={worst_frame_time['simTickMs']:.1f} render={worst_frame_time['renderMs']:.1f})  fps={worst_frame_time['fps']:.1f}  clustered={worst_frame_time['clusteredUnits']}  tankMixer={worst_frame_time['tankMixerCount']}")
    lines.append(f"  worst simTick:    {worst_sim['simTickMs']:.1f}ms  (frame={worst_sim['frameTimeMs']:.1f}ms render={worst_sim['renderMs']:.1f}ms)  tickId={worst_sim.get('tickId','?')}")
    lines.append(f"  worst render:     {worst_render['renderMs']:.1f}ms  (frame={worst_render['frameTimeMs']:.1f}ms sim={worst_render['simTickMs']:.1f}ms)  drawCalls={worst_render['drawCalls']} tri={worst_render['triangles']/1e6:.2f}M")

    # ── Correlations ──
    lines.append("")
    lines.append("── CORRELATIONS (Pearson r) ──")
    lines.append(f"  simTickMs    → frameTimeMs    r={corr_sim_frame:+.3f}  {'STRONG' if abs(corr_sim_frame) > 0.5 else 'WEAK' if abs(corr_sim_frame) < 0.3 else 'MODERATE'}")
    lines.append(f"  renderMs     → frameTimeMs    r={corr_render_frame:+.3f}  {'STRONG' if abs(corr_render_frame) > 0.5 else 'WEAK' if abs(corr_render_frame) < 0.3 else 'MODERATE'}")
    lines.append(f"  clusteredUnit→ renderMs       r={corr_cluster_render:+.3f}  {'STRONG' if abs(corr_cluster_render) > 0.5 else 'WEAK' if abs(corr_cluster_render) < 0.3 else 'MODERATE'}")
    lines.append(f"  tankMixerCnt → unitUpdateMs   r={corr_tank_unit:+.3f}  {'STRONG' if abs(corr_tank_unit) > 0.5 else 'WEAK' if abs(corr_tank_unit) < 0.3 else 'MODERATE'}")
    lines.append(f"  clusteredUnit→ frameTimeMs    r={corr_cluster_frame:+.3f}  {'STRONG' if abs(corr_cluster_frame) > 0.5 else 'WEAK' if abs(corr_cluster_frame) < 0.3 else 'MODERATE'}")
    lines.append(f"  drawCalls    → frameTimeMs    r={corr_draw_frame:+.3f}  {'STRONG' if abs(corr_draw_frame) > 0.5 else 'WEAK' if abs(corr_draw_frame) < 0.3 else 'MODERATE'}")

    # ── Over-budget runs ──
    lines.append("")
    lines.append(f"── OVER-BUDGET RUNS ({len(over_runs)} total) ──")
    if long_runs:
        lines.append(f"  Runs ≥30 frames ({len(long_runs)} sustained):")
        for r in sorted(long_runs, key=lambda x: -x["length"])[:5]:
            dur_s = (r["endElapsedMs"] - r["startElapsedMs"]) / 1000
            lines.append(f"    frames [{r['start']}..{r['end']}]  len={r['length']}  ({dur_s:.1f}s)")
    else:
        lines.append("  No sustained over-budget runs (all <30 frames).")

    # ── SimTick spike timeline ──
    lines.append("")
    lines.append("── SIM TICK SPIKE ANALYSIS ──")
    spike_threshold = percentile(sim_ticks, 95) * 1.5
    spikes = [(i, f) for i, f in enumerate(frames) if f["simTickMs"] > spike_threshold]
    if spikes:
        lines.append(f"  Spike threshold: >{spike_threshold:.1f}ms  ({len(spikes)} spikes)")
        # Cluster spikes within 5 frames
        spike_runs = []
        run_start = spikes[0][0]
        run_spikes = [spikes[0]]
        for i in range(1, len(spikes)):
            if spikes[i][0] - spikes[i-1][0] <= 5:
                run_spikes.append(spikes[i])
            else:
                spike_runs.append(run_spikes)
                run_spikes = [spikes[i]]
        spike_runs.append(run_spikes)

        spike_runs.sort(key=lambda r: max(f["simTickMs"] for _, f in r), reverse=True)
        for sr in spike_runs[:5]:
            max_s = max(f["simTickMs"] for _, f in sr)
            idx_range = f"[{sr[0][0]}..{sr[-1][0]}]"
            n_spikes = len(sr)
            lines.append(f"    spike cluster {idx_range}  n={n_spikes}  maxSimTick={max_s:.1f}ms")
    else:
        lines.append("  No significant simTick spikes detected.")

    # ── DECISIONS / REKOMENDASI ──
    lines.append("")
    lines.append(sep)
    lines.append("  KEPUTUSAN / REKOMENDASI")
    lines.append(sep)

    if not decisions:
        lines.append("  ✅ Tidak ada bottleneck signifikan terdeteksi. Performa dalam batas normal.")
    else:
        decisions.sort(key=lambda d: d[0])  # sort by priority
        for prio, rec in decisions:
            lines.append(f"  [{prio}] {rec}")

    # ── Final verdict ──
    lines.append("")
    lines.append(sep)
    lines.append("  VERDICT")
    lines.append(sep)

    if over_pct > 50:
        lines.append(f"  ❌ SEVERE: {over_pct:.0f}% frames over budget. Game tidak playable di scene ini.")
        if corr_sim_frame > corr_render_frame:
            lines.append(f"  → SIM adalah PRIMARY bottleneck (r={corr_sim_frame:.2f} vs render r={corr_render_frame:.2f}).")
            lines.append(f"  → Fokus: optimasi worker tick dispatch, kurangi entity per tick, atau offload ke worker pool.")
        else:
            lines.append(f"  → GPU/RENDER adalah PRIMARY bottleneck (r={corr_render_frame:.2f} vs sim r={corr_sim_frame:.2f}).")
            lines.append(f"  → Fokus: VAT instancing, LOD agresif, kurangi draw calls & triangles.")
    elif over_pct > 20:
        lines.append(f"  ⚠️  MODERATE: {over_pct:.0f}% frames over budget. Sesekali frame drop terasa.")
    else:
        lines.append(f"  ✅ GOOD: hanya {over_pct:.0f}% frames over budget. Performa acceptable.")

    lines.append("")
    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        # Try default report path
        reports = sorted(Path("public/report").glob("perf-record-*.json"))
        if not reports:
            print("Usage: python scripts/analyze_perf.py <path-to-report.json>")
            print("No reports found in public/report/")
            sys.exit(1)
        path = str(reports[-1])
        print(f"# Using latest report: {path}\n")
    else:
        path = sys.argv[1]

    report = load_report(path)
    output = analyze(report)
    print(output)


if __name__ == "__main__":
    main()

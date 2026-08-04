#!/usr/bin/env python3
import json
import sys
import os
import re
from collections import Counter

# Thresholds — must stay in sync with PerformanceProfiler.ts detectBottlenecks()
LOW_FPS_THRESHOLD   = 55   # fps
HIGH_DRAW_CALLS     = 150  # calls
HIGH_TRIANGLES      = 500_000
ANIM_BUDGET_MS      = 4.0
BILLBOARD_BUDGET_MS = 3.0
WORKER_BUDGET_MS    = 12.0

def normalize_bottleneck(s: str) -> str:
    """Collapse volatile numbers so similar warnings group together."""
    if s.startswith("Low FPS"):           return "Low FPS"
    if s.startswith("High Draw Calls"):   return "High Draw Calls"
    if s.startswith("High Triangle"):     return "High Triangle Count"
    if s.startswith("Skeletal") or "Skeletal" in s: return "Skeletal Animation bottleneck"
    if s.startswith("VAT") or "VAT" in s:           return "VAT GPU Animation bottleneck"
    if s.startswith("Billboard"):         return "Billboard bottleneck"
    if s.startswith("Web Worker"):        return "Web Worker delay"
    return re.sub(r'\d+\.?\d*', 'N', s)

def avg(lst): return sum(lst) / len(lst) if lst else 0
def pct95(lst):
    if not lst: return 0
    return sorted(lst)[int(len(lst) * 0.95)]

def analyze_diagnostics(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' not found.")
        sys.exit(1)

    with open(file_path, 'r') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")
            sys.exit(1)

    if not isinstance(data, list) or len(data) == 0:
        print("Error: Invalid or empty performance log structure.")
        sys.exit(1)

    total_frames    = len(data)
    fps_values      = [f['fps'] for f in data if 'fps' in f]
    frame_times     = [f['frameTimeMs'] for f in data if 'frameTimeMs' in f]
    draw_calls      = [f['drawCalls'] for f in data if 'drawCalls' in f]
    triangles       = [f['triangles'] for f in data if 'triangles' in f]
    render_times    = [f['systems']['renderTimeMs'] for f in data
                       if 'systems' in f and 'renderTimeMs' in f['systems']]
    anim_times      = [f['systems']['animationsMs'] for f in data
                       if 'systems' in f and 'animationsMs' in f['systems']]
    billboard_times = [f['systems']['billboardsMs'] for f in data
                       if 'systems' in f and 'billboardsMs' in f['systems']]
    worker_times    = [f['workerTickTimeMs'] for f in data if 'workerTickTimeMs' in f]

    total_stuns  = sum(f['activity']['activeStuns'] for f in data if 'activity' in f)
    total_buffs  = sum(f['activity']['activeBuffs'] for f in data if 'activity' in f)
    total_deaths = sum(f['activity']['activeDeaths'] for f in data if 'activity' in f)

    bottleneck_cat: Counter = Counter()
    all_skills:     Counter = Counter()
    low_fps_frames = 0

    # Thresholds — must stay in sync with PerformanceProfiler.ts detectBottlenecks()
    LOW_FPS_THRESHOLD   = 55   # fps
    HIGH_DRAW_CALLS     = 150  # calls
    HIGH_TRIANGLES      = 500_000
    ANIM_BUDGET_VAT     = 1.5  # ms
    ANIM_BUDGET_SKELETAL = 4.0  # ms
    BILLBOARD_BUDGET_MS = 3.0
    WORKER_BUDGET_MS    = 12.0

    # Tentukan apakah file log ini merupakan mode skeleton
    # dengan memeriksa jenis bottleneck yang tercatat di dalam file
    is_skeleton_log = any("Skeletal" in str(b) for frame in data for b in frame.get('bottlenecks', []))
    anim_budget = ANIM_BUDGET_SKELETAL if is_skeleton_log else ANIM_BUDGET_VAT

    for frame in data:
        fps_f   = frame.get('fps', 60)
        dc      = frame.get('drawCalls', 0)
        tri     = frame.get('triangles', 0)
        sys_    = frame.get('systems', {})
        anim_ms = sys_.get('animationsMs', 0)
        bb_ms   = sys_.get('billboardsMs', 0)
        wk_ms   = frame.get('workerTickTimeMs', 0)

        if fps_f < LOW_FPS_THRESHOLD:
            low_fps_frames += 1
            bottleneck_cat['Low FPS'] += 1
        if dc > HIGH_DRAW_CALLS:
            bottleneck_cat['High Draw Calls'] += 1
        if tri > HIGH_TRIANGLES:
            bottleneck_cat['High Triangle Count'] += 1
        if anim_ms > anim_budget:
            cat_name = 'Skeletal Animation bottleneck' if is_skeleton_log else 'VAT GPU Animation bottleneck'
            bottleneck_cat[cat_name] += 1
        if bb_ms > BILLBOARD_BUDGET_MS:
            bottleneck_cat['Billboard bottleneck'] += 1
        if wk_ms > WORKER_BUDGET_MS:
            bottleneck_cat['Web Worker delay'] += 1

        for skill, count in frame.get('activity', {}).get('skillsTriggered', {}).items():
            all_skills[skill] += count

    print("=" * 60)
    print("      ⚔️  BATTLE KINGDOM PERFORMANCE DIAGNOSTICS REPORT  ⚔️")
    print("=" * 60)
    print(f"Analyzed File:  {os.path.basename(file_path)}")
    print(f"Total Frames:   {total_frames}")
    print(f"Low FPS (<{LOW_FPS_THRESHOLD}):  {low_fps_frames} frames ({low_fps_frames/total_frames*100:.1f}%)")
    print("-" * 60)

    if fps_values:
        print(f"FPS:            Min={min(fps_values)}  Max={max(fps_values)}  Avg={avg(fps_values):.1f}")
    if frame_times:
        print(f"Frame Time:     Min={min(frame_times):.1f}ms  Max={max(frame_times):.1f}ms  "
              f"Avg={avg(frame_times):.2f}ms  P95={pct95(frame_times):.1f}ms")
    if render_times:
        gpu_budget = avg(frame_times) - avg(render_times)
        print(f"CPU Work/frame: Avg={avg(render_times):.2f}ms  Max={max(render_times):.1f}ms  "
              f"(~{gpu_budget:.2f}ms free for GPU)")
    if draw_calls:
        print(f"Draw Calls:     Min={min(draw_calls)}  Max={max(draw_calls)}  Avg={avg(draw_calls):.0f}")
    if triangles:
        print(f"Triangles:      Min={min(triangles):,}  Max={max(triangles):,}  Avg={int(avg(triangles)):,}")
    print("-" * 60)

    print("⏱️  System CPU Times:")
    if anim_times:
        print(f"  Skeletal Animations:  avg={avg(anim_times):.2f}ms  max={max(anim_times)}ms")
    if billboard_times:
        print(f"  Billboard/Matrix:     avg={avg(billboard_times):.2f}ms  max={max(billboard_times)}ms")
    if worker_times:
        print(f"  Web Worker Tick:      avg={avg(worker_times):.2f}ms  max={max(worker_times)}ms")
    print("-" * 60)

    print("🎮 Combat Activity:")
    print(f"  Deaths: {total_deaths}  Stuns: {total_stuns}  Buffs: {total_buffs}")
    if all_skills:
        print("  Skills (top 5):")
        for skill, count in all_skills.most_common(5):
            print(f"    {skill}: {count}x")
    print("-" * 60)

    if bottleneck_cat:
        print("🚨 Performance Issues (by category):")
        for issue, count in bottleneck_cat.most_common():
            print(f"  [{count/total_frames*100:.0f}% frames] {issue}")
    else:
        print("🎉 No performance issues detected!")
    print("=" * 60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_perf.py <path_to_diagnostics_json>")
        sys.exit(1)
    analyze_diagnostics(sys.argv[1])

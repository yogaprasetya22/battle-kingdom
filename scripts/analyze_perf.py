#!/usr/bin/env python3
import json
import sys
import os
from collections import Counter

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

    total_frames = len(data)
    fps_values = [f['fps'] for f in data if 'fps' in f]
    frame_times = [f['frameTimeMs'] for f in data if 'frameTimeMs' in f]
    draw_calls = [f['drawCalls'] for f in data if 'drawCalls' in f]
    triangles = [f['triangles'] for f in data if 'triangles' in f]
    
    # System execution times
    anim_times = [f['systems']['animationsMs'] for f in data if 'systems' in f and 'animationsMs' in f['systems']]
    billboard_times = [f['systems']['billboardsMs'] for f in data if 'systems' in f and 'billboardsMs' in f['systems']]
    worker_times = [f['workerTickTimeMs'] for f in data if 'workerTickTimeMs' in f]

    # Active states
    total_stuns = sum(f['activity']['activeStuns'] for f in data if 'activity' in f)
    total_buffs = sum(f['activity']['activeBuffs'] for f in data if 'activity' in f)
    total_deaths = sum(f['activity']['activeDeaths'] for f in data if 'activity' in f)

    # Coalesce all bottlenecks and triggered skills
    all_bottlenecks = []
    all_skills = Counter()
    low_fps_frames = 0

    for frame in data:
        if frame.get('fps', 60) < 45:
            low_fps_frames += 1
        if 'bottlenecks' in frame:
            all_bottlenecks.extend(frame['bottlenecks'])
        if 'activity' in frame and 'skillsTriggered' in frame['activity']:
            for skill, count in frame['activity']['skillsTriggered'].items():
                all_skills[skill] += count

    # Print Report
    print("=" * 60)
    print("      ⚔️  BATTLE KINGDOM PERFORMANCE DIAGNOSTICS REPORT  ⚔️")
    print("=" * 60)
    print(f"Analyzed File:  {os.path.basename(file_path)}")
    print(f"Total Frames:   {total_frames}")
    print(f"Low FPS (<45):  {low_fps_frames} frames ({(low_fps_frames/total_frames)*100:.1f}%)")
    print("-" * 60)
    
    # 1. Core Metrics
    if fps_values:
        print(f"FPS Range:      Min: {min(fps_values)} | Max: {max(fps_values)} | Avg: {sum(fps_values)/len(fps_values):.1f}")
    if frame_times:
        print(f"Frame Time:     Min: {min(frame_times)}ms | Max: {max(frame_times)}ms | Avg: {sum(frame_times)/len(frame_times):.2f}ms")
    if draw_calls:
        print(f"Draw Calls:     Min: {min(draw_calls)} | Max: {max(draw_calls)} | Avg: {sum(draw_calls)/len(draw_calls):.1f}")
    if triangles:
        print(f"Triangles:      Min: {min(triangles):,} | Max: {max(triangles):,} | Avg: {int(sum(triangles)/len(triangles)):,}")
    print("-" * 60)

    # 2. System Bottlenecks Analysis
    print("⏱️  System Average Times (CPU Overhead):")
    if anim_times:
        print(f"  - Skeletal Animations: {sum(anim_times)/len(anim_times):.2f}ms  (Max: {max(anim_times)}ms)")
    if billboard_times:
        print(f"  - Billboard/Matrix computations: {sum(billboard_times)/len(billboard_times):.2f}ms  (Max: {max(billboard_times)}ms)")
    if worker_times:
        print(f"  - Web Worker Simulation Tick: {sum(worker_times)/len(worker_times):.2f}ms  (Max: {max(worker_times)}ms)")
    print("-" * 60)

    # 3. Game Activity Metrics
    print("🎮 Combat & State Triggers:")
    print(f"  - Total Active Deaths observed: {total_deaths}")
    print(f"  - Total Stuns applied: {total_stuns}")
    print(f"  - Total Buffs applied: {total_buffs}")
    if all_skills:
        print("  - Triggered Skills Frequency:")
        for skill, count in all_skills.most_common(5):
            print(f"    * {skill}: {count} times")
    print("-" * 60)

    # 4. Critical Bottlenecks Ranked
    if all_bottlenecks:
        print("🚨 Detected Performance Issues (Ranked by frequency):")
        bottleneck_counts = Counter(all_bottlenecks)
        for issue, count in bottleneck_counts.most_common():
            pct = (count / total_frames) * 100
            print(f"  - [{pct:.1f}% frames] {issue}")
    else:
        print("🎉 No critical performance issues detected! Smooth simulation.")
    print("=" * 60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_perf.py <path_to_diagnostics_json>")
        sys.exit(1)
    analyze_diagnostics(sys.argv[1])

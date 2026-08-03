#!/usr/bin/env python3
"""
bake_vat.py — Bake GLB character animation ke VAT EXR texture.
OpenEXR compliant scanline EXR, RGB HALF, uncompressed.

   blender --background --python scripts/bake_vat.py -- Knight
"""

import bpy
import sys
import json
import os
import struct
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHAR_DIR = Path("/tmp/vat_input/characters")
ANIM_DIR = Path("/tmp/vat_input/animation")
VAT_OUT = PROJECT_ROOT / "public" / "models" / "character" / "characters_vat"

TARGET_ANIMS = {
    "idle": ["idle"],
    "run": ["running", "walking"],
    "attack": ["attack", "melee", "chop", "slice", "stab", "kick", "punch"],
    "death": ["death"],
    "buff": ["buff"],
    "shoot": ["shoot", "ranged", "aiming", "reload", "draw", "release"],
    "magic": ["spellcast", "magic"],
}


def find_clip_by_name(name: str) -> str:
    nl = name.lower()
    for cat, patterns in TARGET_ANIMS.items():
        for p in patterns:
            if p in nl:
                return cat
    return None


def load_animations(armature, rig_files: list[str]):
    """Load animations from rig GLB NLA tracks. Does NOT delete original armature/mesh."""
    actions = {}
    cf = 1

    for rig_file in rig_files:
        rig_path = ANIM_DIR / f"{rig_file}.glb"
        if not rig_path.exists():
            continue

        pre = set(bpy.data.actions.keys())
        bpy.ops.import_scene.gltf(filepath=str(rig_path))
        new_names = set(bpy.data.actions.keys()) - pre
        imported_objects = list(bpy.context.selected_objects)

        # Find armature in imported objects
        imported_arm = None
        for obj in imported_objects:
            if obj.type == 'ARMATURE':
                imported_arm = obj
                break

        collected = set()
        if imported_arm and imported_arm.animation_data:
            ad = imported_arm.animation_data
            if ad.action and ad.action.name in new_names:
                collected.add(ad.action)
            for track in ad.nla_tracks:
                for strip in track.strips:
                    if strip.action and strip.action.name in new_names:
                        collected.add(strip.action)
        else:
            for nm in new_names:
                a = bpy.data.actions.get(nm)
                if a:
                    collected.add(a)

        for action in sorted(collected, key=lambda a: a.name):
            cat = find_clip_by_name(action.name)
            if not cat:
                continue
            fl = int(action.frame_range.y - action.frame_range.x)
            if fl <= 0:
                continue
            fs = cf
            fe = cf + fl
            actions[action.name] = {
                "action": action,
                "category": cat,
                "start": fs,
                "end": fe,
                "length": fl + 1,
            }
            cf = fe + 2
            print(f"  [OK] {action.name} → {cat} [{fs}-{fe}]")

        # Clean ONLY imported armature objects, keep actions. Original character stays.
        for obj in imported_objects:
            if obj.animation_data:
                obj.animation_data.action = None
            # Only remove armature-type imported objects, not the character mesh
            if obj.type == 'ARMATURE':
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except:
                    pass

    return actions, cf


def bake_vertex_positions(mesh_obj, f_start, f_end, vcount):
    """Bake vertex positions to float16 numpy array.
    Returns (total_frames, vcount, 3) in float16, Blender→Three.js coords (x, z, -y)."""
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    import numpy as np

    total_frames = f_end - f_start + 1
    out = np.empty((total_frames, vcount, 3), dtype=np.float16)

    for fi, f in enumerate(range(f_start, f_end + 1)):
        scene.frame_set(f)
        ev = mesh_obj.evaluated_get(dg)
        mesh = ev.to_mesh()
        verts = mesh.vertices
        if len(verts) != vcount:
            print(f"  [ERROR] vcount mismatch frame {f}: {len(verts)} vs {vcount}")
            ev.to_mesh_clear()
            return None
        coords = np.empty((vcount, 3), dtype=np.float64)
        verts.foreach_get('co', coords.ravel(order='C'))
        # Blender (X,Y,Z) → Three.js (X, Z, -Y)
        out[fi, :, 0] = coords[:, 0].astype(np.float16)
        out[fi, :, 1] = coords[:, 2].astype(np.float16)
        out[fi, :, 2] = (-coords[:, 1]).astype(np.float16)
        ev.to_mesh_clear()

    return out


def write_exr_rgb_half(width: int, height: int, pixels: 'np.ndarray', out_path: str):
    """OpenEXR scanline, RGB HALF, uncompressed.
    pixels shape: (height, width, 3), dtype float16.
    Each scanline: y_coord(int32) + data_len(int32) + raw_pixels.
    """
    import numpy as np
    s = struct.Struct
    row_bytes = width * 3 * 2  # 6 bytes per pixel (RGB half)

    with open(out_path, 'wb') as f:
        f.write(b'\x76\x2f\x31\x01')
        f.write(s('<I').pack(0))

        def attr(name: bytes, atype: bytes, value: bytes):
            f.write(name + b'\x00' + atype + b'\x00' + s('<I').pack(len(value)) + value)

        ch = bytearray()
        for cn in [b'R', b'G', b'B']:
            ch += cn + b'\x00'
            ch += s('<I').pack(1)  # pixelType: HALF
            ch += b'\x00'          # reserved
            ch += b'\x00\x00\x00'  # reserved
            ch += s('<I').pack(1)  # xSampling
            ch += s('<I').pack(1)  # ySampling
        ch += b'\x00'
        attr(b'channels', b'chlist', bytes(ch))

        attr(b'compression', b'compression', b'\x00')
        dw = s('<iiii').pack(0, 0, width - 1, height - 1)
        attr(b'dataWindow', b'box2i', dw)
        attr(b'displayWindow', b'box2i', dw)
        attr(b'lineOrder', b'lineOrder', b'\x00')
        attr(b'pixelAspectRatio', b'float', s('<f').pack(1.0))
        attr(b'screenWindowCenter', b'v2f', s('<ff').pack(0.0, 0.0))
        attr(b'screenWindowWidth', b'float', s('<f').pack(1.0))

        f.write(b'\x00')  # end of header

        # Offset table: each entry points to y_coord of that scanline
        offset_table_start = f.tell()
        scanline_total = 8 + row_bytes  # header(int32+int32) + pixel data
        pixel_start = offset_table_start + height * 8
        for y in range(height):
            f.write(s('<Q').pack(pixel_start + y * scanline_total))

        # Pixel data with scanline headers
        raw = pixels.tobytes(order='C')  # (height, width, 3) C-order → y-major
        for y in range(height):
            f.write(s('<ii').pack(y, row_bytes))
            start = y * row_bytes
            f.write(raw[start:start + row_bytes])


def bake_character(char_name: str):
    char_path = CHAR_DIR / f"{char_name}.glb"
    if not char_path.exists():
        print(f"[SKIP] {char_name}.glb not found at {char_path}")
        return

    out_dir = VAT_OUT / char_name
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}\nBaking: {char_name}\n{'='*60}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(char_path))
    bpy.context.view_layer.update()

    armature = None
    mesh_obj = None
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            armature = obj
        elif obj.type == 'MESH' and obj.parent == armature:
            mesh_obj = obj

    if not armature or not mesh_obj:
        print(f"  [ERROR] No armature+mesh for {char_name}")
        return

    vcount = len(mesh_obj.data.vertices)
    print(f"  Armature: {armature.name}, Mesh: {mesh_obj.name}, verts: {vcount}")

    rigs = ["Rig_Medium_General", "Rig_Medium_MovementBasic", "Rig_Medium_CombatMelee", "Rig_Medium_CombatRanged"]
    if char_name in ("Mage", "Rogue_Hooded"):
        rigs.append("Rig_Medium_Special")

    anim_map, total_frames = load_animations(armature, rigs)
    if not anim_map:
        print(f"  [ERROR] No animations for {char_name}")
        return

    # Filter to essential categories, pick 1 best per category
    essential = {"idle", "run", "attack", "death", "shoot"}
    by_cat = {c: [] for c in essential}
    for name, info in anim_map.items():
        cat = info["category"]
        if cat in essential:
            by_cat[cat].append((name, info))

    picked = {}
    for cat in essential:
        entries = sorted(by_cat[cat], key=lambda x: x[0])
        if not entries:
            print(f"  [WARN] No anim for category: {cat}")
            continue
        name, info = entries[0]
        picked[name] = info
        print(f"  [PICK] {cat}: {name} ({info['length']} frames)")

    anim_map = picked
    if not anim_map:
        print(f"  [ERROR] No essential anims for {char_name}")
        return

    # Recalc frame positions
    cf = 1
    for name in sorted(anim_map.keys()):
        info = anim_map[name]
        fl = info["length"] - 1
        info["start"] = cf
        info["end"] = cf + fl
        cf = cf + fl + 2
    total_frames = cf

    print(f"  Filtered: {len(anim_map)} anims, {total_frames} frames")

    # Setup NLA tracks on original armature
    if not armature.animation_data:
        armature.animation_data_create()
    else:
        armature.animation_data.action = None

    for name, info in anim_map.items():
        track = armature.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, info["start"], info["action"])
        strip.frame_start = info["start"]
        strip.frame_end = info["end"]

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = total_frames

    print(f"  Baking {vcount} verts x {total_frames} frames...")
    pixel_data = bake_vertex_positions(mesh_obj, 1, total_frames, vcount)
    if pixel_data is None:
        print(f"  [ERROR] Bake failed")
        return

    exr_path = out_dir / f"{char_name}_vat_pos.exr"
    print(f"  Writing EXR: {vcount}x{total_frames}")
    write_exr_rgb_half(vcount, total_frames, pixel_data, str(exr_path))
    print(f"  EXR: {exr_path} ({os.path.getsize(exr_path)} bytes)")

    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    armature.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = armature

    base_path = out_dir / f"{char_name}_base.glb"
    bpy.ops.export_scene.gltf(filepath=str(base_path), use_selection=True,
                               export_animations=False, export_skins=True, export_morph=False)
    print(f"  Base GLB: {base_path}")

    meta = {"character": char_name, "vertexCount": vcount, "totalFrames": total_frames, "animations": {}}
    for name, info in anim_map.items():
        meta["animations"][name] = {"start": info["start"], "end": info["end"],
                                     "length": info["length"], "category": info["category"]}
    meta_path = out_dir / f"{char_name}_vat_meta.json"
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"  Meta: {meta_path}")
    print(f"  [DONE] {char_name}")


def main():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]

    chars = argv[0].split(",") if len(argv) > 0 else [
        "Knight", "Barbarian", "Mage", "Ranger", "Rogue", "Rogue_Hooded"]

    print(f"VAT Baker — {', '.join(chars)}")
    VAT_OUT.mkdir(parents=True, exist_ok=True)

    for c in chars:
        try:
            bake_character(c.strip())
        except Exception as e:
            print(f"  [FATAL] {c}: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60 + "\nBake complete!\n" + "=" * 60)


if __name__ == "__main__":
    main()

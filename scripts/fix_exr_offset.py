#!/usr/bin/env python3
"""Fix EXR offset table position: move from EOF to right after header."""
import struct
import os

BASE = "public/models/character/characters_vat"

def fix_exr(path: str) -> bool:
    with open(path, "rb") as f:
        data = f.read()

    # Parse EXR header attributes
    pos = 8
    while True:
        name_end = data.find(b'\x00', pos)
        if name_end == pos:  # empty name = end of header
            pos = name_end + 1
            break
        name = data[pos:name_end]
        pos = name_end + 1
        type_end = data.find(b'\x00', pos)
        atype = data[pos:type_end]
        pos = type_end + 1
        size = struct.unpack_from('<I', data, pos)[0]
        pos += 4
        if name == b'dataWindow':
            xmin, ymin, xmax, ymax = struct.unpack_from('<iiii', data, pos)
            width = xmax - xmin + 1
            height = ymax - ymin + 1
        pos += size

    header_end = pos
    row_bytes = width * 3 * 2  # RGB half
    pixel_size = row_bytes * height
    offset_table_size = height * 8

    # Current layout: header | pixel | offset_table
    pixel_data = data[header_end : header_end + pixel_size]

    # Rebuild: header | offset_table | pixel
    new_offset_start = header_end
    new_pixel_start = header_end + offset_table_size

    new_offsets = bytearray()
    for y in range(height):
        new_offsets.extend(struct.pack("<Q", new_pixel_start + y * row_bytes))

    new_data = bytearray(data[:header_end])
    new_data.extend(new_offsets)
    new_data.extend(pixel_data)
    # Add safety padding (8 bytes) — Three.js sometimes reads past last offset
    new_data.extend(b'\x00' * 8)

    with open(path, "wb") as f:
        f.write(new_data)

    char_name = os.path.basename(os.path.dirname(path))
    print(
        f"  OK: {char_name} ({width}x{height}, "
        f"header={header_end}B, offsets@{new_offset_start}, "
        f"pixels@{new_pixel_start}, size={len(new_data)})"
    )
    return True

def main():
    for char_dir in sorted(os.listdir(BASE)):
        exr_path = os.path.join(BASE, char_dir, f"{char_dir}_vat_pos.exr")
        if os.path.isfile(exr_path):
            fix_exr(exr_path)
    print("\nDone. All EXR files fixed — offset table now after header before pixel data.")

if __name__ == "__main__":
    main()

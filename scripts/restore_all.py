import os
import json
import shutil
import time

history_dirs = [
    "/home/yoga/.config/Code/User/History",
    "/home/yoga/.config/Antigravity IDE/User/History"
]

print("Scanning for all files modified since July 30, 2026...")

threshold_ts = 1785300000000 # July 29/30 threshold

found_files = []

for history_dir in history_dirs:
    if not os.path.exists(history_dir):
        continue
    for root, dirs, files in os.walk(history_dir):
        if "entries.json" in files:
            entries_path = os.path.join(root, "entries.json")
            try:
                with open(entries_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                resource = data.get("resource", "")
                if resource and "multi-trade-threejs" in resource:
                    resource_path = resource.replace("file://", "")
                    entries = data.get("entries", [])
                    if entries:
                        latest_entry = entries[-1]
                        latest_ts = latest_entry.get("timestamp")
                        if latest_ts > threshold_ts:
                            version_id = latest_entry.get("id")
                            version_file = os.path.join(root, version_id)
                            if os.path.exists(version_file):
                                found_files.append((resource_path, version_file, latest_ts))
            except Exception as e:
                pass

print(f"\nFound {len(found_files)} candidates to check.")
for dest, src, ts in found_files:
    time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts/1000.0))
    if not os.path.exists(dest):
        print(f"File DELETED: {dest} (Latest edit: {time_str}). Restoring...")
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(src, dest)
            print(f"  -> Restored successfully!")
        except Exception as e:
            print(f"  -> Restore failed: {e}")
    else:
        # Check size difference or timestamp difference if needed
        pass

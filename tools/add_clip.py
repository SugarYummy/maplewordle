# Adds an Animation Attack clip: compresses a video into a small WebM (VP9) + MP4 (H.264, for older iPhones)
# and a still poster image, then records it in data/animation.json.
#
#   python3 tools/add_clip.py "Hero" 1 input.mp4 [--start 2.5] [--end 7] [--since 2026-11-01]
#
# Clip 1 is shown from the first guess, clip 2 after the first wrong guess. A class can be the answer once it
# has clip 1. --since (YYYY-MM-DD) = first day it can be the answer; use it for classes added after launch so
# past days keep their answers. Needs ffmpeg (set FFMPEG=/path/to/ffmpeg if it isn't on PATH).
import argparse, json, os, re, subprocess

MAX_WIDTH = 960      # saved this wide at most (sharp when zoomed in); never upscaled. Height follows the shape.
FPS = 30

ap = argparse.ArgumentParser()
ap.add_argument("name"); ap.add_argument("clip", type=int, choices=[1, 2]); ap.add_argument("input")
ap.add_argument("--start", type=float); ap.add_argument("--end", type=float); ap.add_argument("--since")
a = ap.parse_args()

classes = json.load(open("data/classes.json"))["solo"]
if a.name not in [c["name"] for c in classes]:
    raise SystemExit(f"Unknown class {a.name!r}. Use a name from data/classes.json 'solo', e.g. Hero, Arch Mage (F/P).")

slug = re.sub(r"[^a-z0-9]+", "-", a.name.lower()).strip("-")
base = f"videos/anim/{slug}-{a.clip}"
os.makedirs("videos/anim", exist_ok=True)
ff = os.environ.get("FFMPEG", "ffmpeg")
cut = (["-ss", str(a.start)] if a.start is not None else []) + (["-to", str(a.end)] if a.end is not None else [])
vf = f"fps={FPS},scale='min({MAX_WIDTH},iw)':-2:flags=lanczos"
run = lambda *args: subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", *cut, "-i", a.input, *args], check=True)

run("-an", "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", "-deadline", "good",
    "-cpu-used", "2", base + ".webm")
run("-an", "-vf", vf, "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", base + ".mp4")
run("-an", "-vf", f"scale='min({MAX_WIDTH},iw)':-2:flags=lanczos", "-frames:v", "1", "-q:v", "4", base + ".jpg")

path = "data/animation.json"
m = json.load(open(path)) if os.path.exists(path) else {}
m.setdefault("_about", "Animation Attack clips: videos/anim/<class slug>-<1|2>.webm/.mp4/.jpg (added with tools/add_clip.py). "
                       "clips = which clip numbers exist; since = first day the class can be the answer.")
entry = m.setdefault("classes", {}).setdefault(a.name, {"clips": []})
if a.clip not in entry["clips"]:
    entry["clips"] = sorted(entry["clips"] + [a.clip])
if a.since:
    entry["since"] = a.since
json.dump(m, open(path, "w"), indent=1, ensure_ascii=False)

for ext in ("webm", "mp4", "jpg"):
    print(f"{base}.{ext}: {os.path.getsize(base + '.' + ext) // 1024} KB")

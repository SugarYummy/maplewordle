# Adds an Attack Animation clip: compresses a video into a small WebM (VP9) + MP4 (H.264, for older iPhones) and a
# still poster image, saved as the next free number (videos/anim/video<N>.*), and records it in data/animation.json.
#
#   New puzzle:            python3 tools/add_clip.py "Ren" input.mp4 [--credit Snowmoon --credit-image still.png]
#   Second clip for one:   python3 tools/add_clip.py "Ren" input.mp4 --puzzle 3
#   Options:               [--start 2.5] [--end 7] [--since 2026-11-01] [--day]
#
# --day appends the new puzzle to "days" (the fixed order of upcoming puzzles); otherwise it just joins the random
# rotation. --since (YYYY-MM-DD) = first day it can be the answer. Needs ffmpeg (FFMPEG=/path/to/ffmpeg if not on PATH).
import argparse, glob, json, os, re, subprocess

MAX_WIDTH = 960      # saved this wide at most (sharp when zoomed in); never upscaled. Height follows the shape.
FPS = 30
DIR = "videos/anim"

ap = argparse.ArgumentParser()
ap.add_argument("name"); ap.add_argument("input")
ap.add_argument("--puzzle", type=int, help="add as clip 2 of this puzzle id")
ap.add_argument("--start", type=float); ap.add_argument("--end", type=float); ap.add_argument("--since")
ap.add_argument("--credit"); ap.add_argument("--credit-image"); ap.add_argument("--day", action="store_true")
a = ap.parse_args()

classes = json.load(open("data/classes.json"))["solo"]
if a.name not in [c["name"] for c in classes]:
    raise SystemExit(f"Unknown class {a.name!r}. Use a name from data/classes.json 'solo', e.g. Hero, Arch Mage (F/P).")

path = "data/animation.json"
m = json.load(open(path))
os.makedirs(DIR, exist_ok=True)
num = lambda pat: [int(re.search(r"(\d+)", os.path.basename(f)).group(1)) for f in glob.glob(f"{DIR}/{pat}")]
n = max(num("video*.webm"), default=0) + 1
base = f"{DIR}/video{n}"

ff = os.environ.get("FFMPEG", "ffmpeg")
cut = (["-ss", str(a.start)] if a.start is not None else []) + (["-to", str(a.end)] if a.end is not None else [])
scale = f"scale='min({MAX_WIDTH},iw)':-2:flags=lanczos"
run = lambda *args: subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", *cut, "-i", a.input, *args], check=True)
run("-an", "-vf", f"fps={FPS},{scale}", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1",
    "-deadline", "good", "-cpu-used", "2", base + ".webm")
run("-an", "-vf", f"fps={FPS},{scale}", "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", base + ".mp4")
run("-an", "-vf", scale, "-frames:v", "1", "-q:v", "4", base + ".jpg")

if a.puzzle:
    p = next(p for p in m["puzzles"] if p["id"] == a.puzzle)
    if p["class"] != a.name:
        raise SystemExit(f"Puzzle {a.puzzle} is {p['class']}, not {a.name}.")
    p["videos"].append(n)
else:
    p = {"id": max([q["id"] for q in m["puzzles"]], default=0) + 1, "class": a.name, "videos": [n]}
    m["puzzles"].append(p)
    if a.day:
        m["days"].append(p["id"])
if a.credit:
    p["credit"] = a.credit
if a.credit_image:
    c = max(num("credit*.jpg"), default=0) + 1
    out = f"{DIR}/credit{c}.jpg"
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", a.credit_image, "-q:v", "3", out], check=True)
    p["creditImage"] = out
if a.since:
    p["since"] = a.since
json.dump(m, open(path, "w"), indent=1, ensure_ascii=False)

print(f"puzzle {p['id']} ({p['class']}): videos {p['videos']}")
for ext in ("webm", "mp4", "jpg"):
    print(f"{base}.{ext}: {os.path.getsize(base + '.' + ext) // 1024} KB")

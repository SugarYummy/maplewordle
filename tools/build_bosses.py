# Builds data/bosses.json and data/bosses.md from the boss list below.
# Run from the repo root: python3 tools/build_bosses.py data
import json, sys, os

OUT = sys.argv[1]
B, T, Q = 10**9, 10**12, 10**15

# Each boss: name, world, gender, region, pools, diffs = {difficulty: (entryLevel, phases, [phase HPs])}, main = difficulty used in Normal/Hard modes
# region: "All", "All except KMS", "KMS only", "GMS only", "JMS/CMS/GMS", ..., "Seasonal", "Removed"
N, H, X = "normal", "hard", "extreme"
ALLP = [N, H, X]
HX = [H, X]
XO = [X]

def b(name, world, gender, region, pools, diffs, main=None, notes=""):
    if main is None:
        for d in ["Hard", "Chaos", "Normal", "Easy"]:
            if d in diffs:
                main = d; break
    return dict(name=name, world=world, gender=gender, region=region, pools=pools, diffs=diffs, main=main, notes=notes)

MW, GR, AR = "Maple World", "Grandis", "Arcane River"
bosses = [
    b("Zakum", MW, "Other", "All", ALLP, {
        "Easy": (50, 1, [8*204_000 + 2_200_000]),
        "Normal": (90, 1, [8*700_000 + 7_000_000]),
        "Chaos": (90, 1, [8*10_500_000_000 + 84*B])}, notes="1 phase; HP = 8 arms + body"),
    b("Papulatus", MW, "Other", "All", ALLP, {
        "Easy": (115, 2, [300_000_000, 100_000_000]),
        "Normal": (155, 2, [12_600_000_000, 4_200_000_000]),
        "Chaos": (190, 2, [378*B, 126*B])}),
    b("Magnus", GR, "Male", "All", ALLP, {
        "Easy": (115, 1, [400_000_000]),
        "Normal": (155, 1, [6*B]),
        "Hard": (175, 1, [120*B])}),
    b("Hilla", MW, "Female", "All", ALLP, {
        "Normal": (85, 1, [500_000_000]),
        "Hard": (170, 1, [16_800_000_000])}),
    b("Mori Ranmaru", MW, "Male", "All except KMS", ALLP, {
        "Normal": (120, 1, [1*B]),
        "Hard": (180, 1, [2_100_000_000])}, notes="GMS HP (other servers: 84B)"),
    b("Horntail", MW, "Other", "All", ALLP, {
        "Easy": (130, 3, [100_000_000, 100_000_000, 817_600_000]),
        "Normal": (130, 3, [330_000_000, 330_000_000, 2_090_000_000]),
        "Chaos": (135, 3, [3_300_000_000, 3_300_000_000, 20*B])}, notes="Phase 3 = all 8 body parts"),
    b("Pierre", MW, "Male", "All", ALLP, {
        "Normal": (125, 1, [315_000_000]),
        "Chaos": (180, 1, [80*B])}),
    b("Von Bon", MW, "Male", "All", ALLP, {
        "Normal": (125, 1, [315_000_000]),
        "Chaos": (180, 1, [100*B])}),
    b("Crimson Queen", MW, "Female", "All", ALLP, {
        "Normal": (125, 1, [315_000_000]),
        "Chaos": (180, 1, [140*B])}),
    b("Vellum", MW, "Other", "All", ALLP, {
        "Normal": (125, 1, [550_000_000]),
        "Chaos": (180, 1, [200*B])}, notes="GMS HP (MSEA: 120B)"),
    b("Von Leon", MW, "Male", "All", ALLP, {
        "Easy": (125, 1, [700_000_000]),
        "Normal": (125, 1, [6_300_000_000]),
        "Hard": (125, 1, [10_500_000_000])}),
    b("Arkarium", MW, "Male", "All", ALLP, {
        "Easy": (140, 1, [2_100_000_000]),
        "Normal": (140, 1, [12_600_000_000])}),
    b("Gollux", "Masteria", "Other", "JMS/CMS/GMS", ALLP, {
        "Easy": (180, 3, [50_000_000, 50_000_000, 10_000_000]),
        "Normal": (180, 3, [3*B, 3*B, 600_000_000]),
        "Hard": (180, 3, [75*B, 75*B, 15*B]),
        "Hell": (180, 3, [350*B, 350*B, 70*B])}, main="Hell",
        notes="GMS HP, 3 Head phases only. Wiki only lists the 180+ requirement, so every mode uses 180"),
    b("OMNI-CLN", MW, "Other", "All", ALLP, {
        "Normal": (180, 1, [1_680_000_000])}),
    b("Pink Bean", MW, "Male", "All", ALLP, {
        "Normal": (140, 1, [2_100_000_000]),
        "Chaos": (170, 3, [12_600_000_000, 23_100_000_000, 33_600_000_000])}),
    b("Cygnus", MW, "Female", "All except KMS", ALLP, {
        "Easy": (165, 1, [10_500_000_000]),
        "Normal": (165, 1, [63*B])}, notes="Removed from KMS in the Overdrive update"),
    b("Princess No", MW, "Female", "All except KMS", ALLP, {
        "Normal": (180, 1, [500*B])}),
    b("Akechi Mitsuhide", MW, "Male", "JMS/GMS/MSEA", ALLP, {
        "Normal": (200, 2, [350*B, 350*B])}),
    b("Lotus", MW, "Male", "All", ALLP, {
        "Normal": (190, 3, [472_500_000_000, 472_500_000_000, 630*B]),
        "Hard": (190, 3, [9_985_500_000_000, 9_985_500_000_000, 13_314*B]),
        "Extreme": (190, 3, [543_300*B, 543_300*B, 724_400*B])}),
    b("Damien", MW, "Male", "All", ALLP, {
        "Normal": (190, 2, [840*B, 360*B]),
        "Hard": (190, 2, [25_200*B, 10_800*B])}),
    b("Guardian Angel Slime", MW, "Other", "All", ALLP, {
        "Normal": (210, 1, [5*T]),
        "Chaos": (210, 1, [90*T])}),
    b("Lucid", AR, "Female", "All", ALLP, {
        "Easy": (220, 2, [6*T, 6*T]),
        "Normal": (220, 2, [12*T, 12*T]),
        "Hard": (220, 3, [50_800*B, 54*T, 12_800*B])}),
    b("Will", AR, "Male", "All", ALLP, {
        "Easy": (235, 3, [5_600*B, 4_200*B, 7*T]),
        "Normal": (235, 3, [8_400*B, 6_300*B, 10_500*B]),
        "Hard": (235, 3, [42*T, 31_500*B, 52_500*B])}),
    b("Gloom", AR, "Other", "All", ALLP, {
        "Normal": (245, 1, [25_410*B]),
        "Chaos": (245, 1, [127_050*B])}),
    b("Verus Hilla", AR, "Female", "All", ALLP, {
        "Normal": (250, 1, [89_250*B]),
        "Hard": (250, 1, [178_500*B])}),
    b("Malicia", MW, "Female", "JMS/CMS/TMS", ALLP, {
        "Normal": (250, 4, [49*T + 21*T, 56*T, 24*T, 28*T]),
        "Extreme": (250, 4, [300*Q], "300Q+")},
        notes="Normal HP from Bahamut (TMS) boss HP table, Jul 2026: P1 49T + inner world 21T, P2 56T, P3 24T, P4 28T. "
              "Extreme: known phases total ~149.7Q but Phase 4 is unknown, so shown as 300Q+"),
    b("Darknell", AR, "Male", "All", ALLP, {
        "Normal": (255, 1, [26_250*B]),
        "Hard": (255, 1, [157_500*B])}),
    b("Black Mage", AR, "Male", "All", ALLP, {
        "Hard": (255, 4, [63*T, 115_500*B, 157_500*B, 136_500*B]),
        "Extreme": (255, 4, [1_180*T, 1_191*T, 1_285*T, 1_155*T])}),
    b("Chosen Seren", GR, "Female", "All", ALLP, {
        "Normal": (260, 2, [52_500*B, 155_400*B]),
        "Hard": (260, 2, [126*T, 357*T]),
        "Extreme": (260, 2, [1_320*T, 5_160*T])}),
    b("Kalos", GR, "Male", "All", ALLP, {
        "Easy": (265, 2, [94_500*B, 262_500*B]),
        "Normal": (265, 2, [336*T, 720*T]),
        "Chaos": (265, 2, [1_066*T, 4_060*T]),
        "Extreme": (265, 2, [5_798*T, 15_498*T])}),
    b("First Adversary", GR, "Male", "All", ALLP, {
        "Easy": (270, 3, [171*T, 171*T, 228*T]),
        "Normal": (270, 3, [495*T, 495*T, 660*T]),
        "Hard": (270, 3, [3_135*T, 3_135*T, 4_180*T]),
        "Extreme": (270, 3, [9_655*T, 9_655*T, 12_870*T])}),
    b("Kaling", GR, "Female", "All", ALLP, {
        "Easy": (275, 3, [3*96_600*B, 105*T, 3*63_200*B + 73_750*B]),
        "Normal": (275, 3, [3*399*T, 468*T, 3*270_700*B + 313_200*B]),
        "Hard": (275, 3, [3*920*T, 1_404*T, 3*1_360*T + 1_179*T]),
        "Extreme": (275, 3, [3*6_018*T, 6_930*T, 3*3_523_900*B + 4_404_600*B])},
        notes="P1 = 3 perils, P2 = Kaling, P3 = 3 perils + Frenzied Kaling"),
    b("Malefic Star", GR, "Female", "All", ALLP, {
        "Normal": (280, 1, [3_288*T]),
        "Hard": (280, 1, [14_740*T])}),
    b("Bellona", GR, "Female", "KMS only", ALLP, {
        "Easy": (280, 2, [316*T, 463*T]),
        "Normal": (280, 2, [1_652*T, 2_470*T]),
        "Hard": (280, 2, [5_564*T, 8_152*T])}),
    b("Limbo", GR, "Male", "All", ALLP, {
        "Normal": (285, 3, [1_944*T, 972*T + 972*T, 2_592*T]),
        "Hard": (285, 3, [3_774*T, 1_887*T + 1_887*T, 4_884*T])},
        notes="P2 = two separate parts"),
    b("Baldrix", GR, "Male", "All", ALLP, {
        "Normal": (290, 3, [2_379*T, 2_531*T, 4_145*T]),
        "Hard": (290, 3, [5_340*T, 5_688*T, 9_072*T])}),
    b("Jupiter", GR, "Male", "All", ALLP, {
        "Normal": (295, 1, [10_266*T]),
        "Hard": (295, 1, [49_400*T])}),
    b("Kai", "Other", "Male", "Seasonal", ALLP, {
        "Normal": (270, 2, [63*T, 63*T]),
        "Hard": (280, 2, [241_500*B, 241_500*B])},
        notes="Challenger World seasonal boss; World set to Other (Nexus Tower)"),
    b("Meilin", "Other", "Female", "Seasonal", ALLP, {
        "Normal": (270, 1, [58_925*B, 58_925*B]),
        "Hard": (280, 1, [290*T, 290*T])},
        notes="Challenger World Season 4 boss. One HP bar; form/map change at 50% HP is not counted as a new phase"),

    # Hard/Extreme-only additions
    b("Balrog", MW, "Male", "All", HX, {"Easy": (65, 1, [2_400_000 + 1_152_000 + 1_235_520])},
      notes="Only Easy mode exists; HP = body + 2 extra parts"),
    b("Ursus", MW, "Other", "GMS only", HX, {"Normal": (100, 1, [2_625*B])}),
    b("Yakuza Boss", MW, "Male", "All", HX, {"Normal": (160, 1, [1*B])}, notes="Entry level = Showa Town quest requirement"),
    b("Frenzied Gigatoad", MW, "Other", "All", HX, {"Hard": (170, 1, [900_000_000])},
      notes="GMS HP (other servers: 1.7B); entry level = Ninja Castle requirement"),
    b("Extreme Bigfoot", MW, "Other", "All", HX, {"Normal": (260, 1, [15*T])}, notes="Monster Park Extreme (260+)"),

    # Extreme-only additions
    b("Reina", GR, "Female", "All", XO, {"Normal": (280, 1, [2_100_000_000])}, notes="Arteria quest boss; entry level = Arteria requirement"),
    b("Julieta", MW, "Female", "Removed", XO, {"Normal": (None, None, None)}, notes="Removed (Monad). No HP/level/phases on any wiki"),
    b("Cross", MW, "Male", "Removed", XO, {"Normal": (None, None, None)}, notes="Removed JMS/TMS boss. No HP/level/phases on any wiki"),
    b("Normal Inferno Wolf", MW, "Other", "Removed", XO, {"Normal": (10, 1, [10*B])}, notes="Bounty portal boss, Lv 10-199. HP from Namu Wiki"),
    b("Chaos Inferno Wolf", MW, "Other", "Removed", XO, {"Normal": (200, 1, [20*T])}, notes="Bounty portal boss, Lv 200-259. HP from Namu Wiki"),
    b("Extreme Inferno Wolf", MW, "Other", "Removed", XO, {"Normal": (260, 1, [100*T])}, notes="Bounty portal boss, Lv 260+. HP from Namu Wiki"),
    b("Aufheben", "Other", "Female", "Event", XO, {"Normal": (None, None, None)}, notes="Event boss"),
    b("Tweentona", "Other", "Other", "Event", XO, {"Normal": (None, None, None)}, notes="Event boss"),
    b("Gerand Darmoor", GR, "Male", None, XO, {"Hard": (None, None, None)},
      notes="No boss fight found on MapleWiki or Namu Wiki (story character only)"),
    b("Havoc", GR, "Male", None, XO, {"Hard": (None, None, None)},
      notes="No boss fight found on MapleWiki or Namu Wiki (story character only)"),
]

# Maple Guide icons from maplestorywiki.net, per boss (all difficulties share one).
IMAGES = {
    'Zakum': 'images/bosses/zakum.png',
    'Papulatus': 'images/bosses/papulatus.png',
    'Magnus': 'images/bosses/magnus.png',
    'Hilla': 'images/bosses/hilla.png',
    'Mori Ranmaru': 'images/bosses/mori-ranmaru.png',
    'Horntail': 'images/bosses/horntail.png',
    'Pierre': 'images/bosses/pierre.png',
    'Von Bon': 'images/bosses/von-bon.png',
    'Crimson Queen': 'images/bosses/crimson-queen.png',
    'Vellum': 'images/bosses/vellum.png',
    'Von Leon': 'images/bosses/von-leon.png',
    'Arkarium': 'images/bosses/arkarium.png',
    'Gollux': 'images/bosses/gollux.png',
    'OMNI-CLN': 'images/bosses/omni-cln.png',
    'Pink Bean': 'images/bosses/pink-bean.png',
    'Cygnus': 'images/bosses/cygnus.png',
    'Princess No': 'images/bosses/princess-no.png',
    'Akechi Mitsuhide': 'images/bosses/akechi-mitsuhide.png',
    'Lotus': 'images/bosses/lotus.png',
    'Damien': 'images/bosses/damien.png',
    'Guardian Angel Slime': 'images/bosses/guardian-angel-slime.png',
    'Lucid': 'images/bosses/lucid.png',
    'Will': 'images/bosses/will.png',
    'Gloom': 'images/bosses/gloom.png',
    'Verus Hilla': 'images/bosses/verus-hilla.png',
    'Malicia': 'images/bosses/malicia.png',
    'Darknell': 'images/bosses/darknell.png',
    'Black Mage': 'images/bosses/black-mage.png',
    'Chosen Seren': 'images/bosses/chosen-seren.png',
    'Kalos': 'images/bosses/kalos.png',
    'First Adversary': 'images/bosses/first-adversary.png',
    'Kaling': 'images/bosses/kaling.png',
    'Malefic Star': 'images/bosses/malefic-star.png',
    'Bellona': 'images/bosses/bellona.png',
    'Limbo': 'images/bosses/limbo.png',
    'Baldrix': 'images/bosses/baldrix.png',
    'Jupiter': 'images/bosses/jupiter.png',
    'Kai': 'images/bosses/kai.png',
    'Balrog': 'images/bosses/balrog.png',
    'Ursus': 'images/bosses/ursus.png',
    'Julieta': 'images/bosses/julieta.png',
    'Cross': 'images/bosses/cross.png',
}

def entry(boss, diff, label):
    lv, ph, hps, *hpLabel = boss["diffs"][diff]
    return dict(name=label, boss=boss["name"], difficulty=diff, world=boss["world"], gender=boss["gender"],
                region=boss["region"], phases=ph, hp=sum(hps) if hps else None, phaseHp=hps, level=lv,
                hpLabel=hpLabel[0] if hpLabel else None, image=IMAGES.get(boss["name"]))

pools = {N: [], H: [], X: []}
for bo in bosses:
    for p in bo["pools"]:
        if p == X and len(bo["diffs"]) > 1:
            for d in bo["diffs"]:
                pools[p].append(entry(bo, d, f'{bo["name"]} ({d})'))
        else:
            pools[p].append(entry(bo, bo["main"], f'{bo["name"]} ({bo["main"]})'))

data = {
    "_about": "Boss data for Maple Wordle. Sources: maplestorywiki.net, Namu Wiki, Bahamut TMS HP table (Oct 2026). "
              "Normal/Hard modes use each boss's hardest non-Extreme mode (Hard > Chaos > Normal > Easy; Gollux = Hell). "
              "Extreme mode lists every difficulty as its own entry. hp = sum of all phase HP. level = entry level. "
              "Story mode uses the normal pool with unlimited guesses. null = Unknown; hpLabel overrides the HP display (e.g. 300Q+).",
    "attempts": {"story": None, "normal": 6, "hard": 5, "extreme": 5},
    "rules": {
        "numbers": "Phases, HP and Entry Lv: green if equal, otherwise an arrow pointing toward the answer. If the guess or the answer is Unknown, the tile is red with no arrow.",
        "text": "World, Gender, Region: green if equal, otherwise grey.",
        "hpValues": "GMS values are used wherever servers differ.",
    },
    "pools": pools,
    "notes": {bo["name"]: bo["notes"] for bo in bosses if bo["notes"]},
}
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "bosses.json"), "w") as f:
    json.dump(data, f, indent=1, ensure_ascii=False)

def fmt(n, label=None):
    if label: return label
    if n is None: return "Unknown"
    for v, s in ((10**15, "Q"), (10**12, "T"), (10**9, "B"), (10**6, "M")):
        if n >= v:
            x = n / v
            return (f"{x:.3f}".rstrip("0").rstrip(".")) + s
    return f"{n:,}"

def q(v): return "Unknown" if v is None else str(v)

# Clean review list: one row per boss and difficulty, with the modes it appears in.
in_mode = {}
for p in (N, H, X):
    for e in pools[p]:
        in_mode.setdefault((e["boss"], e["difficulty"]), set()).add(p)
mode_label = lambda ms: " / ".join(m.capitalize() for m in (N, H, X) if m in ms).replace("Normal", "Story/Normal")
md = ["# Maple Wordle - boss list", "",
      f"{len(bosses)} bosses, {len(pools[X])} boss + difficulty entries. Unknown = no data found.",
      "HP is the sum of every phase (M = million, B = billion, T = trillion, Q = quadrillion). Entry Lv = level needed to enter.",
      "Story/Normal and Hard use one difficulty per boss (Hard > Chaos > Normal > Easy, Gollux = Hell); Extreme uses every difficulty.", "",
      "| # | Boss | Difficulty | World | Gender | Region | Phases | HP | Entry Lv | In modes |",
      "|---|---|---|---|---|---|---|---|---|---|"]
for i, r in enumerate(pools[X], 1):
    md.append(f'| {i} | {r["boss"]} | {q(r["difficulty"])} | {q(r["world"])} | {q(r["gender"])} | {q(r["region"])} | '
              f'{q(r["phases"])} | {fmt(r["hp"], r["hpLabel"])} | {q(r["level"])} | {mode_label(in_mode[(r["boss"], r["difficulty"])])} |')
md.append("")
md += ["## Notes", ""] + [f"- **{k}**: {v}" for k, v in data["notes"].items()] + [""]
# Same list as an HTML page (opens at /data/bosses.html on the site).
import html as _h
rows = []
for i, r in enumerate(pools[X], 1):
    cells = [i, r["boss"], q(r["difficulty"]), q(r["world"]), q(r["gender"]), q(r["region"]), q(r["phases"]),
             fmt(r["hp"], r["hpLabel"]), q(r["level"]), mode_label(in_mode[(r["boss"], r["difficulty"])])]
    rows.append("<tr>" + "".join(f"<td>{_h.escape(str(c))}</td>" for c in cells) + "</tr>")
notes = "".join(f"<li><b>{_h.escape(k)}</b>: {_h.escape(v)}</li>" for k, v in data["notes"].items())
page = f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maple Wordle boss list</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }}
  .wrap {{ overflow-x: auto; }}
  table {{ border-collapse: collapse; font-size: 14px; }}
  th, td {{ border: 1px solid #bbb; padding: 4px 8px; text-align: left; white-space: nowrap; }}
  th {{ background: #e8eef6; position: sticky; top: 0; }}
  tr:nth-child(even) td {{ background: #f6f8fb; }}
</style></head><body>
<h1>Maple Wordle boss list</h1>
<p>{len(bosses)} bosses, {len(pools[X])} boss + difficulty entries. Unknown = no data found.<br>
HP is the sum of every phase (M = million, B = billion, T = trillion, Q = quadrillion). Entry Lv = level needed to enter.<br>
Story/Normal and Hard use one difficulty per boss (Hard &gt; Chaos &gt; Normal &gt; Easy, Gollux = Hell); Extreme uses every difficulty.</p>
<div class="wrap"><table>
<tr><th>#</th><th>Boss</th><th>Difficulty</th><th>World</th><th>Gender</th><th>Region</th><th>Phases</th><th>HP</th><th>Entry Lv</th><th>In modes</th></tr>
{chr(10).join(rows)}
</table></div>
<h2>Notes</h2><ul>{notes}</ul>
</body></html>
"""
with open(os.path.join(OUT, "bosses.html"), "w") as f:
    f.write(page)
with open(os.path.join(OUT, "bosses.md"), "w") as f:
    f.write("\n".join(md))
print({k: len(v) for k, v in pools.items()})

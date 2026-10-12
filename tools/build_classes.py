# Builds data/classes.json and data/classes.md (Guess the Class word bank).
# Run from the repo root: python3 tools/build_classes.py data
# Sources: maplestorywiki.net class pages (faction, job branch, main stat, Availability table),
# maplestorywiki.net "Class Release Dates" (GMS dates), news for a few gaps. Pictures: newest NPC portrait
# in the class's canon gender, or class artwork where there is no portrait.
import json, os, re, sys

OUT = sys.argv[1]
ALL = "All"

# name, faction, job branch(es), main stat(s), GMS release year (None = unknown), year label, region, since
# Job branch / main stat may list several values (Xenon); a guess sharing one of them shows yellow.
# year label: shown instead of the year (e.g. "Not in GMS (KMS 2026)"); arrows still use the year if set.
# since="YYYY-MM-DD": first day the class can be an answer (for classes added after launch).
CLASSES = [
    # Classes that match in every column share one card (one answer, one group picture).
    ("Hero / Paladin / Dark Knight", "Explorer", ["Warrior"], ["STR"], 2005, None, ALL),
    ("Arch Mage (F/P) / Arch Mage (I/L) / Bishop", "Explorer", ["Magician"], ["INT"], 2005, None, ALL),
    ("Bow Master / Marksman", "Explorer", ["Bowman"], ["DEX"], 2005, None, ALL),
    ("Pathfinder", "Explorer", ["Bowman"], ["DEX"], 2019, None, ALL),
    ("Night Lord / Shadower", "Explorer", ["Thief"], ["LUK"], 2005, None, ALL),
    ("Dual Blade", "Explorer", ["Thief"], ["LUK"], 2010, None, ALL),
    ("Buccaneer", "Explorer", ["Pirate"], ["STR"], 2008, None, ALL),
    ("Corsair", "Explorer", ["Pirate"], ["DEX"], 2008, None, ALL),
    ("Cannoneer", "Explorer", ["Pirate"], ["STR"], 2011, None, ALL),
    ("Dawn Warrior", "Cygnus Knights", ["Warrior"], ["STR"], 2009, None, ALL),
    ("Blaze Wizard", "Cygnus Knights", ["Magician"], ["INT"], 2009, None, ALL),
    ("Wind Archer", "Cygnus Knights", ["Bowman"], ["DEX"], 2009, None, ALL),
    ("Night Walker", "Cygnus Knights", ["Thief"], ["LUK"], 2009, None, ALL),
    ("Thunder Breaker", "Cygnus Knights", ["Pirate"], ["STR"], 2009, None, ALL),
    ("Mihile", "Cygnus Knights", ["Warrior"], ["STR"], 2012, None, ALL),
    ("Aran", "Heroes", ["Warrior"], ["STR"], 2009, None, ALL),
    ("Evan", "Heroes", ["Magician"], ["INT"], 2010, None, ALL),
    ("Mercedes", "Heroes", ["Bowman"], ["DEX"], 2011, None, ALL),
    ("Phantom", "Heroes", ["Thief"], ["LUK"], 2012, None, ALL),
    ("Luminous", "Heroes", ["Magician"], ["INT"], 2012, None, ALL),
    ("Shade", "Heroes", ["Pirate"], ["STR"], 2014, None, ALL),
    ("Demon Slayer", "Resistance", ["Warrior"], ["STR"], 2012, None, ALL),
    ("Demon Avenger", "Resistance", ["Warrior"], ["HP"], 2013, None, ALL),
    ("Battle Mage", "Resistance", ["Magician"], ["INT"], 2010, None, ALL),
    ("Wild Hunter", "Resistance", ["Bowman"], ["DEX"], 2010, None, ALL),
    ("Mechanic", "Resistance", ["Pirate"], ["DEX"], 2011, None, ALL),
    ("Xenon", "Resistance", ["Thief", "Pirate"], ["STR", "DEX", "LUK"], 2013, None, ALL),
    ("Blaster", "Resistance", ["Warrior"], ["STR"], 2016, None, ALL),
    ("Hayato", "Sengoku", ["Warrior"], ["STR"], 2013, None, "All except KMS"),
    ("Kanna", "Sengoku", ["Magician"], ["INT"], 2013, None, "All except KMS"),
    ("Kaiser", "Nova", ["Warrior"], ["STR"], 2012, None, ALL),
    ("Kain", "Nova", ["Bowman"], ["DEX"], 2021, None, ALL),
    ("Cadena", "Nova", ["Thief"], ["LUK"], 2017, None, ALL),
    ("Angelic Buster", "Nova", ["Pirate"], ["DEX"], 2013, None, ALL),
    ("Zero", "Transcendent", ["Warrior"], ["STR"], 2013, None, ALL),
    ("Kinesis", "Friends World", ["Magician"], ["INT"], 2015, None, ALL),
    ("Adele", "Flora", ["Warrior"], ["STR"], 2020, None, ALL),
    ("Illium", "Flora", ["Magician"], ["INT"], 2017, None, ALL),
    ("Khali", "Flora", ["Thief"], ["LUK"], 2023, None, ALL),
    ("Ark", "Flora", ["Pirate"], ["STR"], 2018, None, ALL),
    ("Ren", "Anima", ["Warrior"], ["STR"], 2025, None, ALL),
    ("Lara", "Anima", ["Magician"], ["INT"], 2021, None, ALL),
    ("Hoyoung", "Anima", ["Thief"], ["LUK"], 2019, None, ALL),
    ("Lynn", "Jianghu", ["Magician"], ["INT"], 2024, None, "All except KMS"),
    ("Mo Xuan", "Jianghu", ["Pirate"], ["DEX"], 2025, None, "GMS/CMS/TMS/MSEA"),
    ("Erel Light", "Shine", ["Warrior"], ["STR"], 2026, None, "GMS"),
    ("Sia Astelle", "Shine", ["Magician"], ["INT"], 2025, None, "GMS"),
    ("Iel", "Shine", ["Bowman"], ["DEX"], 2027, "2027 (Upcoming)", "GMS"),
    ("Lethe", "Demon", ["Magician"], ["INT"], 2026, None, "KMS"),
    # Removed classes
    ("Jett", "Explorer", ["Pirate"], ["DEX"], 2012, None, "Removed"),
    ("Beast Tamer", "Beast Tamer", ["Magician"], ["INT"], 2014, None, "Removed"),
    ("Zen", "Explorer", ["Pirate"], ["DEX"], None, "Not in GMS", "Removed"),
    # Event-only classes
    ("Pink Bean", "Monster", ["Warrior"], ["STR"], 2015, None, "Event"),
    ("Yeti", "Monster", ["Pirate"], ["STR"], 2021, None, "Event"),
    ("Tanjiro Kamado", "Collab", ["Warrior"], ["STR"], 2025, None, "Event"),
    ("Saitama", "Collab", ["Pirate"], ["STR"], 2026, None, "Event"),
]

slug = lambda n: re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
pool = []
for name, faction, branch, stat, year, year_label, region, *since in CLASSES:
    e = dict(name=name, faction=faction, branch=branch, stat=stat, year=year, region=region,
             image=f"images/classes/{slug(name)}.png")
    if " / " in name:  # group card: each member name is searchable on its own
        e["members"] = name.split(" / ")
    if year_label:
        e["yearLabel"] = year_label
    if since:
        import datetime
        e["since"] = (datetime.date.fromisoformat(since[0]) - datetime.date(1970, 1, 1)).days
    pool.append(e)

# Attack Animation needs every class on its own (each has its own skill animation), so group cards are split back
# into their member classes there. Member pictures: images/classes/<member slug>.png.
solo = []
for e in pool:
    for m in e.get("members", [e["name"]]):
        x = {k: v for k, v in e.items() if k != "members"}
        x["name"] = m
        x["image"] = f"images/classes/{slug(m)}.png"
        solo.append(x)

data = {
    "_about": "Guess the Class word bank. Sources: maplestorywiki.net (class pages, Availability tables, Class Release Dates). "
              "year = GMS release year (null = unknown or not in GMS; yearLabel explains). branch/stat are lists (Xenon has several). "
              "members = classes sharing one card because they match in every column. solo = every class on its own (Attack Animation).",
    "attempts": 5,
    "classes": pool,
    "solo": solo,
}
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "classes.json"), "w") as f:
    json.dump(data, f, indent=1, ensure_ascii=False)
md = ["# Guess the Class - word bank", "", f"{len(pool)} classes.", "",
      "| # | Class | Faction | Job Branch | Main Stat | Release Year (GMS) | Region |", "|---|---|---|---|---|---|---|"]
for i, e in enumerate(pool, 1):
    md.append(f"| {i} | {e['name']} | {e['faction']} | {' / '.join(e['branch'])} | {', '.join(e['stat'])} | "
              f"{e.get('yearLabel') or e['year'] or 'Unknown'} | {e['region']} |")
with open(os.path.join(OUT, "classes.md"), "w") as f:
    f.write("\n".join(md) + "\n")
print(len(pool), "classes,", len(solo), "on their own")

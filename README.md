# Maple Wordle

A daily MapleStory boss guessing game. Play at **https://ima.moe/maplewordle/**
(the github.io address redirects there and carries saves along, see `move.js`)

Guess the boss using hints for World, Gender, Region, Phases, HP and Entry Level.
Modes: Story (unlimited guesses), Normal, Hard and Extreme. A new boss every day at 00:00 UTC.

Boss data lives in `data/bosses.json` (sources: maplestorywiki.net, Namu Wiki, Bahamut TMS HP table).

**Guess the Class** (`class.html`, `class.js`; served at `/maplewordle/class`): guess the class from Faction, Job Branch, Main Stat,
Release Year (GMS) and Region, 5 guesses. The word bank is in `tools/build_classes.py`; run
`python3 tools/build_classes.py data` to rebuild `data/classes.json` and `data/classes.md`.
Puzzle #1 is `FIRST_DAY` in `class.js`.

Suggestions or feedback? [Join the Discord!](https://discord.gg/f22H4UJ)

## Everyone's stats (Cloudflare Worker)

The "Everyone's results" bars after a game come from a small Cloudflare Worker with a D1 database (`worker/`).
Each browser sends its result once per mode per day. Until `STATS_URL` in `script.js` is set, the bars stay hidden.

1. Cloudflare dashboard → **Storage & Databases → D1** → create a database named `maplewordle`, open its **Console**, and run `worker/schema.sql`.
2. **Workers & Pages → Create → Create Worker** named `maplewordle-stats` → Deploy → **Edit code**, paste `worker/stats.js`, Deploy.
3. Worker **Settings → Bindings → Add → D1 database**: variable name `DB`, database `maplewordle`. Deploy again.
4. Put the Worker's URL (e.g. `https://maplewordle-stats.<you>.workers.dev/`) into `STATS_URL` in `script.js`.

## Adding a boss later

Add it to the list in `tools/build_bosses.py` with `since="YYYY-MM-DD"` (the first day it can be an answer), e.g.

    b("New Boss", GR, "Female", "KMS only", ALLP, {"Hard": (300, 2, [10*Q, 12*Q])}, since="2027-01-20"),

then run `python3 tools/build_bosses.py data`. Past days stay the same, and the new boss joins the bosses still
left in the current cycle (it doesn't wait for the next one).

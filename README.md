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

## Accounts (Cloudflare Worker)

Settings → Account: a username (1-10 letters or numbers) and password (1-16 characters), no email. The account keeps
everything the site saves in the browser (the `mapleWordle:*` keys, except sound volume), so it can be played on
other devices. Browser side: `account.js`; server: `worker/account.js`, in the same D1 database as the stats.

1. D1 → `maplewordle` → **Console**: run `worker/account-schema.sql` (it's one line per statement, so it pastes as one line).
2. **Workers & Pages → Create → Create Worker** named `maplewordle-account` → Deploy → **Edit code**, paste `worker/account.js`, Deploy.
3. Worker **Settings → Bindings → Add → D1 database**: variable name `DB`, database `maplewordle`.
4. Worker **Settings → Variables and Secrets → Add**: type Secret, name `ADMIN_KEY`, any long random text. Deploy.
5. `ACCOUNT_URL` in `account.js` is the Worker's URL.

Admin page: `admin.html` (not linked anywhere). Type `/find user yuki`, `/find uid 1`, `/find meso+ 5000`,
`/find meso- 100` or `/find all` to look accounts up, and `/reset yuki temp123` to give someone a new password
(it logs them out everywhere). `/delete yuki` deletes an account for good (it asks you to type the name first). It asks for the `ADMIN_KEY` once and keeps it in that browser.

Or without the page: forgot a password (asked on Discord)? Set a new one, which also logs that account out everywhere:

    curl -X POST https://maplewordle-account.hanayuki.workers.dev/admin/reset -H "X-Admin-Key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"name\":\"theirname\",\"pass\":\"newpass\"}"

Everyone's accounts and their numbers (UID), in the D1 Console:

    SELECT id, name, datetime(created, 'unixepoch') AS made FROM users ORDER BY id;

## Adding a boss later

Add it to the list in `tools/build_bosses.py` with `since="YYYY-MM-DD"` (the first day it can be an answer), e.g.

    b("New Boss", GR, "Female", "KMS only", ALLP, {"Hard": (300, 2, [10*Q, 12*Q])}, since="2027-01-20"),

then run `python3 tools/build_bosses.py data`. Past days stay the same, and the new boss joins the bosses still
left in the current cycle (it doesn't wait for the next one).

## Attack Animation (Guess the Class)

`animation.html` / `animation.js`: guess the class from its skill clips. Unlimited guesses; each wrong guess unlocks
the next hint (clip 2 if the class has one, then one category each in a random order per day, then the first letter). A class
can be the answer once it has clip 1. Add a clip (needs ffmpeg; makes a small WebM, an MP4 for older iPhones and a
poster image under `videos/anim/`, and records it in `data/animation.json`):

    python3 tools/add_clip.py "Hero" raw-video.mp4 --start 2.5 --end 7 --credit Name --credit-image still.png --day
    python3 tools/add_clip.py "Hero" second-clip.mp4 --puzzle 3        # clip 2 for puzzle 3

Classes added after launch: add `--since YYYY-MM-DD` so past days keep their answers. Puzzle #1 is `FIRST_DAY` in
`animation.js`.

## Adding a new game mode

Each game is its own page (like `index.html` and `class.html`). Put the same `#games` button row on every page:
the current game gets `class="on"`, the others link to their page (`onclick="location.href='class'"`), and ones that
aren't ready are `disabled` with `<small>Coming soon</small>`. When a game goes live, replace its `disabled` button
with a link on **every** page. The hover highlight comes from `style.css` automatically.

Stats: the Worker (`worker/stats.js`) already accepts `sound` (6 guesses), `map` (unlimited), and any other short lowercase
mode name with up to 999 guesses, so a new game's "Everyone's results" work without redeploying it. Only redeploy
if a game needs a different guess limit than that. Bonus rounds post `{"bonus": true|false}` for any mode; the reply's
`bonus` gives the right / wrong counts (BGM Clip shows them as the Bonus row).

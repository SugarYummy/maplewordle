# Maple Wordle

A daily MapleStory boss guessing game. Play at **https://sugaryummy.github.io/maplewordle/**

Guess the boss using hints for World, Gender, Region, Phases, HP and Entry Level.
Modes: Story (unlimited guesses), Normal, Hard and Extreme. A new boss every day at 00:00 UTC.

Boss data lives in `data/bosses.json` (sources: maplestorywiki.net, Namu Wiki, Bahamut TMS HP table).

Suggestions or feedback? [Join the Discord!](https://discord.gg/f22H4UJ)

## Everyone's stats (Cloudflare Worker)

The "Everyone's results" bars after a game come from a small Cloudflare Worker with a D1 database (`worker/`).
Each browser sends its result once per mode per day. Until `STATS_URL` in `script.js` is set, the bars stay hidden.

1. Cloudflare dashboard → **Storage & Databases → D1** → create a database named `maplewordle`, open its **Console**, and run `worker/schema.sql`.
2. **Workers & Pages → Create → Create Worker** named `maplewordle-stats` → Deploy → **Edit code**, paste `worker/stats.js`, Deploy.
3. Worker **Settings → Bindings → Add → D1 database**: variable name `DB`, database `maplewordle`. Deploy again.
4. Put the Worker's URL (e.g. `https://maplewordle-stats.<you>.workers.dev/`) into `STATS_URL` in `script.js`.

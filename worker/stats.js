// Maple Wordle stats API (Cloudflare Worker + D1 database bound as DB).
//   GET  ?mode=normal&day=20736          -> { counts: { "1": 3, "4": 7, "X": 2 } }
//   POST ?mode=normal&day=20736  {"score": 4 | "X"}   records one result, returns the same shape.
//   POST ?mode=bgm&day=20746     {"bonus": true | false}   records one bonus-round answer (right / wrong).
//   Every response also carries "bonus": { "right": n, "wrong": n } for that mode and day (empty if there's none).
// Story, Attack Animation and Guess the Map have unlimited guesses: any guess count (capped at 999) and never "X".
// class = Guess the Class, anim = Attack Animation, bgm = BGM Clip, sound = Sound Clip, map = Guess the Map (both coming soon).
const MAX_GUESSES = { story: 999, normal: 6, hard: 5, extreme: 5, class: 5, anim: 999, bgm: 6, sound: 6, map: 999 };
// Any other short lowercase mode name (a game added later) is accepted too, with up to 999 guesses and "X" for a loss,
// so a new game's stats work without redeploying this Worker.
const NEW_MODE = /^[a-z][a-z0-9]{0,11}$/;
const maxFor = (mode) => MAX_GUESSES[mode] ?? (NEW_MODE.test(mode) ? 999 : 0);
const UNLIMITED = new Set(['story', 'anim', 'map']);   // can't lose, so never "X"
const FIRST_DAY = Date.UTC(2026, 9, 10) / 86400000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    const day = Number(url.searchParams.get('day'));
    const today = Math.floor(Date.now() / 86400000);
    if (!mode || !maxFor(mode) || !Number.isInteger(day) || day < FIRST_DAY || day > today + 1) {
      return json({ error: 'bad mode or day' }, 400);
    }

    const add = (m, score) => env.DB.prepare(
      'INSERT INTO results (mode, day, score, count) VALUES (?, ?, ?, 1) ' +
      'ON CONFLICT (mode, day, score) DO UPDATE SET count = count + 1'
    ).bind(m, day, score).run();
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad body' }, 400); }
      if (typeof body?.bonus === 'boolean') {
        // Bonus answers are kept beside the mode's results, as mode "<mode>+bonus" with score "right" / "wrong".
        await add(mode + '+bonus', body.bonus ? 'right' : 'wrong');
      } else {
        const score = body?.score;
        const ok = (score === 'X' && !UNLIMITED.has(mode)) || (Number.isInteger(score) && score >= 1 && score <= maxFor(mode));
        if (!ok) return json({ error: 'bad score' }, 400);
        await add(mode, String(score));
      }
    } else if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405);
    }

    const { results } = await env.DB.prepare('SELECT mode, score, count FROM results WHERE mode IN (?, ?) AND day = ?')
      .bind(mode, mode + '+bonus', day).all();
    const pick = (m) => Object.fromEntries(results.filter((r) => r.mode === m).map((r) => [r.score, r.count]));
    return json({ counts: pick(mode), bonus: pick(mode + '+bonus') });
  },
};

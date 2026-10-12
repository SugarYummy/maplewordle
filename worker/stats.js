// Maple Wordle stats API (Cloudflare Worker + D1 database bound as DB).
//   GET  ?mode=normal&day=20736          -> { counts: { "1": 3, "4": 7, "X": 2 } }
//   POST ?mode=normal&day=20736  {"score": 4 | "X"}   records one result, returns the same shape.
// Story and Animation Attack have unlimited guesses, so they accept any guess count (capped at 999) and never "X".
const MAX_GUESSES = { story: 999, normal: 6, hard: 5, extreme: 5, class: 5, anim: 999 };   // class = Guess the Class, anim = Animation Attack
const UNLIMITED = new Set(['story', 'anim']);   // can't lose, so never "X"
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
    if (!(mode in MAX_GUESSES) || !Number.isInteger(day) || day < FIRST_DAY || day > today + 1) {
      return json({ error: 'bad mode or day' }, 400);
    }

    if (request.method === 'POST') {
      let score;
      try { ({ score } = await request.json()); } catch { return json({ error: 'bad body' }, 400); }
      const ok = (score === 'X' && !UNLIMITED.has(mode)) || (Number.isInteger(score) && score >= 1 && score <= MAX_GUESSES[mode]);
      if (!ok) return json({ error: 'bad score' }, 400);
      await env.DB.prepare(
        'INSERT INTO results (mode, day, score, count) VALUES (?, ?, ?, 1) ' +
        'ON CONFLICT (mode, day, score) DO UPDATE SET count = count + 1'
      ).bind(mode, day, String(score)).run();
    } else if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405);
    }

    const { results } = await env.DB.prepare('SELECT score, count FROM results WHERE mode = ? AND day = ?')
      .bind(mode, day).all();
    return json({ counts: Object.fromEntries(results.map((r) => [r.score, r.count])) });
  },
};

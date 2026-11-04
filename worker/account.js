// Maple Wordle accounts (Cloudflare Worker + the same D1 database as the stats, bound as DB; tables: account-schema.sql,
// no comments in it so it pastes into the D1 Console as one line). users: name as typed + name_key in lowercase (unique);
// data = the saved progress, rev counts its saves. sessions: one per signed-in device. attempts: failed logins / signups per IP.
// A username + password (no email), and one saved copy of the site's progress (its mapleWordle:* browser storage)
// per account, so it can be played on any device.
//   POST /signup {name, pass}            -> {token, id, name, rev: 0}   (id: the account's number, shown as its UID)
//   POST /login  {name, pass}            -> {token, id, name, rev, data}; error "nouser" (no such username) or "wrong" (password)
//   POST /logout                         (signed in) ends this device's session
//   POST /rename {name}                  (signed in) a new username (the same one in other capitals is fine) -> {name}
//   POST /password {pass}                (signed in) a new password (the account's other devices stay signed in)
//   GET  /sync?rev=N                     (signed in) -> {id, name, rev} and, if the account's save isn't at rev N, its data
//                                        (name: so a username changed on another device shows here too)
//   POST /sync {base, set, del}          (signed in) changes some keys -> {rev}
//   POST /sync {base, replace}           (signed in) the whole save at once (right after signing up)
//     base: the rev this device has. If the account has moved on since (another device played), nothing is saved and
//     it answers 409 with the account's save: that device takes it as it is (so a wrong guess can't be undone elsewhere).
//   POST /admin/reset {name, pass}       header X-Admin-Key: the ADMIN_KEY secret. Sets a new password and logs the
//                                        account out everywhere (for people who forgot theirs and ask on Discord).
//   POST /admin/find {by, value}         header X-Admin-Key. Accounts by "user" (part of the name), "uid", "meso+" (at
//                                        least), "meso-" (at most) or "all" -> {users: [{id, name, mesos, made, saved, devices}]}
//                                        (admin.html on the site types these as /find commands)
//   POST /admin/delete {name}            header X-Admin-Key. Deletes the account and signs out its devices (no undo).
//   GET  /top                            the site's top 10 by achievement points with at least 1,000 (Master rank)
//                                        -> {top: [{id, name, ap}]} (AP: the mapleWordle:ap key in each save; cached 5 min)
//   GET  /rates                          how many accounts have each achievement -> {total, have: {<id>: n}} (total: the
//                                        accounts with an achievements save, mapleWordle:achv; cached 5 min)
//   GET  /maple?region=na|eu&name=IGN    a MapleStory character from Nexon's rankings -> {name, level, job, world,
//                                        img} (404 "nouser" if it isn't ranked). Nexon doesn't let browsers ask it directly.
// Signed in = header "Authorization: Bearer <token>". Only a hash of each token is stored.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const NAME = /^[A-Za-z0-9]{1,10}$/;   // usernames: 1-10 letters or numbers, unique ignoring case
const PASS_MIN = 1, PASS_MAX = 16;
const MAX_DATA = 1000000;              // a save's size limit (characters)
const IGN = /^[A-Za-z0-9]{2,13}$/;     // MapleStory character names
const WORLDS = { 1: 'Bera', 19: 'Scania', 45: 'Kronos', 70: 'Hyperion', 30: 'Luna', 46: 'Solis' };   // Nexon's world IDs
const ITER = 10000;                    // PBKDF2 rounds (kept low for the free plan's CPU limit; stored per account)
const LIMITS = { login: [10, 10 * 60], signup: [5, 60 * 60] };   // tries per IP: [how many, in seconds] (failed logins / signups)

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
async function hashPass(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, key, 256));
}
const same = (a, b) => {   // compare without stopping at the first difference
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const now = () => Math.floor(Date.now() / 1000);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const ip = request.headers.get('CF-Connecting-IP') || '?';
    const db = env.DB;
    let body = {};
    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > MAX_DATA + 10000) return json({ error: 'too big' }, 413);
      try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'bad body' }, 400); }
    } else if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

    const tooMany = async (kind) => {
      const [max, secs] = LIMITS[kind];
      const row = await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE ip = ? AND kind = ? AND at > ?').bind(ip, kind, now() - secs).first();
      return row.n >= max;
    };
    const tried = (kind) => db.batch([
      db.prepare('INSERT INTO attempts (ip, kind, at) VALUES (?, ?, ?)').bind(ip, kind, now()),
      db.prepare('DELETE FROM attempts WHERE at < ?').bind(now() - 24 * 3600),
    ]);
    const newSession = async (userId) => {
      const token = randomHex(32);
      await db.prepare('INSERT INTO sessions (token_hash, user_id, created, seen) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now(), now()).run();
      return token;
    };
    const signedIn = async () => {
      const m = (request.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
      if (!m) return null;
      const th = await sha256(m[1]);
      const user = await db.prepare('SELECT u.id, u.name, u.rev, s.seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(th).first();
      if (user) user.th = th;
      return user;
    };
    const goodName = (n) => typeof n === 'string' && NAME.test(n);
    const goodPass = (p) => typeof p === 'string' && p.length >= PASS_MIN && p.length <= PASS_MAX;

    if (path === '/signup' && request.method === 'POST') {
      const { name, pass } = body;
      if (!goodName(name)) return json({ error: 'name' }, 400);
      if (!goodPass(pass)) return json({ error: 'pass' }, 400);
      if (await tooMany('signup')) return json({ error: 'slow down' }, 429);
      if (await db.prepare('SELECT 1 FROM users WHERE name_key = ?').bind(name.toLowerCase()).first()) return json({ error: 'taken' }, 409);
      await tried('signup');
      const salt = randomHex(16);
      const res = await db.prepare('INSERT INTO users (name, name_key, pass_hash, salt, iter, created, rev, data, updated) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT (name_key) DO NOTHING')
        .bind(name, name.toLowerCase(), await hashPass(pass, salt, ITER), salt, ITER, now(), '{}', now()).run();
      if (!res.meta.changes) return json({ error: 'taken' }, 409);   // someone took it a moment ago
      const user = await db.prepare('SELECT id FROM users WHERE name_key = ?').bind(name.toLowerCase()).first();
      return json({ token: await newSession(user.id), id: user.id, name, rev: 0 }, 201);
    }

    if (path === '/login' && request.method === 'POST') {
      const { name, pass } = body;
      if (await tooMany('login')) return json({ error: 'slow down' }, 429);
      const user = goodName(name) && await db.prepare('SELECT id, name, pass_hash, salt, iter, rev, data FROM users WHERE name_key = ?').bind(name.toLowerCase()).first();
      if (!user) { await tried('login'); return json({ error: 'nouser' }, 404); }   // (the site says which one was wrong)
      if (!goodPass(pass) || !same(await hashPass(pass, user.salt, user.iter), user.pass_hash)) {
        await tried('login');
        return json({ error: 'wrong' }, 401);
      }
      return json({ token: await newSession(user.id), id: user.id, name: user.name, rev: user.rev, data: JSON.parse(user.data) });
    }

    if (path === '/admin/reset' && request.method === 'POST') {
      const key = request.headers.get('X-Admin-Key') || '';
      if (!env.ADMIN_KEY || !same(key, env.ADMIN_KEY)) return json({ error: 'no' }, 403);
      const { name, pass } = body;
      if (!goodName(name) || !goodPass(pass)) return json({ error: 'bad name or password' }, 400);
      const user = await db.prepare('SELECT id FROM users WHERE name_key = ?').bind(name.toLowerCase()).first();
      if (!user) return json({ error: 'no such user' }, 404);
      const salt = randomHex(16);
      await db.batch([
        db.prepare('UPDATE users SET pass_hash = ?, salt = ?, iter = ? WHERE id = ?').bind(await hashPass(pass, salt, ITER), salt, ITER, user.id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      ]);
      return json({ ok: true });
    }

    if (path === '/admin/delete' && request.method === 'POST') {
      const key = request.headers.get('X-Admin-Key') || '';
      if (!env.ADMIN_KEY || !same(key, env.ADMIN_KEY)) return json({ error: 'no' }, 403);
      const { name } = body;
      if (!goodName(name)) return json({ error: 'bad name' }, 400);
      const user = await db.prepare('SELECT id, name FROM users WHERE name_key = ?').bind(name.toLowerCase()).first();
      if (!user) return json({ error: 'no such user' }, 404);
      await db.batch([
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
        db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
      ]);
      return json({ ok: true, id: user.id, name: user.name });
    }

    if (path === '/admin/find' && request.method === 'POST') {
      const key = request.headers.get('X-Admin-Key') || '';
      if (!env.ADMIN_KEY || !same(key, env.ADMIN_KEY)) return json({ error: 'no' }, 403);
      const { by, value } = body;
      const where = { user: "name_key LIKE '%' || ? || '%'", uid: 'id = ?', 'meso+': 'mesos >= ?', 'meso-': 'mesos <= ?', all: '1' }[by];
      if (!where) return json({ error: 'bad search' }, 400);
      const arg = by === 'user' ? String(value ?? '').toLowerCase() : Number(value);
      if (by !== 'all' && by !== 'user' && !Number.isFinite(arg)) return json({ error: 'bad number' }, 400);
      // mesos: the meso history's total, like the site's (the mapleWordle:mesoLog key in the save)
      const { results } = await db.prepare('SELECT * FROM (SELECT u.id, u.name, u.name_key, ' +
        `(SELECT COALESCE(SUM(json_extract(e.value, '$.amount')), 0) FROM json_each(COALESCE(json_extract(u.data, '$."mapleWordle:mesoLog"'), '[]')) e) AS mesos, ` +
        'u.created AS made, u.updated AS saved, (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS devices FROM users u) ' +
        `WHERE ${where} ORDER BY id LIMIT 200`).bind(...(by === 'all' ? [] : [arg])).all();
      return json({ users: results.map(({ name_key, ...r }) => r) });
    }

    // Achievements' Master rank: the 10 accounts with the most achievement points (1,000+). No sign-in needed (names
    // and points only). Ties: the older account first. Kept at Cloudflare's edge for 5 minutes, so visits don't each read D1.
    if (path === '/top' && request.method === 'GET') {
      const cache = caches.default, key = new Request(url.origin + '/top');
      const hit = await cache.match(key);
      if (hit) return hit;
      const { results } = await db.prepare(`SELECT id, name, CAST(COALESCE(json_extract(data, '$."mapleWordle:ap"'), '0') AS INTEGER) AS ap FROM users ` +
        'WHERE ap >= 1000 ORDER BY ap DESC, id ASC LIMIT 10').all();
      const res = json({ top: results });
      res.headers.set('Cache-Control', 'public, max-age=300');
      await cache.put(key, res.clone());
      return res;
    }

    // Achievements' Global Completion Rate: for each achievement, how many accounts have it (the ids in each save's
    // mapleWordle:achv, not its _notes), out of the accounts that have opened Achievements. No sign-in needed (counts
    // only). Kept at Cloudflare's edge for 5 minutes, like /top.
    if (path === '/rates' && request.method === 'GET') {
      const cache = caches.default, key = new Request(url.origin + '/rates');
      const hit = await cache.match(key);
      if (hit) return hit;
      const saves = `WITH a AS (SELECT json_extract(data, '$."mapleWordle:achv"') AS v FROM users), g AS (SELECT v FROM a WHERE v IS NOT NULL AND json_valid(v)) `;
      const [count, { results }] = await Promise.all([
        db.prepare(saves + 'SELECT COUNT(*) AS n FROM g').first(),
        db.prepare(saves + `SELECT j.key AS id, COUNT(*) AS n FROM g, json_each(CASE WHEN json_valid(g.v) THEN g.v ELSE '{}' END) j WHERE substr(j.key, 1, 1) != '_' AND j.type != 'null' GROUP BY j.key`).all(),
      ]);
      const res = json({ total: count?.n || 0, have: Object.fromEntries(results.map((r) => [r.id, r.n])) });
      res.headers.set('Cache-Control', 'public, max-age=300');
      await cache.put(key, res.clone());
      return res;
    }

    // (No sign-in needed: it only reads Nexon's public rankings, and the test build's pretend accounts use it too.)
    if (path === '/maple' && request.method === 'GET') {
      const region = url.searchParams.get('region'), name = url.searchParams.get('name') || '';
      if (!['na', 'eu'].includes(region) || !IGN.test(name)) return json({ error: 'ign' }, 400);
      const api = `https://www.nexon.com/api/maplestory/no-auth/ranking/v2/${region}?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=${name}`;
      let r;
      try { r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 (maplewordle)' }, cf: { cacheTtl: 600 } }); } catch { r = null; }
      if (!r?.ok) return json({ error: 'nexon' }, 502);
      const c = (await r.json().catch(() => ({}))).ranks?.find((x) => x.characterName?.toLowerCase() === name.toLowerCase());
      if (!c) return json({ error: 'nouser' }, 404);
      return json({ name: c.characterName, level: c.level, job: c.jobName, world: WORLDS[c.worldID] ?? '', img: c.characterImgURL });
    }

    // Everything below needs a signed-in device.
    const user = await signedIn();
    if (!user) return json({ error: 'signed out' }, 401);

    if (path === '/logout' && request.method === 'POST') {
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.th).run();
      return json({ ok: true });
    }

    if (path === '/rename' && request.method === 'POST') {
      const { name } = body;
      if (!goodName(name)) return json({ error: 'name' }, 400);
      const other = await db.prepare('SELECT id FROM users WHERE name_key = ?').bind(name.toLowerCase()).first();
      if (other && other.id !== user.id) return json({ error: 'taken' }, 409);
      try {
        await db.prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ?').bind(name, name.toLowerCase(), user.id).run();
      } catch { return json({ error: 'taken' }, 409); }   // someone took it a moment ago
      return json({ name });
    }

    if (path === '/password' && request.method === 'POST') {
      const { pass } = body;
      if (!goodPass(pass)) return json({ error: 'pass' }, 400);
      const salt = randomHex(16);
      await db.prepare('UPDATE users SET pass_hash = ?, salt = ?, iter = ? WHERE id = ?').bind(await hashPass(pass, salt, ITER), salt, ITER, user.id).run();
      return json({ ok: true });
    }

    if (path === '/sync' && request.method === 'GET') {
      // "Last seen" moves at most once a day, so a visit is a read, not a write.
      if (user.seen < now() - 86400) await db.prepare('UPDATE sessions SET seen = ? WHERE token_hash = ?').bind(now(), user.th).run();
      if (Number(url.searchParams.get('rev')) === user.rev) return json({ id: user.id, name: user.name, rev: user.rev });
      const row = await db.prepare('SELECT data FROM users WHERE id = ?').bind(user.id).first();
      return json({ id: user.id, name: user.name, rev: user.rev, data: JSON.parse(row.data) });
    }

    if (path === '/sync' && request.method === 'POST') {
      const row = await db.prepare('SELECT rev, data FROM users WHERE id = ?').bind(user.id).first();
      if (body.base !== row.rev) return json({ rev: row.rev, data: JSON.parse(row.data) }, 409);
      let data;
      if (body.replace && typeof body.replace === 'object') data = body.replace;
      else {
        data = JSON.parse(row.data);
        for (const [k, v] of Object.entries(body.set || {})) data[k] = v;
        for (const k of body.del || []) delete data[k];
      }
      for (const [k, v] of Object.entries(data)) if (typeof k !== 'string' || !k.startsWith('mapleWordle:') || typeof v !== 'string') delete data[k];
      const text = JSON.stringify(data);
      if (text.length > MAX_DATA) return json({ error: 'too big' }, 413);
      // Only if nobody saved in between (two devices at once): otherwise the same 409 as above.
      const res = await db.prepare('UPDATE users SET data = ?, rev = rev + 1, updated = ? WHERE id = ? AND rev = ?').bind(text, now(), user.id, row.rev).run();
      if (!res.meta.changes) {
        const cur = await db.prepare('SELECT rev, data FROM users WHERE id = ?').bind(user.id).first();
        return json({ rev: cur.rev, data: JSON.parse(cur.data) }, 409);
      }
      return json({ rev: row.rev + 1 });
    }

    return json({ error: 'not found' }, 404);
  },
};

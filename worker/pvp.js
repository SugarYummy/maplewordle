// BGM PvP server (Cloudflare Worker + two Durable Objects). It only passes messages between the players of a room: the
// room's host (its creator) runs the match on their own device (pvp.js), so nothing about the game lives here.
// Setup: worker/PVP-SETUP.md. Config: worker/pvp.wrangler.jsonc.
//
//   GET  /room/ABCD?id=<player id>   WebSocket. Joins room ABCD (4 letters, A-Z), made on first use, gone when empty.
//        Send {to, msg}: to = 'all', 'host' or a player id. Everyone it's for gets {from, to, msg}.
//        On joining you get {from: 'server', msg: {t: 'welcome', n}} (n: people in the room, you included); when
//        someone's connection ends the others get {from: <their id>, to: 'all', msg: {t: 'bye'}}.
//   GET  /queue                       The random queue: a room waiting for players -> {join: true, code}, or none ->
//                                     {join: false, code} (a new code: make that room, it's in the queue once it says so)
//   POST /queue/open  {code, n, seats}   (the host of a queue room, every few seconds while it waits)
//   POST /queue/close {code}             (it started, filled up or left the queue)
//
// Limits: 8 people a room, messages up to 16 KB, 30 messages a second each (more and that connection is closed).
const MAX_PEOPLE = 8, MAX_MSG = 16384, MAX_RATE = 30;
const CODE = /^[A-Z]{4}$/, ID = /^[a-z0-9]{4,16}$/;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // codes this server makes up: no I / O
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const path = url.pathname.replace(/^\/maplewordle-pvp/, '');   // (works on a workers.dev address or an ima.moe route)
    const room = path.match(/^\/room\/([A-Za-z]{4})$/);
    if (room) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket only' }, 426);
      if (!ID.test(url.searchParams.get('id') || '')) return json({ error: 'bad id' }, 400);
      const code = room[1].toUpperCase();
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    if (path === '/queue' || path.startsWith('/queue/')) return env.QUEUE.get(env.QUEUE.idFromName('queue')).fetch(request);
    if (path === '/' || path === '') return json({ ok: true, what: 'Mapledle BGM PvP server' });
    return json({ error: 'not found' }, 404);
  },
};

// One room. WebSocket Hibernation: Cloudflare can unload the room between messages (cheaper); each socket keeps its
// player id as its tag and its message count in its attachment.
export class PvpRoom {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const id = new URL(request.url).searchParams.get('id');
    const open = this.state.getWebSockets();
    for (const ws of this.state.getWebSockets(id)) { try { ws.close(4000, 'joined again'); } catch {} }   // the same player reconnecting
    const others = open.filter((ws) => this.state.getTags(ws)[0] !== id);
    if (others.length >= MAX_PEOPLE) return json({ error: 'full' }, 403);
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], [id]);
    pair[1].serializeAttachment({ sec: 0, n: 0 });
    pair[1].send(JSON.stringify({ from: 'server', to: id, msg: { t: 'welcome', n: others.length + 1 } }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return ws.close(1009, 'too big');
    const now = Math.floor(Date.now() / 1000), a = ws.deserializeAttachment() || { sec: 0, n: 0 };
    if (a.sec !== now) { a.sec = now; a.n = 0; }
    if (++a.n > MAX_RATE) return ws.close(1008, 'too fast');
    ws.serializeAttachment(a);
    let d;
    try { d = JSON.parse(data); } catch { return; }
    if (!d || typeof d !== 'object' || typeof d.to !== 'string' || !d.msg || typeof d.msg !== 'object') return;
    const from = this.state.getTags(ws)[0];
    const out = JSON.stringify({ from, to: d.to, msg: d.msg });
    // 'all' and 'host' go to everyone else (each page knows who its host is); an id goes to that player only
    const to = d.to === 'all' || d.to === 'host' ? this.state.getWebSockets() : this.state.getWebSockets(d.to);
    for (const s of to) if (s !== ws) { try { s.send(out); } catch {} }
  }
  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const from = this.state.getTags(ws)[0];
    if (this.state.getWebSockets(from).some((s) => s !== ws)) return;   // they joined again on another socket
    const out = JSON.stringify({ from, to: 'all', msg: { t: 'bye' } });
    for (const s of this.state.getWebSockets()) if (s !== ws) { try { s.send(out); } catch {} }
  }
}

// The random queue: which public rooms are waiting for players. Kept in memory only (it's fine to lose it: rooms say
// they're open again every few seconds).
export class PvpQueue {
  constructor(state) { this.state = state; this.rooms = new Map(); }   // code -> {n, seats, at, taken}
  async fetch(request) {
    const url = new URL(request.url), path = url.pathname.replace(/^\/maplewordle-pvp/, '');
    const now = Date.now();
    for (const [code, r] of this.rooms) if (now - r.at > 12000) this.rooms.delete(code);   // not heard from lately
    if (request.method === 'GET' && path === '/queue') {
      // the room that has waited longest and still has a seat (counting people sent there in the last few seconds)
      let best = null;
      for (const [code, r] of this.rooms) {
        r.taken = r.taken.filter((t) => now - t < 6000);
        if (r.n + r.taken.length < r.seats && (!best || r.since < best[1].since)) best = [code, r];
      }
      if (best) { best[1].taken.push(now); return json({ join: true, code: best[0] }); }
      let code;
      do code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); while (this.rooms.has(code));
      return json({ join: false, code });
    }
    if (request.method === 'POST' && (path === '/queue/open' || path === '/queue/close')) {
      let b;
      try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const code = String(b?.code || '').toUpperCase();
      if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
      if (path === '/queue/close') { this.rooms.delete(code); return json({ ok: true }); }
      const n = Math.max(1, Math.min(MAX_PEOPLE, Math.floor(+b.n || 1))), seats = Math.max(2, Math.min(MAX_PEOPLE, Math.floor(+b.seats || 2)));
      const r = this.rooms.get(code);
      if (r) Object.assign(r, { n, seats, at: now });
      else if (this.rooms.size < 500) this.rooms.set(code, { n, seats, at: now, since: now, taken: [] });
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
}

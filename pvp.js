// BGM PvP (test site prototype, branch pvp). Guess boss BGMs against someone: the whole track plays from the start and
// loops until the round's timer ends; each question (BGM / phase / title) takes one locked-in answer, timed on your own
// device from the moment your music starts (so ping doesn't matter). Nobody sees right or wrong until the round's
// reveal: BGM name -> its damage -> phase -> its damage -> title -> its damage -> totals -> what happens.
//
// Damage for a right answer locked in t seconds after the music starts: BGM = ceil(25 + 125 x 0.6^(t/10)),
// phase = ceil(that x 0.2), title = ceil(that x 0.5) (from the exact value). Wrong = 0.
// Modes: HP, Life, First to N, Speed Duel (key 'best': best of N rounds, BGM only), Boss Raid (co-op), Free-for-all,
// Tournament. Every mode: from the 3rd round in a row where nothing changes, the slowest guesser loses 100 HP / a life
// (First to N: a point) (Speed Duel: 3 drawn rounds in a row = a draw). Round 20 is the last: most HP / lives / points / round wins
// wins, equal = draw. So no match can go on forever.
//
// Who runs a match: the room's host (its creator) runs the rules on their own device and sends everyone what happens;
// players send their answers. Bots run on the host too. The link between players is one of:
//   local - just you (and bots), nothing leaves this page
//   tabs  - BroadcastChannel: rooms between tabs of this browser (to test two players on one device)
//   ws    - the PvP server (worker/pvp.js on Cloudflare), once it's set up: PVP_SERVER below
(() => {
'use strict';
// The PvP server (worker/pvp.js), e.g. 'wss://maplewordle-pvp.<account>.workers.dev', once it's deployed. Until it's
// written in here, the test site can try one from the browser console: localStorage['mapleWordle:pvpServer'] = 'wss://...'
const PVP_SERVER = (() => { try { return localStorage.getItem('mapleWordle:pvpServer') || ''; } catch { return ''; } })().replace(/\/+$/, '');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I / O (they look like 1 / 0)
const newCode = () => Array.from({ length: 4 }, () => CODE_LETTERS[rnd(CODE_LETTERS.length)]).join('');
const sfx = (n) => { try { uiSound(n); } catch {} };

// ============================== Rules ==============================
const QS = ['bgm', 'phase', 'title'];
const QNAME = { bgm: 'BGM', phase: 'Phase', title: 'Title' };
const SCALE = { bgm: 1, phase: 0.2, title: 0.5 };
const POINTS = { bgm: 1, phase: 0.25, title: 0.5 };
const dmgAt = (sec, q) => Math.ceil(+((25 + 125 * 0.6 ** (Math.max(0, sec) / 10)) * SCALE[q]).toFixed(6));
const multOf = (round) => round >= 10 ? 5 : round >= 5 ? 2 : 1;   // x2 from round 5, x5 from round 10
const ROUND_CAP = 20, DRAW_HP = 100, DRAWS_BEFORE_PENALTY = 3, TIEBREAK_TRIES = 3;
const LOBBY_MS = 30000, COUNT_MS = 5000;   // before round 1: read the rules, press Ready (or 30 s); before each round: 5 s
const MODES = {
  hp:    { name: 'HP', solo: 1, desc: 'Both start with the same HP. Right answers deal damage (faster = more). Each round, whoever dealt less loses the difference in HP. Hit 0 HP and you lose.' },
  life:  { name: 'Life', solo: 1, desc: 'Everyone has a few lives. Get any question wrong or run out of time and you lose one. Lose them all and you’re out.' },
  first: { name: 'First to N', solo: 1, multi: true, desc: 'Right answers score points: BGM 1, Phase 0.25, Title 0.5. The first to reach the target score wins.' },
  best:  { name: 'Speed Duel', solo: 1, desc: 'Just the BGM question. Whoever names the boss right the fastest wins the round; if nobody is right, it’s a draw. First to win more than half the rounds wins.' },
  raid:  { name: 'Boss Raid', coop: true, multi: true, desc: 'Everyone vs one boss, each as a class of their choice. Right answers power your attacks (faster = stronger). Class skills have cooldowns in rounds. The boss shows its next move every round: guard, dodge or burst at the right time.' },
  ffa:   { name: 'Free-for-all', multi: true, desc: 'Right answers deal damage (faster = more). Each round, everyone loses HP by how far they were behind the round’s top damage. Last one standing wins.' },
  tour:  { name: 'Tournament', multi: true, desc: '2, 4 or 8 players in a bracket of 1v1 HP matches. Win a match to move on; the last one standing is the champion.' },
};
const DEFAULTS = { mode: 'hp', time: 30, q: { bgm: true, phase: false, title: false }, input: { bgm: 'dropdown', phase: 'abcd', title: 'typed' },
                   hp: 1000, lives: 5, lastChance: false, firstTo: 5, bestOf: 5, raidDiff: 'normal', raidLives: 3, tourHp: 500, tourSize: 4,
                   ffaSize: 4, firstSize: 2, raidSize: 1, botLevel: 'normal', queue: false };
const CHOICES = { time: [10, 15, 20, 30, 60], hp: [100, 500, 1000, 2000], lives: [1, 3, 5, 10], firstTo: [3, 5, 10], bestOf: [3, 5, 7],
                  raidLives: [1, 3, 5], tourHp: [250, 500, 1000] };
const LIMITS = { time: [1, 999], hp: [1, 9999], lives: [1, 20], firstTo: [1, 99], bestOf: [1, 99], raidLives: [1, 20], tourHp: [1, 9999] };
const INPUTS = { typed: 'Type it (80% match)', dropdown: 'Dropdown', abcd: 'A / B / C / D' };
// Bots answer at a person's pace (typical seconds; each answer varies around them): know = hearing the track and
// knowing the boss, then the input: click = an A/B/C/D button, pick = search a dropdown and pick, typing = think +
// letters at cps letters a second. p = how often it's right. Hard only: abcdKnow = knowing it quicker when the first
// question is A/B/C/D (four choices to spot it in), quick = how often a dropdown answer comes ~25% faster.
const BOTS = {
  easy:   { name: 'Easy', p: 0.5, know: 10, click: 4.5, pick: 4, think: 2.5, cps: 3.5 },
  normal: { name: 'Normal', p: 0.72, know: 6.5, click: 2.8, pick: 2.6, think: 1.5, cps: 5 },
  hard:   { name: 'Hard', p: 0.9, know: 3.7, click: 0.8, pick: 1.8, think: 1, cps: 6.5, abcdKnow: 0.65, quick: 0.25 },
  dummy:  { name: 'Dummy (never answers)', p: 0, never: true },
};
// One "slowness" number per player for a round: their lock-in times added up, a question left unanswered counting as
// the whole round + 1 s. Higher = slower.
const slowness = (per, qs, time) => Object.keys(qs).reduce((s, q) => s + (per.items[q]?.ms ?? (time + 1) * 1000), 0);
const neededWins = (n) => Math.floor(n / 2) + 1;

// ============================== Data ==============================
let DATA = null;
async function loadData() {
  const d = await fetch('data/bgm.json', { cache: 'no-cache' }).then((r) => r.json());
  const today = new Date().toISOString().slice(0, 10);
  const owners = {};   // track -> the bosses that use it (a track two bosses share can't be asked: two right answers)
  for (const b of d.bosses) for (const a of b.areas || []) (owners[a.track] ??= new Set()).add(b.name);
  const live = d.bosses.filter((b) => !b.since || b.since <= today);
  const bosses = live.map((b) => ({ name: b.name, image: b.image, labels: [...new Set((b.areas || []).map((a) => a.label))] }));
  const tracks = [];
  for (const b of live) {
    const mine = {};
    for (const a of b.areas || []) {
      const t = d.tracks[a.track];
      if (!t || owners[a.track].size > 1) continue;
      (mine[a.track] ??= { id: a.track, v: t.v || 0, boss: b.name, labels: [], title: t.title }).labels.push(a.label);
    }
    tracks.push(...Object.values(mine));
  }
  const titles = [...new Set(Object.values(d.tracks).map((t) => t.title))].sort((x, y) => x.localeCompare(y));
  DATA = { bosses, byName: Object.fromEntries(bosses.map((b) => [b.name, b])), tracks, byId: Object.fromEntries(tracks.map((t) => [t.id, t])), titles };
}
const bossNames = () => DATA.bosses.map((b) => b.name);

// Typed answers: right when at least 80% of the characters match (letters and digits only, any capitals) and no other
// name matches it better.
const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const m = a.length, n = b.length, row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j++) { const t = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return row[n];
}
const sim = (a, b) => { a = norm(a); b = norm(b); return a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0; };
function typedRight(value, right, all) {
  const best = Math.max(...right.map((x) => sim(value, x)));
  return best >= 0.8 && !all.some((u) => !right.includes(u) && sim(value, u) > best);
}
const wordsLike = (a, b) => { const w = new Set(a.toLowerCase().split(/\W+/).filter((x) => x.length > 2)); return b.toLowerCase().split(/\W+/).filter((x) => w.has(x)).length + sim(a, b); };
// A / B / C / D: the answer and 3 others, some of them look-alikes (Worn Out Fury -> Wild Fury).
function fourOf(right, all) {
  const others = all.filter((x) => x !== right);
  const alike = others.map((x) => [x, wordsLike(right, x)]).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
  const pick = new Set();
  while (pick.size < Math.min(3, others.length)) {
    const from = Math.random() < 0.4 ? alike : others;
    pick.add(from[rnd(from.length)]);
  }
  return shuffle([right, ...pick]);
}
// The questions for one track. Phase: only when the boss has 2+ parts; its choices are that boss's parts (A/B when 2).
function makeQuestions(cfg, tr, bgmOnly) {
  const want = bgmOnly ? { bgm: true } : cfg.q, qs = {};
  if (want.bgm) qs.bgm = { style: cfg.input.bgm, options: cfg.input.bgm === 'abcd' ? fourOf(tr.boss, bossNames()) : null };
  const parts = DATA.byName[tr.boss].labels;
  if (want.phase && parts.length >= 2) {
    const style = cfg.input.phase;
    let options = null;
    if (style === 'abcd') options = parts.length <= 4 ? shuffle(parts) : shuffle([tr.labels[0], ...shuffle(parts.filter((x) => !tr.labels.includes(x))).slice(0, 3)]);
    else if (style === 'dropdown') options = parts.slice();
    qs.phase = { style, options };
  }
  if (want.title) qs.title = { style: cfg.input.title, options: cfg.input.title === 'abcd' ? fourOf(tr.title, DATA.titles) : null };
  return qs;
}
function isRight(q, value, tr, qs) {
  if (value == null || value === '') return false;
  const typed = qs[q].style === 'typed';
  if (q === 'bgm') return typed ? typedRight(value, [tr.boss], bossNames()) : value === tr.boss;
  if (q === 'phase') return typed ? typedRight(value, tr.labels, DATA.byName[tr.boss].labels) : tr.labels.includes(value);
  return typed ? typedRight(value, [tr.title], DATA.titles) : value === tr.title;
}

// ============================== Bots ==============================
function botAnswers(level, qs, tr, time) {
  const b = BOTS[level] || BOTS.normal, out = {};
  if (b.never) return out;
  const vary = (x, min) => Math.max(min, x * Math.exp((Math.random() - 0.5) * 0.8));   // about x0.67 to x1.5
  let t = 0;
  for (const q of QS) {   // in order, one after another, like a person
    if (!qs[q]) continue;
    const right = Math.random() < b.p * (q === 'bgm' ? 1 : q === 'phase' ? 0.9 : 0.8);
    const value = right ? rightValue(q, tr) : wrongValue(q, tr, qs[q]), style = qs[q].style;
    const abcd = style === 'abcd', quick = style === 'dropdown' && Math.random() < (b.quick || 0) ? 0.75 : 1;
    if (!t) t = vary(b.know, 2) * (abcd ? b.abcdKnow || 1 : quick);
    t += abcd ? vary(b.click, 0.45) : style === 'typed' ? vary(b.think, 0.4) + String(value).length / b.cps * vary(1, 0.8) : vary(b.pick, 1) * quick;
    if (t > time - 0.15) break;   // out of time: it doesn't get to the rest either
    out[q] = { value, ms: Math.round(t * 1000) };
  }
  return out;
}
const rightValue = (q, tr) => q === 'bgm' ? tr.boss : q === 'phase' ? tr.labels[0] : tr.title;
function wrongValue(q, tr, spec) {
  const all = spec.options || (q === 'bgm' ? bossNames() : q === 'phase' ? DATA.byName[tr.boss].labels : DATA.titles);
  const bad = all.filter((x) => x !== rightValue(q, tr) && !(q === 'phase' && tr.labels.includes(x)));
  return bad.length ? bad[rnd(bad.length)] : '???';
}

// ============================== Boss Raid ==============================
// The rules are in raid.js (MapleRaid) and the classes in raid-classes.js; here is only what links them to a match.
const MR = window.MapleRaid;
const RAID_CLASS_KEY = 'mapleWordle:raidClass';
const raidClassOk = (k) => typeof k === 'string' && Object.hasOwn(MR.CLASSES, k);
const myRaidClass = () => { const k = lsGet(RAID_CLASS_KEY); return raidClassOk(k) ? k : 'hero'; };
const randomRaidClass = () => MR.ORDER[rnd(MR.ORDER.length)];
// Your Power for a round: each question you got right counts by its weight (BGM 1, Phase 0.2, Title 0.5) x its speed
function raidPower(items) {
  let got = 0, all = 0;
  for (const [q, it] of Object.entries(items)) { all += SCALE[q]; if (it.ok) got += SCALE[q] * MR.RULES.power(it.ms / 1000); }
  return all ? got / all : 0;
}
const fillNames = (t, name) => String(t).replace(/\{p:([\w-]+)\}/g, (m, id) => `<b>${esc(name(id))}</b>`);
const skillIcon = (sk, cls = '') => `<img class="skic ${cls}" src="images/skills/${MR.iconOf(sk)}.png" alt="" onerror="this.style.visibility='hidden'">`;

// ============================== A match (runs on the host) ==============================
// players: [{id, name, bot}] (bot: a BOTS level, or null for a person). send(to, msg): to 'all' or a player id.
class Match {
  constructor({ id, cfg, players, send, onEnd, tiebreak = false, simulate = false }) {
    Object.assign(this, { id, cfg, players, send, onEnd, tiebreak, simulate });
    this.mode = cfg.mode === 'tour' ? 'hp' : cfg.mode;   // a tournament's matches are HP matches
    this.startHp = cfg.mode === 'tour' ? cfg.tourHp : cfg.hp;
    this.state = { round: 0, streak: 0, bothFail: 0, tb: 0, sudden: false, players: {} };
    for (const p of players) this.state.players[p.id] = { hp: this.startHp, lives: this.mode === 'raid' ? cfg.raidLives : cfg.lives, points: 0, wins: 0, out: false, lc: false };
    if (this.mode === 'raid') {
      const b = DATA.bosses[rnd(DATA.bosses.length)];
      for (const p of players) Object.assign(this.state.players[p.id], MR.newPlayer(raidClassOk(p.rc) ? p.rc : randomRaidClass(), cfg.raidLives));
      this.state.boss = MR.newBoss(b.name, b.image, players.length, cfg.raidDiff);
    }
    this.used = new Set();
    this.history = [];
    this.timers = [];
  }
  get humans() { return this.players.filter((p) => !p.bot); }
  alive() { return this.players.filter((p) => !this.state.players[p.id].out); }
  start() {
    this.send('all', { t: 'match', id: this.id, cfg: this.cfg, players: this.players, state: this.state, mode: this.mode, startHp: this.startHp });
    if (this.simulate) return this.nextRound();
    const intro = this.players.length === 2 && this.mode !== 'raid' && this.players.some((p) => p.look?.fx);   // (1v1: entrances first)
    this.later(() => this.lobby(), intro ? ENTRANCE_MS : 0);
  }
  // Before round 1: everyone sees the rules; round 1 comes once everyone has pressed Ready, or after 30 s. Bots are ready.
  lobby() {
    if (this.done) return;
    this.mready = new Set(this.players.filter((p) => p.bot).map((p) => p.id));
    this.lobbyOn = true;
    this.send('all', { t: 'lobby', id: this.id, ms: LOBBY_MS, ready: [...this.mready] });
    this.later(() => this.lobbyEnd(), LOBBY_MS);
    this.lobbyCheck();
  }
  lobbyCheck() { if (this.lobbyOn && this.players.every((p) => this.mready.has(p.id) || this.state.players[p.id].out)) this.lobbyEnd(); }
  lobbyEnd() { if (!this.lobbyOn || this.done) return; this.lobbyOn = false; this.nextRound(); }
  stop() { this.stopped = true; this.timers.forEach(clearTimeout); }
  // Someone left (closed the page, pressed Leave): they're out; a 1v1 (or the last two) ends with the other one winning.
  forfeit(pid) {
    const p = this.state.players[pid], who = this.players.find((x) => x.id === pid);
    if (!p || p.out || this.done) return;
    p.out = true; p.left = true;
    this.send('all', { t: 'left', id: this.id, pid });
    const left = this.alive();
    if (this.mode === 'raid' ? !left.length : left.length <= 1) {
      this.timers.forEach(clearTimeout);
      this.state.over = { winners: this.mode === 'raid' ? [] : left.map((x) => x.id), reason: `${who?.name ?? 'Someone'} left the match`, coop: this.mode === 'raid', lost: this.mode === 'raid' };
      this.state.over.draw = !this.state.over.coop && this.state.over.winners.length !== 1;
      if (this.state.over.winners.length !== 1 && this.tiebreak && left.length) this.state.over.winners = [left[0].id];
      return this.finish();
    }
    if (this.cur) { this.cur.ready.add(pid); this.cur.done.add(pid); this.checkReady(); this.checkAll(); }
    this.lobbyCheck();
  }
  later(fn, ms) { this.timers.push(setTimeout(() => { if (!this.stopped) fn(); }, ms)); }
  pickTrack() {
    let pool = DATA.tracks.filter((t) => !this.used.has(t.id));
    if (!pool.length) { this.used.clear(); pool = DATA.tracks; }
    const tr = pool[rnd(pool.length)];
    this.used.add(tr.id);
    return tr;
  }
  nextRound() {
    if (this.stopped) return;
    const s = this.state;
    s.round++;
    const tr = this.pickTrack(), bgmOnly = this.mode === 'best' || s.tb > 0;
    const qs = makeQuestions(this.cfg, tr, bgmOnly);
    const time = this.cfg.time;
    this.cur = { round: s.round, tr, qs, time, speed: bgmOnly, answers: {}, casts: {}, ready: new Set(), done: new Set(), goAt: 0 };
    if (this.mode === 'raid') MR.pickMove(s);
    for (const p of this.players) if (p.bot || s.players[p.id].out) { this.cur.ready.add(p.id); }
    if (this.simulate) {   // bots only (a tournament match without people): straight to the result
      const alive = this.alive().map((p) => p.id);
      for (const p of this.alive()) {
        this.cur.answers[p.id] = botAnswers(p.bot, qs, tr, time);
        if (this.mode === 'raid') this.cur.casts[p.id] = this.raidBot(p, this.cur.answers[p.id], this.cur);
      }
      return this.resolve();
    }
    this.send('all', { t: 'load', id: this.id, round: s.round, track: { id: tr.id, v: tr.v }, qs, time, mult: this.multNow(), tb: s.tb, sudden: s.sudden, move: s.boss?.move ?? null, count: COUNT_MS });
    const cur = this.cur;
    this.later(() => { if (this.cur === cur) { cur.counted = true; this.checkReady(); } }, COUNT_MS);   // the 5 s count first
    this.later(() => { if (this.cur === cur) this.go(); }, COUNT_MS + 20000);   // someone's music won't load: start this round anyway
    this.checkReady();
  }
  multNow() { return ['hp', 'ffa'].includes(this.mode) && !this.state.tb ? multOf(this.state.round) : 1; }
  // Boss Raid: a bot's skills for the round. It usually knows whether its own answer is right.
  raidBot(p, a, c) {
    const q = c.qs.bgm ? 'bgm' : Object.keys(c.qs)[0], right = !!a?.[q] && isRight(q, a[q].value, c.tr, c.qs);
    return MR.botCasts(this.state, p.id, Math.random() < 0.9 ? right : !right);
  }
  lastRound() { return this.mode === 'raid' ? MR.DIFFS[this.state.boss.diff].cap : ROUND_CAP; }
  checkReady() { if (this.cur && this.cur.counted && !this.cur.goAt && this.players.every((p) => this.cur.ready.has(p.id))) this.go(); }
  go() {
    const c = this.cur;
    if (!c || c.goAt) return;
    c.goAt = performance.now();
    this.send('all', { t: 'go', id: this.id, round: c.round });
    for (const p of this.alive()) {
      if (!p.bot) continue;
      const a = botAnswers(p.bot, c.qs, c.tr, c.time);
      c.answers[p.id] = {};
      for (const [q, v] of Object.entries(a)) this.later(() => { if (this.cur === c && !c.over) { c.answers[p.id][q] = v; this.send('all', { t: 'locked', id: this.id, round: c.round, pid: p.id, q }); this.checkDone(p.id); } }, v.ms);
      if (this.mode === 'raid') {   // a bot picks its skills partway in, and ends its turn once it has answered
        const castAt = Math.min(c.time * 1000 - 300, 1500 + rnd(2500));
        this.later(() => { if (this.cur === c && !c.over) { c.casts[p.id] = this.raidBot(p, a, c); this.send('all', { t: 'casts', id: this.id, round: c.round, pid: p.id, casts: c.casts[p.id] }); } }, castAt);
        const lastAt = Math.max(castAt, ...Object.values(a).map((v) => v.ms)) + 600;
        this.later(() => { if (this.cur === c) { c.done.add(p.id); this.checkAll(); } }, Math.min(lastAt, c.time * 1000));
      } else this.later(() => { if (this.cur === c) { c.done.add(p.id); this.checkAll(); } }, c.time * 1000);
    }
    this.later(() => { if (this.cur === c && !c.over) this.resolve(); }, c.time * 1000 + 2500);   // people who never said "done"
  }
  checkDone(pid) {
    if (this.mode === 'raid') return;   // (a raid turn ends with End turn: there may be skills still to pick)
    const c = this.cur, a = c.answers[pid] || {};
    if (Object.keys(c.qs).every((q) => a[q])) { c.done.add(pid); this.checkAll(); }
  }
  checkAll() {
    const c = this.cur;
    if (c && !c.over && this.alive().every((p) => c.done.has(p.id))) this.resolve();
  }
  // Messages from players (people only).
  receive(from, m) {
    if (m.t === 'mready') {   // Ready, in the lobby before round 1
      if (this.lobbyOn && this.players.some((p) => p.id === from) && !this.mready.has(from)) {
        this.mready.add(from);
        this.send('all', { t: 'isready', id: this.id, pid: from });   // (not 'mready': that one is for the host)
        this.lobbyCheck();
      }
      return;
    }
    const c = this.cur;
    if (!c || m.round !== c.round || !this.players.some((p) => p.id === from)) return;
    if (m.t === 'ready') { c.ready.add(from); this.checkReady(); }
    else if (m.t === 'lock') {
      if (c.over || !c.qs[m.q] || this.state.players[from].out) return;
      const a = (c.answers[from] ??= {});
      if (a[m.q]) return;   // one answer per question
      a[m.q] = { value: String(m.value).slice(0, 120), ms: clamp(Math.round(+m.ms || 0), 0, c.time * 1000) };
      this.send('all', { t: 'locked', id: this.id, round: c.round, pid: from, q: m.q });
      this.checkDone(from);
    } else if (m.t === 'done') { c.done.add(from); this.checkAll(); }
    else if (m.t === 'cast') {   // Boss Raid: queue (on) or drop (off) a skill for this round
      const P = this.state.players[from], key = String(m.skill), sk = P && MR.skill(P.cls, key);
      if (this.mode !== 'raid' || c.over || !c.goAt || !sk || P.out || c.done.has(from)) return;
      const mine = (c.casts[from] ??= {});
      if (m.on === false) delete mine[key];
      else if (MR.canCast(this.state, from, key)) {
        mine[key] = sk.target ? (this.state.players[m.target] && !this.state.players[m.target].out ? m.target : from)
          : sk.options ? clamp(Math.floor(+m.target) || 0, 0, sk.options.length - 1) : true;
      }
      this.send('all', { t: 'casts', id: this.id, round: c.round, pid: from, casts: mine });
    }
  }
  resolve() {
    const c = this.cur, s = this.state, cfg = this.cfg;
    if (c.over) return;
    c.over = true;
    const live = this.alive(), per = {};
    for (const p of live) {
      const a = c.answers[p.id] || {}, items = {};
      let total = 0, pts = 0;
      for (const q of Object.keys(c.qs)) {
        const x = a[q], ok = !!x && isRight(q, x.value, c.tr, c.qs);
        const dmg = ok ? dmgAt(x.ms / 1000, q) : 0;
        items[q] = { v: x?.value ?? null, ms: x?.ms ?? null, ok, dmg, pts: ok ? POINTS[q] : 0 };
        total += dmg; pts += items[q].pts;
      }
      per[p.id] = { items, total, pts, allOk: Object.values(items).every((i) => i.ok), bgmOk: items.bgm ? items.bgm.ok : true };
      per[p.id].slow = slowness(per[p.id], c.qs, c.time);
    }
    const ev = [];
    const name = (id) => this.players.find((p) => p.id === id)?.name ?? '?';
    const P = (id) => s.players[id];
    const slowest = (ids) => { const m = Math.max(...ids.map((id) => per[id].slow)); return ids.filter((id) => per[id].slow === m); };
    const hurt = (id, amount, why) => {   // HP damage, with Last chance
      const p = P(id);
      p.hp -= amount;
      ev.push({ k: 'hp', pid: id, amount, why });
      if (p.hp <= 0 && cfg.lastChance && !p.lc && ['hp', 'ffa'].includes(this.mode)) { p.hp = 1; p.lc = true; ev.push({ k: 'lastChance', pid: id }); }
    };
    let over = null;
    const ids = live.map((p) => p.id);
    if (s.tb > 0) {   // tournament tiebreak: first right BGM wins
      const right = ids.filter((id) => per[id].items.bgm?.ok);
      const best = right.length ? Math.min(...right.map((id) => Math.round(per[id].items.bgm.ms / 10))) : null;
      const top = right.filter((id) => Math.round(per[id].items.bgm.ms / 10) === best);
      if (top.length === 1) { over = { winners: top, reason: `Tiebreak: ${name(top[0])} was first with the right BGM` }; ev.push({ k: 'roundWin', pid: top[0] }); }
      else if (s.tb >= TIEBREAK_TRIES) { const w = ids[rnd(ids.length)]; over = { winners: [w], reason: `Tiebreak tied ${TIEBREAK_TRIES} times: random pick, ${name(w)}` }; ev.push({ k: 'random', pid: w }); }
      else { ev.push({ k: 'drawRound' }); s.tb++; }
    } else if (this.mode === 'hp' || this.mode === 'ffa') {
      const mult = this.multNow(), top = Math.max(...ids.map((id) => per[id].total));
      const took = ids.filter((id) => per[id].total < top);
      if (took.length) {
        s.streak = 0;
        for (const id of took) hurt(id, (top - per[id].total) * mult, mult > 1 ? `x${mult}` : '');
      } else {
        s.streak++;
        ev.push({ k: 'drawRound', streak: s.streak });
        if (s.streak >= DRAWS_BEFORE_PENALTY) for (const id of slowest(ids)) hurt(id, DRAW_HP, 'slowest');
      }
      for (const id of ids) if (P(id).hp <= 0 && !P(id).out) { P(id).out = true; ev.push({ k: 'ko', pid: id }); }
      const left = ids.filter((id) => !P(id).out);
      if (left.length === 1) over = { winners: left, reason: this.mode === 'hp' ? `KO in round ${s.round}` : `Last one standing (round ${s.round})` };
      else if (!left.length) {   // everyone fell at once (only the slowest-player rule can do that)
        const m = Math.max(...ids.map((id) => P(id).hp));
        const w = ids.filter((id) => P(id).hp === m);
        over = { winners: w, reason: w.length > 1 ? 'Everyone fell at once with the same HP' : `Everyone fell at once: ${name(w[0])} had the most HP left` };
      }
    } else if (this.mode === 'life') {
      const fail = ids.filter((id) => !per[id].allOk);
      if (s.sudden) {
        if (fail.length && fail.length < ids.length) {
          for (const id of fail) { P(id).out = true; ev.push({ k: 'out', pid: id }); }
          s.streak = s.bothFail = 0;
        } else if (fail.length) {
          s.bothFail++; s.streak = 0;
          ev.push({ k: 'bothFail', n: s.bothFail });
          if (s.bothFail >= DRAWS_BEFORE_PENALTY) over = { winners: [], reason: `Sudden death: everyone failed ${DRAWS_BEFORE_PENALTY} rounds in a row` };
        } else {
          s.streak++; s.bothFail = 0;
          ev.push({ k: 'drawRound', streak: s.streak });
          if (s.streak >= DRAWS_BEFORE_PENALTY) {
            const slow = slowest(ids);
            if (slow.length < ids.length) for (const id of slow) { P(id).out = true; ev.push({ k: 'out', pid: id, why: 'slowest' }); }
          }
        }
      } else {
        for (const id of fail) { P(id).lives--; ev.push({ k: 'life', pid: id }); }
        if (!fail.length) {
          s.streak++;
          ev.push({ k: 'drawRound', streak: s.streak });
          if (s.streak >= DRAWS_BEFORE_PENALTY) for (const id of slowest(ids)) { P(id).lives--; ev.push({ k: 'life', pid: id, why: 'slowest' }); }
        } else s.streak = 0;
        const zero = ids.filter((id) => P(id).lives <= 0);
        if (zero.length === ids.length) {   // everyone's last life at once: sudden death
          s.sudden = true; s.streak = 0; s.bothFail = 0;
          for (const id of ids) P(id).lives = 0;
          ev.push({ k: 'sudden' });
        } else for (const id of zero) { P(id).out = true; ev.push({ k: 'out', pid: id }); }
      }
      const left = ids.filter((id) => !P(id).out);
      if (!over && left.length === 1) over = { winners: left, reason: s.sudden ? `Sudden death, round ${s.round}` : `Out of lives in round ${s.round}` };
    } else if (this.mode === 'first') {
      for (const id of ids) { P(id).points = +(P(id).points + per[id].pts).toFixed(2); }
      const got = ids.map((id) => per[id].pts);
      if (got.every((x) => x === got[0])) {
        s.streak++;
        ev.push({ k: 'drawRound', streak: s.streak });
        if (s.streak >= DRAWS_BEFORE_PENALTY) for (const id of slowest(ids)) { P(id).points = Math.max(0, +(P(id).points - 1).toFixed(2)); ev.push({ k: 'point', pid: id }); }
      } else s.streak = 0;
      for (const id of ids) ev.push({ k: 'pts', pid: id, pts: per[id].pts });
      const there = ids.filter((id) => P(id).points >= cfg.firstTo);
      if (there.length) {
        const m = Math.max(...there.map((id) => P(id).points)), w = there.filter((id) => P(id).points === m);
        over = { winners: w, reason: w.length > 1 ? `Reached ${cfg.firstTo} together with the same points` : `First to ${cfg.firstTo} points` };
      }
    } else if (this.mode === 'best') {
      const right = ids.filter((id) => per[id].items.bgm?.ok);
      const best = right.length ? Math.min(...right.map((id) => Math.round(per[id].items.bgm.ms / 10))) : null;   // to the .xx second
      const top = right.filter((id) => Math.round(per[id].items.bgm.ms / 10) === best);
      if (top.length === 1) { P(top[0]).wins++; s.streak = 0; ev.push({ k: 'roundWin', pid: top[0] }); }
      else {
        s.streak++;
        ev.push({ k: 'drawRound', streak: s.streak });
        if (s.streak >= DRAWS_BEFORE_PENALTY) over = { winners: [], reason: `${DRAWS_BEFORE_PENALTY} drawn rounds in a row` };
      }
      const w = ids.find((id) => P(id).wins >= neededWins(cfg.bestOf));
      if (!over && w) over = { winners: [w], reason: `Won ${P(w).wins} rounds (best of ${cfg.bestOf})` };
    } else if (this.mode === 'raid') {
      const inputs = {};
      for (const id of ids) {
        const main = per[id].items.bgm ?? Object.values(per[id].items)[0];
        per[id].power = raidPower(per[id].items);
        per[id].total = Math.round(per[id].power * 100);   // (shown as Power %)
        inputs[id] = { power: per[id].power, sec: main?.ok ? main.ms / 1000 : null, casts: c.casts[id] || {} };
      }
      for (const e of MR.resolve(s, inputs)) ev.push({ ...e, kind: e.k, k: 'raid' });
      const b = s.boss;
      if (b.hp <= 0) over = { winners: this.players.map((p) => p.id), reason: `${b.name} defeated in round ${s.round}`, coop: true };
      else if (!this.alive().length) over = { winners: [], reason: `Everyone fell. ${b.name} had ${b.hp.toLocaleString('en-US')} HP left`, coop: true, lost: true };
    }
    // Round 20: the last one.
    if (!over && s.round >= this.lastRound()) {
      if (this.mode === 'raid') over = { winners: [], reason: `Time's up (round ${this.lastRound()}): ${s.boss.name} still had ${s.boss.hp.toLocaleString('en-US')} HP`, coop: true, lost: true };
      else {
        const left = this.alive().map((p) => p.id);
        const score = (id) => this.mode === 'life' ? P(id).lives : this.mode === 'first' ? P(id).points : this.mode === 'best' ? P(id).wins : P(id).hp;
        const m = Math.max(...left.map(score)), w = left.filter((id) => score(id) === m);
        const what = { life: 'lives', first: 'points', best: 'round wins' }[this.mode] || 'HP';
        over = { winners: w, reason: w.length > 1 ? `Round ${ROUND_CAP} reached with the same ${what}` : `Round ${ROUND_CAP} reached: most ${what}` };
      }
    }
    // A tournament match can't be a draw: a speed tiebreak decides.
    if (over && this.tiebreak && over.winners.length !== 1) { ev.push({ k: 'tiebreak' }); s.tb = 1; over = null; }
    if (over) { over.draw = !over.coop && over.winners.length !== 1; s.over = over; }
    const reveal = {
      t: 'reveal', id: this.id, round: c.round, mode: this.mode, qs: Object.fromEntries(Object.entries(c.qs).map(([q, v]) => [q, v.style])),
      answer: { boss: c.tr.boss, image: DATA.byName[c.tr.boss].image, labels: c.tr.labels, title: c.tr.title },
      per, ev, mult: this.multNow(), state: JSON.parse(JSON.stringify(s)),
    };
    this.history.push({ round: c.round, title: c.tr.title, boss: c.tr.boss, speed: !!c.speed,   // speed: won on time (Speed Duel, tiebreak)
      per: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { total: v.total, pts: v.pts, ok: v.allOk, ms: v.items.bgm?.v != null ? v.items.bgm.ms : null }])),
      dmg: this.mode === 'raid' ? Object.fromEntries(ev.filter((e) => e.kind === 'atk').map((e) => [e.pid, e.amount])) : null });
    if (this.simulate) { if (over) this.finish(); else this.nextRound(); return; }
    this.send('all', reveal);
    const wait = revealMs(reveal);
    if (over) this.later(() => this.finish(), wait);
    else this.later(() => this.nextRound(), wait + 600);
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const result = { t: 'end', id: this.id, over: this.state.over, players: this.players, history: this.history, state: this.state, mode: this.mode };
    if (!this.simulate) this.send('all', result);
    this.onEnd?.(result);
  }
}
// How long the reveal takes on screen (the host waits that long before the next round).
const STEP = { answer: 900, scores: 1300, totals: 1100, skills: 1800, boss: 1800, apply: 2300 };
const stepMs = (st) => st.ms ?? STEP[st.s];
function revealSteps(r) {
  const steps = [];
  for (const q of QS) if (r.qs[q]) steps.push({ s: 'answer', q }, { s: 'scores', q });
  if (Object.keys(r.qs).length > 1 || r.mode === 'raid') steps.push({ s: 'totals' });
  if (r.mode === 'raid') {   // the party's skills and attacks, then the boss: a moment longer the more there is to read
    const n = (s) => r.ev.filter((e) => e.k === 'raid' && e.s === s).length;
    if (n('skills')) steps.push({ s: 'skills', ms: Math.min(6500, 1200 + 500 * n('skills')) });
    if (n('boss')) steps.push({ s: 'boss', ms: Math.min(5000, 1200 + 450 * n('boss')) });
  }
  steps.push({ s: 'apply' });
  return steps;
}
const revealMs = (r) => revealSteps(r).reduce((x, st) => x + stepMs(st), 0) + 700;

// ============================== Tournament (runs on the host) ==============================
class Tournament {
  constructor({ cfg, players, send, onEnd }) {
    Object.assign(this, { cfg, send, onEnd });
    this.players = shuffle(players);
    this.rounds = [];   // rounds[r] = [{a, b, winner, why, live}]
    this.matches = new Map();
    this.gone = new Set();   // people who left: they lose their next match straight away
  }
  start() {
    const first = [];
    for (let i = 0; i < this.players.length; i += 2) first.push({ a: this.players[i].id, b: this.players[i + 1].id, winner: null });
    this.rounds.push(first);
    this.play();
  }
  byId(id) { return this.players.find((p) => p.id === id); }
  state() { return { t: 'bracket', players: this.players, rounds: this.rounds, champion: this.champion ?? null }; }
  play() {
    const r = this.rounds.length - 1, games = this.rounds[r];
    this.send('all', this.state());
    let left = games.length;
    games.forEach((g, i) => {
      const pa = this.byId(g.a), pb = this.byId(g.b), bots = pa.bot && pb.bot;
      const m = new Match({ id: `t${r}-${i}-${newId()}`, cfg: this.cfg, players: [pa, pb], tiebreak: true, simulate: bots,
        send: (to, msg) => this.send(to, msg),
        onEnd: (res) => {
          g.winner = res.over.winners[0];
          g.why = res.over.reason;
          g.live = false;
          this.matches.delete(m.id);
          this.send('all', this.state());
          if (--left === 0) setTimeout(() => this.advance(), bots && games.every((x) => this.byId(x.a).bot && this.byId(x.b).bot) ? 600 : 5000);
        } });
      g.live = !bots;
      this.matches.set(m.id, m);
      setTimeout(() => { m.start(); for (const p of [pa, pb]) if (this.gone.has(p.id)) m.forfeit(p.id); }, bots ? 300 + i * 200 : 1500);
    });
  }
  advance() {
    const last = this.rounds.at(-1);
    if (last.length === 1) {
      this.champion = last[0].winner;
      this.send('all', this.state());
      this.onEnd?.(this.champion);
      return;
    }
    const next = [];
    for (let i = 0; i < last.length; i += 2) next.push({ a: last[i].winner, b: last[i + 1].winner, winner: null });
    this.rounds.push(next);
    this.play();
  }
  receive(from, m) { this.matches.get(m.id)?.receive(from, m); }
  forfeit(pid) {
    this.gone.add(pid);
    for (const m of this.matches.values()) if (m.players.some((p) => p.id === pid)) m.forfeit(pid);
  }
  stop() { for (const m of this.matches.values()) m.stop(); this.matches.clear(); this.stopped = true; }
}

// ============================== Links between players ==============================
// A Net carries messages {t, ...} between this page and the others in the room. send(to, msg): to is 'all',
// 'host' or a player id; everything sent to 'all' (or to yourself) also comes back to this page.
function localNet(myId) {
  const net = { kind: 'local', myId, hostId: myId, handlers: [] };
  net.send = (to, msg) => { if (to === 'all' || to === myId || to === 'host') setTimeout(() => net.handlers.forEach((h) => h(myId, msg)), 0); };
  net.close = () => {};
  return net;
}
function tabsNet(myId, code) {
  const ch = new BroadcastChannel('mapledle-pvp:' + code);
  const net = { kind: 'tabs', myId, hostId: null, handlers: [], code };
  const deliver = (from, msg) => net.handlers.forEach((h) => h(from, msg));
  ch.onmessage = (e) => {
    const { from, to, msg } = e.data || {};
    if (to === 'all' || to === myId || (to === 'host' && net.hostId === myId)) deliver(from, msg);
  };
  net.send = (to, msg) => {
    ch.postMessage({ from: myId, to, msg });
    if (to === 'all' || to === myId || (to === 'host' && net.hostId === myId)) setTimeout(() => deliver(myId, msg), 0);
  };
  net.close = () => ch.close();
  return net;
}
function wsNet(myId, code) {
  const ws = new WebSocket(`${PVP_SERVER}/room/${code}?id=${myId}`);
  const net = { kind: 'ws', myId, hostId: null, handlers: [], code, queue: [] };
  const deliver = (from, msg) => net.handlers.forEach((h) => h(from, msg));
  ws.onopen = () => { for (const x of net.queue) ws.send(x); net.queue = []; };
  ws.onmessage = (e) => {
    let d; try { d = JSON.parse(e.data); } catch { return; }
    if (d.from === myId) return;
    if (d.to === 'all' || d.to === myId || (d.to === 'host' && net.hostId === myId)) deliver(d.from, d.msg);
  };
  ws.onclose = () => deliver('server', { t: 'closed', why: 'Lost the connection to the PvP server.' });
  net.send = (to, msg) => {
    const x = JSON.stringify({ to, msg });
    if (ws.readyState === 1) ws.send(x); else net.queue.push(x);
    if (to === 'all' || to === myId || (to === 'host' && net.hostId === myId)) setTimeout(() => deliver(myId, msg), 0);
  };
  net.close = () => { ws.onclose = null; ws.close(); };
  return net;
}
const roomNet = (myId, code) => PVP_SERVER ? wsNet(myId, code) : tabsNet(myId, code);

// ============================== Characters (PC / landscape, 1v1) ==============================
// You stand left of the match and the other player right: your MapleStory Character (Account Settings) with your
// appearance effect, which plays once as the match starts (round 1 waits for it). Bots: a class portrait (the Class
// game's art, except Tanjiro's: it isn't see-through), named after that class; Hard bots come in with Seething
// Balance. Training dummies: no portrait. You face right (towards them); bots face left (flipped, except the ones
// that already do: NO_FLIP). Under each one, a box: who they are (name, character, world, level + job for a Nexon character,
// achievement rank + AP + place, PvP record, daily games) and the match (HP, locks...), which leaves the middle.
// No character: just the box. Phones / portrait: the boards stay in the middle as before.
const ENTRANCE_MS = 3800;
const CLASS_PICS = {   // portrait file: its class (the bot's name)
  'adele': 'Adele', 'angelic-buster': 'Angelic Buster', 'aran': 'Aran', 'arch-mage-f-p': 'Arch Mage (F/P)',
  'arch-mage-i-l': 'Arch Mage (I/L)', 'ark': 'Ark', 'battle-mage': 'Battle Mage', 'beast-tamer': 'Beast Tamer',
  'bishop': 'Bishop', 'blaster': 'Blaster', 'blaze-wizard': 'Blaze Wizard', 'bow-master': 'Bow Master',
  'buccaneer': 'Buccaneer', 'cadena': 'Cadena', 'cannoneer': 'Cannoneer', 'corsair': 'Corsair',
  'dark-knight': 'Dark Knight', 'dawn-warrior': 'Dawn Warrior', 'demon-avenger': 'Demon Avenger',
  'demon-slayer': 'Demon Slayer', 'dual-blade': 'Dual Blade', 'erel-light': 'Erel Light', 'evan': 'Evan',
  'hayato': 'Hayato', 'hero': 'Hero', 'hoyoung': 'Hoyoung', 'iel': 'Iel', 'illium': 'Illium', 'jett': 'Jett',
  'kain': 'Kain', 'kaiser': 'Kaiser', 'kanna': 'Kanna', 'khali': 'Khali', 'kinesis': 'Kinesis', 'lara': 'Lara',
  'lethe': 'Lethe', 'luminous': 'Luminous', 'lynn': 'Lynn', 'marksman': 'Marksman', 'mechanic': 'Mechanic',
  'mercedes': 'Mercedes', 'mihile': 'Mihile', 'mo-xuan': 'Mo Xuan', 'night-lord': 'Night Lord',
  'night-walker': 'Night Walker', 'paladin': 'Paladin', 'pathfinder': 'Pathfinder', 'phantom': 'Phantom',
  'pink-bean': 'Pink Bean', 'ren': 'Ren', 'saitama': 'Saitama', 'shade': 'Shade', 'shadower': 'Shadower',
  'sia-astelle': 'Sia Astelle', 'thunder-breaker': 'Thunder Breaker', 'wild-hunter': 'Wild Hunter',
  'wind-archer': 'Wind Archer', 'xenon': 'Xenon', 'yeti': 'Yeti', 'zen': 'Zen', 'zero': 'Zero',
};
const LOOK_IMG = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.nexon\.net\/[\w\-./%]+$/i;   // (someone else's: only Nexon's own avatar pictures)
const NO_FLIP = ['battle-mage', 'blaster', 'blaze-wizard', 'dawn-warrior', 'demon-avenger', 'demon-slayer', 'iel',   // portraits that already face left
  'kanna', 'mechanic', 'night-walker', 'pink-bean', 'saitama', 'thunder-breaker', 'wild-hunter', 'wind-archer', 'yeti'];
const RANK_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond', master: 'Master' };
const RANK_AP = [['diamond', 2000], ['platinum', 1000], ['gold', 500], ['silver', 200], ['bronze', 0]];   // (achv.js RANKS)
const PVP_REC = 'mapleWordle:pvp';   // { w, l, d }: finished matches against at least one person (not Boss Raid)
const lsJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
let myPlace = null;   // your place on the site by AP (the account server's GET /place), once looked up
function myLook() {
  const look = { info: myInfo() };
  try {
    if (typeof acct !== 'function' || !acct()) return look;
    const m = acctMaple();
    if (m?.avatar) { if (ACCT_AVATARS[m.avatar]?.owned()) look.avatar = m.avatar; }
    else if (m?.img) look.img = m.img;
    const fx = (look.avatar || look.img) && acctAppearOn();
    if (fx) look.fx = fx;
  } catch {}
  return look;
}
function myInfo() {
  const info = {};
  try {
    const m = typeof acct === 'function' && acct() ? acctMaple() : null;
    if (m && !m.avatar && m.name) Object.assign(info, { ign: m.name, world: m.world || '', level: m.level, job: m.job || '' });   // (a Nexon character only)
  } catch {}
  const ap = parseInt(localStorage.getItem('mapleWordle:ap'), 10);
  if (ap >= 0) {
    info.ap = ap;
    const saved = lsJson('mapleWordle:achv')?._rank;
    info.rank = Object.hasOwn(RANK_NAMES, saved) ? saved : RANK_AP.find((r) => ap >= r[1])[0];
    if (myPlace) info.place = myPlace;
  }
  const rec = lsJson(PVP_REC);
  if (rec) info.pvp = { w: rec.w || 0, l: rec.l || 0, d: rec.d || 0 };
  // Daily games: every finished game (Won / Lost), and your best streak going now
  let n = 0, won = 0, streak = 0;
  try {
    const day = Math.floor(Date.now() / 86400000);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^mapleWordle:result:[a-z]+:\d+$/.test(k)) { const v = localStorage.getItem(k) || ''; if (/^Won/.test(v)) { n++; won++; } else if (/^Lost/.test(v)) n++; }
      const sm = /^mapleWordle:streak:([a-z]+)$/.exec(k);
      if (sm) { const st = lsJson(k); if (st && !(sm[1] === 'story' && st.last != null && st.last < day - 1)) streak = Math.max(streak, st.count || 0); }
    }
  } catch {}
  if (n) info.daily = { n, won, streak };
  return info;
}
function notePvp(m) {   // your record, once per match: only against people (bots don't count), not Boss Raid
  if (m.mode === 'raid' || notePvp.done.has(m.id) || !m.players.some((p) => p.id !== me.id && !p.bot) || !m.players.some((p) => p.id === me.id)) return;
  notePvp.done.add(m.id);
  const r = lsJson(PVP_REC) || { w: 0, l: 0, d: 0 };
  if (m.over.draw || m.over.winners.length !== 1) r.d = (r.d || 0) + 1;
  else if (m.over.winners[0] === me.id) r.w = (r.w || 0) + 1;
  else r.l = (r.l || 0) + 1;
  try { localStorage.setItem(PVP_REC, JSON.stringify(r)); } catch {}
}
notePvp.done = new Set();
async function loadPlace() {   // (the test site's pretend account server answers this too)
  const ap = parseInt(localStorage.getItem('mapleWordle:ap'), 10);
  if (!(ap >= 0) || typeof ACCOUNT_URL !== 'string') return;
  try {
    const r = await fetch(ACCOUNT_URL + 'place?ap=' + ap);
    const d = r.ok ? await r.json() : null;
    if (d?.place > 0) myPlace = d.place;
  } catch {}
}
function cleanLook(l) {   // (it came from another player: only what this page knows)
  if (!l || typeof l !== 'object') return null;
  const out = {}, has = (o, k) => typeof k === 'string' && typeof o !== 'undefined' && Object.hasOwn(o, k);
  if (has(typeof ACCT_AVATARS === 'undefined' ? undefined : ACCT_AVATARS, l.avatar)) out.avatar = l.avatar;
  else if (typeof l.img === 'string' && l.img.length < 2000 && LOOK_IMG.test(l.img)) out.img = l.img;   // (Nexon's are ~1,070 long)
  else if (typeof l.cls === 'string' && Object.hasOwn(CLASS_PICS, l.cls)) out.cls = l.cls;
  if ((out.avatar || out.img || out.cls) && has(typeof ACCT_EFFECTS === 'undefined' ? undefined : ACCT_EFFECTS, l.fx)) out.fx = l.fx;
  const i = l.info && typeof l.info === 'object' ? l.info : {}, info = {};
  const num = (x, max) => (Number.isFinite(x) && x >= 0 ? Math.min(Math.floor(x), max) : null);
  const str = (x, n) => (typeof x === 'string' && x ? x.slice(0, n) : null);
  if (str(i.ign, 20)) Object.assign(info, { ign: str(i.ign, 20), world: str(i.world, 24) || '', level: num(i.level, 999), job: str(i.job, 32) || '' });
  if (num(i.ap, 1e6) != null && Object.hasOwn(RANK_NAMES, i.rank)) Object.assign(info, { ap: num(i.ap, 1e6), rank: i.rank, place: num(i.place, 1e8) || null });
  if (i.pvp && typeof i.pvp === 'object') info.pvp = { w: num(i.pvp.w, 1e6) || 0, l: num(i.pvp.l, 1e6) || 0, d: num(i.pvp.d, 1e6) || 0 };
  if (i.daily && num(i.daily.n, 1e6)) info.daily = { n: num(i.daily.n, 1e6), won: Math.min(num(i.daily.won, 1e6) || 0, num(i.daily.n, 1e6)), streak: num(i.daily.streak, 1e5) || 0 };
  out.info = info;
  return out;
}
const botLook = (cls, level) => (cls ? { cls, ...(level === 'hard' ? { fx: 'seethingBalance' } : {}) } : null);
const botClasses = () => shuffle(Object.keys(CLASS_PICS));
const isSafari = () => typeof SAFARI !== 'undefined' && SAFARI;
function lookHtml(l) {
  if (l.avatar) {
    const av = ACCT_AVATARS[l.avatar];
    return isSafari() ? `<img class="pvpfig" src="${esc(av.src)}.webp" alt="">`
      : `<video class="pvpfig" src="${esc(av.src)}.webm" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true"></video>`;
  }
  if (l.img) return `<img class="pvpfig nexon" src="${esc(l.img)}" alt="" referrerpolicy="no-referrer">`;
  return `<img class="pvpfig cls" src="images/classes/${esc(l.cls)}.png" alt="">`;
}
const SIDES = matchMedia('(min-width: 1100px) and (orientation: landscape)');
const isDuel = () => !!game && game.players.length === 2 && game.mode !== 'raid' && game.players.some((p) => p.id === me.id);
const sidesOn = () => isDuel() && SIDES.matches;
function infoHtml(p, l) {
  const i = l?.info || {}, f = (x) => x.toLocaleString('en-US');
  const rows = [`<b class="nm">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === me.id ? ' (you)' : ''} <span class="rdy" data-rdy="${esc(p.id)}" hidden>READY</span></b>`];
  if (p.bot) rows.push(`<span>${esc(BOTS[p.bot]?.name.replace(/ \(.*/, '') || '')} bot</span>`);
  else {
    if (i.ign) rows.push(`<span>${esc(i.ign)}${i.world ? ' · ' + esc(i.world) : ''}</span>`);
    if (i.ign && i.level) rows.push(`<span>Lv. ${i.level} ${esc(i.job)}</span>`);
    if (i.rank) rows.push(`<span class="rk"><img src="images/achv/rank/${i.rank}.png" alt="">${RANK_NAMES[i.rank]} · ${f(i.ap)} AP${i.place ? ` · #${f(i.place)}` : ''}</span>`);
    if (i.pvp) rows.push(`<span title="PvP wins / losses / draws">⚔️ PvP ${f(i.pvp.w)}/${f(i.pvp.l)}/${f(i.pvp.d)}</span>`);   // (like a KDA)
    if (i.daily) rows.push(`<span>📅 ${f(i.daily.n)} games · ${Math.round(i.daily.won / i.daily.n * 100)}% won · ${i.daily.streak}🔥</span>`);
  }
  return `<div class="pvpinfo">${rows.join('')}</div>`;
}
function drawChars() {
  const box = $('chars'), on = sidesOn();
  document.body.classList.toggle('pvpsides', on);
  if (!on) { box.hidden = true; box.innerHTML = ''; return; }
  const side = (p, cls) => {
    const l = cleanLook(p.look), flip = cls === 'me' || (l?.cls && !NO_FLIP.includes(l.cls));
    return `<div class="pvpchar ${cls}" data-pid="${esc(p.id)}">${l?.avatar || l?.img || l?.cls ? `<div class="pvpstage${flip ? ' flip' : ''}">${lookHtml(l)}</div>` : ''}` +
      `<div class="pvpbox">${infoHtml(p, l)}<div class="pvpslot"></div></div></div>`;
  };
  box.innerHTML = side(game.players.find((p) => p.id === me.id), 'me') + side(game.players.find((p) => p.id !== me.id), 'foe');
  box.hidden = false;
}
SIDES.addEventListener?.('change', () => { if (game && isDuel()) { drawChars(); drawBoards(); } });
function charsEntrance() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let any = false;
  for (const el of document.querySelectorAll('#chars .pvpchar')) {
    const l = cleanLook(game.players.find((p) => p.id === el.dataset.pid)?.look), fx = l?.fx && ACCT_EFFECTS[l.fx], stage = el.querySelector('.pvpstage');
    if (!fx || !stage || !stage.offsetParent) continue;   // (not shown here: a phone, or portrait)
    const v = Object.assign(document.createElement(isSafari() ? 'img' : 'video'), { className: 'pvpfx', src: `${fx.src}.${isSafari() ? 'webp' : 'webm'}?v=1`, alt: '' });
    if (!isSafari()) Object.assign(v, { muted: true, autoplay: true, playsInline: true });
    v.setAttribute('aria-hidden', 'true');
    stage.prepend(v);
    const gone = () => v.remove();
    v.addEventListener('ended', gone); v.addEventListener('error', gone);
    setTimeout(gone, ENTRANCE_MS + 700);
    any = true;
  }
  if (any && typeof resultSound === 'function') resultSound(true, 0, 'appear', 0, true);   // one sound, even for two
}

// ============================== Music ==============================
const music = { ctx: null, gain: null, src: null, buf: null, id: null, startAt: 0, playing: false };
const bgmVolume = () => clamp(Number(lsGet('mapleWordle:bgmVolume', 50)), 0, 100);
const musicLevel = () => (typeof muted === 'function' && muted()) ? 0 : bgmVolume() / 50;
window.themeBgmHold = () => music.playing;   // the background's own music (fx.js) stays quiet meanwhile
function musicCtx() {
  if (!music.ctx) {
    music.ctx = new (window.AudioContext || window.webkitAudioContext)();
    music.gain = music.ctx.createGain();
    music.gain.connect(music.ctx.destination);
  }
  music.gain.gain.value = musicLevel();
  return music.ctx;
}
const audioCache = new Map();
function loadMusic(track) {
  const ctx = musicCtx();
  const key = track.id;
  if (!audioCache.has(key)) {
    const p = fetch(`audio/bgm/${track.id}.mp3${track.v ? '?v=' + track.v : ''}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((b) => ctx.decodeAudioData(b));
    p.catch(() => audioCache.delete(key));
    audioCache.set(key, p);
    if (audioCache.size > 6) audioCache.delete(audioCache.keys().next().value);
  }
  return audioCache.get(key);
}
function playMusic(buf) {
  stopMusic(0);
  const ctx = musicCtx();
  ctx.resume?.();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;   // the whole track, again and again until the round is over
  src.connect(music.gain);
  music.gain.gain.cancelScheduledValues(ctx.currentTime);
  music.gain.gain.value = musicLevel();
  const at = ctx.currentTime + 0.05;
  src.start(at);
  music.src = src; music.playing = true;
  return at;
}
function stopMusic(fade = 1.2) {
  const src = music.src;
  if (!src) return;
  music.src = null; music.playing = false;
  const ctx = music.ctx, g = music.gain;
  if (fade) {
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    setTimeout(() => { try { src.stop(); } catch {} if (!music.src) g.gain.value = musicLevel(); }, fade * 1000 + 50);
  } else try { src.stop(); } catch {}
}

// ============================== The page ==============================
const me = { id: newId(), name: '' };
let net = null, room = null, game = null, host = null;   // host: {match | tour} when this page runs the match
const screens = ['lobby', 'room', 'match', 'bracket', 'result'];
function show(name) { for (const s of screens) $(s).hidden = s !== name; if (name !== 'match') document.body.classList.remove('pvpsides'); window.scrollTo?.(0, 0); }

function defaultName() {
  try { const a = JSON.parse(localStorage.getItem('mapleWordle:account') || 'null'); if (a?.name) return a.name; } catch {}
  return 'Player ' + (1000 + rnd(9000));
}
function loadCfg() {
  let c = {};
  try { c = JSON.parse(lsGet('mapleWordle:pvpSettings', '{}')) || {}; } catch {}
  delete c.bossHp;   // (v3: Boss Raid has difficulties instead of a boss HP)
  if (!Object.hasOwn(MR.DIFFS, c.raidDiff)) delete c.raidDiff;
  return { ...DEFAULTS, ...c, v: 3, q: { ...DEFAULTS.q, ...c.q }, input: { ...DEFAULTS.input, ...c.input } };
}
const saveCfg = (c) => lsSet('mapleWordle:pvpSettings', JSON.stringify(c));

// ---------- Lobby ----------
function lobby(msg = '') {
  leaveRoom(true);
  show('lobby');
  $('lobbyMsg').textContent = msg;
  $('netNote').innerHTML = PVP_SERVER ? '' :
    'Online rooms need the PvP server (Cloudflare), which isn’t set up yet. Until then, rooms and the random queue work ' +
    'between <b>tabs of this browser</b>: open this page in a second tab to play yourself.';
}
$('pvpName').value = me.name = lsGet('mapleWordle:pvpName') || defaultName();
$('pvpName').addEventListener('input', () => { me.name = $('pvpName').value.trim().slice(0, 16) || 'Player'; lsSet('mapleWordle:pvpName', me.name); });
for (const b of document.querySelectorAll('#lobby [data-go]')) b.addEventListener('click', () => { sfx('click'); startFrom(b.dataset.go); });
$('joinForm').addEventListener('submit', (e) => { e.preventDefault(); joinRoom($('joinCode').value.trim().toUpperCase()); });
$('joinCode').addEventListener('input', () => { $('joinCode').value = $('joinCode').value.toUpperCase().replace(/[^A-Z]/g, ''); });

function startFrom(kind) {
  const cfg = loadCfg();
  if (kind === 'bot') { if (cfg.botLevel === 'dummy') cfg.botLevel = 'normal'; if (cfg.mode === 'raid') cfg.mode = 'hp'; openLocal(cfg, 'Vs Bot'); }
  else if (kind === 'practice') { cfg.botLevel = 'dummy'; if (cfg.mode === 'raid') cfg.mode = 'hp'; openLocal(cfg, 'Practice'); }
  else if (kind === 'raid') { cfg.mode = 'raid'; if (cfg.botLevel === 'dummy') cfg.botLevel = 'normal'; openLocal(cfg, 'Boss Raid'); }
  else if (kind === 'create') createRoom(false);
  else if (kind === 'queue') randomQueue();
}

// ---------- Rooms ----------
// room: {code|null, local, hostId, members: [{id, name, bot, ready}], cfg, title, endsAt}
function seatsFor(cfg) {   // how many players this mode wants (bots fill the empty seats)
  if (cfg.mode === 'tour') return cfg.tourSize;
  if (cfg.mode === 'ffa') return cfg.ffaSize;
  if (cfg.mode === 'first') return cfg.firstSize;
  if (cfg.mode === 'raid') return cfg.raidSize;
  return 2;
}
let botNames = botClasses();   // the same bots (classes) from the room screen into the match (new ones for each room)
const raidFirst = (list) => [...list.filter(raidClassOk), ...list.filter((k) => !raidClassOk(k))];   // (Boss Raid: bots whose class has a kit)
function botMembers(cfg, humans) {
  const n = Math.max(0, seatsFor(cfg) - humans.length), dummy = cfg.botLevel === 'dummy', out = [];
  const names = cfg.mode === 'raid' ? raidFirst(botNames) : botNames;
  for (let i = 0; i < n; i++) {
    const cls = dummy ? null : names[i % names.length];
    out.push({ id: 'bot' + i, name: dummy ? 'Training Dummy' + (n > 1 ? ' ' + (i + 1) : '') : CLASS_PICS[cls], cls, bot: cfg.botLevel, ready: true, rc: raidClassOk(cls) ? cls : null });
  }
  return out;
}
function openLocal(cfg, title) {
  leaveRoom(true);
  botNames = botClasses();
  net = localNet(me.id);
  net.handlers.push(onMessage);
  room = { code: null, local: true, hostId: me.id, members: [{ id: me.id, name: me.name, bot: null, ready: true, look: myLook(), rc: myRaidClass() }], cfg, title };
  drawRoom();
  show('room');
}
function createRoom(queue, code = newCode()) {
  leaveRoom(true);
  botNames = botClasses();
  const cfg = loadCfg();
  cfg.queue = !!queue;
  if (cfg.botLevel === 'dummy') cfg.botLevel = 'normal';
  net = roomNet(me.id, code);
  net.hostId = me.id;
  net.handlers.push(onMessage);
  room = { code, local: false, hostId: me.id, members: [{ id: me.id, name: me.name, bot: null, ready: false, look: myLook(), rc: myRaidClass() }], cfg, title: 'Room ' + code, fill: false };
  advertise();
  drawRoom();
  show('room');
}
function joinRoom(code) {
  if (!/^[A-Z]{4}$/.test(code)) { $('lobbyMsg').textContent = 'A room code is 4 letters.'; return; }
  leaveRoom(true);
  net = roomNet(me.id, code);
  net.handlers.push(onMessage);
  room = { code, joining: true, members: [], cfg: loadCfg(), title: 'Room ' + code };
  net.send('all', { t: 'hello', name: me.name, look: myLook(), rc: myRaidClass() });
  $('lobbyMsg').textContent = 'Looking for room ' + code + '…';
  setTimeout(() => { if (room?.joining && room.code === code) lobby(`Room ${code} wasn’t found (or it’s full).`); }, 2500);
}
function leaveRoom(quiet) {
  stopMusic(0);
  clearInterval(game?.countTimer);
  if (host) { host.stop(); host = null; }
  if (net) {
    if (room && !room.local && room.code) net.send('all', room.hostId === me.id ? { t: 'closed', why: 'The host left the room.' } : { t: 'bye' });
    net.close();
  }
  clearInterval(advTimer);
  if (advCode) { queueApi('close', { code: advCode }); advCode = null; }
  net = null; room = null; game = null;
  if (!quiet) lobby();
}
// The random queue (between tabs until the server exists): rooms set to "Random queue" announce themselves; someone
// queueing joins the first one with a free seat, or makes one and waits.
let advTimer = 0, qChan = null;
const queueApi = (what, body) => fetch(PVP_SERVER.replace(/^ws/, 'http') + '/queue/' + what, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
let advCode = null;
function advertise() {
  clearInterval(advTimer);
  if (PVP_SERVER) {   // the server keeps the list: say "open" every few seconds while waiting, "close" once not
    const open = () => room?.cfg.queue && room.code && room.hostId === me.id && !room.playing && room.members.filter((m) => !m.bot).length < Math.max(2, seatsFor(room.cfg));
    const say = () => {
      if (open()) { advCode = room.code; queueApi('open', { code: room.code, n: room.members.filter((m) => !m.bot).length, seats: Math.max(2, seatsFor(room.cfg)) }); }
      else if (advCode) { queueApi('close', { code: advCode }); advCode = null; }
    };
    say();
    if (room?.cfg.queue) advTimer = setInterval(say, 4000);
    return;
  }
  if (!room?.cfg.queue) return;
  qChan ??= new BroadcastChannel('mapledle-pvp:queue');
  const say = () => { if (room?.cfg.queue && room.hostId === me.id && !game) qChan.postMessage({ t: 'open', code: room.code, n: room.members.filter((m) => !m.bot).length, seats: seatsFor(room.cfg) }); };
  say();
  advTimer = setInterval(say, 1000);
}
async function randomQueue() {
  if (PVP_SERVER) {
    try {
      const r = await fetch(PVP_SERVER.replace(/^ws/, 'http') + '/queue').then((x) => x.json());
      return r.join ? joinRoom(r.code) : createRoom(true, r.code);
    } catch { return lobby('Couldn’t reach the PvP server.'); }
  }
  qChan ??= new BroadcastChannel('mapledle-pvp:queue');
  $('lobbyMsg').textContent = 'Looking for a room in the random queue…';
  let found = null;
  const look = (e) => { if (e.data?.t === 'open' && e.data.n < Math.max(2, e.data.seats)) found ??= e.data.code; };
  qChan.addEventListener('message', look);
  await new Promise((r) => setTimeout(r, 2200));
  qChan.removeEventListener('message', look);
  if (found) joinRoom(found);
  else createRoom(true);
}
const isHost = () => room && room.hostId === me.id;
function roomBroadcast() {
  if (!isHost() || room.local) return;
  net.send('all', { t: 'room', code: room.code, hostId: room.hostId, members: room.members, cfg: room.cfg, endsAt: room.endsAt ? room.endsAt - Date.now() : null, fill: room.fill });
}
// Rooms with people: once enough have joined, everyone sees the settings for 30 s (changing them starts it again);
// everyone pressing Ready starts it sooner.
let countTimer = 0;
function roomCountdown() {
  clearTimeout(countTimer);
  if (!isHost() || room.local || game) return;
  const people = room.members.filter((m) => !m.bot).length;
  const enough = room.cfg.mode === 'raid' ? people >= 1 : people >= 2 || (room.fill && people >= 1);
  if (!enough || people < 2 || room.members.some((m) => !m.bot && m.back === false)) { room.endsAt = null; return; }
  if (room.members.every((m) => m.ready)) { room.endsAt = null; return startMatch(); }
  room.endsAt ??= Date.now() + 30000;
  countTimer = setTimeout(() => { if (room && !game) startMatch(); }, room.endsAt - Date.now());
}
function setCfg(fn) {
  if (!isHost()) return;
  fn(room.cfg);
  if (!QS.some((q) => room.cfg.q[q])) room.cfg.q.bgm = true;   // at least one question
  saveCfg(room.cfg);
  if (!room.local) { for (const m of room.members) if (!m.bot && m.id !== me.id) m.ready = false; room.endsAt = null; roomCountdown(); roomBroadcast(); advertise(); }
  drawRoom();
}

// ---------- Room screen ----------
function chips(key, list, unit = '') {
  const v = room.cfg[key], custom = !list.includes(v), dis = isHost() ? '' : ' disabled';
  return `<span class="pvpchips" data-key="${key}">` + list.map((x) => `<button type="button" data-v="${x}" class="${x === v ? 'on' : ''}"${dis}>${x}${unit}</button>`).join('') +
    `<label class="custom${custom ? ' on' : ''}">Custom <input type="number" min="${LIMITS[key][0]}" max="${LIMITS[key][1]}" value="${custom ? v : ''}" placeholder="${LIMITS[key][0]}-${LIMITS[key][1]}"${dis}></label></span>`;
}
function drawRoom() {
  if (!room) return;
  const c = room.cfg, hostMe = isHost(), dis = hostMe ? '' : ' disabled';
  const link = room.code ? `${location.origin}${location.pathname.replace(/[^/]*$/, '').replace(/\/b\/[\w.]+\/$/, '/')}pvp/${room.code}` : '';
  $('roomHead').innerHTML = room.code
    ? `<h2>Room <span class="pvpcode">${room.code}</span></h2><p class="pvplink"><input readonly value="${esc(link)}"> <button type="button" id="copyLink">Copy link</button></p>` +
      `<p class="pvpvis">${hostMe ? `<label><input type="radio" name="vis" value="0"${c.queue ? '' : ' checked'}> Private (code / link)</label> <label><input type="radio" name="vis" value="1"${c.queue ? ' checked' : ''}> Random queue (public)</label>` : (c.queue ? 'Random queue (public)' : 'Private room')}</p>`
    : `<h2>${esc(room.title)}</h2>`;
  // Players
  const people = room.members.filter((m) => !m.bot);
  const bots = room.local || room.fill ? botMembers(c, people) : [];
  const all = [...people, ...bots];
  const raidOn = c.mode === 'raid';
  const clsTag = (m) => (raidOn && !m.bot && raidClassOk(m.rc) ? ` <small class="rctag"><img src="images/classes/${m.rc}.png" alt="">${esc(MR.cls(m.rc).name)}</small>` : '');
  $('roomPlayers').innerHTML = `<div class="pvpplayers">${all.map((m) => `<span class="pvpplayer${m.bot ? ' bot' : ''}">${m.bot ? '🤖' : m.id === room.hostId ? '👑' : '🙂'} ${esc(m.name)}${m.id === me.id ? ' (you)' : ''}${clsTag(m)}${!room.local && !m.bot ? (m.back === false ? ' <i>reading results…</i>' : m.ready ? ' <b class="ok">Ready</b>' : ' <i>not ready</i>') : ''}</span>`).join('')}</div>` +
    (raidOn ? raidClassHtml(room.members.find((x) => x.id === me.id)?.rc || myRaidClass()) : '');
  // Settings
  const modeBtns = Object.entries(MODES).filter(([k, m]) => room.local ? (room.title === 'Boss Raid' ? k === 'raid' : k !== 'raid') : true)
    .map(([k, m]) => `<button type="button" data-mode="${k}" class="${c.mode === k ? 'on' : ''}"${dis}>${m.name}</button>`).join('');
  const qRow = QS.map((q) => {
    const forced = c.mode === 'best';
    const on = forced ? q === 'bgm' : c.q[q];
    return `<div class="pvpq"><label><input type="checkbox" data-q="${q}"${on ? ' checked' : ''}${dis || (forced ? ' disabled' : '')}> ${QNAME[q]}</label>` +
      `<select data-input="${q}"${dis || (on ? '' : ' disabled')}>${Object.entries(INPUTS).map(([k, n]) => `<option value="${k}"${c.input[q] === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
  }).join('');
  let extra = '';
  const m = c.mode;
  if (m === 'hp' || m === 'ffa') extra += `<div class="pvprow"><span class="k">HP</span>${chips('hp', CHOICES.hp)}</div>`;
  if (m === 'tour') extra += `<div class="pvprow"><span class="k">HP per match</span>${chips('tourHp', CHOICES.tourHp)}</div>`;
  if (m === 'hp' || m === 'ffa' || m === 'tour') extra += `<div class="pvprow"><span class="k">Last chance</span><label class="pvpcheck"><input type="checkbox" id="lcBox"${c.lastChance ? ' checked' : ''}${dis}> Once per match, a hit that would KO you leaves you at 1 HP</label></div>`;
  if (m === 'life') extra += `<div class="pvprow"><span class="k">Lives</span>${chips('lives', CHOICES.lives)}</div>`;
  if (m === 'first') extra += `<div class="pvprow"><span class="k">Points to win</span>${chips('firstTo', CHOICES.firstTo)}</div>`;
  if (m === 'best') extra += `<div class="pvprow"><span class="k">Best of</span>${chips('bestOf', CHOICES.bestOf)}</div>`;
  if (m === 'raid') extra += `<div class="pvprow"><span class="k">Difficulty</span><span class="pvpchips" data-diff>${Object.entries(MR.DIFFS).map(([k, d]) => `<button type="button" data-v="${k}" class="${c.raidDiff === k ? 'on' : ''}"${dis}>${d.name}</button>`).join('')}</span></div><div class="pvprow"><span class="k">Lives each</span>${chips('raidLives', CHOICES.raidLives)}</div>`;
  const sizeRow = (key, list, label) => `<div class="pvprow"><span class="k">${label}</span><span class="pvpchips" data-size="${key}">${list.map((n) => `<button type="button" data-v="${n}" class="${c[key] === n ? 'on' : ''}"${dis}>${n}</button>`).join('')}</span></div>`;
  if (m === 'tour') extra += sizeRow('tourSize', [2, 4, 8], 'Players');
  if (m === 'ffa') extra += sizeRow('ffaSize', [3, 4, 5, 6, 7, 8], 'Players');
  if (m === 'first' && (room.local || room.fill)) extra += sizeRow('firstSize', [2, 3, 4, 5, 6, 7, 8], 'Players');
  if (m === 'raid') extra += sizeRow('raidSize', [1, 2, 3, 4, 5, 6, 7, 8], 'Players');
  if (room.local || room.fill) extra += `<div class="pvprow"><span class="k">Bots</span><select id="botLevel"${dis}>${Object.entries(BOTS).filter(([k]) => room.title === 'Practice' ? true : k !== 'dummy').map(([k, b]) => `<option value="${k}"${c.botLevel === k ? ' selected' : ''}>${b.name}</option>`).join('')}</select></div>`;
  if (!room.local && hostMe && MODES[m].multi) extra += `<div class="pvprow"><span class="k">Empty seats</span><label class="pvpcheck"><input type="checkbox" id="fillBox"${room.fill ? ' checked' : ''}> Fill them with bots</label></div>`;
  $('roomSettings').innerHTML = `<div class="pvpset">
    <div class="pvprow"><span class="k">Mode</span><span class="pvpmodes">${modeBtns}</span></div>
    <p class="pvpdesc">${esc(MODES[m].desc)}</p>
    <div class="pvprow"><span class="k">Round time</span>${chips('time', CHOICES.time, ' s')}</div>
    <div class="pvprow"><span class="k">Questions</span><div class="pvpqs">${qRow}</div></div>
    ${extra}
  </div>`;
  // Buttons
  const people2 = people.length;
  $('roomStart').hidden = !(room.local || (hostMe && (room.fill || c.mode === 'raid')));
  $('roomStart').textContent = room.local ? 'Start' : 'Start now';
  $('roomReady').hidden = room.local;
  const mine = room.members.find((x) => x.id === me.id);
  $('roomReady').textContent = mine?.ready ? 'Not ready' : 'Ready';
  let msg = '';
  if (!room.local) {
    if (room.members.some((x) => !x.bot && x.back === false)) msg = 'Waiting for everyone to come back from their results…';
    else if (people2 < 2 && !(room.fill || c.mode === 'raid')) msg = c.queue ? 'In the random queue: waiting for someone to join…' : 'Waiting for someone to join: share the code or the link.';
    else if (room.endsAt) msg = `Starting in ${Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000))} s, or as soon as everyone is Ready.`;
    else if (people2 >= 2) msg = 'Press Ready when you\u2019re happy with the settings.';
  }
  $('roomMsg').textContent = msg;
  wireRoom();
}
// Boss Raid: your class (its kit, and the list to change it)
function raidKitHtml(cls) {
  const { C } = MR.kit(cls), f = (x) => x.toLocaleString('en-US');
  const row = (sk) => `<div class="rcsk">${skillIcon(sk)}<div><b>${esc(sk.name)}</b> <small>${sk.cd ? `every ${sk.cd} rounds` : 'any round'}${sk.cd >= 10 ? ` (from round ${MR.RULES.warmUp + 1})` : ''}</small><br>${esc(MR.desc(cls, sk))}</div></div>`;
  return `<div class="rchead"><img class="rcpic" src="images/classes/${cls}.png" alt=""><div><b class="rcname">${esc(C.name)}</b> <small>${esc(C.role)} · ${f(C.hp)} HP</small>` +
    `<p class="rctrait"><b>${esc(C.trait[0])}.</b> ${esc(C.trait[1])}</p></div></div>` +
    `<div class="rcskills"><div class="rcsk">${skillIcon({ name: C.basic })}<div><b>${esc(C.basic)}</b> <small>main attack, free every round you answer right</small><br>${f(C.atk)} damage × your Power</div></div>${C.skills.map(row).join('')}</div>` +
    `<details class="rccommon"><summary>Everyone also has: ${MR.COMMON.map((x) => esc(x.name)).join(', ')}</summary><div class="rcskills">${MR.COMMON.map(row).join('')}</div></details>`;
}
let raidPickOpen = false;
function raidClassHtml(cls) {
  const grid = raidPickOpen ? `<div class="rcgrid">${MR.ORDER.map((k) => `<button type="button" data-rc="${k}" class="${k === cls ? 'on' : ''}" title="${esc(MR.cls(k).role)}"><img src="images/classes/${k}.png" alt="" loading="lazy"><span>${esc(MR.cls(k).name)}</span><small>${esc(MR.cls(k).role)}</small></button>`).join('')}</div>` : '';
  return `<div class="raidcls"><h3>Your class <button type="button" id="raidChange">${raidPickOpen ? 'Close the list' : 'Change class'}</button> <button type="button" id="raidRandom">🎲 Random</button></h3>${grid}${raidKitHtml(cls)}</div>`;
}
function setRaidClass(k) {
  if (!raidClassOk(k) || !room) return;
  lsSet(RAID_CLASS_KEY, k);
  const mine = room.members.find((x) => x.id === me.id);
  if (mine) mine.rc = k;
  if (isHost()) roomBroadcast(); else net?.send('host', { t: 'rc', rc: k });
  drawRoom();
}
function wireRaidClass() {
  const ch = $('raidChange'); if (!ch) return;
  ch.onclick = () => { sfx('click'); raidPickOpen = !raidPickOpen; drawRoom(); };
  $('raidRandom').onclick = () => { sfx('click'); setRaidClass(randomRaidClass()); };
  document.querySelectorAll('#roomPlayers [data-rc]').forEach((b) => b.onclick = () => { sfx('click'); raidPickOpen = false; setRaidClass(b.dataset.rc); });
}
let roomTick = setInterval(() => { if (room && !room.local && room.endsAt && !$('room').hidden) $('roomMsg').textContent = `Starting in ${Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000))} s, or as soon as everyone is Ready.`; }, 500);
function wireRoom() {
  const box = $('roomSettings');
  box.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => setCfg((c) => { c.mode = b.dataset.mode; }));
  box.querySelectorAll('.pvpchips[data-key]').forEach((g) => {
    const key = g.dataset.key;
    g.querySelectorAll('button').forEach((b) => b.onclick = () => setCfg((c) => { c[key] = +b.dataset.v; }));
    const inp = g.querySelector('input');
    inp.onchange = () => { const v = Math.round(+inp.value); if (v) setCfg((c) => { c[key] = clamp(v, ...LIMITS[key]); if (key === 'bestOf' && c[key] % 2 === 0) c[key] = Math.min(99, c[key] + 1); }); };
  });
  box.querySelectorAll('.pvpchips[data-size] button').forEach((b) => b.onclick = () => setCfg((c) => { c[b.parentElement.dataset.size] = +b.dataset.v; }));
  box.querySelectorAll('.pvpchips[data-diff] button').forEach((b) => b.onclick = () => setCfg((c) => { c.raidDiff = b.dataset.v; }));
  wireRaidClass();
  box.querySelectorAll('[data-q]').forEach((x) => x.onchange = () => setCfg((c) => { c.q[x.dataset.q] = x.checked; }));
  box.querySelectorAll('[data-input]').forEach((x) => x.onchange = () => setCfg((c) => { c.input[x.dataset.input] = x.value; }));
  const lc = $('lcBox'); if (lc) lc.onchange = () => setCfg((c) => { c.lastChance = lc.checked; });
  const bl = $('botLevel'); if (bl) bl.onchange = () => setCfg((c) => { c.botLevel = bl.value; });
  const fill = $('fillBox'); if (fill) fill.onchange = () => { room.fill = fill.checked; setCfg(() => {}); };
  const copy = $('copyLink'); if (copy) copy.onclick = () => { const i = copy.previousElementSibling; i.select(); navigator.clipboard?.writeText(i.value).catch(() => {}); copy.textContent = 'Copied!'; setTimeout(() => { copy.textContent = 'Copy link'; }, 1500); };
  document.querySelectorAll('input[name="vis"]').forEach((r) => r.onchange = () => setCfg((c) => { c.queue = r.value === '1'; }));
}
$('roomStart').addEventListener('click', () => { sfx('click'); startMatch(); });
$('roomReady').addEventListener('click', () => {
  sfx('click');
  const mine = room?.members.find((x) => x.id === me.id);
  if (!mine) return;
  if (isHost()) { mine.ready = !mine.ready; roomCountdown(); roomBroadcast(); drawRoom(); }
  else net.send('host', { t: 'ready', v: !mine.ready });
});
$('roomLeave').addEventListener('click', () => { sfx('click'); leaveRoom(); });

// ---------- Starting a match (host) ----------
function startMatch() {
  if (!isHost() || game || host) return;
  clearTimeout(countTimer);
  const c = JSON.parse(JSON.stringify(room.cfg));
  if (c.mode === 'best') c.q = { bgm: true, phase: false, title: false };
  const people = room.members.filter((m) => !m.bot).map((m) => ({ id: m.id, name: m.name, bot: null, look: m.id === me.id ? myLook() : cleanLook(m.look), rc: raidClassOk(m.rc) ? m.rc : 'hero' }));
  const bots = room.local || room.fill ? botMembers(c, people).map((b) => ({ id: b.id, name: b.name, bot: b.bot, look: botLook(b.cls, b.bot), rc: b.rc })) : [];
  let players = [...people, ...bots];
  if (c.mode === 'tour') {
    const size = [2, 4, 8].find((n) => n >= players.length) || 8;
    players = players.slice(0, size);
    while (players.length < size) {
      const used = new Set(players.map((p) => p.name)), cls = botNames.find((k) => !used.has(CLASS_PICS[k])) || botNames[0];
      const bot = c.botLevel === 'dummy' ? 'easy' : c.botLevel;
      players.push({ id: 'bot' + players.length, name: CLASS_PICS[cls], bot, look: botLook(cls, bot) });
    }
  }
  if (!['raid'].includes(c.mode) && players.length < 2) { $('roomMsg').textContent = 'This mode needs at least 2 players.'; return; }
  if (c.mode === 'ffa' && players.length < 3) { $('roomMsg').textContent = 'Free-for-all needs at least 3 players (turn on bots for the empty seats).'; return; }
  if (['hp', 'life', 'best'].includes(c.mode)) players = players.slice(0, 2);
  room.playing = true;
  for (const m of room.members) m.back = false;   // (each comes back to the room from their result)
  if (!room.local) net.send('all', { t: 'starting' });
  const send = (to, msg) => net.send(to, msg);
  if (c.mode === 'tour') {
    host = { tour: new Tournament({ cfg: c, players, send, onEnd: () => { room && (room.playing = false); } }) };
    host.receive = (from, m) => host.tour.receive(from, m);
    host.stop = () => host.tour.stop();
    host.forfeit = (pid) => host.tour.forfeit(pid);
    host.tour.start();
  } else {
    const m = new Match({ id: 'm' + newId(), cfg: c, players, send, onEnd: () => { room && (room.playing = false); } });
    host = { match: m, receive: (from, msg) => m.receive(from, msg), stop: () => m.stop(), forfeit: (pid) => m.forfeit(pid) };
    m.start();
  }
}

// ---------- Messages ----------
function onMessage(from, m) {
  if (!m || typeof m !== 'object') return;
  // Host side: room upkeep + answers for the match
  if (isHost()) {
    if (m.t === 'hello' && from !== me.id && !room.local) {
      const people = room.members.filter((x) => !x.bot);
      if (room.playing || people.length >= Math.max(2, seatsFor(room.cfg))) { net.send(from, { t: 'full' }); return; }
      if (!room.members.some((x) => x.id === from)) room.members.push({ id: from, name: String(m.name || 'Player').slice(0, 16), bot: null, ready: false, look: cleanLook(m.look), rc: raidClassOk(m.rc) ? m.rc : 'hero' });
      roomCountdown(); roomBroadcast(); drawRoom();
      return;
    }
    if (m.t === 'ready' && from !== me.id) { const x = room.members.find((y) => y.id === from); if (x) { x.ready = !!m.v; roomCountdown(); roomBroadcast(); drawRoom(); } return; }
    if (m.t === 'rc' && from !== me.id) { const x = room.members.find((y) => y.id === from); if (x && raidClassOk(m.rc) && !room.playing) { x.rc = m.rc; roomBroadcast(); drawRoom(); } return; }
    if (m.t === 'bye') { host?.forfeit?.(from); room.members = room.members.filter((x) => x.id !== from); room.endsAt = null; roomCountdown(); roomBroadcast(); drawRoom(); return; }
    if (m.t === 'back') { const x = room.members.find((y) => y.id === from); if (x) { x.back = true; roomCountdown(); roomBroadcast(); drawRoom(); } return; }
    if (['lock', 'done', 'cast', 'mready'].includes(m.t) || (m.t === 'ready' && m.id)) { host?.receive(from, m); }
  }
  if (m.t === 'ready' && m.id && from === me.id && isHost()) return;   // (handled above)
  // The PvP server itself
  if (from === 'server') {
    if (m.t === 'welcome' && room && !room.local) {
      if (isHost() && m.n > 1 && !room.playing && room.members.length === 1) return createRoom(room.cfg.queue);   // that code was taken: another one
      if (room.joining && m.n <= 1) return lobby(`Room ${room.code} wasn\u2019t found.`);
    }
    if (m.t === 'closed' && room && !room.local) lobby(m.why || 'Lost the connection to the PvP server.');
    return;
  }
  if (m.t === 'bye' && room && !isHost() && from === room.hostId) return lobby('The host left the room.');
  // Everyone: what the host says
  if (from !== room?.hostId && from !== me.id && !(room?.joining && m.t === 'room')) { if (!(m.t === 'full' && room?.joining)) return; }
  switch (m.t) {
    case 'full': if (room?.joining) lobby('That room is full or already playing.'); break;
    case 'room': {
      if (!room || isHost()) break;
      const first = room.joining;
      room.joining = false; room.hostId = from; net.hostId = from;
      Object.assign(room, { members: m.members, cfg: m.cfg, endsAt: m.endsAt != null ? Date.now() + m.endsAt : null, fill: m.fill, local: false });
      if (!room.members.some((x) => x.id === me.id)) { lobby('You were removed from the room.'); break; }
      if (first) show('room');   // (later ones: a guest reading their result stays there until they go back)
      if (!$('room').hidden) drawRoom();
      break;
    }
    case 'left': if (game && m.id === game.id && game.state.players[m.pid]) {
      game.state.players[m.pid].out = true;
      drawBoards();
      $('matchMsg').textContent = `${game.players.find((p) => p.id === m.pid)?.name ?? 'Someone'} left the match.`;
    } break;
    case 'closed': if (room && !room.local) lobby(m.why || 'The room was closed.'); break;
    case 'starting': $('roomMsg').textContent = 'Starting…'; break;
    case 'match': onMatch(m); break;
    case 'lobby': onLobby(m); break;
    case 'isready': onMready(m); break;
    case 'load': onLoad(m); break;
    case 'go': onGo(m); break;
    case 'locked': onLocked(m); break;
    case 'casts': onCasts(m); break;
    case 'reveal': onReveal(m); break;
    case 'end': onEnd(m); break;
    case 'bracket': onBracket(m); break;
  }
}

// ---------- Match screen ----------
// game: {id, cfg, players, state, mode, round, qs, time, locks, startPerf, timer, others}
const mine = (m) => m.players?.some((p) => p.id === me.id) || game?.id === m.id;
function onMatch(m) {
  if (!m.players.some((p) => p.id === me.id)) { if (!game) spectate(m); return; }   // a tournament match you're not in
  clearInterval(game?.countTimer);
  game = { id: m.id, cfg: m.cfg, players: m.players, state: m.state, mode: m.mode, startHp: m.startHp, round: 0, history: [] };
  $('reveal').hidden = true;
  $('questions').innerHTML = rulesHtml();
  $('questions').hidden = false;
  $('matchReady').hidden = true;
  $('matchMsg').textContent = '';
  $('roundNo').textContent = 'Get ready…';
  $('multBadge').hidden = true; $('sdBadge').hidden = true;
  $('musicState').textContent = '♪';
  setClock(m.cfg.time, m.cfg.time);
  show('match');
  drawChars();   // (first: the boards go into its boxes on a wide screen)
  drawBoards();
  charsEntrance();
}
function spectate(m) {
  if ($('bracket').hidden === false) $('bracketMsg').textContent = 'Matches are being played…';
}
// A count on the round clock: the lobby before round 1 (30 s) and the start of each round (5 s)
function countdown(ms, total, each) {
  clearInterval(game.countTimer);
  const end = performance.now() + ms;
  const step = () => {
    const left = Math.max(0, (end - performance.now()) / 1000);
    setClock(left, total / 1000);
    $('clock').classList.remove('low');
    each?.(Math.ceil(left));
    if (left <= 0) clearInterval(game.countTimer);
  };
  step();
  game.countTimer = setInterval(step, 200);
}
const lastRound = () => (game?.mode === 'raid' && game.state.boss ? MR.DIFFS[game.state.boss.diff].cap : ROUND_CAP);
function rulesHtml() {
  const c = game.cfg, m = game.mode, f = (x) => Number(x).toLocaleString('en-US'), rows = [];
  const row = (k, v) => rows.push(`<tr><th>${k}</th><td>${v}</td></tr>`), mode = MODES[c.mode] || MODES[m];
  row('Mode', `<b>${esc(mode.name)}</b>: ${esc(mode.desc)}`);
  row('Round time', `${c.time} s`);
  row('Questions', QS.filter((q) => c.q[q]).map((q) => `${QNAME[q]} <small>(${esc(INPUTS[c.input[q]] || '')})</small>`).join(' · '));
  if (m === 'hp' || m === 'ffa') row(c.mode === 'tour' ? 'HP per match' : 'HP', f(game.startHp));
  if (m === 'hp' || m === 'ffa') row('Last chance', c.lastChance ? 'On: once per match, a hit that would KO you leaves you at 1 HP' : 'Off');
  if (m === 'hp' || m === 'ffa') row('Damage', 'Faster right answers hit harder. x2 from round 5, x5 from round 10');
  if (m === 'life') row('Lives', c.lives);
  if (m === 'first') row('Points to win', c.firstTo);
  if (m === 'best') row('Rounds', `Best of ${c.bestOf}: the first to win ${neededWins(c.bestOf)} rounds takes the match`);
  if (m === 'raid' && game.state.boss) {
    const b = game.state.boss, mine = game.state.players[me.id];
    row('Boss', `${esc(b.name)} · ${esc(MR.DIFFS[b.diff].name)} · ${f(b.max)} HP · ${Math.round(b.def * 100)}% defense`);
    row('Lives each', c.raidLives);
    row('Your Power', 'A right answer: 100% at 0 s, 80% at 10 s, 68% at 20 s. Wrong: 0%. Every attack is × your Power');
    row('Skills', 'Pick them while the music plays, then End turn. A skill used this round is back after its cooldown (2 minutes in the game = 4 rounds)');
    if (mine) row('Your class', `<b>${esc(MR.cls(mine.cls).name)}</b>: ${esc(MR.cls(mine.cls).trait[1])}`);
  }
  row(m === 'raid' ? 'Time limit' : 'Last round', `Round ${lastRound()}`);
  const bot = game.players.find((p) => p.bot);
  if (bot) row('Bots', esc(BOTS[bot.bot]?.name || ''));
  return `<div class="pvprules"><h3>Rules</h3><table>${rows.join('')}</table></div>`;
}
function onLobby(m) {
  if (!game || m.id !== game.id) return;
  game.mready = new Set(m.ready);
  const btn = $('matchReady'), mine = game.players.some((p) => p.id === me.id) && !game.state.players[me.id]?.out;
  btn.hidden = !mine; btn.disabled = false; btn.textContent = 'Ready';
  $('musicState').textContent = 'The match starts when everyone is ready';
  countdown(m.ms, LOBBY_MS, (n) => { $('roundNo').textContent = `Starts in ${n}`; });
  drawBoards();
}
function onMready(m) {
  if (!game || m.id !== game.id || !game.mready) return;
  game.mready.add(m.pid);
  if (m.pid === me.id) { $('matchReady').disabled = true; $('matchReady').textContent = 'Ready ✓'; }
  drawBoards();
}
function onLoad(m) {
  if (!game || m.id !== game.id) return;
  Object.assign(game, { round: m.round, qs: m.qs, time: m.time, mult: m.mult, locks: {}, startPerf: 0, others: {}, tb: m.tb, sudden: m.sudden, revealing: false, casts: {}, ended: false, buf: null });
  if (m.move && game.state.boss) game.state.boss.move = m.move;
  const meP = game.state.players[me.id];
  game.out = meP?.out;
  game.label = m.tb ? `Tiebreak ${m.tb}` : `Round ${m.round}${m.round === lastRound() ? ' (last)' : ''}`;
  game.mready = null;
  $('matchReady').hidden = true;
  countdown(m.count || 0, COUNT_MS, (n) => { $('roundNo').textContent = n > 0 ? `${game.label} starts in ${n}` : game.label; });
  $('multBadge').hidden = !(m.mult > 1); $('multBadge').textContent = `x${m.mult} damage`;
  $('sdBadge').hidden = !m.sudden; $('sdBadge').textContent = 'Sudden death';
  $('reveal').hidden = true;
  $('questions').hidden = false;
  $('matchMsg').textContent = '';
  $('musicState').textContent = '♪ Loading the track…';
  drawQuestions(false);
  drawBoards();
  drawSkills();
  const mine = () => game?.id === m.id && game.round === m.round;
  loadMusic(m.track).then((buf) => {
    if (!mine()) return;
    game.buf = buf;
    if (!game.startPerf) { net.send('host', { t: 'ready', id: game.id, round: m.round }); $('musicState').textContent = '♪ Ready. Waiting for everyone…'; }
    else if (!game.revealing) { playMusic(buf); $('musicState').textContent = '♪ Playing (it loops until the time is up)'; }   // arrived after the round started
  }).catch(() => { if (!mine()) return; $('musicState').textContent = '♪ The track didn’t load.'; if (!game.startPerf) net.send('host', { t: 'ready', id: game.id, round: m.round }); });
}
function onGo(m) {
  if (!game || m.id !== game.id || m.round !== game.round) return;
  clearInterval(game.countTimer);
  $('roundNo').textContent = game.label;
  setClock(game.time, game.time);
  const go = () => {
    let at = 0;
    if (game.buf) at = playMusic(game.buf);
    // Your clock starts with your music (when it really starts playing)
    const delay = game.buf ? Math.max(0, (at - music.ctx.currentTime) * 1000) : 0;
    game.startPerf = performance.now() + delay;
    $('musicState').textContent = game.buf ? '♪ Playing (it loops until the time is up)' : '♪ No music this round';
    drawQuestions(!game.out);
    drawSkills();
    tick();
  };
  go();
}
function elapsed() { return game?.startPerf ? Math.max(0, performance.now() - game.startPerf) : 0; }
function setClock(left, total) {
  $('clockNum').textContent = Math.ceil(left);
  const arc = $('clockArc'), len = 2 * Math.PI * 16;
  arc.style.strokeDasharray = len;
  arc.style.strokeDashoffset = len * (1 - clamp(left / total, 0, 1));
  $('clock').classList.toggle('low', left <= 5);
}
function tick() {
  if (!game || !game.startPerf || game.revealing) return;
  const left = game.time - elapsed() / 1000;
  setClock(Math.max(0, left), game.time);
  if (left <= 0) { timeUp(); return; }
  game.timer = requestAnimationFrame(tick);
}
function timeUp() {
  if (!game || game.timeIsUp) return;
  game.timeIsUp = true;
  for (const box of $('questions').querySelectorAll('.pvpqbox:not(.locked)')) { box.classList.add('missed'); box.querySelector('.qbody').innerHTML = '<span class="qlock">⏰ Time’s up</span>'; }
  net.send('host', { t: 'done', id: game.id, round: game.round });
  drawSkills();
}
// ---------- Boss Raid: the skill bar ----------
const nameOf = (id) => game?.players.find((p) => p.id === id)?.name ?? '?';
const skillsOpen = () => game && game.startPerf && !game.timeIsUp && !game.ended && !game.revealing && !game.out;
function drawSkills() {
  const box = $('skills');
  if (!game || game.mode !== 'raid') { box.hidden = true; box.innerHTML = ''; return; }
  if (game.revealing) { box.hidden = true; return; }
  box.hidden = false;
  const st = game.state.players[me.id];
  if (!st || st.out) { box.innerHTML = '<p class="pvpout">You’re out: your team fights on.</p>'; return; }
  const { C } = MR.kit(st.cls), mine = game.casts[me.id] || {}, open = skillsOpen(), f = (x) => x.toLocaleString('en-US');
  const spent = Object.keys(mine).reduce((x, k) => x + (MR.skill(st.cls, k)?.cost || 0), 0);
  const note = open ? 'Pick skills, then End turn' : game.ended ? 'Turn ended' : !game.startPerf ? 'Skills open when the music starts' : '';
  const usable = (sk) => MR.canCast(game.state, me.id, sk.key) && (!sk.cost || spent + sk.cost <= st.g);
  const btn = (sk) => {
    const on = sk.key in mine, cd = st.cd[sk.key] || 0, can = open && (on || usable(sk));
    const sub = sk.key === 'pot' ? `${st.pots} left` : cd > 0 ? `in ${cd} round${cd === 1 ? '' : 's'}` : sk.cd ? `every ${sk.cd} rounds` : 'any round';
    const arg = !on ? '' : sk.target && mine[sk.key] !== me.id ? ` → ${esc(nameOf(mine[sk.key]))}` : sk.options ? ` → ${esc(sk.options[mine[sk.key]]?.split(':')[0] || '')}` : '';
    return `<button type="button" data-sk="${sk.key}" class="${on ? 'on' : ''}${can ? '' : ' no'}${game.skDesc === sk.key ? ' sel' : ''}" aria-disabled="${!can}">` +
      `<span class="ic">${skillIcon(sk)}${cd > 0 ? `<i class="cd">${cd}</i>` : ''}</span><b>${esc(sk.short || sk.name)}</b><small>${sub}${arg}</small></button>`;
  };
  const d = game.skDesc && MR.skill(st.cls, game.skDesc);
  box.innerHTML = `<div class="skhead"><img class="rcpic sm" src="images/classes/${st.cls}.png" alt=""><div><b>${esc(C.name)}</b> · ${esc(C.basic)}: <b>${f(C.atk)}</b> × your Power, free every round you answer right` +
      `<br><small><b>${esc(C.trait[0])}.</b> ${esc(C.trait[1])}</small></div><span class="sknote">${note}</span></div>` +
    `<div class="skbar">${C.skills.map(btn).join('')}<span class="sksep"></span>${MR.COMMON.map(btn).join('')}</div>` +
    `<p class="skdesc">${d ? `${skillIcon(d, 'sm')} <b>${esc(d.name)}</b>: ${esc(MR.desc(st.cls, d))}` : 'Tap a skill to pick it (tap again to drop it). Its description shows here.'}</p><div class="sktarget" hidden></div>` +
    `<p class="skend"><button type="button" id="endTurn" class="pvpbig"${open ? '' : ' disabled'}>${game.ended ? 'Turn ended ✓' : 'End turn ✓'}</button></p>`;
  box.querySelectorAll('[data-sk]').forEach((b) => {
    b.onclick = () => clickSkill(b.dataset.sk);
    b.onmouseenter = () => { const sk = MR.skill(st.cls, b.dataset.sk), el = box.querySelector('.skdesc'); if (sk && el) el.innerHTML = `${skillIcon(sk, 'sm')} <b>${esc(sk.name)}</b>: ${esc(MR.desc(st.cls, sk))}`; };
  });
  $('endTurn').onclick = endTurn;
}
function clickSkill(k) {
  const st = game?.state.players[me.id], sk = st && MR.skill(st.cls, k);
  if (!sk) return;
  game.skDesc = k;
  const mine = (game.casts[me.id] ??= {});
  if (!skillsOpen()) return drawSkills();
  if (k in mine) { delete mine[k]; net.send('host', { t: 'cast', id: game.id, round: game.round, skill: k, on: false }); sfx('click'); drawSkills(); drawBoards(); return; }
  const spent = Object.keys(mine).reduce((x, key) => x + (MR.skill(st.cls, key)?.cost || 0), 0);
  if (!MR.canCast(game.state, me.id, k) || (sk.cost && spent + sk.cost > st.g)) return drawSkills();   // (just its description)
  const team = game.players.filter((p) => !game.state.players[p.id]?.out);
  const ask = (label, choices) => {   // who gets it / which one?
    drawSkills();
    const pick = $('skills').querySelector('.sktarget');
    pick.hidden = false;
    pick.innerHTML = `<span>${skillIcon(sk, 'sm')} ${esc(sk.name)} ${label}</span>` + choices.map(([v, text]) => `<button type="button" data-t="${esc(v)}">${esc(text)}</button>`).join('') + '<button type="button" data-t="">Cancel</button>';
    pick.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { if (b.dataset.t !== '') cast(k, sk.options ? +b.dataset.t : b.dataset.t); else pick.hidden = true; });
  };
  if (sk.target && team.length > 1) return ask('on:', team.map((p) => [p.id, p.name + (p.id === me.id ? ' (you)' : '')]));
  if (sk.options) return ask(':', sk.options.map((o, i) => [String(i), o]));
  cast(k, sk.target ? me.id : true);
}
function cast(k, target) {
  if (!skillsOpen()) return;
  (game.casts[me.id] ??= {})[k] = target;
  sfx('click');
  net.send('host', { t: 'cast', id: game.id, round: game.round, skill: k, target, on: true });
  drawSkills(); drawBoards();
}
function endTurn() {
  if (!skillsOpen()) return;
  game.ended = true;
  sfx('click');
  net.send('host', { t: 'done', id: game.id, round: game.round });
  $('matchMsg').textContent = 'Turn ended. Waiting for the others…';
  drawSkills();
}
function onCasts(m) {
  if (!game || m.id !== game.id || m.round !== game.round) return;
  game.casts[m.pid] = m.casts || {};   // (the host's word: it may have turned one down)
  drawBoards();
  if (m.pid === me.id) drawSkills();
}
function lock(q, value) {
  if (!game || game.locks[q] || !game.startPerf || game.timeIsUp || game.out) return;
  value = String(value).trim();
  if (!value) return;
  const ms = Math.round(elapsed());
  if (ms > game.time * 1000) return timeUp();
  game.locks[q] = { value, ms };
  sfx('click');
  net.send('host', { t: 'lock', id: game.id, round: game.round, q, value, ms });
  const box = $('questions').querySelector(`[data-q="${q}"]`);
  if (box) { box.classList.add('locked'); box.querySelector('.qbody').innerHTML = `<span class="qlock">🔒 ${esc(value)} <small>${(ms / 1000).toFixed(2)} s</small></span>`; }
  if (Object.keys(game.qs).every((k) => game.locks[k])) $('matchMsg').textContent = game.mode === 'raid' ? (game.ended ? '' : 'All answered. Pick skills if you like, then End turn.') : 'All locked in. Waiting for the others…';
  else if (!matchMedia('(pointer: coarse)').matches) $('questions').querySelector('.pvpqbox:not(.locked):not(.missed) input')?.focus({ preventScroll: true });   // (computers: straight on to the next one; phones would pop the keyboard up)
}
function onLocked(m) {
  if (!game || m.id !== game.id) return;
  (game.others[m.pid] ??= new Set()).add(m.q);
  drawBoards();
}
function drawQuestions(active) {
  const box = $('questions');
  game.timeIsUp = false;
  if (game.out) { box.innerHTML = '<p class="pvpout">You’re out: watching the rest.</p>'; return; }
  box.innerHTML = '';
  for (const q of QS) {
    const spec = game.qs?.[q];
    if (!spec) continue;
    const el = document.createElement('div');
    el.className = 'pvpqbox';
    el.dataset.q = q;
    const ask = { bgm: 'Which boss is this BGM from?', phase: 'Which part of the fight?', title: 'What’s this BGM called?' }[q];
    el.innerHTML = `<div class="qhead"><b>${QNAME[q]}</b> <span>${ask}</span></div><div class="qbody"></div>`;
    box.appendChild(el);
    const body = el.querySelector('.qbody');
    if (!active) { body.innerHTML = '<span class="qwait">Starts with the music…</span>'; continue; }
    if (spec.style === 'abcd') {
      body.innerHTML = `<div class="abcd">${spec.options.map((o, i) => `<button type="button" data-v="${esc(o)}"><b>${'ABCD'[i]}</b> ${esc(o)}</button>`).join('')}</div>`;
      body.querySelectorAll('button').forEach((b) => b.onclick = () => lock(q, b.dataset.v));
    } else if (spec.style === 'typed') {
      body.innerHTML = `<form class="typed"><input autocomplete="off" spellcheck="false" placeholder="Type your answer" data-1p-ignore data-lpignore="true"><button>Lock in</button></form>`;
      const f = body.querySelector('form');
      f.onsubmit = (e) => { e.preventDefault(); lock(q, f.querySelector('input').value); };
    } else dropdown(body, q, spec.options || (q === 'bgm' ? bossNames() : q === 'title' ? DATA.titles : DATA.byName[game.answerBoss]?.labels || []));
  }
  if (!matchMedia('(pointer: coarse)').matches) box.querySelector('input')?.focus({ preventScroll: true });
}
// The site's search box with a list under it: type to filter, click (or Enter on the highlighted row) to lock it in.
function dropdown(body, q, items) {
  body.innerHTML = `<div class="pvppick"><input type="search" autocomplete="off" spellcheck="false" placeholder="Search…" data-1p-ignore data-lpignore="true"><div class="pvplist" hidden></div></div>`;
  const inp = body.querySelector('input'), list = body.querySelector('.pvplist');
  let shown = [], act = 0;
  const draw = () => {
    const t = norm(inp.value);
    shown = items.filter((x) => !t || norm(x).includes(t)).sort((a, b) => (norm(b).startsWith(t) - norm(a).startsWith(t))).slice(0, 60);
    act = clamp(act, 0, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map((x, i) => {
      const img = q === 'bgm' && DATA.byName[x]?.image ? `<img src="${esc(DATA.byName[x].image)}" alt="" loading="lazy">` : '';
      return `<div class="item${i === act ? ' active' : ''}" data-i="${i}">${img}<span>${esc(x)}</span></div>`;
    }).join('') || '<div class="none">No match</div>';
    list.hidden = false;
  };
  inp.addEventListener('focus', draw);
  inp.addEventListener('input', () => { act = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { act++; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act--; draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[act]) lock(q, shown[act]); }
    else if (e.key === 'Escape') list.hidden = true;
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => { const it = e.target.closest('.item'); if (it) lock(q, shown[+it.dataset.i]); });
  inp.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
}
// Player boards: HP bar / lives / points / round wins, and who has locked in what this round.
function drawBoards(state = game?.state) {
  if (!game) return;
  const g = game, s = state, c = g.cfg;
  let html = '';
  if (g.mode === 'raid' && s.boss) {
    const b = s.boss, pct = b.hp / b.max * 100, f = (x) => x.toLocaleString('en-US');
    const tags = [...b.vuln.map((v) => `<span class="bf bad" title="Takes more damage">${esc(v.name)} +${Math.round((v.m - 1) * 100)}% · ${v.n}</span>`),
      ...b.weak.map((v) => `<span class="bf bad" title="Hits softer">${esc(v.name)} −${Math.round((1 - v.m) * 100)}% attack · ${v.n}</span>`),
      b.dots.length ? `<span class="bf bad">🔥 ${b.dots.length} burn${b.dots.length === 1 ? '' : 's'}</span>` : '',
      b.bindImmune > 0 ? `<span class="bf">⛓️ resists binds · ${b.bindImmune}</span>` : '', b.enraged ? '<span class="bf ult">😡 Enraged</span>' : ''].join('');
    html += `<div class="pvpboss"><img src="${esc(b.image)}" alt=""><div><b>${esc(b.name)}</b> <small class="diff">${esc(MR.DIFFS[b.diff].name)}</small><div class="bar boss"><i style="width:${pct}%"></i></div>` +
      `<small>${f(b.hp)} / ${f(b.max)} HP · ${Math.round(b.def * 100)}% defense</small>${tags ? `<div class="bfs">${tags}</div>` : ''}</div></div>` +
      (b.move ? `<div class="intent${b.move.k === 'ult' || b.move.k === 'charge' ? ' ult' : b.move.k === 'tired' ? ' good' : ''}"><small>${g.revealing ? 'This round' : 'Its move this round'}</small> ${fillNames(esc(MR.moveText(b.move, b.name)), nameOf)}</div>` : '');
  }
  html += '<div class="pvpboards">';
  for (const p of g.players) {
    const st = s.players[p.id];
    if (!st) continue;
    let stat = '';
    if (g.mode === 'hp' || g.mode === 'ffa') stat = `<div class="bar"><i style="width:${clamp(st.hp / g.startHp * 100, 0, 100)}%"></i></div><small>${Math.max(0, st.hp)} / ${g.startHp} HP${st.lc ? ' · Last chance used' : ''}</small>`;
    else if (g.mode === 'raid') {
      const C = MR.cls(st.cls);
      const queued = !g.revealing && g.casts?.[p.id] ? Object.keys(g.casts[p.id]).map((k) => { const sk = MR.skill(st.cls, k); return sk ? skillIcon(sk, 'sm') : ''; }).join('') : '';
      const lines = [C.gauge ? `<span class="gauge" title="${esc(C.trait[1])}">${esc(C.gauge.name)} <b>${st.g}</b>/${C.gauge.max}</span>` : '', st.st && C.stances ? `<span class="gauge">${esc(C.stances[st.st] || '')}</span>` : '',
        C.status?.(st) ? `<span class="gauge">${esc(C.status(st))}</span>` : ''].join('');
      const buffs = [...st.buffs.map((f) => `<span class="bf" title="${esc(MR.h.buffWords(f) || f.name)}">${esc(f.name)} · ${f.n}</span>`), ...st.sum.map((x) => `<span class="bf sum" title="Summon">${esc(x.name)} · ${x.n}</span>`)].join('');
      stat = `<div class="rcwho"><img src="images/classes/${st.cls}.png" alt=""><span>${esc(C.name)}</span></div>` +
        `<div class="bar"><i style="width:${clamp(st.hp / st.maxHp * 100, 0, 100)}%"></i></div><small>${Math.max(0, st.hp).toLocaleString('en-US')} / ${st.maxHp.toLocaleString('en-US')} HP</small>` +
        `<div class="hearts">${st.lives > 0 ? '❤️'.repeat(Math.min(st.lives, 20)) : '🖤'}</div>` +
        (lines ? `<div class="raidline">${lines}</div>` : '') + (buffs ? `<div class="bfs">${buffs}</div>` : '') + (queued ? `<div class="queued" title="Skills picked this round">${queued}</div>` : '');
    }
    else if (g.mode === 'life') stat = `<div class="hearts">${st.lives > 0 ? '❤️'.repeat(Math.min(st.lives, 20)) : (s.sudden && !st.out ? '💀 Sudden death' : '🖤')}</div>`;
    else if (g.mode === 'first') stat = `<div class="bar pts"><i style="width:${clamp(st.points / c.firstTo * 100, 0, 100)}%"></i></div><small>${st.points} / ${c.firstTo} points</small>`;
    else if (g.mode === 'best') stat = `<div class="wins">${'●'.repeat(st.wins)}${'○'.repeat(Math.max(0, neededWins(c.bestOf) - st.wins))}</div><small>${st.wins} round win${st.wins === 1 ? '' : 's'} (need ${neededWins(c.bestOf)})</small>`;
    const locked = g.others?.[p.id] || new Set();
    const dots = g.qs ? Object.keys(g.qs).map((q) => `<span class="dot${locked.has(q) ? ' on' : ''}" title="${QNAME[q]}">${locked.has(q) ? '🔒' : '⏳'}</span>`).join('') : '';
    const rdy = g.mready?.has(p.id) ? ' <span class="rdy">READY</span>' : '';
    const board = `<div class="pvpboard${p.id === me.id ? ' me' : ''}${st.out ? ' out' : ''}" data-pid="${p.id}"><div class="who">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === me.id ? ' (you)' : ''}${rdy}</div>${stat}<div class="dots">${st.out ? 'Out' : dots}</div></div>`;
    const slot = sidesOn() && document.querySelector(`#chars .pvpchar[data-pid="${CSS.escape(p.id)}"] .pvpslot`);
    if (slot) slot.innerHTML = board; else html += board;
  }
  $('boards').innerHTML = html + '</div>';
  for (const el of document.querySelectorAll('#chars .rdy')) el.hidden = !g.mready?.has(el.dataset.rdy);
}
// The reveal, one step at a time (the same on every screen: the host waits for it before the next round).
async function onReveal(r) {
  if (!game || r.id !== game.id) return;
  game.revealing = true;
  clearInterval(game.countTimer);
  $('matchReady').hidden = true;
  $('questions').hidden = true;   // (the results show what everyone locked in)
  $('skills').hidden = true;
  cancelAnimationFrame(game.timer);
  game.timeIsUp = true;
  $('clockNum').textContent = '–';
  $('clock').classList.remove('low');
  $('matchMsg').textContent = '';
  const box = $('reveal'), steps = revealSteps(r), pl = game.players.filter((p) => r.per[p.id]);
  const name = (id) => game.players.find((p) => p.id === id)?.name ?? '?';
  box.hidden = false;
  const qList = QS.filter((q) => r.qs[q]);
  box.innerHTML = `<h3>${r.state.tb ? 'Tiebreak' : 'Round ' + r.round} results</h3><div class="table-wrap"><table class="pvprev"><thead><tr><th></th>${pl.map((p) => `<th>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</th>`).join('')}</tr></thead><tbody>` +
    qList.map((q) => `<tr data-q="${q}"><th><span class="qn">${QNAME[q]}</span><span class="ans"></span></th>${pl.map((p) => `<td data-pid="${p.id}"></td>`).join('')}</tr>`).join('') +
    (qList.length > 1 || game.mode === 'raid' ? `<tr class="tot"><th>${game.mode === 'raid' ? 'Power' : 'Total'}</th>${pl.map((p) => `<td data-pid="${p.id}"></td>`).join('')}</tr>` : '') +
    `</tbody></table></div><div class="apply"></div>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const pts = game.mode === 'first', speed = game.mode === 'best' || r.state.tb, raid = game.mode === 'raid';
  const shownEv = new Set(), showEv = (test) => {   // (raid: skills, then the boss, then the rest)
    const add = r.ev.map((e, i) => [e, i]).filter(([e, i]) => !shownEv.has(i) && test(e));
    for (const [, i] of add) shownEv.add(i);
    box.querySelector('.apply').insertAdjacentHTML('beforeend', add.map(([e]) => evText(e, name, r)).filter(Boolean).map((x) => `<p>${x}</p>`).join(''));
  };
  for (const st of steps) {
    if (!game || game.id !== r.id) return;
    if (st.s === 'answer') {
      const cell = box.querySelector(`tr[data-q="${st.q}"] .ans`);
      const a = r.answer;
      cell.innerHTML = st.q === 'bgm' ? `<img src="${esc(a.image)}" alt=""> ${esc(a.boss)}` : st.q === 'phase' ? esc(a.labels.join(' / ')) : esc(a.title);
      cell.parentElement.parentElement.classList.add('shown');
      sfx('click');
    } else if (st.s === 'scores') {
      for (const p of pl) {
        const it = r.per[p.id].items[st.q], td = box.querySelector(`tr[data-q="${st.q}"] td[data-pid="${p.id}"]`);
        const time = it.ms != null ? `<small>${(it.ms / 1000).toFixed(2)} s</small>` : '';
        td.className = it.ok ? 'ok' : 'no';
        td.innerHTML = it.v == null ? '<span class="none">No answer</span>'
          : `${it.ok ? '✅' : '❌'} <span class="pick">${esc(it.v)}</span> ${time}${it.ok && !speed && !raid ? `<b class="gain">${pts ? '+' + it.pts : it.dmg}</b>` : ''}`;
      }
    } else if (st.s === 'totals') {
      for (const p of pl) box.querySelector(`tr.tot td[data-pid="${p.id}"]`).innerHTML = `<b>${pts ? '+' + r.per[p.id].pts + ' pts' : raid ? r.per[p.id].total + '%' : r.per[p.id].total + ' dmg'}</b>`;
    } else if (st.s === 'skills') {
      showEv((e) => e.k === 'raid' && e.s === 'skills');
      sfx('click');
    } else if (st.s === 'boss') {
      showEv((e) => e.k === 'raid' && e.s === 'boss');
    } else if (st.s === 'apply') {
      showEv(() => true);
      if (!box.querySelector('.apply').innerHTML) box.querySelector('.apply').innerHTML = '<p>Nothing happened.</p>';
      game.state = r.state;
      drawBoards(r.state);
      for (const e of r.ev) if (e.k === 'hp' || e.k === 'life' || e.kind === 'bossHit' || e.kind === 'life') document.querySelector(`.pvpboard[data-pid="${e.pid}"]`)?.classList.add('hit');
      if (r.state.over) $('matchMsg').textContent = '';
    }
    await new Promise((res) => setTimeout(res, stepMs(st)));
  }
  if (!r.state.over) stopMusic(1.5);
}
function evText(e, name, r) {
  const n = (id) => `<b>${esc(name(id))}</b>`;
  switch (e.k) {
    case 'hp': return e.why === 'slowest' ? `🐢 3+ rounds with no damage: ${n(e.pid)} was the slowest and loses ${e.amount} HP` : `💥 ${n(e.pid)} takes ${e.amount} damage${e.why ? ` (${e.why})` : ''}`;
    case 'lastChance': return `🍀 Last chance! ${n(e.pid)} hangs on at 1 HP`;
    case 'ko': return `☠️ ${n(e.pid)} is knocked out`;
    case 'life': if (e.why === 'down') return `💔 ${n(e.pid)} goes down and loses a life (back at full HP)`;
      return e.why === 'slowest' ? `🐢 3+ rounds with no lives lost: ${n(e.pid)} was the slowest and loses a life` : `💔 ${n(e.pid)} loses a life`;
    case 'out': return e.why === 'slowest' ? `🐢 ${n(e.pid)} was the slowest and is out` : `☠️ ${n(e.pid)} is out`;
    case 'sudden': return '💀 Everyone lost their last life: sudden death! Fail alone and you’re out.';
    case 'bothFail': return `Everyone failed (${e.n} in a row; ${DRAWS_BEFORE_PENALTY} = a draw)`;
    case 'drawRound': return game.mode === 'best' || r.state.tb ? `🤝 Drawn round${e.streak ? ` (${e.streak} in a row${game.mode === 'best' ? `; ${DRAWS_BEFORE_PENALTY} = a draw` : ''})` : ''}` : `🤝 Nothing changes this round${e.streak ? ` (${e.streak} in a row)` : ''}`;
    case 'roundWin': return `🏅 ${n(e.pid)} takes the ${r.state.tb ? 'tiebreak' : 'round'}`;
    case 'random': return `🎲 Random pick: ${n(e.pid)}`;
    case 'point': return `🐢 3+ even rounds: ${n(e.pid)} was the slowest and loses a point`;
    case 'pts': return e.pts ? `⭐ ${n(e.pid)} +${e.pts} point${e.pts === 1 ? '' : 's'}` : '';
    case 'raid': return `<span class="rev ${e.kind || ''}">${e.ic ? `<img class="skic sm" src="images/skills/${esc(e.ic)}.png" alt="" onerror="this.remove()"> ` : ''}${fillNames(e.t, name)}</span>`;   // (the raid's own words: raid.js)
    case 'tiebreak': return '⚖️ A draw: a speed tiebreak decides (first right BGM wins)';
  }
  return '';
}
function onEnd(m) {
  if (!game || m.id !== game.id) return;
  notePvp(m);
  const wait = $('reveal').hidden ? 0 : 900;
  setTimeout(() => showResult(m), wait);
}
function showResult(m) {
  stopMusic(2);
  clearInterval(game?.countTimer);
  const o = m.over, win = o.winners.includes(me.id);
  const tourGame = game?.cfg.mode === 'tour';
  const names = (ids) => ids.map((id) => m.players.find((p) => p.id === id)?.name ?? '?').join(', ');
  let head;
  if (o.coop) head = o.lost ? '💀 The raid failed' : '🏆 Raid cleared!';
  else if (o.draw) head = '🤝 Draw';
  else head = win ? '🏆 You win!' : `${esc(names(o.winners))} wins`;
  $('resultHead').innerHTML = head;
  $('resultWhy').textContent = o.reason;
  const pl = m.players;
  const pts = m.mode === 'first', raidRes = m.mode === 'raid';
  // Boss Raid: who did what (the most damage = MVP)
  let extra = '';
  if (raidRes && m.state.stats) {
    const f = (x) => Math.round(x).toLocaleString('en-US'), st = (id) => m.state.stats[id] || { dmg: 0, heal: 0, taken: 0, right: 0 };
    const top = Math.max(...pl.map((p) => st(p.id).dmg)), all = pl.reduce((x, p) => x + st(p.id).dmg, 0) || 1;
    extra = `<div class="table-wrap"><table class="raidstats"><thead><tr><th>Player</th><th>Class</th><th>Damage</th><th>Share</th><th>Healing</th><th>Damage taken</th><th>Right answers</th></tr></thead><tbody>` +
      pl.map((p) => { const x = st(p.id), ps = m.state.players[p.id]; return `<tr class="${x.dmg === top && top > 0 ? 'mvp' : ''}"><td>${x.dmg === top && top > 0 ? '⭐ ' : ''}${p.bot ? '🤖 ' : ''}${esc(p.name)}</td><td>${esc(MR.cls(ps?.cls).name)}</td><td>${f(x.dmg)}</td><td>${Math.round(x.dmg / all * 100)}%</td><td>${f(x.heal)}</td><td>${f(x.taken)}</td><td>${x.right} / ${m.history.length}</td></tr>`; }).join('') +
      `</tbody></table></div>`;
  }
  $('resultExtra').innerHTML = extra;
  $('resultTable').innerHTML = `<thead><tr><th>Round</th><th>Track</th>${pl.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>` +
    m.history.map((h) => `<tr><td>${h.round}</td><td class="trk">${esc(h.title)}<small>${esc(h.boss)}</small></td>${pl.map((p) => { const x = h.per[p.id]; return `<td>${!x ? '-' : h.speed ? (x.ms != null ? `${(x.ms / 1000).toFixed(2)} s ${x.ok ? '✅' : '❌'}` : 'No answer') : (pts ? '+' + x.pts : raidRes ? `${x.total}% <small>${(h.dmg?.[p.id] || 0).toLocaleString('en-US')} dmg</small>` : x.total) + (x.ok ? ' ✅' : '')}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
  if (win && !o.draw) { try { confetti?.(); } catch {} }
  const local = room?.local, hostMe = isHost();
  $('again').hidden = tourGame;
  $('again').textContent = local ? 'Play again' : 'Back to the room';
  $('toLobby').textContent = tourGame ? 'Back to the bracket' : local ? 'Back to the lobby' : 'Leave the room';
  game = null;
  show('result');
}
$('again').addEventListener('click', () => {
  sfx('click');
  if (host) { host.stop(); host = null; }
  if (room?.local) { room.playing = false; startMatch(); return; }
  if (!room) return lobby();
  if (isHost()) {
    room.playing = false;
    for (const m of room.members) { m.ready = false; if (m.id === me.id) m.back = true; }
    room.endsAt = null;
    show('room'); roomCountdown(); roomBroadcast(); drawRoom();
  } else { net.send('host', { t: 'back' }); show('room'); drawRoom(); }
});
$('toLobby').addEventListener('click', () => {
  sfx('click');
  if (lastBracket && !lastBracket.champion) { show('bracket'); drawBracket(lastBracket); return; }
  leaveRoom();
});
$('matchReady').addEventListener('click', () => {
  if (!game || !game.mready || game.mready.has(me.id)) return;
  $('matchReady').disabled = true;
  net.send('host', { t: 'mready', id: game.id });
});
$('matchQuit').addEventListener('click', () => {
  if (!confirm('Leave this match?')) return;
  sfx('click');
  leaveRoom();
});

// ---------- Tournament bracket ----------
let lastBracket = null;
function onBracket(b) {
  lastBracket = b;
  if (game) return;   // in a match: look at it afterwards
  if (!$('result').hidden && !b.champion) return;   // reading your result first
  show('bracket');
  drawBracket(b);
}
function drawBracket(b) {
  const name = (id) => { const p = b.players.find((x) => x.id === id); return p ? `${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === me.id ? ' (you)' : ''}` : '…'; };
  const label = (i, n) => n - i === 1 ? 'Final' : n - i === 2 ? 'Semifinals' : n - i === 3 ? 'Quarterfinals' : `Round ${i + 1}`;
  const total = Math.log2(b.players.length);
  let html = '<div class="pvpbracket">';
  for (let i = 0; i < total; i++) {
    const games = b.rounds[i] || Array.from({ length: b.players.length / 2 ** (i + 1) }, () => ({}));
    html += `<div class="col"><h4>${label(i, total)}</h4><div class="ties">` + games.map((g) => `<div class="tie${g.live ? ' live' : ''}">` +
      `<div class="${g.winner && g.winner === g.a ? 'w' : g.winner ? 'l' : ''}">${g.a ? name(g.a) : '…'}</div>` +
      `<div class="${g.winner && g.winner === g.b ? 'w' : g.winner ? 'l' : ''}">${g.b ? name(g.b) : '…'}</div>` +
      `${g.live ? '<small>Playing…</small>' : g.why ? `<small>${esc(g.why)}</small>` : ''}</div>`).join('') + '</div></div>';
  }
  html += '</div>';
  if (b.champion) html += `<p class="champ">🏆 Champion: <b>${name(b.champion)}</b></p>`;
  $('bracketBody').innerHTML = html;
  const stillIn = !b.champion && b.rounds.at(-1).some((g) => (g.a === me.id || g.b === me.id) && !g.winner);
  $('bracketMsg').textContent = b.champion ? '' : stillIn ? 'Your next match starts in a moment…' : 'Matches are being played…';
  $('bracketBack').hidden = !b.champion;
  if (b.champion === me.id) { try { confetti?.(); } catch {} }
}
$('bracketBack').addEventListener('click', () => { sfx('click'); lastBracket = null; leaveRoom(); });

// ---------- Volume ----------
$('pvpVol').value = bgmVolume();
$('pvpVol').addEventListener('input', () => { lsSet('mapleWordle:bgmVolume', $('pvpVol').value); if (music.gain) music.gain.gain.value = musicLevel(); });

// ---------- How to play ----------
$('infoBody').innerHTML = `
<p>A boss BGM plays from the start and loops until the round's time is up. Answer each question once: picking (or
pressing Enter) locks it in. Nobody sees what's right until the reveal.</p>
<p><b>Damage</b> for a right answer depends on how fast you locked it in (from when your music started):
BGM = 25 + 125 × 0.6<sup>seconds ÷ 10</sup>, rounded up (150 at 0 s, 100 at 10 s, 70 at 20 s, never below 25).
Phase = that × 0.2, title = that × 0.5. Wrong = 0.</p>
<ul>
<li><b>HP</b>: both start with the same HP. Each round, whoever dealt less loses the difference. x2 from round 5, x5 from round 10.</li>
<li><b>Life</b>: get any question wrong (or leave it unanswered) and you lose a life. Everyone out at once: sudden death.</li>
<li><b>First to N</b>: right answers score points (BGM 1, Phase 0.25, Title 0.5). First to the target score wins.</li>
<li><b>Speed Duel</b>: just the BGM question. The fastest right answer wins the round (time, not damage). First to win
more than half the rounds (best of 3, 5 or 7) wins.</li>
<li><b>Boss Raid</b>: everyone vs one boss, each as a class of their choice (every class has its own trait and
three of its skills, plus three skills everyone has: Aeonian Rise, Erda Nova, Power Elixir). Your answers set your
<b>Power</b> for the round: wrong = 0%, right = 100% at 0 s, 80% at 10 s, 68% at 20 s. Every attack is × your Power, so
save your big skills for a track you know. Your main attack is free; skills are picked while the music plays and come
back after their cooldown: the skill's cooldown in the game ÷ 30 s, in rounds (2 minutes = 4 rounds). Skills go off
first, then the boss does the move it showed at the start of the round: an attack on everyone, on one player, a test
(wrong answers get hurt), a shield, a heal, or its ultimate (it charges for a round first; be untouchable, or go down.
The round after, it is worn out and takes +50% damage). Its attacks grow every round, and the last round is its time
limit. At 0 HP you lose a life.</li>
<li><b>Free-for-all</b>: each round, everyone loses HP by how far they were behind the round's top damage.</li>
<li><b>Tournament</b>: a bracket of 1v1 HP matches; a draw goes to a speed tiebreak (fastest right BGM).</li>
</ul>
<p>From the 3rd round in a row where nothing changes, the slowest player loses 100 HP / a life. Round 20 is the last
round: the most HP / lives / points / round wins takes it.</p>`;
$('howBtn').addEventListener('click', () => { $('info').hidden = false; });
$('infoClose').addEventListener('click', () => { $('info').hidden = true; });

// ---------- Start ----------
addEventListener('pagehide', () => { if (net && room && !room.local) net.send('all', room.hostId === me.id ? { t: 'closed', why: 'The host left the room.' } : { t: 'bye' }); });
loadPlace();
loadData().then(() => {
  const code = new URLSearchParams(location.search).get('room');
  lobby();
  if (code && /^[A-Za-z]{4}$/.test(code)) joinRoom(code.toUpperCase());
}).catch(() => lobby('Couldn’t load the BGM list. Try reloading.'));
window.pvpDebug = { get game() { return game; }, get room() { return room; }, get host() { return host; }, dmgAt, DATA: () => DATA, Match, botAnswers, music, cleanLook, botLook, myLook, myInfo, notePvp };
})();

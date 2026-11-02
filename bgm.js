// Guess the Boss - BGM Clip. Hear the start of today's clip from a boss fight's BGM and guess the boss: 6 tries.
// Two modes, each with its own daily answer, streak and stats:
//   Normal (from Oct 21): 7 guesses. Each wrong guess or Skip unlocks more (1 s, 5 s, 10 s, 30 s, 60 s, then the
//     whole track), the clip always starts at 0:00, and there are hints from Boss Wordle's columns: a random one
//     (World, Gender, Region, Phases, HP or Entry Lv) after the 3rd guess, and the Entry Lv on the 6th.
//   Extreme (the original, from Oct 20): 0.5 s, 1 s, 2 s, 5 s, 10 s, 30 s, starting at 0:00 or a random point (50/50).
// When the game is over the whole track unlocks for a bonus guess: which part of the fight it plays in.
let data, bosses, pool, day, live, answer, guesses, bonus, title, over, matches, active;

const $ = (id) => document.getElementById(id);

const STATS_URL = 'https://maplewordle-stats.hanayuki.workers.dev/';
// Mode keys for saves, streak, Archive and the stats Worker ('bgm' is Extreme: it was the only mode at first).
const MODES = { bgmnormal: { name: 'Normal', first: Date.UTC(2026, 9, 21) }, bgm: { name: 'Extreme', first: Date.UTC(2026, 9, 20) } };
let MODE = 'bgmnormal';
const DAY_MS = 86400000;
const today = () => Math.floor(Date.now() / DAY_MS); // resets at 00:00 UTC

// Puzzle #1 is the day the mode opens; before that the page counts down to it.
const firstDay = () => MODES[MODE].first / DAY_MS;
const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// How much of the clip you can hear while making guess n (n = 1..6): Normal's rules, or Extreme's (the original).
const newRules = () => MODE === 'bgmnormal';
const OLD_LIMITS = [0.5, 1, 2, 5, 10, 30];
const NEW_LIMITS = [1, 5, 10, 30, 60];   // then the whole track (at least 60 s; shorter tracks loop)
const maxGuesses = () => newRules() ? 7 : 6;
// For Limbo's alert border (fx.js): guesses left in the game showing.
window.gameLeft = () => (!guesses ? null : { left: maxGuesses() - guesses.length, over });
// Limbo's life count (fx.js): misses (skips too) out of the lives.
window.gameLife = () => (!guesses ? null : { misses: guesses.filter((n) => !isRight(n)).length, max: maxGuesses(), lost: over && !won() });
window.limboDayHud = () => limbo.on && !limbo.leaving;   // without Limbo's HUD: it shows only while Limbo's mashup scene plays
window.limboErosionMax = () => limbo.on && !limbo.leaving;   // while Limbo's mashup scene plays: Erosion 9999 (then back)
const limitAt = (i) => newRules() ? (i < NEW_LIMITS.length ? NEW_LIMITS[i] : Math.max(60, answer.t.len)) : OLD_LIMITS[i];
// The bar is a straight scale (0-30 s, or 0-60 s with the new rules, stretching to the whole track on the last guess),
// so a checkpoint sits where it really is.
const barSeconds = () => !newRules() ? 30 : guesses.length >= maxGuesses() - 1 ? limitAt(maxGuesses() - 1) : 60;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- Daily answer: a boss (same shuffled-cycle rules as the other games), then one of its tracks, then where it starts ----

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
// The pool is every different BGM of every boss. Each is used once per cycle, in a shuffled order; the only rule
// is that the same boss never comes up two days running (even with a different BGM).
// Normal leaves out the special tracks (an "egg" one, like Lucid's Garden of Eternal Dream), and never picks the
// boss Extreme has that day, so the two modes are two different BGMs.
// From Oct 22 Normal also leaves out bosses that are too obscure for it (new, region-only or event ones).
const NORMAL_SKIP = ['Cross', 'Malicia', 'Gerand Darmoor', 'Bellona', 'Julieta', 'Inferno Wolf', 'Yakuza Boss', 'Frenzied Gigatoad', 'Balrog', 'Champion Raid: Draco Isle'];
const NORMAL_SKIP_FROM = Date.UTC(2026, 9, 22) / DAY_MS;
// From Nov 3 Normal also leaves out single BGMs that are too hard for it (boss|track; the boss's other BGMs stay).
const NORMAL_SKIP_TRACKS = [
  'Limbo|7913784723',                                   // Phase 2 - Transition
  'Damien|b60616b256',                                  // Phase 1 / Phase 2 - Cutscene (one track)
  'Lotus|8d6b87e354', 'Lotus|27b2053221', 'Lotus|ec0205bf65',   // Phase 1 / 2 / 3 (Old)
  'Extreme Bigfoot|f715b12dd8',                         // Battle
  'Gollux|afc24cc92c',                                  // Outside Entrance
  'Von Bon|9f6a2758cb', 'Von Bon|a5144e481c',           // Waiting Room, Battle (Eerie)
];
const NORMAL_SKIP_TRACKS_FROM = Date.UTC(2026, 10, 3) / DAY_MS;
// Added later (data/bgm.json boss "since": "YYYY-MM-DD"): its BGMs join the shuffle from that day on, so every day before
// it (the whole Archive) keeps its answer. The "base" schedule is the one without them: it still decides where an egg
// track (Lucid's) lands, and the mashup days, so adding new ones never moves those either.
const sinceDay = (b) => (b.since ? Date.parse(b.since) / DAY_MS : null);
const modePool = (d, base) => (MODE === 'bgm' ? pool
  : pool.filter((e) => !data.tracks[e.track].egg && !(d >= NORMAL_SKIP_FROM && NORMAL_SKIP.includes(e.boss.name))
    && !(d >= NORMAL_SKIP_TRACKS_FROM && NORMAL_SKIP_TRACKS.includes(e.key))))
  .filter((e) => (base ? !e.boss.since : !(sinceDay(e.boss) > d)));
const basePool = () => (basePool.list ??= pool.filter((e) => !e.boss.since));
const JOIN_DAY = () => (JOIN_DAY.d ??= Math.min(Infinity, ...bosses.map(sinceDay).filter((x) => x != null)));
// Extreme's egg tracks keep the day the base schedule gives them (worked out here, never written down anywhere), and
// so does Limbo's mashup day.
function eggPins() {
  if (eggPins.list) return eggPins.list;
  const list = [];
  inMode('bgm', () => {
    const from = firstDay(), eggs = basePool().filter((e) => data.tracks[e.track].egg);
    for (let x = from; x < from + 3 * basePool().length && list.length < eggs.length; x++) {
      const e = entryFor(x, true);
      if (data.tracks[e.track].egg && !list.some((p) => p.entry === e)) list.push({ day: x, entry: e });
    }
  });
  const limbo = limboEggDay();   // Limbo's mashup day: its one-BGM boss stays
  if (limbo != null) list.push({ day: limbo, entry: inMode('bgm', () => entryFor(limbo, true)) });
  return (eggPins.list = list.filter((p) => p.day >= JOIN_DAY()));   // one that already played before: nothing to keep
}
const schedules = {};   // per mode (and base)
function inMode(m, f) { const was = MODE; MODE = m; try { return f(); } finally { MODE = was; } }
function entryFor(d, base = false) {
  const s = schedules[MODE + (base ? '|base' : '')] ??= { days: [], used: new Set() };
  const FIRST_DAY = firstDay();
  while (FIRST_DAY + s.days.length <= d) {
    const day = FIRST_DAY + s.days.length;
    let all = modePool(day, base);
    const prev = s.days[s.days.length - 1];
    const other = MODE === 'bgm' ? null : inMode('bgm', () => entryFor(day, base));   // Extreme's pick that day
    const pins = !base && MODE === 'bgm' && day >= JOIN_DAY() ? eggPins() : [];
    const pinned = pins.find((p) => p.day === day);
    let pick;
    if (pinned) pick = pinned.entry;
    else {
      const waiting = pins.filter((p) => p.day > day);
      all = all.filter((e) => !waiting.some((p) => p.entry === e));   // an egg waits for its own day
      const nextBoss = pins.find((p) => p.day === day + 1)?.entry.boss;   // and its boss isn't on the day before
      let left = all.filter((e) => !s.used.has(e.key));
      if (!left.length) { s.used.clear(); left = all; }                   // cycle done: everything is back in
      const notSame = (list) => list.filter((e) => (!prev || e.boss !== prev.boss) && (!other || e.boss !== other.boss) && e.boss !== nextBoss);
      left = notSame(left).length ? notSame(left) : notSame(all);          // only that boss left: borrow from the next cycle
      pick = left[0];
      let best = Infinity;
      for (const e of left) {
        const v = hash(`${MODE}|${day}|${e.key}`);
        if (v < best) { best = v; pick = e; }
      }
    }
    s.used.add(pick.key);
    s.days.push(pick);
  }
  return s.days[Math.max(0, d - FIRST_DAY)];
}
// Normal: every clip starts at the beginning. Extreme: half the days at the beginning, half at a random second that
// isn't quiet. "The beginning" skips a track's silent lead-in (data/bgm.json "lead", seconds), so the first guess
// isn't spent on silence.
function answerFor(d) {
  let e = entryFor(d);
  // Test build only (tools/dev/dev.js console: /egg lucid): today's Extreme clip is Lucid's Garden of Eternal Dream.
  if (window.devEgg === 'lucid' && MODE === 'bgm' && d === Math.floor(Date.now() / DAY_MS)) e = pool.find((x) => data.tracks[x.track]?.egg === 'lucid') ?? e;
  const boss = e.boss, track = e.track;
  const t = data.tracks[track];
  const h = hash(`${MODE}|${d}|start`);
  const start = newRules() || !(h % 2) ? (t.lead ?? 0) : t.starts[(h >>> 1) % t.starts.length];
  // Some tracks play in more than one boss fight: the other boss shows yellow (close, but not a win).
  const owners = bosses.filter((b) => b.areas.some((a) => a.track === track)).map((b) => b.name);
  const ans = { name: boss.name, boss, track, t, start, owners };
  ans.bonus = bonusFor(ans, d);
  return ans;
}
const GLITCH_PAUSE_FROM = Date.UTC(2026, 9, 26) / DAY_MS;
// Limbo's glitch mashup comes back on one day picked at random among Nov 3 - 9's one-BGM days (moved on Nov 2, before
// any of them was played; a surprise: nothing on the site says which). Picked from the base schedule, and that day
// keeps its base pick (eggPins), so BGMs added later can't move it.
const LIMBO_EGG_FROM = Date.UTC(2026, 10, 3) / DAY_MS, LIMBO_EGG_UNTIL = Date.UTC(2026, 10, 9) / DAY_MS;
function limboEggDay() {
  if (limboEggDay.d !== undefined) return limboEggDay.d;
  const days = [];
  inMode('bgm', () => { for (let x = LIMBO_EGG_FROM; x <= LIMBO_EGG_UNTIL; x++) if (!hasBonus(entryFor(x, true).boss)) days.push(x); });
  return (limboEggDay.d = days.length ? days[hash('bgm|limbo-egg-day|2') % days.length] : null);
}
// The bonus round. A boss with 2+ BGMs: which part of the fight does it play in (any part with that track is right).
// A boss with one BGM usually has none, but each mashup in data/bgm.json "mashups" shows up on one of those days per
// cycle (a cycle is as many days as there are entries): guess whose mashup it is, one guess.
function bonusFor(ans, d) {
  // Test build only (tools/dev/dev.js console: /egg limbo): Limbo's mashup takes over today's Extreme bonus.
  if (window.devEgg === 'limbo' && MODE === 'bgm' && d === Math.floor(Date.now() / DAY_MS)) {
    const m = data.mashups?.find((x) => x.egg === 'limbo');
    if (m) return { kind: 'mashup', mashup: m, right: [m.boss] };
  }
  if (hasBonus(ans.boss)) {
    return { kind: 'area', right: ans.boss.areas.filter((a) => a.track === ans.track).map((a) => a.label) };
  }
  let mashups = data.mashups || [];
  if (!mashups.length || MODE !== 'bgm') return null;   // mashups (and their glitch Easter eggs) are Extreme only
  // From Oct 26 the glitch mashups (an "egg") are out of the rotation for now. Limbo's comes back on one day picked
  // at random among Oct 26 - Nov 13's one-BGM days (a surprise: nothing on the site says which).
  if (d >= GLITCH_PAUSE_FROM) {
    if (d === limboEggDay()) { const m = mashups.find((x) => x.egg === 'limbo'); return { kind: 'mashup', mashup: m, right: [m.boss] }; }
    mashups = mashups.filter((x) => !x.egg);
  }
  const FIRST_DAY = firstDay();
  const n = basePool().length;   // the base schedule's days, so BGMs added later don't move any mashup day
  const cycle = Math.floor((d - FIRST_DAY) / n), from = FIRST_DAY + cycle * n;
  const quiet = [];   // this cycle's one-BGM days, in a shuffled order
  for (let x = from; x < from + n; x++) if (!hasBonus(entryFor(x, true).boss)) quiet.push(x);
  quiet.sort((x, y) => hash(`${MODE}|mashup|${x}`) - hash(`${MODE}|mashup|${y}`));
  const i = quiet.indexOf(d);
  if (i < 0 || i >= mashups.length) return null;
  const m = mashups[(i + cycle) % mashups.length];
  return { kind: 'mashup', mashup: m, right: [m.boss] };
}
const isRight = (name) => name === answer.name;
// Same track, other boss (Horntail / Balrog, Ursus / Inferno Wolf): yellow. Not in Normal from Oct 22, which has none of
// those bosses as answers, so there it's just a miss.
const yellowOn = () => MODE === 'bgm' || day < NORMAL_SKIP_FROM;
const isClose = (name) => yellowOn() && !isRight(name) && answer.owners.includes(name);
const won = () => guesses.some(isRight);

// ---- The player: one locked bar. Play / pause; it stops at what you've unlocked and starts over from there. ----

const VOLUME_KEY = 'mapleWordle:bgmVolume';   // this game's own volume (not the sound button's), 0-100, default 50
const bgmVolume = () => { try { const v = localStorage.getItem(VOLUME_KEY); return v == null ? 50 : Number(v); } catch { return 50; } };
const audio = { ctx: null, gain: null, raw: null, buffer: null, src: null, playing: false, ended: false, pos: 0, t0: 0, p0: 0, timer: 0, id: null };

// What you may listen to right now, in seconds of the track: from the clip's start up to your unlock, or all of it.
const winStart = () => over ? 0 : answer.start;
const winEnd = () => over ? answer.t.len : answer.start + limitAt(Math.min(guesses.length, maxGuesses() - 1));
// The background's music (fx.js) goes quiet while the clip or a mashup plays.
// Once you've played today's clip it stays quiet until the game is over (fx.js then waits for the result sound + 2 s).
window.themeBgmHold = () => audio.playing || (audio.heard && !over) || !!(mashupAudio && !mashupAudio.paused);
const nowPos = () => audio.playing ? audio.p0 + (audio.ctx.currentTime - audio.t0) : audio.pos;

function loadTrack() {
  stopAudio();
  audio.id = answer.track;
  audio.buffer = null;
  audio.ended = false;
  audio.pos = winStart();
  const id = audio.id;
  audio.raw = fetch(`audio/bgm/${id}.mp3${data.tracks[id].v ? '?v=' + data.tracks[id].v : ''}`).then((r) => r.arrayBuffer());   // v: a replaced file
  audio.raw.catch(() => {});
  ensureCtx();
  decoded().catch(() => {});   // decode now, so Play starts right away
}
// The AudioContext can be made before any click (it starts out paused); Play resumes it.
function ensureCtx() {
  if (audio.ctx) return;
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.gain = audio.ctx.createGain();
  audio.gain.gain.value = bgmVolume() / 50;
  audio.gain.connect(audio.ctx.destination);
}
// Decode once there's an AudioContext. Tracks up to 60 s are repeated so the long guesses loop them.
function decoded() {
  if (audio.buffer) return Promise.resolve(audio.buffer);
  if (audio.decoding?.id === audio.id) return audio.decoding.p;
  const id = audio.id;
  const p = decode(id, audio.raw);
  audio.decoding = { id, p };
  p.catch(() => { if (audio.decoding?.p === p) audio.decoding = null; });
  return p;
}
async function decode(id, raw) {
  let buf = await audio.ctx.decodeAudioData((await raw).slice(0));
  if (data.tracks[id].len < 61) {
    const n = Math.ceil(70 / buf.duration);
    const big = audio.ctx.createBuffer(buf.numberOfChannels, buf.length * n, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) for (let k = 0; k < n; k++) big.getChannelData(c).set(buf.getChannelData(c), k * buf.length);
    buf = big;
  }
  if (id === audio.id) audio.buffer = buf;
  return buf;
}
async function play() {
  stopResultSounds();   // the win / lose music stops so you can listen again
  if (mashupAudio) { mashupAudio.pause(); $('mashupPlay').textContent = '▶\uFE0E Play the mashup'; mashupStopped(); }
  ensureCtx();
  audio.ctx.resume();
  const id = audio.id;
  $('play').textContent = '…';
  let buf;
  try { buf = await decoded(); } catch { $('play').textContent = '▶︎'; return; }
  if (id !== audio.id || audio.playing) return;
  // Reached the end of what's unlocked last time: start over from the clip's start.
  if (audio.ended || audio.pos >= winEnd() - 0.02 || audio.pos < winStart()) audio.pos = winStart();
  audio.ended = false;
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(audio.gain);
  src.start(0, audio.pos);
  Object.assign(audio, { src, playing: true, heard: true, t0: audio.ctx.currentTime, p0: audio.pos });
  src.onended = () => { if (audio.src === src) { audio.src = null; audio.playing = false; audio.pos = winEnd(); audio.ended = true; drawBar(); } };
  scheduleEnd();
  drawBar();
  requestAnimationFrame(frame);
  trackEgg();
}
// A track with an "egg" (Lucid's Garden of Eternal Dream) brings in its moving background (fx.js) once it plays after
// today's game is over; it stays for the day. Not on Archive days, and never before the answer is out.
function trackEgg() {
  const egg = live && answer.t.egg;
  if (!egg) return eggScene(null);
  if (over && audio.playing) eggScene(egg);
}
// Stop at the end of what's unlocked (re-timed whenever a guess unlocks more while it plays).
function scheduleEnd() {
  clearTimeout(audio.timer);
  if (!audio.playing) return;
  const left = winEnd() - nowPos();
  audio.timer = setTimeout(() => {
    if (!audio.playing) return;
    if (nowPos() < winEnd() - 0.01) return scheduleEnd();
    stopAudio();
    audio.pos = winEnd();
    audio.ended = true;
    drawBar();
  }, Math.max(0, left * 1000));
}
function pause() {
  if (!audio.playing) return;
  audio.pos = Math.min(nowPos(), winEnd());
  stopAudio();
  drawBar();
}
function stopAudio() {
  clearTimeout(audio.timer);
  const src = audio.src;
  audio.src = null;
  audio.playing = false;
  if (src) { try { src.stop(); } catch {} }
}
function frame() {
  drawBar();
  if (audio.playing) requestAnimationFrame(frame);
}
$('play').addEventListener('click', () => audio.playing ? pause() : play());

// Bar position (%) for a time into the clip: piecewise between the checkpoints (before the end), straight after.
function barAt(t) {
  const whole = over ? answer.t.len : barSeconds();
  return Math.max(0, Math.min(100, t / whole * 100));
}
function drawTicks() {
  const ticks = $('ticks'), labels = $('tickLabels');
  ticks.innerHTML = labels.innerHTML = '';
  if (over) return;
  // A line for every checkpoint still ahead (passed ones disappear: the unlocked part is one plain block).
  // Only your current checkpoint and the end are labelled, since the short ones sit too close to share labels.
  for (let i = 0; i < maxGuesses(); i++) {
    const s = limitAt(i);
    if (i < guesses.length || (i > guesses.length && s === limitAt(i - 1))) continue;
    const at = barAt(s);
    if (at < 100) ticks.appendChild(document.createElement('i')).style.left = at + '%';
    if (i !== guesses.length && i !== maxGuesses() - 1 && limitAt(i + 1) !== s) continue;
    const l = labels.appendChild(document.createElement('span'));
    l.textContent = newRules() && i >= NEW_LIMITS.length ? 'Full' : s + 's';
    l.style.left = at + '%';
    l.className = (i === guesses.length ? 'open' : '') + (at < 8 ? ' start' : '') + (at === 100 ? ' end' : '');
  }
}
let dragAt = null;   // seconds under the mouse while the bar is being dragged (the bar shows that, not the music)
function drawBar() {
  const p = dragAt ?? nowPos();
  const t = over ? p : p - answer.start;
  const at = barAt(Math.max(0, t));
  $('fill').style.width = at + '%';
  $('open').style.width = (over ? 100 : barAt(limitAt(Math.min(guesses.length, maxGuesses() - 1)))) + '%';
  $('markerText').textContent = over ? `${clock(p)} / ${clock(answer.t.len)}` : `${Math.max(0, t).toFixed(1)}s`;   // how far into the clip
  $('play').textContent = audio.playing ? '❚❚' : '▶︎';
  $('track').classList.add('seek');
  placeMarker(at);
}
// The ▼ follows the playhead; the label above it slides along too but stays inside the bar's ends.
function placeMarker(at) {
  const w = $('bar').clientWidth, x = w * at / 100, tw = $('markerText').offsetWidth;
  $('markerArrow').style.left = x + 'px';
  $('markerText').style.left = Math.max(tw / 2, Math.min(w - tw / 2, x)) + 'px';
}
// Click / drag the bar to jump around: during the game only within what you've unlocked, after it anywhere in the track.
let dragging = false;
function barPos(e) {   // the track time (s) under the mouse
  const r = $('bar').getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  return over ? f * answer.t.len : answer.start + f * barSeconds();
}
const unlockedAt = (pos) => over || pos <= winEnd() + 0.01;
function seek(e) {
  const pos = Math.min(barPos(e), over ? winEnd() : winEnd() - 0.05);   // (right at the end would count as 'start over')
  const was = audio.playing;
  stopAudio();
  audio.pos = pos;
  audio.ended = false;
  if (was) play(); else drawBar();
}
// A click jumps once, on press; letting go only jumps again if the bar was dragged somewhere else (jumping twice to the
// same spot replayed the first ~0.1 s, which sounded like a stutter).
let downX = 0;
$('bar').addEventListener('pointerdown', (e) => {
  if (!unlockedAt(barPos(e))) return;   // a part you haven't unlocked yet
  dragging = true; downX = e.clientX; $('bar').setPointerCapture(e.pointerId); seek(e);
});
// While dragging, the green bar, the ▼ and the time follow the mouse; the music jumps there on release.
$('bar').addEventListener('pointermove', (e) => {
  if (!dragging) { $('bar').style.cursor = unlockedAt(barPos(e)) ? 'pointer' : 'not-allowed'; return; }
  if (Math.abs(e.clientX - downX) <= 3) return;
  dragAt = Math.min(barPos(e), winEnd());   // (not past what you've unlocked)
  drawBar();
});
$('bar').addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  dragAt = null;
  if (Math.abs(e.clientX - downX) > 3) seek(e); else drawBar();
});
$('bar').addEventListener('pointercancel', () => { dragging = false; dragAt = null; drawBar(); });

$('bgmVol').value = bgmVolume();
$('bgmVol').addEventListener('input', () => {
  const v = $('bgmVol').value;
  try { localStorage.setItem(VOLUME_KEY, v); } catch {}
  if (audio.gain) audio.gain.gain.value = v / 50;
  $('bgmVol').title = `BGM volume ${v}%`;
});
$('bgmVol').title = `BGM volume ${bgmVolume()}%`;

// ---- Guesses: one bar each, newest on top. Green = right, yellow = that boss also plays this track (still a miss),
// red = wrong, grey = skipped. Nothing else is revealed. ----

const byName = (n) => bosses.find((e) => e.name === n);
function guessRow(name) {
  const bar = document.createElement('div');
  if (!name) {
    bar.className = 'gbar grey';
    bar.appendChild(document.createElement('span')).textContent = 'Skipped';
  } else {
    const g = byName(name);
    bar.className = 'gbar ' + (isRight(name) ? 'green' : isClose(name) ? 'yellow' : 'red');
    const img = document.createElement('img');
    img.src = g.image;
    img.alt = '';
    bar.appendChild(img);
    bar.appendChild(document.createElement('span')).textContent = name;
  }
  $('rows').prepend(bar);
  return bar;
}

// ---- Game flow ----

const saveKey = (d = day) => `mapleWordle:${MODE}:${d}`;
function load(d) {
  try { const s = JSON.parse(localStorage.getItem(saveKey(d))); return { g: s?.g || [], bonus: s?.bonus ?? null, title: s?.title ?? null }; }
  catch { return { g: [], bonus: null, title: null }; }
}
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify({ g: guesses, bonus, title })); } catch {}
}
// Bonus 2 (from Oct 21, both modes): guess the track's title from every title we have, A-Z. The title stays hidden
// everywhere until it's answered.
const TITLE_FROM = Date.UTC(2026, 9, 21) / DAY_MS;
// Not on mashup days: those already have their special bonus.
const titleOnFor = (d, ans) => d >= TITLE_FROM && ans?.bonus?.kind !== 'mashup' && !ans?.t.noTitle;   // noTitle: the title gives it away
const titleOn = () => titleOnFor(day, answer);
const titleShown = () => !titleOn() || title != null;
const titleRight = () => title != null && title === answer.t.title;

function start(d) {
  audio.heard = false;
  live = d == null || d === today();
  day = live ? today() : d;
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === MODE);
  $('eggNote').hidden = MODE !== 'bgmnormal' || day < firstDay();   // Normal never has the Easter eggs
  if (day < firstDay()) return notOpenYet();
  for (const id of ['player', 'skip', 'picker', 'pickrow', 'infostrip', 'rows']) $(id).hidden = false;
  firstTryGlow(false);
  answer = answerFor(day);
  showPuzzle(day - firstDay() + 1, dateLabel(day), live);   // the info strip (fx.js)
  $('today').hidden = live;
  guesses = [];
  over = false;
  $('rows').innerHTML = '';
  $('stats').hidden = true;
  $('share').hidden = true;
  $('guess').value = '';
  closeList();
  const saved = load(day);
  bonus = saved.bonus;
  title = saved.title;
  for (const name of saved.g) if (!over) record(name);
  loadTrack();
  themeBgmNow();   // another mode or day: the background's music comes straight back (if this one doesn't keep it quiet)
  renderEnd();
  if (!over) updateStatus();
  else loadStats();
  renderStreak();
  noteResult();
  limboAutoStart();
}
// Back on Limbo's mashup day with its bonus still unanswered (another game or mode, then back here): the mashup and
// Limbo's scene start by themselves. A browser only lets sound start on its own once you've clicked on the site; if it
// says no, they start on your first click or key press instead (not one on Play itself).
let limboWait = null;
function limboAutoStart() {
  if (limboWait) { removeEventListener('pointerdown', limboWait, true); removeEventListener('keydown', limboWait, true); limboWait = null; }
  const ready = () => isLimboEgg() && over && bonus == null && !limbo.on && !(mashupAudio && !mashupAudio.paused);
  if (!ready()) return;
  const go = () => { if (ready()) $('mashupPlay').click(); };
  const probe = new Audio(`audio/bgm/${answer.bonus.mashup.file}.mp3?v=2`);
  probe.volume = 0;
  probe.play().then(() => { probe.pause(); go(); }, () => {
    limboWait = (e) => {
      if (e.type === 'keydown' && e.target.closest?.('input, textarea')) return;
      removeEventListener('pointerdown', limboWait, true);
      removeEventListener('keydown', limboWait, true);
      limboWait = null;
      if (!e.target.closest?.('#mashupPlay, #play')) setTimeout(go);
    };
    addEventListener('pointerdown', limboWait, true);
    addEventListener('keydown', limboWait, true);
  });
}
// Before launch day the page is empty apart from this note.
function notOpenYet() {
  // Clear anything left from the other mode's game (its result, mesos line and Everyone's results).
  for (const id of ['player', 'pickrow', 'bonus', 'infostrip', 'rows', 'share', 'hintWrap', 'stats', 'bonusCall']) $(id).hidden = true;
  over = false;
  stopMashup();
  eggScene(null);
  mesoGain(MODE, day, false);
  firstTryGlow(false);
  document.querySelector('.game').classList.remove('diamond', 'rainbow', 'limborb');
  $('status').textContent = `${MODES[MODE].name} mode opens at the next reset!`;
}

// Normal's hints, in a Boss Wordle-style table of this boss's columns: a random one opens after the 3rd guess, the
// Entry Lv on the 6th (or another random one, if the first was already the Entry Lv). All of them open at the end.
const HINT_COLS = ['World', 'Gender', 'Region', 'Phases', 'HP', 'Entry Lv'];
function renderHints() {
  $('hintWrap').hidden = !newRules();
  if (!newRules()) return;
  const c = answer.boss.clues || {};
  const keys = Object.keys(c).sort((x, y) => hash(`${MODE}|${day}|clue|${x}`) - hash(`${MODE}|${day}|clue|${y}`));
  // A new column opens after every wrong guess from the 3rd on, in a random order, with the Entry Lv always the one that
  // opens for your 6th guess: 1 hint on guess 4, 2 on guess 5, 3 (with Entry Lv) on guess 6, 4 on guess 7.
  const order = keys.filter((k) => k !== 'Entry Lv');
  if (c['Entry Lv']) order.splice(2, 0, 'Entry Lv');
  const open = new Set(order.slice(0, Math.max(0, guesses.length - 2)));
  const row = $('hintRow');
  row.innerHTML = '';
  for (const k of HINT_COLS) {
    const td = row.insertCell();
    const shown = over || open.has(k);
    td.textContent = shown ? c[k] ?? 'Unknown' : '🔒';
    td.className = shown ? 'green' : 'grey';
  }
}
function updateStatus(msg) {
  $('status').textContent = msg || `Guess ${guesses.length + 1} of ${maxGuesses()}`;
  renderHints();
}

function record(name) {
  guesses.push(name || '');
  guessRow(name);
  over = won() || guesses.length >= maxGuesses();
  if (over) {
    const also = answer.owners.filter((n) => n !== answer.name);
    const alsoText = also.length ? ` (this track also plays in ${also.join(', ')})` : '';
    updateStatus(won() ? `Correct! It was ${answer.name}${alsoText}, in ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}.`
      : `Out of guesses! It was ${answer.name}${alsoText}.`);
  } else updateStatus();
  $('share').hidden = !over;
  $('picker').hidden = $('skip').hidden = over;
  if (over) closeList();
  firstTryGlow(over && guesses.length === 1 && won());
}

// Signed in: the account is checked first, so a device that's behind can't guess (account.js).
if (window.acctGate) guess = acctGate(guess);
function guess(name) {
  if (over) return;
  if (name) {
    const g = byName(name);
    if (!g || guesses.includes(g.name)) return;
  }
  $('guess').value = '';
  $('guess').blur();   // unfocus, so the next click on the box opens the list again
  closeList();
  record(name);
  save();
  $('rows').firstElementChild.classList.add('flip');   // the new bar flips in
  limboGuess($('rows').firstElementChild, !name || !isRight(name));   // Limbo's wrong guess effect, if it's on (skips too)
  const flipMs = flipUntil(FLIP_TIME);
  if (over) fxHold(flipMs);   // the win border and "+mesos" wait for the flip
  for (const el of [$('status'), $('share')]) revealAfter(el, flipMs);
  if (!over) {
    // Stopped at the end of what was unlocked: Play now carries on from there into the new part (not from the start).
    if (audio.ended && audio.pos < winEnd() - 0.02) audio.ended = false;
    scheduleEnd();   // playing now: it keeps going up to the new unlock
    drawTicks();
    drawBar();
    return;
  }
  // Game over: the whole track unlocks (a playing BGM keeps playing) and the bonus round opens.
  drawTicks();
  setTimeout(renderEnd, flipMs);
  scheduleEnd();
  limboOver(won(), flipMs);   // Limbo's alert border: gone on a win, its fail screen on a loss
  if (won()) {
    setTimeout(() => confetti(guesses.length === 1), flipMs);
    // First-guess win: Mayrin's Descend plays (the BGM pauses for it). Other wins: no music, the BGM is already playing.
    if (guesses.length === 1 && live) { pause(); resultSound(true, flipMs, 'firstTry'); }
  } else if (live) {
    pause();
    resultSound(false, flipMs);   // Star Force Destroy
  }
  if (!audio.playing) { audio.pos = 0; audio.ended = false; drawBar(); }   // not playing: the full track starts from 0:00
  updateStreak();
  loadStats();
  noteResult();
}

// ---- After the game: the whole track and the bonus guess ----

// Bonus round only for bosses with more than one BGM (every part of the fight is listed, even ones sharing a track).
const hasBonus = (boss) => new Set(boss.areas.map((a) => a.track)).size > 1;
// First-guess win: 💎 (blue glow) with at least one bonus right, 🌈 (rainbow) with both Bonus 1 and Bonus 2 right.
// No bonus right (or no bonus that day) stays ⭐.
function badgeFor(d, ans, g, b, t) {
  if (g.length !== 1 || g[0] !== ans.name) return '';
  const tests = [];
  if (ans.bonus) tests.push(b != null && ans.bonus.right.includes(b));
  if (titleOnFor(d, ans)) tests.push(t != null && t === ans.t.title);
  const right = tests.filter(Boolean).length;
  if (!right) return '';
  return tests.length === 2 && right === 2 ? '🌈' : '💎';
}
const badge = () => over ? badgeFor(day, answer, guesses, bonus, title) : '';
// Limbo's mashup day: a first-guess win with the mashup answered right gets Limbo's border (in place of 💎 / 🌈's),
// on the game box and on the Archive row (style.css).
const limboRingFor = (ans, g, b) => g.length === 1 && g[0] === ans.name && ans.bonus?.mashup?.egg === 'limbo' && b != null && ans.bonus.right.includes(b);
const rowStyleFor = (m, d) => inMode(m, () => { const s = load(d); return limboRingFor(answerFor(d), s.g, s.bonus) ? 'limborb' : ''; });
function renderEnd() {
  queueMicrotask(limboDragons);   // a wrong bonus answer from before gets its dragon back (fx.js)
  $('bonusResult').dataset.limbo = isLimboEgg() ? '1' : '';   // Limbo's mashup: its dragon shows for everyone
  renderHints();
  drawTicks();
  drawBar();
  const game = document.querySelector('.game'), lb = over && limboRingFor(answer, guesses, bonus);
  game.classList.toggle('diamond', !lb && badge() === '💎');
  const ring = game.classList.toggle('rainbow', !lb && badge() === '🌈') | game.classList.toggle('limborb', lb);
  if (ring && !game.querySelector('.rbring')) {   // its spinning ring + glow (style.css)
    game.insertAdjacentHTML('beforeend', '<div class="rbglow"><i></i></div><div class="rbring"><i></i></div>');
  }
  const box = $('bonus');
  box.hidden = !over;
  // A bonus still waiting: a call-out under the result (click jumps to it) and a glow on the box, until it's answered.
  const waiting = over && ((!!answer.bonus && bonus == null) || (titleOn() && title == null));
  $('bonusCall').hidden = !waiting;
  box.classList.toggle('waiting', waiting);
  box.classList.toggle('limbo', isLimboEgg());   // Limbo's mashup: the waiting glow in Limbo's colours (style.css)
  if (mashupKey !== `${MODE}|${day}|${answer.bonus?.mashup?.file}`) stopMashup();   // keeps playing through a redraw (e.g. answering the bonus)
  trackEgg();
  if (!over) return;
  // Limbo's mashup answered (right or wrong) on the day itself: Limbo's set is in the shop (the Archive doesn't count)
  if (live && answer.bonus?.mashup?.egg === 'limbo' && bonus != null) shopUnlock('limboSub');
  if (answer.bonus?.mashup?.egg === 'limbo' && bonus != null) shopUnlock('limboP1', live);   // Limbo Background: the Archive too, at full price
  renderTitle();
  const b = answer.bonus;
  const trackLine = titleShown() ? `The track is "${answer.t.title}".` : '';
  $('mashupRow').hidden = b?.kind !== 'mashup';
  $('limboTip').hidden = !isLimboEgg() || bonus != null;   // Limbo's mashup only, until it's answered
  if (isLimboEgg()) { limboLoad(); limboCutLoad(); limboFailLoad(); TRANS_CLIPS.forEach(cfxClip); }   // ready before Play is pressed (Limbo's cutscene for a right answer, its fail screen for a wrong one, its transition for a long pause)
  $('bonusAsk').hidden = !b || bonus != null;
  if (!b) {
    $('bonusTitle').textContent = 'The whole track is unlocked';
    $('bonusHelp').textContent = 'Click the bar to jump around.';
    $('bonusResult').textContent = titleOn() ? '' : trackLine;
    markResult($('bonusResult'), '');
    return;
  }
  const mash = b.kind === 'mashup', n = titleOn() ? ' 1' : '';
  $('bonusTitle').textContent = mash ? `Bonus${n}: Whose BGM mashup is this?` : `Bonus${n}: Where does this BGM play?`;
  $('bonusHelp').textContent = mash ? `Listen to the mashup and guess the boss. One guess only! (Today's track is unlocked above too.)`
    : 'The whole track is unlocked now.\nClick the bar to jump around.';
  if (bonus == null) {
    const sel = $('bonusPick');
    sel.innerHTML = '';
    sel.hidden = mash;   // a mashup asks for a boss: the search box below instead of a dropdown
    $('bossField').hidden = !mash;
    $('bossPick').value = '';
    $('bossList').hidden = true;
    if (!mash) {
      sel.appendChild(new Option('Pick a part of the fight…', ''));
      for (const l of [...new Set(answer.boss.areas.map((a) => a.label))]) sel.appendChild(new Option(l, l));
    }
    $('bonusResult').textContent = '';
    markResult($('bonusResult'), '');
  } else {
    const ok = b.right.includes(bonus);
    $('bonusResult').textContent = (ok ? 'Correct! ' : `Wrong! You picked ${bonus}.\n`) + (mash
      ? `It's ${b.mashup.boss}'s BGM.`
      : `It plays in: ${b.right.join(', ')}.` + (titleOn() ? '' : `\n${trackLine}`));   // with Bonus 2, the title shows there
    markResult($('bonusResult'), ok ? 'right' : 'wrong');
  }
  // Limbo's mashup answered: its shop items are in the shop now (shown until the shop is opened).
  $('limboShop').hidden = !(isLimboEgg() && bonus != null && shopNew().some((t) => t.startsWith('limbo')));
}
// The mashup plays on its own little player in the bonus box (Play on the main bar stops it, and the other way round).
// A mashup with an "egg" also changes the page while it plays: the background fades to that boss's map (and stays for
// the day) and the screen glitches until the mashup stops.
// The mashup has its own bar under its Play button (click it to jump around); the main bar stays on today's track.
// On an egg mashup that bar glitches every 0.5-2 s: it jumps to a random point of the mashup for a moment, then snaps
// back (only the bar: the sound keeps playing).
let mashupAudio = null, mashupKey = null, mashupHeard = null;   // heard: the mashup played at least once (its id)
const mashupId = () => `${MODE}|${day}|${answer.bonus?.mashup?.file}`;   // key: mode | day | file of the mashup loaded
const eggBar = { on: false, raf: 0, timer: 0, fake: null };
function glitch(on) {
  document.body.classList.toggle('glitch', on);
  clearTimeout(eggBar.timer);
  eggBar.fake = null;
  $('mashupTrack').classList.remove('barglitch');
  eggBar.on = on;
  if (!on) return drawMashupBar();
  const jump = () => {
    eggBar.timer = setTimeout(() => {
      eggBar.fake = Math.random();
      $('mashupTrack').classList.add('barglitch');
      eggBar.timer = setTimeout(() => { eggBar.fake = null; $('mashupTrack').classList.remove('barglitch'); jump(); }, 120 + Math.random() * 180);
    }, 500 + Math.random() * 1500);
  };
  jump();
}
// The mashup's own bar: drawn every frame while it plays (and once when it stops).
function drawMashupBar() {
  const len = mashupAudio?.duration, cur = mashupAudio?.currentTime ?? 0;
  const at = len ? (eggBar.fake ?? cur / len) * 100 : 0;
  $('mashupFill').style.width = at + '%';
  $('mashupTime').textContent = len ? `${clock(at / 100 * len)} / ${clock(len)}` : clock(0);
}
function mashupTick() {
  cancelAnimationFrame(eggBar.raf);
  drawMashupBar();
  if (mashupAudio && !mashupAudio.paused) eggBar.raf = requestAnimationFrame(mashupTick);
}
$('mashupBar').addEventListener('click', (e) => {   // jump around in the mashup
  const len = mashupAudio?.duration;
  if (!len) return;
  const r = $('mashupBar').getBoundingClientRect();
  mashupAudio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * len;
  drawMashupBar();
});
// Limbo's Easter egg (the glitched Abyss of Truth mashup, today only): Play brings in Limbo's Subconscious. A full-screen
// fade-in covers the page, and under it the alert border, the glitch and the map come in; every few seconds a glitch
// swaps the map between its light and dark side (white border on the light side, black on the dark). Until the bonus is
// answered, pausing stops the glitch and the swapping (the map stays), and every 5 s paused Limbo's shark transition jumps
// to the other side (limboPause). Answering it plays it out: the border fades, the glitch stops, a full-screen
// fade-out covers the page, the music stops and the normal background is back. After that, Play brings it in again and
// Pause plays it out. Clips in video/limbo/: <name>.webm (see-through), .webp for Safari (fx.js SAFARI).
const LIMBO_CLIPS = { 'screen-in': 1740, 'screen-out': 900, 'border-white-in': 840, 'border-white-loop': 0, 'border-white-out': 300,
  'border-black-in': 840, 'border-black-loop': 0, 'border-black-out': 300 };   // ms (0: loops)
const LIMBO_COVERED = 780;   // ms into the fade-in while the page is still fully covered
const limbo = { on: false, leaving: false, jumping: false, dark: false, swap: 0, wait: 0, blobs: null };   // wait: paused, until the next transition
const isLimboEgg = () => answer?.bonus?.mashup?.egg === 'limbo';   // the Archive gets Limbo's scene too (only the shop unlock is today-only)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function limboLoad() {   // fetched once (on a Limbo mashup day, when the bonus shows up)
  limbo.blobs ??= Promise.all(Object.keys(LIMBO_CLIPS).map((n) => fetch(`video/limbo/${n}.${SAFARI ? 'webp' : 'webm'}`)
    .then((r) => (r.ok ? r.blob() : null)).catch(() => null).then((b) => [n, b]))).then(Object.fromEntries);
  return limbo.blobs;
}
async function limboClip(name, parent, cls) {   // plays one clip (from its first frame); resolves when it's over
  const blob = (await limboLoad())[name];
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  const el = document.createElement(SAFARI ? 'img' : 'video');
  el.disablePictureInPicture = true;   // no picture-in-picture button on hover
  el.className = cls;
  if (!SAFARI) Object.assign(el, { muted: true, playsInline: true, autoplay: true, loop: !LIMBO_CLIPS[name] });
  el.src = url;
  el.dataset.url = url;
  parent.appendChild(el);
  el.play?.().catch(() => {});
  return el;
}
const limboGone = (el) => { if (!el) return; URL.revokeObjectURL(el.dataset.url); el.remove(); };
function limboSide(dark) {   // light / dark map, and the matching border loop
  limbo.dark = dark;
  $('limbobg')?.classList.toggle('dark', dark);
  for (const el of document.querySelectorAll('#limboborder .loop')) el.hidden = el.dataset.dark !== String(dark);
}
async function limboEnter() {
  if (limbo.on) return;
  limbo.on = true;
  await limboLoad();
  if (!limbo.on || limbo.leaving) return;
  const screen = await limboClip('screen-in', document.body, 'limboscreen');
  await sleep(LIMBO_COVERED);
  if (!limbo.on) return limboGone(screen);
  // under the cover: the map, the border and the glitch
  const bg = Object.assign(document.createElement('div'), { id: 'limbobg' });
  bg.innerHTML = '<div class="light"></div><div class="dark"></div>';
  bg.querySelector('.light').appendChild(bgVideo('limbo'));   // the moving maps (fx.js), the same as the shop's backgrounds
  bg.querySelector('.dark').appendChild(bgVideo('limboDark'));
  bg.querySelector('.dark').appendChild(themeScreen(THEME_SCREEN.limboDark)).classList.add('on');
  document.body.prepend(bg);
  const border = Object.assign(document.createElement('div'), { id: 'limboborder' });
  document.body.appendChild(border);
  for (const dark of [false, true]) {
    const el = await limboClip(`border-${dark ? 'black' : 'white'}-loop`, border, 'loop');
    if (el) { el.dataset.dark = String(dark); el.hidden = true; }
  }
  limboSide(false);
  const enter = await limboClip('border-white-in', border, 'in');
  for (const el of border.querySelectorAll('.loop')) el.hidden = true;   // the entrance first, then the loop
  glitch(true);
  setTimeout(() => { limboGone(enter); if (limbo.on && !limbo.leaving) limboSide(limbo.dark); }, LIMBO_CLIPS['border-white-in']);
  setTimeout(() => limboGone(screen), LIMBO_CLIPS['screen-in'] - LIMBO_COVERED + 50);
  if (mashupAudio?.paused) limboPause();   // paused while it was coming in
  else limboSwaps();
}
function limboSwaps() {   // every 5-8 s the map swaps sides (a flash), while the mashup plays
  clearTimeout(limbo.swap);
  limbo.swap = setTimeout(() => {
    if (!limbo.on || limbo.leaving) return;
    bgSwapClass(true);
    setTimeout(() => limboSide(!limbo.dark), 120);   // swap in the middle of the flash
    setTimeout(() => bgSwapClass(false), 320);
    limboSwaps();
  }, 5000 + Math.random() * 3000);
}
// Paused (bonus not answered yet): the glitch and the swapping stop, the map stays. Every 5 s it stays paused, Limbo's
// shark transition (fx.js limboSharks) jumps to the other side (Play can't be clicked while it plays). Play: it carries on.
function limboPause() {
  clearTimeout(limbo.swap);
  clearTimeout(limbo.wait);
  glitch(false);
  limbo.wait = setTimeout(limboJump, 5000);
}
async function limboJump() {
  if (!limbo.on || limbo.leaving || limbo.jumping || (mashupAudio && !mashupAudio.paused)) return;
  limbo.jumping = true;
  Object.assign($('mashupPlay'), { disabled: true, title: 'Wait for the transition to finish' });
  await limboSharks(() => {   // the sides swap under a white flash, like Limbo mode's
    if (!limbo.on || limbo.leaving) return;
    const w = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'limbowhite' }));
    limboSide(!limbo.dark);
    setTimeout(() => w.classList.add('out'), 85);
    setTimeout(() => w.remove(), 250);
  }, Math.min(1, bgmVolume() / 50) * 0.5);
  limbo.jumping = false;
  Object.assign($('mashupPlay'), { disabled: false, title: '' });
  if (limbo.on && !limbo.leaving && mashupAudio?.paused) limbo.wait = setTimeout(limboJump, 5000);
}
function limboResume() {
  clearTimeout(limbo.wait);
  glitch(true);
  limboSwaps();
}
// fail (a wrong answer): the border's exit, then Limbo's fail screen in that side's colour instead of the fade.
async function limboExit(fail = false) {
  if (!limbo.on || limbo.leaving) {   // already gone / on its way out (the mashup stopped first): the fail screen still shows
    if (fail) { limboTransitionStop(); limboFail(limbo.dark ? 'black' : 'white'); }
    return;
  }
  limbo.leaving = true;
  clearTimeout(limbo.swap);
  clearTimeout(limbo.wait);
  Object.assign($('mashupPlay'), { disabled: true, title: 'Wait for the transition to finish' });
  bgSwapClass(false);
  glitch(false);
  const border = $('limboborder');
  for (const el of border?.querySelectorAll('.loop') ?? []) el.hidden = true;
  const out = border && await limboClip(`border-${limbo.dark ? 'black' : 'white'}-out`, border, 'out');
  await sleep(LIMBO_CLIPS['border-white-out']);
  limboGone(out);
  for (const el of border?.querySelectorAll('video, img') ?? []) limboGone(el);
  border?.remove();
  if (fail) {
    limboTransitionStop();
    limboFail(limbo.dark ? 'black' : 'white');
    await sleep(600);   // the fail screen covers the page by now: Limbo's scene goes underneath it
    if (mashupAudio && !mashupAudio.paused) mashupAudio.pause();
    $('mashupPlay').textContent = '▶\uFE0E Play the mashup';
    $('limbobg')?.remove();
    limbo.on = limbo.leaving = false;
    Object.assign($('mashupPlay'), { disabled: false, title: '' });
    return;
  }
  const screen = await limboClip('screen-out', document.body, 'limboscreen');
  await sleep(LIMBO_CLIPS['screen-out']);   // the page is covered now
  if (mashupAudio && !mashupAudio.paused) mashupAudio.pause();
  $('mashupPlay').textContent = '▶\uFE0E Play the mashup';
  $('limbobg')?.remove();
  if (screen) { screen.style.transition = 'opacity 0.4s ease'; screen.style.opacity = 0; }
  await sleep(450);
  limboGone(screen);
  limbo.on = limbo.leaving = false;
  Object.assign($('mashupPlay'), { disabled: false, title: '' });
}
function limboKill() {   // right away (another day or mode)
  clearTimeout(limbo.swap);
  clearTimeout(limbo.wait);
  Object.assign($('mashupPlay'), { disabled: false, title: '' });
  bgSwapClass(false);
  for (const el of document.querySelectorAll('#limboborder video, #limboborder img, .limboscreen')) limboGone(el);
  $('limboborder')?.remove();
  $('limbobg')?.remove();
  limbo.on = limbo.leaving = false;
}
// The mashup stopped (paused, ended, or the main Play took over): a glitch egg's screen glitch stops, except Limbo's
// before the bonus is answered.
function mashupStopped() {
  if (limbo.on) {
    if (bonus != null) { if (!(isLimboEgg() && !answer.bonus.right.includes(bonus))) limboExit(); }   // a wrong answer's own exit (with the fail screen) is on its way
    else if (!limbo.leaving) limboPause();
  }
  else glitch(false);
}
function stopMashup() {
  if (mashupAudio) { mashupAudio.pause(); mashupAudio = null; }
  cancelAnimationFrame(eggBar.raf);
  mashupKey = null;
  $('mashupPlay').textContent = '▶\uFE0E Play the mashup';
  glitch(false);
  limboKill();
  const egg = answer.bonus?.mashup?.egg;
  for (const c of [...document.body.classList]) if (c.startsWith('egg-') && c !== `egg-${egg}`) document.body.classList.remove(c);
}
$('mashupPlay').addEventListener('click', () => {
  if (mashupAudio && !mashupAudio.paused) { mashupAudio.pause(); $('mashupPlay').textContent = '▶\uFE0E Play the mashup'; mashupStopped(); return; }
  if (limbo.leaving || limbo.jumping) return;   // let Limbo's fade-out / transition finish first
  pause();
  stopResultSounds();
  const m = answer.bonus.mashup;
  if (!mashupAudio) {
    mashupAudio = new Audio(`audio/bgm/${m.file}.mp3?v=2`);   // v: remade in stereo 128k
    mashupKey = `${MODE}|${day}|${m.file}`;
    mashupAudio.addEventListener('ended', () => { $('mashupPlay').textContent = '▶\uFE0E Play the mashup'; mashupStopped(); });
  }
  mashupAudio.volume = Math.min(1, bgmVolume() / 50);
  mashupAudio.play().catch(() => {});
  mashupAudio.addEventListener('playing', mashupTick, { once: true });
  mashupHeard = mashupKey;
  if (bonus == null && $('bonusResult').textContent === 'Play the mashup first!') { $('bonusResult').textContent = ''; markResult($('bonusResult'), ''); }
  $('mashupPlay').textContent = '❚❚ Pause the mashup';
  if (isLimboEgg()) { if (limbo.on) limboResume(); else limboEnter(); }
  else if (m.egg && live) { document.body.classList.add(`egg-${m.egg}`); glitch(true); }   // the Easter egg is for today only, not the Archive
});
$('limboShop').querySelector('button').addEventListener('click', openShop);
// A bonus answer line's colour (right / wrong / none); only that class changes, so Limbo's dragon (fx.js) keeps its own.
function markResult(el, cls) {
  el.classList.remove('right', 'wrong');
  if (cls) el.classList.add(cls);
}
function renderTitle() {
  $('titleBox').hidden = !titleOn();
  if (!titleOn()) return;
  $('titleHead').textContent = answer.bonus ? 'Bonus 2: What\'s this BGM called?' : 'Bonus: What\'s this BGM called?';
  $('titleAsk').hidden = title != null;
  const res = $('titleResult');
  if (title == null) {
    $('titlePick').value = '';
    $('titleList').hidden = true;
    res.textContent = '';
    markResult(res, '');
  } else {
    res.textContent = (titleRight() ? 'Correct!' : `Wrong! You picked "${title}".`) + `\nThe track is "${answer.t.title}".`;
    markResult(res, titleRight() ? 'right' : 'wrong');
  }
}
// Bonus 2's box: type to search every BGM title (A-Z); click one (or arrow keys + Enter) to fill it in, then Guess.
const allTitles = () => (allTitles.list ??= [...new Set(Object.values(data.tracks).map((x) => x.title))].sort((x, y) => x.localeCompare(y)));
let titleActive = -1;
function titleMatches() {
  const q = $('titlePick').value.trim().toLowerCase();
  return q ? allTitles().filter((t) => t.toLowerCase().includes(q)) : allTitles();
}
function showTitleList() {
  const box = $('titleList'), items = titleMatches();
  box.innerHTML = '';
  items.forEach((t, i) => {
    const el = box.appendChild(Object.assign(document.createElement('div'), { className: 'item' + (i === titleActive ? ' active' : ''), textContent: t }));
    el.addEventListener('mousedown', (e) => { e.preventDefault(); $('titlePick').value = t; box.hidden = true; });
    el.addEventListener('mousemove', () => { if (titleActive !== i) { titleActive = i; showTitleList(); } });
  });
  if (!items.length) box.appendChild(Object.assign(document.createElement('div'), { className: 'none', textContent: 'No title matches' }));
  box.hidden = false;
  box.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
$('titlePick').addEventListener('input', () => { titleActive = 0; showTitleList(); });
$('titlePick').addEventListener('focus', () => { titleActive = -1; showTitleList(); });
$('titlePick').addEventListener('blur', () => { $('titleList').hidden = true; });
$('titlePick').addEventListener('keydown', (e) => {
  const n = titleMatches().length;
  if (e.key === 'ArrowDown') { e.preventDefault(); titleActive = Math.min(n - 1, titleActive + 1); showTitleList(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); titleActive = Math.max(0, titleActive - 1); showTitleList(); }
  else if (e.key === 'Escape') $('titleList').hidden = true;
  else if (e.key === 'Enter') {
    e.preventDefault();
    const m = titleMatches();
    const exact = m.find((t) => t.toLowerCase() === $('titlePick').value.trim().toLowerCase());
    const pick = exact ?? m[Math.max(0, titleActive)];
    if (pick && (exact || titleActive >= 0 || m.length === 1)) { $('titlePick').value = pick; $('titleList').hidden = true; }
  }
});
$('titleGo').addEventListener('click', () => titleGuess());
if (window.acctGate) titleGuess = acctGate(titleGuess);
function titleGuess() {
  const typed = $('titlePick').value.trim().toLowerCase();
  const pick = allTitles().find((t) => t.toLowerCase() === typed);   // has to be one of the titles
  if (!pick) { if (typed) showTitleList(); return; }
  if (title != null || !over) return;
  title = pick;
  save();
  renderEnd();
  limboGuess($('titleResult'), !titleRight());   // Limbo's wrong guess effect (if it's on): the dragon eats a wrong answer
  noteResult();
  sendTitle(titleRight());
}
// The mashup bonus's box: the same boss search as the main guess box (photos, A-Z); click one (or arrow keys + Enter) to
// fill it in, then Guess.
let bossActive = -1;
function bossMatches() {
  const q = $('bossPick').value.trim().toLowerCase();
  return bosses.filter((e) => e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
}
function showBossList() {
  const box = $('bossList'), items = bossMatches();
  box.innerHTML = '';
  items.forEach((e, i) => {
    const el = box.appendChild(document.createElement('div'));
    el.className = 'item' + (i === bossActive ? ' active' : '');
    el.appendChild(Object.assign(document.createElement('img'), { src: e.image, alt: '' }));
    el.appendChild(document.createElement('span')).textContent = e.name;
    el.addEventListener('mousedown', (ev) => { ev.preventDefault(); $('bossPick').value = e.name; box.hidden = true; });
    el.addEventListener('mousemove', () => { if (bossActive !== i) setBossActive(i); });
  });
  if (!items.length) box.appendChild(Object.assign(document.createElement('div'), { className: 'none', textContent: 'No boss matches' }));
  box.hidden = false;
  box.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
function setBossActive(i) {   // just moves the highlight, so the photos aren't redrawn
  bossActive = i;
  [...$('bossList').children].forEach((el, j) => el.classList.toggle('active', j === i));
  $('bossList').children[i]?.scrollIntoView({ block: 'nearest' });
}
$('bossPick').addEventListener('input', () => { bossActive = 0; showBossList(); });
$('bossPick').addEventListener('focus', () => { bossActive = -1; showBossList(); });
$('bossPick').addEventListener('blur', () => { $('bossList').hidden = true; });
$('bossPick').addEventListener('keydown', (e) => {
  const m = bossMatches();
  if (e.key === 'ArrowDown') { e.preventDefault(); if ($('bossList').hidden) showBossList(); setBossActive(Math.min(m.length - 1, bossActive + 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setBossActive(Math.max(0, bossActive - 1)); }
  else if (e.key === 'Escape') $('bossList').hidden = true;
  else if (e.key === 'Enter') {
    e.preventDefault();
    const exact = m.find((x) => x.name.toLowerCase() === $('bossPick').value.trim().toLowerCase());
    const pick = exact ?? m[Math.max(0, bossActive)];
    if (pick && (exact || bossActive >= 0 || m.length === 1)) { $('bossPick').value = pick.name; $('bossList').hidden = true; }
  }
});
$('bonusGo').addEventListener('click', (window.acctGate ?? ((f) => f))(() => {
  const mash = answer.bonus?.kind === 'mashup';
  const typed = $('bossPick').value.trim().toLowerCase();
  const pick = mash ? bosses.find((e) => e.name.toLowerCase() === typed)?.name : $('bonusPick').value;   // has to be one of the bosses
  if (!pick && mash && typed) { showBossList(); return; }
  if (!pick || bonus != null || !over) return;
  if (answer.bonus.mashup?.egg && mashupHeard !== mashupId()) {   // the special mashups: listen first, then guess
    $('bonusResult').textContent = 'Play the mashup first!';
    markResult($('bonusResult'), 'wrong');
    $('mashupPlay').classList.remove('nudge'); void $('mashupPlay').offsetWidth; $('mashupPlay').classList.add('nudge');
    return;
  }
  bonus = pick;
  save();
  renderEnd();
  const ok = answer.bonus.right.includes(pick);
  // Limbo's wrong guess effect (if it's on) eats a wrong answer; on Limbo's mashup everyone gets to see it.
  limboGuess($('bonusResult'), !ok, undefined, isLimboEgg());
  if (ok && isLimboEgg()) limboWin();   // right: Limbo's cutscene (nothing else)
  noteResult();
  if (!ok && isLimboEgg()) {
    // Wrong: the dragon swallows the answer and stays a moment, then the border's exit and Limbo's fail screen in
    // the side showing then (dark: black, light: white; limboExit). Without Limbo's scene on: just the fail screen.
    const failAt = 500 + GFX_RUSH + 200, here = MODE + day;   // (+ the border's 0.3 s exit: the fail screen 0.5 s sooner than before)
    setTimeout(() => {
      if (MODE + day !== here) return;   // (gone to another mode or day meanwhile)
      if (limbo.on) limboExit(true);
      else { limboTransitionStop(); limboFail(limbo.dark ? 'black' : 'white'); }
    }, failAt);
  } else if (limbo.on) limboExit();
  sendBonus(ok);
  if (live) answer.t.unlock?.bonus?.forEach((t) => shopUnlock(t));   // any bonus guess on the day (right or wrong): shows up in the meso shop (fx.js)
}));   // (checked first, like a guess)

// ---- Boss picker (every boss, A-Z) ----

const search = (q) => bosses
  .filter((e) => !guesses.includes(e.name) && e.name.toLowerCase().includes(q))
  .sort((a, b) => a.name.localeCompare(b.name));
function openList() {
  matches = search($('guess').value.trim().toLowerCase());
  active = 0;
  renderList();
}
function renderList() {
  const list = $('list');
  list.innerHTML = '';
  matches.forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'item' + (i === active ? ' active' : '');
    const img = document.createElement('img');
    img.src = e.image;
    img.alt = '';
    div.appendChild(img);
    div.appendChild(document.createElement('span')).textContent = e.name;
    div.addEventListener('mousedown', (ev) => ev.preventDefault());
    div.addEventListener('click', (ev) => { if (ev.button === 0) guess(e.name); });
    div.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
    list.appendChild(div);
  });
  list.hidden = matches.length === 0 || over;
  list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
function setActive(i) {
  active = i;
  [...$('list').children].forEach((el, j) => el.classList.toggle('active', j === i));
}
function closeList() {
  matches = [];
  $('list').hidden = true;
}
$('guess').addEventListener('input', openList);
$('guess').addEventListener('focus', openList);
$('guess').addEventListener('click', openList);
$('guess').addEventListener('blur', closeList);
$('guess').addEventListener('keydown', (e) => {
  const open = !$('list').hidden;
  if (e.key === 'ArrowDown' && open) { active = Math.min(active + 1, matches.length - 1); renderList(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && open) { active = Math.max(active - 1, 0); renderList(); e.preventDefault(); }
  else if (e.key === 'Escape') closeList();
  else if (e.key === 'Enter' && open && matches[active]) guess(matches[active].name);
});
$('skip').addEventListener('click', () => guess(null));   // a skip uses up a guess and unlocks more

// ---- Everyone's results (6 guesses: bars 1-6 and X) ----

async function loadStats() {
  if (!STATS_URL) return;
  const sentKey = `mapleWordle:sent:${MODE}:${day}`;
  const url = `${STATS_URL}?mode=${MODE}&day=${day}`;
  const shownDay = day, shownMode = MODE;
  let sent = false;
  try { sent = localStorage.getItem(sentKey) === '1'; } catch {}
  try {
    const score = won() ? guesses.length : 'X';
    const res = sent ? await fetch(url)
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
    if (!res.ok) return;
    const { counts, bonus: bonusCounts } = await res.json();
    if (!sent) { try { localStorage.setItem(sentKey, '1'); } catch {} }
    let titleCounts = null;
    if (titleOn()) { try { titleCounts = (await (await fetch(`${STATS_URL}?mode=${titleMode()}&day=${day}`)).json()).bonus; } catch {} }
    if (day === shownDay && MODE === shownMode && over) renderStats(counts, String(score), bonusCounts, titleCounts);
  } catch {}
}
// The bonus answer is sent once per day too (only when there was a bonus), then the results are drawn again with it.
const titleMode = () => MODE === 'bgm' ? 'bgmtitle' : 'bgmntitle';
async function sendTitle(ok) {
  if (!STATS_URL || !live) return loadStats();
  const sentKey = `mapleWordle:sentTitle:${MODE}:${day}`;
  try { if (localStorage.getItem(sentKey) === '1') return loadStats(); } catch {}
  try {
    const res = await fetch(`${STATS_URL}?mode=${titleMode()}&day=${day}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bonus: ok }) });
    if (res.ok) { try { localStorage.setItem(sentKey, '1'); } catch {} }
  } catch {}
  loadStats();
}
async function sendBonus(ok) {
  if (!STATS_URL || !live) return loadStats();
  const sentKey = `mapleWordle:sentBonus:${MODE}:${day}`;
  try { if (localStorage.getItem(sentKey) === '1') return loadStats(); } catch {}
  try {
    const res = await fetch(`${STATS_URL}?mode=${MODE}&day=${day}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bonus: ok }) });
    if (res.ok) { try { localStorage.setItem(sentKey, '1'); } catch {} }
  } catch {}
  loadStats();
}
function renderStats(counts, mine, bonusCounts, titleCounts) {
  const bars = [...Array.from({ length: maxGuesses() }, (_, i) => String(i + 1)), 'X'].map((k) => ({ key: k, n: counts[k] || 0 }));
  const total = bars.reduce((n, b) => n + b.n, 0);
  $('statsTitle').textContent = `Everyone's results - ${total} player${total === 1 ? '' : 's'}`;
  const box = $('statsBars');
  box.innerHTML = '';
  for (const b of bars) {
    const pct = total ? Math.round(b.n * 100 / total) : 0;
    const row = document.createElement('div');
    row.className = 'statrow' + (b.key === mine ? ' mine' : '');
    row.innerHTML = `<span class="label"></span><span class="track"><span class="bar"></span></span><span class="pct"></span>`;
    row.querySelector('.label').textContent = b.key;
    row.querySelector('.bar').style.width = pct + '%';
    row.querySelector('.pct').textContent = pct + '%';
    box.appendChild(row);
  }
  const solved = total - (counts.X || 0);
  // Bonus row: how many of the players who answered the bonus got it right (bosses with one BGM have no bonus).
  // Green if you got it right too.
  const right = bonusCounts?.right || 0, tried = right + (bonusCounts?.wrong || 0);
  let bonusLine = '';
  if (answer.bonus && tried) {
    const pct = Math.round(right * 100 / tried);
    const mineRight = bonus != null && answer.bonus.right.includes(bonus);
    const row = document.createElement('div');
    row.className = 'statrow bonusrow' + (mineRight ? ' mine' : '');
    row.innerHTML = `<span class="label">Bonus</span><span class="track"><span class="bar"></span></span><span class="pct"></span>`;
    row.querySelector('.bar').style.width = pct + '%';
    row.querySelector('.pct').textContent = pct + '%';
    box.appendChild(row);
    bonusLine = `\nBonus: ${pct}% guessed it right (${tried} answer${tried === 1 ? '' : 's'})`;
  }
  // Title row (Bonus 2), the same way.
  const tRight = titleCounts?.right || 0, tTried = tRight + (titleCounts?.wrong || 0);
  if (titleOn() && tTried) {
    const pct = Math.round(tRight * 100 / tTried);
    const row = document.createElement('div');
    row.className = 'statrow bonusrow' + (titleRight() ? ' mine' : '');
    row.innerHTML = `<span class="label">Title</span><span class="track"><span class="bar"></span></span><span class="pct"></span>`;
    row.querySelector('.bar').style.width = pct + '%';
    row.querySelector('.pct').textContent = pct + '%';
    box.appendChild(row);
    bonusLine += `\nTitle: ${pct}% guessed it right (${tTried} answer${tTried === 1 ? '' : 's'})`;
  }
  $('statsAvg').textContent = total ? `${Math.round(solved * 100 / total)}% solved${bonusLine}` : '';
  $('stats').hidden = false;
  revealStats($('stats'));   // (fx.js: after your result, when the game just ended)
}

// ---- Win streak (today's puzzle only): +1 per win, back to 0 on a loss ----

const streakKey = () => `mapleWordle:streak:${MODE}`;
function loadStreak() {
  try { return JSON.parse(localStorage.getItem(streakKey())) || { count: 0, last: null }; } catch { return { count: 0, last: null }; }
}
function updateStreak() {
  if (!live) return;
  const s = loadStreak();
  if (s.last === day) return;
  s.count = won() ? s.count + 1 : 0;
  s.last = day;
  try { localStorage.setItem(streakKey(), JSON.stringify(s)); } catch {}
  renderStreak();
}
function renderStreak() {
  $('streak').textContent = `${loadStreak().count} 🔥`;
}

// ---- Archive ----

// Archive (the shared window is archive.js): this page's result for a day. 💎 = first guess and the bonus right.
const resultFor = (m, d) => inMode(m, () => resultIn(d));
function resultIn(d) {
  const saved = load(d), ans = answerFor(d);
  const n = saved.g.length, w = saved.g.includes(ans.name);
  if (w) {
    const b = badgeFor(d, ans, saved.g, saved.bonus, saved.title);
    return `Won ${n}/${maxGuesses()}` + (b ? ' ' + b : '');
  }
  if (n >= maxGuesses()) return 'Lost';
  return n ? `In progress (${n}/${maxGuesses()})` : 'Not played';
}
window.archiveHere = { modes: Object.keys(MODES), current: () => MODE, result: resultFor, style: rowStyleFor, play: (m, d) => { MODE = m; start(d); } };
const noteResult = () => {
  if (over) {
    try { localStorage.setItem(`mapleWordle:result:${MODE}:${day}`, resultFor(MODE, day)); } catch {}
    try { if (rowStyleFor(MODE, day)) localStorage.setItem(`mapleWordle:style:${MODE}:${day}`, rowStyleFor(MODE, day)); } catch {}   // for the Archive on other pages
    earnGame(MODE, day, resultFor(MODE, day));   // mesos (fx.js): Archive days pay 10%
    if (bonus != null && answer.bonus?.right.includes(bonus)) earnBonus(MODE, day, !!answer.bonus.mashup?.egg);
    if (titleRight()) earnBonus(MODE, day, false, 'title');
  }
  mesoGain(MODE, day, over);   // the spinning "+mesos" under the result (game + bonus)
  // Shop items this track's day finds: "win" by winning on the day itself, "winAny" by winning (the Archive too), "play" by
  // finishing it, won or lost (the Archive too), "guess" by guessing at all on the day itself. From the Archive: unlocked, but full price (fx.js).
  if (over && won()) {
    if (live) answer.t.unlock?.win?.forEach((t) => shopUnlock(t));
    answer.t.unlock?.winAny?.forEach((t) => shopUnlock(t, live));
  }
  if (over) answer.t.unlock?.play?.forEach((t) => shopUnlock(t, live));
  if (live && guesses.length) answer.t.unlock?.guess?.forEach((t) => shopUnlock(t));   // "guess": any guess on the day itself
};
const closeArchive = () => { $('archive').hidden = true; };

// ---- Share ----

function shareText() {
  const ok = bonus != null && !!answer.bonus?.right.includes(bonus);
  const first = won() && guesses.length === 1;
  // First-guess win: just a star, or just the diamond / rainbow if the bonuses were right too.
  const grid = first ? (badge() || '⭐')
    : guesses.map((n) => !n ? '⬛' : isRight(n) ? '🟩' : isClose(n) ? '🟨' : '🟥').join('') + '⬜'.repeat(maxGuesses() - guesses.length);
  // An Easter egg mashup's bonus, answered (right or wrong): "SPECIAL 🔥🔥🔥" in place of the Bonus line, always shown.
  const special = bonus != null && !!answer.bonus?.mashup?.egg;
  const extra = special ? '\nSPECIAL 🔥🔥🔥' + (title == null || grid === '💎' || grid === '🌈' ? '' : `\nTitle ${titleRight() ? '✅' : '❌'}`)
    : grid === '💎' || grid === '🌈' ? ''
    : (bonus == null ? '' : `\nBonus ${ok ? '✅' : '❌'}`) + (title == null ? '' : `\nTitle ${titleRight() ? '✅' : '❌'}`);
  return [`${isHalloween(day) ? '🎃 ' : ''}Mapledle - BGM Clip (${MODES[MODE].name}) #${day - firstDay() + 1} ${won() ? guesses.length : 'X'}/${maxGuesses()}`,
    grid + extra, 'https://ima.moe/maplewordle/bgm/' + (MODE === 'bgmnormal' ? 'normal' : 'extreme')].join('\n');
}
function share() {
  const text = shareText();
  const done = () => { $('share').textContent = 'Copied!'; setTimeout(() => { $('share').textContent = 'Share'; }, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const t = document.createElement('textarea');
  t.value = text;
  document.body.appendChild(t);
  t.select();
  document.execCommand('copy');
  t.remove();
  done();
}

// ---- Page furniture shared with the other games (changelog, peeking characters, windows) ----

async function openChangelog() {
  const body = $('changelogBody');
  if (!body.childElementCount) {
    try {
      const md = await (await fetch('CHANGELOG.md', { cache: 'no-cache' })).text();
      buildChangelog(body, md);   // fx.js
    } catch {
      body.textContent = 'Could not load the changelog.';
    }
  }
  $('changelog').hidden = false;
}
const peekTimers = new Map();
$('credit').addEventListener('click', () => {
  const allPeek = document.querySelectorAll('.peekclip');
  const who = allPeek[Math.floor(Math.random() * allPeek.length)];
  who.classList.add('up');
  clearTimeout(peekTimers.get(who));
  peekTimers.set(who, setTimeout(() => who.classList.remove('up'), 350 + 2000));
});
const DISCORD = 'https://discord.gg/f22H4UJ';
function openInfo() {
  const rules = [
    `Guess which boss fight today's BGM is from in <b>${maxGuesses()}</b> guesses. New clip daily at 00:00 UTC.`,
    ...(newRules() ? [
      'Each wrong guess or Skip plays more:<ul><li>1s</li><li>5s</li><li>10s</li><li>30s</li><li>60s</li><li>Then all</li></ul>',
      'Each miss from your 3rd guess on reveals a boss clue.',
    ] : [
      'Each wrong guess or Skip plays more:<ul><li>0.5s</li><li>1s</li><li>2s</li><li>5s</li><li>10s</li><li>Then 30s</li></ul>',
    ]),
    'It can be from any part of the boss fight, including Waiting Room and Loot Room.',
    ...(newRules() ? [] : ['The clip can start at the beginning of the track or anywhere up to near its end.']),
    ...(yellowOn() ? ['🟨 Yellow:<ul><li>Right track</li><li>Wrong boss (still a miss)</li></ul>'] : []),
    '<b>Bonus:</b> guess which part of the fight it plays in (after the game).',
    ...(titleOn() ? ["<b>Bonus 2:</b> guess the track's title."] : []),
    ...(titleOn() ? ['Win in 1 guess for:<ul><li>⭐ The win</li><li>💎 Plus a bonus</li><li>🌈 Plus both bonuses</li></ul>'] : ['Win in 1 guess for a ⭐. Get the bonus too for a 💎.']),
    'Streak resets when you lose.',
  ];
  $('infoBody').innerHTML = '<ul>' + rules.map((x) => `<li>${x}</li>`).join('') + '</ul>' +
    `<p class="warn">⚠️ Spot a mistake? Report it on <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>.</p>`;
  $('info').hidden = false;
}
$('infoBtn').addEventListener('click', openInfo);
$('infoClose').addEventListener('click', () => { $('info').hidden = true; });
$('version').addEventListener('click', openChangelog);
$('changelogClose').addEventListener('click', () => { $('changelog').hidden = true; });
$('share').addEventListener('click', share);
$('archiveClose').addEventListener('click', closeArchive);
for (const id of ['archive', 'changelog', 'info']) {
  $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).hidden = true; });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  $('changelog').hidden = true;
  $('info').hidden = true;
  closeArchive();
});
$('today').addEventListener('click', () => start());
$('bonusCall').addEventListener('click', () => $('bonus').scrollIntoView({ behavior: 'smooth', block: 'center' }));
for (const b of document.querySelectorAll('#modes button')) {
  b.addEventListener('click', () => {
    if (b.dataset.mode === MODE || !pool) return;
    pause();
    MODE = b.dataset.mode;
    start(live ? undefined : day);
  });
}

function tick() {
  if (pool && live && today() !== day) start();
  const s = Math.floor(((today() + 1) * DAY_MS - Date.now()) / 1000);
  showTimer(today() < firstDay() ? `${MODES[MODE].name} opens in` : 'Next BGM in', s);
}

fetch('data/bgm.json', { cache: 'no-cache' }).then((r) => r.json())
  .then((d) => {
    data = d;
    bosses = d.bosses;
    // One entry per different BGM of each boss: a track that plays in several parts of the same fight counts once.
    // Two bosses sharing a track (Horntail / Balrog) each get their own entry. Bosses without a BGM are never the answer.
    pool = bosses.flatMap((b) => [...new Set(b.areas.map((a) => a.track))].map((track) => ({ key: `${b.name}|${track}`, boss: b, track })));
    tick();
    setInterval(tick, 1000);
    const req = window.archiveRequest;   // opened from the archive on another page
    if (req && req.mode in MODES) { MODE = req.mode; start(req.day); }
    else { if (today() < firstDay()) MODE = 'bgm'; start(); }   // Normal isn't open yet: show Extreme
  })
  .catch(() => { $('status').textContent = 'Could not load the BGM data.'; });
addEventListener('resize', () => { if (answer) drawBar(); });

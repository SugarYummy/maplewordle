// Guess the Boss - BGM Clip. Hear the start of today's clip from a boss fight's BGM and guess the boss: 6 tries.
// Each wrong guess or Skip unlocks more of the clip: 0.5 s, 1 s, 2 s, 5 s, 10 s, then 30 s.
// The clip is the very start of the track or a random point in it (50/50, the same for everyone that day).
// When the game is over the whole track unlocks for a bonus guess: which part of the fight it plays in.
let data, bosses, pool, day, live, answer, guesses, bonus, over, matches, active;

const $ = (id) => document.getElementById(id);

const STATS_URL = 'https://maplewordle-stats.hanayuki.workers.dev/';
const MODE = 'bgm';     // key for saves, streak and the stats Worker
const DAY_MS = 86400000;
const today = () => Math.floor(Date.now() / DAY_MS); // resets at 00:00 UTC

// Puzzle #1 is the day BGM Clip opens (the Oct 20 reset); before that the page counts down to it.
const FIRST_DAY = Date.UTC(2026, 9, 20) / DAY_MS;
const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// How much of the clip you can hear while making guess n (n = 1..6).
const LIMITS = [0.5, 1, 2, 5, 10, 30];
const MAX = LIMITS.length;
// The bar is a straight 0-30 s scale, so a checkpoint sits where it really is (0.5 s is a sliver at the start).
const BAR_SECONDS = LIMITS[LIMITS.length - 1];
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- Daily answer: a boss (same shuffled-cycle rules as the other games), then one of its tracks, then where it starts ----

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
// The pool is every different BGM of every boss. Each is used once per cycle, in a shuffled order; the only rule
// is that the same boss never comes up two days running (even with a different BGM).
let schedule;
function entryFor(d) {
  schedule ??= { days: [], used: new Set() };
  const s = schedule;
  while (FIRST_DAY + s.days.length <= d) {
    const day = FIRST_DAY + s.days.length;
    const prev = s.days[s.days.length - 1];
    let left = pool.filter((e) => !s.used.has(e.key));
    if (!left.length) { s.used.clear(); left = pool; }                  // cycle done: everything is back in
    const notSame = (list) => list.filter((e) => !prev || e.boss !== prev.boss);
    left = notSame(left).length ? notSame(left) : notSame(pool);         // only that boss left: borrow from the next cycle
    let pick = left[0], best = Infinity;
    for (const e of left) {
      const v = hash(`${MODE}|${day}|${e.key}`);
      if (v < best) { best = v; pick = e; }
    }
    s.used.add(pick.key);
    s.days.push(pick);
  }
  return s.days[Math.max(0, d - FIRST_DAY)];
}
// Half the days start at 0:00, the other half at a random second that isn't quiet and leaves 30 s to play.
function answerFor(d) {
  const e = entryFor(d);
  const boss = e.boss, track = e.track;
  const t = data.tracks[track];
  const h = hash(`${MODE}|${d}|start`);
  const start = h % 2 ? t.starts[(h >>> 1) % t.starts.length] : 0;
  // Some tracks play in more than one boss fight: the other boss shows yellow (close, but not a win).
  const owners = bosses.filter((b) => b.areas.some((a) => a.track === track)).map((b) => b.name);
  const ans = { name: boss.name, boss, track, t, start, owners };
  ans.bonus = bonusFor(ans, d);
  return ans;
}
// The bonus round. A boss with 2+ BGMs: which part of the fight does it play in (any part with that track is right).
// A boss with one BGM usually has none, but each mashup in data/bgm.json "mashups" shows up on one of those days per
// cycle (a cycle is as many days as there are entries): guess whose mashup it is, one guess.
function bonusFor(ans, d) {
  if (hasBonus(ans.boss)) {
    return { kind: 'area', right: ans.boss.areas.filter((a) => a.track === ans.track).map((a) => a.label) };
  }
  const mashups = data.mashups || [];
  if (!mashups.length) return null;
  const cycle = Math.floor((d - FIRST_DAY) / pool.length), from = FIRST_DAY + cycle * pool.length;
  const quiet = [];   // this cycle's one-BGM days, in a shuffled order
  for (let x = from; x < from + pool.length; x++) if (!hasBonus(entryFor(x).boss)) quiet.push(x);
  quiet.sort((x, y) => hash(`${MODE}|mashup|${x}`) - hash(`${MODE}|mashup|${y}`));
  const i = quiet.indexOf(d);
  if (i < 0 || i >= mashups.length) return null;
  const m = mashups[(i + cycle) % mashups.length];
  return { kind: 'mashup', mashup: m, right: [m.boss] };
}
const isRight = (name) => name === answer.name;
const isClose = (name) => !isRight(name) && answer.owners.includes(name);   // same track, other boss
const won = () => guesses.some(isRight);

// ---- The player: one locked bar. Play / pause; it stops at what you've unlocked and starts over from there. ----

const VOLUME_KEY = 'mapleWordle:bgmVolume';   // this game's own volume (not the sound button's), 0-100, default 50
const bgmVolume = () => { try { const v = localStorage.getItem(VOLUME_KEY); return v == null ? 50 : Number(v); } catch { return 50; } };
const audio = { ctx: null, gain: null, raw: null, buffer: null, src: null, playing: false, ended: false, pos: 0, t0: 0, p0: 0, timer: 0, id: null };

// What you may listen to right now, in seconds of the track: from the clip's start up to your unlock, or all of it.
const winStart = () => over ? 0 : answer.start;
const winEnd = () => over ? answer.t.len : answer.start + LIMITS[Math.min(guesses.length, MAX - 1)];
const nowPos = () => audio.playing ? audio.p0 + (audio.ctx.currentTime - audio.t0) : audio.pos;

function loadTrack() {
  stopAudio();
  audio.id = answer.track;
  audio.buffer = null;
  audio.ended = false;
  audio.pos = winStart();
  const id = audio.id;
  audio.raw = fetch(`audio/bgm/${id}.mp3`).then((r) => r.arrayBuffer());
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
// Decode once there's an AudioContext. Tracks shorter than 30 s are repeated so the last guess loops them.
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
  if (data.tracks[id].loop) {
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
  if (mashupAudio) { mashupAudio.pause(); $('mashupPlay').textContent = '▶\uFE0E Play the mashup'; glitch(false); }
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
  Object.assign(audio, { src, playing: true, t0: audio.ctx.currentTime, p0: audio.pos });
  src.onended = () => { if (audio.src === src) { audio.src = null; audio.playing = false; audio.pos = winEnd(); audio.ended = true; drawBar(); } };
  scheduleEnd();
  drawBar();
  requestAnimationFrame(frame);
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
  const whole = over ? answer.t.len : BAR_SECONDS;
  return Math.max(0, Math.min(100, t / whole * 100));
}
function drawTicks() {
  const ticks = $('ticks'), labels = $('tickLabels');
  ticks.innerHTML = labels.innerHTML = '';
  if (over) return;
  // A line for every checkpoint still ahead (passed ones disappear: the unlocked part is one plain block).
  // Only your current checkpoint and the 30 s end are labelled, since the short ones sit too close to share labels.
  LIMITS.forEach((s, i) => {
    if (i < guesses.length) return;
    const at = barAt(s);
    if (at < 100) ticks.appendChild(document.createElement('i')).style.left = at + '%';
    if (i !== guesses.length && i !== LIMITS.length - 1) return;
    const l = labels.appendChild(document.createElement('span'));
    l.textContent = s + 's';
    l.style.left = at + '%';
    l.className = (i === guesses.length ? 'open' : '') + (at < 8 ? ' start' : '') + (at === 100 ? ' end' : '');
  });
}
function drawBar() {
  const p = nowPos();
  const t = over ? p : p - answer.start;
  const at = barAt(Math.max(0, t));
  $('fill').style.width = at + '%';
  $('open').style.width = (over ? 100 : barAt(LIMITS[Math.min(guesses.length, MAX - 1)])) + '%';
  $('markerText').textContent = over ? `${clock(p)} / ${clock(answer.t.len)}` : `${Math.max(0, t).toFixed(1)}s`;   // how far into the clip
  $('play').textContent = audio.playing ? '❚❚' : '▶︎';
  $('track').classList.toggle('seek', over);
  placeMarker(at);
}
// The ▼ follows the playhead; the label above it slides along too but stays inside the bar's ends.
function placeMarker(at) {
  const w = $('bar').clientWidth, x = w * at / 100, tw = $('markerText').offsetWidth;
  $('markerArrow').style.left = x + 'px';
  $('markerText').style.left = Math.max(tw / 2, Math.min(w - tw / 2, x)) + 'px';
}
// Bonus round only: click / drag the bar to jump anywhere in the track.
let dragging = false;
function seek(e) {
  if (!over) return;
  const r = $('bar').getBoundingClientRect();
  const pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * answer.t.len;
  const was = audio.playing;
  stopAudio();
  audio.pos = pos;
  audio.ended = false;
  if (was) play(); else drawBar();
}
$('bar').addEventListener('pointerdown', (e) => { if (!over) return; dragging = true; $('bar').setPointerCapture(e.pointerId); seek(e); });
$('bar').addEventListener('pointermove', (e) => { if (dragging) { const r = $('bar').getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); $('fill').style.width = x * 100 + '%'; placeMarker(x * 100); } });
$('bar').addEventListener('pointerup', (e) => { if (dragging) { dragging = false; seek(e); } });

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
  try { const s = JSON.parse(localStorage.getItem(saveKey(d))); return { g: s?.g || [], bonus: s?.bonus ?? null }; } catch { return { g: [], bonus: null }; }
}
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify({ g: guesses, bonus })); } catch {}
}

function start(d) {
  live = d == null || d === today();
  day = live ? today() : d;
  if (day < FIRST_DAY) return notOpenYet();
  for (const id of ['player', 'skip', 'picker', 'pickrow', 'timer', 'streak', 'rows']) $(id).hidden = false;
  firstTryGlow(false);
  answer = answerFor(day);
  showPuzzle(day - FIRST_DAY + 1, dateLabel(day), live);   // the info strip (fx.js)
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
  for (const name of saved.g) if (!over) record(name);
  loadTrack();
  renderEnd();
  if (!over) updateStatus();
  else loadStats();
  renderStreak();
  noteResult();
}
// Before launch day the page is empty apart from this note.
function notOpenYet() {
  for (const id of ['player', 'pickrow', 'bonus', 'infostrip', 'rows', 'share']) $(id).hidden = true;
  $('status').textContent = 'Check back after reset for the Official release!';
}

function updateStatus(msg) {
  $('status').textContent = msg || `Guess ${guesses.length + 1} of ${MAX}`;
}

function record(name) {
  guesses.push(name || '');
  guessRow(name);
  over = won() || guesses.length >= MAX;
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
  const flipMs = FLIP_TIME;
  for (const el of [$('status'), $('share')]) revealAfter(el, flipMs);
  if (!over) {
    scheduleEnd();   // playing now: it keeps going up to the new unlock
    drawTicks();
    drawBar();
    return;
  }
  // Game over: the whole track unlocks (a playing BGM keeps playing) and the bonus round opens.
  drawTicks();
  setTimeout(renderEnd, flipMs);
  scheduleEnd();
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
// First guess + bonus right: the game box glows blue (diamond) instead of gold.
const diamond = () => over && guesses.length === 1 && won() && bonus != null && !!answer.bonus?.right.includes(bonus);
function renderEnd() {
  drawTicks();
  drawBar();
  document.querySelector('.game').classList.toggle('diamond', diamond());
  const box = $('bonus');
  box.hidden = !over;
  stopMashup();
  if (!over) return;
  const b = answer.bonus;
  $('mashupRow').hidden = b?.kind !== 'mashup';
  $('bonusAsk').hidden = !b || bonus != null;
  if (!b) {
    $('bonusTitle').textContent = 'The whole track is unlocked';
    $('bonusHelp').textContent = 'Click the bar to jump around.';
    $('bonusResult').textContent = `The track is "${answer.t.title}".`;
    $('bonusResult').className = '';
    return;
  }
  const mash = b.kind === 'mashup';
  $('bonusTitle').textContent = mash ? 'Bonus: Whose BGM mashup is this?' : 'Bonus: Where does this BGM play?';
  $('bonusHelp').textContent = mash ? `Listen to the mashup and guess the boss. One guess only! (Today's track is unlocked above too.)`
    : 'The whole track is unlocked now. Click the bar to jump around.';
  if (bonus == null) {
    const sel = $('bonusPick');
    sel.innerHTML = '';
    if (mash) {
      sel.appendChild(new Option('Pick a boss…', ''));
      for (const o of [...bosses].sort((x, y) => x.name.localeCompare(y.name))) sel.appendChild(new Option(o.name, o.name));
    } else {
      sel.appendChild(new Option('Pick a part of the fight…', ''));
      for (const l of [...new Set(answer.boss.areas.map((a) => a.label))]) sel.appendChild(new Option(l, l));
    }
    $('bonusResult').textContent = '';
    $('bonusResult').className = '';
  } else {
    const ok = b.right.includes(bonus);
    $('bonusResult').textContent = (ok ? 'Correct! ' : `Wrong! You picked ${bonus}. `) + (mash
      ? `It's ${b.mashup.boss}'s BGM. Today's track was "${answer.t.title}".`
      : `It plays in: ${b.right.join(', ')}. The track is "${answer.t.title}".`);
    $('bonusResult').className = ok ? 'right' : 'wrong';
  }
}
// The mashup plays on its own little player in the bonus box (Play on the main bar stops it, and the other way round).
// A mashup with an "egg" also changes the page while it plays: the background fades to that boss's map (and stays for
// the day) and the screen glitches until the mashup stops.
let mashupAudio = null;
function glitch(on) { document.body.classList.toggle('glitch', on); }
function stopMashup() {
  if (mashupAudio) { mashupAudio.pause(); mashupAudio = null; }
  $('mashupPlay').textContent = '▶\uFE0E Play the mashup';
  glitch(false);
  const egg = answer.bonus?.mashup?.egg;
  for (const c of [...document.body.classList]) if (c.startsWith('egg-') && c !== `egg-${egg}`) document.body.classList.remove(c);
}
$('mashupPlay').addEventListener('click', () => {
  if (mashupAudio && !mashupAudio.paused) { mashupAudio.pause(); $('mashupPlay').textContent = '▶\uFE0E Play the mashup'; glitch(false); return; }
  pause();
  stopResultSounds();
  const m = answer.bonus.mashup;
  if (!mashupAudio) {
    mashupAudio = new Audio(`audio/bgm/${m.file}.mp3`);
    mashupAudio.addEventListener('ended', () => { $('mashupPlay').textContent = '▶\uFE0E Play the mashup'; glitch(false); });
  }
  mashupAudio.volume = Math.min(1, bgmVolume() / 50);
  mashupAudio.play().catch(() => {});
  $('mashupPlay').textContent = '❚❚ Pause the mashup';
  if (m.egg) { document.body.classList.add(`egg-${m.egg}`); glitch(true); }
});
$('bonusGo').addEventListener('click', () => {
  const pick = $('bonusPick').value;
  if (!pick || bonus != null || !over) return;
  bonus = pick;
  save();
  renderEnd();
  noteResult();
  const ok = answer.bonus.right.includes(pick);
  sendBonus(ok);
  // A glitch mashup's bonus right on today's puzzle unlocks its map as a theme (fx.js); the Archive doesn't count.
  if (ok && live && answer.bonus.mashup?.egg) unlockTheme(answer.bonus.mashup.egg);
});

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
  const shownDay = day;
  let sent = false;
  try { sent = localStorage.getItem(sentKey) === '1'; } catch {}
  try {
    const score = won() ? guesses.length : 'X';
    const res = sent ? await fetch(url)
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
    if (!res.ok) return;
    const { counts, bonus: bonusCounts } = await res.json();
    if (!sent) { try { localStorage.setItem(sentKey, '1'); } catch {} }
    if (day === shownDay && over) renderStats(counts, String(score), bonusCounts);
  } catch {}
}
// The bonus answer is sent once per day too (only when there was a bonus), then the results are drawn again with it.
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
function renderStats(counts, mine, bonusCounts) {
  const bars = [...LIMITS.map((_, i) => String(i + 1)), 'X'].map((k) => ({ key: k, n: counts[k] || 0 }));
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
  $('statsAvg').textContent = total ? `${Math.round(solved * 100 / total)}% solved${bonusLine}` : '';
  $('stats').hidden = false;
}

// ---- Win streak (today's puzzle only): +1 per win, back to 0 on a loss ----

const streakKey = `mapleWordle:streak:${MODE}`;
function loadStreak() {
  try { return JSON.parse(localStorage.getItem(streakKey)) || { count: 0, last: null }; } catch { return { count: 0, last: null }; }
}
function updateStreak() {
  if (!live) return;
  const s = loadStreak();
  if (s.last === day) return;
  s.count = won() ? s.count + 1 : 0;
  s.last = day;
  try { localStorage.setItem(streakKey, JSON.stringify(s)); } catch {}
  renderStreak();
}
function renderStreak() {
  $('streak').textContent = `${loadStreak().count} 🔥`;
}

// ---- Archive ----

// Archive (the shared window is archive.js): this page's result for a day. 💎 = first guess and the bonus right.
function resultFor(m, d) {
  const saved = load(d), ans = answerFor(d);
  const n = saved.g.length, w = saved.g.includes(ans.name);
  if (w) {
    return `Won ${n}/${MAX}` + (n === 1 && ans.bonus?.right.includes(saved.bonus) ? ' 💎' : '');
  }
  if (n >= MAX) return 'Lost';
  return n ? `In progress (${n}/${MAX})` : 'Not played';
}
window.archiveHere = { modes: [MODE], current: () => MODE, result: resultFor, play: (m, d) => start(d) };
const noteResult = () => {
  if (over) {
    try { localStorage.setItem(`mapleWordle:result:${MODE}:${day}`, resultFor(MODE, day)); } catch {}
    if (live) {   // mesos (fx.js), today's puzzle only
      earnGame(MODE, day, resultFor(MODE, day));
      if (bonus != null && answer.bonus?.right.includes(bonus)) earnBonus(MODE, day, !!answer.bonus.mashup?.egg);
    }
  }
  mesoGain(MODE, day, over && live);   // the spinning "+mesos" under the result (game + bonus)
};
const closeArchive = () => { $('archive').hidden = true; };

// ---- Share ----

function shareText() {
  const ok = bonus != null && !!answer.bonus?.right.includes(bonus);
  const first = won() && guesses.length === 1;
  // First-guess win: just a star, or just a diamond if the bonus was right too.
  const grid = first ? (ok ? '💎' : '⭐')
    : guesses.map((n) => !n ? '⬛' : isRight(n) ? '🟩' : isClose(n) ? '🟨' : '🟥').join('') + '⬜'.repeat(MAX - guesses.length);
  const extra = bonus == null || grid === '💎' ? '' : `\nBonus ${ok ? '✅' : '❌'}`;
  return [`Maple Wordle - BGM Clip #${day - FIRST_DAY + 1} ${won() ? guesses.length : 'X'}/${MAX}`,
    grid + extra, 'https://ima.moe/maplewordle/bgm'].join('\n');
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
      let list = null;
      for (const line of md.split('\n')) {
        if (line.startsWith('## ')) {
          const [ver, date] = line.slice(3).split(' - ');
          const h = document.createElement('h3');
          h.textContent = ver;
          if (date) {
            const d = document.createElement('span');
            d.className = 'date';
            d.textContent = '- ' + date;
            h.appendChild(d);
          }
          body.appendChild(h);
          list = body.appendChild(document.createElement('ul'));
        } else if (line.startsWith('- ') && list) {
          list.appendChild(document.createElement('li')).textContent = line.slice(2);
        }
      }
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
    "Listen to today's BGM clip and guess which boss fight it's from. You get <b>6</b> guesses. New BGM every day at 00:00 UTC (same as Maple reset).",
    'Your first guess gets <b>0.5 seconds</b> of the clip. Each wrong guess or Skip unlocks more: 1s, 2s, 5s, 10s, then 30s. Miss all 6 and you lose.',
    'A wrong guess only tells you it\'s wrong. Nothing else is revealed.',
    'Play starts and pauses the clip. It stops at what you\'ve unlocked, and pressing Play again starts it over. You can\'t skip ahead.',
    'The clip starts either at the very beginning of the track or somewhere in the middle (50/50).',
    'The BGM can be from any part of the fight: the waiting room, any phase, the loot room and more.',
    'A few tracks play in two boss fights (Horntail and Balrog, Ursus and Inferno Wolf). Picking the other boss shows <b>yellow</b>: right track, wrong boss. It still counts as a miss.',
    '<b>Bonus:</b> when the game is over the whole track unlocks (click the bar to jump around). Guess which part of the fight it plays in. It\'s just for fun and won\'t change your result. Bosses with only one BGM have no bonus, except on the rare day a <b>mashup</b> shows up instead: guess whose BGM mashup it is, with one guess.',
    'Win on your first guess for a ⭐ in the Archive. Get the bonus right too for a 💎.',
    'The volume bar next to Play is only for this game\'s BGM (separate from the sound button).',
    'Win streak resets when you lose.',
  ];
  $('infoBody').innerHTML = '<ul>' + rules.map((x) => `<li>${x}</li>`).join('') + '</ul>' +
    `<p class="warn">⚠️ Some info may not be accurate. If you spot a mistake, please report it on the <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>.</p>`;
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

function tick() {
  if (pool && live && today() !== day) start();
  const s = Math.floor(((today() + 1) * DAY_MS - Date.now()) / 1000);
  showTimer(today() < FIRST_DAY ? 'BGM Clip opens in' : 'Next BGM in', s);
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
    start(window.archiveRequest?.mode === MODE ? window.archiveRequest.day : undefined);
  })
  .catch(() => { $('status').textContent = 'Could not load the BGM data.'; });
addEventListener('resize', () => { if (answer) drawBar(); });

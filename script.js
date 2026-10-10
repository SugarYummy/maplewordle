let data, mode, day, live, pool, answer, guesses, maxGuesses, over, matches, active;

const $ = (id) => document.getElementById(id);

// Address of the stats Worker (see worker/). Leave empty to hide everyone's stats.
const STATS_URL = '';
const DAY_MS = 86400000;
const today = () => Math.floor(Date.now() / DAY_MS); // resets at 00:00 UTC

function formatHp(entry) {
  if (entry.hpLabel) return entry.hpLabel;
  const n = entry.hp;
  if (n == null) return 'Unknown';
  const units = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  for (const [v, s] of units) {
    if (n >= v) return +(n / v).toFixed(3) + s;
  }
  return n.toLocaleString();
}

// Same answer for everyone on the same day; each mode gets a different one.
function dailyIndex(size, d = day, m = mode) {
  let h = d;
  for (const c of m) h = (h * 31 + c.charCodeAt(0)) % 1000003;
  return h % size;
}

function textCell(g, a) {
  const show = g == null ? 'Unknown' : g;
  return [show, g != null && g === a ? 'green' : 'red'];
}

// "All", "All except KMS", "GMS only", "JMS/CMS/GMS" -> set of servers.
// Labels that aren't server lists (Seasonal, Event, Removed) return null.
const SERVERS = ['KMS', 'GMS', 'JMS', 'CMS', 'TMS', 'MSEA'];
function servers(label) {
  if (label == null) return null;
  if (label === 'All') return SERVERS;
  let m = label.match(/^All except (.+)$/);
  if (m) return SERVERS.filter((s) => s !== m[1]);
  m = label.match(/^(\w+) only$/);
  if (m) return [m[1]];
  const parts = label.split('/');
  return parts.every((p) => SERVERS.includes(p)) ? parts : null;
}

function regionCell(g, a) {
  const show = g == null ? 'Unknown' : g;
  if (g != null && g === a) return [show, 'green'];
  const gs = servers(g), as = servers(a);
  if (gs && as && gs.some((s) => as.includes(s))) return [show, 'yellow'];
  return [show, 'red'];
}

// Yellow when close, red when far. close(g, a) decides what "close" means per column.
function numberCell(g, a, show, close) {
  if (g == null || a == null) return [show, 'red'];
  if (g === a) return [show, 'green'];
  return [show + (g < a ? ' ↑' : ' ↓'), close(g, a) ? 'yellow' : 'red'];
}
const closePhases = (g, a) => Math.abs(g - a) <= 1;
const closeHp = (g, a) => Math.max(g, a) / Math.min(g, a) <= 3;
const closeLevel = (g, a) => Math.abs(g - a) <= 10;

function addRow(cells, cls) {
  const tr = document.createElement('tr');
  if (cls) tr.className = cls;
  for (const [text, c] of cells) {
    const td = document.createElement('td');
    if (text && text.card) td.appendChild(bossCard(text.card, text.label));
    else td.textContent = text;
    td.className = c;
    tr.appendChild(td);
  }
  $('rows').prepend(tr);
}

// Boss "photo card": Maple Guide icon with the name under it ("?" when there's no icon).
function bossCard(e, label = e.name) {
  const card = document.createElement('div');
  card.className = 'card';
  if (e.image) {
    const img = document.createElement('img');
    img.src = e.image;
    img.alt = e.boss;
    card.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'noimg';
    ph.textContent = '?';
    card.appendChild(ph);
  }
  const name = document.createElement('div');
  name.textContent = label;
  card.appendChild(name);
  return card;
}

function guessCells(g) {
  return [
    // Same boss but a different difficulty (Extreme mode) is yellow.
    [{ card: g }, g.name === answer.name ? 'green' : g.boss === answer.boss ? 'yellow' : 'red'],
    textCell(g.world, answer.world),
    textCell(g.gender, answer.gender),
    regionCell(g.region, answer.region),
    numberCell(g.phases, answer.phases, g.phases ?? 'Unknown', closePhases),
    numberCell(g.hp, answer.hp, formatHp(g), closeHp),
    numberCell(g.level, answer.level, g.level ?? 'Unknown', closeLevel),
  ];
}
const guessRow = (g) => addRow(guessCells(g));

function answerRow() {
  const a = answer;
  addRow([
    [{ card: a, label: 'Answer: ' + a.name }], [a.world ?? 'Unknown'], [a.gender ?? 'Unknown'], [a.region ?? 'Unknown'],
    [a.phases ?? 'Unknown'], [formatHp(a)], [a.level ?? 'Unknown'],
  ], 'answer');
}

// Progress is saved per mode per day, so refreshing can't reset today's guesses.
const saveKey = (d = day, m = mode) => `mapleWordle:${m}:${d}`;
function load(d, m) {
  try { return JSON.parse(localStorage.getItem(saveKey(d, m))) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify(guesses)); } catch {}
}

const poolFor = (m) => data.pools[m === 'story' ? 'normal' : m];

// Play a given day's puzzle; with no day, play today's.
function start(d) {
  mode = document.querySelector('#modes .on').dataset.mode;
  live = d == null || d === today();
  day = live ? today() : d;
  pool = poolFor(mode);
  answer = pool[dailyIndex(pool.length)];
  $('puzzle').textContent = `Puzzle #${day - FIRST_DAY + 1} (${dateLabel(day)})` + (live ? '' : ' - Archive');
  $('today').hidden = live;
  maxGuesses = data.attempts[mode];
  guesses = [];
  over = false;
  $('rows').innerHTML = '';
  $('stats').hidden = true;
  $('share').hidden = true;
  $('guess').value = '';
  closeList();
  for (const name of load()) {
    const g = pool.find((e) => e.name === name);
    if (g && !over) record(g);
  }
  if (!over) updateStatus();
  else loadStats();
}

function updateStatus(msg) {
  const left = maxGuesses == null ? 'unlimited' : maxGuesses - guesses.length;
  $('status').textContent = msg || `Guesses left: ${left}`;
}

function record(g) {
  guesses.push(g.name);
  guessRow(g);
  $('share').hidden = true;
  if (g.name === answer.name) {
    over = true;
    updateStatus(`Correct! It was ${answer.name}. ${nextHint()}`);
  } else if (maxGuesses != null && guesses.length >= maxGuesses) {
    over = true;
    answerRow();
    updateStatus(`Out of guesses. It was ${answer.name}. ${nextHint()}`);
  } else {
    updateStatus();
  }
  if (over) $('share').hidden = false;
}

// Everyone's results for this puzzle. Your own result is sent once per mode per day.
async function loadStats() {
  if (!STATS_URL || maxGuesses == null) return;
  const sentKey = `mapleWordle:sent:${mode}:${day}`;
  const url = `${STATS_URL}?mode=${mode}&day=${day}`;
  const shownMode = mode, shownDay = day;
  let sent = false;
  try { sent = localStorage.getItem(sentKey) === '1'; } catch {}
  try {
    const score = guesses.includes(answer.name) ? guesses.length : 'X';
    const res = sent ? await fetch(url)
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
    if (!res.ok) return;
    const { counts } = await res.json();
    if (!sent) { try { localStorage.setItem(sentKey, '1'); } catch {} }
    if (mode === shownMode && day === shownDay && over) renderStats(counts, String(score));
  } catch {}
}

function renderStats(counts, mine) {
  const keys = [...Array(maxGuesses)].map((_, i) => String(i + 1)).concat('X');
  const total = keys.reduce((n, k) => n + (counts[k] || 0), 0);
  $('statsTitle').textContent = `Everyone's results (${MODE_NAME[mode]}) - ${total} player${total === 1 ? '' : 's'}`;
  const box = $('statsBars');
  box.innerHTML = '';
  for (const k of keys) {
    const pct = total ? Math.round((counts[k] || 0) * 100 / total) : 0;
    const row = document.createElement('div');
    row.className = 'statrow' + (k === mine ? ' mine' : '');
    row.innerHTML = `<span class="label"></span><span class="track"><span class="bar"></span></span><span class="pct"></span>`;
    row.querySelector('.label').textContent = `${k}/${maxGuesses}`;
    row.querySelector('.bar').style.width = pct + '%';
    row.querySelector('.pct').textContent = pct + '%';
    box.appendChild(row);
  }
  $('stats').hidden = false;
}

const nextHint = () => live ? 'Come back tomorrow for a new boss.' : 'Pick another day from the Archive.';

// Puzzle #1 is launch day; numbers count up by one every UTC day.
const FIRST_DAY = Date.UTC(2026, 9, 10) / DAY_MS;
const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// Archive: every puzzle from #1 to today for the current mode, with your result if you played it.
function openArchive() {
  const list = $('archiveList');
  list.innerHTML = '';
  $('archiveMode').textContent = MODE_NAME[mode];
  const p = poolFor(mode);
  for (let d = today(); d >= FIRST_DAY; d--) {
    const saved = load(d, mode);
    const ans = p[dailyIndex(p.length, d, mode)];
    const max = data.attempts[mode];
    let result = 'Not played';
    if (saved.includes(ans.name)) result = `Won ${saved.length}/${max ?? '∞'}`;
    else if (max != null && saved.length >= max) result = 'Lost';
    else if (saved.length) result = `In progress (${saved.length} guesses)`;
    const btn = document.createElement('button');
    btn.textContent = `#${d - FIRST_DAY + 1} - ${dateLabel(d)}${d === today() ? ' (today)' : ''} - ${result}`;
    btn.addEventListener('click', () => { closeArchive(); start(d); });
    list.appendChild(btn);
  }
  $('archive').hidden = false;
}
const closeArchive = () => { $('archive').hidden = true; };
const EMOJI = { green: '🟩', yellow: '🟨', red: '🟥' };
const MODE_NAME = { story: 'Story', normal: 'Normal', hard: 'Hard', extreme: 'Extreme' };

function shareText() {
  const won = guesses.includes(answer.name);
  const score = (won ? guesses.length : 'X') + '/' + (maxGuesses ?? '∞');
  const grid = guesses.map((name) =>
    guessCells(pool.find((e) => e.name === name)).map(([, c]) => EMOJI[c]).join(''));
  return [`Maple Wordle #${day - FIRST_DAY + 1} (${MODE_NAME[mode]}) ${score}`, ...grid, location.href.split('#')[0]].join('\n');
}

function share() {
  const text = shareText();
  const done = () => { $('share').textContent = 'Copied!'; setTimeout(() => { $('share').textContent = 'Share'; }, 1500); };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
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

function guess(name) {
  if (over) return;
  name = (name ?? $('guess').value).trim().toLowerCase();
  if (!name) return updateStatus('Type a boss name first.');
  // Exact name, otherwise the first boss whose name contains what was typed.
  const g = pool.find((e) => e.name.toLowerCase() === name)
    || pool.find((e) => !guesses.includes(e.name) && e.name.toLowerCase().includes(name));
  if (!g) return updateStatus('Pick a boss from the list.');
  if (guesses.includes(g.name)) return updateStatus('Already guessed.');
  $('guess').value = '';
  closeList();
  record(g);
  save();
  if (over) loadStats();
}

// Dropdown drawn inside the page (not the browser's native popup), so it shows up on screen shares.
function openList() {
  const q = $('guess').value.trim().toLowerCase();
  matches = pool.filter((e) => !guesses.includes(e.name) && e.name.toLowerCase().includes(q));
  active = 0;
  renderList();
}
function renderList() {
  const list = $('list');
  list.innerHTML = '';
  matches.forEach((e, i) => {
    const div = document.createElement('div');
    div.textContent = e.name;
    if (i === active) div.className = 'active';
    div.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(e.name); });
    list.appendChild(div);
  });
  list.hidden = matches.length === 0 || over;
  list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
// Fill the box with the chosen boss; the Guess button (or Enter) submits it.
function pick(name) {
  $('guess').value = name;
  closeList();
}
function closeList() {
  matches = [];
  $('list').hidden = true;
}

$('guess').addEventListener('input', openList);
$('guess').addEventListener('focus', openList);
$('guess').addEventListener('blur', closeList);
$('guess').addEventListener('keydown', (e) => {
  const open = !$('list').hidden;
  if (e.key === 'ArrowDown' && open) { active = Math.min(active + 1, matches.length - 1); renderList(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && open) { active = Math.max(active - 1, 0); renderList(); e.preventDefault(); }
  else if (e.key === 'Escape') closeList();
  else if (e.key === 'Enter') { if (open) pick(matches[active].name); else guess(); }
});
$('go').addEventListener('click', () => guess());
$('share').addEventListener('click', share);
$('archiveBtn').addEventListener('click', () => { if (data) openArchive(); });
$('archiveClose').addEventListener('click', closeArchive);
$('today').addEventListener('click', () => start());
for (const b of document.querySelectorAll('#modes button')) {
  b.addEventListener('click', () => {
    document.querySelector('#modes .on').classList.remove('on');
    b.classList.add('on');
    if (data) start(live ? undefined : day);
  });
}

function tick() {
  if (data && live && today() !== day) start();
  const ms = (today() + 1) * DAY_MS - Date.now();
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  $('timer').textContent = `New boss in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)} (resets 00:00 UTC)`;
}
tick();
setInterval(tick, 1000);

fetch('data/bosses.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((d) => { data = d; start(); })
  .catch(() => { $('status').textContent = 'Could not load data/bosses.json'; });

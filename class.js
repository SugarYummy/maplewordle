// Guess the Class (Wordle style). Same daily rules as Guess the Boss: one class per UTC day, everyone gets
// the same one, progress saved in the browser. One difficulty, 5 guesses (data/classes.json "attempts").
let data, pool, day, live, answer, guesses, maxGuesses, over, matches, active;

const $ = (id) => document.getElementById(id);

// Address of the stats Worker (see worker/). Leave empty to hide everyone's stats.
const STATS_URL = 'https://maplewordle-stats.hanayuki.workers.dev/';
const MODE = 'class';   // key for saves, streak and the stats Worker
const DAY_MS = 86400000;
const today = () => Math.floor(Date.now() / DAY_MS); // resets at 00:00 UTC

// Puzzle #1 is launch day; numbers count up by one every UTC day. Set this to the real launch day before going live.
const FIRST_DAY = Date.UTC(2026, 9, 11) / DAY_MS;
const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// The whole pool is worked through in a shuffled order: every class is the answer exactly once per cycle,
// then the pool reshuffles. The order comes from a hash of (day, class name), so everyone gets the same class
// on the same day, and never the same class two days in a row. A class with "since" (a day number) only joins
// from that day, so adding classes later never changes past answers.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const schedule = { days: [], used: new Set() };
function answerFor(d) {
  const s = schedule;
  while (FIRST_DAY + s.days.length <= d) {
    const day = FIRST_DAY + s.days.length;
    const prev = s.days[s.days.length - 1];
    const eligible = pool.filter((e) => (e.since ?? 0) <= day);
    let left = eligible.filter((e) => !s.used.has(e.name));
    if (!left.length) { s.used.clear(); left = eligible; }        // cycle done: everyone is back in
    const fresh = left.filter((e) => e !== prev);
    if (fresh.length) left = fresh;
    let pick = left[0], best = Infinity;
    for (const e of left) {
      const v = hash(`${MODE}|${day}|${e.name}`);
      if (v < best) { best = v; pick = e; }
    }
    s.used.add(pick.name);
    s.days.push(pick);
  }
  return s.days[d - FIRST_DAY];
}

// ---- Cells: [text, colour] per column ----

const textCell = (g, a) => [g ?? 'Unknown', g != null && g === a ? 'green' : 'red'];

// Job Branch / Main Stat are lists (Xenon: Thief / Pirate, STR, DEX, LUK). Same list = green, sharing one = yellow.
function listCell(g, a, sep) {
  const same = g.length === a.length && g.every((x) => a.includes(x));
  return [g.join(sep), same ? 'green' : g.some((x) => a.includes(x)) ? 'yellow' : 'red'];
}

// "All", "All except KMS", "GMS", "GMS/CMS/TMS/MSEA" -> set of servers. "Removed" / "Event" return null.
const SERVERS = ['KMS', 'GMS', 'JMS', 'CMS', 'TMS', 'MSEA'];
function servers(label) {
  if (label == null) return null;
  if (label === 'All') return SERVERS;
  const m = label.match(/^All except (.+)$/);
  if (m) return SERVERS.filter((s) => s !== m[1]);
  const parts = label.split('/');
  return parts.every((p) => SERVERS.includes(p)) ? parts : null;
}
function regionCell(g, a) {
  if (g === a) return [g, 'green'];
  const gs = servers(g), as = servers(a);
  return [g, gs && as && gs.some((s) => as.includes(s)) ? 'yellow' : 'red'];
}

// Release year: arrow towards the answer, yellow within 4 years. No year (Not in GMS) = red, no arrow.
const yearText = (e) => e.yearLabel ?? e.year ?? 'Unknown';
const YEAR_CLOSE = 4;
function yearCell(g, a) {
  const show = yearText(g);
  if (g.year == null || a.year == null) return [show, g.year === a.year && g.yearLabel === a.yearLabel ? 'green' : 'red'];
  if (g.year === a.year) return [show, 'green'];
  return [show + (g.year < a.year ? ' ↑' : ' ↓'), Math.abs(g.year - a.year) <= YEAR_CLOSE ? 'yellow' : 'red'];
}

function guessCells(g) {
  const a = answer;
  return [
    [{ card: g }, g === a ? 'green' : 'red'],
    textCell(g.faction, a.faction),
    listCell(g.branch, a.branch, ' / '),
    listCell(g.stat, a.stat, ', '),
    yearCell(g, a),
    regionCell(g.region, a.region),
  ];
}

// Class "photo card": portrait with the name under it. Group cards (several classes) have a wider picture.
function classImg(e) {
  const img = document.createElement('img');
  img.src = e.image;
  img.alt = '';
  if (e.members) img.className = 'wide';
  return img;
}
function classCard(e, label = e.name) {
  const card = document.createElement('div');
  card.className = 'card';
  card.appendChild(classImg(e));
  card.appendChild(document.createElement('div')).textContent = label;
  return card;
}

function addRow(cells, cls) {
  const tr = document.createElement('tr');
  if (cls) tr.className = cls;
  for (const [text, c] of cells) {
    const td = document.createElement('td');
    if (text && text.card) td.appendChild(classCard(text.card, text.label));
    else td.textContent = text;
    td.className = text && text.card ? 'cardcell' : c || '';   // photo cards stay grey: right or wrong shows only in the other columns
    tr.appendChild(td);
  }
  $('rows').prepend(tr);
  return tr;
}
const byName = (n) => pool.find((e) => e.name === n);
const guessRow = (g) => addRow(guessCells(g));

function answerRow() {
  const a = answer;
  addRow([[{ card: a, label: 'Answer: ' + a.name }], [a.faction], [a.branch.join(' / ')], [a.stat.join(', ')], [yearText(a)], [a.region]], 'answer');
}

// "Best so far" row pinned above the guesses: every column already found in green, otherwise the best clue so
// far (a yellow overlap, or the closest year with its arrow). Removed once the game is over.
function renderBest() {
  $('rows').querySelector('.bestrow')?.remove();
  if (over || !guesses.length) return;
  const vals = guesses.map(byName);
  const gs = vals.map(guessCells);
  const cells = [['Best so far', 'best']];
  for (const i of [1, 2, 3, 5]) {
    cells.push(gs.find((c) => c[i][1] === 'green')?.[i] ?? gs.find((c) => c[i][1] === 'yellow')?.[i] ?? ['', 'grey']);
  }
  let best = -1;
  vals.forEach((v, j) => {
    if (v.year == null || answer.year == null) return;
    if (best < 0 || Math.abs(v.year - answer.year) < Math.abs(vals[best].year - answer.year)) best = j;
  });
  const green = gs.find((c) => c[4][1] === 'green');
  cells.splice(4, 0, green ? green[4] : best < 0 ? ['', 'grey'] : gs[best][4]);
  addRow(cells, 'bestrow');
}

// ---- Game flow ----

// Progress is saved per day, so refreshing can't reset today's guesses.
const saveKey = (d = day) => `mapleWordle:${MODE}:${d}`;
function load(d) {
  try { return JSON.parse(localStorage.getItem(saveKey(d))) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify(guesses)); } catch {}
}

// Play a given day's puzzle; with no day, play today's.
function start(d) {
  live = d == null || d === today();
  day = live ? today() : d;
  answer = answerFor(day);
  showPuzzle(day - FIRST_DAY + 1, dateLabel(day), live);   // the info strip (fx.js)
  $('today').hidden = live;
  guesses = [];
  over = false;
  firstTryGlow(false);
  $('rows').innerHTML = '';
  $('stats').hidden = true;
  $('share').hidden = true;
  $('picker').hidden = false;
  $('guess').value = '';
  closeList();
  for (const name of load()) {
    const g = byName(name);
    if (g && !over) record(g);
  }
  renderBest();
  if (!over) updateStatus();
  else loadStats();
  renderStreak();
  noteResult();
}

function updateStatus(msg) {
  $('status').textContent = msg || `Guesses left: ${maxGuesses - guesses.length}`;
}

function record(g) {
  guesses.push(g.name);
  guessRow(g);
  if (g === answer) {
    over = true;
    updateStatus(`Correct! It was ${answer.name}. ${nextHint()}`);
  } else if (guesses.length >= maxGuesses) {
    over = true;
    answerRow();
    updateStatus(`Out of guesses. It was ${answer.name}. ${nextHint()}`);
  } else {
    updateStatus();
  }
  $('share').hidden = !over;
  $('picker').hidden = over;
  if (over) closeList();
  firstTryGlow(over && guesses.length === 1 && guesses[0] === answer.name);
  renderBest();
}
const nextHint = () => live ? 'Come back tomorrow for a new class.' : 'Pick another day from the Archive.';

function guess(name) {
  if (over) return;
  const q = (name ?? $('guess').value).trim().toLowerCase();
  if (!q) return updateStatus('Type a class name first.');
  const g = pool.find((e) => e.name.toLowerCase() === q) || search(q)[0];
  if (!g) return updateStatus('Pick a class from the list.');
  if (guesses.includes(g.name)) return updateStatus('Already guessed.');
  $('guess').value = '';
  $('guess').blur();   // unfocus, so the next click on the box opens the list again
  closeList();
  record(g);
  save();
  // Flip the new row in; on a win, confetti once the last cell has turned over.
  let flipMs = flipRow($('rows').querySelector('tr:not(.bestrow):not(.hintrow):not(.answer)'));
  flipMs = flipRow($('rows').querySelector('tr.answer'), flipMs);   // out of guesses: the answer turns over next
  if (over && guesses.includes(answer.name)) setTimeout(() => confetti(guesses.length === 1), flipMs);
  if (over && live) resultSound(guesses.includes(answer.name), flipMs, !guesses.includes(answer.name) ? 'classLose' : guesses.length === 1 ? 'firstTry' : 'classWin');   // today's puzzle only
  for (const el of [$('status'), $('share'), $('rows').querySelector('.bestrow')]) revealAfter(el, flipMs);
  if (over) { updateStreak(); loadStats(); noteResult(); }
}

// ---- Class picker: search box with a dropdown of picture + name rows (A-Z, so the order gives nothing away) ----

// A group card (e.g. "Night Lord / Shadower") is found by any of its class names.
const search = (q) => pool
  .filter((e) => !guesses.includes(e.name) && (e.members ?? [e.name]).some((n) => n.toLowerCase().includes(q)))
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
    div.appendChild(classImg(e));
    div.appendChild(document.createElement('span')).textContent = e.name;
    // Pressing keeps focus in the search box; the guess only happens on a left click, i.e. when the left button is
    // released over the same option (right / middle clicks and drag-offs do nothing).
    div.addEventListener('mousedown', (ev) => ev.preventDefault());
    div.addEventListener('click', (ev) => { if (ev.button === 0) guess(e.name); });
    // The highlight follows the mouse, so Enter always picks the option you're pointing at.
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
  else if (e.key === 'Enter' && open && matches[active]) guess(matches[active].name);   // only the highlighted option
});

// ---- Everyone's results: your result is sent once per day ----

async function loadStats() {
  if (!STATS_URL) return;
  const sentKey = `mapleWordle:sent:${MODE}:${day}`;
  const url = `${STATS_URL}?mode=${MODE}&day=${day}`;
  const shownDay = day;
  let sent = false;
  try { sent = localStorage.getItem(sentKey) === '1'; } catch {}
  try {
    const score = guesses.includes(answer.name) ? guesses.length : 'X';
    const res = sent ? await fetch(url)
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
    if (!res.ok) return;
    const { counts } = await res.json();
    if (!sent) { try { localStorage.setItem(sentKey, '1'); } catch {} }
    if (day === shownDay && over) renderStats(counts, String(score));
  } catch {}
}

function renderStats(counts, mine) {
  const top = maxGuesses;
  const bars = [...Array(top)].map((_, i) => ({ key: String(i + 1), label: `${i + 1}/${top}`, n: counts[String(i + 1)] || 0 }));
  bars.push({ key: 'X', label: `X/${top}`, n: counts.X || 0 });
  const total = bars.reduce((n, b) => n + b.n, 0);
  $('statsTitle').textContent = `Everyone's results - ${total} player${total === 1 ? '' : 's'}`;
  const box = $('statsBars');
  box.innerHTML = '';
  for (const b of bars) {
    const pct = total ? Math.round(b.n * 100 / total) : 0;
    const row = document.createElement('div');
    row.className = 'statrow' + (b.key === mine ? ' mine' : '');
    row.innerHTML = `<span class="label"></span><span class="track"><span class="bar"></span></span><span class="pct"></span>`;
    row.querySelector('.label').textContent = b.label;
    row.querySelector('.bar').style.width = pct + '%';
    row.querySelector('.pct').textContent = pct + '%';
    box.appendChild(row);
  }
  // A fail counts as one more than the guess limit.
  const failAs = top + 1;
  let solved = 0, sum = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (k === 'X') sum += failAs * c;
    else { solved += c; sum += Number(k) * c; }
  }
  $('statsAvg').textContent = !total ? '' :
    `Average: ${(sum / total).toFixed(1)} guesses (fails count as ${failAs})\n${Math.round(solved * 100 / total)}% solved`;
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
  if (s.last === day) return;                     // already counted today
  s.count = guesses.includes(answer.name) ? s.count + 1 : 0;
  s.last = day;
  try { localStorage.setItem(streakKey, JSON.stringify(s)); } catch {}
  renderStreak();
}
const renderStreak = () => { $('streak').textContent = `${loadStreak().count} 🔥`; };

// ---- Archive: every puzzle from #1 to today, with your result if you played it ----

// Archive (the shared window is archive.js): this page's result for a day.
function resultFor(m, d) {
  const saved = load(d), ans = answerFor(d);
  if (saved.includes(ans.name)) return `Won ${saved.length}/${maxGuesses}`;
  if (saved.length >= maxGuesses) return 'Lost';
  return saved.length ? `In progress (${saved.length} guesses)` : 'Not played';
}
window.archiveHere = { modes: [MODE], current: () => MODE, result: resultFor, play: (m, d) => start(d) };
const noteResult = () => {
  if (over) {
    try { localStorage.setItem(`mapleWordle:result:${MODE}:${day}`, resultFor(MODE, day)); } catch {}
    earnGame(MODE, day, resultFor(MODE, day));   // mesos (fx.js): Archive days pay 10%
  }
  mesoGain(MODE, day, over);   // the spinning "+mesos" under the result
};
const closeArchive = () => { $('archive').hidden = true; };

// ---- Share ----

const EMOJI = { green: '🟩', yellow: '🟨', red: '🟥' };
function shareText() {
  const score = (guesses.includes(answer.name) ? guesses.length : 'X') + '/' + maxGuesses;
  const grid = guesses.map((n) => guessCells(byName(n)).map(([, c]) => EMOJI[c]).join(''));
  const lines = guesses.length === 1 && guesses[0] === answer.name ? ['⭐'] : grid;   // first-guess win: just a star
  return [`Maple Wordle - Guess the Class #${day - FIRST_DAY + 1} ${score}`, ...lines, 'https://ima.moe/maplewordle/class'].join('\n');
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

// ---- Page furniture shared with Guess the Boss (changelog, peeking characters, windows) ----

// Changelog: read CHANGELOG.md and show "## version" headings with their "- item" lines.
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
        } else if (list && /^\s*[-*] /.test(line)) {
          // "- item" (or "* item"); indent it (2+ spaces or a tab) to put it under the bullet above it.
          const depth = line.match(/^\s*/)[0].replace(/\t/g, '  ').length >> 1;
          let ul = list;
          for (let i = 0; i < depth; i++) {
            const last = ul.lastElementChild;
            if (!last) break;
            ul = last.querySelector(':scope > ul') || last.appendChild(document.createElement('ul'));
          }
          ul.appendChild(document.createElement('li')).textContent = line.replace(/^\s*[-*] /, '');
        } else if (list && line.trim() && !line.startsWith('#')) {
          // A plain line ("[BGM Clip] Fixes:") is a small heading; the bullets after it go under it.
          if (!list.childElementCount) list.remove();   // no bullets came before it
          const p = body.appendChild(document.createElement('p'));
          p.className = 'clnote';
          p.textContent = line.trim();
          list = body.appendChild(document.createElement('ul'));
        }
      }
    } catch {
      body.textContent = 'Could not load the changelog.';
    }
  }
  $('changelog').hidden = false;
}
// Clicking the credit makes a random character peek out from behind it for 2 seconds.
const peekTimers = new Map();
$('credit').addEventListener('click', () => {
  const all = document.querySelectorAll('.peekclip');
  const who = all[Math.floor(Math.random() * all.length)];
  who.classList.add('up');
  clearTimeout(peekTimers.get(who));
  peekTimers.set(who, setTimeout(() => who.classList.remove('up'), 350 + 2000));
});
// "?" How to play window.
const DISCORD = 'https://discord.gg/f22H4UJ';
function openInfo() {
  const rules = [
    "Guess today's class in <b>5</b> guesses. New class every day at 00:00 UTC (same as Maple reset).",
    'Each guess shows how close you are:<ul><li>🟩 right · 🟨 close · 🟥 wrong</li><li>↑ / ↓ = the answer is newer / older</li></ul>',
    '🟨 Job Branch, Main Stat, Region: partly matches (e.g. Xenon is Thief / Pirate).',
    '🟨 Release Year: within 4 years.',
    'Release Year is when the class came to GMS. Not in GMS = red with no arrow.',
    'Classes that match in every column share one card (e.g. Hero / Paladin / Dark Knight). Type any of their names.',
    'Removed, event and upcoming classes can appear.',
    'The <b>Best so far</b> row shows your best clue for each column.',
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
  if (data && live && today() !== day) start();
  const s = Math.floor(((today() + 1) * DAY_MS - Date.now()) / 1000);
  showTimer('Next class in', s);
}
tick();
setInterval(tick, 1000);

fetch('data/classes.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((d) => { data = d; pool = d.classes; maxGuesses = d.attempts; start(window.archiveRequest?.mode === MODE ? window.archiveRequest.day : undefined); })
  .catch(() => { $('status').textContent = 'Could not load data/classes.json'; });

let data, mode, day, live, pool, answer, guesses, maxGuesses, over, matches, active, hints;

const $ = (id) => document.getElementById(id);

// Address of the stats Worker (see worker/). Leave empty to hide everyone's stats.
const STATS_URL = 'https://maplewordle-stats.hanayuki.workers.dev/';
const DAY_MS = 86400000;
const today = () => Math.floor(Date.now() / DAY_MS); // resets at 00:00 UTC

// Entry level text, e.g. "300+" when only a minimum is known.
const levelText = (e) => e.levelLabel ?? e.level ?? 'Unknown';

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

// Puzzles #1 and #2 came from the original formula; their answers are fixed here by name so later
// changes to the boss list can never change them.
const FIXED_ANSWERS = {
  story: ['Kalos (Chaos)', 'Darknell (Hard)'],
  normal: ['Papulatus (Chaos)', 'Black Mage (Hard)'],
  hard: ['Crimson Queen (Chaos)', 'Frenzied Gigatoad (Hard)'],
  extreme: ['Zakum (Chaos)', 'Zakum (Normal)'],
};

// From puzzle #3 on, each mode works through its whole pool in a shuffled order: every boss is the
// answer exactly once per cycle, then the pool reshuffles. The order comes from a hash of
// (mode, day, boss name), so everyone gets the same boss on the same day. The same boss is never the
// answer two days in a row (in Extreme, that includes other difficulties of the same boss).
// A boss with "since" (a day number) in bosses.json only joins from that day, so adding bosses later
// never changes past answers.
const SHUFFLE_FROM = Date.UTC(2026, 9, 12) / 86400000;   // puzzle #3
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const schedules = {};
function answerFor(m, d) {
  const p = data.pools[m === 'story' ? 'normal' : m];
  if (d < SHUFFLE_FROM) return p.find((e) => e.name === FIXED_ANSWERS[m][d - (SHUFFLE_FROM - 2)]);
  const s = schedules[m] || (schedules[m] = { days: [], used: new Set() });
  while (SHUFFLE_FROM + s.days.length <= d) {
    const day = SHUFFLE_FROM + s.days.length;
    const prev = s.days[s.days.length - 1];
    const eligible = p.filter((e) => (e.since ?? 0) <= day);
    let left = eligible.filter((e) => !s.used.has(e.name));
    if (!left.length) { s.used.clear(); left = eligible; }        // cycle done: everyone is back in
    const fresh = left.filter((e) => !prev || e.boss !== prev.boss);
    if (fresh.length) left = fresh;
    let pick = left[0], best = Infinity;
    for (const e of left) {
      const v = hash(`${m}|${day}|${e.name}`);
      if (v < best) { best = v; pick = e; }
    }
    s.used.add(pick.name);
    s.days.push(pick);
  }
  return s.days[d - SHUFFLE_FROM];
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

// In Extreme the Difficulty cell is built last; show it right after Boss.
const columnOrder = (cells) => cells.length === 8 ? [cells[0], cells[7], ...cells.slice(1, 7)] : cells;
function addRow(cells, cls) {
  const tr = document.createElement('tr');
  if (cls) tr.className = cls;
  for (const [text, c] of columnOrder(cells)) {
    const td = document.createElement('td');
    if (text && text.card) td.appendChild(bossCard(text.card, text.label));
    else td.textContent = text;
    td.className = c;
    tr.appendChild(td);
  }
  $('rows').prepend(tr);
  return tr;
}

// Boss "photo card": Maple Guide icon with the name under it ("?" when there's no icon).
// In Extreme the Difficulty column shows the difficulty, so cards show just the boss name.
const cardName = (e) => mode === 'extreme' ? e.boss : e.name;
function bossCard(e, label = cardName(e)) {
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
    numberCell(g.level, answer.level, levelText(g), closeLevel),
    ...(mode === 'extreme' ? [diffCell(g)] : []),
  ];
}
// Extreme mode only: Difficulty column comparing tiers (Easy < Normal < Hard/Chaos < Extreme/Hell).
const DIFF_TIER = { Easy: 1, Normal: 2, Hard: 3, Chaos: 3, Extreme: 4, Hell: 4 };
const diffCell = (g) => numberCell(DIFF_TIER[g.difficulty], DIFF_TIER[answer.difficulty], g.difficulty ?? 'Unknown', (a, b) => Math.abs(a - b) <= 1);
const guessRow = (g) => addRow(guessCells(g));

function answerRow() {
  const a = answer;
  addRow([
    [{ card: a, label: 'Answer: ' + cardName(a) }], [a.world ?? 'Unknown'], [a.gender ?? 'Unknown'], [a.region ?? 'Unknown'],
    [a.phases ?? 'Unknown'], [formatHp(a)], [levelText(a)],
    ...(mode === 'extreme' ? [[a.difficulty ?? 'Unknown']] : []),
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
  answer = answerFor(mode, day);
  $('puzzle').textContent = `Puzzle #${day - FIRST_DAY + 1} (${dateLabel(day)})` + (live ? '' : ' - Archive');
  $('today').hidden = live;
  maxGuesses = data.attempts[mode];
  $('diffHead').hidden = mode !== 'extreme';
  guesses = [];
  hints = loadHints();
  over = false;
  $('rows').innerHTML = '';
  $('stats').hidden = true;
  $('share').hidden = true;
  $('picker').hidden = false;
  $('guess').value = '';
  closeList();
  for (const name of load()) {
    const g = pool.find((e) => e.name === name);
    if (g && !over) record(g);
    for (const h of hints) if (h.at === guesses.length) hintRow(h.key);
  }
  for (const h of hints) if (h.at === Infinity) hintRow(h.key);
  renderBest();
  if (!over) updateStatus();
  else loadStats();
  renderHints();
  renderStreak();
  noteResult();
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
    updateStatus(`Correct! It was ${answer.name}.${hintsUsedText()} ${nextHint()}`);
  } else if (maxGuesses != null && guesses.length >= maxGuesses) {
    over = true;
    answerRow();
    updateStatus(`Out of guesses. It was ${answer.name}. ${nextHint()}`);
  } else {
    updateStatus();
  }
  if (over) $('share').hidden = false;
  $('picker').hidden = over;
  if (over) closeList();
  renderHints();
  renderBest();
}

// "Best so far" row pinned above the guesses: every category already found (green, from a guess or a hint),
// otherwise the best clue so far (Region: a yellow overlap; numbers: the closest guess with its arrow).
// Removed once the game is over.
function renderBest() {
  $('rows').querySelector('.bestrow')?.remove();
  if (over || !guesses.length) return;
  const gs = guesses.map((n) => guessCells(pool.find((e) => e.name === n)));
  const vals = guesses.map((n) => pool.find((e) => e.name === n));
  const hinted = new Set(hints.map((h) => h.key));
  const cells = [['Best so far', 'best']];
  for (const [key, i] of [['world', 1], ['gender', 2], ['region', 3]]) {
    const yellow = gs.find((c) => c[i][1] === 'yellow');
    if (hinted.has(key) || gs.some((c) => c[i][1] === 'green')) cells.push([answer[key] ?? 'Unknown', 'green']);
    else if (yellow) cells.push(yellow[i]);
    else cells.push(['', 'grey']);
  }
  const dist = { phases: (a, b) => Math.abs(a - b), level: (a, b) => Math.abs(a - b), hp: (a, b) => Math.abs(Math.log(a / b)) };
  for (const [key, i] of [['phases', 4], ['hp', 5], ['level', 6]]) {
    const show = key === 'hp' ? formatHp(answer) : key === 'level' ? levelText(answer) : answer[key] ?? 'Unknown';
    if (hinted.has(key) || gs.some((c) => c[i][1] === 'green')) { cells.push([show, 'green']); continue; }
    let best = -1;
    vals.forEach((v, j) => {
      if (v[key] == null || answer[key] == null) return;
      if (best < 0 || dist[key](v[key], answer[key]) < dist[key](vals[best][key], answer[key])) best = j;
    });
    cells.push(best < 0 ? ['', 'grey'] : gs[best][i]);
  }
  if (mode === 'extreme') {
    const tierDist = (j) => Math.abs(DIFF_TIER[vals[j].difficulty] - DIFF_TIER[answer.difficulty]) || (DIFF_TIER[vals[j].difficulty] === DIFF_TIER[answer.difficulty] ? 0 : Infinity);
    let best = 0;
    vals.forEach((_, j) => { if (tierDist(j) < tierDist(best)) best = j; });
    cells.push(tierDist(best) === 0 ? [answer.difficulty, 'green'] : gs[best][7]);
  }
  addRow(cells, 'bestrow');
}

// Story mode hints: one hint unlocks for every 3 guesses. A hint adds a row to the table that shows
// one answer category in green (one no guess has already got green) and greys out everything else.
// When every category is green but the boss still isn't found, the hint gives the name's first letter.
// Hints are saved as { key, at } (at = number of guesses when used) so they replay in the right place.
const HINT_EVERY = 3;
const HINT_CATS = [
  { key: 'world', cell: 1, show: (e) => e.world ?? 'Unknown' },
  { key: 'gender', cell: 2, show: (e) => e.gender ?? 'Unknown' },
  { key: 'region', cell: 3, show: (e) => e.region ?? 'Unknown' },
  { key: 'phases', cell: 4, show: (e) => e.phases ?? 'Unknown' },
  { key: 'hp', cell: 5, show: (e) => formatHp(e) },
  { key: 'level', cell: 6, show: (e) => levelText(e) },
];
const hintKey = () => `${saveKey()}:hints`;
function loadHints() {
  try {
    return (JSON.parse(localStorage.getItem(hintKey())) || [])
      .map((h) => typeof h === 'string' ? { key: h, at: Infinity } : h);   // older saves had no position
  } catch { return []; }
}
function nextHintOptions() {
  const used = new Set(hints.map((h) => h.key));
  const green = new Set();
  for (const name of guesses) {
    const cells = guessCells(pool.find((e) => e.name === name));
    for (const c of HINT_CATS) if (cells[c.cell][1] === 'green') green.add(c.key);
  }
  const cats = HINT_CATS.filter((c) => !used.has(c.key) && !green.has(c.key)).map((c) => c.key);
  return cats.length ? cats : used.has('name') ? [] : ['name'];
}
function hintRow(key) {
  const cells = [[{ card: { image: null, boss: '' }, label: 'Hint' }, 'grey'], ...HINT_CATS.map(() => ['', 'grey'])];
  if (key === 'name') cells[0] = [`Starts with "${answer.boss[0]}"`, 'green'];
  else { const c = HINT_CATS.find((x) => x.key === key); cells[c.cell] = [c.show(answer), 'green']; }
  addRow(cells, 'hintrow');
}
function renderHints() {
  const earned = Math.floor(guesses.length / HINT_EVERY);
  const avail = earned - hints.length;
  const left = nextHintOptions().length;
  const wait = HINT_EVERY - (guesses.length % HINT_EVERY);
  const btn = $('hint');
  btn.hidden = mode !== 'story' || over;
  btn.disabled = avail <= 0 || !left;
  btn.textContent = !left ? 'Hint (none left)' : avail > 0 ? `Hint (${avail} available)` : `Hint (in ${wait} guess${wait === 1 ? '' : 'es'})`;
}
function useHint() {
  const options = nextHintOptions();
  if (over || !options.length || Math.floor(guesses.length / HINT_EVERY) <= hints.length) return;
  const key = options[Math.floor(Math.random() * options.length)];
  hints.push({ key, at: guesses.length });
  try { localStorage.setItem(hintKey(), JSON.stringify(hints)); } catch {}
  hintRow(key);
  renderHints();
  renderBest();
}
const hintsUsedText = () => mode !== 'story' ? '' : hints.length ? ` You used ${hints.length} hint${hints.length === 1 ? '' : 's'}.` : ' No hints used!';

// Everyone's results for this puzzle. Your own result is sent once per mode per day.
async function loadStats() {
  if (!STATS_URL) return;
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
  // Bars: 1..max then X/max; Story (unlimited) uses 1..6 then 7+.
  const story = maxGuesses == null;
  const top = story ? 6 : maxGuesses;
  const bars = [...Array(top)].map((_, i) => ({ key: String(i + 1), label: `${i + 1}/${story ? '∞' : top}`, n: counts[String(i + 1)] || 0 }));
  if (story) {
    const more = Object.entries(counts).filter(([k]) => Number(k) > 6).reduce((n, [, c]) => n + c, 0);
    bars.push({ key: '7+', label: '7+', n: more });
  } else {
    bars.push({ key: 'X', label: `X/${top}`, n: counts.X || 0 });
  }
  if (story && Number(mine) > 6) mine = '7+';
  const total = bars.reduce((n, b) => n + b.n, 0);
  $('statsTitle').textContent = `Everyone's results (${MODE_NAME[mode]}) - ${total} player${total === 1 ? '' : 's'}`;
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
  // Average guesses, using exact counts (so Story's 7+ is averaged precisely).
  // A fail counts as one more than the guess limit (7 on Normal, 6 on Hard/Extreme).
  const failAs = story ? null : top + 1;
  let solved = 0, sum = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (k === 'X') sum += failAs * c;
    else { solved += c; sum += Number(k) * c; }
  }
  $('statsAvg').textContent = !total ? '' : `Average: ${(sum / total).toFixed(1)} guesses` +
    (story ? '' : ` (fails count as ${failAs})\n${Math.round(solved * 100 / total)}% solved`);
  $('stats').hidden = false;
}

// Win streak, one per mode, saved in the browser. Only today's puzzle counts (not archive days).
// Normal/Hard/Extreme: +1 per win, back to 0 on a loss. Story (can't lose): back to 0 if a day is missed.
const streakKey = (m = mode) => `mapleWordle:streak:${m}`;
function loadStreak(m = mode) {
  try { return JSON.parse(localStorage.getItem(streakKey(m))) || { count: 0, last: null }; } catch { return { count: 0, last: null }; }
}
function currentStreak(m = mode) {
  const s = loadStreak(m);
  if (m === 'story' && s.last != null && s.last < today() - 1) return 0;   // missed a day
  return s.count;
}
function updateStreak() {
  if (!live) return;
  const s = loadStreak();
  if (s.last === day) return;                     // already counted today
  const won = guesses.includes(answer.name);
  if (mode === 'story') s.count = s.last === day - 1 ? s.count + 1 : 1;
  else s.count = won ? s.count + 1 : 0;
  s.last = day;
  try { localStorage.setItem(streakKey(), JSON.stringify(s)); } catch {}
  renderStreak();
}
function renderStreak() {
  $('streak').textContent = `Win Streak: ${currentStreak()} 🔥`;
}

const nextHint = () => live ? 'Come back tomorrow for a new boss.' : 'Pick another day from the Archive.';

// Puzzle #1 is launch day; numbers count up by one every UTC day.
const FIRST_DAY = Date.UTC(2026, 9, 10) / DAY_MS;
const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// Archive (the shared window is archive.js): this page's result for a mode and day.
function resultFor(m, d) {
  const saved = load(d, m), ans = answerFor(m, d), max = data.attempts[m];
  if (saved.includes(ans.name)) return `Won ${saved.length}/${max ?? '∞'}`;
  if (max != null && saved.length >= max) return 'Lost';
  return saved.length ? `In progress (${saved.length} guesses)` : 'Not played';
}
window.archiveHere = {
  modes: ['story', 'normal', 'hard', 'extreme'],
  current: () => document.querySelector('#modes .on').dataset.mode,
  result: resultFor,
  play: (m, d) => { setMode(m); start(d); },
};
// Remember finished results so the archive on other pages can show them.
const noteResult = () => { if (over) try { localStorage.setItem(`mapleWordle:result:${mode}:${day}`, resultFor(mode, day)); } catch {} };
// Highlight a mode button on the main page (start() reads the highlighted one).
function setMode(m) {
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === m);
}
const closeArchive = () => { $('archive').hidden = true; };
const EMOJI = { green: '🟩', yellow: '🟨', red: '🟥' };
const MODE_NAME = { story: 'Story', normal: 'Normal', hard: 'Hard', extreme: 'Extreme' };

function shareText() {
  const won = guesses.includes(answer.name);
  const score = (won ? guesses.length : 'X') + '/' + (maxGuesses ?? '∞');
  const grid = guesses.map((name) =>
    columnOrder(guessCells(pool.find((e) => e.name === name))).map(([, c]) => EMOJI[c]).join(''));
  const hintNote = mode === 'story' ? ` (${hints.length} hint${hints.length === 1 ? '' : 's'})` : '';
  return [`Maple Wordle #${day - FIRST_DAY + 1} (${MODE_NAME[mode]}) ${score}${hintNote}`, ...grid, 'https://ima.moe/maplewordle/'].join('\n');
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
    || pool.filter((e) => !guesses.includes(e.name) && e.boss.toLowerCase().includes(name.split('(')[0].trim()))
      .sort(byNameThenDifficulty)[0];
  if (!g) return updateStatus('Pick a boss from the list.');
  if (guesses.includes(g.name)) return updateStatus('Already guessed.');
  $('guess').value = '';
  $('guess').blur();   // unfocus, so the next click on the box opens the list again
  closeList();
  record(g);
  save();
  // Flip the new row in; on a win, confetti once the last cell has turned over.
  let flipMs = flipRow($('rows').querySelector('tr:not(.bestrow):not(.hintrow):not(.answer)'));
  flipMs = flipRow($('rows').querySelector('tr.answer'), flipMs);   // out of guesses: the answer turns over next
  // A Story win that took 7+ guesses gets no confetti and no win sound. Sounds are for today's puzzle only.
  const won = guesses.includes(answer.name);
  const quietWin = won && mode === 'story' && guesses.length >= 7;
  if (over && won && !quietWin) setTimeout(() => confetti(guesses.length === 1), flipMs);
  if (over && live && !quietWin) resultSound(won, flipMs, !won && mode === 'extreme' ? 'extremeLose' : undefined);
  for (const el of [$('status'), $('share'), $('rows').querySelector('.bestrow')]) revealAfter(el, flipMs);
  if (over) { updateStreak(); loadStats(); noteResult(); }
}

// Dropdown drawn inside the page (not the browser's native popup), so it shows up on screen shares.
// Dropdown order: boss name A-Z, then difficulty from easiest to hardest (matters in Extreme).
const DIFF_ORDER = { Easy: 0, Normal: 1, Hard: 2, Chaos: 2, Hell: 3, Extreme: 4 };
const byNameThenDifficulty = (a, b) =>
  a.boss.localeCompare(b.boss) || (DIFF_ORDER[a.difficulty] ?? 9) - (DIFF_ORDER[b.difficulty] ?? 9);
function openList() {
  // Match the boss name only: the "(Hard)" / "(Chaos)" part is ignored, in the list and in what's typed.
  const q = $('guess').value.split('(')[0].trim().toLowerCase();
  matches = pool.filter((e) => !guesses.includes(e.name) && e.boss.toLowerCase().includes(q))
    .sort(byNameThenDifficulty);   // A-Z, so the list order gives nothing away
  // If the full name was typed (e.g. "Gollux (Normal)"), highlight that exact one so Enter picks it.
  const typed = $('guess').value.trim().toLowerCase();
  active = Math.max(0, matches.findIndex((e) => e.name.toLowerCase() === typed));
  renderList();
}
function renderList() {
  const list = $('list');
  list.innerHTML = '';
  matches.forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'item' + (i === active ? ' active' : '');
    if (e.image) {
      const img = document.createElement('img');
      img.src = e.image;
      img.alt = '';
      div.appendChild(img);
    } else {
      div.appendChild(document.createElement('div')).className = 'noimg';
      div.lastChild.textContent = '?';
    }
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
$('hint').addEventListener('click', useHint);
$('share').addEventListener('click', share);
$('archiveClose').addEventListener('click', closeArchive);
// Changelog: read CHANGELOG.md and show "## version" headings with their "- item" lines.
async function openChangelog() {
  const body = $('changelogBody');
  if (!body.childElementCount) {
    try {
      const md = await (await fetch('CHANGELOG.md', { cache: 'no-cache' })).text();
      let list = null;
      for (const line of md.split('\n')) {
        if (line.startsWith('## ')) {
          // "## alpha v1.1 - 10 October 2026": version in bold, then "- date" in smaller text.
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
// "?" How to play window. Same for every tab except the guess count and the Story / Extreme only lines.
const DISCORD = 'https://discord.gg/f22H4UJ';
function infoHtml(m) {
  const guesses = { story: '<b>unlimited</b> guesses', normal: '<b>6</b> guesses', hard: '<b>5</b> guesses', extreme: '<b>5</b> guesses' }[m];
  const rules = [
    `Guess today's boss in ${guesses}. New boss every day at 00:00 UTC (same as Maple reset).`,
    'Each guess shows how close you are:<ul><li>🟩 right · 🟨 close · 🟥 wrong</li><li>↑ / ↓ = the answer is higher / lower</li></ul>',
    'Close = Phases ±1, HP within 3×, Entry Lv ±10, Region partly overlaps.',
    'HP is all phases added together. Entry Lv = level needed to enter.',
    'Unknown = red with no arrow (no data for it yet).',
    'Seasonal and KMS-only bosses can appear.',
    ...(m === 'extreme' ? ['You also guess the difficulty. Hard = Chaos and Extreme = Hell count as the same.',
                           'Unreleased, removed and special bosses can appear.'] : []),
    ...(m === 'story' ? ['A hint unlocks every 3 guesses.'] : []),
    'The <b>Best so far</b> row shows your best clue for each column.',
    m === 'story' ? 'Win streak resets if you miss a day.' : 'Win streak resets when you lose.',
  ];
  const phases = [
    'Kalos P2 segments count as 1 phase, and so do Kaling P3 segments and P1 perils.',
    'Kai and Meilin have 1 HP bar but count as 2 phases.',
    'Malefic Star and Jupiter count as 1 phase, even with 3 sub-phases.',
  ];
  const ul = (items) => '<ul>' + items.map((x) => `<li>${x}</li>`).join('') + '</ul>';
  return `<h3>${MODE_NAME[m]}</h3>${ul(rules)}<h3>Phases</h3>${ul(phases)}` +
    `<p class="warn">⚠️ Some info may not be accurate. If you spot a mistake, please report it on the <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>.</p>`;
}
function openInfo() {
  $('infoBody').innerHTML = infoHtml(document.querySelector('#modes .on').dataset.mode);
  $('info').hidden = false;
}
$('infoBtn').addEventListener('click', openInfo);
$('infoClose').addEventListener('click', () => { $('info').hidden = true; });
$('version').addEventListener('click', openChangelog);
$('changelogClose').addEventListener('click', () => { $('changelog').hidden = true; });
// Clicking the credit makes a random character peek out from behind it for 2 seconds. No cooldown:
// each click picks again, and clicking the one already out keeps her out for another 2 seconds.
const peekTimers = new Map();
$('credit').addEventListener('click', () => {
  const all = document.querySelectorAll('.peekclip');
  const who = all[Math.floor(Math.random() * all.length)];
  who.classList.add('up');
  clearTimeout(peekTimers.get(who));
  peekTimers.set(who, setTimeout(() => who.classList.remove('up'), 350 + 2000));
});
// Clicking the dark area outside a window (not the window itself) closes it.
for (const id of ['archive', 'changelog', 'info']) {
  $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).hidden = true; });
}
// Esc closes whichever window is open.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  $('changelog').hidden = true;
  $('info').hidden = true;
  closeArchive();
});
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
  .then((d) => {
    data = d;
    const req = window.archiveRequest;   // opened from the archive on another page
    if (req && window.archiveHere.modes.includes(req.mode)) { setMode(req.mode); start(req.day); }
    else start();
  })
  .catch(() => { $('status').textContent = 'Could not load data/bosses.json'; });

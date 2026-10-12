// Guess the Class - Attack Animation. Watch the skill clip and guess the class. Unlimited guesses; a wrong guess
// only says "wrong", but each one unlocks the next hint, in this order:
//   clip 1 (from the start) -> clip 2 (only if the class has one) -> one category per guess (random order per day)
//   -> the class's first letter (last hint)
// Winning within 3 guesses gets confetti and the win sound.
let data, pool, all, day, live, answer, guesses, over, matches, active;

const $ = (id) => document.getElementById(id);

const STATS_URL = 'https://maplewordle-stats.hanayuki.workers.dev/';
const MODE = 'anim';    // key for saves, streak and the stats Worker
const DAY_MS = 86400000;
const today = () => Math.floor(Date.now() / DAY_MS); // resets at 00:00 UTC

// Puzzle #1 is launch day. Set this to the real launch day before going live.
const FIRST_DAY = Date.UTC(2026, 9, 12) / DAY_MS;
const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const CELEBRATE_UP_TO = 3;   // confetti + win sound only for a win within this many guesses

// Daily answer: same shuffled-cycle rules as the other games, over the classes that have clips.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
// The answer is a puzzle (a class + its clips; a class can have several). data/animation.json "days" fixes the
// first puzzles by id ([1, 2] = puzzle #1 is id 1, #2 is id 2); after those, a shuffled cycle over every puzzle.
let schedule;
function answerFor(d) {
  if (!schedule) {
    const fixed = (data.fixedDays || []).map((id) => pool.find((e) => e.id === id)).filter(Boolean);
    schedule = { days: fixed, used: new Set(fixed.map((e) => e.id)) };
  }
  const s = schedule;
  while (FIRST_DAY + s.days.length <= d) {
    const day = FIRST_DAY + s.days.length;
    const prev = s.days[s.days.length - 1];
    const eligible = pool.filter((e) => (e.since ?? 0) <= day);
    let left = eligible.filter((e) => !s.used.has(e.id));
    if (!left.length) { s.used.clear(); left = eligible; }        // cycle done: everyone is back in
    const fresh = left.filter((e) => !prev || e.name !== prev.name);   // never the same class two days running
    if (fresh.length) left = fresh;
    let pick = left[0], best = Infinity;
    for (const e of left) {
      const v = hash(`${MODE}|${day}|${e.id}`);
      if (v < best) { best = v; pick = e; }
    }
    s.used.add(pick.id);
    s.days.push(pick);
  }
  return s.days[d - FIRST_DAY];
}

// ---- Clues ----

const yearText = (e) => e.yearLabel ?? e.year ?? 'Unknown';
const CATS = [
  { key: 'faction', show: (e) => e.faction },
  { key: 'branch', show: (e) => e.branch.join(' / ') },
  { key: 'stat', show: (e) => e.stat.join(', ') },
  { key: 'year', show: yearText },
  { key: 'region', show: (e) => e.region },
];
// The order categories unlock in: shuffled per day, the same for everyone.
const catOrder = (d) => CATS.map((c) => c.key).sort((x, y) => hash(`${MODE}|${d}|${x}`) - hash(`${MODE}|${d}|${y}`));

// Hints after clip 1, one per wrong guess: clip 2 if the class has one, the categories, then the first letter.
// Hint order after clip 1: clip 2 -> clip 1's skill name -> clip 2's skill name -> categories (random order) -> first letter.
// Steps the puzzle doesn't have (no clip 2, no skill names) are skipped.
const hasClip2 = () => answer.videos.length > 1;
const hintOrder = () => [
  ...Array(answer.hintDelay || 0).fill('wait'),   // some puzzles hold back the first hint for a guess or more
  ...(hasClip2() ? ['clip2'] : []),
  ...(answer.skills?.[0] ? ['skill1'] : []),
  ...(hasClip2() && answer.skills?.[1] ? ['skill2'] : []),
  ...catOrder(day), 'letter',
];
// What you can see while making guess number n. Everything once the game is over.
function cluesFor(n) {
  return new Set(over ? hintOrder() : hintOrder().slice(0, n - 1));
}

const clipSrc = (e, n) => `videos/anim/video${e.videos[n - 1]}`;
// Put clip n (or its lock) in place. Only rebuilt when something changed, so a playing clip doesn't restart.
function showClip(n, open) {
  const fig = $('clip' + n);
  const has = answer.videos.length >= n;
  const state = `${day}|${answer.id}|${open && has}`;
  if (fig.dataset.state === state) return;
  fig.dataset.state = state;
  fig.querySelector('video, .locked')?.remove();
  if (open && has) {
    const v = document.createElement('video');
    v.muted = v.autoplay = v.loop = v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.poster = clipSrc(answer, n) + '.jpg';
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const src = document.createElement('source');
      src.src = clipSrc(answer, n) + '.' + ext;
      src.type = type;
      v.appendChild(src);
    }
    fig.prepend(v);
  } else {
    const lock = document.createElement('div');
    lock.className = 'locked';
    lock.textContent = '🔒';
    fig.prepend(lock);
  }
}
function renderClues() {
  const c = cluesFor(guesses.length + 1);
  showClip(1, true);
  $('clip2').hidden = !hasClip2();   // one-clip classes just show the one
  if (!$('clip2').hidden) showClip(2, c.has('clip2'));
  // Skill name under each clip, in the same green / locked style as the categories.
  [1, 2].forEach((n) => {
    const td = $('skill' + n), sk = answer.skills?.[n - 1];
    td.parentElement.hidden = !sk;
    if (!sk) return;
    const open = c.has('skill' + n);
    td.textContent = !open ? '🔒' : (over && answer.skillsFull?.[n - 1]) || sk;   // full name only at the end
    td.className = open ? 'green' : 'grey';
  });
  const row = $('clueRow');
  row.innerHTML = '';
  for (const cat of [...CATS, { key: 'letter', show: (e) => e.name[0] }]) {
    const td = row.insertCell();
    if (c.has(cat.key)) { td.textContent = cat.show(answer); td.className = 'green'; }
    else { td.textContent = '🔒'; td.className = 'grey'; }   // which guess unlocks it is a surprise
  }
}

// ---- Guesses: one bar each (portrait + name), green if right, red if wrong ----

function guessRow(g) {
  const bar = document.createElement('div');
  bar.className = 'gbar ' + (g.name === answer.name ? 'green' : 'red');
  const img = document.createElement('img');
  img.src = g.image;
  img.alt = '';
  bar.appendChild(img);
  bar.appendChild(document.createElement('span')).textContent = g.name;
  $('rows').prepend(bar);
  return bar;
}

// Win screen: the class, and a thank-you to whoever recorded the clips (with their character, if there's a picture).
function renderCongrats() {
  const box = $('congrats');
  box.hidden = !(over && guesses.includes(answer.name));
  if (box.hidden) return;
  $('congratsClass').textContent = `Their class was ${answer.name}!`;
  $('congratsThanks').textContent = answer.credit ? `Thank you ${answer.credit}!` : '';
  $('congratsThanks').hidden = !answer.credit;
  $('congratsImg').hidden = !answer.creditImage;
  if (answer.creditImage) $('congratsImg').src = answer.creditImage;
}

// ---- Game flow ----

const byName = (n) => all.find((e) => e.name === n);
const saveKey = (d = day) => `mapleWordle:${MODE}:${d}`;
function load(d) {
  try { return JSON.parse(localStorage.getItem(saveKey(d))) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify(guesses)); } catch {}
}

function start(d) {
  live = d == null || d === today();
  day = live ? today() : d;
  answer = answerFor(day);
  $('puzzle').textContent = `Puzzle #${day - FIRST_DAY + 1} (${dateLabel(day)})` + (live ? '' : ' - Archive');
  $('today').hidden = live;
  guesses = [];
  over = false;
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
  renderClues();
  renderCongrats();
  if (!over) updateStatus();
  else loadStats();
  renderStreak();
}

function updateStatus(msg) {
  $('status').textContent = msg || (guesses.length ? `Guesses: ${guesses.length} (unlimited)` : 'Unlimited guesses');
}

function record(g) {
  guesses.push(g.name);
  guessRow(g);
  if (g.name === answer.name) {
    over = true;
    updateStatus(`Correct! It was ${answer.name}, in ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}. ${nextHint()}`);
  } else {
    updateStatus();
  }
  $('share').hidden = !over;
  $('picker').hidden = over;
  if (over) closeList();
}
const nextHint = () => live ? 'Come back tomorrow for a new class.' : 'Pick another day from the Archive.';

function guess(name) {
  if (over) return;
  const g = byName(name);
  if (!g || guesses.includes(g.name)) return;
  $('guess').value = '';
  $('guess').blur();   // unfocus, so the next click on the box opens the list again
  closeList();
  record(g);
  save();
  $('rows').firstElementChild.classList.add('flip');   // the new bar flips in
  const flipMs = FLIP_TIME;
  renderCongrats();
  for (const el of [$('status'), $('share'), $('congrats')]) revealAfter(el, flipMs);
  // The next clue (clip 2 / a category / the letter) appears once the row has turned over.
  setTimeout(renderClues, flipMs);
  const won = over && g.name === answer.name;
  if (won && guesses.length <= CELEBRATE_UP_TO) {
    setTimeout(confetti, flipMs);
    if (live) resultSound(true, flipMs);
  }
  if (over) { updateStreak(); loadStats(); }
}

// ---- Class picker (all 62 classes, A-Z) ----

const search = (q) => all
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
    // Left click only (released over the same option); the highlight follows the mouse for Enter.
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

// ---- Everyone's results (unlimited guesses: bars 1-6 and 7+) ----

async function loadStats() {
  if (!STATS_URL) return;
  const sentKey = `mapleWordle:sent:${MODE}:${day}`;
  const url = `${STATS_URL}?mode=${MODE}&day=${day}`;
  const shownDay = day;
  let sent = false;
  try { sent = localStorage.getItem(sentKey) === '1'; } catch {}
  try {
    const score = Math.min(guesses.length, 999);
    const res = sent ? await fetch(url)
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
    if (!res.ok) return;
    const { counts } = await res.json();
    if (!sent) { try { localStorage.setItem(sentKey, '1'); } catch {} }
    if (day === shownDay && over) renderStats(counts, score > 6 ? '7+' : String(score));
  } catch {}
}
function renderStats(counts, mine) {
  const bars = [...Array(6)].map((_, i) => ({ key: String(i + 1), label: String(i + 1), n: counts[String(i + 1)] || 0 }));
  bars.push({ key: '7+', label: '7+', n: Object.entries(counts).filter(([k]) => Number(k) > 6).reduce((n, [, c]) => n + c, 0) });
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
  let sum = 0;
  for (const [k, c] of Object.entries(counts)) sum += Number(k) * c;
  $('statsAvg').textContent = total ? `Average: ${(sum / total).toFixed(1)} guesses` : '';
  $('stats').hidden = false;
}

// ---- Win streak (today's puzzle only). You can't lose, so it resets if you miss a day. ----

const streakKey = `mapleWordle:streak:${MODE}`;
function loadStreak() {
  try { return JSON.parse(localStorage.getItem(streakKey)) || { count: 0, last: null }; } catch { return { count: 0, last: null }; }
}
function updateStreak() {
  if (!live) return;
  const s = loadStreak();
  if (s.last === day) return;
  s.count = s.last === day - 1 ? s.count + 1 : 1;
  s.last = day;
  try { localStorage.setItem(streakKey, JSON.stringify(s)); } catch {}
  renderStreak();
}
function renderStreak() {
  const s = loadStreak();
  $('streak').textContent = `Win Streak: ${s.last != null && s.last < today() - 1 ? 0 : s.count} 🔥`;
}

// ---- Archive ----

function openArchive() {
  const list = $('archiveList');
  list.innerHTML = '';
  for (let d = today(); d >= FIRST_DAY; d--) {
    const saved = load(d);
    const ans = answerFor(d);
    let result = 'Not played';
    if (saved.includes(ans.name)) result = `Won in ${saved.length}`;
    else if (saved.length) result = `In progress (${saved.length} guesses)`;
    const btn = document.createElement('button');
    btn.textContent = `#${d - FIRST_DAY + 1} - ${dateLabel(d)}${d === today() ? ' (today)' : ''} - ${result}`;
    btn.addEventListener('click', () => { closeArchive(); start(d); });
    list.appendChild(btn);
  }
  $('archive').hidden = false;
}
const closeArchive = () => { $('archive').hidden = true; };

// ---- Share ----

function shareText() {
  const grid = guesses.map((n) => n === answer.name ? '🟩' : '🟥').join('');
  return [`Maple Wordle - Attack Animation #${day - FIRST_DAY + 1} ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}`,
    grid, 'https://ima.moe/maplewordle/animation'].join('\n');
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
    "Watch the skill clip and guess today's class. <b>Unlimited</b> guesses. New class every day at 00:00 UTC (same as Maple reset).",
    'A wrong guess only tells you it\'s wrong, but each one unlocks the next hint:<ul>' +
      '<li>a second clip (some classes)</li><li>the name of each clip\'s skill</li><li>then one category per guess (Faction, Job Branch, Main Stat, Release Year, Region), in a random order</li>' +
      "<li>last: the class's first letter</li></ul>",
    `Win within ${CELEBRATE_UP_TO} guesses for confetti and the win sound.`,
    'Every class is on its own here (Hero, Paladin and Dark Knight are separate answers).',
    'Removed, event and upcoming classes can appear.',
    'Win streak resets if you miss a day.',
  ];
  $('infoBody').innerHTML = '<ul>' + rules.map((x) => `<li>${x}</li>`).join('') + '</ul>' +
    `<p class="warn">⚠️ Some info may not be accurate. If you spot a mistake, please report it on the <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>.</p>`;
  $('info').hidden = false;
}
// Click a clip or the win-screen picture to see it as big as the window allows (closes like the Changelog).
function openZoom(el) {
  const body = $('zoomBody');
  body.innerHTML = '';
  let big;
  if (el.tagName === 'VIDEO') {
    big = document.createElement('video');
    big.muted = big.autoplay = big.loop = big.playsInline = true;
    big.setAttribute('playsinline', '');
    for (const src of el.querySelectorAll('source')) big.appendChild(src.cloneNode());
  } else {
    big = document.createElement('img');
    big.src = el.src;
  }
  body.appendChild(big);
  $('zoom').hidden = false;
}
function closeZoom() { $('zoom').hidden = true; $('zoomBody').innerHTML = ''; }
for (const id of ['clip1', 'clip2']) $(id).addEventListener('click', (e) => { const v = $(id).querySelector('video'); if (v) openZoom(v); });
$('congratsImg').addEventListener('click', () => openZoom($('congratsImg')));
$('zoomClose').addEventListener('click', closeZoom);
$('zoom').addEventListener('click', (e) => { if (e.target === $('zoom')) closeZoom(); });
$('infoBtn').addEventListener('click', openInfo);
$('infoClose').addEventListener('click', () => { $('info').hidden = true; });
$('version').addEventListener('click', openChangelog);
$('changelogClose').addEventListener('click', () => { $('changelog').hidden = true; });
$('share').addEventListener('click', share);
$('archiveBtn').addEventListener('click', () => { if (pool && pool.length) openArchive(); });
$('archiveClose').addEventListener('click', closeArchive);
for (const id of ['archive', 'changelog', 'info']) {
  $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).hidden = true; });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  $('changelog').hidden = true;
  $('info').hidden = true;
  closeZoom();
  closeArchive();
});
$('today').addEventListener('click', () => start());

function tick() {
  if (pool && pool.length && live && today() !== day) start();
  const s = Math.floor(((today() + 1) * DAY_MS - Date.now()) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  $('timer').textContent = `New class in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)} (resets 00:00 UTC)`;
}
tick();
setInterval(tick, 1000);

Promise.all(['data/classes.json', 'data/animation.json'].map((u) => fetch(u, { cache: 'no-cache' }).then((r) => r.json())))
  .then(([c, a]) => {
    data = c;
    all = c.solo;
    data.fixedDays = a.days;
    // Answer pool: one entry per puzzle, carrying its class's data. "since" (YYYY-MM-DD) -> day number.
    pool = a.puzzles.filter((p) => p.videos?.length && all.some((e) => e.name === p.class)).map((p) => ({
      ...all.find((e) => e.name === p.class), id: p.id, videos: p.videos, skills: p.skills, skillsFull: p.skillsFull, hintDelay: p.hintDelay, credit: p.credit, creditImage: p.creditImage,
      ...(p.since ? { since: Date.parse(p.since) / DAY_MS } : {}),
    }));
    if (!pool.length) {
      $('status').textContent = 'Attack Animation is coming soon: clips are still being added.';
      $('picker').hidden = true;
      $('clips').hidden = $('clues').hidden = true;
      return;
    }
    start();
  })
  .catch(() => { $('status').textContent = 'Could not load the class data.'; });

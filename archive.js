// One Archive for every game: a tab per game / mode, and a day list with your result. Clicking a day opens that game
// on that day (here if it's this page, otherwise by going to the game's page with ?mode=...&day=...).
// Each game page sets window.archiveHere = { modes, result(mode, day), play(mode, day) } for its own modes; other
// games' results come from what they recorded in the browser (mapleWordle:result:<mode>:<day>).
(() => {
  const DAY_MS = 86400000;
  const today = () => Math.floor(Date.now() / DAY_MS);
  const D = (y, m, d) => Date.UTC(y, m - 1, d) / DAY_MS;
  const TABS = [
    // row: which line of tabs it sits on (Boss Wordle modes / Boss clips / Class)
    { mode: 'story', label: 'Boss - Story', page: './', first: D(2026, 10, 10), row: 0 },
    { mode: 'normal', label: 'Boss - Normal', page: './', first: D(2026, 10, 10), row: 0 },
    { mode: 'hard', label: 'Boss - Hard', page: './', first: D(2026, 10, 10), row: 0 },
    { mode: 'extreme', label: 'Boss - Extreme', page: './', first: D(2026, 10, 10), row: 0 },
    { mode: 'bgm', label: 'Boss - BGM Clip', page: 'bgm', first: D(2026, 10, 20), row: 1 },
    { mode: 'sound', label: 'Boss - Sound Clip', soon: true, row: 1 },   // coming soon: shown, can't be opened
    { mode: 'class', label: 'Class - Wordle', page: 'class', first: D(2026, 10, 11), row: 2 },
    { mode: 'anim', label: 'Class - Attack Animation', page: 'animation', first: D(2026, 10, 12), row: 2 },
  ];
  const $ = (id) => document.getElementById(id);
  const dateLabel = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  function result(t, d) {
    const here = window.archiveHere;
    if (here && here.modes.includes(t.mode)) { try { return here.result(t.mode, d); } catch {} }
    const rec = read(`mapleWordle:result:${t.mode}:${d}`);
    if (rec) return rec;
    let n = 0;
    try { n = (JSON.parse(read(`mapleWordle:${t.mode}:${d}`)) || []).length; } catch {}
    return n ? `Played (${n} guess${n === 1 ? '' : 'es'})` : 'Not played';
  }
  function open(mode) {
    const t = TABS.find((x) => x.mode === mode && !x.soon) || TABS[0];
    let tabs = $('archiveTabs');
    if (!tabs) { tabs = document.createElement('div'); tabs.id = 'archiveTabs'; $('archiveList').before(tabs); }
    tabs.innerHTML = '';
    const rows = [];
    for (const x of TABS) {
      const row = rows[x.row] ??= tabs.appendChild(Object.assign(document.createElement('div'), { className: 'tabrow' }));
      const b = document.createElement('button');
      b.textContent = x.label;
      b.className = x.mode === t.mode ? 'on' : '';
      if (x.soon) { b.disabled = true; b.title = 'Coming soon'; }
      else b.addEventListener('click', () => open(x.mode));
      row.appendChild(b);
    }
    const list = $('archiveList');
    list.innerHTML = '';
    for (let d = today(); d >= t.first; d--) {
      const btn = document.createElement('button');
      const r = result(t, d);
      const firstTry = /^Won (1\/|in 1$)/.test(r);   // won on the first guess: a star and a gold glow
      const diamond = r.endsWith('💎');   // BGM Clip: first guess and the bonus right (the result already ends in 💎)
      const star = firstTry && !diamond ? ' ⭐' : '';
      if (firstTry) btn.className = diamond ? 'diamond' : 'firsttry';   // 💎 glows blue instead of gold
      btn.textContent = `#${d - t.first + 1} - ${dateLabel(d)}${d === today() ? ' (today)' : ''} - ${r}${star}`;
      btn.addEventListener('click', () => {
        const here = window.archiveHere;
        if (here && here.modes.includes(t.mode)) { $('archive').hidden = true; here.play(t.mode, d); }
        else location.href = `${t.page}?mode=${t.mode}&day=${d}`;
      });
      list.appendChild(btn);
    }
    $('archive').hidden = false;
  }
  // Replace the page's own Archive button handler with this one (cloning drops the old listener).
  const old = $('archiveBtn'), btn = old.cloneNode(true);
  old.replaceWith(btn);
  btn.addEventListener('click', () => open(window.archiveHere?.current?.() ?? TABS[0].mode));
  window.openGlobalArchive = open;
})();
// Read ?mode=&day= (from the archive on another page), then tidy the address bar.
window.archiveRequest = (() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('day')) return null;
  history.replaceState(null, '', location.pathname);
  return { mode: q.get('mode'), day: Number(q.get('day')) };
})();

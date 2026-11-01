// Every game runs inside this one page (in a frame), so the address bar stays at ima.moe/maplewordle/ and the background
// music keeps playing from game to game (fx.js keeps it here, in this page, not in the game's).
// Links: /boss/story, /boss/normal, /boss/hard, /boss/extreme, /bgm/normal, /bgm/extreme, /class/, /class/animation
// (and short ones like /extreme or /animation). Those aren't real files, so GitHub's 404.html sends them here as ?r=...
// A game page opened on its own (an old link to /class or /bgm) comes here the same way (move.js).
window.mwShell = true;
(() => {
  if (window.top !== window) { location.replace('boss' + location.search); return; }   // the site inside itself: just the game
  const BOSS = ['story', 'normal', 'hard', 'extreme'];
  // A link's path -> [game page, mode]
  const route = (r) => {
    const [a = '', b = ''] = r.toLowerCase().replace(/\.html$/, '').split('/').filter(Boolean);
    if (BOSS.includes(a)) return ['boss', a];
    if (a === 'bgm') return ['bgm', { normal: 'bgmnormal', extreme: 'bgm', bgmnormal: 'bgmnormal', bgm: 'bgm' }[b]];
    if (a === 'animation' || a === 'anim') return ['animation'];
    if (a === 'class') return [b === 'animation' || b === 'anim' ? 'animation' : 'class'];
    return ['boss', BOSS.includes(b) ? b : undefined];   // boss/..., the main page, and anything not made yet (map, boss/sound)
  };
  const q = new URLSearchParams(location.search);
  const here = location.pathname.replace(/index\.html$/, '');
  let src;
  if (q.has('r')) {
    const [page, mode] = route(q.get('r'));
    q.delete('r');
    if (mode && !q.has('mode')) q.set('mode', mode);
    src = page + ([...q].length ? '?' + q : '');
  } else if (history.state?.src) src = history.state.src;   // a reload: the game you were on
  else src = 'boss' + location.search;
  history.replaceState({ src }, '', here + location.hash);
  const frame = document.getElementById('game');
  // Remember the game and its mode (for a reload), when it opens and again when leaving (you may have switched modes).
  const keep = (opening) => {
    try {   // (opening: the game hasn't picked its mode yet, so the one it was asked for)
      const w = frame.contentWindow, mode = opening ? w.archiveRequest?.mode : w.archiveHere?.current?.();
      const page = w.location.pathname.split('/').pop() || 'boss';
      history.replaceState({ src: page + (mode ? '?mode=' + mode : '') }, '', here + location.hash);
    } catch {}
  };
  addEventListener('beforeunload', () => keep());
  frame.addEventListener('load', () => {
    try {
      const w = frame.contentWindow;
      document.title = w.document.title;
      keep(true);
      if (!document.documentElement.classList.contains('devlock')) w.focus();   // typing goes to the game right away
    } catch {}
  });
  frame.src = src;
})();

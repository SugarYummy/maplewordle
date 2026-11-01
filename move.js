// Maple Wordle lives at ima.moe/maplewordle. Browsers keep saves per website, so github.io and ima.moe each
// have their own. Visiting the github.io address sends you to the same page on ima.moe and brings your
// github.io saves along in the link (#import=...), where they're merged in before the game starts.
// Loaded in <head> (not deferred) so it runs before the game script.
(() => {
  const PREFIX = 'mapleWordle:';
  if (location.hostname === 'sugaryummy.github.io') {
    const saves = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX)) saves[k] = localStorage.getItem(k);
      }
    } catch {}
    const path = location.pathname.replace(/^\/maplewordle/, '');
    const hash = Object.keys(saves).length
      ? '#import=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(saves))))) : '';
    location.replace('https://ima.moe/maplewordle' + (path || '/') + location.search + hash);
    return;
  }
  try { if (window.parent !== window && window.parent.document.documentElement.hasAttribute('data-shell')) document.documentElement.classList.add('inshell'); } catch {}
  // A game page opened on its own (ima.moe/maplewordle/class, an old link): open it in the main page instead, which
  // keeps the music going between games (shell.js).
  if (window.top === window && !document.documentElement.hasAttribute('data-shell')) {
    const page = location.pathname.split('/').pop().replace(/\.html$/, '');
    if (['boss', 'class', 'bgm', 'animation'].includes(page)) {
      const q = new URLSearchParams(location.search);
      q.set('r', page);
      location.replace(location.pathname.replace(/[^/]*$/, '') + '?' + q + location.hash);
      return;
    }
  }
  const m = location.hash.match(/^#import=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);   // tidy the address bar
  let saves;
  try { saves = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch { return; }
  const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
  for (const [k, v] of Object.entries(saves)) {
    if (!k.startsWith(PREFIX) || typeof v !== 'string') continue;
    try {
      const have = localStorage.getItem(k);
      if (have == null) { localStorage.setItem(k, v); continue; }
      const a = parse(have), b = parse(v);
      if (k.startsWith(PREFIX + 'streak:')) {
        // Keep the more recent streak (the higher one if both are from the same day).
        if (b && (!a || (b.last ?? -1) > (a.last ?? -1) || (b.last === a.last && b.count > a.count))) localStorage.setItem(k, v);
      } else if (Array.isArray(a) && Array.isArray(b) && b.length > a.length) {
        localStorage.setItem(k, v);   // guesses / hints for a day: keep whichever got further
      }
    } catch {}
  }
})();

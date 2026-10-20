// Small effects shared by every game page: flipping in a new guess row, confetti and sound when a game ends.
// Kept deliberately simple for now (no libraries).

const FLIP_STEP = 250;   // ms between one cell flipping and the next
const FLIP_TIME = 500;   // ms one cell takes to flip (matches style.css)

// Flip a freshly guessed row's cells in, one after another from left to right.
// start = ms to wait before the first cell. Returns when the row is done, so the next thing can wait for it.
function flipRow(tr, start = 0) {
  if (!tr) return start;
  const cells = [...tr.children];
  cells.forEach((td, i) => {
    td.classList.add('flip');
    td.style.animationDelay = `${start + i * FLIP_STEP}ms`;
  });
  return start + (cells.length - 1) * FLIP_STEP + FLIP_TIME;
}

// Keep something that would give the result away (status text, Best so far row) hidden until the flip is done.
function revealAfter(el, ms) {
  if (!el) return;
  el.classList.remove('later');
  void el.offsetWidth;   // restart the animation if it's already running
  el.style.animationDelay = ms + 'ms';
  el.classList.add('later');
}

// Confetti pieces are the in-game meso drops (sprites from maplestorywiki.net), drawn at their in-game size and kept pixel-sharp.
// [file, width, height, coin] in sprite pixels; gold coins are the most common, bags the rarest.
// Coins flip like real coins as they fly; bundles and bags don't turn at all.
const PIECES = [
  ['meso-gold', 23, 24, true], ['meso-gold', 23, 24, true], ['meso-gold', 23, 24, true],
  ['meso-bronze', 23, 24, true], ['meso-bronze', 23, 24, true],
  ['meso-bundle', 31, 30], ['meso-bundle', 31, 30],
  ['meso-bag', 32, 31],
];
for (const [file] of PIECES) new Image().src = `images/fx/${file}.png`;   // preload, so they're ready on a win
const rand = (a, b) => a + Math.random() * (b - a);

// One meso: an outer box that moves, holding the sprite (which flips if it's a coin).
function meso(box) {
  const [file, w, h, coin] = PIECES[Math.floor(Math.random() * PIECES.length)];
  const outer = document.createElement('b');
  const img = document.createElement('i');
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.backgroundImage = `url("images/fx/${file}.png")`;
  if (coin) {
    img.className = 'coin';
    img.style.animationDuration = rand(0.4, 0.9) + 's';
  }
  outer.appendChild(img);
  box.appendChild(outer);
  return outer;
}

// A meso falling from the top of the screen, starting `delay` seconds from now.
function fall(box, delay = 0) {
  const el = meso(box);
  el.className = 'fall';
  el.style.left = Math.random() * 100 + 'vw';
  el.style.animationDelay = delay + 's';
  el.style.animationDuration = rand(2.2, 3.6) + 's';
  el.style.setProperty('--drift', rand(-10, 10) + 'vw');
  setTimeout(() => el.remove(), (delay + 3.7) * 1000);
}

function fxLayer(ms) {
  const box = document.createElement('div');
  box.className = 'confetti';
  document.body.appendChild(box);
  setTimeout(() => box.remove(), ms);
  return box;
}

// Meso confetti falling from the top of the screen: a steady 120 a second for 3 s (360 in all).
// A first-guess win gets the big show instead.
function confetti(firstTry = false) {
  if (firstTry) return bigWin();
  rain(fxLayer(7000), 0, 3, 120);
}

// A puzzle won on the first guess keeps its game box glowing gold, also after a reload. Pages call this whenever
// the shown puzzle changes or gets a new guess.
function firstTryGlow(on) {
  document.querySelector('.game')?.classList.toggle('glow', on);
}

// First-guess win, timed to its music (35 s): the game box shakes (and starts glowing), meso fountains spray up from both
// bottom corners for 5 s, then mesos rain from the top, getting lighter until just before the music fades out.
function bigWin() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const game = document.querySelector('.game');
  if (game) {
    game.classList.remove('shake', 'glow');
    void game.offsetWidth;   // restart the animations if they're already running
    game.classList.add('shake', 'glow');
  }
  const box = fxLayer(33000);
  fountain(box, 5);
  rain(box, 2, 6, 300);     // 2-8 s
  rain(box, 8, 5, 120);     // 8-13 s
  rain(box, 13, 5, 60);     // 13-18 s
  rain(box, 18, 10, 30);    // 18-28 s
}

// `perSecond` mesos a second falling nonstop, from `at` seconds for `seconds` seconds.
function rain(box, at, seconds, perSecond) {
  let begin, made = 0, last = 0;
  const frame = (now) => {
    begin ??= now;
    const due = Math.floor((Math.min(now - begin, seconds * 1000)) / 1000 * perSecond);   // how many should have started by now
    if (now - last > 250) made = Math.max(made, due - 10);   // tab was in the background: don't dump them all at once
    last = now;
    for (; made < due; made++) fall(box);
    if (now - begin < seconds * 1000) requestAnimationFrame(frame);
  };
  setTimeout(() => requestAnimationFrame(frame), at * 1000);
}

// Mesos thrown up from both bottom corners for `seconds`, arcing over and falling back down (simple physics).
function fountain(box, seconds) {
  const flying = [];
  const end = performance.now() + seconds * 1000;
  let last = performance.now();
  const throwOne = (x, dir) => {
    const el = meso(box);
    el.className = 'fly';
    flying.push({ el, x, y: innerHeight, vx: dir * (rand(250, 650) * innerWidth / 1000 + 120),
                  vy: -rand(1000, 1500) * Math.sqrt(innerHeight / 800) });
  };
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (now < end) for (let k = 0; k < 8; k++) { throwOne(-10, 1); throwOne(innerWidth - 20, -1); }
    for (let i = flying.length - 1; i >= 0; i--) {
      const p = flying[i];
      p.vy += 1400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      if (p.y > innerHeight + 60) { p.el.remove(); flying.splice(i, 1); }
    }
    if (now < end || flying.length) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---- Result sounds (today's puzzle only): Star Force Success on a win, Star Force Destroy on a loss ----
// The files are full ~1 minute tracks, so only the start plays, quietly, then fades out.
// Played through Web Audio so the volume also works on iPhones (they ignore <audio> volume).
const SOUND_VOLUME = 0.06;   // 0 = silent, 1 = full (at the slider's default 50%)
const SOUND_SECONDS = 10;    // how long to play before fading out
const SOUND_FADE = 2;        // seconds of fade-out
const SOUNDS = { win: 'sounds/star-force-success.mp3', lose: 'sounds/star-force-destroy.mp3',
  extremeLose: 'sounds/burning-city.mp3',         // Seren's Burning City (first 12.5 s), for an Extreme loss
  extremeWin: 'sounds/four-auspicious-beasts.mp3',  // Kaling's Four Auspicious Beasts from 0:16 (1 s fade-in), Extreme win on guess 2+
  animWin: 'sounds/rest-of-the-broken-truth.mp3',   // Malefic Star's Rest of the Broken Truth 0:15-0:36, Attack Animation win on guess 2-3
  classLose: 'sounds/the-breeze-that-carried-sorrow.mp3',   // Malitia's The Breeze That Carried Sorrow 0:00-0:18 (1 s fade-in), Class Wordle loss
  firstTry: 'sounds/the-unblessed-cathedral-descend.mp3',   // Mayrin's The Unblessed Cathedral -Descend- 1:07-1:42 (1 s fade-in), any first-guess win
  classWin: 'sounds/succession-bloom.mp3' };   // First Adversary's Succession Bloom 1:03-1:27 (1 s fade-in), Class Wordle win on guess 2-5
// Tracks that play longer than SOUND_SECONDS: seconds before the fade-out starts (fade-out is SOUND_FADE).
const SOUND_LENGTH = { animWin: 19, classLose: 16, firstTry: 33, classWin: 22 };
// Tracks louder than SOUND_VOLUME.
const SOUND_LOUDER = { firstTry: 0.30 };
// Phone and tablet speakers are much quieter, so they play everything twice as loud (12%, and 60% for a first-guess win).
const PHONE = matchMedia('(hover: none) and (pointer: coarse)').matches;
const muteKey = 'mapleWordle:muted';
let audioCtx, master;   // master: the volume slider's gain, which every sound plays through
const muted = () => { try { return localStorage.getItem(muteKey) === '1'; } catch { return false; } };

// Volume slider, 0-100 (default 50), saved in a cookie for a year. 50 plays the volumes above as they are,
// 100 plays them twice as loud, 0 is silent.
const VOLUME_COOKIE = 'mapleWordleVolume';
const COOKIE_PATH = location.pathname.replace(/[^/]*$/, '');   // the site's folder, so every game page shares it
function sliderVolume() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${VOLUME_COOKIE}=(\\d+)`));
  return m ? Math.min(100, Number(m[1])) : 50;
}
function saveSliderVolume(v) {
  document.cookie = `${VOLUME_COOKIE}=${v}; max-age=${365 * 24 * 3600}; path=${COOKIE_PATH}; SameSite=Lax`;
  if (master) master.gain.value = v / 50;   // also changes a sound that is playing now
}

// Result sounds playing (or about to), so stopResultSounds() can cut them off (BGM Clip does when you press Play).
const resultPlaying = new Set();
let resultGen = 0;
function stopResultSounds() {
  resultGen++;
  for (const src of resultPlaying) { try { src.stop(); } catch {} }
  resultPlaying.clear();
}

// Call during the click / Enter that ends the game: browsers only allow sound that starts from a user action.
// Starts downloading the sound right away and plays it after `delay` ms (when the cards have flipped).
// `file` picks a different track (a key of SOUNDS); default is the win / lose track.
function resultSound(won, delay, file) {
  if (muted()) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      master = audioCtx.createGain();
      master.gain.value = sliderVolume() / 50;
      master.connect(audioCtx.destination);
    }
    audioCtx.resume();
  } catch { return; }
  const ctx = audioCtx;
  const ready = fetch(SOUNDS[file] || (won ? SOUNDS.win : SOUNDS.lose)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b));
  const due = Date.now() + delay;
  const gen = resultGen;
  ready.then((buffer) => {
    if (gen !== resultGen) return;   // stopped before it started
    const start = ctx.currentTime + Math.max(0, due - Date.now()) / 1000;
    const gain = ctx.createGain();
    const volume = (SOUND_LOUDER[file] ?? SOUND_VOLUME) * (PHONE ? 2 : 1);
    gain.gain.setValueAtTime(volume, start);
    const len = SOUND_LENGTH[file] ?? SOUND_SECONDS;
    gain.gain.setValueAtTime(volume, start + len);
    gain.gain.linearRampToValueAtTime(0, start + len + SOUND_FADE);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain).connect(master);
    src.start(start);
    src.stop(start + len + SOUND_FADE);
    resultPlaying.add(src);
    src.onended = () => resultPlaying.delete(src);
  }).catch(() => {});
}

// Sound on/off button and volume slider in the top right corner (both remembered per browser).
// The slider shows on hover (computers) or after a tap on the button (phones).
// Turning sound off also stops a sound playing now.
(() => {
  const box = document.createElement('div');
  box.id = 'soundBox';
  box.className = 'panel';
  const btn = document.createElement('button');
  btn.id = 'soundBtn';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = sliderVolume();
  const show = () => {
    btn.textContent = muted() ? '🔇' : '🔊';
    btn.title = muted() ? 'Sound off (click to turn on)' : 'Sound on (click to turn off)';
    slider.title = `Volume ${slider.value}%`;
    slider.disabled = muted();
  };
  // Phones can't hover, so there the first tap opens the slider and the next tap mutes; tapping elsewhere closes it.
  btn.addEventListener('click', () => {
    if (PHONE && !box.classList.contains('open')) return box.classList.add('open');
    try { localStorage.setItem(muteKey, muted() ? '0' : '1'); } catch {}
    if (muted() && audioCtx) { audioCtx.close(); audioCtx = master = null; }
    show();
  });
  slider.addEventListener('input', () => { saveSliderVolume(slider.value); show(); placeTip(); });

  // "50%" bubble under the slider's dot: shows while the pointer is on the dot or dragging it, follows it as it moves.
  const tip = document.createElement('div');
  tip.id = 'volTip';
  tip.hidden = true;
  let held = false;
  const dotX = () => {   // the dot's centre on screen (browsers draw it about 16 px wide, kept inside the track)
    const r = slider.getBoundingClientRect();
    return r.left + 8 + (r.width - 16) * slider.value / 100;
  };
  const placeTip = () => {
    if (tip.hidden) return;
    tip.textContent = slider.value + '%';
    tip.style.left = dotX() - box.getBoundingClientRect().left + 'px';
  };
  const showTip = (on) => { tip.hidden = !on; placeTip(); };
  slider.addEventListener('pointermove', (e) => { if (!held) showTip(Math.abs(e.clientX - dotX()) <= 10); });
  slider.addEventListener('pointerleave', () => { if (!held) showTip(false); });
  slider.addEventListener('pointerdown', () => { held = true; box.classList.add('held'); showTip(true); });
  addEventListener('pointerup', () => { if (held) { held = false; box.classList.remove('held'); showTip(false); } });
  addEventListener('pointercancel', () => { if (held) { held = false; box.classList.remove('held'); showTip(false); } });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) box.classList.remove('open'); });
  show();
  box.append(btn, slider, tip);
  document.body.appendChild(box);
})();

// "NEW" tag on a game tab (data-new="<key>"): shows until the date below, and goes away for good once you click that tab.
const NEW_UNTIL = { bgmClip: Date.UTC(2026, 9, 26) };   // BGM Clip: one week from Oct 19
for (const btn of document.querySelectorAll('[data-new]')) {
  const key = 'mapleWordle:seenNew:' + btn.dataset.new;
  let seen = false;
  try { seen = localStorage.getItem(key) === '1'; } catch {}
  if (seen || !(Date.now() < (NEW_UNTIL[btn.dataset.new] ?? 0))) continue;
  const tag = document.createElement('span');
  tag.className = 'newtag';
  tag.textContent = 'NEW';
  btn.appendChild(tag);
  btn.addEventListener('click', () => { try { localStorage.setItem(key, '1'); } catch {} tag.remove(); });
}

// Secret themes: getting a glitch mashup's bonus right in BGM Clip on the day itself (not from the Archive) unlocks
// that map as a background for every page. Kept in this browser for good. Default is free for everyone, so the
// Theme button (above the credit box) only shows once you've unlocked another one.
const THEMES = { default: 'Default', deepsea: 'Unglamoured Ruins', limbo: "Limbo's Subconscious", vonbon: "Von Bon's Realm", bellona: 'Solatum' };
const THEME_IMG = { deepsea: 'images/deepsea.webp', limbo: 'images/limbo.webp', vonbon: 'images/vonbon.webp', bellona: 'images/bellona.webp' };
const THEMES_KEY = 'mapleWordle:themes', THEME_KEY = 'mapleWordle:theme', THEME_NEW_KEY = 'mapleWordle:themeNew';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
function ownedThemes() {
  let got = [];
  try { got = JSON.parse(lsGet(THEMES_KEY) || '[]'); } catch {}
  return ['default', ...Object.keys(THEMES).filter((t) => t !== 'default' && got.includes(t))];
}
// The theme is its own layer under everything (a playing mashup's egg background still shows on top of it).
// Picking one in the window fades it in over the old one; on page load it's just there.
function applyTheme(fade = false) {
  const pick = lsGet(THEME_KEY);
  const t = ownedThemes().includes(pick) ? pick : 'default';
  const old = [...document.querySelectorAll('.themebg')];
  if ((old.at(-1)?.dataset.theme ?? 'default') === t) return t;
  const gone = () => old.forEach((el) => el.remove());
  if (t !== 'default') {
    const el = document.createElement('div');
    el.className = 'themebg';
    el.dataset.theme = t;
    el.style.backgroundImage = `url("${THEME_IMG[t]}")`;
    if (fade) { el.style.opacity = 0; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = 1; })); }
    document.body.prepend(el);
    old.forEach((o) => document.body.prepend(o));   // keep the old one underneath while the new one fades in
    if (fade) setTimeout(gone, 1100); else gone();
  } else if (fade) {
    old.forEach((o) => { o.style.opacity = 0; });
    setTimeout(gone, 1100);
  } else gone();
  return t;
}
// The Theme button opens a window like the Changelog: a box for each theme you have (only those), click one to use it.
function drawThemeButton() {
  document.getElementById('themeBtn')?.remove();
  document.getElementById('themes')?.remove();
  const own = ownedThemes();
  if (own.length < 2) return;
  const btn = document.createElement('button');
  btn.id = 'themeBtn';
  btn.className = 'panel';
  btn.textContent = '🍁';
  btn.title = 'Themes';
  btn.setAttribute('aria-label', 'Themes');
  if (lsGet(THEME_NEW_KEY) === '1') btn.appendChild(Object.assign(document.createElement('span'), { className: 'newtag', textContent: 'NEW' }));
  const win = document.createElement('div');
  win.id = 'themes';
  win.hidden = true;
  win.innerHTML = '<div class="panel"><h2>Themes</h2><p class="themehelp">Your backgrounds. Pick one to use it on every page.</p>' +
    '<div id="themeList"></div><p class="closebar"><button id="themesClose">Close</button></p></div>';
  const list = win.querySelector('#themeList');
  const fill = () => {
    list.innerHTML = '';
    const cur = applyTheme(true);
    for (const t of own) {
      const card = document.createElement('button');
      card.className = 'themecard' + (t === cur ? ' on' : '');
      const pic = document.createElement('span');
      pic.className = 'themepic' + (t === 'default' ? ' default' : '');
      if (THEME_IMG[t]) pic.style.backgroundImage = `url("${THEME_IMG[t]}")`;
      const name = document.createElement('span');
      name.className = 'themename';
      name.textContent = THEMES[t] + (t === cur ? ' (in use)' : '');
      card.append(pic, name);
      card.addEventListener('click', () => { lsSet(THEME_KEY, t); fill(); });
      list.appendChild(card);
    }
  };
  btn.addEventListener('click', () => {
    fill();
    win.hidden = false;
    if (lsGet(THEME_NEW_KEY) === '1') { lsSet(THEME_NEW_KEY, '0'); btn.querySelector('.newtag')?.remove(); }
  });
  win.querySelector('#themesClose').addEventListener('click', () => { win.hidden = true; });
  win.addEventListener('click', (e) => { if (e.target === win) win.hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') win.hidden = true; });
  fill();
  document.body.append(btn, win);
}
function unlockTheme(t) {
  if (!(t in THEMES) || ownedThemes().includes(t)) return;
  lsSet(THEMES_KEY, JSON.stringify(ownedThemes().filter((x) => x !== 'default').concat(t)));
  lsSet(THEME_NEW_KEY, '1');
  drawThemeButton();
}
applyTheme();
drawThemeButton();

// ---- Mesos: finishing today's puzzle (not an Archive day) pays mesos, once per game per day. Kept in this browser.
// Each table: mesos for winning in 1, 2, 3, ... guesses; the last number is for any more guesses than that, or a loss.
const MESO_TABLE = {
  story: [100, 20, 10, 5, 2, 1, 0], normal: [100, 50, 20, 10, 5, 2, 1], hard: [100, 50, 30, 20, 10, 5],
  extreme: [100, 75, 50, 25, 10], bgm: [100, 50, 20, 10, 5], class: [100, 50, 25, 10, 5], anim: [100, 40, 20, 10, 5],
  sound: [100, 40, 20, 10, 5], map: [100, 80, 60, 40, 20, 10, 5],
};
const MESO_BONUS = { bgm: 20, sound: 20, map: 50 };   // bonus question right
const MESO_SPECIAL = 100;                               // ...unless it's one of the hidden glitch days
const MESO_NAMES = { story: 'Boss Wordle - Story', normal: 'Boss Wordle - Normal', hard: 'Boss Wordle - Hard',
  extreme: 'Boss Wordle - Extreme', bgm: 'Boss - BGM Clip', sound: 'Boss - Sound Clip', class: 'Class - Wordle',
  anim: 'Class - Attack Animation', map: 'Guess the Map' };
const MESO_SOON = new Set(['sound', 'map']);
const MESO_DAY = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;
// BGM Clip launch week: everything it pays (bonus too) is x3, Oct 20 to Oct 26.
const MESO_EVENTS = [{ mode: 'bgm', from: MESO_DAY(2026, 10, 20), to: MESO_DAY(2026, 10, 26), times: 3 }];
const mesoTimes = (mode, day) => MESO_EVENTS.find((e) => e.mode === mode && day >= e.from && day <= e.to)?.times ?? 1;
const MESO_LOG_KEY = 'mapleWordle:mesoLog';   // [{ key: "<mode>:<day>" or "<mode>+bonus:<day>", day, mode, what, amount }]
function mesoLog() { try { return JSON.parse(lsGet(MESO_LOG_KEY) || '[]'); } catch { return []; } }
const mesoTotal = () => mesoLog().reduce((s, e) => s + e.amount, 0);
function earnMeso(key, mode, day, what, base) {
  const log = mesoLog();
  if (log.some((e) => e.key === key)) return;
  const amount = base * mesoTimes(mode, day);
  if (amount > 0) {
    log.push({ key, mode, day, what, amount });
    lsSet(MESO_LOG_KEY, JSON.stringify(log));
  }
  drawMeso(amount);
}
// A game calls this when today's puzzle is over, with its Archive result ("Won 3/6", "Won in 4", "Lost").
function earnGame(mode, day, result) {
  const t = MESO_TABLE[mode];
  if (!t) return;
  const m = /^Won (?:in )?(\d+)/.exec(result);
  const n = m ? +m[1] : Infinity;
  earnMeso(`${mode}:${day}`, mode, day, m ? `Won in ${n}` : 'Lost', t[Math.min(n, t.length) - 1]);
}
function earnBonus(mode, day, special) {
  earnMeso(`${mode}+bonus:${day}`, mode, day, 'Bonus', special ? MESO_SPECIAL : MESO_BONUS[mode] ?? 0);
}
const fmt = (n) => n.toLocaleString('en-US');
// The meso count sits in the game box's top-right corner; clicking it opens a window like the Changelog.
function drawMeso(gained = 0) {
  const game = document.querySelector('.game');
  if (!game) return;
  let btn = document.getElementById('mesoBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'mesoBtn';
    btn.title = 'Your mesos';
    btn.innerHTML = '<img src="images/fx/meso-gold.png" alt=""><span></span>';
    btn.addEventListener('click', openMeso);
    game.appendChild(btn);
  }
  btn.querySelector('span').textContent = fmt(mesoTotal());
  if (gained > 0) {
    const plus = Object.assign(document.createElement('span'), { className: 'mesoplus', textContent: `+${fmt(gained)}` });
    btn.appendChild(plus);
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
    setTimeout(() => plus.remove(), 2200);
  }
}
function openMeso() {
  let win = document.getElementById('meso');
  if (!win) {
    win = document.createElement('div');
    win.id = 'meso';
    win.innerHTML = '<div class="panel"><h2>Mesos</h2><div id="mesoBody"></div><p class="closebar"><button id="mesoClose">Close</button></p></div>';
    win.querySelector('#mesoClose').addEventListener('click', () => { win.hidden = true; });
    win.addEventListener('click', (e) => { if (e.target === win) win.hidden = true; });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') win.hidden = true; });
    document.body.appendChild(win);
  }
  const today = Math.floor(Date.now() / 86400000);
  const date = (d) => new Date(d * 86400000).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const recent = mesoLog().slice(-10).reverse();
  const ev = MESO_EVENTS.filter((e) => today <= e.to)
    .map((e) => `<p class="mesoevent">🎉 <b>${MESO_NAMES[e.mode]}</b> pays <b>${e.times}x</b> mesos from ${date(e.from)} to ${date(e.to)}!</p>`).join('');
  const rows = (mode) => {
    const t = MESO_TABLE[mode];
    const cells = t.map((v, i) => `<td>${i + 1}${i === t.length - 1 ? '+' : ''}</td>`).join('');
    const vals = t.map((v) => `<td>${fmt(v)}</td>`).join('');
    const bonus = MESO_BONUS[mode] ? `<p class="mesobonus">Bonus right: +${MESO_BONUS[mode]}</p>` : '';
    return `<h3>${MESO_NAMES[mode]}${MESO_SOON.has(mode) ? ' <small>(coming soon)</small>' : ''}</h3>` +
      `<table class="mesotable"><tr><th>Guesses</th>${cells}</tr><tr><th>Mesos</th>${vals}</tr></table>${bonus}`;
  };
  win.querySelector('#mesoBody').innerHTML =
    `<p class="mesototal"><img src="images/fx/meso-gold.png" alt=""> ${fmt(mesoTotal())}</p>` + ev +
    '<p>Finish today\'s puzzles to earn mesos. The fewer guesses, the more you get! (Archive days don\'t pay.)</p>' +
    '<p class="mesoshop">🛍️ A <b>cosmetic shop</b> is coming later, so save up your mesos!</p>' +
    (recent.length ? '<h3>Recent</h3><ul class="mesorecent">' + recent.map((e) =>
      `<li><span>${date(e.day)} · ${MESO_NAMES[e.mode] ?? e.mode} · ${e.what}${mesoTimes(e.mode, e.day) > 1 ? ` (${mesoTimes(e.mode, e.day)}x)` : ''}</span><b>+${fmt(e.amount)}</b></li>`).join('') + '</ul>' : '') +
    '<h3 class="mesohow">How to earn</h3>' + Object.keys(MESO_TABLE).map(rows).join('');
  win.hidden = false;
}
// Under the result message: a spinning gold meso and how many mesos today's game paid (with its bonus).
function mesoGain(mode, day, show) {
  const status = document.getElementById('status');
  if (!status) return;
  let el = document.getElementById('mesoGain');
  const got = show ? mesoLog().filter((e) => e.key === `${mode}:${day}` || e.key === `${mode}+bonus:${day}`).reduce((s, e) => s + e.amount, 0) : 0;
  if (!got) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('p');
    el.id = 'mesoGain';
    el.innerHTML = '<img src="images/fx/meso-gold.png" alt=""><span></span>';
    el.title = 'Mesos earned today';
    el.addEventListener('click', openMeso);
    status.after(el);
  }
  el.querySelector('span').textContent = `+${fmt(got)}`;
}
drawMeso();
// A game's tab shows its meso event while it's on, e.g. "3x" with a gold meso on BGM Clip.
for (const btn of document.querySelectorAll('[data-meso]')) {
  const today = Math.floor(Date.now() / 86400000);
  const times = mesoTimes(btn.dataset.meso, today);
  if (times <= 1) continue;
  const tag = document.createElement('span');
  tag.className = 'mesotag';
  tag.title = `${times}x mesos this week!`;
  tag.innerHTML = `${times}x<img src="images/fx/meso-gold.png" alt="mesos">`;
  btn.appendChild(tag);
}

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

// First-guess win: a Sol Hecate skill screen plays over the page first, and the meso show starts when it bursts.
// Everyone has the default one; the shop's Helia bundle adds 5 colours. In the Customize window (Win Effect) you pick one
// or more, and each win plays a random one of those.
// One is fetched a few seconds after the page loads (so it's ready while you're guessing; if it isn't yet, the mesos
// just start right away). A win uses it up; switching to another mode (Story / Normal / Hard / Extreme) then fetches
// another one. Pages with only one game mode don't fetch again.
// Safari can't show a see-through WebM, so it gets the same clip as an animated WebP (video/hecate/<id>.webm / .webp,
// picture images/fx/hecate/<id>.webp).
const HECATE = {   // ms: clip length, burst: ms into the clip when it bursts (frame 15 of 48, 60 ms each)
  default: { name: 'Sol Hecate', ms: 2880, burst: 900 },
  helia1: { name: 'Helia (Pink)', ms: 2880, burst: 900, pack: 'helia' },
  helia2: { name: 'Helia (Yellow)', ms: 2880, burst: 900, pack: 'helia' },
  helia3: { name: 'Helia (Blue)', ms: 2880, burst: 900, pack: 'helia' },
  helia4: { name: 'Helia (Red)', ms: 2880, burst: 900, pack: 'helia' },
  helia5: { name: 'Helia (Purple)', ms: 2880, burst: 900, pack: 'helia' },
  mimica1: { name: 'Mimica (Blue)', ms: 2880, burst: 900, pack: 'mimica' },
  mimica2: { name: 'Mimica (Yellow)', ms: 2880, burst: 900, pack: 'mimica' },
  mimica3: { name: 'Mimica (Black)', ms: 2880, burst: 900, pack: 'mimica' },
  mimica4: { name: 'Mimica (Pink)', ms: 2880, burst: 900, pack: 'mimica' },
  mimica5: { name: 'Mimica (Purple)', ms: 2880, burst: 900, pack: 'mimica' },
};
const EFFECTS_KEY = 'mapleWordle:effects', WINFX_KEY = 'mapleWordle:winFx';   // packs bought; win effects picked
function ownedEffects() {
  try { return JSON.parse(lsGet(EFFECTS_KEY) || '[]'); } catch { return []; }
}
const ownedSkins = () => Object.keys(HECATE).filter((id) => !HECATE[id].pack || ownedEffects().includes(HECATE[id].pack));
function pickedSkins() {
  let got = [];
  try { got = JSON.parse(lsGet(WINFX_KEY) || '[]'); } catch {}
  got = got.filter((id) => ownedSkins().includes(id));
  return got.length ? got : ['default'];
}
function setPickedSkins(ids) {
  lsSet(WINFX_KEY, JSON.stringify(ids));
  if (hecate && !ids.includes(hecate.id)) { hecate = null; loadHecate(); }   // the one waiting isn't picked any more
}
// The guess boxes are search boxes (no password manager pop-ups); Esc there shouldn't wipe what you typed.
addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.matches?.('input[type="search"]')) e.preventDefault(); }, true);
const SAFARI = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
let hecate = null, hecateLoading = false, hecateLast = null;   // hecate: { id, skin, blob } ready to play
function loadHecate() {
  if (hecate || hecateLoading) return;
  const picked = pickedSkins();
  const pool = picked.length > 1 ? picked.filter((id) => id !== hecateLast) : picked;
  const id = pool[Math.floor(Math.random() * pool.length)];
  hecateLoading = true;
  fetch(`video/hecate/${id}.${SAFARI ? 'webp' : 'webm'}`).then((r) => (r.ok ? r.blob() : null))
    .then((blob) => { if (blob) hecate = { id, skin: HECATE[id], blob }; }).catch(() => {}).finally(() => { hecateLoading = false; });
}
setTimeout(loadHecate, 3000);
document.addEventListener('click', (e) => { if (e.target.closest?.('#modes button') && hecateLast) loadHecate(); });
function playHecate() {
  if (!hecate || limboAllOn()) return 0;   // Limbo mode: everything else is off
  const { id, skin, blob } = hecate;
  hecate = null;
  hecateLast = id;
  const url = URL.createObjectURL(blob);   // a fresh URL each time, so the WebP starts from its first frame
  const el = document.createElement(SAFARI ? 'img' : 'video');
  el.className = 'hecatefx';
  let gone = false;
  const done = () => { if (gone) return; gone = true; el.remove(); URL.revokeObjectURL(url); };
  if (SAFARI) setTimeout(done, skin.ms + 20);
  else {
    Object.assign(el, { muted: true, playsInline: true, autoplay: true });
    el.addEventListener('ended', done);
    setTimeout(done, skin.ms + 1000);
  }
  el.src = url;
  document.body.appendChild(el);
  el.play?.().catch(done);
  return skin.burst;
}
function bigWin() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setTimeout(mesoShow, playHecate());
}
// Timed to its music (35 s): the game box shakes (and starts glowing), meso fountains spray up from both bottom corners
// for 5 s, then mesos rain from the top, getting lighter until just before the music fades out.
function mesoShow() {
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
  classWin: 'sounds/succession-bloom.mp3',   // First Adversary's Succession Bloom 1:03-1:27 (1 s fade-in), Class Wordle win on guess 2-5
  purchase: 'sounds/purchase.mp3' };   // the Cash Shop's buy sound (0.8 s), when you buy something in the shop
// Tracks that play longer than SOUND_SECONDS: seconds before the fade-out starts (fade-out is SOUND_FADE).
const SOUND_LENGTH = { animWin: 19, classLose: 16, firstTry: 33, classWin: 22 };
// Tracks louder than SOUND_VOLUME.
const SOUND_LOUDER = { firstTry: 0.30, purchase: 0.6 };
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
// The shared AudioContext (made on first use; browsers only let it play after a click or key press).
function soundCtx() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      master = audioCtx.createGain();
      master.gain.value = sliderVolume() / 50;
      master.connect(audioCtx.destination);
    }
    audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
function resultSound(won, delay, file) {
  if (muted()) return;
  const ctx = soundCtx();
  if (!ctx) return;
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

// Short interface sounds (the Cash Shop's hover tick on the shop's buttons): fetched and decoded once, then played right
// away, through the same volume and sound on/off as everything else. uiSound() with no name just gets them ready
// (call it from a click, so the browser lets the sound play later on hover).
const UI_SOUNDS = { hover: ['sounds/hover.mp3', 0.35] };   // file, volume (like SOUND_VOLUME)
const uiBuffers = {};
let uiLast = 0;
function uiSound(name) {
  const ctx = soundCtx();
  if (!ctx) return;
  for (const k in UI_SOUNDS) uiBuffers[k] ??= fetch(UI_SOUNDS[k][0]).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null);
  if (!name || muted() || performance.now() - uiLast < 60) return;   // 60 ms apart at most, when sliding across buttons
  uiLast = performance.now();
  uiBuffers[name].then((buffer) => {
    if (!buffer) return;
    const gain = ctx.createGain();
    gain.gain.value = UI_SOUNDS[name][1] * (PHONE ? 2 : 1);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain).connect(master);
    src.start();
  });
}
const hoverSound = (el) => el.addEventListener('mouseenter', () => uiSound('hover'));

// Sound on/off button and volume slider in the top right corner (both remembered per browser).
// The slider shows on hover (computers) or after a tap on the button (phones).
// Turning sound off also stops a sound playing now.
// Settings (the ⚙️ in the top-right corner, a window like the Changelog): sound on/off and volume, and the background
// effect (the falling leaves on 2x weekends) on/off.
const FX_KEY = 'mapleWordle:bgEffect';   // 'off' turns the background effect off; on by default
const bgEffectOn = () => { try { return localStorage.getItem(FX_KEY) !== 'off'; } catch { return true; } };
// Box opacity (0-100) for the main game box: 0 = no background at all, 50 = the usual frosted box (default),
// 100 = solid, the background can't be seen through it. Sets CSS variables the .game styles use.
const BOX_KEY = 'mapleWordle:boxOpacity';
function boxOpacity() {
  try {
    const v = localStorage.getItem(BOX_KEY);
    if (v != null) return Math.min(100, Math.max(0, Number(v) || 0));
    return localStorage.getItem('mapleWordle:clearBox') === 'on' ? 0 : 50;   // the earlier on/off setting
  } catch { return 50; }
}
function applyBox() {
  const v = boxOpacity(), k = v / 50;
  const lerp = (base) => v <= 50 ? base * k : base + (1 - base) * (k - 1);   // 0 -> base -> 1
  const st = document.documentElement.style;
  st.setProperty('--boxA', lerp(0.55).toFixed(3));     // plain box: white
  st.setProperty('--boxRA', lerp(0.42).toFixed(3));    // 🌈 box: white layer
  st.setProperty('--boxT', (0.38 * Math.min(1, k)).toFixed(3));   // 🌈 box: pastel rainbow tint
  st.setProperty('--boxBlur', v ? '10px' : '0px');
}
applyBox();
(() => {
  const btn = document.createElement('button');
  btn.id = 'settingsBtn';
  btn.className = 'panel';
  btn.title = 'Settings';
  btn.textContent = '⚙️';
  btn.addEventListener('click', () => {
    const body = popup('settings', 'Settings');
    // The (i) after each name explains it: hover on a computer, tap on a phone.
    const tip = (text) => `<button class="infotip" type="button" aria-label="What is this?" data-tip="${text}">i</button>`;
    body.innerHTML = `<div class="setrow"><span class="setlabel">Sound ${tip('The sound effects when a game ends (the win / lose music). The slider sets how loud they are. BGM Clip has its own volume next to Play.')}</span>` +
      '<button id="setMute"></button><input id="setVol" type="range" min="0" max="100"><span id="setVolPct"></span></div>' +
      `<div class="setrow"><span class="setlabel">Box opacity ${tip('How see-through the main game box is. 0%: no box, the whole background shows. 50%: the usual frosted box. 100%: solid, no background inside the box.')}</span>` +
      '<input id="setBox" type="range" min="0" max="100" step="5"><span id="setBoxPct"></span></div>' +
      `<div class="setrow"><span class="setlabel">Background effect ${tip('Falling maple leaves in the background while 2x meso weekends are on, and holiday effects on holidays.')}</span>` +
      '<span class="seg"><button data-fx="on">On</button><button data-fx="off">Off</button></span></div>' +
      `<div class="setrow"><span class="setlabel">Secret passcode ${tip('VIP access given to those who help make this website!')}</span>` +
      (vip.on ? '<span class="vipon">✨ VIP unlocked</span>'
        : '<span class="vipfield"><input id="vipCode" type="text" placeholder="Passcode" autocomplete="off" spellcheck="false" autocapitalize="off" data-1p-ignore data-lpignore="true" data-form-type="other"><span id="vipMsg"></span></span><button id="vipGo">Enter</button>') + '</div>' +
      '<div id="vipBox" hidden><div class="vipctl"><button id="vipPlay"></button><button id="vipReplay" title="Start this song over">⏮ Replay</button>' +
      '<button id="vipSkip">⏭ Skip</button><button id="vipLoop" title="Loop this song">🔁 Loop</button></div><p id="vipNow"></p>' +
      '<div id="vipTrack"><span id="vipText">0.0 / 0.0</span><span id="vipArrow">▼</span><div id="vipBar"><div id="vipFill"></div></div></div></div>';
    vipSetup(body);
    // Each (i) gets a dark box that fades in over the rows below it (it doesn't push anything down): shown while
    // hovered (computer) or after a tap (phone).
    const closeTips = () => { for (const x of body.querySelectorAll('.infotip.open')) { x.classList.remove('open'); x.tipBox.classList.remove('show'); } };
    for (const t of body.querySelectorAll('.infotip')) {
      const box = Object.assign(document.createElement('p'), { className: 'tiptext', textContent: t.dataset.tip });
      t.tipBox = box;
      t.closest('.setrow').appendChild(box);
      t.addEventListener('mouseenter', () => { if (!PHONE) box.classList.add('show'); });
      t.addEventListener('mouseleave', () => { if (!PHONE && !t.classList.contains('open')) box.classList.remove('show'); });
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !t.classList.contains('open');
        closeTips();
        t.classList.toggle('open', open);
        box.classList.toggle('show', open);
      });
    }
    body.addEventListener('click', closeTips);
    const mute = body.querySelector('#setMute'), vol = body.querySelector('#setVol'), pct = body.querySelector('#setVolPct');
    vol.value = sliderVolume();
    const show = () => {
      mute.textContent = muted() ? '🔇 Off' : '🔊 On';
      mute.title = muted() ? 'Sound off (click to turn on)' : 'Sound on (click to turn off)';
      vol.disabled = muted();
      pct.textContent = vol.value + '%';
      for (const b of body.querySelectorAll('[data-fx]')) b.classList.toggle('on', (b.dataset.fx === 'on') === bgEffectOn());
      body.querySelector('#setBoxPct').textContent = boxOpacity() + '%';
    };
    mute.addEventListener('click', () => {
      lsSet(muteKey, muted() ? '0' : '1');
      if (muted() && audioCtx) { audioCtx.close(); audioCtx = master = null; }
      show();
    });
    vol.addEventListener('input', () => { saveSliderVolume(vol.value); show(); });
    for (const b of body.querySelectorAll('[data-fx]')) b.addEventListener('click', () => { lsSet(FX_KEY, b.dataset.fx); show(); leaves(); halloweenFx(); });
    const boxIn = body.querySelector('#setBox');
    boxIn.value = boxOpacity();
    boxIn.addEventListener('input', () => { lsSet(BOX_KEY, boxIn.value); applyBox(); show(); });
    show();
  });
  document.body.appendChild(btn);
})();

// VIP (the secret passcode in Settings): a player for every BGM we have, in random order, each from start to end.
// It only lasts for this page: reloading or going to another page turns it off again. Only the passcode's hash is here.
const VIP_HASH = '8cce1429a5b04f566923575513cd321f4f5aa34353b789691e55889cc379c588';
const vip = { on: false, audio: null, list: null, names: {}, titles: {}, cur: null, loop: 0 };
async function vipCheck(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim()));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('') === VIP_HASH;
}
function vipSetup(body) {
  const go = body.querySelector('#vipGo'), code = body.querySelector('#vipCode');
  const tryCode = async () => {
    if (!(await vipCheck(code.value))) {   // under the box for 2 s, then fades out
      const msg = body.querySelector('#vipMsg');
      msg.textContent = '❌ Wrong passcode';
      msg.classList.add('show');
      clearTimeout(vip.msgTimer);
      vip.msgTimer = setTimeout(() => msg.classList.remove('show'), 2000);
      return;
    }
    vip.on = true;
    const row = code.closest('.setrow');
    for (const el of row.querySelectorAll('.vipfield, #vipGo')) el.remove();
    row.insertAdjacentHTML('beforeend', '<span class="vipon">✨ VIP unlocked</span>');
    vipShow(body);
  };
  go?.addEventListener('click', tryCode);
  code?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryCode(); });
  if (vip.on) vipShow(body);
}
async function vipShow(body) {
  body.querySelector('#vipBox').hidden = false;
  if (!vip.list) {
    const d = await (await fetch('data/bgm.json', { cache: 'no-cache' })).json();
    vip.list = Object.keys(d.tracks);
    for (const b of d.bosses) for (const a of b.areas) (vip.names[a.track] ??= new Set()).add(b.name);
    vip.titles = Object.fromEntries(Object.entries(d.tracks).map(([k, t]) => [k, t.title]));
    vip.versions = Object.fromEntries(Object.entries(d.tracks).map(([k, t]) => [k, t.v]));
  }
  body.querySelector('#vipPlay').onclick = () => {
    if (!vip.audio) return vipNext();
    if (vip.audio.paused) vip.audio.play().catch(() => {}); else vip.audio.pause();
    vipDraw();
  };
  body.querySelector('#vipSkip').onclick = () => vipNext();
  body.querySelector('#vipReplay').onclick = () => {   // from the top (and play)
    if (!vip.audio) return vipNext();
    vip.audio.currentTime = 0;
    vip.audio.play().catch(() => {});
    vipDraw();
  };
  body.querySelector('#vipLoop').onclick = () => {   // repeat the current song instead of moving on
    vip.loopSong = !vip.loopSong;
    if (vip.audio) vip.audio.loop = vip.loopSong;
    vipDraw();
  };
  body.querySelector('#vipBar').onclick = (e) => {
    if (!vip.audio?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    vip.audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * vip.audio.duration;
    vipDraw();
  };
  vipDraw();
}
function vipNext() {
  if (!vip.list) return;
  let id;
  do id = vip.list[Math.floor(Math.random() * vip.list.length)]; while (vip.list.length > 1 && id === vip.cur);
  vip.cur = id;
  if (!vip.audio) {
    vip.audio = new Audio();
    vip.audio.loop = !!vip.loopSong;
    vip.audio.addEventListener('ended', vipNext);   // straight on to another one
    for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata']) vip.audio.addEventListener(ev, vipDraw);
  }
  let v = 50;
  try { v = Number(localStorage.getItem('mapleWordle:bgmVolume') ?? 50); } catch {}
  vip.audio.volume = Math.min(1, v / 50);   // the same volume as BGM Clip's player
  vip.audio.src = `audio/bgm/${id}.mp3${vip.versions?.[id] ? '?v=' + vip.versions[id] : ''}`;
  vip.audio.play().catch(() => {});
  vipDraw();
}
function vipDraw() {
  const $v = (id) => document.getElementById(id);
  if (!$v('vipBox') || $v('vipBox').hidden) return;
  const a = vip.audio, playing = a && !a.paused;
  $v('vipPlay').textContent = playing ? '❚❚ Pause' : '▶︎ Play';
  $v('vipLoop').classList.toggle('on', !!vip.loopSong);
  $v('vipNow').textContent = vip.cur ? `${[...(vip.names[vip.cur] || [])].join(' / ')} - ${vip.titles[vip.cur]}` : 'Press Play for a random BGM';
  const t = a?.currentTime || 0, len = a?.duration || 0, at = len ? t / len * 100 : 0;
  $v('vipFill').style.width = at + '%';
  $v('vipText').textContent = `${t.toFixed(1)} / ${len.toFixed(1)}`;
  for (const id of ['vipText', 'vipArrow']) $v(id).style.left = `clamp(0px, calc(${at}% - ${id === 'vipText' ? 30 : 6}px), calc(100% - ${id === 'vipText' ? 70 : 12}px))`;
  if (playing && !vip.loop) vip.loop = requestAnimationFrame(() => { vip.loop = 0; vipDraw(); });   // one redraw loop at a time
}

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

// The info strip under the tabs: PUZZLE #n | NEXT ... IN hh:mm:ss | STREAK n. Hover shows the date / reset time.
function showPuzzle(n, date, live) {
  document.getElementById('puzzleLabel').textContent = live ? 'Puzzle' : 'Archive';
  const el = document.getElementById('puzzle');
  el.textContent = `#${n}`;
  el.parentElement.title = date;
}
function showTimer(label, s) {
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('timerLabel').textContent = label;
  const el = document.getElementById('timer');
  el.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  el.parentElement.title = 'Resets at 00:00 UTC (same as Maple reset)';
}

// Secret themes: getting a glitch mashup's bonus right in BGM Clip on the day itself (not from the Archive) unlocks
// that map as a background for every page. Kept in this browser for good. Default is free for everyone, so the
// Theme button (above the credit box) only shows once you've unlocked another one.
const THEMES = { default: 'Default', deepsea: 'Unglamoured Ruins', limbo: "Limbo's Subconscious (Light)", limboDark: "Limbo's Subconscious (Dark)",
  vonbon: "Von Bon's Realm", bellona: 'Solatum',
  lucid: 'Garden of Eternal Dream', lucidBloom: 'Lucid in Bloom', lucidNight: "Lucid's Starry Night", halloween: 'Haunted Mansion' };
const THEME_IMG = { deepsea: 'images/deepsea.webp', limbo: 'images/limbo.webp', limboDark: 'images/limbo-dark.webp', vonbon: 'images/vonbon.webp', bellona: 'images/bellona.webp',
  lucid: 'images/lucid-dream.jpg?v=2', lucidBloom: 'images/lucid-bloom.webp', lucidNight: 'images/lucid-night.webp',
  halloween: 'images/holiday/halloween.webp' };
// Moving backgrounds: a looping video over the still picture (which shows until the video starts).
const THEME_VIDEO = { lucid: ['video/lucid-dream.webm?v=2', 'video/lucid-dream.mp4?v=2'] };
function bgVideo(t) {
  const v = document.createElement('video');
  Object.assign(v, { autoplay: true, muted: true, loop: true, playsInline: true, poster: THEME_IMG[t] });
  v.setAttribute('aria-hidden', 'true');
  for (const src of THEME_VIDEO[t]) v.appendChild(Object.assign(document.createElement('source'), { src, type: src.includes('.webm') ? 'video/webm' : 'video/mp4' }));
  v.play?.().catch(() => {});
  return v;
}
const THEMES_KEY = 'mapleWordle:themes', THEME_KEY = 'mapleWordle:theme';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
function ownedThemes() {
  let got = [];
  try { got = JSON.parse(lsGet(THEMES_KEY) || '[]'); } catch {}
  return ['default', ...Object.keys(THEMES).filter((t) => t !== 'default' && got.includes(t))];
}
// The theme is its own layer under everything (a playing mashup's egg background still shows on top of it).
// Picking one in the window fades it in over the old one; on page load it's just there.
// Holiday specials (images/holiday/): on its day each year (the site's UTC day), a holiday's background replaces
// whatever theme you have on, on every page. BGM Clip Extreme's Easter egg backgrounds still go on top of it. The same
// day it's in the shop (price in mesos), so you can keep it as a theme for any day.
const HOLIDAYS = {
  halloween: { month: 10, day: 31, name: 'Haunted Mansion', kind: 'Background + Halloween effects (Bundle of 2, Halloween only)', price: 500,
               hidden: true, effect: true, themes: ['halloween'], img: 'images/fx/halloween-bundle.webp', zoom: 'images/fx/halloween-bundle-big.webp' },
};
const holidayToday = (d = new Date()) => Object.keys(HOLIDAYS).find((k) => HOLIDAYS[k].month === d.getUTCMonth() + 1 && HOLIDAYS[k].day === d.getUTCDate());
// fade: false (just show it), true (1 s, picking a theme) or a number of seconds (2 at midnight on a holiday).
function applyTheme(fade = false) {
  const secs = fade === true ? 1 : fade || 0;
  const pick = lsGet(THEME_KEY);
  const t = limboAllOn() ? (limboDarkSide ? 'limboDark' : 'limbo') : holidayToday() ?? (ownedThemes().includes(pick) ? pick : 'default');
  const old = [...document.querySelectorAll('.themebg')];
  if ((old.at(-1)?.dataset.theme ?? 'default') === t) return t;
  const gone = () => old.forEach((el) => el.remove());
  if (t !== 'default') {
    const el = document.createElement('div');
    el.className = 'themebg';
    el.dataset.theme = t;
    el.style.backgroundImage = `url("${THEME_IMG[t]}")`;
    if (THEME_VIDEO[t]) el.appendChild(bgVideo(t));
    if (secs) {
      el.style.transition = `opacity ${secs}s ease`;
      el.style.opacity = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = 1; }));
    }
    document.body.prepend(el);
    old.forEach((o) => document.body.prepend(o));   // keep the old one underneath while the new one fades in
    if (secs) setTimeout(gone, secs * 1000 + 100); else gone();
  } else if (secs) {
    old.forEach((o) => { o.style.transition = `opacity ${secs}s ease`; o.style.opacity = 0; });
    setTimeout(gone, secs * 1000 + 100);
  } else gone();
  return t;
}
// The Customize button (only once you have a theme besides Default, or a win effect from the shop) opens a window like
// the Changelog with 3 tabs: Background (click a theme to use it), Win Effect (click to tick / untick; a random one of the
// ticked ones plays when you win in 1 guess, at least one stays ticked; a bought bundle opens and closes like a Changelog
// box) and Custom Effects (nothing to buy yet).
// Something you just got (bought or unlocked) is "NEW" on the button, on its tab and on itself until the page reloads.
let customTab = 'bg';
const customFresh = new Set();   // shop item / theme ids got since this page loaded
const customTabOf = (id) => (CUSTOM_FX_PACKS.includes(id) || id === 'halloween' ? 'fx' : SHOP[id]?.effect ? 'win' : 'bg');
function markCustomNew(id) {
  customFresh.add(id);
  customTab = customTabOf(id);   // the window opens on its tab
}
const newTag = () => Object.assign(document.createElement('span'), { className: 'newtag', textContent: 'NEW' });
const bundleOpen = new Set();   // bundles opened in the Win Effect tab (stay open while you click around)
function drawThemeButton() {
  document.getElementById('themeBtn')?.remove();
  document.getElementById('themes')?.remove();
  const own = ownedThemes();
  if (own.length < 2 && !ownedEffects().length) return;
  const btn = document.createElement('button');
  btn.id = 'themeBtn';
  btn.className = 'panel';
  btn.innerHTML = '<img src="images/home.png" alt="">';
  btn.title = 'Customize';
  btn.setAttribute('aria-label', 'Customize');
  const win = document.createElement('div');
  win.id = 'themes';
  win.hidden = true;
  win.innerHTML = '<div class="panel"><h2>Customize</h2><p class="themetabs"><button data-tab="bg">Background</button>' +
    '<button data-tab="win">Win Effect</button><button data-tab="fx">Custom Effects</button></p><p class="themehelp"></p>' +
    '<div id="themeList"></div><p class="closebar"><button id="themesClose">Close</button></p></div>';
  const list = win.querySelector('#themeList'), help = win.querySelector('.themehelp');
  const card = (into, img, label, on, click, isNew) => {
    const c = document.createElement('button');
    c.className = 'themecard' + (on ? ' on' : '');
    const pic = document.createElement('span');
    pic.className = 'themepic' + (img ? '' : ' default');
    if (img) pic.style.backgroundImage = `url("${img}")`;
    const name = document.createElement('span');
    name.className = 'themename';
    name.textContent = label;
    c.append(pic, name);
    if (isNew) c.appendChild(newTag());
    if (click) c.addEventListener('click', click);
    into.appendChild(c);
    return c;
  };
  const tags = () => {   // NEW on the button and on the tabs with something new
    btn.querySelector('.newtag')?.remove();
    if (customFresh.size) btn.appendChild(newTag());
    for (const b of win.querySelectorAll('.themetabs button')) {
      b.querySelector('.newtag')?.remove();
      if ([...customFresh].some((id) => customTabOf(id) === b.dataset.tab)) b.appendChild(newTag());
    }
  };
  const fill = () => {
    list.innerHTML = '';
    for (const b of win.querySelectorAll('.themetabs button')) b.classList.toggle('on', b.dataset.tab === customTab);
    tags();
    if (customTab === 'win') {
      help.textContent = 'Plays when you win in 1 guess. Tick one or more: each win plays a random one of them.';
      if (limboAllOn()) help.textContent = 'Limbo mode is on, so these are off for now. Ticking one turns Limbo mode off.';
      const picked = pickedSkins();
      const toggle = (id) => {
        const on = picked.includes(id);
        if (on && picked.length === 1) return;   // keep at least one
        setPickedSkins(on ? picked.filter((x) => x !== id) : [...picked, id]);
        if (limboAllOn()) { limboAllOff(); drawCustomFx(); }
        fill();
      };
      const skinCard = (into, id) => { const on = picked.includes(id); card(into, `images/fx/hecate/${id}.webp`, HECATE[id].name + (on ? ' ✓' : ''), on, () => toggle(id)); };
      for (const id of ownedSkins().filter((x) => !HECATE[x].pack)) skinCard(list, id);
      for (const pack of ownedEffects().filter((x) => Object.values(HECATE).some((h) => h.pack === x))) {
        const ids = ownedSkins().filter((x) => HECATE[x].pack === pack);
        const n = ids.filter((x) => picked.includes(x)).length;
        const box = document.createElement('details');
        box.className = 'fxbundle';
        box.open = bundleOpen.has(pack);
        box.addEventListener('toggle', () => { if (box.open) bundleOpen.add(pack); else bundleOpen.delete(pack); });
        const sum = document.createElement('summary');
        sum.className = 'themecard' + (n ? ' on' : '');
        const pic = Object.assign(document.createElement('span'), { className: 'themepic' });
        pic.style.backgroundImage = `url("${SHOP[pack].img}")`;
        const name = Object.assign(document.createElement('span'), { className: 'themename' });
        name.append(SHOP[pack].name, Object.assign(document.createElement('small'), { textContent: `${n} of ${ids.length} on` }));
        sum.append(pic, name);
        if (customFresh.has(pack)) sum.appendChild(newTag());
        const inner = Object.assign(document.createElement('div'), { className: 'fxbundlelist' });
        for (const id of ids) skinCard(inner, id);
        box.append(sum, inner);
        list.appendChild(box);
      }
    } else if (customTab === 'fx') {
      help.textContent = 'Effects on every page. Toggle effects replaces your customization.';
      const cur = customFx();
      const fxCard = (into, id) => card(into, CUSTOM_FX[id].img, CUSTOM_FX[id].name + (id === cur ? ' (in use)' : ''), id === cur, () => { setCustomFx(id); fill(); });
      for (const id of ownedCustomFx().filter((x) => !CUSTOM_FX[x].pack)) fxCard(list, id);
      if (hwFxOwned()) {   // Halloween's bats, ghosts and fog: on / off, on top of anything else
        const on = hwFxOn();
        card(list, 'images/fx/halloween-fx.webp', 'Halloween Night (bats, ghosts, fog)' + (on ? ' (on)' : ' (off)'), on,
          () => { setHwFx(!on); fill(); }, customFresh.has('halloween'));
      }
      // a bought set: one box (like the Win Effect bundles) with its effects, and Limbo's light / dark swap switch
      for (const pack of CUSTOM_FX_PACKS.filter((x) => ownedEffects().includes(x))) {
        const ids = ownedCustomFx().filter((x) => CUSTOM_FX[x].pack === pack);
        const using = ids.find((x) => x === cur);
        const box = document.createElement('details');
        box.className = 'fxbundle';
        box.open = bundleOpen.has(pack);
        box.addEventListener('toggle', () => { if (box.open) bundleOpen.add(pack); else bundleOpen.delete(pack); });
        const sum = document.createElement('summary');
        sum.className = 'themecard' + ((pack === 'limboSub' ? limboAnyOn() : using) ? ' on' : '');
        const pic = Object.assign(document.createElement('span'), { className: 'themepic' });
        pic.style.backgroundImage = `url("${SHOP[pack].img}")`;
        const name = Object.assign(document.createElement('span'), { className: 'themename' });
        name.append(SHOP[pack].name, Object.assign(document.createElement('small'), {
          textContent: pack !== 'limboSub' ? (using ? 'On' : 'Off') : limboAllOn() ? 'All Limbo effects on'
            : [using ? CUSTOM_FX[using].name.replace(/^.*\((\w+)\)$/, '$1 border on') : 'Border off',
              pack === 'limboSub' && limboGuessOn() && 'wrong guess on'].filter(Boolean).join(' · ') }));
        sum.append(pic, name);
        if (customFresh.has(pack)) sum.appendChild(newTag());
        const inner = Object.assign(document.createElement('div'), { className: 'fxbundlelist' });
        if (pack === 'limboSub') {   // one switch for everything in Limbo's set
          const row = Object.assign(document.createElement('label'), { className: 'fxswitch' });
          row.innerHTML = '<input type="checkbox"><span class="knob"></span><span>Enable all Limbo effects, including hidden ones</span>';
          const all = row.querySelector('input');
          all.checked = limboAllOn();
          all.addEventListener('change', () => { setLimboAll(all.checked); fill(); });
          inner.appendChild(row);
        }
        for (const id of ids) fxCard(inner, id);
        if (pack === 'limboSub') {   // the wrong guess effect: on / off, works with any border
          const on = limboGuessOn();
          card(inner, 'images/fx/limbo-guess.webp', 'Limbo Wrong Guess Effect' + (on ? ' (on)' : ' (off)'), on, () => { setLimboGuess(!on); fill(); });
        }
        box.append(sum, inner);
        list.appendChild(box);
      }
      if (ownedCustomFx().length < 2) list.appendChild(Object.assign(document.createElement('p'), { className: 'themehelp', textContent: 'More effects are coming to the shop later!' }));
    } else {
      help.textContent = 'Your backgrounds. Pick one to use it on every page.';
      const cur = applyTheme(true);
      for (const t of own) card(list, THEME_IMG[t], THEMES[t] + (t === cur ? ' (in use)' : ''), t === cur, () => {
        lsSet(THEME_KEY, t);
        if (limboAllOn()) { limboAllOff(); drawCustomFx(); }
        else applyTheme(true);
        fill();
      }, customFresh.has(t));
    }
  };
  for (const b of win.querySelectorAll('.themetabs button')) b.addEventListener('click', () => { customTab = b.dataset.tab; fill(); });
  btn.addEventListener('click', () => {
    win.hidden = false;
    fill();
  });
  win.querySelector('#themesClose').addEventListener('click', () => { win.hidden = true; });
  win.addEventListener('click', (e) => { if (e.target === win) win.hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') win.hidden = true; });
  fill();
  document.body.append(btn, win);
}
// Custom effects (Customize > Custom Effects): one at a time, on every page. Limbo's alert borders (from the shop's
// "Limbo's Subconscious" set) come in with their entrance, then loop over the page's edges. With the swap switch on,
// every 30-60 s a glitch swaps Limbo's light side (light background, white border) and dark side (dark background,
// black border). Clips: video/limbo/border-<white|black>-<in|loop>.webm (.webp on Safari).
const CUSTOM_FX = {
  none: { name: 'No Effect', img: 'images/fx/hecate/none.webp' },
  limboWhite: { name: 'Limbo Alert Border (White)', img: 'images/fx/limbo-border-white.webp', pack: 'limboSub', color: 'white' },
  limboBlack: { name: 'Limbo Alert Border (Black)', img: 'images/fx/limbo-border-black.webp', pack: 'limboSub', color: 'black' },
};
const CUSTOM_FX_PACKS = ['limboSub'];
const CUSTOM_FX_KEY = 'mapleWordle:customFx';
const ownedCustomFx = () => Object.keys(CUSTOM_FX).filter((id) => !CUSTOM_FX[id].pack || ownedEffects().includes(CUSTOM_FX[id].pack));
const customFx = () => {
  if (limboAllOn()) return limboDarkSide ? 'limboBlack' : 'limboWhite';   // Limbo mode: the border of the side showing
  const id = lsGet(CUSTOM_FX_KEY);
  return ownedCustomFx().includes(id) ? id : 'none';
};
function setCustomFx(id) {
  if (limboAllOn() && CUSTOM_FX[id]?.pack === 'limboSub') {   // Limbo mode: picking a border just flips to that side
    if ((id === 'limboBlack') !== limboDarkSide) { limboDarkSide = !limboDarkSide; applyTheme(true); }
    limboTransitions();   // (a transition on its way doesn't swap it back)
  } else {
    limboAllOff();
    lsSet(CUSTOM_FX_KEY, id);
  }
  cfxPreview();
  halloweenFx();
}
// The alert border (Limbo's set) is only on the page while a game is down to its last 2 guesses (Story Mode and Attack
// Animation have no limit, so never), and for a moment when you pick one in Customize. It comes in with its entrance
// and leaves with its exit. Win: it goes once the row has turned over. Lose: Limbo's fail screen in its colour plays,
// and it goes under that.
let cfxAlert = false, cfxHold = false, cfxPreviewing = false, cfxPreviewT = 0, failPending = false;
const cfxShown = () => cfxAlert || cfxHold || cfxPreviewing;
function cfxPreview() {
  cfxPreviewing = true;
  clearTimeout(cfxPreviewT);
  drawCustomFx(true);
  cfxPreviewT = setTimeout(() => { cfxPreviewing = false; drawCustomFx(); }, 3000);
}
function limboAlertCheck() {   // each game says how many guesses are left (window.gameLeft)
  const g = window.gameLeft?.();
  const was = cfxShown();
  cfxAlert = !!g && !g.over && g.left <= 2;
  if (cfxShown() !== was) drawCustomFx(cfxAlert);
}
function limboOver(won, delay = 0) {   // game over (called by the games, with when the result shows)
  const fx = CUSTOM_FX[customFx()];
  if (!fx.color || !cfxShown()) return;
  cfxHold = true;
  const release = (ms) => setTimeout(() => { cfxHold = false; drawCustomFx(); }, ms);
  if (won) return release(delay);
  failPending = true;
  setTimeout(() => {   // the fail screen in the colour showing now, over (and instead of) any transition on its way
    failPending = false;
    limboTransitionStop();
    limboFail(CUSTOM_FX[customFx()].color ?? fx.color);
  }, delay);
  release(delay + 600);   // by then the fail screen covers everything
}
const cfxClips = {};
function cfxClip(name) {
  cfxClips[name] ??= fetch(`video/limbo/${name}.${SAFARI ? 'webp' : 'webm'}`).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
  return cfxClips[name];
}
let cfxGen = 0;
async function drawCustomFx(entrance = false) {
  const gen = ++cfxGen;
  const fx = CUSTOM_FX[customFx()];
  let layer = document.getElementById('cfx');
  if (!fx.color || !cfxShown()) {   // not wanted now: its exit plays, then it's gone
    if (!layer) return;
    layer.removeAttribute('id');
    layer.className = 'cfxout';
    const out = await cfxClip(`border-${layer.dataset.color}-out`);
    for (const old of layer.children) URL.revokeObjectURL(old.src);
    layer.innerHTML = '';
    if (!out) return layer.remove();
    const el = layer.appendChild(gfxVideo(out, false));
    setTimeout(() => { URL.revokeObjectURL(el.src); layer.remove(); }, 300);
    return;
  }
  const [loopBlob, inBlob] = await Promise.all([cfxClip(`border-${fx.color}-loop`), entrance ? cfxClip(`border-${fx.color}-in`) : null]);
  if (gen !== cfxGen || !loopBlob) return;
  layer = document.getElementById('cfx');
  if (!layer) { layer = Object.assign(document.createElement('div'), { id: 'cfx' }); document.body.appendChild(layer); }
  layer.dataset.color = fx.color;
  const make = gfxVideo;
  for (const old of layer.children) URL.revokeObjectURL(old.src);
  layer.innerHTML = '';
  const loopEl = make(loopBlob, true);
  layer.appendChild(loopEl);
  if (inBlob) {   // the entrance first, then the loop
    loopEl.hidden = true;
    const inEl = make(inBlob, false);
    layer.appendChild(inEl);
    setTimeout(() => { if (gen === cfxGen) { loopEl.hidden = false; URL.revokeObjectURL(inEl.src); inEl.remove(); } }, 840);
  }
}
let transTimer = 0, transGen = 0;
function limboTransitions() {   // Limbo mode: a transition (and a swap of sides) every 30-60 s
  clearTimeout(transTimer);
  transGen++;
  if (limboAllOn()) transTimer = setTimeout(limboTransition, 30000 + Math.random() * 30000);
}
function limboSwap() {   // the light and dark side (background + border) trade places, with a quick glitch
  document.body.classList.add('limboswap');
  setTimeout(() => {
    limboDarkSide = !limboDarkSide;
    applyTheme(0.15);
    drawCustomFx(false);
  }, 120);
  setTimeout(() => document.body.classList.remove('limboswap'), 320);
}
// Limbo's transition (Limbo mode, between its sides): a dark pool spreads along the bottom of the screen, Limbo bursts
// out of it in three places (left, middle, right), then a dome of light breaks and the sides swap under its flash.
const TRANS_CLIPS = ['trans-pre', 'trans-left', 'trans-middle', 'trans-right', 'trans-end'];
const TRANS_PRE = 1700, TRANS_BURST = 900, TRANS_END = 2340;   // bursts come up as the pool ends; the dome comes as they bite (frame 10)
let transBox = null;
function limboTransitionStop() {   // losing: the fail screen takes over (Limbo mode's next transition 30-60 s later)
  if (transBox) { for (const el of transBox.children) URL.revokeObjectURL(el.src); transBox.remove(); transBox = null; }
  limboTransitions();
}
async function limboTransition() {
  if (failPending) return limboTransitions();   // a lost game's fail screen is on its way: not now
  const gen = transGen;
  const blobs = await Promise.all(TRANS_CLIPS.map(cfxClip));
  if (gen !== transGen || !limboAllOn()) return;
  if (blobs.some((b) => !b)) { limboSwap(); return limboTransitions(); }   // the clips didn't load: just swap
  const box = transBox = Object.assign(document.createElement('div'), { className: 'limbotrans' });
  document.body.appendChild(box);
  const play = (i) => box.appendChild(gfxVideo(blobs[i], false)).classList.add(TRANS_CLIPS[i].slice(6));
  const gone = () => { for (const el of box.children) URL.revokeObjectURL(el.src); box.remove(); if (transBox === box) transBox = null; };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  play(0);
  await wait(TRANS_PRE);
  if (gen !== transGen) return gone();   // Limbo mode turned off (or a side picked) meanwhile
  box.firstElementChild.classList.add('out');   // the pool fades as Limbo bursts out of it
  play(1); play(2); play(3);
  await wait(TRANS_BURST);
  if (gen !== transGen) return gone();
  play(4);
  await wait(180);
  if (gen !== transGen) return gone();
  if (!failPending) {   // (a lost game's fail screen is coming: it plays on, no swap, and the fail screen takes over)
    limboSwap();
    limboTransitions();   // the next one
  }
  await wait(Math.max(TRANS_END, 2880 - TRANS_BURST));   // the bursts' own clips run 2.88 s
  gone();
}
// Limbo's wrong guess effect (in Limbo's set): a purple bar charges over the new guess row while it flips,
// and a wrong guess gets swallowed by Limbo's dragon, which then stays on that row until the effect is turned off
// (the guess text stays on top, tinted in its tile colour). Games that flip a row of clue tiles get the bar for
// the whole flip; the others (nothing to wait for) get it for 0.5 s on wrong guesses.
const GUESS_FX_KEY = 'mapleWordle:guessFx';
const limboGuessOn = () => limboAllOn() || (ownedEffects().includes('limboSub') && lsGet(GUESS_FX_KEY) !== '0');
const GFX = { x: 399, y: 340, w: 2183, h: 445, W: 2793, H: 1157 };   // the bar's body inside the clips (source pixels)
const GFX_RUSH = 720;
const gfxLayers = new Set();   // { row, layer, host }: every bar / dragon showing
function gfxClips() { cfxClip('guess-bar'); cfxClip('guess-eat'); cfxClip('guess-idle'); }
function gfxVideo(blob, loop) {
  const el = document.createElement(SAFARI ? 'img' : 'video');
  if (!SAFARI) Object.assign(el, { muted: true, playsInline: true, autoplay: true, loop });
  el.src = URL.createObjectURL(blob);
  el.play?.().catch(() => {});
  return el;
}
function gfxDrop(g) {
  gfxLayers.delete(g);
  g.row.classList.remove('limboeaten');
  delete g.row.dataset.gfx;
  for (const el of g.layer.children) URL.revokeObjectURL(el.src);
  g.layer.remove();
}
let gfxTracking = false;
function gfxTrack() {   // keep every layer on its row (new guesses push rows down); read all, then write all
  const pos = [...gfxLayers].map((g) => [g, g.row.isConnected && g.row.getBoundingClientRect(), g.host.getBoundingClientRect()]);
  for (const [g, r, o] of pos) {
    if (!r) { gfxDrop(g); continue; }   // the list was redrawn (another day picked)
    const sx = r.width / GFX.w, sy = r.height / GFX.h;
    Object.assign(g.layer.style, { left: r.left - o.left - GFX.x * sx + 'px', top: r.top - o.top - GFX.y * sy + 'px',
      width: GFX.W * sx + 'px', height: GFX.H * sy + 'px' });
  }
  gfxTracking = gfxLayers.size > 0;
  if (gfxTracking) requestAnimationFrame(gfxTrack);
}
function gfxLayer(row) {
  const g = { row, host: row.closest('.game') ?? document.body, layer: Object.assign(document.createElement('div'), { className: 'limboguess' }) };
  row.dataset.gfx = '1';
  g.host.appendChild(g.layer);
  gfxLayers.add(g);
  if (!gfxTracking) gfxTrack();
  return g;
}
async function limboDragon(row) {   // a wrong guess from before (page load): its dragon is just there
  row.dataset.gfx = '1';
  const blob = await cfxClip('guess-idle');
  if (!blob || !gfxKeep(row, limboGuessOn())) return;
  const g = gfxLayer(row);
  g.layer.classList.add('still');
  g.layer.appendChild(gfxVideo(blob, true)).classList.add('dragon');
  row.classList.add('limboeaten');
}
async function limboGuess(row, wrong, flipMs, force = false) {   // force: show it even without the effect (Limbo's mashup)
  if (!row || !(limboGuessOn() || force) || (flipMs == null && !wrong)) return;
  row.dataset.gfx = '1';
  const barMs = flipMs ?? 500;
  const start = performance.now();
  const [barBlob, eatBlob, idleBlob] = await Promise.all([cfxClip('guess-bar'), wrong && cfxClip('guess-eat'), wrong && cfxClip('guess-idle')]);
  if (!barBlob || !row.isConnected) return;
  const g = gfxLayer(row);
  const bar = gfxVideo(barBlob, true);
  g.layer.appendChild(bar);
  const wait = (ms) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));
  await wait(barMs - (performance.now() - start));
  if (!gfxLayers.has(g)) return;
  if (!wrong || !eatBlob || !idleBlob) {   // right: the bar fades out over 0.2 s
    g.layer.classList.add('out');
    await wait(200);
    return gfxDrop(g);
  }
  const eat = gfxVideo(eatBlob, false);   // the dragon rushes in from the left and swallows the row...
  g.layer.appendChild(eat).classList.add('dragon');
  setTimeout(() => { URL.revokeObjectURL(bar.src); bar.remove(); }, 60);
  await wait(250);
  row.classList.add('limboeaten');
  await wait(GFX_RUSH - 250);
  if (!gfxLayers.has(g)) return;
  const idle = gfxVideo(idleBlob, true);   // ...and stays there
  g.layer.appendChild(idle).classList.add('dragon');
  setTimeout(() => { URL.revokeObjectURL(eat.src); eat.remove(); }, 60);
}
// Every wrong guess row (and wrong bonus answer) on the page gets its dragon (page load, or the effect turned on);
// turned off, they all go (except on Limbo's mashup answer, which everyone sees).
const gfxWrong = (row) => !(row.matches('.gbar') ? row : row.firstElementChild)?.classList.contains('green');
const gfxResult = (el) => el.matches('#bonusResult, #titleResult');
const gfxKeep = (el, on) => el.isConnected && (gfxResult(el) ? el.classList.contains('wrong') && (on || el.dataset.limbo === '1') : on);
function limboDragons() {
  const on = limboGuessOn();
  for (const g of [...gfxLayers]) if (!gfxKeep(g.row, on)) gfxDrop(g);
  const rows = on ? [...document.querySelectorAll('#rows > tr:not(.bestrow):not(.hintrow):not(.answer), #rows > .gbar')].filter(gfxWrong) : [];
  const results = [...document.querySelectorAll('#bonusResult.wrong, #titleResult.wrong')].filter((el) => gfxKeep(el, on));
  for (const el of [...rows, ...results]) if (!el.dataset.gfx) limboDragon(el);
}
// "Toggle all Limbo effects" (Limbo mode): Limbo's background + border (swapping light / dark side every 30-60 s)
// and the wrong guess effect, with every other effect and background off. It goes on top of your own settings
// without changing them, so turning it off brings back exactly what you had. Picking anything yourself ends it.
const LIMBO_ALL_KEY = 'mapleWordle:limboAll';
let limboDarkSide = false;
const limboAllOn = () => ownedEffects().includes('limboSub') && lsGet(LIMBO_ALL_KEY) === '1';
const limboAnyOn = () => limboAllOn() || (ownedEffects().includes('limboSub')
  && (CUSTOM_FX[customFx()].pack === 'limboSub' || ['limbo', 'limboDark'].includes(lsGet(THEME_KEY)) || limboGuessOn()));
function setLimboAll(on) {
  if (on === limboAllOn()) return;
  lsSet(LIMBO_ALL_KEY, on ? '1' : '0');
  if (on) { limboDarkSide = false; gfxClips(); limboFailLoad(); }
  applyTheme(true);
  if (on) cfxPreview(); else drawCustomFx();
  halloweenFx();
  limboTransitions();
  limboDragons();
}
function limboAllOff() { if (limboAllOn()) { lsSet(LIMBO_ALL_KEY, '0'); applyTheme(true); drawCustomFx(); halloweenFx(); limboTransitions(); limboDragons(); } }   // you picked something yourself
// Losing with the alert border on plays Limbo's fail screen full screen, in the border's colour (white or black).
const LIMBO_FAIL_MS = 3900;
function limboFailLoad() { cfxClip('fail-white'); cfxClip('fail-black'); if (limboAllOn()) TRANS_CLIPS.forEach(cfxClip); }   // ready when needed
async function limboFail(color, delay = 0) {
  const start = performance.now();
  const [blob] = await Promise.all([cfxClip(`fail-${color}`), new Promise((ok) => setTimeout(ok, delay))]);
  if (!blob || performance.now() - start > delay + 3000) return;   // too late now (slow download)
  const el = document.createElement(SAFARI ? 'img' : 'video');
  el.className = 'limboscreen';
  const url = URL.createObjectURL(blob);
  const done = () => { el.remove(); URL.revokeObjectURL(url); };
  if (SAFARI) setTimeout(done, LIMBO_FAIL_MS + 50);
  else { Object.assign(el, { muted: true, playsInline: true, autoplay: true }); el.addEventListener('ended', done); setTimeout(done, LIMBO_FAIL_MS + 1500); }
  el.src = url;
  document.body.appendChild(el);
  el.play?.().catch(done);
}
function setLimboGuess(on) { limboAllOff(); lsSet(GUESS_FX_KEY, on ? '1' : '0'); if (on) gfxClips(); limboDragons(); }

function unlockTheme(t) {
  if (!(t in THEMES) || ownedThemes().includes(t)) return;
  lsSet(THEMES_KEY, JSON.stringify(ownedThemes().filter((x) => x !== 'default').concat(t)));
  markCustomNew(t);
  drawThemeButton();
}
applyTheme();

// ---- Mesos: finishing today's puzzle (not an Archive day) pays mesos, once per game per day. Kept in this browser.
// Each table: mesos for winning in 1, 2, 3, ... guesses; the last number is for any more guesses than that, or a loss.
const MESO_TABLE = {
  story: [100, 20, 10, 5, 2, 1, 0], normal: [100, 50, 20, 10, 5, 2, 1], hard: [100, 50, 30, 20, 10, 5],
  extreme: [100, 75, 50, 25, 10], bgmnormal: [50, 40, 30, 20, 10, 5, 2], bgm: [100, 80, 60, 40, 20, 10], class: [100, 50, 25, 10, 5], anim: [100, 40, 20, 10, 5],
  sound: [100, 40, 20, 10, 5], map: [100, 80, 60, 40, 20, 10, 5],
};
// Tables used before Oct 21 (BGM Clip had only what's now Extreme, with lower pay).
const MESO_TABLE_OLD = { bgm: [100, 50, 20, 10, 5] };
const MESO_BONUS = { bgmnormal: 20, bgm: 20, sound: 20, map: 50 };   // bonus question right
const MESO_SPECIAL = 100;                               // ...unless it's one of the hidden glitch days
const MESO_NAMES = { shop: 'Shop', story: 'Boss Wordle - Story', normal: 'Boss Wordle - Normal', hard: 'Boss Wordle - Hard',
  extreme: 'Boss Wordle - Extreme', bgmnormal: 'BGM Clip - Normal', bgm: 'BGM Clip - Extreme', sound: 'Boss - Sound Clip', class: 'Class - Wordle',
  anim: 'Class - Attack Animation', map: 'Guess the Map' };
const MESO_SOON = new Set(['sound', 'map']);
const MESO_DAY = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;
// BGM Clip launch week: everything it pays (bonus too) is x3, Oct 20 to Oct 26.
const MESO_EVENTS = [{ mode: 'bgm', label: 'BGM Clip', from: MESO_DAY(2026, 10, 20), to: MESO_DAY(2026, 10, 26), times: 3 },
  { mode: 'bgmnormal', label: 'BGM Clip', from: MESO_DAY(2026, 10, 20), to: MESO_DAY(2026, 10, 26), times: 3 }];
// Weekends (Saturday and Sunday, UTC days: Friday 5pm to Sunday 5pm Pacific) pay 2x on that day's own puzzles, on top
// of any game event; Archive days don't get it.
const isWeekend = (day) => [0, 6].includes(new Date(day * 86400000).getUTCDay());
const weekendNow = () => isWeekend(Math.floor(Date.now() / 86400000));
// Halloween (Oct 31, UTC day): that day's own puzzles pay 5x, instead of the weekend / event multipliers (no stacking).
const HALLOWEEN_TIMES = 5;
const isHalloween = (day) => holidayToday(new Date(day * 86400000)) === 'halloween';
const mesoTimes = (mode, day) => (isHalloween(day) && !isArchive(day) ? HALLOWEEN_TIMES
  : (MESO_EVENTS.find((e) => e.mode === mode && day >= e.from && day <= e.to)?.times ?? 1) * (isWeekend(day) && !isArchive(day) ? 2 : 1));
const MESO_LOG_KEY = 'mapleWordle:mesoLog';   // [{ key: "<mode>:<day>" or "<mode>+bonus:<day>", day, mode, what, amount }]
function mesoLog() { try { return JSON.parse(lsGet(MESO_LOG_KEY) || '[]'); } catch { return []; } }
const mesoTotal = () => mesoLog().reduce((s, e) => s + e.amount, 0);
// Archive days (any day before today) pay 10%, rounded up.
const isArchive = (day) => day < Math.floor(Date.now() / 86400000);
const mesoPay = (base, mode, day) => Math.ceil(base * mesoTimes(mode, day) * (isArchive(day) ? 0.1 : 1));
function earnMeso(key, mode, day, what, base, final = false) {
  const log = mesoLog();
  if (log.some((e) => e.key === key)) return;
  const amount = final ? base : mesoPay(base, mode, day);
  if (isArchive(day)) what += ' (Archive 10%)';
  if (amount > 0) {
    log.push({ key, mode, day, what, amount, times: mesoTimes(mode, day) });
    lsSet(MESO_LOG_KEY, JSON.stringify(log));
  }
  drawMeso(amount);
}
// Boss Wordle and BGM Clip (from Oct 21): only your best mode each day pays. A better result on another mode pays the
// difference, so the day's total is always your best one. A game's bonus pays once a day, whichever mode it's in.
const MESO_GROUPS = [['story', 'normal', 'hard', 'extreme'], ['bgmnormal', 'bgm']];
const groupOf = (mode) => MESO_GROUPS.find((g) => g.includes(mode));
const BEST_ONLY_FROM = MESO_DAY(2026, 10, 21);
// A game calls this when today's puzzle is over, with its Archive result ("Won 3/6", "Won in 4", "Lost").
function earnGame(mode, day, result) {
  const t = (day < BEST_ONLY_FROM && MESO_TABLE_OLD[mode]) || MESO_TABLE[mode];
  if (!t) return;
  const m = /^Won (?:in )?(\d+)/.exec(result);
  const n = m ? +m[1] : Infinity;
  let amount = mesoPay(t[Math.min(n, t.length) - 1], mode, day), what = m ? `Won in ${n}` : 'Lost';
  const group = groupOf(mode);
  if (group && day >= BEST_ONLY_FROM) {
    const log = mesoLog();
    if (log.some((e) => e.key === `${mode}:${day}`)) return;
    const best = log.filter((e) => group.some((w) => e.key === `${w}:${day}`)).reduce((s, e) => s + e.amount, 0);
    if (amount <= best) return;
    if (best) { what += isArchive(day) ? ' (better than another mode)' : ' (better than earlier today)'; amount -= best; }
  }
  earnMeso(`${mode}:${day}`, mode, day, what, amount, true);
}
// kind 'bonus' (BGM Clip's Bonus 1 / mashup) or 'title' (Bonus 2, the track's title): each pays once a day.
const MESO_TITLE = { bgmnormal: 70, bgm: 70 };
function earnBonus(mode, day, special, kind = 'bonus') {
  if (day >= BEST_ONLY_FROM && groupOf(mode)?.some((m) => mesoLog().some((e) => e.key === `${m}+${kind}:${day}`))) return;
  const base = kind === 'title' ? MESO_TITLE[mode] ?? 0 : special ? MESO_SPECIAL : MESO_BONUS[mode] ?? 0;
  earnMeso(`${mode}+${kind}:${day}`, mode, day, kind === 'title' ? 'Title' : 'Bonus', base);
}
const fmt = (n) => n.toLocaleString('en-US');
// The meso count sits in the game box's top-right corner; clicking it opens a window like the Changelog.
// The meso count sits in the game box's top-right corner with the Shop button under it; each opens a window like the
// Changelog (Mesos: total, recent, how to earn / Shop: items you've found).
function drawMeso(gained = 0) {
  const game = document.querySelector('.game');
  if (!game) return;
  let btn = document.getElementById('mesoBtn');
  if (!btn) {
    const corner = Object.assign(document.createElement('div'), { id: 'mesoCorner' });
    btn = document.createElement('button');
    btn.id = 'mesoBtn';
    btn.title = 'Your mesos';
    btn.innerHTML = '<img src="images/fx/meso-gold.png" alt=""><span></span>';
    btn.addEventListener('click', () => openMeso());
    const shop = Object.assign(document.createElement('button'), { id: 'shopBtn', title: 'Shop', textContent: '🛍️ Shop' });
    shop.addEventListener('click', openShop);
    corner.append(btn, shop);
    game.appendChild(corner);
    shopNewTag();
  }
  btn.querySelector('span').textContent = fmt(mesoTotal());
  if (isHalloween(Math.floor(Date.now() / 86400000)) && !btn.querySelector('.mesotag')) {
    btn.appendChild(Object.assign(document.createElement('span'), { className: 'mesotag weekendtag', textContent: `🎃 ${HALLOWEEN_TIMES}x Halloween`, title: `Halloween: ${HALLOWEEN_TIMES}x mesos today!` }));
  } else if (weekendNow() && !btn.querySelector('.mesotag')) {
    btn.appendChild(Object.assign(document.createElement('span'), { className: 'mesotag weekendtag', textContent: '2x Weekend', title: 'Weekend: 2x mesos today!' }));
  }
  if (gained > 0) {
    const plus = Object.assign(document.createElement('span'), { className: 'mesoplus', textContent: `+${fmt(gained)}` });
    btn.appendChild(plus);
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
    setTimeout(() => plus.remove(), 2200);
  }
}
// A window like the Changelog: closes with its Close button, a click outside it, or Esc.
function popup(id, title) {
  let win = document.getElementById(id);
  if (!win) {
    win = document.createElement('div');
    win.id = id;
    win.className = 'popup';
    win.innerHTML = `<div class="panel"><h2>${title}</h2><div class="popupbody"></div><p class="closebar"><button>Close</button></p></div>`;
    win.querySelector('.closebar button').addEventListener('click', () => { win.hidden = true; });
    win.addEventListener('click', (e) => { if (e.target === win) win.hidden = true; });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') win.hidden = true; });
    document.body.appendChild(win);
  }
  win.hidden = false;
  return win.querySelector('.popupbody');
}
const mesoDate = (d) => new Date(d * 86400000).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
const MESO_PER_PAGE = 5;
// Page buttons: < 1 … 4 5 6 … 10 >  (first and last page always there, so no separate << / >>).
function pager(cur, last) {
  if (last <= 1) return '';
  const nums = [...new Set([1, cur - 1, cur, cur + 1, last])].filter((n) => n >= 1 && n <= last).sort((x, y) => x - y);
  let html = `<button data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>`, prev = 0;
  for (const n of nums) {
    if (n - prev > 1) html += '<span class="gap">…</span>';
    html += `<button data-page="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`;
    prev = n;
  }
  return `<div class="pager">${html}<button data-page="${cur + 1}" ${cur === last ? 'disabled' : ''} aria-label="Next page">›</button></div>`;
}
function openMeso(page = 1) {
  const body = popup('meso', 'Mesos');
  const today = Math.floor(Date.now() / 86400000);
  const all = mesoLog().slice().reverse();
  const last = Math.max(1, Math.ceil(all.length / MESO_PER_PAGE));
  page = Math.min(Math.max(1, page), last);
  const recent = all.slice((page - 1) * MESO_PER_PAGE, page * MESO_PER_PAGE);
  // Halloween: 5x today (in place of the weekend's 2x).
  const weekend = isHalloween(today) ? `<p class="mesoevent">🎃 <b>Halloween</b>: today's puzzles pay <b>${HALLOWEEN_TIMES}x</b> mesos!</p>`
    : weekendNow() ? '<p class="mesoevent">🍁 <b>Weekend</b>: today\'s puzzles pay <b>2x</b> mesos!</p>' : '';
  const ev = weekend + MESO_EVENTS.filter((e, i, all) => today <= e.to && all.findIndex((x) => x.label === e.label) === i)
    .map((e) => `<p class="mesoevent">🎉 <b>${e.label ?? MESO_NAMES[e.mode]}</b> pays <b>${e.times}x</b> mesos from ${mesoDate(e.from)} to ${mesoDate(e.to)}!</p>`).join('');
  const rows = (mode) => {
    const t = MESO_TABLE[mode];
    const cells = t.map((v, i) => `<td>${i + 1}${i === t.length - 1 ? '+' : ''}</td>`).join('');
    const vals = t.map((v) => `<td>${fmt(v)}</td>`).join('');
    const bonus = (MESO_BONUS[mode] ? `<p class="mesobonus">Bonus right: +${MESO_BONUS[mode]}` : '') +
      (MESO_TITLE[mode] ? ` · Title right (Bonus 2): +${MESO_TITLE[mode]}` : '') + (MESO_BONUS[mode] ? '</p>' : '');
    return `<h3>${MESO_NAMES[mode]}${MESO_SOON.has(mode) ? ' <small>(coming soon)</small>' : ''}</h3>` +
      `<table class="mesotable"><tr><th>Guesses</th>${cells}</tr><tr><th>Mesos</th>${vals}</tr></table>${bonus}`;
  };
  body.innerHTML =
    `<p class="mesototal"><img src="images/fx/meso-gold.png" alt=""> ${fmt(mesoTotal())}</p>` + ev +
    '<p>Finish puzzles to earn mesos. The fewer guesses, the more you get! Archive days pay 10% (rounded up). Spend them in the 🛍️ Shop.</p>' +
    (all.length ? '<h3>Recent</h3><ul class="mesorecent">' + recent.map((e) =>
      `<li><span>${mesoDate(e.day)} · ${MESO_NAMES[e.mode] ?? e.mode} · ${e.what}${(e.times ?? 1) > 1 ? ` (${e.times}x)` : ''}</span><b>${e.amount < 0 ? '−' + fmt(-e.amount) : '+' + fmt(e.amount)}</b></li>`).join('') + '</ul>' + pager(page, last) : '') +
    '<h3 class="mesohow">How to earn</h3><p class="mesobonus">Boss Wordle and BGM Clip: only your best mode each day pays (do better on another mode and you get the difference), and the bonus pays once a day.</p>' +
    Object.keys(MESO_TABLE).map(rows).join('');
  for (const b of body.querySelectorAll('[data-page]')) b.addEventListener('click', () => openMeso(+b.dataset.page));
}

// ---- Shop: most items only show up once you've found them (e.g. Lucid's Garden of Eternal Dream: hear it in BGM Clip on
// its day and get the bonus right, not from the Archive); "always" ones are there from the start. Buying a background
// adds it to your themes; buying an effect pack (effect: true) adds its win effects (see HECATE).
const SHOP = {
  ...HOLIDAYS,   // holiday specials: in the shop only on their day
  helia: { name: 'Sol Hecate: Helia', kind: 'Guess in 1 win effect (Bundle of 5)', price: 2000, always: true, effect: true, added: Date.UTC(2026, 9, 24),
           img: 'images/fx/hecate/helia-bundle.webp', zoom: 'images/fx/hecate/helia-bundle-big.webp' },
  limboSub: { hidden: true, name: "Limbo's Subconscious", kind: 'Backgrounds, alert borders + wrong guess effect (Bundle of 5) + a special toggle effect', price: 10000, effect: true,
              themes: ['limbo', 'limboDark'], img: 'images/fx/limbo-bundle.webp?v=2', zoom: 'images/fx/limbo-bundle-big.webp?v=2' },
  mimica: { name: 'Sol Hecate: Mimica', kind: 'Guess in 1 win effect (Bundle of 5)', price: 2000, always: true, effect: true, added: Date.UTC(2026, 9, 25),
            img: 'images/fx/hecate/mimica-bundle.webp', zoom: 'images/fx/hecate/mimica-bundle-big.webp' },
  lucid: { hidden: true, name: 'Garden of Eternal Dream', kind: 'Moving background', price: 5000 },
  lucidBloom: { hidden: true, name: 'Lucid in Bloom', kind: 'Background', price: 2500 },
  lucidNight: { hidden: true, name: "Lucid's Starry Night", kind: 'Background', price: 2500 },
};
const shopOwned = (t) => (SHOP[t]?.effect ? ownedEffects() : ownedThemes()).includes(t);
drawThemeButton();   // here, not with applyTheme above: the Customize window needs SHOP
drawCustomFx();
if (limboGuessOn()) gfxClips();   // ready for the first guess
// Rows the game draws by itself (loading a day) get their dragons; a new guess's own effect marks its row first.
const rowsList = document.getElementById('rows');
if (rowsList) new MutationObserver(() => { if (limboGuessOn()) limboDragons(); limboAlertCheck(); }).observe(rowsList, { childList: true });
if (limboAllOn() || CUSTOM_FX[customFx()].color) limboFailLoad();
limboTransitions();
const SHOP_KEY = 'mapleWordle:shop';   // items found so far
function shopFound() {
  let found = [];
  try { found = JSON.parse(lsGet(SHOP_KEY) || '[]').filter((t) => t in SHOP && !(t in HOLIDAYS)); } catch {}
  const always = Object.keys(SHOP).filter((t) => SHOP[t].always && !found.includes(t));
  return [...(holidayToday() ? [holidayToday()] : []), ...always, ...found];
}
function shopUnlock(t, deal = true) {   // deal: found on its special day itself (not from the Archive): 90% off today
  if (!(t in SHOP) || shopFound().includes(t)) return;
  lsSet(SHOP_KEY, JSON.stringify([...shopFound(), t]));
  if (deal) lsSet(SHOP_FOUND_DAY_KEY, JSON.stringify({ ...shopFoundDay(), [t]: Math.floor(Date.now() / 86400000) }));
}
// Limited hidden items: 90% off for the rest of the (UTC) day you find them, e.g. Limbo's set found with 5 hours of its
// day left is 90% off for those 5 hours; a holiday's item is 90% off all of its day. Still locked: full price.
const SHOP_FOUND_DAY_KEY = 'mapleWordle:shopFoundDay';   // { item: the UTC day it was found }
const SHOP_DEAL = 0.1;
function shopFoundDay() { try { return JSON.parse(lsGet(SHOP_FOUND_DAY_KEY) || '{}'); } catch { return {}; } }
const shopDeal = (t) => !!SHOP[t]?.hidden && !shopOwned(t)
  && (holidayToday() === t || shopFoundDay()[t] === Math.floor(Date.now() / 86400000));
const shopPrice = (t) => (shopDeal(t) ? Math.ceil(SHOP[t].price * SHOP_DEAL) : SHOP[t].price);
const shopDealLeft = () => {   // until the site's day ends (UTC midnight)
  const m = Math.ceil((86400000 - (Date.now() % 86400000)) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
};
const priceHtml = (t) => `<span class="price${shopDeal(t) ? ' deal' : ''}"><img src="images/fx/meso-gold.png" alt=""> ` +
  (shopDeal(t) ? `<s>${fmt(SHOP[t].price)}</s> ` : '') + `<span>${fmt(shopPrice(t))}</span></span>`;
// NEW on the Shop button while it has something you haven't seen yet (not owned). An item put in the shop for everyone
// ("added": its UTC day) is only NEW for 3 days after that; one you found yourself is NEW until you've seen it. Opening
// the shop sees them all, and they keep a NEW tag in the shop until the page reloads.
const SHOP_NEW_DAYS = 3;
const SHOP_SEEN_KEY = 'mapleWordle:shopSeen';
const shopSeen = () => { try { return JSON.parse(lsGet(SHOP_SEEN_KEY) || '[]'); } catch { return []; } };
const shopRecent = (t) => !SHOP[t].added || Date.now() < SHOP[t].added + SHOP_NEW_DAYS * 86400000;
const shopNew = () => shopFound().filter((t) => shopRecent(t) && !shopSeen().includes(t) && !shopOwned(t));
const shopFresh = new Set();
function shopNewTag() {
  const b = document.getElementById('shopBtn');
  if (!b) return;
  b.querySelector('.newtag')?.remove();
  if (shopNew().length) b.appendChild(newTag());
}
function openShop() {
  const body = popup('shop', 'Shop');
  const found = shopFound(), have = mesoTotal();
  for (const t of shopNew()) shopFresh.add(t);
  lsSet(SHOP_SEEN_KEY, JSON.stringify([...new Set([...shopSeen(), ...found])]));
  shopNewTag();
  // A "hidden" item not found yet: a locked card with just its price (no picture or name), so people can save up for it.
  const locked = Object.keys(SHOP).filter((t) => SHOP[t].hidden && !found.includes(t) && !shopOwned(t)).map((t) =>
    `<div class="shopitem lockeditem"><span class="themepic hiddenpic">?</span>` +
    `<span class="shopinfo"><b>Hidden</b><small>A secret ${/Bundle/.test(SHOP[t].kind) ? 'bundle' : 'item'}. Keep playing, it shows up here on a special day 👀</small>` +
    `<span class="price"><img src="images/fx/meso-gold.png" alt=""> <span>${fmt(SHOP[t].price)}</span></span></span><span class="locked">🔒 Locked</span></div>`).join('');
  body.innerHTML = `<p class="mesototal"><img src="images/fx/meso-gold.png" alt=""> ${fmt(have)}</p>` +
    (found.length ? '<div class="shoplist">' + found.map((t) => {
      const it = SHOP[t], owned = shopOwned(t);
      // Not enough mesos: a greyed-out Buy; clicking it flashes how many more you need in the price (red, 2 s).
      const btn = owned ? '<span class="owned">Owned ✓</span>'
        : `<button data-buy="${t}"${have < shopPrice(t) ? ' class="poor" title="Not enough mesos"' : ''}>Buy</button>`;
      return `<div class="shopitem">${shopFresh.has(t) && !owned ? '<span class="newtag">NEW</span>' : ''}<span class="themepic zoomable" data-zoom="${t}" title="Click to zoom in" style="background-image:url('${it.img ?? THEME_IMG[t]}')"></span>` +
        `<span class="shopinfo"><b>${it.name}</b><small>${it.kind}</small>${priceHtml(t)}` +
        `${shopDeal(t) ? `<span class="dealtag">90% OFF · ${shopDealLeft()}</span>` : ''}</span>${btn}</div>`;
    }).join('') + locked + '</div>' : '<p class="shopempty">Nothing here yet... 👀</p>') +
    '<p class="mesoshop">More cosmetics are coming to the shop later, so save up your mesos!</p>';
  uiSound();   // opened by a click: get the hover sound ready
  for (const b of body.querySelectorAll('[data-buy]')) { b.addEventListener('click', () => buy(b.dataset.buy, b)); hoverSound(b); }
  for (const pic of body.querySelectorAll('[data-zoom]')) pic.addEventListener('click', () => zoomItem(pic.dataset.zoom));
}
// A shop item's picture, big (its "zoom" picture if it has a sharper one), with its name. Click anywhere or Esc closes it
// (only this, the shop stays open).
function zoomItem(t) {
  const it = SHOP[t];
  const win = document.createElement('div');
  win.className = 'zoomview';
  win.innerHTML = `<img src="${it.zoom ?? it.img ?? THEME_IMG[t]}" alt=""><b>${it.name}</b>`;
  const close = () => { win.remove(); removeEventListener('keydown', esc, true); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  win.addEventListener('click', close);
  addEventListener('keydown', esc, true);
  document.body.appendChild(win);
}
function tooPoor(btn, t) {
  const price = btn.closest('.shopitem').querySelector('.price');
  const num = price.querySelector('span');
  if (price.classList.contains('short')) return;
  const swap = (text, short) => {
    price.classList.add('swap');
    setTimeout(() => { num.textContent = text; price.classList.toggle('short', short); price.classList.remove('swap'); }, 150);
  };
  swap(fmt(shopPrice(t) - mesoTotal()), true);
  setTimeout(() => swap(fmt(shopPrice(t)), false), 2150);
}
// A small window over the shop about one item: its picture and name (and price), then two buttons. Resolves true for
// the first button; the second, Esc or a click outside resolve false (and only close this, the shop stays open).
function itemPopup(t, title, withPrice, [okText, okClass], [noText, noClass]) {
  const it = SHOP[t];
  return new Promise((done) => {
    const win = document.createElement('div');
    win.className = 'popup buyask';
    win.innerHTML = `<div class="panel"><h2>${title}</h2>` +
      `<span class="themepic" style="background-image:url('${it.img ?? THEME_IMG[t]}')"></span><b class="buyname">${it.name}</b>` +
      (withPrice ? priceHtml(t) : '') +
      `<p class="buybtns"><button class="${okClass}">${okText}</button><button class="${noClass}">${noText}</button></p></div>`;
    const [ok, no] = win.querySelectorAll('.buybtns button');
    const close = (yes) => { win.remove(); removeEventListener('keydown', esc, true); done(yes); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(false); } };
    ok.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    hoverSound(ok);
    hoverSound(no);
    win.addEventListener('click', (e) => { if (e.target === win) close(false); });
    addEventListener('keydown', esc, true);
    document.body.appendChild(win);
    ok.focus();
  });
}
// "Are you sure?" before buying: a green Yes and a red No.
const askBuy = (t) => itemPopup(t, 'Are you sure you want to purchase?', true, ['Yes', 'yes'], ['No', 'no']);
async function buy(t, btn) {
  const it = SHOP[t];
  if (!it || shopOwned(t)) return;
  const price = shopPrice(t);
  if (mesoTotal() < price) return btn && tooPoor(btn, t);
  if (!await askBuy(t) || shopOwned(t) || mesoTotal() < price) return;
  const log = mesoLog();
  log.push({ key: `shop:${t}`, mode: 'shop', day: Math.floor(Date.now() / 86400000), what: `Bought ${it.name}${price < it.price ? ' (90% off)' : ''}`, amount: -price });
  lsSet(MESO_LOG_KEY, JSON.stringify(log));
  if (it.effect) {   // an effect pack: tick all of its win effects straight away (along with the bought ones already ticked)
    lsSet(EFFECTS_KEY, JSON.stringify([...ownedEffects(), t]));
    setPickedSkins([...pickedSkins().filter((id) => HECATE[id].pack), ...Object.keys(HECATE).filter((id) => HECATE[id].pack === t)]);
    if (it.themes) {   // and its backgrounds (the first one on straight away)
      lsSet(THEMES_KEY, JSON.stringify([...new Set([...ownedThemes().filter((x) => x !== 'default'), ...it.themes])]));
      if (t !== 'limboSub') lsSet(THEME_KEY, it.themes[0]);
    }
    if (t === 'limboSub') setLimboAll(true);   // Limbo mode on (your own settings stay underneath)
    if (t === 'halloween') setHwFx(true);   // its bats, ghosts and fog, on
  } else {
    lsSet(THEMES_KEY, JSON.stringify(ownedThemes().filter((x) => x !== 'default').concat(t)));
    lsSet(THEME_KEY, t);   // use it straight away
  }
  resultSound(true, 0, 'purchase');
  markCustomNew(t);
  drawThemeButton();
  applyTheme(true);
  drawMeso();
  openShop();
  // Bought: Customize closes the shop and opens the Customize window on the item's tab
  if (await itemPopup(t, 'Successfully Purchased!', false, ['Customize', 'yes'], ['Close', 'plain'])) {
    document.getElementById('shop').hidden = true;
    document.getElementById('themeBtn')?.click();
  }
}

// BGM Clip's moving Easter egg backgrounds (a track with "egg" in data/bgm.json): fades in over the page while that
// track plays after the game, and stays for the day. eggScene(null) takes it away.
function eggScene(t) {
  const cur = document.querySelector('.eggscene');
  if (cur && cur.dataset.egg === t) return;
  cur?.remove();
  if (!t || !THEME_VIDEO[t]) return;
  const el = document.createElement('div');
  el.className = 'eggscene';
  el.dataset.egg = t;
  el.style.backgroundImage = `url("${THEME_IMG[t]}")`;
  el.appendChild(bgVideo(t));
  document.body.prepend(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
}
// Under the result message: a spinning gold meso and how many mesos today's game paid (with its bonus).
function mesoGain(mode, day, show) {
  const status = document.getElementById('status');
  if (!status) return;
  let el = document.getElementById('mesoGain');
  const got = show ? mesoLog().filter((e) => [`${mode}:${day}`, `${mode}+bonus:${day}`, `${mode}+title:${day}`].includes(e.key)).reduce((s, e) => s + e.amount, 0) : 0;
  // Nothing for this mode because another mode already paid more today (Boss Wordle / BGM Clip): say so.
  const group = groupOf(mode), elsewhere = show && !got && group && day >= BEST_ONLY_FROM
    && mesoLog().some((e) => group.some((m) => m !== mode && e.key === `${m}:${day}`));
  if (!got && !elsewhere) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('p');
    el.id = 'mesoGain';
    el.innerHTML = '<img src="images/fx/meso-gold.png" alt=""><span></span>';
    el.title = 'Mesos earned for this puzzle';
    el.addEventListener('click', () => openMeso());
    status.after(el);
  }
  el.querySelector('span').textContent = `+${fmt(got)}`;
  el.classList.toggle('none', !got);
  if (!got) el.querySelector('span').textContent = `+0 (you already earned more on another mode ${isArchive(day) ? 'that day' : 'today'})`;
}
// Under the Mode buttons (Boss Wordle, BGM Clip): only your best mode each day pays.
(() => {
  const modes = document.getElementById('modes');
  if (!modes || Math.floor(Date.now() / 86400000) < BEST_ONLY_FROM) return;
  const note = document.createElement('p');
  note.className = 'mesonote';
  note.innerHTML = '<img src="images/fx/meso-gold.png" alt=""><span>You only get mesos for your <b>best</b> mode each day.</span>';
  note.title = 'Do better on another mode and you get the difference.';
  modes.after(note);
})();
drawMeso();
// Weekend background effect: a few small maple leaves drifting down behind the game (Settings can turn it off).
let leafTimer = null;
function leaves() {
  const on = weekendNow() && bgEffectOn() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let box = document.getElementById('leaves');
  if (!on) { clearInterval(leafTimer); leafTimer = null; box?.remove(); return; }
  if (leafTimer) return;
  box = Object.assign(document.createElement('div'), { id: 'leaves' });
  box.setAttribute('aria-hidden', 'true');
  document.body.prepend(box);
  const drop = () => {
    if (document.hidden || box.childElementCount >= 10) return;
    const leaf = box.appendChild(Object.assign(document.createElement('img'), { src: 'images/fx/leaf.png', alt: '' }));
    const size = 10 + Math.random() * 8, x = Math.random() * 100, drift = (Math.random() - 0.5) * 160;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360), secs = 7 + Math.random() * 4;
    leaf.style.cssText = `width:${size}px;left:${x}vw`;
    leaf.animate([
      { transform: 'translate(0, -30px) rotate(0deg)', opacity: 0 },
      { opacity: 0.85, offset: 0.08 },
      { transform: `translate(${drift * 0.6}px, 50vh) rotate(${spin / 2}deg)`, offset: 0.5 },
      { transform: `translate(${drift}px, calc(100vh + 30px)) rotate(${spin}deg)`, opacity: 0.85 },
    ], { duration: secs * 1000, easing: 'linear' }).onfinish = () => leaf.remove();
  };
  drop();
  leafTimer = setInterval(drop, 700);
}
leaves();
// A game's tab shows its meso event while it's on, e.g. "3x" with a gold meso on BGM Clip.
for (const btn of document.querySelectorAll('[data-meso]')) {
  const today = Math.floor(Date.now() / 86400000);
  const times = mesoTimes(btn.dataset.meso, today);
  if (times <= 1) continue;
  const tag = document.createElement('span');
  tag.className = 'mesotag';
  tag.title = `${times}x mesos today!`;
  tag.innerHTML = `${times}x<img src="images/fx/meso-gold.png" alt="mesos">`;
  btn.appendChild(tag);
}

// The version button (bottom left) shows the newest version in CHANGELOG.md (its first "## alpha vX.Y - date" line), so
// a changelog edit on GitHub updates it too. The text in the page is only a fallback until that loads.
fetch('CHANGELOG.md', { cache: 'no-cache' }).then((r) => r.text()).then((md) => {
  const m = md.match(/^## (.+?)(?: - .*)?$/m);
  const btn = document.getElementById('version');
  if (m && btn) btn.textContent = m[1].trim().replace(/\bv\.(?=\d)/, 'v');   // "alpha v.4.3.2" shows as "alpha v4.3.2"
}).catch(() => {});
// The Changelog window (every game) built from CHANGELOG.md. Each "## alpha v4.3 - date" is a box you can open and close,
// and the versions are grouped by their first number (alpha v4, alpha v3, ...) in bigger boxes that open and close too.
// Only the newest group and its newest version start open.
function buildChangelog(body, md) {
  let group = null, major = null, ver = null, list = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      const [name, date] = line.slice(3).trim().split(' - ');
      const label = name.replace(/\bv\.(?=\d)/, 'v');   // "alpha v.4.3" shows as "alpha v4.3"
      const maj = (label.match(/^.*?v\d+/) || [label])[0];   // "alpha v4.3.2" -> "alpha v4"
      if (maj !== major) {
        major = maj;
        group = body.appendChild(document.createElement('details'));
        group.className = 'clgroup';
        group.open = body.childElementCount === 1;
        group.appendChild(document.createElement('summary')).textContent = maj;
      }
      ver = group.appendChild(document.createElement('details'));
      ver.className = 'clver';
      ver.open = group.open && group.childElementCount === 2;   // the group's first version (after its summary)
      const s = ver.appendChild(document.createElement('summary'));
      s.appendChild(document.createElement('b')).textContent = label;
      if (date) {
        const d = s.appendChild(document.createElement('span'));
        d.className = 'date';
        d.textContent = '- ' + date;
      }
      list = ver.appendChild(document.createElement('ul'));
    } else if (list && /^\s*[-*] /.test(line)) {
      // "- item" (or "* item"); indent it (2+ spaces or a tab) to put it under the bullet above it.
      const depth = line.match(/^\s*/)[0].replace(/\t/g, '  ').length >> 1;
      let ul = list;
      for (let i = 0; i < depth; i++) {
        const last = ul.lastElementChild;
        if (!last) break;
        ul = last.querySelector(':scope > ul') || last.appendChild(document.createElement('ul'));
      }
      clText(ul.appendChild(document.createElement('li')), line.replace(/^\s*[-*] /, ''));
    } else if (list && line.trim() && (!line.startsWith('#') || line.startsWith('### '))) {
      // A plain line ("[BGM Clip] Fixes:") is a small heading, "### ✨ New" a section heading; the bullets after
      // either go under it.
      if (!list.childElementCount) list.remove();   // no bullets came before it
      const p = ver.appendChild(document.createElement('p'));
      p.className = 'clnote';
      if (line.startsWith('### ')) p.classList.add('clsect');
      clText(p, line.slice(line.startsWith('### ') ? 4 : 0).trim());
      list = ver.appendChild(document.createElement('ul'));
    }
  }
  for (const ul of body.querySelectorAll('.clver > ul:empty')) ul.remove();
}
// Changelog text (every game's Changelog window): **bold** shows bold, the same as on GitHub. Anything else stays plain text.
// A section heading that starts with ✨ ("### ✨ New") makes its words sparkle a little.
function clText(el, text) {
  let into = el;
  const m = el.classList.contains('clsect') && text.match(/^✨\s*(.+)$/);
  if (m) {
    el.append('✨ ');
    into = el.appendChild(document.createElement('span'));
    into.className = 'sparkle';
    text = m[1];
  }
  text.split(/(\*\*[^*]+\*\*)/).forEach((part, i) => {
    if (i % 2) into.appendChild(document.createElement('b')).textContent = part.slice(2, -2);
    else if (part) into.appendChild(document.createTextNode(part));
  });
  return el;
}

// Halloween effects (holiday specials, Oct 31): Stirge bats and Pumpkin Bats flying across the top, a Jr. Wraith ghost
// drifting by now and then, and a low fog, all behind the game box. Settings > Background effect turns them off.
// The Haunted Mansion bundle's custom effect puts them on any day, on top of any other effect (Limbo mode turns
// everything else off, these too).
let hwTimer = null;
const HW_FX_KEY = 'mapleWordle:hwFx';
const hwFxOwned = () => ownedEffects().includes('halloween');
const hwFxOn = () => hwFxOwned() && lsGet(HW_FX_KEY) !== '0';
function setHwFx(on) { limboAllOff(); lsSet(HW_FX_KEY, on ? '1' : '0'); halloweenFx(); }
const hwWanted = () => !limboAllOn() && (holidayToday() === 'halloween' || hwFxOn())
  && bgEffectOn() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function halloweenFx() {
  const on = hwWanted();
  let box = document.getElementById('hwfx');
  if (!on) { clearInterval(hwTimer); hwTimer = null; box?.remove(); return; }
  if (hwTimer) return;
  box = Object.assign(document.createElement('div'), { id: 'hwfx' });
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<div class="fog f1"></div><div class="fog f2"></div>';
  document.body.prepend(box);
  const rand = (a, b) => a + Math.random() * (b - a);
  const fly = (src, size, secs) => {   // across the screen at a random height in the top half, bobbing up and down
    const img = box.appendChild(Object.assign(document.createElement('img'), { src, alt: '', className: 'flyer' }));
    const ltr = Math.random() < 0.5, y = rand(4, 45), bob = rand(15, 40);
    img.style.cssText = `width:${size}px;top:${y}vh;${ltr ? 'transform:scaleX(-1)' : ''}`;
    const from = ltr ? -15 : 110, to = ltr ? 110 : -15, flip = ltr ? ' scaleX(-1)' : '';
    img.animate([0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ transform: `translate(${from + (to - from) * t}vw, ${i % 2 ? -bob : 0}px)${flip}` })),
      { duration: secs * 1000, easing: 'linear' }).onfinish = () => img.remove();
  };
  const ghost = () => {   // fades in at the side of the screen, drifts up a little, fades out
    const img = box.appendChild(Object.assign(document.createElement('img'), { src: 'images/holiday/fx/ghost.gif', alt: '', className: 'ghost' }));
    const left = Math.random() < 0.5 ? rand(2, 18) : rand(78, 94);
    img.style.cssText = `width:${Math.round(rand(46, 64))}px;left:${left}vw;top:${rand(45, 70)}vh`;
    img.animate([{ opacity: 0, transform: 'translateY(0)' }, { opacity: 0.75, offset: 0.25 }, { opacity: 0.75, offset: 0.7 }, { opacity: 0, transform: 'translateY(-60px)' }],
      { duration: 9000, easing: 'ease-in-out' }).onfinish = () => img.remove();
  };
  let tick = 0;
  const step = () => {
    if (!hwWanted()) return halloweenFx();   // the page stayed open past Halloween (or the effect went off): stop
    if (document.hidden) return;
    tick++;
    if (box.querySelectorAll('.flyer').length < 4) fly('images/holiday/fx/bat.gif', Math.round(rand(34, 50)), rand(11, 17));
    if (tick % 5 === 0) fly('images/holiday/fx/pumpkin-bats.gif', 64, 22);
    if (tick % 4 === 2 && !box.querySelector('.ghost')) ghost();
  };
  step();
  hwTimer = setInterval(step, 2500);
}
halloweenFx();

// Midnight (the site's UTC day changing) with the page open: a holiday's background fades in over 2 s when it starts
// and fades back out over 2 s when it ends; its effects start / stop with it.
let fxDay = Math.floor(Date.now() / 86400000);
setInterval(() => {
  const d = Math.floor(Date.now() / 86400000);
  if (d === fxDay) return;
  fxDay = d;
  applyTheme(2);
  halloweenFx();
  leaves();
}, 1000);

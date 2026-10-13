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
const SOUND_VOLUME = 0.03;   // 0 = silent, 1 = full (at the slider's default 50%)
const SOUND_SECONDS = 10;    // how long to play before fading out
const SOUND_FADE = 2;        // seconds of fade-out
const SOUNDS = { win: 'sounds/star-force-success.mp3', lose: 'sounds/star-force-destroy.mp3',
  extremeLose: 'sounds/burning-city.mp3',         // Seren's Burning City (first 12.5 s), for an Extreme loss
  extremeWin: 'sounds/four-auspicious-beasts.mp3',  // Kaling's Four Auspicious Beasts from 0:16 (1 s fade-in), Extreme win on guess 2+
  animWin: 'sounds/rest-of-the-broken-truth.mp3',   // Malefic Star's Rest of the Broken Truth 0:15-0:36, Attack Animation win on guess 2-3
  classLose: 'sounds/the-breeze-that-carried-sorrow.mp3',   // Malitia's The Breeze That Carried Sorrow 0:00-0:18 (1 s fade-in), Class Wordle loss
  firstTry: 'sounds/the-unblessed-cathedral-descend.mp3',   // Meilin's The Unblessed Cathedral -Descend- 1:07-1:42 (1 s fade-in), any first-guess win
  classWin: 'sounds/succession-bloom.mp3' };   // First Adversary's Succession Bloom 1:03-1:27 (1 s fade-in), Class Wordle win on guess 2-5
// Tracks that play longer than SOUND_SECONDS: seconds before the fade-out starts (fade-out is SOUND_FADE).
const SOUND_LENGTH = { animWin: 19, classLose: 16, firstTry: 33, classWin: 22 };
// Tracks louder than SOUND_VOLUME.
const SOUND_LOUDER = { firstTry: 0.10 };
// Phone and tablet speakers are much quieter, so they play everything twice as loud (6%, and 20% for a first-guess win).
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
  ready.then((buffer) => {
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

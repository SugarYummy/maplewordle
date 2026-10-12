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
// [file, width, height] in sprite pixels; gold coins are the most common, bags the rarest.
const PIECES = [
  ['meso-gold', 23, 24], ['meso-gold', 23, 24], ['meso-gold', 23, 24],
  ['meso-bronze', 23, 24], ['meso-bronze', 23, 24],
  ['meso-bundle', 31, 30], ['meso-bundle', 31, 30],
  ['meso-bag', 32, 31],
];
for (const [file] of PIECES) new Image().src = `images/fx/${file}.png`;   // preload, so they're ready on a win

// A short burst of meso confetti falling from the top of the screen. A first-guess win gets 5x as much.
function confetti(firstTry = false) {
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < (firstTry ? 600 : 120); i++) {
    const bit = document.createElement('i');
    const [file, w, h] = PIECES[Math.floor(Math.random() * PIECES.length)];
    const scale = 1;   // actual in-game size (a whole number keeps the pixel art crisp)
    bit.style.width = w * scale + 'px';
    bit.style.height = h * scale + 'px';
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.backgroundImage = `url("images/fx/${file}.png")`;
    bit.style.animationDelay = Math.random() * 0.6 + 's';
    bit.style.animationDuration = 2 + Math.random() * 1.5 + 's';
    bit.style.setProperty('--drift', (Math.random() * 30 - 15) + 'vw');
    bit.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    box.appendChild(bit);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}

// ---- Result sounds (today's puzzle only): Star Force Success on a win, Star Force Destroy on a loss ----
// The files are full ~1 minute tracks, so only the start plays, quietly, then fades out.
// Played through Web Audio so the volume also works on iPhones (they ignore <audio> volume).
const SOUND_VOLUME = 0.01;   // 0 = silent, 1 = full
const SOUND_SECONDS = 10;    // how long to play before fading out
const SOUND_FADE = 2;        // seconds of fade-out
const SOUNDS = { win: 'sounds/star-force-success.mp3', lose: 'sounds/star-force-destroy.mp3',
  extremeLose: 'sounds/burning-city.mp3',         // Seren's Burning City (first 12.5 s), for an Extreme loss
  extremeWin: 'sounds/four-auspicious-beasts.mp3',  // Kaling's Four Auspicious Beasts from 0:16 (1 s fade-in), Extreme win on guess 2+
  animWin: 'sounds/rest-of-the-broken-truth.mp3' };   // Malefic Star's Rest of the Broken Truth 0:15-0:36, Attack Animation win on guess 2-3
// Tracks that play longer than SOUND_SECONDS: seconds before the fade-out starts (fade-out is SOUND_FADE).
const SOUND_LENGTH = { animWin: 19 };
const muteKey = 'mapleWordle:muted';
let audioCtx;
const muted = () => { try { return localStorage.getItem(muteKey) === '1'; } catch { return false; } };

// Call during the click / Enter that ends the game: browsers only allow sound that starts from a user action.
// Starts downloading the sound right away and plays it after `delay` ms (when the cards have flipped).
// `file` picks a different track (a key of SOUNDS); default is the win / lose track.
function resultSound(won, delay, file) {
  if (muted()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch { return; }
  const ctx = audioCtx;
  const ready = fetch(SOUNDS[file] || (won ? SOUNDS.win : SOUNDS.lose)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b));
  const due = Date.now() + delay;
  ready.then((buffer) => {
    const start = ctx.currentTime + Math.max(0, due - Date.now()) / 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SOUND_VOLUME, start);
    const len = SOUND_LENGTH[file] ?? SOUND_SECONDS;
    gain.gain.setValueAtTime(SOUND_VOLUME, start + len);
    gain.gain.linearRampToValueAtTime(0, start + len + SOUND_FADE);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start(start);
    src.stop(start + len + SOUND_FADE);
  }).catch(() => {});
}

// Sound on/off button in the top right corner (remembered per browser). Turning it off also stops a sound playing now.
(() => {
  const btn = document.createElement('button');
  btn.id = 'soundBtn';
  btn.className = 'panel';
  const show = () => {
    btn.textContent = muted() ? '🔇' : '🔊';
    btn.title = muted() ? 'Sound off (click to turn on)' : 'Sound on (click to turn off)';
  };
  btn.addEventListener('click', () => {
    try { localStorage.setItem(muteKey, muted() ? '0' : '1'); } catch {}
    if (muted() && audioCtx) { audioCtx.close(); audioCtx = null; }
    show();
  });
  show();
  document.body.appendChild(btn);
})();

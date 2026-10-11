// Small effects shared by every game page: flipping in a new guess row, and confetti on a win.
// Kept deliberately simple for now (no libraries, no sound).

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

// Confetti pieces are the in-game meso drops (sprites from maplestorywiki.net), drawn at 2x and kept pixel-sharp.
// [file, width, height] in sprite pixels; gold coins are the most common, bags the rarest.
const PIECES = [
  ['meso-gold', 23, 24], ['meso-gold', 23, 24], ['meso-gold', 23, 24],
  ['meso-bronze', 23, 24], ['meso-bronze', 23, 24],
  ['meso-bundle', 31, 30], ['meso-bundle', 31, 30],
  ['meso-bag', 32, 31],
];
for (const [file] of PIECES) new Image().src = `images/fx/${file}.png`;   // preload, so they're ready on a win

// A short burst of meso confetti falling from the top of the screen.
function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 40; i++) {
    const bit = document.createElement('i');
    const [file, w, h] = PIECES[Math.floor(Math.random() * PIECES.length)];
    const scale = 2;   // a whole-number size keeps the pixel art crisp
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

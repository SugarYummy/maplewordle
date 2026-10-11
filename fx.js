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

// A short burst of confetti falling from the top of the screen.
function confetti() {
  const colours = ['#e66', '#ec5', '#6c6', '#59f', '#c7f', '#fff'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 90; i++) {
    const bit = document.createElement('i');
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.background = colours[i % colours.length];
    bit.style.animationDelay = Math.random() * 0.6 + 's';
    bit.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
    bit.style.setProperty('--drift', (Math.random() * 30 - 15) + 'vw');
    bit.style.setProperty('--spin', (Math.random() * 1440 - 720) + 'deg');
    box.appendChild(bit);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

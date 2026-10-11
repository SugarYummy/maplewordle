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

// Confetti pieces are MapleStory things: maple leaves, meso coins and the odd Orange Mushroom (simple drawings).
const svg = (body) => 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`) + '")';
const leaf = (fill) => svg(`<path d="M12 1l1.6 3.6 2.2-1.2-.6 4.4 3.2-2.6.7 2 3-.6-1.3 3.8 1.9 1-4.9 4 .7 1.9-4.9-.9V22h-1.2v-4.6l-4.9.9.7-1.9-4.9-4 1.9-1-1.3-3.8 3 .6.7-2 3.2 2.6-.6-4.4 2.2 1.2z" fill="${fill}" stroke="rgba(0,0,0,.35)" stroke-width=".6" stroke-linejoin="round"/>`);
const PIECES = [
  leaf('#e63b2e'), leaf('#f08a24'), leaf('#f5c242'), leaf('#e63b2e'), leaf('#f08a24'),
  svg(`<circle cx="12" cy="12" r="9" fill="#f7c843" stroke="#b07a12" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a526" stroke-width="1.5"/><path d="M8.5 8.5l2 2" stroke="#fff6c8" stroke-width="1.5" stroke-linecap="round"/>`),
  svg(`<circle cx="12" cy="12" r="9" fill="#f7c843" stroke="#b07a12" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a526" stroke-width="1.5"/><path d="M8.5 8.5l2 2" stroke="#fff6c8" stroke-width="1.5" stroke-linecap="round"/>`),
  svg(`<path d="M9 13h6l1 7q0 2-4 2t-4-2z" fill="#fbe3c0" stroke="#7a4a1e"/><path d="M2 14q0-11 10-11t10 11q-10 2-20 0z" fill="#f39a2b" stroke="#7a4a1e"/>` +
      `<circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="15" cy="7" r="1.6" fill="#fff"/><circle cx="17.5" cy="11" r="1.2" fill="#fff"/>` +
      `<circle cx="10" cy="17" r=".8" fill="#333"/><circle cx="14" cy="17" r=".8" fill="#333"/>`),
];

// A short burst of Maple confetti falling from the top of the screen.
function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 60; i++) {
    const bit = document.createElement('i');
    const size = 24 + Math.random() * 16;
    bit.style.width = bit.style.height = size + 'px';
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.backgroundImage = PIECES[Math.floor(Math.random() * PIECES.length)];
    bit.style.animationDelay = Math.random() * 0.6 + 's';
    bit.style.animationDuration = 2 + Math.random() * 1.5 + 's';
    bit.style.setProperty('--drift', (Math.random() * 30 - 15) + 'vw');
    bit.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    box.appendChild(bit);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}

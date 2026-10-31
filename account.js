// ---- Accounts: a username + password (no email) keeps this site's progress (everything it saves in the browser,
// the mapleWordle:* keys) on the server (worker/account.js), so it can be played on a phone or another computer.
// Loaded first on every page, so every save the games make goes through it.
//   Signed in, each save (every guess, meso, purchase, setting) goes up to the account straight away. Each page load
//   (and coming back to the tab) checks whether another device saved since: if so, this one quietly takes the
//   account's save as it is and reloads. Each guess checks first too (acctGate): a device that's behind says
//   "Oops! Data out of sync!" and reloads without showing anything, so a guess can't be redone on another device.
//   A device that's behind can't save over the account either (the server says no).
//   Creating an account asks whether to keep this browser's progress or start fresh. Logging in replaces this
//   browser's progress with the account's; logging out clears it (it's in the account).
// Forgotten passwords: ask on Discord, the owner resets it (POST /admin/reset, see worker/account.js).
const ACCOUNT_URL = 'https://maplewordle-account.hanayuki.workers.dev/';
const ACCT_KEY = 'mapleWordle:account';   // { name, uid, token, rev, ask } (uid: the account's number) (ask: the keep / start fresh question isn't answered yet)
// Kept per device, not in the account: the account itself, and how loud things are on this device.
const ACCT_LOCAL = new Set([ACCT_KEY, 'mapleWordle:muted', 'mapleWordle:bgmVolume', 'mapleWordle:themeBgmVol']);
const ACCT_DISCORD = 'https://discord.gg/f22H4UJ';
const ACCT_NAME = /^[A-Za-z0-9]{1,10}$/, ACCT_PASS_MAX = 16;   // usernames: 1-10 letters or numbers; passwords: 1-16 characters

const acctSynced = (k) => typeof k === 'string' && k.startsWith('mapleWordle:') && !ACCT_LOCAL.has(k);
const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
const store = (() => { try { return localStorage; } catch { return null; } })();
function acct() {
  try { return JSON.parse(store?.getItem(ACCT_KEY) || 'null'); } catch { return null; }
}
const acctSave = (a) => { try { a ? rawSet.call(store, ACCT_KEY, JSON.stringify(a)) : rawRemove.call(store, ACCT_KEY); } catch {} };
function acctAll() {   // this browser's progress
  const out = {};
  for (let i = 0; i < (store?.length ?? 0); i++) { const k = store.key(i); if (acctSynced(k)) out[k] = store.getItem(k); }
  return out;
}
// Swap this browser's progress for `data` (the account's), without it counting as a change of its own.
function acctReplace(data) {
  for (const k of Object.keys(acctAll())) rawRemove.call(store, k);
  for (const [k, v] of Object.entries(data || {})) if (acctSynced(k)) rawSet.call(store, k, v);
}
// Took another device's save: this page (and any other open tab of the site) starts over with it.
function acctReload(rev) {
  const a = acct();
  if (a) acctSave({ ...a, rev, at: Date.now() });   // the other tabs see this change and reload too
  location.reload();
}
// Behind another device while doing something (a guess, a save): say so, then start over with the account's save.
let acctStale = false;
function acctOutOfSync(d) {
  if (acctStale) return;
  acctStale = true;
  acctReplace(d.data);
  const msg = Object.assign(document.createElement('div'), { className: 'acctoops', textContent: 'Oops! Data out of sync!' });
  document.body.appendChild(msg);
  setTimeout(() => acctReload(d.rev), 1500);
}
addEventListener('storage', (e) => {
  if (e.key !== ACCT_KEY) return;
  const was = JSON.parse(e.oldValue || 'null'), now = JSON.parse(e.newValue || 'null');
  if (!!was !== !!now || was?.at !== now?.at) location.reload();   // logged in / out, or took the account's save, in another tab
});

async function acctApi(path, body, token) {
  const r = await fetch(ACCOUNT_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    keepalive: !!body && JSON.stringify(body).length < 60000,   // a save sent as the page closes still arrives
  });
  let d = {};
  try { d = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, d };
}
// Signed out by the server (the password was reset): back to a fresh start, like logging out.
function acctGone() {
  acctReplace({});
  acctSave(null);
  location.reload();
}

// Every save on this page: noted, and sent up shortly after (several saves from one guess go up together).
const acctDirty = new Set();
let acctTimer = null;
function acctNote(k) {
  if (!acctSynced(k) || !acct() || acct().ask || acctStale) return;
  acctDirty.add(k);
  clearTimeout(acctTimer);
  acctTimer = setTimeout(acctPush, 100);
}
Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === store) acctNote(k); };
Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === store) acctNote(k); };
// One save or check at a time across this site's open tabs (so two tabs of the same browser never get in each other's way).
const acctLock = (fn) => (navigator.locks ? navigator.locks.request('mapleWordle-account', fn) : fn());
let acctRetry = 0;
function acctPush() {
  return acctLock(async () => {
    const a = acct();
    if (!a || a.ask || acctStale || !acctDirty.size) return;
    const keys = [...acctDirty];
    acctDirty.clear();
    const set = {}, del = [];
    for (const k of keys) { const v = store.getItem(k); if (v == null) del.push(k); else set[k] = v; }
    try {
      const r = await acctApi('sync', { base: a.rev, set, del }, a.token);
      if (r.status === 401) return acctGone();
      if (r.status === 409) return acctOutOfSync(r.d);   // another device saved first: this save doesn't count, take its save
      if (!r.ok) throw 0;
      acctSave({ ...acct(), rev: r.d.rev });
      acctRetry = 0;
    } catch {   // offline or the server's down: try again in a bit
      for (const k of keys) acctDirty.add(k);
      clearTimeout(acctTimer);
      acctTimer = setTimeout(acctPush, Math.min(60000, 2000 * 2 ** acctRetry++));
    }
  });
}
addEventListener('pagehide', () => { if (acctDirty.size) acctPush(); });

// Is the account ahead of this page (another device saved since)? Also picks up a username changed elsewhere.
// Resolves the account's save if so, else null (also when the server can't be reached in time: then it carries on).
function acctNewer(wait = 0) {
  return acctLock(async () => {
    const a = acct();
    if (!a || a.ask) return null;
    try {
      const ask = acctApi('sync?rev=' + a.rev, null, a.token);
      const r = await (wait ? Promise.race([ask, new Promise((_, no) => setTimeout(no, wait))]) : ask);
      if (r.status === 401) { acctGone(); return null; }
      if (r.ok && r.d.name && (r.d.name !== acct()?.name || r.d.id !== acct()?.uid)) acctSave({ ...acct(), name: r.d.name, uid: r.d.id });
      if (r.ok && r.d.rev !== acct()?.rev && r.d.data) return r.d;
    } catch {}
    return null;
  });
}
// Page load / back to the tab: take a newer save quietly. (Unsent saves of this page go up first and find out.)
async function acctPull() {
  const d = await acctNewer();
  if (!d) return;
  if (acctDirty.size) return acctPush();
  acctReplace(d.data);
  acctReload(d.rev);
}
acctPull();
document.addEventListener('visibilitychange', () => { if (!document.hidden) acctPull(); });
// A guess (the games wrap theirs with this): signed in, it checks the account first, and a device that's behind
// reloads ("Oops! Data out of sync!") instead of showing the result. Taps while it checks are ignored.
let acctBusy = false;
function acctGate(fn) {
  return function (...args) {
    const a = acct();
    if (!a || a.ask) return fn.apply(this, args);
    if (acctBusy || acctStale) return;
    acctBusy = true;
    try { if (typeof soundCtx === 'function' && !muted()) soundCtx(); } catch {}   // (sound needs the click itself, before the wait)
    acctNewer(2000).then((d) => {
      acctBusy = false;
      if (d) acctOutOfSync(d);
      else fn.apply(this, args);
    });
  };
}

// ---- Settings: the Account row, and its windows ----
const acctEsc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// The row at the top of Settings (fx.js puts it there with its (i) maker, then calls acctRowSetup on it).
function acctRow(tip) {
  const a = acct();
  return `<div class="setrow" id="acctRow"><span class="setlabel">Account ${tip("Play on any device: your progress (mesos, items, guesses, settings) is saved to your account after every guess, " +
    'so you can pick up on your phone or another computer. Just a username and password, no email. Sound volume stays separate on each device.')}` +
    `${a?.uid ? `<small class="acctuid">UID: ${a.uid}</small>` : ''}</span>` + (a
    ? `<span class="acctinfo"><span class="acctwelcome">Welcome back, <b>${acctEsc(a.name)}</b>!</span><span class="acctbtns">` +
      '<button class="acctbtn" data-acct="settings">Account Settings</button><button class="acctbtn acctout" data-acct="logout">Log out</button></span></span>'
    : '<button class="acctbtn acctmain" data-acct="signup">Create an Account</button><button class="acctbtn" data-acct="login">Log in</button>') +
    '</div>';
}
function acctRowSetup(body) {
  const go = { signup: () => acctForm('signup'), login: () => acctForm('login'), settings: acctSettings, logout: acctLogout };
  for (const b of body.querySelectorAll('[data-acct]')) b.addEventListener('click', go[b.dataset.acct]);
}
const acctRefresh = () => { if (!document.getElementById('settings')?.hidden) document.getElementById('settingsBtn')?.click(); };   // redraw Settings
// A small window over everything (like the shop's "Are you sure?"). Returns its panel and a close function.
function acctWin(html, { closable = true, form = false, onClose } = {}) {
  const win = document.createElement('div');
  win.className = 'popup buyask acctwin';
  win.innerHTML = form ? `<form class="panel acctform">${html}</form>` : `<div class="panel">${html}</div>`;
  const close = (v) => { win.remove(); removeEventListener('keydown', esc, true); onClose?.(v); };
  const esc = (e) => { if (e.key === 'Escape' && closable) { e.stopImmediatePropagation(); close(null); } };
  if (closable) win.addEventListener('click', (e) => { if (e.target === win) close(null); });
  addEventListener('keydown', esc, true);
  document.body.appendChild(win);
  return { panel: win.firstElementChild, close };
}
// A question: resolves true for the first button, false for the second (null: closed). No second one: just OK.
const acctAsk = (title, text, [okText, okClass], [noText, noClass] = [], closable = true) => new Promise((done) => {
  const { panel, close } = acctWin(`<h2>${title}</h2><p class="accttext">${text}</p>` +
    `<p class="buybtns"><button class="${okClass}">${okText}</button>${noText ? `<button class="${noClass}">${noText}</button>` : ''}</p>`, { closable, onClose: done });
  const [ok, no] = panel.querySelectorAll('.buybtns button');
  ok.addEventListener('click', () => close(true));
  no?.addEventListener('click', () => close(false));
});
// A password box with an eye: click it to show what's typed, again to hide it.
const acctPassField = (label, name, auto) => `<label class="acctfield"><span>${label}</span><span class="pwbox">` +
  `<input name="${name}" type="password" maxlength="${ACCT_PASS_MAX}" autocomplete="${auto}">` +
  '<button type="button" class="pweye" aria-label="Show password" title="Show password">👁️</button></span><span class="fielderr"></span></label>';
const acctNameField = (label, name, auto) => `<label class="acctfield"><span>${label}</span>` +
  `<input name="${name}" maxlength="10" autocomplete="${auto}" autocapitalize="off" spellcheck="false"><span class="fielderr"></span></label>`;
const ACCT_WARN = `<p class="acctwarn"><b>Warning:</b> Do not use a real password! If you forget your password, just ask for help on the <a href="${ACCT_DISCORD}" target="_blank" rel="noopener">Discord</a>!</p>`;
const ACCT_ERRORS = { name: 'Usernames are 1-10 letters or numbers (no spaces or symbols).', pass: `Passwords are 1-${ACCT_PASS_MAX} characters.`,
  taken: 'That username is taken.', nouser: 'This username does NOT exist, double check what you typed.',
  wrong: "The username and password does NOT match, double check to make sure it's correct.", 'slow down': 'Too many tries. Wait a few minutes and try again.',
  match: "They don't match. Type the same thing twice.", same: "That's already your username.", offline: "Can't reach the server. Check your connection and try again." };
// Errors shown under a field (by its input's name) instead of above the buttons.
const ACCT_FIELD_ERR = { nouser: 'user', wrong: 'pass' };
// A form window: fields, an error line, then its button and Cancel. submit(form) resolves an error key, or nothing when done.
function acctFormWin(title, fields, button, submit) {
  const { panel: form, close } = acctWin(`<h2>${title}</h2>${fields}<p class="accterr" aria-live="polite"></p>` +
    `<p class="buybtns"><button type="submit" class="yes">${button}</button><button type="button" class="plain" data-close>Cancel</button></p>`, { form: true });
  const err = form.querySelector('.accterr'), go = form.querySelector('[type="submit"]');
  form.querySelector('[data-close]').addEventListener('click', () => close());
  for (const eye of form.querySelectorAll('.pweye')) {
    eye.addEventListener('click', () => {
      const input = eye.previousElementSibling, show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.textContent = show ? '🙈' : '👁️';
      eye.title = eye.ariaLabel = show ? 'Hide password' : 'Show password';
      eye.classList.toggle('on', show);
    });
  }
  form.querySelector('input').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    for (const f of form.querySelectorAll('.fielderr')) f.textContent = '';
    go.disabled = true;
    let bad;
    try { bad = await submit(form); } catch { bad = 'offline'; }
    if (bad) {
      const text = ACCT_ERRORS[bad] ?? 'Something went wrong. Try again.';
      const at = ACCT_FIELD_ERR[bad] && form.querySelector(`input[name="${ACCT_FIELD_ERR[bad]}"]`)?.closest('label').querySelector('.fielderr');
      (at ?? err).textContent = text;
      go.disabled = false;
      return;
    }
    close();
  });
  return close;
}
const acctCheckName = (n) => (ACCT_NAME.test(n) ? null : 'name');
const acctCheckPass = (p) => (p && p.length <= ACCT_PASS_MAX ? null : 'pass');
// Create an Account / Log in.
function acctForm(mode) {
  const signup = mode === 'signup';
  acctFormWin(signup ? 'Create an Account' : 'Log in',
    acctNameField('Username', 'user', 'username') + acctPassField('Password', 'pass', signup ? 'new-password' : 'current-password') +
    (signup ? '<p class="accthint">Username: up to 10 letters or numbers. Password: up to 16 characters.</p>'
      : '<p class="accthint">This replaces the progress in this browser with your account\'s.</p>') + ACCT_WARN,
    signup ? 'Create an Account' : 'Log in',
    async (form) => {
      const name = form.user.value.trim(), pass = form.pass.value;
      const bad = (signup && acctCheckName(name)) || acctCheckPass(pass);
      if (bad) return bad;
      const r = await acctApi(mode, { name, pass });
      if (!r.ok) return r.d.error;
      if (signup) {
        acctSave({ name: r.d.name, uid: r.d.id, token: r.d.token, rev: 0, ask: true, at: Date.now() });
        setTimeout(acctAskKeep);
      } else {   // the account's progress, as it is
        acctReplace(r.d.data);
        acctSave({ name: r.d.name, uid: r.d.id, token: r.d.token, rev: r.d.rev, at: Date.now() });
        location.reload();
      }
    });
}
// Account Settings: change the username or the password.
function acctSettings() {
  const a = acct();
  if (!a) return;
  const { panel, close } = acctWin(`<h2>Account Settings</h2><p class="accttext">Logged in as <b>${acctEsc(a.name)}</b></p>` +
    '<p class="acctchoices"><button class="acctbtn" data-do="name">Change Username</button><button class="acctbtn" data-do="pass">Change Password</button></p>' +
    '<p class="buybtns"><button class="plain" data-close>Close</button></p>');
  panel.querySelector('[data-close]').addEventListener('click', () => close());
  panel.querySelector('[data-do="name"]').addEventListener('click', () => { close(); acctChange('name'); });
  panel.querySelector('[data-do="pass"]').addEventListener('click', () => { close(); acctChange('pass'); });
}
function acctChange(what) {
  const name = what === 'name';
  acctFormWin(name ? 'Change Username' : 'Change Password',
    (name ? acctNameField('New username', 'one', 'off') + acctNameField('Confirm new username', 'two', 'off')
      : acctPassField('New password', 'one', 'new-password') + acctPassField('Confirm new password', 'two', 'new-password')) +
    (name ? '<p class="accthint">Up to 10 letters or numbers.</p>' : ACCT_WARN),
    name ? 'Change Username' : 'Change Password',
    async (form) => {
      const one = name ? form.one.value.trim() : form.one.value, two = name ? form.two.value.trim() : form.two.value;
      const bad = name ? acctCheckName(one) : acctCheckPass(one);
      if (bad) return bad;
      if (one !== two) return 'match';
      if (name && one === acct().name) return 'same';
      const r = await acctApi(name ? 'rename' : 'password', name ? { name: one } : { pass: one }, acct().token);
      if (r.status === 401) return acctGone();
      if (!r.ok) return r.d.error;
      if (name) acctSave({ ...acct(), name: r.d.name });
      acctRefresh();
      setTimeout(() => acctAsk(name ? 'Username changed!' : 'Password changed!',
        name ? `Your name is now <b>${acctEsc(r.d.name)}</b>.` : 'Use your new password next time you log in.', ['OK', 'yes']));
    });
}
// Just made an account: keep this browser's progress in it, or start fresh (that's the account from then on).
async function acctAskKeep() {
  if (document.querySelector('.acctkeep')) return;
  const p = acctAsk(`Welcome, ${acctEsc(acct().name)}!`, "Your account is ready. Do you want to save this browser's progress to it, or start fresh?",
    ['Save my progress', 'yes'], ['Start fresh', 'plain'], false);
  document.querySelector('.acctwin:last-child')?.classList.add('acctkeep');
  const keep = await p;
  const a = acct();
  if (!a) return;
  try {
    const r = await acctApi('sync', { base: 0, replace: keep ? acctAll() : {} }, a.token);
    if (r.status === 401) return acctGone();
    if (r.status === 409) { acctReplace(r.d.data); return acctReload(r.d.rev); }   // (answered on another device already)
    if (!r.ok) throw 0;
    if (!keep) acctReplace({});
    acctSave({ ...a, ask: undefined, rev: r.d.rev, at: Date.now() });
    location.reload();
  } catch {
    await acctAsk("Couldn't save", "Can't reach the server right now. We'll ask again next time.", ['OK', 'yes']);
  }
}
async function acctLogout() {
  const a = acct();
  if (!a) return;
  const yes = await acctAsk('Log out?', 'Your progress is saved in your account. This browser goes back to a fresh start until you log in again.',
    ['Log out', 'no'], ['Cancel', 'plain']);
  if (!yes) return;
  if (acctDirty.size) await acctPush();
  try { await acctApi('logout', {}, a.token); } catch {}
  acctReplace({});
  acctSave(null);
  location.reload();
}
// Made an account but left before answering: asked again on the next page.
if (acct()?.ask) addEventListener('DOMContentLoaded', acctAskKeep);

// ---- Achievements (the trophy under Settings): accounts only. Worked out from what the games already save (results, guesses,
// streaks, the meso log), so everything played before counts too. Which ones are unlocked (and when) is saved in
// mapleWordle:achv, so it goes to the account like every other save; a new one pops up a small "Achievement unlocked"
// note (the first look ever unlocks what was earned before quietly). Logged out, the window just says to make an account.
// The window: your stats on top, then each group of achievements; secret ones show as ??? until found.
(() => {
  const ACHV_KEY = 'mapleWordle:achv';   // { <id>: <day unlocked>, _bestWinStreak }
  const DAY_MS = 86400000, today = () => Math.floor(Date.now() / DAY_MS);
  const fxName = (a) => (typeof HECATE !== 'undefined' && HECATE[a.fx]?.name) || a.full || a.name;   // a win effect reward's name: the same as in Customize (fx.js HECATE)
  const GAMES = { boss: ['story', 'normal', 'hard', 'extreme'], bgm: ['bgmnormal', 'bgm'], class: ['class'], anim: ['anim'] };
  const ALL_MODES = Object.values(GAMES).flat();
  const gameOf = (mode) => Object.keys(GAMES).find((g) => GAMES[g].includes(mode));
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const json = (k, d) => { try { return JSON.parse(read(k)) ?? d; } catch { return d; } };
  // Numbers in the game's own digits (images/achv/num-score: the emblem's points, num-scoreSmall: under the cups)
  const digits = (n, set) => [...String(n)].map((d) => `<img src="images/achv/num-${set}/${d}.png" alt="">`).join('');
  const rowDate = (d) => new Date(d * DAY_MS).toISOString().slice(0, 10).replace(/-/g, '.');   // like the game: 2026.11.01
  const dayText = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const loggedIn = () => typeof acct === 'function' && !!acct();
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  // The lists the collections count against (every boss / class there is), loaded once when needed.
  let lists = null;
  const loadLists = () => (lists ??= Promise.all(['data/bgm.json', 'data/bosses.json', 'data/classes.json', 'data/animation.json']
    .map((u) => fetch(u).then((r) => r.json()).catch(() => null)))
    .then(([bgm, bosses, classes, anim]) => {
      const t = today();
      const bossOf = {};   // a Boss Wordle answer -> its boss (Zakum (Chaos) -> Zakum)
      for (const pool of Object.values(bosses?.pools || {})) for (const e of pool) bossOf[e.name] = e.boss || e.name;
      return {
        tracksOf: Object.fromEntries((bgm?.bosses || []).map((b) => [b.name, [...new Set(b.areas.map((a) => a.track))]])),
        bgm: (bgm?.bosses || []).filter((b) => !b.since || Date.parse(b.since) / DAY_MS <= t).map((b) => b.name),
        bossOf, bosses: [...new Set(Object.values(bossOf))],
        classes: (classes?.solo || []).map((c) => c.name),
        anim: [...new Set((anim?.puzzles || []).map((p) => p.class))],
      };
    }));

  // Everything the achievements look at, from this browser's (= the account's) saves.
  function stats(L) {
    const s = { played: 0, wins: 0, firstTry: 0, firstReg: 0, diamond: 0, rainbow: 0, days: new Set(), games: new Set(), streak: 0, mesos: 0,
      won: { bgm: new Set(), boss: new Set(), class: new Set(), anim: new Set() }, winsBy: { boss: 0, bgm: 0, class: 0, anim: 0 }, extremeWins: 0, limbo: false,
      tracks: new Set(json('mapleWordle:bgmTracksLive', [])), buys: 0,
      limboMash: read('mapleWordle:limboMashLive') === '1', lucidEgg: read('mapleWordle:lucidEggLive') === '1' };
    const byMode = {};   // each mode's days played: [day, won]
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i), m = /^mapleWordle:result:([a-z]+):(\d+)$/.exec(key);
      if (!m || !ALL_MODES.includes(m[1])) continue;
      const r = read(key) || '', mode = m[1], d = +m[2], game = gameOf(mode);
      if (!/^(Won|Lost)/.test(r)) continue;
      (byMode[mode] ??= []).push([d, /^Won/.test(r)]);
      s.played++;
      s.days.add(d);
      const w = /^Won (?:in )?(\d+)/.exec(r);
      if (!w) continue;
      s.wins++;
      s.winsBy[game]++;
      if (mode === 'extreme' || mode === 'bgm') s.extremeWins++;   // Extreme: Boss Wordle Extreme and BGM Clip Extreme
      s.games.add(game);
      if (+w[1] === 1) { s.firstTry++; if (game === 'boss' || game === 'class') s.firstReg++; }   // (a star; regular Wordle: Boss and Class)
      // Each badge counts for the ones under it too: a 🌈 is also a 💎 and a ⭐, a 💎 also a ⭐ (⭐: firstTry, above)
      if (r.endsWith('💎') || r.endsWith('🌈')) s.diamond++;
      if (r.endsWith('🌈')) s.rainbow++;
      if (read(`mapleWordle:style:${mode}:${d}`) === 'limborb') s.limbo = true;
      // The answer of a won day is its last guess.
      const saved = json(`mapleWordle:${mode}:${d}`, []);
      const g = Array.isArray(saved) ? saved : saved.g || [];
      const last = g[g.length - 1];
      if (last) s.won[game].add(game === 'boss' ? (L?.bossOf[last] || last) : last);
    }
    // The best win streak in any one mode: wins in a row, day by day through everything saved (the Archive too); a loss ends it
    for (const list of Object.values(byMode)) {
      let run = 0;
      for (const [, won] of list.sort((a, b) => a[0] - b[0])) { run = won ? run + 1 : 0; s.streak = Math.max(s.streak, run); }
    }
    s.streak = Math.max(s.streak, json(ACHV_KEY, {})._bestWinStreak || 0);   // the best one seen, kept (a streak can end)
    // Shop buys: every shop item you own (fx.js)
    try { s.buys = Object.keys(SHOP).filter(shopOwned).length; } catch {}
    s.mesos = json('mapleWordle:mesoLog', []).reduce((t, e) => t + Math.max(0, e.amount || 0), 0);
    // Memories: a game finished ON Halloween 2026 (Oct 31, UTC). Its meso entry says so: that day's own puzzles paid 5x
    // (times: 5); the Archive never does.
    const HALLOWEEN_2026 = Date.UTC(2026, 9, 31) / DAY_MS;
    s.halloween2026 = json('mapleWordle:mesoLog', []).some((e) => e.day === HALLOWEEN_2026 && e.times === 5 && e.amount > 0);
    return s;
  }
  const count = (set, list) => list ? list.filter((x) => set.has(x)).length : set.size;

  // Each: { id, name, how, prog(stats, lists) -> [have, need], icon, reward?, secret? }. Icons: official MapleStory item
  // art (images/achv/<item id>.png from maplestory.io), names from Maple medals / items.
  const A = (id, name, how, prog, icon, extra) => ({ id, name, how, prog, icon: /^\d+$/.test(icon) ? `images/achv/${icon}.png` : icon, ...extra });
  const upTo = (n, need) => [Math.min(n, need), need];
  // Icons: the skill's icon (Kai, Malefic Star); Mayrin and Bellona use their boss picture until GMS has theirs.
  // Hidden: win every BGM of the boss (waiting room, each phase, loot room) in BGM Clip Extreme. Locked: its short name,
  // ??? and N / M; unlocked: its full name (the boss's finishing attack) and what you did.
  // A Hidden boss one: the boss's picture as its icon, and its reward's: rwIcon (a MapleStory icon), or a picture (rwPic)
  const kill = (boss, name, full, img, fx, rw) => A(`kill:${boss}`, name, `Played all versions of ${boss}'s BGM in Extreme mode.`,
    (s, L) => { const t = L?.tracksOf[boss] || []; return [t.filter((x) => s.tracks.has(x)).length, t.length || 1]; },
    `images/bosses/${img}.png`, { full, fx, reward: 'Guess in 1 win effect', ...rw });
  // Five steps per kind: 10 / 20 / 30 / 40 / 100 AP (Common / Rare / Epic / Unique / Legendary). Cups as icons (hidden: their own).
  const steps = (id, names, how, val, needs) => names.map((n, i) => A(`${id}${needs[i]}`, n, how(needs[i]), (s) => upTo(val(s), needs[i]), '', { ap: [10, 20, 30, 40, 100][i] }));
  const times = (n, one, many) => n === 1 ? one : many.replace('#', fmt(n));
  const SECTIONS = [
    ['Milestones', [
      ...steps('wins', ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master'], (n) => times(n, 'Win a game.', 'Win # games.'), (s) => s.wins, [1, 10, 50, 100, 500]),
      ...steps('reg', ["Beginner's Luck", 'Plot Armor', 'The Chosen One', 'Blessed by RNGesus', 'The Stars Aligned'],
        (n) => times(n, 'Win on your first guess in Boss or Class Wordle.', 'Win on your first guess # times in Boss or Class Wordle.'), (s) => s.firstReg, [1, 2, 5, 10, 20]),
      ...steps('star', ['Born to Be Gold', 'Written in the Stars', 'Heart of God', "Midas' Touch", 'Beyond the Stars'],
        (n) => times(n, 'Get a star (win on your first guess).', 'Get # stars (win on your first guess).'), (s) => s.firstTry, [1, 5, 10, 20, 50]),
      ...steps('diamond', ['Born to Be Diamond', 'Priceless Gem', 'Heart of the Ocean', 'Diamond Hands', 'A Diamond is Forever'],
        (n) => times(n, 'Get a diamond by guessing in 1.', 'Get # diamonds by guessing in 1.'), (s) => s.diamond, [1, 5, 10, 20, 50]),
      ...steps('rainbow', ['Born to Be Rainbow', 'Pot of Gold', 'What a Wonderful World', 'Prismatic', 'Eternal Spectrum'],
        (n) => times(n, 'Get a rainbow by guessing in 1.', 'Get # rainbows by guessing in 1.'), (s) => s.rainbow, [1, 5, 10, 20, 50]),
      A('allgames', 'Exploring the Sea', 'Win every game once.', (s) => [s.games.size, 4], '', { ap: 10 }),
    ]],
    // Wins in each game: Boss Wordle (Story, Normal, Hard, Extreme), BGM Clip (Normal, Extreme), Class (Class Wordle, Attack Animation)
    ['Games', [
      ...steps('bosswins', ['Boss Rookie', 'Boss Expert', 'Boss Elite', 'Boss Legend', 'Boss Transcendent'],
        (n) => times(n, 'Win a game of Boss Wordle.', 'Win # games of Boss Wordle.'), (s) => s.winsBy.boss, [1, 10, 25, 100, 500]),
      ...steps('bgmwins', ['BGM Rookie', 'BGM Expert', 'BGM Elite', 'BGM Legend', 'BGM Transcendent'],
        (n) => times(n, 'Win a game of BGM Clip.', 'Win # games of BGM Clip.'), (s) => s.winsBy.bgm, [1, 10, 25, 100, 500]),
      ...steps('classwins', ['Class Rookie', 'Class Expert', 'Class Elite', 'Class Legend', 'Class Transcendent'],
        (n) => times(n, 'Win a game of Class Wordle or Attack Animation.', 'Win # games of Class Wordle or Attack Animation.'), (s) => s.winsBy.class + s.winsBy.anim, [1, 10, 25, 100, 500]),
      ...steps('extremewins', ['Extreme Beginner', 'Extreme Effort', 'Extreme Mastery', 'Extreme Legend', 'Extreme Champion'],
        (n) => times(n, 'Win a game in Extreme (Boss Wordle or BGM Clip).', 'Win # games in Extreme (Boss Wordle or BGM Clip).'), (s) => s.extremeWins, [1, 10, 25, 100, 500]),
    ]],
    ['Dedication', [
      ...steps('days', ['Just Getting Started', 'Dedicated', 'Tryhard', 'Obsession', 'Addiction'],
        (n) => times(n, 'Play for the first time.', 'Play on # days.'), (s) => s.days.size, [1, 7, 30, 100, 365]),
      ...steps('streak', ['Rookie', 'Pro', 'Elite', 'Legend', 'Transcendent'], (n) => `Reach a ${n} win streak.`, (s) => s.streak, [3, 10, 50, 100, 365]),
    ]],
    ['Mesos & Shop', [
      ...steps('meso', ['First Paycheck', 'Making Ends Meet', 'Middle-Class', 'Upper-Class', 'Millionaire'],
        (n) => `Earn ${fmt(n)} mesos.`, (s) => s.mesos, [100, 1000, 10000, 100000, 1000000]),
      ...steps('buy', ['First Purchase', 'Impulse Buyer', 'Regular Customer', 'VIP Customer', 'The Collector'],
        (n) => times(n, 'Buy an item in the shop.', 'Buy # items in the shop.'), (s) => s.buys, [1, 5, 10, 50, 100]),
    ]],
    ['Collections', [
      A('col:bgm', 'BGM Master', 'Win BGM Clip with every boss.', (s, L) => [count(s.won.bgm, L?.bgm), L?.bgm.length || 1], '', { ap: 100 }),
      A('col:boss', 'Boss Master', 'Win Boss Wordle with every boss.', (s, L) => [count(s.won.boss, L?.bosses), L?.bosses.length || 1], '', { ap: 100 }),
      A('col:class', 'Class Master', 'Win Class Wordle with every class.', (s, L) => [count(s.won.class, L?.classes), L?.classes.length || 1], '', { ap: 100 }),
      A('col:anim', 'Skill Master', 'Win Attack Animation with every class.', (s, L) => [count(s.won.anim, L?.anim), L?.anim.length || 1], '', { ap: 100 }),
    ]],
    ['Hidden', [
      kill('Malefic Star', "Siren's Song", "Siren's Song", 'malefic-star', 'sirenSong', { rwIcon: 'images/achv/siren-song.png' }),
      kill('Kai', 'Iaido Alpha', 'Iaido Alpha', 'kai', 'iaidoAlpha', { rwIcon: 'images/achv/iaido-alpha.png' }),   // (its win effect, the reward, keeps its full name: fx.js HECATE)
      kill('Mayrin', 'Guiding Fate: Doom', 'Guiding Fate: Doom', 'mayrin', 'mayrinKill', { rwPic: 'images/fx/hecate/mayrinKill-reward.webp?v=1' }),   // (no icons of their own yet)
      kill('Bellona', "Fanatic's Execution", "Fanatic's Execution", 'bellona', 'bellonaKill', { rwPic: 'images/fx/hecate/bellonaKill-reward.webp?v=1' }),
      A('kill:Jupiter', 'Seething Balance', "Played all versions of Jupiter's BGM in Extreme mode.",
        (s, L) => { const t = L?.tracksOf.Jupiter || []; return [t.filter((x) => s.tracks.has(x)).length, t.length || 1]; },
        'images/bosses/jupiter.png', { appear: 'seethingBalance', reward: 'Seething Balance Appearance Effect', rwIcon: 'images/achv/seething-balance-icon.png' }),
      A('limbo', 'Subconscious', 'Something stirred in the abyss.', (s) => [s.limboMash ? 1 : 0, 1], 'images/fx/limbo-bundle.webp',
        { full: "Limbo's Subconscious", mesos: 1000, reward: '1,000 mesos' }),
      A('egg:lucid', 'Garden of Eternal Dream', 'Dream of a blooming garden, lasting for all of eternity', (s) => [s.lucidEgg ? 1 : 0, 1], 'images/bosses/lucid.png', { ap: 30 }),   // (Lucid's egg day in BGM Clip Extreme, played on the day: bgm.js saveTracks)
    ], true],
    // Memories: for having been there on a special day (only on the day itself). The whole section stays out of sight
    // until you have one, and only counts up (no "/ N").
    ['Memories', [
      A('mem:halloween2026', 'Haunted House', 'For those who have completed a game on Halloween: Haunted House', (s) => [s.halloween2026 ? 1 : 0, 1],
        'images/fx/halloween-bundle.webp', { ap: 30, memory: true, on: Date.UTC(2026, 9, 31) / DAY_MS }),
    ], true, true],
  ];
  const ALL = SECTIONS.flatMap(([, list]) => list);
  // Tiers, like MapleStory's achievements: each gives its achievement points (AP) when done. (Ranking up by AP: later.)
  const TIERS = { common: ['Common', 10], rare: ['Rare', 20], epic: ['Epic', 30], unique: ['Unique', 40], legendary: ['Legendary', 100] };
  const TIER_BY_AP = { 10: 'common', 20: 'rare', 30: 'epic', 40: 'unique', 100: 'legendary' };
  for (const a of ALL) a.tier = TIER_BY_AP[a.ap] || 'legendary';   // (the hidden ones: Legendary, 100)
  const apOf = (got) => ALL.reduce((t, a) => t + (got[a.id] != null ? TIERS[a.tier][1] : 0), 0);
  // Ranks by AP, with MapleStory's emblems (images/achv/rank). Master (1,000+ and the site's top 10) needs a site-wide
  // ranking, which isn't there yet.
  const RANKS = [['bronze', 'Bronze', 0], ['silver', 'Silver', 200], ['gold', 'Gold', 500], ['platinum', 'Platinum', 1000], ['diamond', 'Diamond', 2000]];
  const rankOf = (ap) => (ap >= MASTER[2] && isTop() ? MASTER : RANKS.filter((r) => ap >= r[2]).pop());
  // Master: 1,000+ AP and one of the site's top 10 by AP (the account server's GET /top, from each account's
  // mapleWordle:ap). Looked up only once you have 1,000+, kept 5 minutes. (Test site console: /master)
  const MASTER = ['master', 'Master', 1000], AP_KEY = 'mapleWordle:ap';
  let top = null, topAt = 0;
  const myUid = () => { try { return acct()?.uid; } catch { return null; } };
  const isTop = () => !!window.achvMaster || (top || []).some((t) => t.id === myUid());
  const topPlace = () => (top || []).findIndex((t) => t.id === myUid()) + 1;
  async function loadTop(ap) {
    if (ap < MASTER[2] || (top && Date.now() - topAt < 300000) || typeof ACCOUNT_URL !== 'string') return;
    try {
      const r = await fetch(ACCOUNT_URL + 'top', { signal: AbortSignal.timeout(4000) });
      if (r.ok) { top = (await r.json()).top || []; topAt = Date.now(); }
    } catch {}
  }
  // Global Completion Rate (hover a cup): how many of the site's accounts have each achievement, from the account
  // server's GET /rates (out of the accounts that have opened Achievements). Looked up when the window opens, kept 5 min.
  let rates = null, ratesAt = 0;
  async function loadRates() {
    if ((rates && Date.now() - ratesAt < 300000) || typeof ACCOUNT_URL !== 'string') return;
    try {
      const r = await fetch(ACCOUNT_URL + 'rates', { signal: AbortSignal.timeout(4000) });
      if (r.ok) { rates = await r.json(); ratesAt = Date.now(); }
    } catch {}
  }
  const rateText = (id) => {
    if (!rates?.total) return null;
    const pct = ((rates.have?.[id] || 0) / rates.total) * 100;
    return `Global Completion Rate: ${pct < 0.01 ? 'less than 0.01' : pct >= 100 ? 100 : pct.toFixed(2)}%`;   // (the game's wording for 0 too)
  };
  // The tip itself, like the game's: a small dark box by the pointer (a tap shows it on phones)
  let tip = null;
  const tipHide = () => { if (tip) tip.hidden = true; };
  const tipAt = (e, text, sc = 1) => {
    tip ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'achvtip', hidden: true }));
    // the text stretched sideways like the game draws it (--sx): the box is made as wide as the stretched text
    const span = Object.assign(document.createElement('span'), { textContent: text });
    tip.replaceChildren(span);
    tip.style.width = '';
    tip.hidden = false;
    const cs = getComputedStyle(tip), sx = parseFloat(cs.getPropertyValue('--sx')) || 1;
    tip.style.width = `${span.offsetWidth * sx + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)}px`;
    tip.style.transform = `scale(${sc})`;   // (as big as the window is drawn: see rateTip)
    const w = tip.offsetWidth * sc, h = tip.offsetHeight * sc;
    let x = e.clientX + 14 * sc, y = e.clientY + 20 * sc;
    if (x + w > innerWidth - 6) x = Math.max(6, e.clientX - w - 10 * sc);
    if (y + h > innerHeight - 6) y = Math.max(6, e.clientY - h - 12 * sc);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  addEventListener('scroll', tipHide, true);
  addEventListener('keydown', tipHide);
  addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.achvicon')) tipHide(); });
  function rateTip(el, id) {
    el.title = '';   // (no row tooltip over the cup)
    // The game's tip is 27.8% of a row's height (rows are 545 x 100): sized to the row as the window is drawn now (it's
    // scaled to fit the screen), the tip's own size being 28.25 px tall.
    const scale = () => (el.closest('.achv')?.getBoundingClientRect().width || 545) / 545 * 27.8 / 28.25;
    const show = (e) => { const t = rateText(id); if (t) tipAt(e, t, scale()); else tipHide(); };
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(e); });
    el.addEventListener('pointerleave', tipHide);
    el.addEventListener('click', show);
  }

  // Ranked up (more AP than the rank saved last time): GradeUp plays, after the achievement banners. Saved in _rank.
  function rankCheck(got, announce) {
    const ap = apOf(got);
    if (read(AP_KEY) !== String(ap)) try { localStorage.setItem(AP_KEY, String(ap)); } catch {}   // (for the top 10: goes to the account)
    const ALLR = [...RANKS, MASTER];
    const r = rankOf(ap), i = ALLR.indexOf(r), was = got._rank == null ? -1 : ALLR.findIndex((x) => x[0] === got._rank);
    if (i === was) return;
    got._rank = r[0];
    try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {}
    if (!announce || was < 0 || i < was) return;   // (the first look just notes your rank)
    // (a moment later, so every achievement unlocked in the same go is queued first: the rank up comes after them all)
    setTimeout(() => { const at = Math.max(Date.now() + 2500, bannerFree); bannerFree = at + 2600; setTimeout(() => {
      if (typeof resultSound === 'function') resultSound(true, 0, 'gradeUp');
      const t = Object.assign(document.createElement('div'), { className: 'achvtoast achvrankup' });
      t.innerHTML = `<img src="images/achv/rank/${r[0]}.png" alt=""><div><b>Rank up</b><span>${r[1]}</span></div>`;
      document.body.appendChild(t);
      setTimeout(() => t.classList.add('out'), 2200);
      setTimeout(() => t.remove(), 2700);
    }, at - Date.now()); }, 0);
  }

  // Newly unlocked ones get saved (with the day) and announced. Only signed in.
  async function check(announce = true) {
    if (!loggedIn()) return;
    const L = await loadLists();
    const first = read(ACHV_KEY) == null;   // first look ever: what was earned before unlocks quietly
    const s = stats(L), got = json(ACHV_KEY, {}), unlocked = [];
    for (const a of ALL) {
      const [have, need] = a.prog(s, L);
      if (have >= need && got[a.id] == null) { got[a.id] = a.on ?? today(); unlocked.push(a); }   // (a Memory: dated its day)
    }
    const changed = unlocked.length || s.streak > (got._bestWinStreak || 0);
    got._bestWinStreak = Math.max(s.streak, got._bestWinStreak || 0);
    if (changed || first) { try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {} }
    if (announce && !first) unlocked.forEach((a) => banner(a, 2500));
    await Promise.all([loadTop(apOf(got)), loadRates()]);
    rankCheck(got, announce && !first);
    noteClaims();
  }
  // Achievement complete: MapleStory's own banner (its back and front played together, the front over it), the name in
  // its bar and the points under the trophy, with its sound. Several: one after another (each waits for the last).
  // Every tier uses the Common banner until the others' are added (images/achv/fx/<tier>-back/-front).
  const BANNER_MS = 4200;
  // Each tier's banner files (images/achv/fx/<tier>-back, -front, num-<tier>/0-9.png) and where its front sits over the
  // back (x, y, w, h), the back's height and how far its art sits lower than Common's (all from the files themselves).
  // A tier without its own yet uses Common's.
  const BANNER_ART = { common: [336, 31, 693, 194, 231, 0], rare: [314, -11, 737, 244, 231, 0], epic: [314, 27, 737, 244, 269, 38],
    unique: [283, 76, 799, 271, 425, 113], legendary: [283, 76, 799, 271, 425, 113] };
  let bannerFree = 0;
  function banner(a, wait = 0) {
    const at = Math.max(Date.now() + wait, bannerFree);
    bannerFree = at + BANNER_MS;
    setTimeout(() => {
      const safari = typeof SAFARI !== 'undefined' && SAFARI, art = BANNER_ART[a.tier] ? a.tier : 'common', [fx, fy, fw, fh, bh, dy] = BANNER_ART[art];
      const el = Object.assign(document.createElement('div'), { className: `achvbanner t-${a.tier}` });
      const media = (part) => safari ? `<img class="${part}" src="images/achv/fx/${art}-${part}.webp" alt="" ${pos[part]}>`
        : `<video class="${part}" src="images/achv/fx/${art}-${part}.webm" muted autoplay playsinline disablepictureinpicture ${pos[part]}></video>`;
      const pos = { front: `style="left:${fx}px;top:${fy - dy}px;width:${fw}px;height:${fh}px"`, back: `style="top:${-dy}px;height:${bh}px"` };
      el.innerHTML = `<div class="achvbannerin">${media('back')}<b class="achvap" aria-hidden="true">${[...String(TIERS[a.tier][1])].map((n) => `<img src="images/achv/fx/num-${art}/${n}.png" alt="">`).join('')}</b><span class="achvname"></span>${media('front')}</div>`;
      el.querySelector('.achvname').textContent = a.full || a.name;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-label', `Achievement complete: ${a.full || a.name}`);
      const front = el.querySelector('.front');
      if (safari) setTimeout(() => front.remove(), 340); else front.addEventListener('ended', () => front.remove());
      // Like the game: the name bar about half the screen wide, a little above the middle (its middle at 44% down; in the
      // art it's at y 181). Phones: big enough to read, its sides cut off.
      const sc = Math.max(Math.min(1.5, innerWidth / 1240, innerHeight / 780), Math.min(0.75, (innerWidth - 8) / 640));   // (at most 1.5x: sharp)
      el.style.setProperty('--s', sc);
      el.style.top = `${Math.max(6, innerHeight * 0.44 - 181 * sc)}px`;
      document.body.appendChild(el);
      if (typeof resultSound === 'function') resultSound(true, 0, 'achvComplete');
      setTimeout(() => el.classList.add('out'), BANNER_MS - 500);
      setTimeout(() => el.remove(), BANNER_MS);
    }, at - Date.now());
  }
  // A game result saved (a game just ended) or mesos earned: look again.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (typeof k === 'string' && (k.startsWith('mapleWordle:result:') || k === 'mapleWordle:mesoLog' || k === 'mapleWordle:bgmTracksLive' || k === 'mapleWordle:limboMashLive' || k === 'mapleWordle:lucidEggLive')) { clearTimeout(check.t); check.t = setTimeout(check, 300); }
  };

  // NEW on the trophy button: a reward to claim that you haven't been shown yet. It's shown once (gone after a reload
  // even if you don't claim it; mapleWordle:achvSeen remembers), and goes when you claim it.
  const SEEN_KEY = 'mapleWordle:achvSeen', fresh = new Set();
  const claimable = (got) => ALL.filter((a) => a.reward && got[a.id] != null && got._claimed?.[a.id] == null).map((a) => a.id);
  function newTag() {
    btn.querySelector('.newtag')?.remove();
    const got = json(ACHV_KEY, {});
    if (loggedIn() && claimable(got).some((id) => fresh.has(id))) btn.appendChild(Object.assign(document.createElement('span'), { className: 'newtag', textContent: 'NEW' }));
  }
  function noteClaims() {
    if (!loggedIn()) return;
    const seen = json(SEEN_KEY, []), add = claimable(json(ACHV_KEY, {})).filter((id) => !seen.includes(id));
    if (add.length) {
      add.forEach((id) => fresh.add(id));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...add])); } catch {}
    }
    newTag();
  }
  // Claim a finished Hidden achievement's reward: its win effect (fx.js HECATE, in Customize > Win Effect, NEW until
  // reload) or its mesos.
  function claim(a, btn) {
    const got = json(ACHV_KEY, {});
    if (got[a.id] == null || got._claimed?.[a.id] != null) return;
    got._claimed = { ...got._claimed, [a.id]: today() };
    try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {}
    if (a.mesos && typeof mesoLog === 'function') {
      const log = mesoLog();
      if (!log.some((e) => e.key === `achv:${a.id}`)) {
        log.push({ key: `achv:${a.id}`, mode: 'achv', day: today(), what: a.full || a.name, amount: a.mesos });
        lsSet(MESO_LOG_KEY, JSON.stringify(log));
        const fly = typeof mesoFly === 'function' && mesoFly(12, btn);   // the mesos fly from the Claim button into the counter
        setTimeout(() => drawMeso(a.mesos), fly ? 900 : 0);
      }
    }
    if (typeof resultSound === 'function') resultSound(true, 0, 'purchase');   // (for now: the shop's purchase sound)
    btn?.replaceWith(Object.assign(document.createElement('img'), { className: 'achvclaimed', src: 'images/achv/ui/claim-disabled.png', alt: 'Claimed' }));   // the game's greyed "Claimed" button
    fresh.delete(a.id);
    newTag();
    if (a.appear) {   // an appearance effect: Settings > Account Settings > MapleStory Character
      if (typeof acctAvatarCall === 'function') acctAvatarCall();
      itemPopup({ name: a.full || a.name, img: 'images/achv/seething-balance.png?v=3' }, 'Successfully Claimed!', false, ['Settings', 'yes'], ['Close', 'plain'])
        .then((go) => { if (go) { document.getElementById('achv').hidden = true; document.getElementById('settingsBtn')?.click(); } });
    }
    if (a.fx && typeof drawThemeButton === 'function') {
      customFresh.add(a.fx); customTab = 'win'; drawThemeButton();
      // Like a shop purchase: its picture, and Customize takes you there
      itemPopup({ name: fxName(a), img: `images/fx/hecate/${a.fx}.webp?v=7` }, 'Successfully Claimed!', false, ['Customize', 'yes'], ['Close', 'plain'])
        .then((go) => { if (go) { document.getElementById('achv').hidden = true; document.getElementById('themeBtn')?.click(); } });
    }
  }
  async function open() {
    const body = popup('achv', 'Achievements');
    const win = document.getElementById('achv');
    if (!win.classList.contains('maplewin')) {   // like the game's achievement window: its title bar and an X (a click outside or Esc closes it too)
      win.classList.add('maplewin');
      const x = Object.assign(document.createElement('button'), { className: 'achvx', title: 'Close' });
      x.setAttribute('aria-label', 'Close');
      x.addEventListener('click', () => { win.hidden = true; });
      win.querySelector('h2').appendChild(x);
      // Big enough screens get the game's own window (images/achv/ui/window.png, 754 x 741), scaled to fill the screen
      const fit = () => win.style.setProperty('--ws', Math.min(1.5, (innerWidth - 16) / 754, (innerHeight - 16) / 741));   // as big as the screen allows (at most 1.5x, so the art stays sharp)
      fit(); addEventListener('resize', fit);
    }
    if (!loggedIn()) {
      body.innerHTML = '<p class="achvlocked">Achievements need an account.<br>Log in or create an account in settings.</p>';
      return;
    }
    body.innerHTML = '<p class="achvcount">Loading…</p>';
    await check(false);
    const L = await loadLists(), s = stats(L), got = json(ACHV_KEY, {});
    const done = ALL.filter((a) => got[a.id] != null).length, total = ALL.filter((a) => !a.memory || got[a.id] != null).length;   // (Memories count only once you have them)
    const tiles = [['Days played', s.days.size], ['Games played', s.played], ['Wins', s.wins],
      ['Win rate', s.played ? Math.round((s.wins / s.played) * 100) + '%' : '-'], ['First-guess wins', s.firstTry],
      ['Best win streak', s.streak], ['Mesos earned', fmt(s.mesos)], ['Achievements', `${done} / ${total}`]];
    await loadTop(apOf(got));
    const ap = apOf(got), rk = rankOf(ap), next = RANKS[RANKS.indexOf(rk) + 1];
    // Like the game's achievement window: your rank's emblem with your points under it
    body.innerHTML = '<div class="achvside"></div><div class="achvmain"></div>';
    const side = body.firstChild, main = body.lastChild;
    side.innerHTML = `<div class="achvrank" title="${rk[1]}${rk === MASTER ? (topPlace() ? ` · #${topPlace()} on Mapledle` : '') : next ? ` · ${fmt(next[2] - ap)} AP to ${next[1]}` : ap >= MASTER[2] ? ' · top 10 on Mapledle for Master' : ''}"><img class="r-${rk[0]}" src="images/achv/rank/${rk[0]}.png" alt="${rk[1]}"><b aria-label="${ap} AP">${digits(ap, 'score')}</b></div>` + '<div class="achvstats">' + tiles.map(([k, v]) => `<div><small>${k}</small><b>${typeof v === 'number' ? fmt(v) : v}</b></div>`).join('') + '</div>';
    // Rows like the game's achievement window (images/achv/ui, MapleStory's own form pieces): the tier's cup with its AP
    // (hidden ones keep their own picture), name, description, the gauge, the seal and date when done. Unlocked hidden
    // ones get the reward strip with the Claim Reward button.
    for (const [title, list, hidden, memories] of SECTIONS) {
      const n = list.filter((a) => got[a.id] != null).length;
      if (memories && !n) continue;   // Memories: not even its heading until you have one
      main.insertAdjacentHTML('beforeend', `<h3 class="achvhead">${title} <small>${memories ? n : `${n} / ${list.length}`}</small></h3>`);
      const box = main.appendChild(Object.assign(document.createElement('div'), { className: 'achvlist' }));
      for (const a of list) {
        if (a.memory && got[a.id] == null) continue;   // (only the ones you have)
        const [have, need] = a.prog(s, L), on = got[a.id] != null, hide = hidden && !on, rw = on && hidden && a.reward;
        const claimed = rw && got._claimed?.[a.id];
        const row = box.appendChild(Object.assign(document.createElement('div'), {
          className: 'achv' + (on ? ' on' : '') + (hidden ? ' secret' : '') + (a.memory ? ' memory' : '') + (hidden && on ? ' fill' : '') + (rw ? ' rw' : '') }));
        const cup = a.tier === 'common' ? 'normal' : a.tier;
        row.innerHTML = `<div class="achvicon">` + (hidden ? `<img src="${hide ? 'images/achv/4031348.png' : a.icon}" alt="">`
            : `<img class="cup c-${cup}" src="images/achv/ui/cup-${cup}.png" alt="${TIERS[a.tier][0]}"><i aria-label="${TIERS[a.tier][1]} AP">${digits(TIERS[a.tier][1], 'scoreSmall')}</i>`) + '</div>' +
          '<b class="achvtitle"></b><small class="achvhow"></small>' +
          `<div class="achvgauge"><i style="width:${on ? 100 : Math.min(1, have / need) * 100}%"></i></div>` +
          (need > 1 && !on ? `<small class="achvnum">${fmt(have)} / ${fmt(need)}</small>` : '') +
          (on ? `<img class="achvseal" src="images/achv/ui/completeSeal.png" alt=""><span class="achvdate"><span>${rowDate(got[a.id])}</span></span>` : '') +
          (rw ? `<div class="achvrwicon"><img${a.rwPic ? ' class="pic"' : ''} src="${a.mesos ? 'images/fx/meso-bag.png' : a.rwPic || a.rwIcon}" alt=""></div>` +
            '<small class="achvreward"></small>' + (claimed ? '<img class="achvclaimed" src="images/achv/ui/claim-disabled.png" alt="Claimed">' : '<button class="achvclaim" aria-label="Claim Reward"></button>') : '');
        row.title = hide ? '' : `${fmt(on ? need : Math.min(have, need))} / ${fmt(need)}`;   // its progress (a completed one's too: its number is under the seal)
        row.dataset.q = `${on ? a.full || a.name : a.name} ${hide ? '' : a.how}`.toLowerCase();
        row.querySelector('.achvtitle').textContent = on ? a.full || a.name : a.name;
        // (a capital O a little wider, like the game's: each one in its own span, the text as text)
        row.querySelector('.achvhow').replaceChildren(...(hide ? '???' : a.how).split(/(O)/).filter(Boolean)
          .map((t) => t === 'O' ? Object.assign(document.createElement('span'), { className: 'bigO', textContent: 'O' }) : document.createTextNode(t)));
        if (hide) row.querySelector('.achvhow').classList.add('achvq');
        if (rw) {   // the reward itself coloured: a win effect by its full name in purple, mesos in meso gold
          row.querySelector('.achvreward').appendChild(Object.assign(document.createElement('span'), a.mesos ? { className: 'rwmeso', textContent: `${fmt(a.mesos)} mesos` }
            : a.fx ? { className: 'rwfx', textContent: `${fxName(a)} Win Effect` }
            : a.appear ? { className: 'rwfx', textContent: `${a.full || a.name} Appearance Effect` } : { textContent: a.reward }));
        }
        rateTip(row.querySelector('.achvicon'), a.id);
        const cb = row.querySelector('.achvclaim');
        if (cb) { cb.addEventListener('click', () => claim(a, cb)); if (typeof hoverSound === 'function') hoverSound(cb); }
      }
    }
    // The window's search box (the game's, bottom left): shows only the achievements whose name or description match
    const find = side.appendChild(Object.assign(document.createElement('div'), { className: 'achvfind' }));
    const q = find.appendChild(Object.assign(document.createElement('input'), { className: 'achvsearch', type: 'search', placeholder: 'Search', spellcheck: false, maxLength: 20 }));
    const go = find.appendChild(Object.assign(document.createElement('button'), { className: 'achvgo', title: 'Search' }));   // the game's search button
    q.setAttribute('aria-label', 'Search achievements');
    go.setAttribute('aria-label', 'Search');
    go.addEventListener('click', () => { q.dispatchEvent(new Event('input')); main.scrollTop = 0; });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    q.addEventListener('input', () => {
      const t = q.value.trim().toLowerCase();
      for (const list of main.querySelectorAll('.achvlist')) {
        let any = false;
        for (const r of list.children) { const hit = !t || r.dataset.q.includes(t); r.hidden = !hit; any ||= hit; }
        list.hidden = list.previousElementSibling.hidden = !any;
      }
      let none = main.querySelector('.achvnone');
      if (!main.querySelector('.achvlist:not([hidden])')) { if (!none) main.insertAdjacentHTML('beforeend', '<p class="achvnone">No results found.</p>'); }
      else none?.remove();
    });
  }

  const btn = Object.assign(document.createElement('button'), { id: 'achvBtn', className: 'panel', title: 'Achievements', innerHTML: '<img src="images/achv/menu-icon.png" alt="">' });
  btn.setAttribute('aria-label', 'Achievements');
  btn.addEventListener('click', open);
  document.body.appendChild(btn);
  // (the test site's console: /unlock achievement)
  window.achvDev = (pick) => {
    const got = json(ACHV_KEY, {}), locked = ALL.filter((a) => got[a.id] == null);
    if (pick === '*') {   // every one at once (one note, not dozens)
      for (const a of locked) got[a.id] = today();
      try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {}
      banner({ name: `All ${ALL.length} achievements`, tier: 'legendary' });
      rankCheck(got, true);
      noteClaims();
      return locked.length;
    }
    const a = pick ? ALL.find((x) => (x.full || x.name).toLowerCase().includes(pick)) : locked[0] ?? ALL[Math.floor(Math.random() * ALL.length)];
    if (!a) return null;
    if (got[a.id] == null) { got[a.id] = today(); try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {} }
    banner(a);
    rankCheck(got, true);
    noteClaims();
    return a.full || a.name;
  };
  check();
})();

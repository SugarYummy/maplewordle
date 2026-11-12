// Boss Raid rules (BGM PvP's co-op mode). Nothing in here touches the page: pvp.js draws it, and tools/raid-sim.js
// plays thousands of fights with it to balance the numbers.
//
// A round: the boss shows its move; the music plays; everyone answers and picks skills, then ends their turn.
//   Power   = how well you answered (0 = wrong; right = 50% + up to 50% more for speed). Every attack is x your Power.
//   Skills  = your class's (raid-classes.js: three skills + its Origin) + three everyone has. A skill used in round r
//             is back in round r + cd: cd = the skill's cooldown in the game / 30 s (2 minutes = 4 rounds).
//   Binds   = Erda Nova, every Origin and a few class skills. A bound boss can't move and has NO DEFENSE: the round to
//             burst. After a bind it can be bound again 3 rounds later (the game: 120 s cooldown, 100 s resistance).
//             Two binds in the same round keep it bound for 2 rounds.
//   Order   = buffs and stances, then guards / heals / binds, then everyone attacks (your main attack is free, every
//             round you're right), summons and burns, then the boss does its move, then cooldowns tick.
(function (root) {
'use strict';
const R = { CLASSES: {}, ORDER: [] };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/['’.!?]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pct = (x) => Math.round(x * 100) + '%';
R.slug = slug; R.fmt = fmt;

R.RULES = {
  cdSeconds: 30,                                   // one round of cooldown = 30 s in the game
  power: (sec) => 0.5 + 0.5 * 0.6 ** (Math.max(0, sec) / 10),   // a right answer: 100% at 0 s, 80% at 10 s, 68% at 20 s
  bossHp: 150000,                                  // per player, Normal
  attack: (round, grow = 1.13) => 150 * grow ** (round - 1),   // the boss's normal attack (everyone), before its difficulty: it grows every round, so a fight can't be dragged out
  focus: 2.4,                                      // Focus: one player, x this
  test: 1.6,                                       // Test: everyone who answered wrong, x this
  tired: 0.5,                                      // the round after its ultimate: a weak attack...
  groggy: 1.5,                                     // ...and it takes x this damage
  bossHeal: 0.07, shield: 0.5,
  enrageAt: 0.3, enrage: 1.3,                      // under 30% HP its attacks hit x1.3
  pots: 3, potHeal: 0.5,
  rebind: 3,                                       // a boss bound in round r can be bound again in round r + 3 (the bind cooldown - 1)
  boundDef: 0,                                     // a bound boss's defense x this (0 = none: burst now)
  originCd: 18,                                    // every class's Origin skill
  partyHp: 0.06, partyAtk: 0.05,                   // a bigger party: the boss has this much more HP (per player) and attack, per extra player
};
R.DIFFS = {   // hp, atk: checked with tools/raid-sim.js diff. grow: its attack grows this much a round. ultGap: rounds between ultimates, at least. cap: the last round (the time limit)
  easy:    { name: 'Easy',    hp: 0.8, atk: 1.0, def: 0.15, grow: 1.1,  ultGap: 5, cap: 20 },
  normal:  { name: 'Normal',  hp: 1.1, atk: 1.5, def: 0.25, grow: 1.13, ultGap: 4, cap: 20 },
  hard:    { name: 'Hard',    hp: 1.45, atk: 2.0, def: 0.35, grow: 1.16, ultGap: 4, cap: 18 },
  extreme: { name: 'Extreme', hp: 1.8, atk: 2.6, def: 0.45, grow: 1.19, ultGap: 3, cap: 16 },
};

// ---------- Skills everyone has ----------
const COMMON = [
  { key: 'rise', name: 'Aeonian Rise', cd: 4, ph: 1, ai: 'iframe', common: true,
    desc: () => 'Genesis weapon: you take no damage this round, even from an ultimate',
    use: (c) => { c.iframe(c.pid); return 'is untouchable this round'; } },
  { key: 'nova', name: 'Erda Nova', cd: 4, ph: 1, ai: 'bind', common: true,
    desc: () => `Bind the boss: it can't move this round (its ultimate still lands) and has no defense: burst now. It can be bound again ${R.RULES.rebind} rounds later. Two binds in one round = bound for 2 rounds`,
    use: (c) => c.bind() },
  { key: 'pot', name: 'Power Elixir', cd: 0, ph: 1, ai: 'pot', common: true, icon: 'power-elixir',
    desc: () => `Heal ${pct(R.RULES.potHeal)} of your HP. ${R.RULES.pots} per fight`,
    ok: (me) => me.pots > 0,
    use: (c) => { c.me.pots--; return `drinks it: +${fmt(c.heal(c.pid, R.RULES.potHeal))} HP (${c.me.pots} left)`; } },
];
R.COMMON = COMMON;

// ---------- Classes ----------
// add(key, { name, hp, atk, basic, role, trait: [name, text], gauge: { name, max }, stances: {key: name}, skills: [...],
//            init(p), start(c), power(c, pw), mult(c, o), basicHit(c), after(c), hitBy(c, amount, o), lethal(c), end(c) })
R.add = (key, C) => {
  C.key = key;
  C.skills = (C.skills || []).map((s) => ({ key: slug(s.name), ph: 2, ...s, noReset: s.noReset ?? s.cd >= 10 }));
  if (C.origin) {   // every class's Origin: a huge hit (or summon) that also binds, and you can't be touched while you cast it
    const o = C.origin, mult = () => (o.mult ?? 8) * (C.originK ?? 1);
    C.skills.push({ key: slug(o.name), name: o.name, short: o.short, cd: R.RULES.originCd, ph: 1, ai: 'origin', origin: true, noReset: true, team: true,
      desc: (K) => `Origin: ${o.summon ? `a summon for ${o.summon} rounds, ${dn(K, mult() / o.summon)} damage a round` : `${dn(K, mult())} damage`}. It binds the boss (no defense: burst now) and you can't be touched this round${o.note ? '. ' + o.note : ''}`,
      use: (c) => { c.iframe(c.pid); const said = c.bind(); if (o.summon) c.summon(o.name, mult() / o.summon, o.summon); else c.hit(mult(), { n: o.name }); o.then?.(c); return said; } });
  }
  C.byKey = Object.fromEntries([...C.skills, ...COMMON].map((s) => [s.key, s]));
  R.CLASSES[key] = C;
  R.ORDER.push(key);
};
R.cls = (key) => R.CLASSES[key] || R.CLASSES[R.ORDER[0]];
R.skill = (cls, key) => { const s = R.cls(cls).byKey[key]; return s && Object.hasOwn(R.cls(cls).byKey, key) ? s : null; };
R.iconOf = (s) => s.icon || slug(s.name);
// What a skill does, in words (its numbers come from the class's attack, so they follow the balance)
R.desc = (cls, s) => { const C = R.cls(cls); return typeof s.desc === 'function' ? s.desc(C) : s.desc || ''; };
R.kit = (cls) => { const C = R.cls(cls); return { C, skills: [...C.skills, ...COMMON] }; };
const dn = (C, mult) => fmt(Math.round(C.atk * mult / 100) * 100);
const buffWords = (b) => [b.dmg ? `${b.dmg >= 1 ? '+' : '-'}${pct(Math.abs(b.dmg - 1))} damage` : '', b.taken != null ? (b.taken < 1 ? `${pct(1 - b.taken)} less damage taken` : `+${pct(b.taken - 1)} damage taken`) : '',
  b.ied ? `ignore ${pct(b.ied)} of its defense` : '', b.regen ? `heal ${pct(b.regen)} HP a round` : '', b.floor ? `Power at least ${pct(b.floor)} when right` : ''].filter(Boolean).join(', ');
const rounds = (n) => n === 1 ? 'this round' : `${n} rounds`;
// Ready-made skills for raid-classes.js
R.h = {
  dn, pct, fmt, buffWords, rounds,
  // An attack: mult x your main attack
  atk: (name, cd, mult, o = {}) => ({ name, cd, ph: 2, ai: 'burst', mult, ...o,
    desc: (C) => `${dn(C, mult)} damage${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.hit(mult, { n: name, ...(o.hit || {}) }); return o.then?.(c); } }),
  // A summon: hits every round for n rounds, whatever you answer
  summon: (name, cd, mult, n, o = {}) => ({ name, cd, ph: 2, ai: 'always', ...o,
    desc: (C) => `Summon, ${n} rounds: ${dn(C, mult)} damage a round, even when your answer is wrong${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.summon(name, mult, n); return o.then?.(c) || `calls <b>${name}</b> for ${n + (c.C.summonPlus || 0)} rounds`; } }),
  // A buff on yourself / the whole party / one player you pick
  self: (name, cd, n, b, o = {}) => ({ name, cd, ph: 0, ai: 'buff', ...o,
    desc: () => `You, ${rounds(n)}: ${buffWords(b)}${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.buff(c.pid, { k: slug(name), n, name, ...b }); return o.then?.(c) || `${buffWords(b)} for ${rounds(n)}`; } }),
  party: (name, cd, n, b, o = {}) => ({ name, cd, ph: 0, ai: 'buff', team: true, ...o,
    desc: () => `Whole party, ${rounds(n)}: ${buffWords(b)}${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.party({ k: slug(name), n, name, ...b }); return o.then?.(c) || `the party gets ${buffWords(b)} for ${rounds(n)}`; } }),
  ally: (name, cd, n, b, o = {}) => ({ name, cd, ph: 0, ai: 'buff', target: true, ...o,
    desc: () => `One player, ${rounds(n)}: ${buffWords(b)}${o.note ? '. ' + o.note : ''}`,
    use: (c, t) => { const to = c.ally(t); c.buff(to, { k: slug(name), n, name, ...b }); return `{p:${to}} gets ${buffWords(b)} for ${rounds(n)}`; } }),
  // The boss takes more damage from everyone
  expose: (name, cd, n, m, mult = 0, o = {}) => ({ name, cd, ph: mult ? 2 : 1, ai: 'debuff', team: true, ...o,
    desc: (C) => `${mult ? dn(C, mult) + ' damage. ' : ''}The boss takes +${pct(m - 1)} damage from everyone for ${rounds(n)}${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.vuln(slug(name), m, n, name); if (mult) c.hit(mult, { n: name }); return o.then?.(c) || `the boss takes +${pct(m - 1)} damage for ${rounds(n)}`; } }),
};

// ---------- A fight's state (plain data: it's sent to every player) ----------
R.newPlayer = (cls, lives) => {
  const C = R.cls(cls);
  const p = { cls: C.key, hp: C.hp, maxHp: C.hp, lives, out: false, cd: {}, buffs: [], sum: [], g: 0, st: C.stances ? Object.keys(C.stances)[0] : null, pots: R.RULES.pots, v: {}, last: null };
  C.init?.(p);
  return p;
};
R.newBoss = (name, image, players, diff, hpEach) => {
  const D = R.DIFFS[diff] || R.DIFFS.normal, X = R.RULES, more = Math.min(7, players - 1);
  const hp = Math.round((hpEach || X.bossHp * D.hp) * players * (1 + X.partyHp * more) / 100) * 100;
  return { name, image, diff: R.DIFFS[diff] ? diff : 'normal', hp, max: hp, def: D.def, atk: +(D.atk * (1 + X.partyAtk * more)).toFixed(3), move: null, last: null, lastUlt: 0, boundTil: 0, bindFree: 0, vuln: [], dots: [], weak: [], enraged: false };
};
const aliveIds = (S) => Object.keys(S.players).filter((id) => !S.players[id].out);
R.aliveIds = aliveIds;

// The move the boss shows at the start of a round (and does at its end)
R.pickMove = (S, rand = Math.random) => {
  const b = S.boss, r = S.round, X = R.RULES, D = R.DIFFS[b.diff];
  const base = Math.round(X.attack(r, D.grow) * b.atk * (b.enraged ? X.enrage : 1)), alive = aliveIds(S);
  let mv;
  if (r <= b.boundTil) { b.move = { k: 'bound' }; return b.move; }   // (still bound: its plans wait)
  if (b.last === 'charge') { mv = { k: 'ult' }; b.lastUlt = r; }
  else if (b.last === 'ult') mv = { k: 'tired', dmg: Math.round(base * X.tired) };
  else if (r <= 2) mv = { k: 'attack', dmg: base };
  else {
    const w = { attack: 4, focus: alive.length ? 2 : 0, test: 2, charge: r - b.lastUlt >= D.ultGap ? 1.8 : 0, shield: b.last !== 'shield' ? 1 : 0, heal: b.last !== 'heal' && b.hp < b.max * 0.7 ? 0.9 : 0 };
    let x = rand() * Object.values(w).reduce((a, v) => a + v, 0), k = 'attack';
    for (const [key, v] of Object.entries(w)) { if ((x -= v) < 0) { k = key; break; } }
    if (k === 'attack') mv = { k, dmg: base };
    else if (k === 'focus') {
      const taunt = alive.filter((id) => S.players[id].buffs.some((f) => f.taunt));
      mv = { k, dmg: Math.round(base * X.focus), pid: (taunt.length ? taunt : alive)[Math.floor(rand() * (taunt.length || alive.length))] };
    }
    else if (k === 'test') mv = { k, dmg: Math.round(base * X.test) };
    else if (k === 'heal') mv = { k, amount: Math.round(b.max * X.bossHeal) };
    else mv = { k };
  }
  b.move = mv; b.last = mv.k;
  return mv;
};
// What the boss is about to do, in words. {p:id} = a player's name (the page fills it in).
R.moveText = (mv, boss) => {
  if (!mv) return '';
  switch (mv.k) {
    case 'attack': return `⚔️ ${boss} attacks everyone: ${fmt(mv.dmg)} damage`;
    case 'focus': return `🎯 ${boss} targets {p:${mv.pid}}: ${fmt(mv.dmg)} damage`;
    case 'test': return `🧠 ${boss} tests the party: a wrong answer costs ${fmt(mv.dmg)} HP`;
    case 'charge': return `🌀 ${boss} is charging its ultimate. It hits next round!`;
    case 'ult': return `☄️ ${boss}'s ultimate: everyone who isn't untouchable goes down!`;
    case 'tired': return `😮‍💨 ${boss} is worn out: it takes +${pct(R.RULES.groggy - 1)} damage and only hits for ${fmt(mv.dmg)}`;
    case 'bound': return `⛓️ ${boss} is still bound: it can't move and has no defense. Burst!`;
    case 'shield': return `🔰 ${boss} shields itself: half damage this round`;
    case 'heal': return `💗 ${boss} will heal ${fmt(mv.amount)} HP`;
  }
  return '';
};

R.canCast = (S, pid, key) => {
  const me = S.players[pid], sk = me && R.skill(me.cls, key);
  return !!sk && !me.out && !(me.cd[key] > 0) && (!sk.ok || !!sk.ok(me, S));
};
// Damage a player's attacks get from their buffs (for the page: "x1.4")
R.dmgMult = (me) => me.buffs.reduce((m, f) => m * (f.dmg || 1), 1);

// ---------- One round ----------
// inputs[pid] = { power: 0..1, sec: seconds of the main answer (or null), casts: { skillKey: true | target id | option } }
// Returns the events, in order: { s: 'skills' | 'boss' | 'end', t: text with {p:id} names, pid?, amount?, k? }
R.resolve = (S, inputs, rand = Math.random) => {
  const X = R.RULES, b = S.boss, mv = b.move || { k: 'attack', dmg: 0 }, ev = [], ids = aliveIds(S);
  const rc = { iframe: new Set(), block: new Set(), bound: mv.k === 'bound', binds: 0, dispel: false, casts: [] };
  const P = (id) => S.players[id];
  const say = (s, t, more) => ev.push({ s, t, ...more });
  S.stats ??= {};
  const stat = (id) => (S.stats[id] ??= { dmg: 0, heal: 0, taken: 0, right: 0 });
  const ctxs = {};
  for (const pid of ids) {
    const me = P(pid), C = R.cls(me.cls), inp = inputs[pid] || {};
    const c = ctxs[pid] = {
      S, rc, pid, me, C, b, mv, rand, ids, sec: inp.sec ?? null, power: clamp(+inp.power || 0, 0, 1), parts: [], dealt: 0, notes: [],
      alive: () => ids.filter((id) => !P(id).out),
      ally: (t) => (P(t) && !P(t).out ? t : pid),
      hit(mult, o = {}) {
        const pw = o.free != null ? o.free : c.power;
        if (pw <= 0 || mult <= 0) return 0;
        let m = R.dmgMult(me) * (C.mult ? C.mult(c, o) : 1), ied = o.ied || 0, taken = 1;
        for (const f of me.buffs) if (f.ied) ied = 1 - (1 - ied) * (1 - f.ied);
        for (const v of b.vuln) taken *= v.m;
        if (mv.k === 'tired') taken *= X.groggy;
        const shield = mv.k === 'shield' && !rc.dispel && !o.pierce ? X.shield : 1;
        const def = b.def * (rc.bound ? X.boundDef : 1);
        const dmg = Math.max(1, Math.round(C.atk * mult * pw * m * taken * shield * (1 - def * (1 - ied)) * (0.96 + rand() * 0.08)));
        b.hp = Math.max(0, b.hp - dmg);
        c.dealt += dmg; stat(pid).dmg += dmg;
        const same = c.parts.find((x) => x.n === (o.n || C.basic));
        if (same) same.d += dmg; else c.parts.push({ n: o.n || C.basic, d: dmg });
        return dmg;
      },
      buff(to, f) { const p = P(to); if (!p || p.out) return; p.buffs = p.buffs.filter((x) => x.k !== f.k); p.buffs.push({ ...f, by: pid }); },
      party(f) { for (const id of c.alive()) c.buff(id, f); },
      hasBuff: (k, id = pid) => P(id)?.buffs.some((x) => x.k === k),
      heal(to, frac) { const p = P(to); if (!p || p.out) return 0; const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * frac)); stat(pid).heal += p.hp - before; return p.hp - before; },
      healAll(frac) { let n = 0; for (const id of c.alive()) n += c.heal(id, frac); return n; },
      pay(frac) { const cost = Math.min(me.hp - 1, Math.round(me.maxHp * frac)); me.hp -= Math.max(0, cost); return Math.max(0, cost); },
      iframe(to) { rc.iframe.add(to); },
      block(to) { rc.block.add(to); },   // no damage from anything but an ultimate
      bind() {
        if (rc.binds > 0) {   // a second bind in the same round: bound next round too (never more than 2)
          if (b.boundTil > S.round) return `binds ${b.name} again, but it can't be held any longer`;
          b.boundTil = S.round + 1;
          return `holds the bind: ${b.name} stays bound next round too`;
        }
        if (mv.k === 'bound') return `tries to bind ${b.name}, but it is bound already`;
        if (S.round < b.bindFree) { const n = b.bindFree - S.round; return `tries to bind ${b.name}, but it resists (${n} more round${n === 1 ? '' : 's'})`; }
        rc.bound = true; rc.binds++; b.boundTil = S.round; b.bindFree = S.round + X.rebind;
        if (mv.k === 'charge') b.last = 'bound';   // (its charge is broken: no ultimate next round)
        return mv.k === 'ult' ? `binds ${b.name}: no defense this round, but its ultimate can't be stopped` : `binds ${b.name}: it can't move and has no defense. Burst!`;
      },
      dispel() { rc.dispel = true; },   // the boss's shield / heal doesn't happen this round
      vuln(k, m, n, name) { b.vuln = b.vuln.filter((x) => x.k !== k); b.vuln.push({ k, m, n, name }); },
      weaken(k, m, n, name) { b.weak = b.weak.filter((x) => x.k !== k); b.weak.push({ k, m, n, name }); },
      dot(k, mult, n, name, max = 1) {   // a burn on the boss: hits each round whatever you answer; up to max stacks
        const mine = b.dots.filter((x) => x.k === k && x.by === pid);
        if (mine.length >= max) { mine.sort((x, y) => x.n - y.n)[0].n = n; return; }
        b.dots.push({ k, by: pid, mult, n, name });
      },
      summon(name, mult, n) { me.sum = me.sum.filter((x) => x.name !== name); me.sum.push({ name, mult, n: n + (C.summonPlus || 0) }); },
      cdr(to, amount, except) { const p = P(to); if (!p) return; for (const k of Object.keys(p.cd)) if (k !== except && !R.skill(p.cls, k)?.noReset && p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - amount); },
      note(t) { c.notes.push(t); },
      tell(s, t, more) { say(s, `{p:${pid}} ${t}`, { pid, ...more }); },
    };
    if (c.power > 0) stat(pid).right++;
    if (C.power) c.power = clamp(C.power(c, c.power), 0, 1.5);
    C.start?.(c);
  }
  // 1. Skills: buffs and stances (0), then guards / heals / binds (1); attacks (2) go with each player's turn below
  for (const pid of ids) {
    const want = inputs[pid]?.casts || {};
    for (const key of Object.keys(want)) {
      if (!R.canCast(S, pid, key)) continue;
      rc.casts.push({ c: ctxs[pid], sk: R.skill(P(pid).cls, key), arg: want[key] });
    }
  }
  const run = (x) => {
    const { c, sk, arg } = x;
    if (c.me.out || (sk.ok && !sk.ok(c.me, S))) return;   // (two skills queued on the same gauge: the second can't be paid for)
    c.noCd = false;
    const said = sk.use(c, arg);
    if (sk.cd > 0 && !c.noCd) c.me.cd[sk.key] = sk.cd;
    c.me.last = sk.key;
    if (!sk.common) c.me.lastSkill = sk.key;
    c.C.cast?.(c, sk);
    if (said) say('skills', `{p:${c.pid}} ${sk.ph === 2 ? '' : `uses <b>${sk.name}</b>: `}${said}`, { pid: c.pid, ic: R.iconOf(sk) });
  };
  for (const ph of [0, 1]) for (const x of rc.casts) if ((x.sk.ph ?? 2) === ph) run(x);
  if (mv.k === 'shield') say('skills', rc.dispel ? `🔰 ${b.name}'s shield is torn away` : R.moveText(mv, b.name), { k: 'bossMove' });
  // 2. Attacks, one player at a time: main attack, attack skills, summons
  for (const pid of ids) {
    const c = ctxs[pid], me = c.me, C = c.C;
    if (c.power > 0) { if (C.basicHit) C.basicHit(c); else c.hit(1, { n: C.basic, basic: true }); }
    for (const x of rc.casts) if (x.c === c && (x.sk.ph ?? 2) === 2) run(x);
    for (const s of me.sum) c.hit(s.mult, { n: s.name, free: 1, sum: true });
    C.after?.(c);
    const total = c.parts.reduce((a, x) => a + x.d, 0);
    if (total) say('skills', `{p:${pid}} ${c.parts.map((x) => `${x.n} <b>${fmt(x.d)}</b>`).join(' · ')}${c.parts.length > 1 ? ` = <b>${fmt(total)}</b>` : ''}${c.power > 0 ? '' : ' <small>(wrong answer: only summons)</small>'}`, { pid, k: 'atk', amount: total });
    else say('skills', `{p:${pid}} ${c.power > 0 ? 'deals no damage' : 'answered wrong: no attack'}`, { pid, k: 'miss' });
    for (const t of c.notes) say('skills', `{p:${pid}} ${t}`, { pid });
    c.notes.length = 0;
  }
  // Burns on the boss
  const burns = {};
  for (const d of b.dots) {
    const c = ctxs[d.by];
    if (!c || P(d.by).out) continue;
    const before = b.hp; c.hit(d.mult, { n: d.name, free: 1 }); c.parts.length = 0;
    (burns[d.by] ??= {})[d.name] = (burns[d.by][d.name] || 0) + before - b.hp;
  }
  for (const [pid, by] of Object.entries(burns)) say('skills', `{p:${pid}}'s ${Object.entries(by).map(([n, d]) => `${n} burns for <b>${fmt(d)}</b>`).join(' · ')}`, { pid });
  // 3. The boss's move
  const down = (pid) => {
    const p = P(pid), c = ctxs[pid];
    const door = p.buffs.find((f) => f.door);
    if (door) { p.buffs = p.buffs.filter((f) => f !== door); p.hp = Math.round(p.maxHp * 0.5); return say('boss', `🚪 ${door.name} saves {p:${pid}}: back up at half HP`, { pid }); }
    const und = p.buffs.find((f) => f.undying);
    if (und) { p.hp = 1; return say('boss', `🩸 {p:${pid}} can't fall (${und.name}): 1 HP left`, { pid }); }
    const saved = c.C.lethal?.(c);
    if (saved) return say('boss', `{p:${pid}} ${saved}`, { pid });
    p.lives--;
    if (p.lives > 0) { p.hp = p.maxHp; say('boss', `💔 {p:${pid}} goes down and loses a life (back at full HP)`, { pid, k: 'life' }); }
    else { p.hp = 0; p.out = true; p.buffs = []; p.sum = []; say('boss', `☠️ {p:${pid}} is out`, { pid, k: 'out' }); }
  };
  const hurt = (pid, amount, o = {}) => {
    const p = P(pid), c = ctxs[pid];
    if (!p || p.out) return;
    if (rc.iframe.has(pid) || p.buffs.some((f) => f.iframe)) return say('boss', `🛡️ {p:${pid}} is untouchable: no damage`, { pid, k: 'dodge' });
    if (!o.ult && rc.block.has(pid)) return say('boss', `🌫️ {p:${pid}} is covered: no damage`, { pid, k: 'dodge' });
    if (!o.ult) {
      const r = c.C.hitBy?.(c, amount, o);
      if (r === true) return;   // the class dealt with it (and said so)
      if (typeof r === 'number') amount = r;
      for (const f of p.buffs) if (f.taken != null) amount *= f.taken;
      for (const w of b.weak) amount *= w.m;
      if (c.C.taken) amount *= c.C.taken(c);
      amount = Math.max(1, Math.round(amount));
    }
    const lost = Math.min(amount, p.hp);
    p.hp -= amount; stat(pid).taken += lost;
    say('boss', o.ult ? `☄️ {p:${pid}} is caught by the ultimate` : `💢 {p:${pid}} takes ${fmt(amount)} damage`, { pid, k: 'bossHit', amount: lost });
    if (p.hp <= 0) down(pid);
  };
  if (b.hp > 0) {
    if (rc.bound && mv.k !== 'ult') say('boss', `⛓️ ${b.name} is bound and can't move${mv.k === 'charge' ? ': its charge is broken' : ''}`, { k: 'bossMove' });
    else {
      if (mv.k !== 'shield') say('boss', mv.k === 'heal' && rc.dispel ? `💗 ${b.name}'s healing is cut off` : R.moveText(mv, b.name), { k: 'bossMove' });
      const now = ids.filter((id) => !P(id).out);
      if (mv.k === 'attack' || mv.k === 'tired') for (const id of now) hurt(id, mv.dmg);
      else if (mv.k === 'ult') for (const id of now) hurt(id, 99999, { ult: true });
      else if (mv.k === 'focus') {
        const t = P(mv.pid) && !P(mv.pid).out ? mv.pid : now[Math.floor(rand() * now.length)];
        const tank = now.find((id) => id !== t && R.cls(P(id).cls).cover);   // (a Paladin takes it instead, at half damage)
        if (tank) { say('boss', `🛡️ {p:${tank}} steps in front of {p:${t}}`, { pid: tank }); hurt(tank, Math.round(mv.dmg * 0.5), { focus: true }); }
        else if (t) hurt(t, mv.dmg, { focus: true });
      }
      else if (mv.k === 'test') { const wrong = now.filter((id) => !(ctxs[id].power > 0)); if (!wrong.length) say('boss', '✅ Everyone answered right: nobody is hurt'); for (const id of wrong) hurt(id, mv.dmg, { test: true }); }
      else if (mv.k === 'heal' && !rc.dispel) { const before = b.hp; b.hp = Math.min(b.max, b.hp + mv.amount); say('boss', `💗 ${b.name} heals ${fmt(b.hp - before)} HP`, { k: 'bossHeal' }); }
    }
  }
  // 4. The end of the round: regeneration, then cooldowns and buffs tick down
  for (const pid of ids) {
    const c = ctxs[pid], me = c.me;
    if (me.out) continue;
    let regen = 0;
    for (const f of me.buffs) if (f.regen) regen += f.regen;
    if (regen > 0 && me.hp < me.maxHp) { const h = c.heal(pid, regen); if (h) say('end', `💚 {p:${pid}} recovers ${fmt(h)} HP`, { pid }); }
    c.C.end?.(c);
    for (const t of c.notes) say('end', `{p:${pid}} ${t}`, { pid });
    c.notes.length = 0;
    me.buffs = me.buffs.filter((f) => --f.n > 0);
    me.sum = me.sum.filter((s) => --s.n > 0);
    for (const k of Object.keys(me.cd)) if (me.cd[k] > 0) me.cd[k]--;
  }
  b.vuln = b.vuln.filter((v) => --v.n > 0);
  b.weak = b.weak.filter((v) => --v.n > 0);
  b.dots = b.dots.filter((d) => --d.n > 0 && !P(d.by)?.out);
  if (b.hp > 0 && !b.enraged && b.hp <= b.max * X.enrageAt) { b.enraged = true; say('end', `😡 ${b.name} is enraged: its attacks hit ${pct(X.enrage - 1)} harder`, { k: 'enrage' }); }
  return ev;
};

// ---------- Bots ----------
// know: does the bot think its answer is right? (it's usually right about that). It i-frames ultimates, guards and
// heals when it has to, binds heals, saves bursts for rounds it's sure of and that aren't shielded.
R.botCasts = (S, pid, know, rand = Math.random) => {
  const me = S.players[pid], C = R.cls(me.cls), b = S.boss, mv = b.move || {}, out = {};
  if (!me || me.out) return out;
  const can = (k) => R.canCast(S, pid, k);
  const ids = aliveIds(S), X = R.RULES;
  const incoming = mv.k === 'attack' || mv.k === 'tired' ? mv.dmg : mv.k === 'focus' && mv.pid === pid ? mv.dmg : mv.k === 'test' && !know ? mv.dmg : 0;
  const bindable = mv.k !== 'bound' && S.round >= b.bindFree;
  const lethal = incoming >= me.hp;
  let safe = false;
  const use = (s, arg = true) => { if (!out[s.key] && can(s.key)) { out[s.key] = arg; return true; } return false; };
  const all = [...C.skills, ...COMMON];
  const by = (ai) => all.filter((s) => s.ai === ai && can(s.key));
  // Staying alive
  if (mv.k === 'ult') { for (const s of [...by('partyiframe'), ...by('iframe')]) { if (use(s)) { safe = true; break; } } }
  else if (lethal) {
    for (const s of [...by('iframe'), ...by('partyiframe'), ...by('guard')]) { if (use(s)) { safe = true; break; } }
    if (!safe && bindable) for (const s of by('bind')) { if (use(s)) { safe = true; break; } }
  }
  if (!safe && mv.k !== 'ult') {
    if (incoming > me.hp * 0.45) for (const s of by('guard')) { if (use(s)) break; }
    const after = me.hp - (safe ? 0 : incoming);
    if (after < me.maxHp * 0.4 || (lethal && !safe)) { const pot = by('pot')[0]; if (pot && me.hp < me.maxHp * 0.75) use(pot); }
  }
  const hurtAllies = ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.55).length;
  for (const s of by('heal')) if (hurtAllies >= Math.max(1, Math.ceil(ids.length / 3))) use(s);
  if (mv.k === 'heal' && bindable) for (const s of [...by('dispel'), ...by('bind')]) { if (use(s)) break; }
  if (mv.k === 'shield') for (const s of by('dispel')) use(s);
  // Damage
  const good = mv.k !== 'shield' || Object.keys(out).some((k) => R.skill(me.cls, k)?.ai === 'dispel');
  // The burst window: bind when sure of the answer (Origin first, Erda Nova with it for a second bound round, or alone),
  // and keep the big skills for a bound or worn-out boss when a bind is coming up soon.
  let window = mv.k === 'bound' || mv.k === 'tired' || Object.keys(out).some((k) => ['bind', 'origin'].includes(R.skill(me.cls, k)?.ai));
  if (know && good && bindable && mv.k !== 'ult' && !window) {
    const origin = by('origin')[0], binds = by('bind');
    const planned = S.bindPlan === S.round;   // (a teammate's bot is binding this round already: don't throw a second bind away)
    if (origin) { use(origin); if (binds[0] && !planned && rand() < 0.7) use(binds[0]); window = true; S.bindPlan = S.round; }
    else if (planned) window = true;
    else if (binds[0]) { use(binds[0]); window = true; S.bindPlan = S.round; }
  }
  const myBindIn = Math.min(...all.filter((s) => s.ai === 'bind' || s.ai === 'origin').map((s) => me.cd[s.key] || 0));
  const bindSoon = !window && Math.max(myBindIn, b.bindFree - S.round) <= 2 && mv.k !== 'bound';
  const holdForWindow = !window && (mv.k === 'charge' || mv.k === 'ult' || bindSoon);   // (a boss is also weak the round after its ultimate)
  for (const s of all) {
    if (!can(s.key) || out[s.key]) continue;
    const arg = s.target ? (s.pickAlly ? s.pickAlly(S, pid, ids) : pid) : s.options ? (s.pickOption ? s.pickOption(S, pid, { know, mv, ids }) : 0) : true;
    if (s.bot) { const r = s.bot(S, pid, { know, mv, ids, lethal, out }); if (r != null && r !== false) out[s.key] = r === true ? arg : r; continue; }
    if (s.ai === 'always') use(s, arg);
    else if (s.ai === 'buff' || s.ai === 'debuff') { if (good && (know || s.team) && !(holdForWindow && s.cd >= 4) && rand() < 0.85) use(s, arg); }
    else if (s.ai === 'burst') { if (know && good && !(holdForWindow && s.cd >= 4)) use(s, arg); }
  }
  return out;
};

root.MapleRaid = R;
if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);

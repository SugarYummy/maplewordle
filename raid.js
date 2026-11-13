// Boss Raid rules (BGM PvP's co-op mode). Nothing in here touches the page: pvp.js draws it, and tools/raid-sim.js
// plays thousands of fights with it to balance the numbers.
//
// A round: the boss shows its move; the music plays; everyone answers and picks skills, then ends their turn.
//   Power   = how well you answered (0 = wrong; right = 50% + up to 50% more for speed). Every attack is x your Power.
//   Skills  = your class's (raid-classes.js: skills every 2 rounds = the game's 1-minute skills, every 4 rounds = its
//             2-minute burst, its Origin every 12, its Ascent twice a fight, its faction's skill) + three everyone has.
//             A skill used in round r is back in round r + cd: cd = the cooldown in the game / 30 s.
//   Binds   = Erda Nova and every Origin. A bind cancels what the boss was about to do THIS round and strips its
//             defense: the round to burst. The boss can be bound again 3 rounds later (your own Erda Nova
//             takes 4: binding early to save yourself leaves the party without its burst). Origin + Erda Nova in the same round
//             don't hold it any longer: everyone just hits harder that round.
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
  attack: (round, grow = 1.04) => 220 * grow ** (round - 1),   // the boss's normal attack (everyone), before its difficulty: it grows a little every round
  focus: 1.7,                                      // Focus: one player, x this
  test: 1.6,                                       // Test: everyone who answered wrong, x this
  heavy: 2.3, heavyRight: 0.7,                     // Heavy blow: x this if you answered wrong / right (a right answer braces you)
  seal: 0.8,                                       // Seal: a weaker hit, and nobody can drink a potion next round
  tired: 0.5,                                      // the round after its ultimate: a weak attack...
  groggy: 1.5,                                     // ...and it takes x this damage
  bossHeal: 0.06, shield: 0.5,
  enrageAt: 0.3, enrage: 1.25,                     // under 30% HP its attacks hit harder
  potCd: 2,                                        // Power Elixir: a full heal, as often as you like, with a wait (the game's potion cooldown)
  rebind: 3,                                       // a boss bound in round r can be bound again in round r + 3 (the game: 120 s bind cooldown, 100 s resistance), a round before your own Erda Nova is back
  boundDef: 0,                                     // a bound boss's defense x this (0 = none: burst now)
  bothBind: 1.2,                                   // bound by an Origin AND by Erda Nova in one round: everyone's damage x this
  originCd: 12,                                    // every class's Origin: 6 minutes, so every third burst
  ascentUses: 2, ascentDmg: 60000,                 // every class's Ascent: twice a fight, the same damage for everyone (tools/raid-sim.js chart sets it)
  partyHp: 0.03, partyAtk: 0.04,                   // a bigger party: the boss has this much more HP (per player) and attack, per extra player
};
R.DIFFS = {   // hp, atk: checked with tools/raid-sim.js. grow: its attack grows this much a round. ultGap: rounds between ultimates, at least. cap: the last round (the time limit)
  easy:    { name: 'Easy',    hp: 1.5, atk: 0.75, def: 0.15, grow: 1.03, ultGap: 6, cap: 20 },
  normal:  { name: 'Normal',  hp: 2.6, atk: 0.95, def: 0.25, grow: 1.035, ultGap: 5, cap: 20 },
  hard:    { name: 'Hard',    hp: 3.4, atk: 1.15, def: 0.35, grow: 1.04, ultGap: 4, cap: 20 },
  extreme: { name: 'Extreme', hp: 4.8, atk: 1.4, def: 0.45, grow: 1.045, ultGap: 4, cap: 20 },
};

// ---------- Skills everyone has ----------
const COMMON = [
  { key: 'rise', name: 'Aeonian Rise', cd: 4, ph: 1, ai: 'iframe', common: true,
    desc: () => 'Untouchable this round',
    use: (c) => { c.iframe(c.pid); return ''; } },
  { key: 'nova', name: 'Erda Nova', cd: 4, ph: 1, ai: 'bind', common: true,
    desc: () => `Binds the boss this round: its move is cancelled, its defense is 0. It resists binds for the next ${R.RULES.rebind - 1} rounds`,
    use: (c) => c.bind('nova') },
  { key: 'pot', name: 'Power Elixir', cd: R.RULES.potCd, ph: 1, ai: 'pot', common: true, icon: 'power-elixir',
    desc: () => 'Full heal, before the boss hits',
    ok: (me, S) => !(S.boss.sealTil >= S.round),
    use: (c) => `+${fmt(c.heal(c.pid, 1))} HP` },
];
R.COMMON = COMMON;

// ---------- Classes ----------
// add(key, { name, hp, atk, basic, role, trait: [name, text], gauge: { name, max }, stances: {key: name}, skills: [...],
//            init(p), start(c), power(c, pw), mult(c, o), basicHit(c), after(c), hitBy(c, amount, o), lethal(c), end(c) })
R.add = (key, C) => {
  C.key = key;
  C.skills = (C.skills || []).map((s) => ({ key: slug(s.name), ph: 2, ...s, noReset: s.noReset ?? s.cd >= 10 }));
  if (C.faction) C.skills.push({ key: slug(C.faction.name), ph: 2, ...C.faction, faction: true, noReset: true });
  if (C.origin) {   // every class's Origin: a huge hit (or summon) that also binds, and you can't be touched while you cast it
    const o = C.origin, mult = () => (o.mult ?? 8) * (C.originK ?? 1);
    C.skills.push({ key: slug(o.name), name: o.name, short: o.short, cd: R.RULES.originCd, ph: 1, ai: 'origin', origin: true, noReset: true, team: true,
      desc: (K) => `${o.summon ? `Summon · ${o.summon} rounds · ${dn(K, mult() / o.summon)} a round` : `${dn(K, mult())} damage`}. Binds the boss. Untouchable this round${o.note ? '. ' + o.note : ''}`,
      use: (c) => { c.iframe(c.pid); const said = c.bind('origin'); if (o.summon) c.summon(o.name, mult() / o.summon, o.summon); else c.hit(mult(), { n: o.name }); o.then?.(c); return said; } });
  }
  if (C.ascent) {   // every class's Ascent: twice a fight, the same damage whoever you play, and the boss can't touch you that round
    const a = C.ascent;
    C.skills.push({ key: slug(a.name), name: a.name, short: a.short, cd: 0, ph: 1, ai: 'ascent', ascent: true, noReset: true,
      ok: (me) => me.asc > 0,
      desc: () => `Untouchable this round. ${fmt(R.RULES.ascentDmg)} fixed damage (nothing changes it). ${R.RULES.ascentUses} uses a fight`,
      use: (c) => { c.me.asc--; c.iframe(c.pid); c.hit(1, { n: a.name, flat: R.RULES.ascentDmg }); return ''; } });
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
const buffWords = (b) => [b.dmg ? `${b.dmg >= 1 ? '+' : '−'}${pct(Math.abs(b.dmg - 1))} FD` : '', b.taken != null ? (b.taken < 1 ? `−${pct(1 - b.taken)} damage taken` : `+${pct(b.taken - 1)} damage taken`) : '',
  b.ied ? `ignore ${pct(b.ied)} DEF` : '', b.regen ? `heal ${pct(b.regen)} a round` : '', b.floor ? `Power at least ${pct(b.floor)}` : ''].filter(Boolean).join(', ');   // (FD = final damage: it multiplies everything else)
const rounds = (n) => n === 1 ? 'this round' : `${n} rounds`;
// Ready-made skills for raid-classes.js
R.h = {
  dn, pct, fmt, buffWords, rounds,
  // An attack: mult x your main attack
  atk: (name, cd, mult, o = {}) => ({ name, cd, ph: 2, ai: cd >= 3 ? 'burst' : 'atk', mult, ...o,
    desc: (C) => `${dn(C, mult)} damage${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.hit(mult, { n: name, ...(o.hit || {}) }); return o.then?.(c); } }),
  // A summon: hits every round for n rounds, whatever you answer
  summon: (name, cd, mult, n, o = {}) => ({ name, cd, ph: 2, ai: o.pw ? (cd >= 3 ? 'burst' : 'atk') : 'always', ...o,
    desc: (C) => { const N = n + (C.summonPlus || 0); return `Summon · ${N === 1 ? 'this round' : `${N} rounds`} · ${dn(C, mult)}${N === 1 ? '' : ' a round'}${o.pw ? ' × Power' : ' (hits even if you answer wrong)'}${o.note ? '. ' + o.note : ''}`; },
    use: (c) => { const N = n + (c.C.summonPlus || 0); c.summon(name, mult, n, o.pw); const t = o.then?.(c); return typeof t === 'string' ? t : ''; } }),
  // A buff on yourself / the whole party / one player you pick
  self: (name, cd, n, b, o = {}) => ({ name, cd, ph: 0, ai: 'buff', ...o,
    desc: () => `${n === 1 ? 'This round' : n + ' rounds'}: ${buffWords(b)}${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.buff(c.pid, { k: slug(name), n, name, ...b }); return o.then?.(c) || buffWords(b); } }),
  party: (name, cd, n, b, o = {}) => ({ name, cd, ph: 0, ai: 'buff', team: true, ...o,
    desc: () => `Party · ${rounds(n)}: ${buffWords(b)}${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.party({ k: slug(name), n, name, ...b }); return o.then?.(c) || `party ${buffWords(b)}`; } }),
  ally: (name, cd, n, b, o = {}) => ({ name, cd, ph: 0, ai: 'buff', target: true, team: true, ...o,
    desc: () => `One player · ${rounds(n)}: ${buffWords(b)}${o.note ? '. ' + o.note : ''}`,
    use: (c, t) => { const to = c.ally(t); c.buff(to, { k: slug(name), n, name, ...b }); return `→ {p:${to}} ${buffWords(b)}`; } }),
  // The boss takes more damage from everyone
  expose: (name, cd, n, m, mult = 0, o = {}) => ({ name, cd, ph: mult ? 2 : 1, ai: 'debuff', team: true, ...o,
    desc: (C) => `${mult ? dn(C, mult) + ' damage. ' : ''}Boss takes +${pct(m - 1)} damage · ${rounds(n)}${o.note ? '. ' + o.note : ''}`,
    use: (c) => { c.vuln(slug(name), m, n, name); if (mult) c.hit(mult, { n: name }); return o.then?.(c) || `boss takes +${pct(m - 1)} damage`; } }),
};

// ---------- A fight's state (plain data: it's sent to every player) ----------
R.newPlayer = (cls, lives) => {
  const C = R.cls(cls);
  const p = { cls: C.key, hp: C.hp, maxHp: C.hp, lives, out: false, cd: {}, buffs: [], sum: [], g: 0, st: C.stances ? Object.keys(C.stances)[0] : null, asc: R.RULES.ascentUses, v: {}, last: null };
  C.init?.(p);
  return p;
};
R.newBoss = (name, image, players, diff, hpEach) => {
  const D = R.DIFFS[diff] || R.DIFFS.normal, X = R.RULES, more = Math.min(7, players - 1);
  const hp = Math.round((hpEach || X.bossHp * D.hp) * players * (1 + X.partyHp * more) / 100) * 100;
  return { name, image, diff: R.DIFFS[diff] ? diff : 'normal', hp, max: hp, def: D.def, atk: +(D.atk * (1 + X.partyAtk * more)).toFixed(3), move: null, last: null, lastUlt: 0, bindFree: 0, binds: 0, sealTil: 0, vuln: [], dots: [], weak: [], enraged: false };
};
const aliveIds = (S) => Object.keys(S.players).filter((id) => !S.players[id].out);
R.aliveIds = aliveIds;

// The move the boss shows at the start of a round (and does at its end)
R.pickMove = (S, rand = Math.random) => {
  const b = S.boss, r = S.round, X = R.RULES, D = R.DIFFS[b.diff];
  const base = Math.round(X.attack(r, D.grow) * b.atk * (b.enraged ? X.enrage : 1)), alive = aliveIds(S);
  let mv;
  if (b.last === 'charge') { mv = { k: 'ult' }; b.lastUlt = r; }
  else if (b.last === 'ult') mv = { k: 'tired', dmg: Math.round(base * X.tired) };
  else if (r <= 1) mv = { k: 'attack', dmg: base };
  else {
    const w = { attack: 3, focus: alive.length ? 2 : 0, test: 2, heavy: b.last !== 'heavy' ? 2 : 0, seal: b.last !== 'seal' ? 1.2 : 0, charge: r >= 3 && r - b.lastUlt >= D.ultGap ? 1.6 : 0,
      shield: b.last !== 'shield' ? 1 : 0, heal: b.last !== 'heal' && b.hp < b.max * 0.7 ? 0.8 : 0 };
    let x = rand() * Object.values(w).reduce((a, v) => a + v, 0), k = 'attack';
    for (const [key, v] of Object.entries(w)) { if ((x -= v) < 0) { k = key; break; } }
    if (k === 'attack') mv = { k, dmg: base };
    else if (k === 'focus') {
      const taunt = alive.filter((id) => S.players[id].buffs.some((f) => f.taunt));
      mv = { k, dmg: Math.round(base * X.focus), pid: (taunt.length ? taunt : alive)[Math.floor(rand() * (taunt.length || alive.length))] };
    }
    else if (k === 'test') mv = { k, dmg: Math.round(base * X.test) };
    else if (k === 'heavy') mv = { k, dmg: Math.round(base * X.heavy), soft: Math.round(base * X.heavyRight) };
    else if (k === 'seal') mv = { k, dmg: Math.round(base * X.seal) };
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
    case 'attack': return `⚔️ ${boss} attacks everyone: ${fmt(mv.dmg)}`;
    case 'focus': return `🎯 ${boss} targets {p:${mv.pid}}: ${fmt(mv.dmg)}`;
    case 'test': return `🧠 Test: ${fmt(mv.dmg)} to everyone who answers wrong`;
    case 'charge': return `🌀 ${boss} is charging its ultimate`;
    case 'ult': return `☄️ Ultimate: be untouchable or go down`;
    case 'tired': return `😮‍💨 ${boss} is worn out: takes +${pct(R.RULES.groggy - 1)} damage, hits for ${fmt(mv.dmg)}`;
    case 'heavy': return `🔨 Heavy blow: ${fmt(mv.dmg)} (${fmt(mv.soft)} if you answer right)`;
    case 'seal': return `🚫 ${fmt(mv.dmg)} to everyone, no potions next round`;
    case 'shield': return `🔰 ${boss} shields: half damage this round`;
    case 'heal': return `💗 ${boss} will heal ${fmt(mv.amount)}`;
  }
  return '';
};

R.canCast = (S, pid, key) => {
  const me = S.players[pid], sk = me && R.skill(me.cls, key);
  return !!sk && !me.out && !(me.cd[key] > 0 && !sk.free?.(me, S)) && (!sk.ok || !!sk.ok(me, S));   // (free: usable through its cooldown, e.g. a Resonance)
};
// Damage a player's attacks get from their buffs (for the page: "x1.4")
R.dmgMult = (me) => me.buffs.reduce((m, f) => m * (f.dmg || 1), 1);

// ---------- One round ----------
// inputs[pid] = { power: 0..1, sec: seconds of the main answer (or null), casts: { skillKey: true | target id | option } }
// Returns the events, in order: { s: 'skills' | 'boss' | 'end', t: text with {p:id} names, pid?, amount?, k? }
R.resolve = (S, inputs, rand = Math.random) => {
  const X = R.RULES, b = S.boss, mv = b.move || { k: 'attack', dmg: 0 }, ev = [], ids = aliveIds(S);
  const rc = { iframe: new Set(), block: new Set(), bound: false, kinds: new Set(), both: false, dispel: false, casts: [] };
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
        if (o.flat) {   // Ascent: always exactly this much, whatever your answer, your buffs or the boss's defense / shield / bind
          const d = Math.round(o.flat); b.hp = Math.max(0, b.hp - d); c.dealt += d; stat(pid).dmg += d; c.parts.push({ n: o.n, d }); return d;
        }
        const pw = o.free != null ? o.free : c.power;
        if (pw <= 0 || mult <= 0) return 0;
        let m = R.dmgMult(me) * (C.mult ? C.mult(c, o) : 1), ied = o.ied || 0, taken = 1;
        for (const f of me.buffs) if (f.ied) ied = 1 - (1 - ied) * (1 - f.ied);
        for (const v of b.vuln) taken *= v.m;
        if (mv.k === 'tired') taken *= X.groggy;
        const shield = mv.k === 'shield' && !rc.dispel && !rc.bound && !o.pierce ? X.shield : 1;
        const def = b.def * (rc.bound ? X.boundDef : 1);
        if (rc.both) taken *= X.bothBind;
        const dmg = Math.max(1, Math.round(C.atk * mult * m * pw * taken * shield * (1 - def * (1 - ied)) * (0.96 + rand() * 0.08)));
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
      bind(kind = 'nova') {
        if (rc.bound) {   // bound already this round: an Origin on top of Erda Nova (or the other way round) = everyone hits harder
          if (!rc.kinds.has(kind)) { rc.kinds.add(kind); if (rc.kinds.size === 2) rc.both = true; return `binds ${b.name}`; }
          return `${b.name} is already bound`;
        }
        if (S.round < b.bindFree) return `${b.name} resists the bind`;
        rc.bound = true; rc.kinds.add(kind); b.bindFree = S.round + X.rebind; b.binds = (b.binds || 0) + 1;
        b.last = 'bound';   // (whatever it was doing is broken off: no ultimate after a cancelled charge, no rest after a cancelled ultimate)
        return `binds ${b.name}`;
      },
      dispel() { rc.dispel = true; },   // the boss's shield / heal doesn't happen this round
      vuln(k, m, n, name) { b.vuln = b.vuln.filter((x) => x.k !== k); b.vuln.push({ k, m, n, name }); },
      weaken(k, m, n, name) { b.weak = b.weak.filter((x) => x.k !== k); b.weak.push({ k, m, n, name }); },
      dot(k, mult, n, name, max = 1) {   // a burn on the boss: hits each round whatever you answer; up to max stacks
        const mine = b.dots.filter((x) => x.k === k && x.by === pid);
        if (mine.length >= max) { mine.sort((x, y) => x.n - y.n)[0].n = n; return; }
        b.dots.push({ k, by: pid, mult, n, name });
      },
      summon(name, mult, n, pw) { me.sum = me.sum.filter((x) => x.name !== name); me.sum.push({ name, mult, n: n + (C.summonPlus || 0), ...(pw ? { pw: 1 } : {}) }); },
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
    // (k: 'cast' + name: the page shows these as icons; imp: worth a line of text too)
    if (said || sk.ph !== 2) say('skills', `{p:${c.pid}} · <b>${sk.short || sk.name}</b>${said ? ' ' + said : ''}`, { pid: c.pid, ic: R.iconOf(sk), k: 'cast', name: sk.name, imp: sk.key === 'nova' || !!sk.origin });
  };
  for (const ph of [0, 1]) for (const x of rc.casts) if ((x.sk.ph ?? 2) === ph) run(x);
  if (rc.both) say('skills', `⛓️ 2× bind this round: +${pct(X.bothBind - 1)} FD`, { k: 'bossMove' });
  if (mv.k === 'shield' && !rc.bound) say('skills', rc.dispel ? `🔰 ${b.name}'s shield is torn away` : R.moveText(mv, b.name), { k: 'bossMove' });
  // 2. Attacks, one player at a time: main attack, attack skills, summons
  for (const pid of ids) {
    const c = ctxs[pid], me = c.me, C = c.C;
    if (c.power > 0) { if (C.basicHit) C.basicHit(c); else c.hit(C.basicMult ?? 1, { n: C.basic, basic: true }); }
    for (const x of rc.casts) if (x.c === c && (x.sk.ph ?? 2) === 2) run(x);
    for (const s of me.sum) c.hit(s.mult, { n: s.name, free: s.pw ? c.power : 1, sum: true });   // (pw: a summon that follows your Power instead of fighting on its own)
    C.after?.(c);
    const total = c.parts.reduce((a, x) => a + x.d, 0);
    const icon = (n) => { const base = n.replace(/^✨ /, '').replace(/ ×\d+$/, ''); if (base === C.basic) return slug(C.basic); if (C.partIcons?.[base]) return C.partIcons[base]; const sk = C.skills.find((x) => x.name === base || x.short === base); return sk ? R.iconOf(sk) : null; };
    if (total) say('skills', `{p:${pid}} ${c.parts.map((x) => `${x.n} <b>${fmt(x.d)}</b>`).join(' · ')}${c.parts.length > 1 ? ` = <b>${fmt(total)}</b>` : ''}${c.power > 0 ? '' : ' <small>(wrong answer: only summons)</small>'}`, { pid, k: 'atk', amount: total, parts: c.parts.map((x) => ({ n: x.n, d: x.d, ic: icon(x.n) })) });
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
    if (door) { p.buffs = p.buffs.filter((f) => f !== door); p.hp = Math.round(p.maxHp * 0.5); return say('boss', `🚪 ${door.name} saves {p:${pid}}`, { pid }); }
    const und = p.buffs.find((f) => f.undying);
    if (und) { p.hp = 1; return say('boss', `🩸 ${und.name} keeps {p:${pid}} up`, { pid }); }
    const saved = c.C.lethal?.(c);
    if (saved) return say('boss', `{p:${pid}} ${saved}`, { pid });
    p.lives--;
    if (p.lives > 0) { p.hp = p.maxHp; say('boss', `💔 {p:${pid}} loses a life`, { pid, k: 'life' }); }
    else { p.hp = 0; p.out = true; p.buffs = []; p.sum = []; say('boss', `☠️ {p:${pid}} is out`, { pid, k: 'out' }); }
  };
  const hurt = (pid, amount, o = {}) => {
    const p = P(pid), c = ctxs[pid];
    if (!p || p.out) return;
    if (rc.iframe.has(pid) || p.buffs.some((f) => f.iframe)) return say('boss', `🛡️ {p:${pid}} is untouchable`, { pid, k: 'dodge' });
    if (!o.ult && rc.block.has(pid)) return say('boss', `🌫️ {p:${pid}} is covered`, { pid, k: 'dodge' });
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
    say('boss', o.ult ? `☄️ {p:${pid}} is hit by the ultimate` : `💢 {p:${pid}} −${fmt(amount)}`, { pid, k: 'bossHit', amount: lost });
    if (p.hp <= 0) down(pid);
  };
  if (b.hp > 0) {
    if (rc.bound) say('boss', `⛓️ ${b.name}'s ${mv.k === 'charge' ? 'charge' : mv.k === 'ult' ? 'ultimate' : 'move'} is cancelled`, { k: 'bossMove' });
    else {
      if (mv.k !== 'shield') say('boss', mv.k === 'heal' && rc.dispel ? `💗 ${b.name}'s healing is cut off` : R.moveText(mv, b.name), { k: 'bossMove' });
      const now = ids.filter((id) => !P(id).out);
      if (mv.k === 'attack' || mv.k === 'tired' || mv.k === 'seal') for (const id of now) hurt(id, mv.dmg);
      else if (mv.k === 'heavy') for (const id of now) hurt(id, ctxs[id].power > 0 ? mv.soft : mv.dmg, { heavy: true });
      else if (mv.k === 'ult') for (const id of now) hurt(id, 99999, { ult: true });
      else if (mv.k === 'focus') {
        const t = P(mv.pid) && !P(mv.pid).out ? mv.pid : now[Math.floor(rand() * now.length)];
        const tank = now.find((id) => id !== t && R.cls(P(id).cls).cover);   // (a Paladin takes it instead, at half damage)
        if (tank) { say('boss', `🛡️ {p:${tank}} steps in front of {p:${t}}`, { pid: tank }); hurt(tank, Math.round(mv.dmg * 0.5), { focus: true }); }
        else if (t) hurt(t, mv.dmg, { focus: true });
      }
      else if (mv.k === 'test') { const wrong = now.filter((id) => !(ctxs[id].power > 0)); if (!wrong.length) say('boss', '✅ Everyone passed the test'); for (const id of wrong) hurt(id, mv.dmg, { test: true }); }
      if (mv.k === 'seal') b.sealTil = S.round + 1;
      if (mv.k === 'heal' && !rc.dispel) { const before = b.hp; b.hp = Math.min(b.max, b.hp + mv.amount); say('boss', `💗 ${b.name} heals ${fmt(b.hp - before)} HP`, { k: 'bossHeal' }); }
    }
  }
  // 4. The end of the round: regeneration, then cooldowns and buffs tick down
  for (const pid of ids) {
    const c = ctxs[pid], me = c.me;
    if (me.out) continue;
    let regen = 0;
    for (const f of me.buffs) if (f.regen) regen += f.regen;
    if (regen > 0 && me.hp < me.maxHp) c.heal(pid, regen);   // (no line for it: the HP bars show it)
    c.C.end?.(c);
    for (const t of c.notes) say('end', `{p:${pid}} ${t}`, { pid });
    c.notes.length = 0;
    for (const f of me.buffs) if (f.decay && f.dmg) f.dmg = +(f.dmg - f.decay).toFixed(3);   // (a buff that fades round by round: Arcane Overdrive)
    me.buffs = me.buffs.filter((f) => --f.n > 0);
    me.sum = me.sum.filter((s) => --s.n > 0);
    for (const k of Object.keys(me.cd)) if (me.cd[k] > 0) me.cd[k]--;
  }
  b.vuln = b.vuln.filter((v) => --v.n > 0);
  b.weak = b.weak.filter((v) => --v.n > 0);
  b.dots = b.dots.filter((d) => --d.n > 0 && !P(d.by)?.out);
  if (b.hp > 0 && !b.enraged && b.hp <= b.max * X.enrageAt) { b.enraged = true; say('end', `😡 ${b.name} is enraged: +${pct(X.enrage - 1)} attack`, { k: 'enrage' }); }
  return ev;
};

// ---------- Bots ----------
// Bots play as a team. The plan for a round is the same whichever bot asks (so they agree without talking):
//   - a burst window = a round the boss can be bound in. One bot binds with Erda Nova, ONE bot adds its Origin (they
//     take turns, window after window, so the Origins are spread over the fight), and every bot unloads its big
//     skills in that round. Between windows they hold everything with a cooldown of 3+ rounds.
//   - know: does the bot think its answer is right? (it's usually right about that). A bot that isn't sure keeps its
//     attacks and its Origin for the next window, but still binds and still buffs the party.
R.window = (S) => {
  const b = S.boss, ids = aliveIds(S).filter((id) => S.players[id].bot).sort(), n = ids.length, w = b.binds || 0;
  // (the boss can be bound again after 3 rounds, but everyone's burst needs 4: the bots keep to that rhythm and never bind early)
  const last = b.botWin === S.round ? b.botWinPrev : b.botWin;
  const bindable = S.round >= b.bindFree && (last == null || S.round - last >= 4);
  const ready = (id, pred) => { const C = R.cls(S.players[id].cls); return [...C.skills, ...COMMON].some((sk) => pred(sk) && R.canCast(S, id, sk.key)); };
  let origin = null, nova = null;
  if (bindable) {
    for (let i = 0; i < n && !origin; i++) { const id = ids[(w + i) % n]; if (ready(id, (sk) => sk.origin)) origin = id; }
    for (let i = 0; i < n && !nova; i++) { const id = ids[(w + 1 + i) % n]; if (ready(id, (sk) => sk.key === 'nova')) nova = id; }
  }
  if ((origin || nova) && b.botWin !== S.round) { b.botWinPrev = b.botWin; b.botWin = S.round; }
  return { bindable, origin, nova };
};
R.botCasts = (S, pid, know, rand = Math.random) => {
  const me = S.players[pid], out = {};
  if (!me || me.out) return out;
  const C = R.cls(me.cls), b = S.boss, mv = b.move || {}, ids = aliveIds(S);
  const can = (k) => R.canCast(S, pid, k);
  const use = (sk, arg = true) => { if (!(sk.key in out) && can(sk.key)) { out[sk.key] = arg; return true; } return false; };
  const all = [...C.skills, ...COMMON];
  const by = (ai) => all.filter((sk) => sk.ai === ai && can(sk.key));
  const W = R.window(S), myOrigin = W.origin === pid && know, myNova = W.nova === pid;
  const inWin = W.bindable && (W.nova != null || myOrigin);   // the boss gets bound this round: its move won't happen
  if (myNova) use(R.skill(me.cls, 'nova'));
  if (myOrigin) use(by('origin')[0]);
  // Staying alive (nothing to fear in a round the boss is bound)
  const incoming = inWin ? 0 : mv.k === 'attack' || mv.k === 'tired' || mv.k === 'seal' ? mv.dmg : mv.k === 'focus' && mv.pid === pid ? mv.dmg : mv.k === 'test' && !know ? mv.dmg : mv.k === 'heavy' ? (know ? mv.soft : mv.dmg) : 0;
  const ult = mv.k === 'ult' && !inWin, pot = by('pot')[0];
  let safe = Object.keys(out).some((k) => R.skill(me.cls, k)?.origin);
  if (!safe && ult) safe = [...by('iframe'), ...by('ascent')].some((sk) => use(sk));
  if (!safe && !ult && incoming >= me.hp) {
    if (pot && incoming < me.maxHp) safe = use(pot);
    if (!safe) safe = [...by('guard'), ...by('iframe'), ...by('ascent')].some((sk) => use(sk));
  }
  if (!safe && !ult) {
    if (incoming > me.hp * 0.5) for (const sk of by('guard')) { if (use(sk)) break; }
    if (pot && me.hp - incoming < me.maxHp * 0.4 && me.hp < me.maxHp * 0.85) use(pot);
  }
  const hurtAllies = ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.55).length;
  for (const sk of by('heal')) if (hurtAllies >= Math.max(1, Math.ceil(ids.length / 3))) use(sk);
  // Ascent is kept as a second way to dodge; what is left goes out in the third and fourth windows
  if (inWin && ((me.asc >= 2 && (b.binds || 0) >= 2) || (me.asc === 1 && (b.binds || 0) >= 3))) { const a = by('ascent')[0]; if (a) use(a); }
  // Damage: small skills whenever they're up, big ones only in a window
  const shielded = mv.k === 'shield' && !inWin;
  for (const sk of all) {
    if (!can(sk.key) || sk.key in out) continue;
    const arg = sk.target ? (sk.pickAlly ? sk.pickAlly(S, pid, ids) : pid) : sk.options ? (sk.pickOption ? sk.pickOption(S, pid, { know, mv, ids, inWin }) : 0) : true;
    if (sk.bot) { const r = sk.bot(S, pid, { know, mv, ids, out, inWin, incoming }); if (r != null && r !== false) out[sk.key] = r === true ? arg : r; continue; }
    const big = sk.cd >= 3;
    if (big && !inWin) continue;
    if (sk.ai === 'always') use(sk, arg);
    else if (sk.ai === 'buff' || sk.ai === 'debuff') { if (know || sk.team) use(sk, arg); }
    else if (sk.ai === 'burst' || sk.ai === 'atk') { if (know && !shielded) use(sk, arg); }
  }
  return out;
};

root.MapleRaid = R;
if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);

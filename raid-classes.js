// Boss Raid: every class's kit (the rules are in raid.js). A class = its main attack (free, every round you answer
// right), one trait that makes it play its own way, and three of its skills. Cooldowns: the skill's cooldown in the
// game / 30 s, in rounds (2 min = 4). Damage numbers are multiples of the class's main attack, so tuning a class's
// `atk` (TUNE below, from tools/raid-sim.js) moves all of them together.
(function (R) {
'use strict';
const { atk, summon, self, party, ally, expose, dn, pct, fmt } = R.h;
const A = 10000;   // a main attack at 100% Power, before tuning
// From tools/raid-sim.js: each class's attack, so that they all clear a boss about equally well (1 = untouched)
const TUNE = { 'hero': 0.99, 'paladin': 1.32, 'dark-knight': 1.33, 'arch-mage-f-p': 0.90, 'arch-mage-i-l': 1.12, 'bishop': 1.41, 'bow-master': 0.82, 'marksman': 0.78, 'pathfinder': 1.31, 'night-lord': 1.10, 'shadower': 0.88, 'dual-blade': 0.75, 'buccaneer': 0.93, 'corsair': 0.96, 'cannoneer': 0.85, 'jett': 0.94, 'dawn-warrior': 1.09, 'blaze-wizard': 1.24, 'wind-archer': 1.02, 'night-walker': 1.05, 'thunder-breaker': 0.77, 'mihile': 1.29, 'aran': 1.34, 'evan': 0.76, 'mercedes': 1.22, 'phantom': 1.45, 'luminous': 1.35, 'shade': 0.89, 'demon-slayer': 1.56, 'demon-avenger': 0.77, 'battle-mage': 1.27, 'wild-hunter': 0.82, 'mechanic': 1.14, 'xenon': 1.18, 'blaster': 0.98, 'hayato': 0.88, 'kanna': 1.27, 'kaiser': 0.90, 'kain': 0.82, 'cadena': 0.88, 'angelic-buster': 0.79, 'zero': 1.02, 'kinesis': 1.24, 'adele': 0.72, 'illium': 0.96, 'khali': 1.05, 'ark': 1.16, 'lara': 1.18, 'hoyoung': 0.84, 'lynn': 1.24, 'mo-xuan': 1.01, 'sia-astelle': 1.26, 'ren': 0.96, 'erel-light': 1.33, 'lethe': 1.53, 'beast-tamer': 1.43 };
R.TUNE = TUNE;
const add = (key, C) => { C.atk = Math.round(A * (C.atkBase ?? 1) * (TUNE[key] ?? 1) / 10) * 10; R.add(key, C); };

// ---------- Helpers ----------
const lowest = (c, notMe) => c.alive().filter((id) => !notMe || id !== c.pid).sort((x, y) => c.S.players[x].hp / c.S.players[x].maxHp - c.S.players[y].hp / c.S.players[y].maxHp)[0];
const otherAlly = (S, pid, ids) => { const o = ids.filter((id) => id !== pid); return o.length ? o[Math.floor(Math.random() * o.length)] : pid; };
const lowestOf = (S, pid, ids) => ids.slice().sort((x, y) => S.players[x].hp / S.players[x].maxHp - S.players[y].hp / S.players[y].maxHp)[0] ?? pid;
// A skill that also costs some of the class's gauge
const spend = (n, word, sk) => ({ ...sk, cost: n,
  ok: (me, S) => me.g >= n && (!sk.ok || sk.ok(me, S)),
  desc: (C) => `${typeof sk.desc === 'function' ? sk.desc(C) : sk.desc}. Costs ${n} ${word}`,
  use: (c, arg) => { c.me.g -= n; return sk.use(c, arg); } });
const hurtSoon = (x, S, pid) => { const me = S.players[pid], mv = x.mv; const d = mv.k === 'attack' || mv.k === 'tired' ? mv.dmg : mv.k === 'focus' && mv.pid === pid ? mv.dmg : mv.k === 'test' && !x.know ? mv.dmg : 0; return d / me.hp; };

// ============================== Explorers ==============================
add('hero', { name: 'Hero', role: 'Damage', hp: 1200, basic: 'Raging Blow',
  trait: ['Combo Attack', 'Each right answer adds a Combo Orb (max 10): +4% damage each. A wrong answer loses 3.'],
  gauge: { name: 'Combo', max: 10 },
  mult: (c) => 1 + 0.04 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(10, c.me.g + 1) : Math.max(0, c.me.g - 3); },
  skills: [atk('Sword Illusion', 2, 1.7), self('Valhalla', 4, 2, { dmg: 1.4, taken: 0.8 }), summon('Burning Soul Blade', 4, 0.5, 3)] });

add('paladin', { name: 'Paladin', role: 'Tank / Support', hp: 1350, basic: 'Blast', cover: true,
  trait: ['Parashock Guard', 'You take 25% less damage. When the boss targets a teammate, you step in and take the hit yourself, at half damage.'],
  taken: () => 0.75,
  skills: [atk('Mighty Mjolnir', 2, 1.7),
    { name: 'Grand Guardian', cd: 4, ph: 1, ai: 'guard', team: true, desc: () => 'Whole party takes 60% less damage this round, then heals 15% HP',
      use: (c) => { c.party({ k: 'grand-guardian', n: 1, name: 'Grand Guardian', taken: 0.4, regen: 0.15 }); return 'the party takes 60% less damage this round, then heals 15%'; } },
    ally('Divine Echo', 4, 2, { dmg: 1.4 }, { pickAlly: otherAlly })] });

add('dark-knight', { name: 'Dark Knight', role: 'Damage / Sustain', hp: 1300, basic: "Gungnir's Descent",
  trait: ['Final Pact', 'Once every 8 rounds, a hit that would take you down leaves you standing at full HP instead (even an ultimate), and you deal +30% damage for 2 rounds.'],
  lethal: (c) => { if (c.me.cd._pact > 0) return ''; c.me.cd._pact = 8; c.me.hp = c.me.maxHp; c.buff(c.pid, { k: 'final-pact', n: 3, name: 'Final Pact', dmg: 1.3 }); return 'refuses to fall: <b>Final Pact</b> (full HP, +30% damage)'; },
  status: (me) => (me.cd._pact > 0 ? `Final Pact back in ${me.cd._pact}` : 'Final Pact ready'),
  skills: [atk('Radiant Evil', 2, 1.7), self('Dark Thirst', 4, 2, { dmg: 1.3, regen: 0.12 }), party('Darkness Aura', 6, 3, { regen: 0.08, taken: 0.85 }, { ai: 'heal' })] });

add('arch-mage-f-p', { name: 'Arch Mage (F/P)', role: 'Damage over time', hp: 850, atkBase: 0.8, basic: 'Flame Sweep',
  trait: ['Burn', 'Every right answer sets a burn on the boss (up to 5): each one burns for 15% of your main attack every round for 3 rounds, even on rounds you get wrong.'],
  basicHit: (c) => { c.hit(1, { n: 'Flame Sweep' }); c.dot('burn', 0.15, 3, 'Burn', 5); },
  skills: [
    { name: 'Mist Eruption', cd: 2, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 0.9)} damage + ${dn(C, 0.4)} for each burn on the boss`,
      use: (c) => { c.hit(0.9 + 0.4 * c.b.dots.filter((d) => d.by === c.pid).length, { n: 'Mist Eruption' }); } },
    atk('Fury of Ifrit', 3, 2.2, { note: 'Sets 2 more burns', then: (c) => { if (c.power > 0) { c.dot('burn', 0.15, 3, 'Burn', 5); c.dot('burn', 0.15, 3, 'Burn', 5); } } }),
    atk('Infernal Venom', 12, 8, { note: 'Your burns last 3 more rounds', then: (c) => { for (const d of c.b.dots) if (d.by === c.pid) d.n += 3; } })] });

add('arch-mage-i-l', { name: 'Arch Mage (I/L)', role: 'Damage / Control', hp: 850, atkBase: 0.9, basic: 'Chain Lightning',
  trait: ['Frostbite', 'Ice skills put Frost on the boss (max 5): your attacks deal +6% per Frost. At 5 Frost it is frozen stiff: its attacks hit 20% softer.'],
  gauge: { name: 'Frost', max: 5 },
  mult: (c) => 1 + 0.06 * c.me.g,
  end: (c) => { if (c.me.g >= 5) c.weaken('frost', 0.8, 2, 'Frozen'); },
  skills: [atk('Frozen Orb', 2, 1.3, { note: '+2 Frost', then: (c) => { c.me.g = Math.min(5, c.me.g + 2); } }), atk('Bolt Barrage', 4, 3.4),
    { name: 'Freezing Breath', cd: 6, ph: 1, ai: 'bind', desc: () => 'Bind the boss, and you take no damage this round. Frost goes to 5', use: (c) => { c.iframe(c.pid); c.me.g = 5; return c.bind(); } }] });

add('bishop', { name: 'Bishop', role: 'Healer / Support', hp: 900, basic: 'Angel Ray',
  trait: ['Angel Ray and Bahamut', 'Every right answer also heals the most hurt player in the party for 6% HP. Bahamut breathes fire every round for 40% of your main attack, even when you answer wrong.'],
  after: (c) => { if (c.power > 0) { const t = lowest(c); if (t) c.heal(t, 0.06); } c.hit(0.4, { n: 'Bahamut', free: 1 }); },
  skills: [
    { name: 'Heal', cd: 2, ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 30% HP', use: (c) => `heals the party for ${fmt(c.healAll(0.3))} HP` },
    party('Benediction', 4, 3, { dmg: 1.3 }),
    { name: "Heaven's Door", cd: 6, ph: 1, ai: 'door', team: true, desc: () => 'Whole party, 3 rounds: the next hit that would take you down leaves you at half HP instead (even an ultimate)',
      bot: (S, pid, x) => x.mv.k === 'charge' || x.mv.k === 'ult',
      use: (c) => { c.party({ k: 'heavens-door', n: 3, name: "Heaven's Door", door: true }); return 'the party can’t be taken down once (3 rounds)'; } }] });

add('bow-master', { name: 'Bow Master', role: 'Steady damage', hp: 950, basic: 'Hurricane',
  trait: ['Hurricane', 'A steady stream of arrows: when you answer right your Power is never under 85%, however slow you were.'],
  power: (c, pw) => (pw > 0 ? Math.max(0.85, pw) : 0),
  skills: [atk('Quiver Barrage', 3, 2.55), summon('Arrow Rain', 4, 0.6, 3), atk('Ascendant Shade', 12, 10)] });

add('marksman', { name: 'Marksman', role: 'Burst damage', hp: 950, basic: 'Snipe',
  trait: ['Weak Point', 'Speed is everything: a right answer in under 5 seconds deals +40% damage.'],
  mult: (c, o) => (o.free == null && c.sec != null && c.sec < 5 ? 1.4 : 1),
  skills: [self('Split Shot', 4, 2, { dmg: 1.4 }), atk('Perfect Shot', 6, 5.1, { hit: { ied: 1, pierce: true }, note: "Goes straight through the boss's defense and shield" }), atk('Final Aim', 12, 10)] });

add('pathfinder', { name: 'Pathfinder', role: 'Damage / Support', hp: 950, basic: 'Cardinal Burst',
  trait: ['Relic Gauge', 'Each right answer charges the Relic (max 3). Ancient Astra has no cooldown, but needs a full Relic and empties it.'],
  gauge: { name: 'Relic', max: 3 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(3, c.me.g + 1); },
  skills: [
    { name: 'Ancient Astra', cd: 0, ph: 2, ai: 'burst', ok: (me) => me.g >= 3, desc: (C) => `${dn(C, 3.2)} damage. Needs a full Relic`, use: (c) => { c.me.g = 0; c.hit(3.2, { n: 'Ancient Astra' }); } },
    summon('Raven Tempest', 4, 0.6, 3),
    party('Obsidian Barrier', 6, 2, { taken: 0.6 }, { ai: 'guard' })] });

add('night-lord', { name: 'Night Lord', role: 'Damage / Debuff', hp: 900, basic: 'Quad Star',
  trait: ["Assassin's Mark", 'Each right answer has a 45% chance to set off a mark for +60% of your main attack.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.45) c.hit(0.6, { n: "Assassin's Mark" }); },
  skills: [atk("Dark Lord's Omen", 2, 1.7), self('Spread Throw', 6, 2, { dmg: 1.7 }),
    { name: 'Frailty Curse', cd: 4, ph: 1, ai: 'debuff', team: true, desc: () => 'For 3 rounds the boss hits 20% softer and takes +10% damage from everyone',
      use: (c) => { c.weaken('frailty', 0.8, 3, 'Frailty Curse'); c.vuln('frailty', 1.1, 3, 'Frailty Curse'); return 'the boss hits 20% softer and takes +10% damage for 3 rounds'; } }] });

add('shadower', { name: 'Shadower', role: 'Damage / Support', hp: 950, basic: 'Assassinate',
  trait: ['Meso Explosion', 'Right answers scatter mesos. Every 3rd one blows them up: a bonus hit worth 150% of your main attack.'],
  gauge: { name: 'Mesos', max: 3 },
  after: (c) => { if (c.power > 0 && ++c.me.g >= 3) { c.me.g = 0; c.hit(1.5, { n: 'Meso Explosion' }); } },
  skills: [atk('Sonic Blow', 2, 1.7), atk('Slash Shadow Formation', 3, 2.55),
    { name: 'Smokescreen', cd: 5, ph: 1, ai: 'guard', team: true, desc: () => 'Whole party takes no damage this round (an ultimate still hits) and deals +10% damage',
      use: (c) => { for (const id of c.alive()) c.block(id); c.party({ k: 'smokescreen', n: 1, name: 'Smokescreen', dmg: 1.1 }); return 'hides the party in smoke: no damage this round'; } }] });

add('dual-blade', { name: 'Dual Blade', role: 'Damage', hp: 950, basic: 'Phantom Blow',
  trait: ['Mirror Image', '25% chance to slip any hit (not an ultimate). After a dodge your attacks deal +30% next round.'],
  hitBy: (c) => { if (c.rand() < 0.25) { c.buff(c.pid, { k: 'shadow-meld', n: 2, name: 'Shadow Meld', dmg: 1.3 }); c.tell('boss', '💨 slips the hit (Mirror Image)', { k: 'dodge' }); return true; } },
  skills: [
    { name: 'Final Cut', cd: 3, ph: 2, ai: 'burst', desc: (C) => `Costs 10% of your HP: ${dn(C, 2)} damage, and +25% damage for 2 rounds`,
      use: (c) => { c.pay(0.1); c.buff(c.pid, { k: 'final-cut', n: 2, name: 'Final Cut', dmg: 1.25 }); c.hit(2, { n: 'Final Cut' }); } },
    atk("Asura's Anger", 2, 1.7), atk('Blade Storm', 3, 2.55)] });

add('buccaneer', { name: 'Buccaneer', role: 'Damage / Support', hp: 1050, basic: 'Octopunch',
  trait: ['Energy Charge', 'Right answers build Energy (3). At 3 you are Fully Charged: +30% damage. A wrong answer empties it.'],
  gauge: { name: 'Energy', max: 3 },
  mult: (c) => (c.me.g >= 3 ? 1.3 : 1),
  end: (c) => { c.me.g = c.power > 0 ? Math.min(3, c.me.g + 1) : 0; },
  skills: [atk('Nautilus Strike', 2, 1.7), atk('Lord of the Deep', 4, 3.4),
    { name: 'Time Leap', cd: 6, ph: 1, noReset: true, team: true, desc: () => "Every other skill of every player is ready again (not Time Leap, not 6-minute skills)",
      bot: (S, pid, x) => x.ids.reduce((n, id) => n + Object.entries(S.players[id].cd).filter(([k, v]) => v > 1 && k[0] !== '_').length, 0) >= Math.max(2, x.ids.length * 1.5),
      use: (c) => { for (const id of c.alive()) c.cdr(id, 99, 'time-leap'); return "turns back the clock: the party's skills are ready again"; } }] });

add('corsair', { name: 'Corsair', role: 'Damage / Gambler', hp: 1000, basic: 'Rapid Fire',
  trait: ['Scurvy Summons', 'Your crew keeps firing: 25% of your main attack every round, even when you answer wrong.'],
  after: (c) => { c.hit(0.25, { n: 'Crew', free: 1 }); },
  skills: [
    { name: 'Roll of the Dice', cd: 6, ph: 0, ai: 'always', desc: () => 'Roll a die. For 4 rounds: 1 nothing · 2 take 30% less damage · 3 heal 8% HP a round · 4 +15% damage · 5 +25% damage · 6 +40% damage',
      use: (c) => { const r = 1 + Math.floor(c.rand() * 6), f = [null, null, { taken: 0.7 }, { regen: 0.08 }, { dmg: 1.15 }, { dmg: 1.25 }, { dmg: 1.4 }][r];
        if (f) c.buff(c.pid, { k: 'dice', n: 4, name: 'Lucky Dice ' + r, ...f }); return `rolls a <b>${r}</b>: ${f ? R.h.buffWords(f) + ' for 4 rounds' : 'nothing…'}`; } },
    atk('Bullet Barrage', 4, 3.4), summon('Broadside', 4, 0.6, 3)] });

add('cannoneer', { name: 'Cannoneer', role: 'Damage / Gambler', hp: 1100, basic: 'Cannon Barrage',
  trait: ['Barrel Roulette', 'Every round a barrel rolls out, and you see it before you act: 🔴 +30% damage · 🟢 heal 8% HP · 🔵 take 30% less damage · ⚫ nothing.'],
  init: (p) => { p.v.barrel = Math.floor(Math.random() * 4); },
  start: (c) => { const r = c.me.v.barrel; if (r === 0) c.buff(c.pid, { k: 'barrel', n: 1, name: 'Red barrel', dmg: 1.3 }); if (r === 2) c.buff(c.pid, { k: 'barrel', n: 1, name: 'Blue barrel', taken: 0.7 }); },
  end: (c) => { if (c.me.v.barrel === 1) c.heal(c.pid, 0.08); c.me.v.barrel = Math.floor(c.rand() * 4); },
  status: (me) => 'Barrel: ' + ['🔴 +30% damage', '🟢 heal 8% HP', '🔵 30% less damage taken', '⚫ nothing'][me.v.barrel ?? 3],
  skills: [atk('The Nuclear Option', 6, 5.1), summon('Monkey Militia', 4, 0.6, 3), expose('Poolmaker', 3, 2, 1.1, 1.2)] });

add('jett', { name: 'Jett', role: 'Damage', hp: 1050, basic: 'Starforce Salvo',
  trait: ['Slipstream Suit', 'A flying start: while you are at full HP you deal +25% damage.'],
  mult: (c) => (c.me.hp >= c.me.maxHp ? 1.25 : 1),
  skills: [summon('Turret Deployment', 3, 0.5, 3),
    { name: 'Bionic Maximizer', cd: 4, ph: 1, ai: 'heal', desc: () => 'Heal 40% of your HP and take 30% less damage for 2 rounds', bot: (S, pid) => S.players[pid].hp < S.players[pid].maxHp * 0.6,
      use: (c) => { const h = c.heal(c.pid, 0.4); c.buff(c.pid, { k: 'bionic', n: 2, name: 'Bionic Maximizer', taken: 0.7 }); return `+${fmt(h)} HP, 30% less damage taken for 2 rounds`; } },
    atk('Suborbital Bombardier', 6, 5.1)] });

// ============================== Cygnus Knights ==============================
add('dawn-warrior', { name: 'Dawn Warrior', role: 'Damage (stances)', hp: 1150, basic: 'Luna Divide',
  trait: ['Equinox', 'Two stances; Equinox Cycle switches, any round. Falling Moon: +25% damage dealt, +20% taken. Rising Sun: 25% less damage taken, and right answers heal 4% HP.'],
  stances: { moon: 'Falling Moon', sun: 'Rising Sun' },
  mult: (c) => (c.me.st === 'moon' ? 1.25 : 1), taken: (c) => (c.me.st === 'moon' ? 1.2 : 0.75),
  after: (c) => { if (c.me.st === 'sun' && c.power > 0) c.heal(c.pid, 0.04); },
  skills: [
    { name: 'Equinox Cycle', cd: 0, ph: 0, ai: 'stance', desc: () => 'Switch between Falling Moon and Rising Sun',
      bot: (S, pid, x) => { const me = S.players[pid], want = hurtSoon(x, S, pid) > 0.4 || me.hp < me.maxHp * 0.45 ? 'sun' : 'moon'; return want !== me.st; },
      use: (c) => { c.me.st = c.me.st === 'moon' ? 'sun' : 'moon'; return `takes the ${c.C.stances[c.me.st]} stance`; } },
    self('Celestial Dance', 5, 3, { dmg: 1.35 }), atk('Soul Eclipse', 6, 5.1)] });

add('blaze-wizard', { name: 'Blaze Wizard', role: 'Damage / Support', hp: 850, basic: 'Orbital Flame',
  trait: ['Embers', 'Each right answer adds an Ember (max 6). Savage Flame burns them all at once: save up for a big one.'],
  gauge: { name: 'Embers', max: 6 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(6, c.me.g + 1); },
  skills: [
    { name: 'Savage Flame', cd: 2, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 0.4)} damage + ${dn(C, 0.55)} per Ember. Uses them all`, bot: (S, pid, x) => x.know && x.mv.k !== 'shield' && S.players[pid].g >= 4,
      use: (c) => { c.hit(0.4 + 0.55 * c.me.g, { n: 'Savage Flame' }); if (c.power > 0) c.me.g = 0; } },
    party('Burning Conduit', 4, 2, { dmg: 1.2 }), atk('Cataclysm', 3, 2.55)] });

add('wind-archer', { name: 'Wind Archer', role: 'Damage', hp: 950, basic: 'Song of Heaven',
  trait: ['Trifling Wind', 'Each right answer lets loose 3 spirit arrows: each has a 45% chance to hit for 25% of your main attack.'],
  after: (c) => { if (c.power > 0) { let n = 0; for (let i = 0; i < (c.hasBuff('merciless-winds') ? 6 : 3); i++) if (c.rand() < 0.45) n++; if (n) c.hit(0.25 * n, { n: 'Trifling Wind' }); } },
  skills: [atk('Howling Gale', 2, 1.7), self('Gale Barrier', 3, 2, { taken: 0.5 }, { ai: 'guard' }),
    atk('Merciless Winds', 4, 2.6, { note: 'Twice as many spirit arrows for 2 rounds', then: (c) => { c.buff(c.pid, { k: 'merciless-winds', n: 2, name: 'Merciless Winds' }); } })] });

add('night-walker', { name: 'Night Walker', role: 'Damage', hp: 950, basic: 'Quintuple Star',
  trait: ['Shadow Bats', 'Each right answer calls a bat (max 5). Every bat bites each round for 8% of your main attack, even when you answer wrong.'],
  gauge: { name: 'Bats', max: 5 },
  after: (c) => { if (c.me.g) c.hit(0.08 * c.me.g, { n: 'Shadow Bats', free: 1 }); if (c.power > 0) c.me.g = Math.min(5, c.me.g + 1); },
  skills: [
    { name: 'Shadow Bite', cd: 2, ph: 2, ai: 'burst', desc: (C) => `Your bats bite down: ${dn(C, 0.5)} damage + ${dn(C, 0.4)} per bat, then they are gone. +5% damage per bat for 2 rounds`, bot: (S, pid, x) => x.know && S.players[pid].g >= 3,
      use: (c) => { const n = c.me.g; c.hit(0.5 + 0.4 * n, { n: 'Shadow Bite' }); if (c.power > 0) { c.me.g = 0; if (n) c.buff(c.pid, { k: 'shadow-bite', n: 2, name: 'Shadow Bite', dmg: 1 + 0.05 * n }); } } },
    { name: 'Dominion', cd: 6, ph: 1, ai: 'iframe', desc: () => 'You take no damage this round (even from an ultimate) and deal +30% damage for 2 rounds',
      use: (c) => { c.iframe(c.pid); c.buff(c.pid, { k: 'dominion', n: 2, name: 'Dominion', dmg: 1.3 }); return 'melts into the dark: untouchable this round, +30% damage for 2 rounds'; } },
    atk('Rapid Throw', 3, 2.55)] });

add('thunder-breaker', { name: 'Thunder Breaker', role: 'Damage (streaks)', hp: 1050, basic: 'Annihilate',
  trait: ['Lightning Link', 'Right answers in a row chain your links: +12% damage per link (max 5). One wrong answer breaks the chain.'],
  gauge: { name: 'Links', max: 5 },
  mult: (c) => 1 + 0.12 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(5, c.me.g + 1) : 0; },
  skills: [atk('Deep Rising', 2, 1.7), atk('Lightning Cascade', 4, 3.4), self('Primal Bolt', 4, 2, { dmg: 1.25, ied: 0.6 })] });

add('mihile', { name: 'Mihile', role: 'Tank / Counter', hp: 1250, basic: 'Radiant Cross',
  trait: ['Royal Guard', 'Royal Guard blocks the boss’s hit and strikes back, if it attacks you that round. Each block adds a stack (max 5): +8% damage for the rest of the fight.'],
  gauge: { name: 'Guard', max: 5 },
  mult: (c) => 1 + 0.08 * c.me.g,
  hitBy: (c) => { if (!c.me.v.rg) return; c.me.v.rg = 0; c.me.g = Math.min(5, c.me.g + 1); const d = c.hit(1.5, { n: 'Royal Guard', free: 1 }); c.tell('boss', `🛡️ blocks with Royal Guard and strikes back for <b>${fmt(d)}</b>`, { k: 'dodge' }); return true; },
  end: (c) => { c.me.v.rg = 0; },
  skills: [
    { name: 'Royal Guard', cd: 3, ph: 1, ai: 'guard', desc: (C) => `If the boss hits you this round (not an ultimate): block it all and strike back for ${dn(C, 1.5)}. +1 Guard stack`,
      bot: (S, pid, x) => hurtSoon(x, S, pid) > 0, use: (c) => { c.me.v.rg = 1; return 'raises the shield'; } },
    party('Shield of Light', 6, 2, { taken: 0.4 }, { ai: 'guard' }), self('Roiling Soul', 4, 2, { dmg: 1.45 })] });

// ============================== Heroes ==============================
add('aran', { name: 'Aran', role: 'Damage (combo)', hp: 1200, basic: 'Beyond Blade',
  trait: ['Adrenaline Rush', 'Right answers build Combo: +1, or +2 in under 8 s (max 10). At 10 you go into Adrenaline Rush for 2 rounds: +60% damage. Then Combo starts over.'],
  gauge: { name: 'Combo', max: 10 },
  mult: (c) => (c.hasBuff('adrenaline') ? 1.6 : 1),
  end: (c) => { if (c.hasBuff('adrenaline')) return; if (c.power > 0) c.me.g = Math.min(10, c.me.g + (c.sec != null && c.sec < 8 ? 2 : 1));
    if (c.me.g >= 10) { c.me.g = 0; c.buff(c.pid, { k: 'adrenaline', n: 3, name: 'Adrenaline Rush' }); c.note('goes into <b>Adrenaline Rush</b>: +60% damage for 2 rounds'); } },
  skills: [expose('Blizzard Tempest', 4, 2, 1.1, 2.8),
    { name: 'Adrenaline Burst', cd: 8, ph: 0, ai: 'buff', desc: () => 'Go straight into Adrenaline Rush: +60% damage for 2 rounds', use: (c) => { c.me.g = 0; c.buff(c.pid, { k: 'adrenaline', n: 2, name: 'Adrenaline Rush' }); return 'goes straight into Adrenaline Rush'; } },
    party("Maha's Domain", 5, 2, { regen: 0.1, dmg: 1.1 })] });

add('evan', { name: 'Evan', role: 'Damage (dragon)', hp: 900, basic: 'Mana Burst',
  trait: ['Mir', 'Mir fights at your side: 25% of your main attack every round, even when you answer wrong. On rounds you use a class skill, Mir hits twice as hard.'],
  after: (c) => { c.hit(c.rc.casts.some((x) => x.c === c && !x.sk.common) ? 0.5 : 0.25, { n: 'Mir', free: 1 }); },
  skills: [atk('Elemental Barrage', 2, 1.7), summon('Summon Onyx Dragon', 3, 0.5, 3), atk('Zodiac Ray', 6, 5.1)] });

add('mercedes', { name: 'Mercedes', role: 'Damage (speed)', hp: 950, basic: "Ishtar's Ring",
  trait: ['Ignis Roar', 'Quick hands: a right answer in under 8 s adds a stack (max 5): +9% damage each. A wrong answer drops 2.'],
  gauge: { name: 'Ignis Roar', max: 5 },
  mult: (c) => 1 + 0.09 * c.me.g,
  end: (c) => { if (c.power > 0) { if (c.sec != null && c.sec < 8) c.me.g = Math.min(5, c.me.g + 1); } else c.me.g = Math.max(0, c.me.g - 2); },
  skills: [atk('Wrath of Enlil', 2, 1.7), self('Spirit of Elluel', 5, 2, { dmg: 1.6 }), self('Elvish Blessing', 8, 3, { dmg: 1.3, taken: 0.7 })] });

const CARDS = [['♠ Spade', { dmg: 1.3 }], ['♦ Diamond', { taken: 0.6 }], ['♥ Heart', { regen: 0.12 }]];
add('phantom', { name: 'Phantom', role: 'Trickster', hp: 950, basic: 'Tempest',
  trait: ['Skill Swipe', 'Impeccable Memory repeats the last class skill a teammate used, as if it were yours. Your cards are luck.'],
  skills: [
    { name: 'Judgment Draw', cd: 2, ph: 0, ai: 'always', desc: () => 'Draw a card, 2 rounds: ♠ +30% damage · ♦ take 40% less damage · ♥ heal 12% HP a round',
      use: (c) => { const [n, f] = CARDS[Math.floor(c.rand() * CARDS.length)]; c.buff(c.pid, { k: 'card', n: 2, name: n, ...f }); return `draws <b>${n}</b>: ${R.h.buffWords(f)} for 2 rounds`; } },
    { name: 'Impeccable Memory', cd: 3, ph: 1, ai: 'always', target: true, pickAlly: otherAlly, desc: (C) => `Use the last class skill one player used (alone: your own last one). Nothing to copy: ${dn(C, 1.5)} damage`,
      use: (c, t) => { const to = c.ally(t), p = c.S.players[to], sk = p.lastSkill && p.lastSkill !== 'impeccable-memory' ? R.skill(p.cls, p.lastSkill) : null;
        if (!sk || sk.cd >= 10 || sk.ai === 'stance') { c.hit(1.5, { n: 'Impeccable Memory' }); return ''; }
        let r = '';
        try { r = sk.use(c, sk.target ? c.pid : 0); } catch { c.hit(1.5, { n: 'Impeccable Memory' }); }
        c.me.g = 0; c.me.st = null;   // (the other class's gauge isn't yours)
        return `copies <b>${sk.name}</b>${to === c.pid ? '' : ` from {p:${to}}`}${typeof r === 'string' && r ? ': ' + r : ''}`; } },
    { name: 'Joker', cd: 5, ph: 2, ai: 'burst', team: true, desc: (C) => `${dn(C, 3)} damage, and the whole party draws a card for 2 rounds`,
      use: (c) => { c.hit(3, { n: 'Joker' }); const [n, f] = CARDS[Math.floor(c.rand() * CARDS.length)]; c.party({ k: 'card', n: 2, name: n, ...f }); c.note(`deals the party <b>${n}</b>: ${R.h.buffWords(f)} for 2 rounds`); } }] });

add('luminous', { name: 'Luminous', role: 'Damage (rhythm)', hp: 850, basic: 'Ender',
  trait: ['Equilibrium', 'Every 3rd right answer tips the balance: the next round you are in Equilibrium: +50% damage, and class skills you use then have no cooldown.'],
  gauge: { name: 'Balance', max: 3 },
  start: (c) => { c.me.v.eqNow = !!c.me.v.eq; if (c.me.v.eq) { c.me.v.eq = false; c.buff(c.pid, { k: 'equilibrium', n: 1, name: 'Equilibrium', dmg: 1.5 }); } },
  cast: (c, sk) => { if (c.me.v.eqNow && !sk.common && sk.cd < 10 && sk.key !== 'equalize') c.me.cd[sk.key] = 0; },
  end: (c) => { if (c.power > 0 && !c.me.v.eqNow && ++c.me.g >= 3) { c.me.g = 0; c.me.v.eq = true; c.note('reaches <b>Equilibrium</b>: next round +50% damage, no cooldowns'); } },
  status: (me) => (me.v.eq ? '⚖️ Equilibrium this round: +50% damage, no cooldowns' : null),
  skills: [atk('Baptism of Light and Darkness', 2, 1.7),
    { name: 'Armageddon', cd: 6, ph: 1, ai: 'bind', desc: (C) => `Bind the boss, and ${dn(C, 2)} damage`, use: (c) => { const r = c.bind(); c.hit(2, { n: 'Armageddon' }); return r; } },
    { name: 'Equalize', cd: 6, ph: 0, ai: 'buff', desc: () => 'Step into Equilibrium right now: +50% damage, and your other class skills have no cooldown this round',
      use: (c) => { c.me.v.eqNow = true; c.buff(c.pid, { k: 'equilibrium', n: 1, name: 'Equilibrium', dmg: 1.5 }); return 'steps into Equilibrium'; } }] });

add('shade', { name: 'Shade', role: 'Damage / Sustain', hp: 1100, basic: 'Spirit Claw',
  trait: ['Fox Spirits', 'Each right answer has a 40% chance to call a fox spirit: +50% of your main attack, and it heals you 5% HP.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.4) { c.hit(0.5, { n: 'Fox Spirits' }); c.heal(c.pid, 0.05); } },
  skills: [atk('Spirit Flow', 2, 1.7), summon('Spiritgate', 4, 0.6, 3),
    { name: 'Death Mark', cd: 3, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 2)} damage, and it heals you 25% HP`, use: (c) => { if (c.hit(2, { n: 'Death Mark' })) c.heal(c.pid, 0.25); } }] });

// ============================== Resistance and Demons ==============================
add('demon-slayer', { name: 'Demon Slayer', role: 'Damage / Debuff', hp: 1250, basic: 'Demon Impact',
  trait: ['Demon Fury', 'Each right answer builds 35 Fury (max 100). Your skills cost Fury: no Fury, no skills.'],
  gauge: { name: 'Fury', max: 100 }, init: (p) => { p.g = 50; },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(100, c.me.g + 35); },
  skills: [
    spend(30, 'Fury', { name: 'Demon Cry', cd: 2, ph: 1, ai: 'debuff', team: true, desc: () => 'For 2 rounds the boss takes +15% damage from everyone and hits 15% softer',
      use: (c) => { c.vuln('demon-cry', 1.15, 2, 'Demon Cry'); c.weaken('demon-cry', 0.85, 2, 'Demon Cry'); return 'the boss takes +15% damage and hits 15% softer for 2 rounds'; } }),
    spend(40, 'Fury', summon('Orthrus', 4, 0.65, 3)),
    spend(50, 'Fury', self('Demon Awakening', 4, 2, { dmg: 1.5 }))] });

add('demon-avenger', { name: 'Demon Avenger', role: 'Damage (HP)', hp: 1700, basic: 'Exceed: Execution',
  trait: ['Blood Contract', 'Your HP is your power: up to +40% damage the fuller it is. Each right answer heals 4% HP. Demonic Frenzy trades HP for damage.'],
  stances: { calm: 'Calm', frenzy: 'Demonic Frenzy' },
  mult: (c) => (1 + 0.4 * c.me.hp / c.me.maxHp) * (c.me.st === 'frenzy' ? 1.35 : 1),
  after: (c) => { if (c.power > 0) c.heal(c.pid, 0.04); },
  end: (c) => { if (c.me.st === 'frenzy') c.pay(0.08); },
  skills: [
    { name: 'Demonic Frenzy', cd: 0, ph: 0, ai: 'stance', desc: () => 'On / off. While on: +35% damage, but you lose 8% HP every round',
      bot: (S, pid, x) => { const me = S.players[pid], want = me.hp > me.maxHp * 0.6 && hurtSoon(x, S, pid) < 0.4 ? 'frenzy' : 'calm'; return want !== me.st; },
      use: (c) => { c.me.st = c.me.st === 'frenzy' ? 'calm' : 'frenzy'; return c.me.st === 'frenzy' ? 'lets the frenzy in: +35% damage, -8% HP a round' : 'calms down'; } },
    { name: 'Blood Feast', cd: 4, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 3.2)} damage, and it heals you 30% HP`, use: (c) => { if (c.hit(3.2, { n: 'Blood Feast' })) c.heal(c.pid, 0.3); } },
    summon('Dimensional Sword', 4, 0.6, 3)] });

add('battle-mage', { name: 'Battle Mage', role: 'Support (auras)', hp: 1000, atkBase: 0.9, basic: 'Finishing Blow',
  trait: ['Auras', 'Your aura covers the whole party; Dark Aura (the skill) changes it, any round. Dark: +12% damage. Blue: 18% less damage taken. Draining: everyone heals 4% HP a round.'],
  stances: { dark: 'Dark Aura', blue: 'Blue Aura', drain: 'Draining Aura' },
  aura: (c) => { const st = c.me.st; c.party({ k: 'bam-aura', n: 1, name: c.C.stances[st], ...(st === 'dark' ? { dmg: 1.12 } : st === 'blue' ? { taken: 0.82 } : { regen: 0.04 }) }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Dark Aura', cd: 0, ph: 0, ai: 'stance', options: ['Dark Aura: party +12% damage', 'Blue Aura: party takes 18% less damage', 'Draining Aura: party heals 4% HP a round'], desc: () => 'Change your aura (it covers the whole party)',
      bot: (S, pid, x) => { const hurt = x.ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.5).length, want = hurtSoon(x, S, pid) > 0.4 ? 'blue' : hurt ? 'drain' : 'dark'; return want !== S.players[pid].st ? ['dark', 'blue', 'drain'].indexOf(want) : null; },
      use: (c, i) => { c.me.st = ['dark', 'blue', 'drain'][+i] || 'dark'; c.C.aura(c); return `spreads ${c.C.stances[c.me.st]}`; } },
    atk('Dark Genesis', 2, 1.7), summon('Grim Harvest', 4, 0.6, 3)] });

add('wild-hunter', { name: 'Wild Hunter', role: 'Damage (jaguar)', hp: 1000, basic: 'Wild Arrow Blast',
  trait: ['Jaguar', 'Your jaguar bites every round for 30% of your main attack, even when you answer wrong.'],
  after: (c) => { c.hit(c.hasBuff('feline-berserk') ? 0.6 : 0.3, { n: 'Jaguar', free: 1 }); },
  skills: [self('Feline Berserk', 4, 2, { dmg: 1.3 }, { note: 'Your jaguar bites twice as hard' }), summon('Jaguar Storm', 5, 0.7, 3), atk("Nature's Truth", 12, 10)] });

add('mechanic', { name: 'Mechanic', role: 'Summoner / Support', hp: 1050, atkBase: 0.85, basic: 'Homing Beacon', summonPlus: 1,
  trait: ['Robot Mastery', 'Your robots stay 1 round longer, and Support Unit: H-EX heals the whole party 3% HP at the end of every round.'],
  end: (c) => { for (const id of c.alive()) c.heal(id, 0.03); },
  skills: [summon("Rock 'n Shock", 2, 0.35, 2), summon('Multiple Option: M-FL', 7, 0.9, 4), expose('Distortion Bomb', 3, 2, 1.12, 1)] });

add('xenon', { name: 'Xenon', role: 'Damage / Support', hp: 1050, basic: 'Mecha Purge: Snipe',
  trait: ['Supply Surplus', 'You gain 1 Surplus Energy every round (max 5): +5% damage each. Your skills spend it.'],
  gauge: { name: 'Surplus', max: 5 }, init: (p) => { p.g = 2; },
  mult: (c) => 1 + 0.05 * c.me.g,
  end: (c) => { c.me.g = Math.min(5, c.me.g + 1); },
  skills: [spend(2, 'Surplus', atk('Orbital Cataclysm', 2, 2.3)), spend(2, 'Surplus', party('Hypogram Field: Support', 4, 2, { dmg: 1.15, regen: 0.05 })),
    { name: 'Amaranth Generator', cd: 3, ph: 0, ai: 'always', bot: (S, pid) => S.players[pid].g <= 2, desc: () => 'Fill your Surplus Energy to 5', use: (c) => { c.me.g = 5; return 'tops up to 5 Surplus Energy'; } }] });

add('blaster', { name: 'Blaster', role: 'Damage / Tank', hp: 1250, basic: 'Magnum Punch',
  trait: ['Revolving Cannon', '6 bullets. Each right answer fires one for +15% damage. Empty cylinder: that round you reload instead (a weak hit).'],
  gauge: { name: 'Bullets', max: 6 }, init: (p) => { p.g = 6; },
  basicHit: (c) => { if (c.me.g > 0) { c.me.g--; c.hit(1.15, { n: 'Magnum Punch' }); } else { c.me.g = 6; c.hit(0.6, { n: 'Reload' }); } },
  skills: [
    { name: 'Bunker Buster', cd: 2, ph: 2, ai: 'burst', desc: (C) => `Fire every bullet you have left: ${dn(C, 0.55)} damage each`, bot: (S, pid, x) => x.know && S.players[pid].g >= 3 && x.mv.k !== 'shield',
      use: (c) => { c.hit(0.55 * c.me.g, { n: 'Bunker Buster' }); if (c.power > 0) c.me.g = 0; } },
    { name: 'Vitality Shield', cd: 2, ph: 1, ai: 'guard', desc: () => 'Take 60% less damage this round, and reload to 6 bullets',
      use: (c) => { c.buff(c.pid, { k: 'vitality-shield', n: 1, name: 'Vitality Shield', taken: 0.4 }); c.me.g = 6; return 'braces: 60% less damage this round, cylinder reloaded'; } },
    { name: 'Burning Breaker', cd: 3, ph: 1, ai: 'iframe', desc: (C) => `You take no damage this round (even from an ultimate), and ${dn(C, 2.4)} damage`,
      bot: (S, pid, x) => x.mv.k === 'ult' || (x.know && x.mv.k !== 'shield' && x.mv.k !== 'charge'),
      use: (c) => { c.iframe(c.pid); c.hit(2.4, { n: 'Burning Breaker' }); return 'charges up, untouchable'; } }] });

// ============================== Sengoku ==============================
add('hayato', { name: 'Hayato', role: 'Damage / Counter', hp: 1150, basic: 'Rai Sanrenzan',
  trait: ['Willow Dodge', '30% chance to dodge any hit (not an ultimate) and strike back for 80% of your main attack.'],
  hitBy: (c) => { if (c.rand() < 0.3) { const d = c.hit(0.8, { n: 'Counter', free: 1 }); c.tell('boss', `💨 dodges and counters for <b>${fmt(d)}</b>`, { k: 'dodge' }); return true; } },
  skills: [atk('Hitokiri Strike', 2, 1.7), atk('Iaijutsu Phantom Blade', 4, 3.4), self('God of Blades', 8, 3, { dmg: 1.3, taken: 0.7 })] });

add('kanna', { name: 'Kanna', role: 'Support / Summoner', hp: 900, atkBase: 0.85, basic: "Vanquisher's Charm",
  trait: ['Haku', 'Haku watches over the party: at the end of every round the most hurt player heals 6% HP.'],
  end: (c) => { const t = lowest(c); if (t) c.heal(t, 0.06); },
  skills: [summon('Kishin Shoukan', 3, 0.5, 3), party('Bellflower Barrier', 6, 2, { dmg: 1.25 }),
    atk('Nine-Tailed Fury', 4, 2.6, { team: true, note: 'Party +10% damage for 2 rounds', then: (c) => { c.party({ k: 'nine-tailed-fury', n: 2, name: 'Nine-Tailed Fury', dmg: 1.1 }); } })] });

// ============================== Nova ==============================
add('kaiser', { name: 'Kaiser', role: 'Damage / Tank', hp: 1300, basic: 'Gigas Wave',
  trait: ['Final Form', 'Right answers fill the Morph Gauge (4). When it is full you take Final Form for 3 rounds: +40% damage, 30% less damage taken. Then it starts over.'],
  gauge: { name: 'Morph', max: 4 },
  end: (c) => { if (c.hasBuff('final-form')) return; if (c.power > 0 && ++c.me.g >= 4) { c.me.g = 0; c.buff(c.pid, { k: 'final-form', n: 4, name: 'Final Form', dmg: 1.4, taken: 0.7 }); c.note('takes <b>Final Form</b> for 3 rounds'); } },
  skills: [atk('Tempest Blades', 2, 1.7),
    { name: 'Dragon Blaze', cd: 4, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 3)} damage (${dn(C, 4)} in Final Form)`, use: (c) => { c.hit(c.hasBuff('final-form') ? 4 : 3, { n: 'Dragon Blaze' }); } },
    { name: 'Final Trance', cd: 10, ph: 0, ai: 'buff', desc: () => 'Take Final Form right now, for 3 rounds', use: (c) => { c.me.g = 0; c.buff(c.pid, { k: 'final-form', n: 3, name: 'Final Form', dmg: 1.4, taken: 0.7 }); return 'takes Final Form'; } }] });

const possess = (name, cd, mult, more) => ({ name, cd, ph: 2, ai: 'burst', desc: (C) => `${dn(C, mult)} damage${more ? '. ' + more.note : ''}`,
  use: (c) => { const p = c.me.g > 0; if (p) { c.me.g--; c.heal(c.pid, 0.08); } c.hit(mult * (p ? 1.5 : 1), { n: (p ? '[Possess] ' : '') + name }); return more?.then(c); } });
add('kain', { name: 'Kain', role: 'Damage / Sustain', hp: 1000, basic: 'Falling Dust',
  trait: ['Possession', 'Each right answer gathers a Malice stone (max 3). An attack skill used with Malice is Possessed: it spends 1 stone, hits 50% harder and heals you 8% HP.'],
  gauge: { name: 'Malice', max: 3 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(3, c.me.g + 1); },
  skills: [possess('Scattering Shot', 2, 1.6),
    possess('Grip of Agony', 3, 2.1, { note: 'The boss hits 15% softer for 2 rounds', then: (c) => { c.weaken('grip', 0.85, 2, 'Grip of Agony'); } }),
    self('Thanatos Descent', 6, 2, { dmg: 1.4 }, { note: 'Malice to 3', then: (c) => { c.me.g = 3; } })] });

add('cadena', { name: 'Cadena', role: 'Damage (variety)', hp: 1000, basic: 'Chain Arts: Thrash',
  trait: ['Weapon Variety', 'Use a different class skill than the last one you used and you gain a stack (max 6): +7% damage each. A round with no class skill, or the same one again, loses a stack.'],
  gauge: { name: 'Variety', max: 6 },
  mult: (c) => 1 + 0.07 * c.me.g,
  cast: (c, sk) => { if (!sk.common) c.me.v.now = sk.key; },
  end: (c) => { const now = c.me.v.now; if (now && now !== c.me.v.prev) c.me.g = Math.min(6, c.me.g + 1); else c.me.g = Math.max(0, c.me.g - 1); if (now) c.me.v.prev = now; c.me.v.now = null; },
  skills: [atk('Summon Shotgun', 2, 1.5), expose('Summon Spiked Bat', 3, 2, 1.08, 1.6), atk('Chain Arts: Void Strike', 4, 3.2)] });

add('angelic-buster', { name: 'Angelic Buster', role: 'Damage / Support', hp: 950, basic: 'Trinity',
  trait: ['Soul Recharge', 'After you use a class skill there is a 40% chance it recharges on the spot: no cooldown.'],
  cast: (c, sk) => { if (!sk.common && sk.cd < 10 && c.rand() < 0.4) { c.me.cd[sk.key] = 0; c.note(`<b>Recharge!</b> ${sk.name} is ready again`); } },
  skills: [atk('Supreme Supernova', 2, 1.7), expose('Finale Ribbon', 3, 2, 1.18, 1),
    atk('Grand Finale', 12, 8, { team: true, note: 'Party +20% damage for 2 rounds', then: (c) => { c.party({ k: 'grand-finale', n: 2, name: 'Grand Finale', dmg: 1.2 }); } })] });

// ============================== Others ==============================
add('zero', { name: 'Zero', role: 'Damage / Support', hp: 1150, basic: 'Giga Crash',
  trait: ['Tag', 'Alpha and Beta take turns, a round each. Alpha: right answers in under 8 s deal +30%. Beta: +15% damage and 20% less damage taken.'],
  stances: { alpha: 'Alpha', beta: 'Beta' },
  mult: (c, o) => (c.me.st === 'alpha' ? (o.free == null && c.sec != null && c.sec < 8 ? 1.3 : 1) : 1.15),
  taken: (c) => (c.me.st === 'beta' ? 0.8 : 1),
  end: (c) => { c.me.st = c.me.st === 'alpha' ? 'beta' : 'alpha'; },
  skills: [
    { name: 'Time Holding', cd: 6, ph: 1, ai: 'partyiframe', noReset: true, team: true, desc: () => 'Time stops: the whole party takes no damage this round (even from an ultimate), and everyone’s other cooldowns drop by 2',
      use: (c) => { for (const id of c.alive()) { c.iframe(id); c.cdr(id, 2, 'time-holding'); } return 'stops time: the party is untouchable this round, cooldowns -2'; } },
    { name: 'Time Distortion', cd: 5, ph: 1, ai: 'dispel', team: true, desc: () => "Tears away the boss's shield or heal this round, and it takes +20% damage from everyone for 2 rounds",
      bot: (S, pid, x) => x.mv.k === 'shield' || x.mv.k === 'heal' || (x.know && x.mv.k === 'tired'),
      use: (c) => { c.dispel(); c.vuln('time-distortion', 1.2, 2, 'Time Distortion'); return 'bends time: the boss takes +20% damage for 2 rounds'; } },
    atk('Shadow Rain', 10, 8.5)] });

add('kinesis', { name: 'Kinesis', role: 'Damage / Control', hp: 850, basic: 'Kinetic Combo',
  trait: ['Psychic Points', 'Each right answer restores 2 PP (max 10). Ultimates cost PP.'],
  gauge: { name: 'PP', max: 10 }, init: (p) => { p.g = 5; },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(10, c.me.g + 2); },
  skills: [spend(4, 'PP', atk('Ultimate - Trainwreck', 2, 2.3)),
    spend(4, 'PP', { name: 'Ultimate - Deep Impact', cd: 3, ph: 1, ai: 'dispel', desc: (C) => `Tears away the boss's shield or heal this round, and ${dn(C, 1.6)} damage`,
      bot: (S, pid, x) => x.mv.k === 'shield' || x.mv.k === 'heal', use: (c) => { c.dispel(); c.hit(1.6, { n: 'Ultimate - Deep Impact' }); return "tears the boss's defenses away"; } }),
    self('Mental Tempest', 4, 2, { dmg: 1.25 }, { note: 'PP to 10', then: (c) => { c.me.g = 10; } })] });

add('adele', { name: 'Adele', role: 'Damage', hp: 1150, basic: 'Cleave',
  trait: ['Aether Swords', 'Each right answer forges an Aether Sword (max 6): +5% damage each, and they never break.'],
  gauge: { name: 'Swords', max: 6 },
  mult: (c) => 1 + 0.05 * c.me.g,
  end: (c) => { if (c.power > 0) c.me.g = Math.min(6, c.me.g + 1); },
  skills: [atk('Ruin', 2, 1.7), summon('Storm', 3, 0.6, 2), atk('Infinity Blade', 6, 5.1)] });

add('illium', { name: 'Illium', role: 'Damage / Support', hp: 850, basic: 'Radiant Javelin',
  trait: ['Crystal Charge', 'Right answers charge the Crystal (5). Full: Glory Wings for 2 rounds: +45% damage. Then it starts over.'],
  gauge: { name: 'Crystal', max: 5 },
  end: (c) => { if (c.hasBuff('glory-wings')) return; if (c.power > 0 && ++c.me.g >= 5) { c.me.g = 0; c.buff(c.pid, { k: 'glory-wings', n: 3, name: 'Glory Wings', dmg: 1.45 }); c.note('spreads <b>Glory Wings</b>: +45% damage for 2 rounds'); } },
  skills: [summon('Templar Knight', 4, 0.6, 3),
    { name: 'Longinus Zone', cd: 6, ph: 1, ai: 'partyiframe', team: true, desc: () => 'The whole party takes no damage this round, even from an ultimate',
      use: (c) => { for (const id of c.alive()) c.iframe(id); return 'opens a safe zone: the party is untouchable this round'; } },
    atk('Crystal Ignition', 6, 5.1)] });

add('khali', { name: 'Khali', role: 'Damage (speed)', hp: 950, basic: 'Arts: Flurry',
  trait: ['Chakrams', 'Fast and precise: a right answer in under 10 s throws a chakram for +35% of your main attack; under 5 s, two.'],
  after: (c) => { if (c.power > 0 && c.sec != null && c.sec < 10) c.hit(0.35 * (c.sec < 5 ? 2 : 1), { n: 'Chakram' }); },
  skills: [atk('Hex: Pandemonium', 2, 1.7), atk('Arts: Astra', 3, 2.55), self('Oblivion', 6, 2, { dmg: 1.2, taken: 0.5 }, { ai: 'guard' })] });

add('ark', { name: 'Ark', role: 'Damage (forms)', hp: 1100, basic: 'Basic Charge Drive',
  trait: ['Specter State', 'Right answers in Flora form fill the Spell Gauge (4). Specter State spends 1 a round: +40% damage, and right answers heal 5% HP. Empty: back to Flora.'],
  gauge: { name: 'Spell', max: 4 }, stances: { flora: 'Flora', specter: 'Specter' },
  mult: (c) => (c.me.st === 'specter' ? 1.4 : 1),
  after: (c) => { if (c.me.st === 'specter' && c.power > 0) c.heal(c.pid, 0.05); },
  end: (c) => { if (c.me.st === 'specter') { if (--c.me.g <= 0) { c.me.g = 0; c.me.st = 'flora'; c.note('falls back to Flora form'); } } else if (c.power > 0) c.me.g = Math.min(4, c.me.g + 1); },
  skills: [
    { name: 'Specter State', cd: 0, ph: 0, ai: 'stance', ok: (me) => me.st === 'specter' || me.g >= 2, desc: () => 'On / off (needs 2 Spell Gauge to turn on). While on: +40% damage, right answers heal 5% HP, 1 gauge a round',
      bot: (S, pid, x) => { const me = S.players[pid]; return me.st === 'flora' && me.g >= 3 && x.mv.k !== 'shield'; },
      use: (c) => { c.me.st = c.me.st === 'specter' ? 'flora' : 'specter'; return c.me.st === 'specter' ? 'lets the Specter out' : 'returns to Flora form'; } },
    atk('Endlessly Starving Beast', 4, 3.4),
    { name: 'Endless Agony', cd: 6, ph: 1, ai: 'iframe', desc: (C) => `You take no damage this round (even from an ultimate), and ${dn(C, 2.6)} damage`,
      bot: (S, pid, x) => x.mv.k === 'ult', use: (c) => { c.iframe(c.pid); c.hit(2.6, { n: 'Endless Agony' }); return 'is untouchable this round'; } }] });

add('lara', { name: 'Lara', role: 'Support (veins)', hp: 850, atkBase: 0.9, basic: 'Essence Sprinkle',
  trait: ['Dragon Vein', 'Manifestation lays a vein under the party, your pick: wind (damage), sun (healing) or river (the boss is exposed).'],
  skills: [
    { name: 'Manifestation: Wind Swing', cd: 3, ph: 0, ai: 'always', team: true, options: ['Wind Swing: party +15% damage', 'Sunlit Grain: party heals 8% HP a round', 'River Puddle Douse: the boss takes +12% damage'], desc: () => 'For 3 rounds, your pick: party +15% damage · party heals 8% HP a round · the boss takes +12% damage from everyone',
      pickOption: (S, pid, x) => (x.ids.some((id) => S.players[id].hp < S.players[id].maxHp * 0.5) ? 1 : x.ids.length > 2 ? 2 : 0),
      use: (c, i) => { i = +i || 0; if (i === 0) c.party({ k: 'vein', n: 3, name: 'Wind Swing', dmg: 1.15 }); else if (i === 1) c.party({ k: 'vein', n: 3, name: 'Sunlit Grain', regen: 0.08 }); else c.vuln('vein', 1.12, 3, 'River Puddle Douse');
        return ['a wind vein: party +15% damage for 3 rounds', 'a sun vein: party heals 8% HP a round for 3 rounds', 'a river vein: the boss takes +12% damage for 3 rounds'][i]; } },
    atk('Surging Essence', 4, 3.4), summon('Sunrise Well', 4, 0.6, 3)] });

add('hoyoung', { name: 'Hoyoung', role: 'Damage (rhythm)', hp: 950, basic: 'Heaven: Iron Fan Gale',
  trait: ['Heaven, Earth, Humanity', 'Your right answers cycle the three attributes. Every 3rd one finishes the cycle: your Clone joins you next round, +50% damage.'],
  gauge: { name: 'Attributes', max: 3 },
  end: (c) => { if (c.power > 0 && ++c.me.g >= 3) { c.me.g = 0; c.buff(c.pid, { k: 'clone', n: 2, name: 'Talisman: Clone', dmg: 1.5 }); c.note('finishes the cycle: <b>Clone</b> next round, +50% damage'); } },
  status: (me) => (me.buffs.some((f) => f.k === 'clone') ? '👥 Clone is with you this round: +50% damage' : null),
  skills: [atk('Scroll: Star Vortex', 2, 1.7),
    { name: 'Dream of Shangri-La', cd: 6, ph: 1, ai: 'iframe', desc: (C) => `You take no damage this round (even from an ultimate), and ${dn(C, 2.2)} damage`,
      bot: (S, pid, x) => x.mv.k === 'ult', use: (c) => { c.iframe(c.pid); c.hit(2.2, { n: 'Dream of Shangri-La' }); return 'drifts out of reach'; } },
    atk('Sage: Wrath of Gods', 7, 5.9)] });

add('lynn', { name: 'Lynn', role: 'Healer / Support', hp: 900, basic: 'Strike',
  trait: ['Spirit Guides', 'Your beasts join in on their own: 45% of your main attack every round, even when you answer wrong.'],
  after: (c) => { c.hit(0.45, { n: 'Sneak Attack', free: 1 }); },
  skills: [
    { name: '[Focus] Heal', cd: 2, ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 25% HP', use: (c) => `heals the party for ${fmt(c.healAll(0.25))} HP` },
    ally('[Focus] Awaken', 4, 2, { dmg: 1.6, ied: 1 }, { pickAlly: otherAlly }),
    { name: '[Focus] Forest Protection', cd: 6, ph: 1, ai: 'protect', target: true, pickAlly: lowestOf, desc: () => 'One player takes no damage this round (even from an ultimate) and heals 20% HP',
      bot: (S, pid, x) => (x.mv.k === 'ult' || (x.mv.k === 'focus' && S.players[x.mv.pid]?.hp <= x.mv.dmg) ? (x.mv.k === 'focus' ? x.mv.pid : lowestOf(S, pid, x.ids.filter((id) => id !== pid).length ? x.ids.filter((id) => id !== pid) : x.ids)) : null),
      use: (c, t) => { const to = c.ally(t); c.iframe(to); c.heal(to, 0.2); return `shelters {p:${to}}: untouchable this round`; } }] });

add('mo-xuan', { name: 'Mo Xuan', role: 'Damage (links)', hp: 1100, basic: 'Xuanshan Arts [Tian]',
  trait: ['Divine Fist', 'Link your forms into arts: every round you use a class skill adds a Divine Fist stack (max 5): +8% damage each. A round without one loses a stack.'],
  gauge: { name: 'Divine Fist', max: 5 },
  mult: (c) => 1 + 0.08 * c.me.g,
  cast: (c, sk) => { if (!sk.common) c.me.v.used = true; },
  end: (c) => { c.me.g = c.me.v.used ? Math.min(5, c.me.g + 1) : Math.max(0, c.me.g - 1); c.me.v.used = false; },
  skills: [atk('Divine Art: Howling Storm', 2, 1.6),
    { name: 'Soul Art: Beneath Heaven', cd: 4, ph: 1, ai: 'iframe', desc: (C) => `You take no damage this round (even from an ultimate), and ${dn(C, 2.4)} damage`,
      bot: (S, pid, x) => x.mv.k === 'ult' || (x.know && x.mv.k === 'tired'), use: (c) => { c.iframe(c.pid); c.hit(2.4, { n: 'Soul Art: Beneath Heaven' }); return 'is untouchable this round'; } },
    self('Soul Art: The Opened Gate', 6, 2, { dmg: 1.5 })] });

add('sia-astelle', { name: 'Sia Astelle', role: 'Summoner', hp: 850, atkBase: 0.9, basic: 'Boom',
  trait: ['Starlight Link', 'The stars fight with you: every summon you have out adds +12% to your own damage.'],
  mult: (c, o) => (o.free == null ? 1 + 0.12 * c.me.sum.length : 1),
  skills: [summon('Stellar VI - Izar', 3, 0.45, 3), summon('Stellar XI - Sirius', 4, 0.6, 3), self('Appear', 4, 2, { dmg: 1.4 })] });

add('ren', { name: 'Ren', role: 'Damage / Guard', hp: 1150, basic: 'Plum Blossom Sword: Storm',
  trait: ['Wish Unending', 'Your sword forms follow one another: every 4th right answer ends in a Final Imugi technique, a bonus hit worth 200% of your main attack.'],
  gauge: { name: 'Forms', max: 4 },
  after: (c) => { if (c.power > 0 && ++c.me.g >= 4) { c.me.g = 0; c.hit(2, { n: 'Final Imugi Spirit Sword' }); } },
  skills: [
    { name: 'Final Plum Blossom Sword: Dancing Annihilation', short: 'Dancing Annihilation', cd: 4, ph: 1, ai: 'burst', desc: (C) => `${dn(C, 3)} damage, and you take 50% less damage this round`,
      use: (c) => { c.buff(c.pid, { k: 'dancing', n: 1, name: 'Dancing Annihilation', taken: 0.5 }); c.hit(3, { n: 'Dancing Annihilation' }); return ''; } },
    { name: 'Fourth Plum Blossom Sword: Unbowed Blade', short: 'Unbowed Blade', cd: 3, ph: 1, ai: 'iframe', desc: () => 'You take no damage this round, even from an ultimate', use: (c) => { c.iframe(c.pid); return 'stands unbowed: untouchable this round'; } },
    { ...summon('Final Plum Blossom Sword: Thousand Blossom Flurry', 4, 0.6, 3), short: 'Thousand Blossom Flurry' }] });

add('erel-light', { name: 'Erel Light', role: 'Damage / Guard', hp: 1200, basic: 'Spear of Lugh', summonPlus: 1,
  trait: ['Shining Sentinels', 'The sentinels you call stay 1 round longer, and while one is out you take 20% less damage.'],
  taken: (c) => (c.me.sum.length ? 0.8 : 1),
  skills: [summon('Fury of Roan', 2, 0.55, 1),
    { name: 'Shield of Chulainn', cd: 6, ph: 1, ai: 'iframe', desc: () => 'You take no damage this round (even from an ultimate), and 50% less next round',
      use: (c) => { c.iframe(c.pid); c.buff(c.pid, { k: 'chulainn', n: 2, name: 'Shield of Chulainn', taken: 0.5 }); return 'raises the Shield of Chulainn: untouchable this round'; } },
    self('Helian Blessing', 4, 2, { dmg: 1.45 })] });

add('lethe', { name: 'Lethe', role: 'Summoner / Control', hp: 900, basic: 'Inscribe',
  trait: ['Covenant', 'A pact with your summons: while one is out, your own attacks deal +25% damage.'],
  mult: (c, o) => (o.free == null && c.me.sum.length ? 1.25 : 1),
  skills: [summon('Beckon: Dread Knight', 3, 0.5, 3),
    { name: 'Nullification', cd: 4, ph: 1, ai: 'bind', desc: () => 'Bind the boss: it skips its move this round (an ultimate can’t be bound)', use: (c) => c.bind() },
    self('Demonic Wroth', 4, 2, { dmg: 1.4 })] });

add('beast-tamer', { name: 'Beast Tamer', role: 'Support (animals)', hp: 950, atkBase: 0.9, basic: 'Furious Strikes',
  trait: ['Critters', 'Pick your animal with Critter Select, any round. Bear: you deal +25% damage. Snow Leopard: answers under 8 s deal +45%. Hawk: whole party +10% damage. Cat: whole party heals 5% HP a round.'],
  stances: { bear: 'Bear', leopard: 'Snow Leopard', hawk: 'Hawk', cat: 'Cat' },
  mult: (c, o) => (c.me.st === 'bear' ? 1.25 : c.me.st === 'leopard' && o.free == null && c.sec != null && c.sec < 8 ? 1.45 : 1),
  aura: (c) => { const st = c.me.st; for (const id of c.alive()) c.S.players[id].buffs = c.S.players[id].buffs.filter((f) => f.k !== 'critter'); if (st === 'hawk') c.party({ k: 'critter', n: 1, name: 'Hawk', dmg: 1.1 }); if (st === 'cat') c.party({ k: 'critter', n: 1, name: 'Cat', regen: 0.05 }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Critter Select', cd: 0, ph: 0, ai: 'stance', options: ['Bear: you deal +25% damage', 'Snow Leopard: answers under 8 s deal +45%', 'Hawk: party +10% damage', 'Cat: party heals 5% HP a round'], desc: () => 'Change your animal',
      bot: (S, pid, x) => { const hurt = x.ids.some((id) => S.players[id].hp < S.players[id].maxHp * 0.5), want = hurt ? 'cat' : x.ids.length >= 3 ? 'hawk' : 'bear'; return want !== S.players[pid].st ? ['bear', 'leopard', 'hawk', 'cat'].indexOf(want) : null; },
      use: (c, i) => { c.me.st = ['bear', 'leopard', 'hawk', 'cat'][+i] || 'bear'; c.C.aura(c); return `calls the ${c.C.stances[c.me.st]}`; } },
    { name: 'Meow Card', cd: 2, ph: 0, ai: 'always', team: true, desc: () => 'A random card for the whole party, 2 rounds: 🔴 +15% damage · 🔵 take 20% less damage · 🟢 heal 6% HP a round · 🟡 all three',
      use: (c) => { const r = c.rand(), k = r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3, f = [{ dmg: 1.15 }, { taken: 0.8 }, { regen: 0.06 }, { dmg: 1.15, taken: 0.8, regen: 0.06 }][k];
        c.party({ k: 'meow-card', n: 2, name: 'Meow Card', ...f }); return `deals a ${['🔴 red', '🔵 blue', '🟢 green', '🟡 gold'][k]} card: party ${R.h.buffWords(f)} for 2 rounds`; } },
    atk('Champ Charge', 2, 1.7)] });
})(typeof window !== 'undefined' ? window.MapleRaid : require('./raid.js'));

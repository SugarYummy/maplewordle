// Boss Raid: every class's kit (the rules are in raid.js). A class = its main bossing attack (free, every round you
// answer right), one trait that makes it play its own way, three or four of its real skills, and its Origin skill.
// Skill names, cooldowns and durations are the game's (GMS, from grandislibrary.com's class pages, Nov 2026):
// cd(seconds) and du(seconds) turn them into rounds at 30 s a round (2 minutes = 4 rounds; never under 2 / 1).
// Damage numbers are multiples of the class's main attack. Two things are set by tools/raid-sim.js so that the classes
// stand to each other the way they do in the game's own damage charts (CHART below): TUNE = how hard a class hits
// over a whole fight, ORIGIN = how much of that comes from its Origin burst.
(function (R) {
'use strict';
const { atk, summon, self, party, ally, expose, dn, pct, fmt } = R.h;
const A = 10000;   // a main attack at 100% Power, before tuning
const cd = (sec) => Math.max(2, Math.round(sec / R.RULES.cdSeconds));
const du = (sec) => Math.max(1, Math.round(sec / R.RULES.cdSeconds));

// The damage charts the balance follows: [sustained damage, % over the lowest class; share of a 5m40s fight's damage
// dealt in the 20 s Origin burst, %]. GMS chart (the owner's, Nov 2026) where the class is on it; the others are
// placed by their rank on the KMS chart (tools/raid-sim.js chart).
const CHART = {
  'kanna': [51.8, 25.3], 'erel-light': [39.0, 21.7], 'mo-xuan': [38.6, 17.1], 'cadena': [34.7, 22.4], 'xenon': [31.3, 19.3], 'zero': [31.3, 13.0],
  'sia-astelle': [28.6, 17.5], 'kain': [26.8, 21.1], 'mercedes': [26.2, 19.7], 'hero': [25.2, 18.8], 'hayato': [25.1, 32.6], 'marksman': [25.1, 15.8],
  'night-lord': [20.0, 20.1], 'ark': [19.4, 18.9], 'adele': [19.2, 17.7], 'hoyoung': [18.9, 18.7], 'aran': [18.7, 20.5], 'lynn': [14.5, 16.6],
  'night-walker': [18.3, 19.4], 'demon-slayer': [17.8, 22.3], 'corsair': [17.1, 16.6], 'kinesis': [16.3, 19.1], 'arch-mage-i-l': [15.9, 18.1],
  'shade': [15.2, 18.8], 'bishop': [14.1, 18.1], 'ren': [12.0, 18.2], 'battle-mage': [11.8, 18.3], 'evan': [10.7, 14.3], 'wild-hunter': [6.1, 20.6],
  'bow-master': [5.9, 20.5], 'wind-archer': [5.7, 22.2], 'mechanic': [0.0, 16.0],
};
R.CHART = CHART;
// From tools/raid-sim.js chart --write
const TUNE = { 'hero': 0.812, 'paladin': 1.629, 'dark-knight': 0.993, 'bishop': 1.133, 'arch-mage-i-l': 0.950, 'arch-mage-f-p': 0.805, 'dual-blade': 0.866, 'shadower': 0.904, 'night-lord': 0.901, 'pathfinder': 1.476, 'marksman': 0.863, 'bow-master': 1.123, 'cannoneer': 0.877, 'buccaneer': 1.063, 'corsair': 1.314, 'jett': 0.980, 'dawn-warrior': 1.055, 'blaze-wizard': 1.563, 'wind-archer': 1.001, 'night-walker': 1.022, 'thunder-breaker': 0.767, 'mihile': 1.336, 'mercedes': 0.736, 'aran': 1.004, 'phantom': 1.026, 'luminous': 1.040, 'evan': 0.738, 'shade': 0.996, 'battle-mage': 1.413, 'blaster': 0.924, 'mechanic': 0.988, 'wild-hunter': 0.789, 'xenon': 1.304, 'demon-slayer': 1.327, 'demon-avenger': 1.238, 'kaiser': 1.333, 'kain': 0.782, 'cadena': 1.220, 'angelic-buster': 0.784, 'kanna': 1.131, 'hayato': 0.939, 'adele': 0.933, 'ark': 1.286, 'illium': 1.079, 'khali': 0.971, 'hoyoung': 1.171, 'lara': 0.807, 'ren': 1.010, 'lynn': 0.938, 'mo-xuan': 1.248, 'sia-astelle': 0.854, 'erel-light': 1.167, 'kinesis': 1.006, 'zero': 1.212, 'lethe': 1.030, 'beast-tamer': 1.193 };
const ORIGIN = { 'hero': 0.448, 'paladin': 0.450, 'dark-knight': 0.450, 'bishop': 0.431, 'arch-mage-i-l': 0.431, 'arch-mage-f-p': 0.450, 'dual-blade': 0.450, 'shadower': 0.450, 'night-lord': 0.479, 'pathfinder': 0.450, 'marksman': 0.376, 'bow-master': 0.488, 'cannoneer': 0.450, 'buccaneer': 0.450, 'corsair': 0.395, 'jett': 0.450, 'dawn-warrior': 0.450, 'blaze-wizard': 0.450, 'wind-archer': 0.529, 'night-walker': 0.462, 'thunder-breaker': 0.450, 'mihile': 0.450, 'mercedes': 0.469, 'aran': 0.488, 'phantom': 0.450, 'luminous': 0.450, 'evan': 0.340, 'shade': 0.448, 'battle-mage': 0.436, 'blaster': 0.450, 'mechanic': 0.381, 'wild-hunter': 0.490, 'xenon': 0.460, 'demon-slayer': 0.531, 'demon-avenger': 0.450, 'kaiser': 0.450, 'kain': 0.502, 'cadena': 0.533, 'angelic-buster': 0.450, 'kanna': 0.602, 'hayato': 0.776, 'adele': 0.421, 'ark': 0.450, 'illium': 0.450, 'khali': 0.450, 'hoyoung': 0.445, 'lara': 0.450, 'ren': 0.433, 'lynn': 0.395, 'mo-xuan': 0.407, 'sia-astelle': 0.417, 'erel-light': 0.517, 'kinesis': 0.455, 'zero': 0.310, 'lethe': 0.450, 'beast-tamer': 0.450 };
R.TUNE = TUNE; R.ORIGIN = ORIGIN;
const add = (key, C) => { C.atk = Math.round(A * (C.atkBase ?? 1) * (TUNE[key] ?? 1) / 10) * 10; C.originK = ORIGIN[key] ?? 1; R.add(key, C); };

// ---------- Helpers ----------
const lowest = (c, notMe) => c.alive().filter((id) => !notMe || id !== c.pid).sort((x, y) => c.S.players[x].hp / c.S.players[x].maxHp - c.S.players[y].hp / c.S.players[y].maxHp)[0];
const otherAlly = (S, pid, ids) => { const o = ids.filter((id) => id !== pid); return o.length ? o[Math.floor(Math.random() * o.length)] : pid; };
// A skill that also costs some of the class's gauge
const spend = (n, word, sk) => ({ ...sk, cost: n,
  ok: (me, S) => me.g >= n && (!sk.ok || sk.ok(me, S)),
  desc: (C) => `${typeof sk.desc === 'function' ? sk.desc(C) : sk.desc}. Costs ${n} ${word}`,
  use: (c, arg) => { c.me.g -= n; return sk.use(c, arg); } });
const hurtSoon = (x, S, pid) => { const me = S.players[pid], mv = x.mv; const d = mv.k === 'attack' || mv.k === 'tired' ? mv.dmg : mv.k === 'focus' && mv.pid === pid ? mv.dmg : mv.k === 'test' && !x.know ? mv.dmg : 0; return d / me.hp; };
// The class's own bind (the same rules as Erda Nova: used with it in one round, the boss stays bound for 2)
const binder = (name, sec, mult, o = {}) => ({ name, cd: cd(sec), ph: 1, ai: 'bind', team: true, ...o,
  desc: (C) => `Bind the boss (it can't move and has no defense: burst now)${mult ? `, and ${dn(C, mult)} damage` : ''}${o.note ? '. ' + o.note : ''}`,
  use: (c) => { const said = c.bind(); if (mult) c.hit(mult, { n: name }); o.then?.(c); return said; } });
// An attack you can't be touched during
const dodge = (name, sec, mult, o = {}) => ({ name, cd: cd(sec), ph: 1, ai: 'iframe', ...o,
  desc: (C) => `${dn(C, mult)} damage, and you can't be touched this round (not even by an ultimate)${o.note ? '. ' + o.note : ''}`,
  bot: o.bot || ((S, pid, x) => x.mv.k === 'ult' || (x.know && (x.mv.k === 'bound' || x.mv.k === 'tired' || hurtSoon(x, S, pid) >= 1))),
  use: (c) => { c.iframe(c.pid); c.hit(mult, { n: name }); o.then?.(c); return 'can’t be touched this round'; } });
// An attack that also softens what you take this round
const brace = (name, sec, mult, taken, o = {}) => ({ name, cd: cd(sec), ph: 1, ai: 'burst', ...o,
  desc: (C) => `${dn(C, mult)} damage, and you take ${pct(1 - taken)} less damage this round`,
  use: (c) => { c.buff(c.pid, { k: R.slug(name), n: 1, name, taken }); c.hit(mult, { n: name }); return ''; } });

// ============================== Explorers ==============================
add('hero', { name: 'Hero', role: 'Damage', hp: 1200, basic: 'Raging Blow', origin: { name: 'Spirit Calibur' },
  trait: ['Combo Attack', 'Each right answer adds a Combo Orb (max 10): +4% damage each. A wrong answer loses 3. Burning Soul Blade fills them all.'],
  gauge: { name: 'Combo', max: 10 },
  mult: (c) => 1 + 0.04 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(10, c.me.g + 1) : Math.max(0, c.me.g - 3); },
  skills: [atk('Worldreaver', 2, 1.7),
    summon('Burning Soul Blade', cd(120), 0.9, 2, { note: 'Combo Orbs to 10', then: (c) => { c.me.g = 10; return 'calls <b>Burning Soul Blade</b> for 2 rounds: Combo Orbs full'; } }),
    self('Cry Valhalla', cd(120), du(30), { dmg: 1.5 })] });

add('paladin', { name: 'Paladin', role: 'Tank / Support', hp: 1350, basic: 'Blast', cover: true, origin: { name: 'Sacred Bastion' },
  trait: ['Parashock Guard', 'You take 25% less damage. When the boss targets a teammate, you step in and take the hit yourself, at half damage.'],
  taken: () => 0.75,
  skills: [binder('Smite Shield', 120, 1.2),
    ally('Divine Echo', cd(60), du(30), { dmg: 1.3 }, { pickAlly: otherAlly, note: 'They copy your strikes' }),
    { name: 'Sacrosanctity', cd: cd(300), ph: 1, ai: 'iframe', desc: () => 'You can’t be touched this round or the next (not even by an ultimate)',
      use: (c) => { c.iframe(c.pid); c.buff(c.pid, { k: 'sacrosanctity', n: 2, name: 'Sacrosanctity', iframe: true }); return 'can’t be touched for 2 rounds'; } }] });

add('dark-knight', { name: 'Dark Knight', role: 'Damage / Sustain', hp: 1300, basic: "Gungnir's Descent", origin: { name: 'Dead Space' },
  trait: ['Final Pact', 'Once every 8 rounds, a hit that would take you down leaves you standing at full HP instead (even an ultimate), and you deal +30% damage for 2 rounds.'],
  lethal: (c) => { if (c.me.cd._pact > 0) return ''; c.me.cd._pact = 8; c.me.hp = c.me.maxHp; c.buff(c.pid, { k: 'final-pact', n: 3, name: 'Final Pact', dmg: 1.3 }); return 'refuses to fall: <b>Final Pact</b> (full HP, +30% damage)'; },
  status: (me) => (me.cd._pact > 0 ? `Final Pact back in ${me.cd._pact}` : 'Final Pact ready'),
  skills: [
    { name: 'Dark Resonance', cd: cd(70), ph: 0, ai: 'buff', desc: () => 'Heal 15% HP; this round +30% damage and you ignore 30% of its defense',
      use: (c) => { const h = c.heal(c.pid, 0.15); c.buff(c.pid, { k: 'dark-resonance', n: 1, name: 'Dark Resonance', dmg: 1.3, ied: 0.3 }); return `+${fmt(h)} HP, +30% damage this round`; } },
    atk('Calamitous Cyclone', cd(120), 3.4),
    self('Darkness Aura', cd(180), 2, { regen: 0.1 }, { ai: 'always', note: 'It also strikes the boss each round', then: (c) => { c.summon('Darkness Aura', 0.7, 2); } })] });

add('bishop', { name: 'Bishop', role: 'Healer / Support', hp: 900, basic: 'Angel Ray', origin: { name: 'Holy Advent', summon: 2, note: 'While the angels are out the whole party deals +20% damage', then: (c) => { c.party({ k: 'holy-advent', n: 2, name: 'Holy Advent', dmg: 1.2 }); } },
  trait: ['Righteously Indignant', 'Two modes, switch any round. Benevolence: every right answer heals the most hurt player 6% HP. Vengeance: you deal +30% damage instead. Bahamut burns the boss every round for 35% of your main attack, even when you answer wrong.'],
  stances: { benevolence: 'Benevolence', vengeance: 'Vengeance' },
  mult: (c) => (c.me.st === 'vengeance' ? 1.3 : 1),
  after: (c) => { if (c.power > 0 && c.me.st === 'benevolence') { const t = lowest(c); if (t) c.heal(t, 0.06); } c.hit(0.35, { n: 'Bahamut', free: 1 }); },
  skills: [
    { name: 'Righteously Indignant', cd: 0, ph: 0, ai: 'stance', desc: () => 'Switch between Benevolence (healing) and Vengeance (+30% damage)',
      bot: (S, pid, x) => { const hurt = x.ids.some((id) => S.players[id].hp < S.players[id].maxHp * 0.6), want = hurt ? 'benevolence' : 'vengeance'; return want !== S.players[pid].st; },
      use: (c) => { c.me.st = c.me.st === 'vengeance' ? 'benevolence' : 'vengeance'; return `turns to ${c.C.stances[c.me.st]}`; } },
    party('Benediction', cd(120), du(30), { dmg: 1.35 }),
    { name: "Heaven's Door", cd: cd(60), ph: 1, ai: 'door', team: true, desc: (C) => `${dn(C, 1)} damage. Whole party, 2 rounds: the next hit that would take you down leaves you at half HP instead (even an ultimate)`,
      bot: (S, pid, x) => x.mv.k === 'charge' || x.mv.k === 'ult' || x.ids.some((id) => S.players[id].hp < S.players[id].maxHp * 0.35),
      use: (c) => { c.party({ k: 'heavens-door', n: 2, name: "Heaven's Door", door: true }); c.hit(1, { n: "Heaven's Door" }); return 'the party can’t be taken down once (2 rounds)'; } },
    { name: 'Holy Magic Shell', cd: cd(90), ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 30% HP', use: (c) => `heals the party for ${fmt(c.healAll(0.3))} HP` }] });

add('arch-mage-i-l', { name: 'Arch Mage (I/L)', role: 'Damage / Control', hp: 850, basic: 'Chain Lightning', origin: { name: 'Frozen Lightning' },
  trait: ['Frostbite', 'Ice skills put Frost on the boss (max 5): your attacks deal +6% per Frost. At 5 Frost it is frozen stiff: its attacks hit 20% softer.'],
  gauge: { name: 'Frost', max: 5 },
  mult: (c) => 1 + 0.06 * c.me.g,
  end: (c) => { if (c.me.g >= 5) c.weaken('frost', 0.8, 2, 'Frozen'); },
  skills: [
    { name: 'Freezing Breath', cd: cd(120), ph: 1, ai: 'bind', team: true, desc: () => 'Bind the boss (it can’t move and has no defense: burst now), and you can’t be touched this round. Frost goes to 5', use: (c) => { c.iframe(c.pid); c.me.g = 5; return c.bind(); } },
    atk('Jupiter Thunder', cd(120), 3.4),
    summon('Spirit of Snow', cd(120), 0.8, 2, { note: '+2 Frost', then: (c) => { c.me.g = Math.min(5, c.me.g + 2); } })] });

add('arch-mage-f-p', { name: 'Arch Mage (F/P)', role: 'Damage over time', hp: 850, basic: 'Flame Sweep', origin: { name: 'Infernal Venom', note: 'Your burns last 3 more rounds', then: (c) => { for (const d of c.b.dots) if (d.by === c.pid) d.n += 3; } },
  trait: ['Burn', 'Every right answer sets a burn on the boss (up to 5): each burns for 15% of your main attack every round for 3 rounds, even on rounds you get wrong. No big cooldowns: your damage never stops.'],
  basicHit: (c) => { c.hit(1, { n: 'Flame Sweep' }); c.dot('burn', 0.15, 3, 'Burn', 5); },
  skills: [
    { name: 'Mist Eruption', cd: 2, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 0.8)} damage + ${dn(C, 0.4)} for each burn on the boss`,
      use: (c) => { c.hit(0.8 + 0.4 * c.b.dots.filter((d) => d.by === c.pid).length, { n: 'Mist Eruption' }); } },
    atk('Elemental Fury', cd(60), 1.5, { note: 'Sets 2 more burns', then: (c) => { if (c.power > 0) { c.dot('burn', 0.15, 3, 'Burn', 5); c.dot('burn', 0.15, 3, 'Burn', 5); } } }),
    atk('DoT Punisher', 2, 1.2, { note: 'Your burns last 2 more rounds', then: (c) => { if (c.power > 0) for (const d of c.b.dots) if (d.by === c.pid) d.n += 2; } })] });

add('dual-blade', { name: 'Dual Blade', role: 'Damage', hp: 950, basic: 'Phantom Blow', origin: { name: 'Karma Blade' },
  trait: ['Mirror Image', '25% chance to slip any hit (not an ultimate). After a dodge your attacks deal +30% next round.'],
  hitBy: (c) => { if (c.rand() < 0.25) { c.buff(c.pid, { k: 'shadow-meld', n: 2, name: 'Shadow Meld', dmg: 1.3 }); c.tell('boss', '💨 slips the hit (Mirror Image)', { k: 'dodge' }); return true; } },
  skills: [
    { name: 'Final Cut', cd: cd(90), ph: 2, ai: 'burst', desc: (C) => `Costs 10% of your HP: ${dn(C, 2)} damage, and +25% damage for 2 rounds`,
      use: (c) => { c.pay(0.1); c.buff(c.pid, { k: 'final-cut', n: 2, name: 'Final Cut', dmg: 1.25 }); c.hit(2, { n: 'Final Cut' }); } },
    atk("Asura's Anger", cd(60), 1.7), atk('Blade Storm', cd(60), 1.7)] });

add('shadower', { name: 'Shadower', role: 'Damage / Support', hp: 950, basic: 'Assassinate', origin: { name: 'Halve Cut' },
  trait: ['Meso Explosion', 'Right answers scatter mesos. Every 3rd one blows them up: a bonus hit worth 150% of your main attack.'],
  gauge: { name: 'Mesos', max: 3 },
  after: (c) => { if (c.power > 0 && ++c.me.g >= 3) { c.me.g = 0; c.hit(1.5, { n: 'Meso Explosion' }); } },
  skills: [atk('Sonic Blow', cd(60), 1.7), atk('Slash Shadow Formation', cd(120), 3.4),
    { name: 'Smokescreen', cd: cd(120), ph: 1, ai: 'guard', team: true, desc: () => 'Whole party takes no damage this round (an ultimate still hits) and deals +10% damage',
      use: (c) => { for (const id of c.alive()) c.block(id); c.party({ k: 'smokescreen', n: 1, name: 'Smokescreen', dmg: 1.1 }); return 'hides the party in smoke: no damage this round'; } }] });

add('night-lord', { name: 'Night Lord', role: 'Damage', hp: 900, basic: 'Quad Star', origin: { name: 'Life and Death' },
  trait: ["Assassin's Mark", 'Each right answer has a 45% chance to set off a mark for +60% of your main attack.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.45) c.hit(0.6, { n: "Assassin's Mark" }); },
  skills: [atk("Dark Lord's Omen", cd(60), 1.7), self('Throwing Star Barrage', cd(120), du(30), { dmg: 1.6 }), self('Throw Blasting', cd(120), du(60), { dmg: 1.3 })] });

add('pathfinder', { name: 'Pathfinder', role: 'Damage / Support', hp: 950, basic: 'Cardinal Burst', origin: { name: 'Forsaken Relic' },
  trait: ['Relic Gauge', 'Each right answer charges the Relic (max 4). Nova Blast spends all of it: the fuller, the harder it hits.'],
  gauge: { name: 'Relic', max: 4 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(4, c.me.g + 1); },
  skills: [
    { name: 'Nova Blast', cd: cd(120), ph: 1, ai: 'iframe', desc: (C) => `${dn(C, 0.8)} damage + ${dn(C, 0.7)} per Relic charge (it uses them all), and you can’t be touched this round`,
      bot: (S, pid, x) => x.mv.k === 'ult' || (x.know && S.players[pid].g >= 3 && x.mv.k !== 'shield'),
      use: (c) => { c.iframe(c.pid); c.hit(0.8 + 0.7 * c.me.g, { n: 'Nova Blast' }); if (c.power > 0) c.me.g = 0; return 'can’t be touched this round'; } },
    summon('Ancient Tempest', cd(120), 0.8, 2),
    party('Obsidian Barrier', cd(120), 1, { taken: 0.55 }, { ai: 'guard' })] });

add('marksman', { name: 'Marksman', role: 'Damage (speed)', hp: 950, basic: 'Snipe', origin: { name: 'Final Aim' },
  trait: ['Weak Point', 'Speed is everything: a right answer in under 5 seconds deals +40% damage.'],
  mult: (c, o) => (o.free == null && c.sec != null && c.sec < 5 ? 1.4 : 1),
  skills: [atk('Perfect Shot', cd(60), 2, { hit: { ied: 1, pierce: true }, note: "Goes straight through the boss's defense and shield" }),
    self('Bullseye Shot', cd(120), du(40), { dmg: 1.5, ied: 0.5 }), self('Split Shot', cd(120), du(72), { dmg: 1.3 })] });

add('bow-master', { name: 'Bow Master', role: 'Steady damage', hp: 950, basic: 'Hurricane', origin: { name: 'Ascendant Shadow' },
  trait: ['Hurricane', 'A steady stream of arrows: when you answer right your Power is never under 85%, however slow you were.'],
  power: (c, pw) => (pw > 0 ? Math.max(0.85, pw) : 0),
  skills: [summon('Storm of Arrows', cd(120), 0.8, du(70)), self('Quiver Barrage', cd(120), du(40), { dmg: 1.5 }), self('Concentration', cd(120), du(40), { dmg: 1.2, ied: 0.5 })] });

add('cannoneer', { name: 'Cannoneer', role: 'Damage / Gambler', hp: 1100, basic: 'Cannon Barrage', origin: { name: 'Super Cannon Explosion' },
  trait: ['Barrel Roulette', 'Every round a barrel rolls out, and you see it before you act: 🔴 +30% damage · 🟢 heal 8% HP · 🔵 take 30% less damage · ⚫ nothing.'],
  init: (p) => { p.v.barrel = Math.floor(Math.random() * 4); },
  start: (c) => { const r = c.me.v.barrel; if (r === 0) c.buff(c.pid, { k: 'barrel', n: 1, name: 'Red barrel', dmg: 1.3 }); if (r === 2) c.buff(c.pid, { k: 'barrel', n: 1, name: 'Blue barrel', taken: 0.7 }); },
  end: (c) => { if (c.me.v.barrel === 1) c.heal(c.pid, 0.08); c.me.v.barrel = Math.floor(c.rand() * 4); },
  status: (me) => 'Barrel: ' + ['🔴 +30% damage', '🟢 heal 8% HP', '🔵 30% less damage taken', '⚫ nothing'][me.v.barrel ?? 3],
  skills: [summon('Monkey Business', cd(60), 0.45, 2), atk('Rolling Rainbow', cd(60), 1.7),
    { name: 'Poolmaker', cd: cd(60), ph: 2, ai: 'burst', desc: (C) => `${dn(C, 1)} damage, and +25% damage this round and the next`, use: (c) => { c.buff(c.pid, { k: 'poolmaker', n: 2, name: 'Poolmaker', dmg: 1.25 }); c.hit(1, { n: 'Poolmaker' }); } }] });

add('buccaneer', { name: 'Buccaneer', role: 'Damage / Support', hp: 1050, basic: 'Octopunch', origin: { name: 'Unleash Neptunus' },
  trait: ['Sea Serpent', 'Right answers in a row stir the Sea Serpent (3): at 3 it fights with you, +30% damage. A wrong answer sends it back down.'],
  gauge: { name: 'Serpent', max: 3 },
  mult: (c) => (c.me.g >= 3 ? 1.3 : 1),
  end: (c) => { c.me.g = c.power > 0 ? Math.min(3, c.me.g + 1) : 0; },
  skills: [atk('Howling Fist', cd(60), 1.9), self('Lightning Form', cd(180), du(55), { dmg: 1.4 }),
    { name: 'Time Leap', cd: cd(120), ph: 1, noReset: true, team: true, desc: () => 'Every other skill of every player is ready again (not Time Leap, not Origin skills)',
      bot: (S, pid, x) => x.ids.reduce((n, id) => n + Object.entries(S.players[id].cd).filter(([k, v]) => v > 1 && k[0] !== '_' && !R.skill(S.players[id].cls, k)?.noReset).length, 0) >= Math.max(2, x.ids.length * 1.5),
      use: (c) => { for (const id of c.alive()) c.cdr(id, 99, 'time-leap'); return "turns back the clock: the party's skills are ready again"; } }] });

const DICE = [null, null, { taken: 0.7 }, { regen: 0.08 }, { dmg: 1.15 }, { dmg: 1.25 }, { dmg: 1.4 }];
add('corsair', { name: 'Corsair', role: 'Damage / Gambler', hp: 1000, basic: 'Rapid Fire', origin: { name: 'The Dreadnought' },
  trait: ['Scurvy Summons', 'Your crew keeps firing: 25% of your main attack every round, even when you answer wrong.'],
  after: (c) => { c.hit(0.25, { n: 'Crew', free: 1 }); },
  skills: [
    { name: 'Roll of the Dice', cd: cd(60), ph: 0, ai: 'always', desc: () => 'Roll a die; it lasts 6 rounds, or until you roll again: 1 nothing · 2 take 30% less damage · 3 heal 8% HP a round · 4 +15% damage · 5 +25% damage · 6 +40% damage',
      bot: (S, pid) => { const f = S.players[pid].buffs.find((x) => x.k === 'dice'); return !f || f.n <= 1 || !(f.dmg >= 1.25); },
      use: (c) => { const r = 1 + Math.floor(c.rand() * 6), f = DICE[r]; c.me.buffs = c.me.buffs.filter((x) => x.k !== 'dice');
        if (f) c.buff(c.pid, { k: 'dice', n: 6, name: 'Lucky Dice ' + r, ...f }); return `rolls a <b>${r}</b>: ${f ? R.h.buffWords(f) + ' for 6 rounds' : 'nothing…'}`; } },
    dodge('Nautilus Assault', 120, 3),
    { name: "Whaler's Potion", cd: cd(60), ph: 1, ai: 'heal', desc: () => 'Heal 35% of your HP and take 30% less damage this round', bot: (S, pid) => S.players[pid].hp < S.players[pid].maxHp * 0.6,
      use: (c) => { const h = c.heal(c.pid, 0.35); c.buff(c.pid, { k: 'whalers-potion', n: 1, name: "Whaler's Potion", taken: 0.7 }); return `+${fmt(h)} HP, 30% less damage this round`; } }] });

add('jett', { name: 'Jett', role: 'Damage', hp: 1050, basic: 'Starforce Salvo', origin: { name: 'Singularity Shock' },
  trait: ['Slipstream Suit', 'A flying start: while you are at full HP you deal +25% damage.'],
  mult: (c) => (c.me.hp >= c.me.maxHp ? 1.25 : 1),
  skills: [summon('Turret Deployment', 3, 0.5, 3),
    { name: 'Bionic Maximizer', cd: 4, ph: 1, ai: 'heal', desc: () => 'Heal 40% of your HP and take 30% less damage for 2 rounds', bot: (S, pid) => S.players[pid].hp < S.players[pid].maxHp * 0.6,
      use: (c) => { const h = c.heal(c.pid, 0.4); c.buff(c.pid, { k: 'bionic', n: 2, name: 'Bionic Maximizer', taken: 0.7 }); return `+${fmt(h)} HP, 30% less damage taken for 2 rounds`; } },
    atk('Suborbital Bombardier', 4, 3.4)] });

// ============================== Cygnus Knights ==============================
add('dawn-warrior', { name: 'Dawn Warrior', role: 'Damage', hp: 1150, basic: 'Luna Divide', origin: { name: 'Astral Blitz' },
  trait: ['Equinox Cycle', 'Moon and Sun take turns, a round each. Falling Moon: +20% damage. Rising Sun: 20% less damage taken, and a right answer heals 5% HP.'],
  stances: { moon: 'Falling Moon', sun: 'Rising Sun' },
  mult: (c) => (c.me.st === 'moon' ? 1.2 : 1), taken: (c) => (c.me.st === 'sun' ? 0.8 : 1),
  after: (c) => { if (c.me.st === 'sun' && c.power > 0) c.heal(c.pid, 0.05); },
  end: (c) => { c.me.st = c.me.st === 'moon' ? 'sun' : 'moon'; },
  skills: [binder('Impaling Rays', 120, 1), self('Cosmic Forge', cd(120), du(30), { dmg: 1.5 }), dodge('Soul Eclipse', 180, 4.4)] });

add('blaze-wizard', { name: 'Blaze Wizard', role: 'Damage / Support', hp: 850, basic: 'Orbital Flame', origin: { name: 'Eternity' },
  trait: ['Embers', 'Each right answer adds an Ember (max 6). Savage Flame burns them all at once: save up for a big one.'],
  gauge: { name: 'Embers', max: 6 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(6, c.me.g + 1); },
  skills: [
    { name: 'Savage Flame', cd: 2, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 0.4)} damage + ${dn(C, 0.55)} per Ember. Uses them all`, bot: (S, pid, x) => x.know && x.mv.k !== 'shield' && (S.players[pid].g >= 4 || x.mv.k === 'bound'),
      use: (c) => { c.hit(0.4 + 0.55 * c.me.g, { n: 'Savage Flame' }); if (c.power > 0) c.me.g = 0; } },
    binder('Cinder Maelstrom', 120, 1), party('Burning Conduit', cd(60), du(40), { dmg: 1.15 })] });

add('wind-archer', { name: 'Wind Archer', role: 'Damage', hp: 950, basic: 'Song of Heaven', origin: { name: 'Mistral Spring' },
  trait: ['Trifling Wind', 'Each right answer lets loose 3 spirit arrows: each has a 45% chance to hit for 25% of your main attack.'],
  after: (c) => { if (c.power > 0) { let n = 0; for (let i = 0; i < (c.hasBuff('storm-whim') ? 6 : 3); i++) if (c.rand() < 0.45) n++; if (n) c.hit(0.25 * n, { n: 'Trifling Wind' }); } },
  skills: [atk('Howling Gale', 2, 1.7), self('Gale Barrier', cd(60), du(30), { taken: 0.5, dmg: 1.15 }, { ai: 'guard' }),
    self('Storm Whim', cd(120), 2, { dmg: 1.1 }, { note: 'Twice as many spirit arrows' })] });

add('night-walker', { name: 'Night Walker', role: 'Damage', hp: 950, basic: 'Quintuple Star', origin: { name: 'Silence' },
  trait: ['Shadow Bats', 'Each right answer calls a bat (max 5). Every bat bites each round for 8% of your main attack, even when you answer wrong.'],
  gauge: { name: 'Bats', max: 5 },
  after: (c) => { if (c.me.g) c.hit(0.08 * c.me.g, { n: 'Shadow Bats', free: 1 }); if (c.power > 0) c.me.g = Math.min(5, c.me.g + 1); },
  skills: [binder('Shadow Stitch', 120, 1.5),
    dodge('Dominion', 120, 3, { note: '+20% damage this round', then: (c) => { c.buff(c.pid, { k: 'dominion', n: 1, name: 'Dominion', dmg: 1.2 }); } }),
    self('Shadow Illusion', cd(120), du(20), { dmg: 1.55 })] });

add('thunder-breaker', { name: 'Thunder Breaker', role: 'Damage (streaks)', hp: 1050, basic: 'Annihilate', origin: { name: 'Thunder Wall Sea Wave' },
  trait: ['Lightning Link', 'Right answers in a row chain your links: +12% damage per link (max 5). One wrong answer breaks the chain.'],
  gauge: { name: 'Links', max: 5 },
  mult: (c) => 1 + 0.12 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(5, c.me.g + 1) : 0; },
  skills: [brace('Deep Rising', 45, 1.7, 0.5), self('Lightning Cascade', cd(120), du(52), { dmg: 1.35 }), atk('Lightning Spear Multistrike', cd(120), 3.4)] });

add('mihile', { name: 'Mihile', role: 'Tank / Counter', hp: 1250, basic: 'Radiant Cross', origin: { name: 'Durendal' },
  trait: ['Royal Guard', 'Royal Guard blocks the boss’s hit and strikes back, if it attacks you that round. Each block adds a stack (max 5): +8% damage for the rest of the fight.'],
  gauge: { name: 'Guard', max: 5 },
  mult: (c) => 1 + 0.08 * c.me.g,
  hitBy: (c) => { if (!c.me.v.rg) return; c.me.v.rg = 0; c.me.g = Math.min(5, c.me.g + 1); const d = c.hit(1.5, { n: 'Royal Guard', free: 1 }); c.tell('boss', `🛡️ blocks with Royal Guard and strikes back for <b>${fmt(d)}</b>`, { k: 'dodge' }); return true; },
  end: (c) => { c.me.v.rg = 0; },
  skills: [
    { name: 'Royal Guard', cd: 2, ph: 1, ai: 'guard', desc: (C) => `If the boss hits you this round (not an ultimate): block it all and strike back for ${dn(C, 1.5)}. +1 Guard stack`,
      bot: (S, pid, x) => hurtSoon(x, S, pid) > 0, use: (c) => { c.me.v.rg = 1; return 'raises the shield'; } },
    party('Shield of Light', cd(120), du(66), { taken: 0.55 }, { ai: 'guard' }), self('Radiant Soul', cd(120), du(20), { dmg: 1.55, ied: 0.5 })] });

// ============================== Heroes ==============================
add('mercedes', { name: 'Mercedes', role: 'Damage (speed)', hp: 950, basic: "Ishtar's Ring", origin: { name: 'Unfading Glory' },
  trait: ['Ignis Roar', 'Quick hands: a right answer in under 8 s adds a stack (max 5): +9% damage each. A wrong answer drops 2.'],
  gauge: { name: 'Ignis Roar', max: 5 },
  mult: (c) => 1 + 0.09 * c.me.g,
  end: (c) => { if (c.power > 0) { if (c.sec != null && c.sec < 8) c.me.g = Math.min(5, c.me.g + 1); } else c.me.g = Math.max(0, c.me.g - 2); },
  skills: [atk("Sylvidia's Flight", cd(60), 1.9), self('Spirit of Elluel', cd(120), du(50), { dmg: 1.35 }), atk("Irkalla's Wrath", cd(120), 3.4)] });

add('aran', { name: 'Aran', role: 'Damage (combo)', hp: 1200, basic: 'Beyond Blade', origin: { name: 'Endgame' },
  trait: ['Adrenaline Rush', 'Right answers build Combo: +1, or +2 in under 8 s (max 10). At 10 you go into Adrenaline Rush for 2 rounds: +60% damage. Then Combo starts over.'],
  gauge: { name: 'Combo', max: 10 },
  mult: (c) => (c.hasBuff('adrenaline') ? 1.6 : 1),
  end: (c) => { if (c.hasBuff('adrenaline')) return; if (c.power > 0) c.me.g = Math.min(10, c.me.g + (c.sec != null && c.sec < 8 ? 2 : 1));
    if (c.me.g >= 10) { c.me.g = 0; c.buff(c.pid, { k: 'adrenaline', n: 3, name: 'Adrenaline Rush' }); c.note('goes into <b>Adrenaline Rush</b>: +60% damage for 2 rounds'); } },
  skills: [binder('Glacial Prison', 120, 1.2),
    expose('Blizzard Tempest', cd(60), 1, 1.1, 1.3, { note: '+2 Combo', then: (c) => { if (!c.hasBuff('adrenaline')) c.me.g = Math.min(10, c.me.g + 2); } }),
    { name: "Finisher - Hunter's Prey", short: "Hunter's Prey", cd: 2, ph: 1, ai: 'iframe', ok: (me) => me.buffs.some((f) => f.k === 'adrenaline'), desc: (C) => `Only in Adrenaline Rush: ${dn(C, 3)} damage, and you can’t be touched this round`,
      bot: (S, pid, x) => x.know || x.mv.k === 'ult', use: (c) => { c.iframe(c.pid); c.hit(3, { n: "Hunter's Prey" }); return 'can’t be touched this round'; } }] });

const CARDS = [['♠ Spade', { dmg: 1.3 }], ['♦ Diamond', { taken: 0.6 }], ['♥ Heart', { regen: 0.12 }]];
add('phantom', { name: 'Phantom', role: 'Trickster', hp: 950, basic: 'Mille Aiguilles', origin: { name: 'Defying Fate' },
  trait: ['Carte Noir', 'Each right answer has a 40% chance to throw a Carte Noir: +40% of your main attack. Impeccable Memory repeats the last class skill a teammate used, as if it were yours.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.4) c.hit(0.4, { n: 'Carte Noir' }); },
  skills: [
    { name: 'Judgment Draw', cd: 2, ph: 0, ai: 'always', desc: () => 'Draw a card, 2 rounds: ♠ +30% damage · ♦ take 40% less damage · ♥ heal 12% HP a round',
      use: (c) => { const [n, f] = CARDS[Math.floor(c.rand() * CARDS.length)]; c.buff(c.pid, { k: 'card', n: 2, name: n, ...f }); return `draws <b>${n}</b>: ${R.h.buffWords(f)} for 2 rounds`; } },
    { name: 'Impeccable Memory', cd: 3, ph: 1, ai: 'always', target: true, pickAlly: otherAlly, desc: (C) => `Use the last class skill one player used (alone: your own last one). Nothing to copy: ${dn(C, 1.5)} damage`,
      use: (c, t) => { const to = c.ally(t), p = c.S.players[to], sk = p.lastSkill && p.lastSkill !== 'impeccable-memory' ? R.skill(p.cls, p.lastSkill) : null;
        if (!sk || sk.origin || sk.ai === 'stance') { c.hit(1.5, { n: 'Impeccable Memory' }); return ''; }
        let r = '';
        try { r = sk.use(c, sk.target ? c.pid : 0); } catch { c.hit(1.5, { n: 'Impeccable Memory' }); }
        c.me.g = 0; c.me.st = null;   // (the other class's gauge isn't yours)
        return `copies <b>${sk.name}</b>${to === c.pid ? '' : ` from {p:${to}}`}${typeof r === 'string' && r ? ': ' + r : ''}`; } },
    { name: 'Luck of the Draw', cd: cd(120), ph: 2, ai: 'burst', team: true, desc: (C) => `${dn(C, 3)} damage, and the whole party draws a card for 2 rounds`,
      use: (c) => { c.hit(3, { n: 'Luck of the Draw' }); const [n, f] = CARDS[Math.floor(c.rand() * CARDS.length)]; c.party({ k: 'card', n: 2, name: n, ...f }); c.note(`deals the party <b>${n}</b>: ${R.h.buffWords(f)} for 2 rounds`); } }] });

add('luminous', { name: 'Luminous', role: 'Damage (rhythm)', hp: 850, basic: 'Ender', origin: { name: 'Harmonic Paradox' },
  trait: ['Equilibrium', 'Every 3rd right answer tips light and dark into balance: the next round you are in Equilibrium: +50% damage, and class skills you use then have no cooldown.'],
  gauge: { name: 'Balance', max: 3 },
  start: (c) => { c.me.v.eqNow = !!c.me.v.eq; if (c.me.v.eq) { c.me.v.eq = false; c.buff(c.pid, { k: 'equilibrium', n: 1, name: 'Equilibrium', dmg: 1.5 }); } },
  cast: (c, sk) => { if (c.me.v.eqNow && !sk.common && !sk.origin && sk.key !== 'equalize') c.me.cd[sk.key] = 0; },
  end: (c) => { if (c.power > 0 && !c.me.v.eqNow && ++c.me.g >= 3) { c.me.g = 0; c.me.v.eq = true; c.note('reaches <b>Equilibrium</b>: next round +50% damage, no cooldowns'); } },
  status: (me) => (me.v.eq ? '⚖️ Equilibrium this round: +50% damage, no cooldowns' : null),
  skills: [atk('Baptism of Light and Darkness', 2, 1.7), binder('Armageddon', 120, 1.5),
    { name: 'Equalize', cd: cd(120), ph: 0, ai: 'buff', desc: () => 'Step into Equilibrium right now: +50% damage, and your other class skills have no cooldown this round',
      use: (c) => { c.me.v.eqNow = true; c.buff(c.pid, { k: 'equilibrium', n: 1, name: 'Equilibrium', dmg: 1.5 }); return 'steps into Equilibrium'; } }] });

add('evan', { name: 'Evan', role: 'Damage (dragon)', hp: 900, basic: 'Mana Burst', origin: { name: 'Zodiac Burst' },
  trait: ['Mir', 'Mir fights at your side: 25% of your main attack every round, even when you answer wrong. On rounds you use a class skill it is a Fusion: Mir hits twice as hard.'],
  after: (c) => { c.hit(c.rc.casts.some((x) => x.c === c && !x.sk.common) ? 0.5 : 0.25, { n: 'Mir', free: 1 }); },
  skills: [atk('Elemental Barrage', cd(60), 1.9), summon('Summon Onyx Dragon', cd(60), 0.45, 2), atk('Elemental Radiance', cd(120), 3.4)] });

add('shade', { name: 'Shade', role: 'Damage / Sustain', hp: 1100, basic: 'Spirit Claw', origin: { name: 'Advent of the Fox' },
  trait: ['Fox Spirits', 'Each right answer has a 40% chance to call a fox spirit: +50% of your main attack, and it heals you 5% HP.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.4) { c.hit(0.5, { n: 'Fox Spirits' }); c.heal(c.pid, 0.05); } },
  skills: [binder('Spirit Trap', 120, 1), self('Fox God Flash', cd(120), du(60), { dmg: 1.3, regen: 0.06 }), atk('Smashing Multipunch', cd(120), 3.4)] });

// ============================== Resistance and Demons ==============================
add('battle-mage', { name: 'Battle Mage', role: 'Damage / Support (auras)', hp: 1000, basic: 'Finishing Blow', origin: { name: 'Crimson Pact' },
  trait: ['Auras', 'Your aura covers the whole party; Dark Aura (the skill) changes it, any round. Dark: +12% damage. Blue: 18% less damage taken. Draining: everyone heals 4% HP a round. Aura Scythe gives all three at once.'],
  stances: { dark: 'Dark Aura', blue: 'Blue Aura', drain: 'Draining Aura' },
  aura: (c) => { const st = c.me.st, all = c.hasBuff('aura-scythe'); c.party({ k: 'bam-aura', n: 1, name: all ? 'Aura Scythe' : c.C.stances[st], ...(all ? { dmg: 1.12, taken: 0.82, regen: 0.04 } : st === 'dark' ? { dmg: 1.12 } : st === 'blue' ? { taken: 0.82 } : { regen: 0.04 }) }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Dark Aura', cd: 0, ph: 0, ai: 'stance', options: ['Dark Aura: party +12% damage', 'Blue Aura: party takes 18% less damage', 'Draining Aura: party heals 4% HP a round'], desc: () => 'Change your aura (it covers the whole party)',
      bot: (S, pid, x) => { const hurt = x.ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.5).length, want = hurtSoon(x, S, pid) > 0.4 ? 'blue' : hurt ? 'drain' : 'dark'; return want !== S.players[pid].st ? ['dark', 'blue', 'drain'].indexOf(want) : null; },
      use: (c, i) => { c.me.st = ['dark', 'blue', 'drain'][+i] || 'dark'; c.C.aura(c); return `spreads ${c.C.stances[c.me.st]}`; } },
    { name: 'Aura Scythe', cd: cd(60), ph: 0, ai: 'buff', team: true, desc: (C) => `This round the party gets all three auras at once, and ${dn(C, 1)} damage`,
      use: (c) => { c.buff(c.pid, { k: 'aura-scythe', n: 1, name: 'Aura Scythe' }); c.C.aura(c); c.hit(1, { n: 'Aura Scythe' }); return 'all three auras at once'; } },
    self('Master of Death', cd(120), du(20), { dmg: 1.55 })] });

add('blaster', { name: 'Blaster', role: 'Damage / Tank', hp: 1250, basic: 'Magnum Punch', origin: { name: 'Final Destroyer' },
  trait: ['Revolving Cannon', '6 bullets. Each right answer fires one for +15% damage. Empty cylinder: that round you reload instead (a weak hit).'],
  gauge: { name: 'Bullets', max: 6 }, init: (p) => { p.g = 6; },
  basicHit: (c) => { if (c.me.g > 0) { c.me.g--; c.hit(1.15, { n: 'Magnum Punch' }); } else { c.me.g = 6; c.hit(0.6, { n: 'Reload' }); } },
  skills: [
    { name: 'Bunker Buster Explosion', short: 'Bunker Buster', cd: 2, ph: 2, ai: 'burst', desc: (C) => `Fire every bullet you have left: ${dn(C, 0.55)} damage each`, bot: (S, pid, x) => x.know && S.players[pid].g >= 3 && x.mv.k !== 'shield',
      use: (c) => { c.hit(0.55 * c.me.g, { n: 'Bunker Buster' }); if (c.power > 0) c.me.g = 0; } },
    binder('Revolving Blast', 120, 1, { note: 'Reloads to 6 bullets', then: (c) => { c.me.g = 6; } }),
    brace('Bullet Blast', 60, 1.8, 0.5)] });

add('mechanic', { name: 'Mechanic', role: 'Summoner / Support', hp: 1050, basic: 'Heavy Salvo Plus', summonPlus: 1, origin: { name: 'Ground Zero' },
  trait: ['Robot Mastery', 'Your robots stay 1 round longer, and Support Unit: H-EX heals the whole party 3% HP at the end of every round.'],
  end: (c) => { for (const id of c.alive()) c.heal(id, 0.03); },
  skills: [summon("Bots 'n Tots", cd(60), 0.35, 2), dodge('Full Metal Barrage', 120, 3), summon('Mecha Carrier', cd(120), 0.6, 2)] });

add('wild-hunter', { name: 'Wild Hunter', role: 'Damage (jaguar)', hp: 1000, basic: 'Wild Arrow Blast: Apex', origin: { name: 'Synchronous Hunt' },
  trait: ['Ashlii', 'Your jaguar bites every round for 30% of your main attack, even when you answer wrong.'],
  after: (c) => { c.hit(c.hasBuff('primal-bloom') ? 0.6 : 0.3, { n: 'Ashlii', free: 1 }); },
  skills: [binder('Volt Snare', 120, 1.2),
    { name: 'Primal Bloom', cd: cd(120), ph: 0, ai: 'buff', desc: () => 'This round: +40% damage, Ashlii bites twice as hard, and you can’t be touched',
      use: (c) => { c.iframe(c.pid); c.buff(c.pid, { k: 'primal-bloom', n: 1, name: 'Primal Bloom', dmg: 1.4 }); return '+40% damage, untouchable this round'; } },
    atk('Wild Arrow Blast: Overdrive', cd(120), 3.4)] });

add('xenon', { name: 'Xenon', role: 'Damage', hp: 1050, basic: 'Mecha Purge: Snipe', origin: { name: 'Artificial Evolution' },
  trait: ['Supply Surplus', 'You gain 1 Surplus Energy every round (max 5): +5% damage each. Your skills spend it.'],
  gauge: { name: 'Surplus', max: 5 }, init: (p) => { p.g = 2; },
  mult: (c) => 1 + 0.05 * c.me.g,
  end: (c) => { c.me.g = Math.min(5, c.me.g + 1); },
  skills: [binder('Entangling Lash', 120, 1), spend(2, 'Surplus', atk('Orbital Cataclysm', cd(50), 2.1)), spend(2, 'Surplus', self('Core Overload', cd(120), du(30), { dmg: 1.55 }))] });

add('demon-slayer', { name: 'Demon Slayer', role: 'Damage', hp: 1250, basic: 'Demon Impact', origin: { name: 'Nightmare' },
  trait: ['Demon Fury', 'Each right answer builds 35 Fury (max 100). Your skills cost Fury: no Fury, no skills.'],
  gauge: { name: 'Fury', max: 100 }, init: (p) => { p.g = 50; },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(100, c.me.g + 35); },
  skills: [spend(30, 'Fury', binder('Binding Darkness', 120, 1.2)), spend(40, 'Fury', self('Demon Awakening', cd(120), du(60), { dmg: 1.35 })), spend(40, 'Fury', summon('Orthrus', cd(120), 0.8, du(55)))] });

add('demon-avenger', { name: 'Demon Avenger', role: 'Damage (HP)', hp: 1700, basic: 'Exceed: Execution', origin: { name: 'Requiem' },
  trait: ['Blood Contract', 'Your HP is your power: up to +40% damage the fuller it is. Each right answer heals 4% HP. Demonic Frenzy trades HP for damage.'],
  stances: { calm: 'Calm', frenzy: 'Demonic Frenzy' },
  mult: (c) => (1 + 0.4 * c.me.hp / c.me.maxHp) * (c.me.st === 'frenzy' ? 1.35 : 1),
  after: (c) => { if (c.power > 0) c.heal(c.pid, 0.04); },
  end: (c) => { if (c.me.st === 'frenzy') c.pay(0.08); },
  skills: [
    { name: 'Demonic Frenzy', cd: 0, ph: 0, ai: 'stance', desc: () => 'On / off. While on: +35% damage, but you lose 8% HP every round',
      bot: (S, pid, x) => { const me = S.players[pid], want = me.hp > me.maxHp * 0.6 && hurtSoon(x, S, pid) < 0.4 ? 'frenzy' : 'calm'; return want !== me.st; },
      use: (c) => { c.me.st = c.me.st === 'frenzy' ? 'calm' : 'frenzy'; return c.me.st === 'frenzy' ? 'lets the frenzy in: +35% damage, -8% HP a round' : 'calms down'; } },
    binder('Blood Prison', 120, 1.2),
    { name: 'Revenant', cd: cd(120), ph: 1, ai: 'iframe', desc: () => 'This round your HP can’t drop below 1, whatever hits you (even an ultimate), and you deal +25% damage',
      use: (c) => { c.buff(c.pid, { k: 'revenant', n: 1, name: 'Revenant', undying: true, dmg: 1.25 }); return 'can’t fall this round'; } }] });

// ============================== Nova ==============================
add('kaiser', { name: 'Kaiser', role: 'Damage / Tank', hp: 1300, basic: 'Gigas Wave', origin: { name: 'Nova Triumphant' },
  trait: ['Final Form', 'Right answers fill the Morph Gauge (4). When it is full you take Final Form for 2 rounds: +40% damage, 30% less damage taken. Then it starts over.'],
  gauge: { name: 'Morph', max: 4 },
  end: (c) => { if (c.hasBuff('final-form')) return; if (c.power > 0 && ++c.me.g >= 4) { c.me.g = 0; c.buff(c.pid, { k: 'final-form', n: 3, name: 'Final Form', dmg: 1.4, taken: 0.7 }); c.note('takes <b>Final Form</b> for 2 rounds'); } },
  skills: [summon('Nova Guardians', cd(120), 0.8, du(45) + 1),
    self("Kaiser's Majesty", cd(120), du(30), { dmg: 1.3 }, { note: 'Your other class skills come back 1 round sooner', then: (c) => { c.cdr(c.pid, 1, 'kaisers-majesty'); } }),
    { name: 'Final Trance', cd: cd(240), ph: 0, ai: 'buff', desc: () => 'Take Final Form right now, for 2 rounds: +40% damage, 30% less damage taken', use: (c) => { c.me.g = 0; c.buff(c.pid, { k: 'final-form', n: 2, name: 'Final Form', dmg: 1.4, taken: 0.7 }); return 'takes Final Form'; } }] });

const possess = (name, cdr, mult, more) => ({ name, cd: cdr, ph: 2, ai: 'burst', desc: (C) => `${dn(C, mult)} damage (${dn(C, mult * 1.5)} when Possessed)${more?.note ? '. ' + more.note : ''}`,
  use: (c) => { const p = c.me.g > 0; if (p) { c.me.g--; c.heal(c.pid, 0.08); } c.hit(mult * (p ? 1.5 : 1), { n: (p ? '[Possess] ' : '') + name }); return more?.then?.(c); } });
add('kain', { name: 'Kain', role: 'Damage / Sustain', hp: 1000, basic: 'Falling Dust', origin: { name: 'Total Annihilation' },
  trait: ['Possession', 'Each right answer gathers a Malice stone (max 3). An attack skill used with Malice is Possessed: it spends 1 stone, hits 50% harder and heals you 8% HP.'],
  gauge: { name: 'Malice', max: 3 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(3, c.me.g + 1); },
  skills: [possess('Dragon Burst', cd(60), 1.5), possess('Grip of Agony', cd(120), 2.6),
    self('Thanatos Descent', cd(120), du(35), { dmg: 1.45 }, { note: 'Malice to 3', then: (c) => { c.me.g = 3; } })] });

add('cadena', { name: 'Cadena', role: 'Damage (variety)', hp: 1000, basic: 'Chain Arts: Thrash', origin: { name: 'Chain Arts: Grand Arsenal', short: 'Grand Arsenal' },
  trait: ['Weapon Variety', 'Use a different class skill than the last one you used and you gain a stack (max 6): +7% damage each. A round with no class skill, or the same one again, loses a stack.'],
  gauge: { name: 'Variety', max: 6 },
  mult: (c) => 1 + 0.07 * c.me.g,
  cast: (c, sk) => { if (!sk.common) c.me.v.now = sk.key; },
  end: (c) => { const now = c.me.v.now; if (now && now !== c.me.v.prev) c.me.g = Math.min(6, c.me.g + 1); else c.me.g = Math.max(0, c.me.g - 1); if (now) c.me.v.prev = now; c.me.v.now = null; },
  skills: [expose('Summon Spiked Bat', 2, 1, 1.08, 1.5), binder('Chain Arts: Beatdown', 120, 1.2), self('Chain Arts: Void Strike', cd(120), du(40), { dmg: 1.5 })] });

add('angelic-buster', { name: 'Angelic Buster', role: 'Damage / Support', hp: 950, basic: 'Trinity', origin: { name: 'Grand Finale', note: 'Party +20% damage for 2 rounds', then: (c) => { c.party({ k: 'grand-finale', n: 2, name: 'Grand Finale', dmg: 1.2 }); } },
  trait: ['Soul Recharge', 'After you use a class skill there is a 40% chance it recharges on the spot: no cooldown.'],
  cast: (c, sk) => { if (!sk.common && !sk.origin && c.rand() < 0.4) { c.me.cd[sk.key] = 0; c.note(`<b>Recharge!</b> ${sk.name} is ready again`); } },
  skills: [expose('Finale Ribbon', cd(40), 2, 1.1, 1), atk('Supreme Supernova', cd(60), 1.7), dodge('Sparkle Burst', 120, 3)] });

// ============================== Sengoku ==============================
add('kanna', { name: 'Kanna', role: 'Summoner (top damage)', hp: 900, basic: 'Soul-Shatter Talisman', origin: { name: '[Divine Will] Advent of Crimson', short: 'Advent of Crimson' },
  trait: ['Shikigami', 'Your Shikigami fight on their own every round, even when you answer wrong. Each one that is out (max 3) also adds +12% to your own damage. Keep Oni and Orochi summoned, then unleash them with True Name Revelation.'],
  gauge: { name: 'Shikigami', max: 3 },
  mult: (c, o) => (o.sum ? (c.hasBuff('true-name-revelation') ? 2 : 1) : 1 + 0.12 * Math.min(3, c.me.sum.length)),
  end: (c) => { c.me.g = Math.min(3, c.me.sum.length); },
  skills: [summon('Summon Oni', cd(60), 0.45, du(55) + 1), summon('Summon Orochi', cd(120), 0.9, 2),
    self('True Name Revelation', cd(120), du(30), { dmg: 1.3 }, { note: 'Your Shikigami hit twice as hard' }),
    binder('Barrier: Spirit Chains', 120, 1)] });

add('hayato', { name: 'Hayato', role: 'Burst damage', hp: 1150, basic: '[Shinsoku] Mist Slash', origin: { name: 'Shin Quick Draw' },
  trait: ['Sword Energy', 'Shinsoku strikes build Sword Energy: +1 per right answer (max 3). Battou skills spend all of it and hit harder for each. Reactive Focus: 25% chance to parry a hit (not an ultimate).'],
  gauge: { name: 'Sword Energy', max: 3 },
  hitBy: (c) => { if (c.rand() < 0.25) { c.tell('boss', '⚔️ parries the hit (Reactive Focus)', { k: 'dodge' }); return true; } },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(3, c.me.g + 1); },
  skills: [
    { name: "[Battou] Full Moon's Rage", short: "Full Moon's Rage", cd: cd(60), ph: 2, ai: 'burst', desc: (C) => `${dn(C, 1)} damage + ${dn(C, 0.6)} per Sword Energy (it spends them all)`, bot: (S, pid, x) => x.know && x.mv.k !== 'shield' && (S.players[pid].g >= 2 || x.mv.k === 'bound'),
      use: (c) => { c.hit(1 + 0.6 * c.me.g, { n: "Full Moon's Rage" }); if (c.power > 0 && !c.hasBuff('shogetsu-form')) c.me.g = 0; } },
    self('Shogetsu Form', cd(120), du(30), { dmg: 1.7 }, { note: 'Battou skills don’t spend Sword Energy' }),
    { name: '[Battou] Wailing Heavens', short: 'Wailing Heavens', cd: cd(120), ph: 1, ai: 'iframe', desc: (C) => `${dn(C, 2)} damage + ${dn(C, 0.6)} per Sword Energy (it spends them all), and you can’t be touched this round`,
      bot: (S, pid, x) => x.mv.k === 'ult' || (x.know && (x.mv.k === 'bound' || x.mv.k === 'tired')),
      use: (c) => { c.iframe(c.pid); c.hit(2 + 0.6 * c.me.g, { n: 'Wailing Heavens' }); if (c.power > 0 && !c.hasBuff('shogetsu-form')) c.me.g = 0; return 'can’t be touched this round'; } }] });

// ============================== Flora ==============================
add('adele', { name: 'Adele', role: 'Damage', hp: 1150, basic: 'Cleave', origin: { name: 'Maestro' },
  trait: ['Aether Swords', 'Each right answer forges an Aether Sword (max 6): +5% damage each, and they never break.'],
  gauge: { name: 'Swords', max: 6 },
  mult: (c) => 1 + 0.05 * c.me.g,
  end: (c) => { if (c.power > 0) c.me.g = Math.min(6, c.me.g + 1); },
  skills: [atk('Ruin', cd(60), 1.7), binder('Blade Torrent', 120, 1.5), dodge('Infinity Blade', 120, 3)] });

add('ark', { name: 'Ark', role: 'Damage (forms)', hp: 1100, basic: 'Basic Charge Drive', origin: { name: 'Primordial Abyss' },
  trait: ['Specter State', 'Right answers in Flora form fill the Spell Gauge (4). Specter State spends 1 a round: +40% damage, and right answers heal 5% HP. Empty: back to Flora.'],
  gauge: { name: 'Spell', max: 4 }, stances: { flora: 'Flora', specter: 'Specter' },
  mult: (c) => (c.me.st === 'specter' ? 1.4 : 1),
  after: (c) => { if (c.me.st === 'specter' && c.power > 0) c.heal(c.pid, 0.05); },
  end: (c) => { if (c.me.st === 'specter') { if (--c.me.g <= 0) { c.me.g = 0; c.me.st = 'flora'; c.note('falls back to Flora form'); } } else if (c.power > 0) c.me.g = Math.min(4, c.me.g + 1); },
  skills: [
    { name: 'Specter State', cd: 0, ph: 0, ai: 'stance', ok: (me) => me.st === 'specter' || me.g >= 2, desc: () => 'On / off (needs 2 Spell Gauge to turn on). While on: +40% damage, right answers heal 5% HP, 1 gauge a round',
      bot: (S, pid, x) => { const me = S.players[pid]; return me.st === 'flora' && (me.g >= 3 || (me.g >= 2 && x.mv.k === 'bound')) && x.mv.k !== 'shield'; },
      use: (c) => { c.me.st = c.me.st === 'specter' ? 'flora' : 'specter'; return c.me.st === 'specter' ? 'lets the Specter out' : 'returns to Flora form'; } },
    binder('Blissful Restraint', 120, 1.5),
    dodge('Abyssal Recall', 120, 3, { note: 'Spell Gauge +2', then: (c) => { c.me.g = Math.min(4, c.me.g + 2); } })] });

add('illium', { name: 'Illium', role: 'Damage / Support', hp: 850, basic: 'Radiant Javelin', origin: { name: 'Mytocrystal Expanse' },
  trait: ['Crystal Charge', 'Right answers charge the Crystal (5). Full: Wings of Glory for 2 rounds: +45% damage. Then it starts over.'],
  gauge: { name: 'Crystal', max: 5 },
  end: (c) => { if (c.hasBuff('glory-wings')) return; if (c.power > 0 && ++c.me.g >= 5) { c.me.g = 0; c.buff(c.pid, { k: 'glory-wings', n: 3, name: 'Wings of Glory', dmg: 1.45 }); c.note('spreads <b>Wings of Glory</b>: +45% damage for 2 rounds'); } },
  skills: [summon('Templar Knight', cd(120), 0.8, 2),
    { name: 'Crystalline Bulwark', cd: cd(120), ph: 1, ai: 'partyiframe', team: true, desc: () => 'The whole party can’t be touched this round, not even by an ultimate',
      use: (c) => { for (const id of c.alive()) c.iframe(id); return 'shields the party: nobody can be touched this round'; } },
    atk('Crystal Ignition', cd(120), 3.4)] });

add('khali', { name: 'Khali', role: 'Damage (speed)', hp: 950, basic: 'Arts: Flurry', origin: { name: 'Hex: Sandstorm' },
  trait: ['Chakrams', 'Fast and precise: a right answer in under 10 s throws a chakram for +35% of your main attack; under 5 s, two.'],
  after: (c) => { if (c.power > 0 && c.sec != null && c.sec < 10) c.hit(0.35 * (c.sec < 5 ? 2 : 1), { n: 'Chakram' }); },
  skills: [atk('Hex: Pandemonium', 2, 1.7), dodge('Void Burst', 120, 3),
    self('Oblivion', cd(120), du(30), { dmg: 1.5 }, { note: 'Hex: Pandemonium is ready again', then: (c) => { c.me.cd['hex-pandemonium'] = 0; } })] });

// ============================== Anima ==============================
add('hoyoung', { name: 'Hoyoung', role: 'Damage (rhythm)', hp: 950, basic: 'Humanity: Gold-Banded Cudgel', origin: { name: 'Sage: Apotheosis' },
  trait: ['Heaven, Earth, Humanity', 'Your right answers cycle the three attributes. Every 3rd one finishes the cycle: your Clone joins you next round, +50% damage.'],
  gauge: { name: 'Attributes', max: 3 },
  end: (c) => { if (c.power > 0 && ++c.me.g >= 3) { c.me.g = 0; c.buff(c.pid, { k: 'clone', n: 2, name: 'Talisman: Clone', dmg: 1.5 }); c.note('finishes the cycle: <b>Clone</b> next round, +50% damage'); } },
  status: (me) => (me.buffs.some((f) => f.k === 'clone') ? '👥 Clone is with you this round: +50% damage' : null),
  skills: [binder('Sage: Tai Yu Clone', 120, 1.5), summon('Scroll: Tiger of Songyu', cd(120), 0.8, 2),
    { name: 'Sage: Wrath of Gods', cd: cd(180), ph: 0, ai: 'buff', desc: () => 'You can’t be touched this round, and +35% damage for 2 rounds',
      use: (c) => { c.iframe(c.pid); c.buff(c.pid, { k: 'wrath-of-gods', n: 2, name: 'Wrath of Gods', dmg: 1.35 }); return 'untouchable this round, +35% damage for 2 rounds'; } }] });

add('lara', { name: 'Lara', role: 'Damage / Support (veins)', hp: 850, basic: 'Essence Sprinkle', origin: { name: 'Universe in Bloom' },
  trait: ['Dragon Vein', 'A dragon vein runs under the party; Dragon Vein Conversion changes it, any round. Heaving River: you deal +20% damage. Whirlwind: whole party +10% damage. Sunrise Well: whole party heals 5% HP a round.'],
  stances: { river: 'Heaving River', wind: 'Whirlwind', sun: 'Sunrise Well' },
  mult: (c) => (c.me.st === 'river' ? 1.2 : 1),
  aura: (c) => { const st = c.me.st; for (const id of c.alive()) c.S.players[id].buffs = c.S.players[id].buffs.filter((f) => f.k !== 'vein'); if (st === 'wind') c.party({ k: 'vein', n: 1, name: 'Whirlwind', dmg: 1.1 }); if (st === 'sun') c.party({ k: 'vein', n: 1, name: 'Sunrise Well', regen: 0.05 }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Dragon Vein Conversion', cd: 0, ph: 0, ai: 'stance', options: ['Eruption: Heaving River: you deal +20% damage', 'Eruption: Whirlwind: party +10% damage', 'Eruption: Sunrise Well: party heals 5% HP a round'], desc: () => 'Change the dragon vein',
      bot: (S, pid, x) => { const hurt = x.ids.some((id) => S.players[id].hp < S.players[id].maxHp * 0.5), want = hurt ? 'sun' : x.ids.length >= 3 ? 'wind' : 'river'; return want !== S.players[pid].st ? ['river', 'wind', 'sun'].indexOf(want) : null; },
      use: (c, i) => { c.me.st = ['river', 'wind', 'sun'][+i] || 'river'; c.C.aura(c); return `turns the vein to ${c.C.stances[c.me.st]}`; } },
    binder('Vine Coil', 120, 1), atk('Big Stretch', cd(60), 1.9), atk("Land's Connection", cd(120), 3.4)] });

add('ren', { name: 'Ren', role: 'Damage / Guard', hp: 1150, basic: 'Plum Blossom Sword: Storm', origin: { name: 'Rising Azure Dragon: Divided Heavens', short: 'Divided Heavens' },
  trait: ['Wish Unending', 'Your sword forms follow one another: every 4th right answer ends in a Final Imugi technique, a bonus hit worth 200% of your main attack.'],
  gauge: { name: 'Forms', max: 4 },
  after: (c) => { if (c.power > 0 && ++c.me.g >= 4) { c.me.g = 0; c.hit(2, { n: 'Final Imugi Spirit Sword' }); } },
  skills: [{ ...binder('Fifth Plum Blossom Sword: Plum Branch Snare', 120, 1.5), short: 'Plum Branch Snare' },
    { ...brace('Final Plum Blossom Sword: Dancing Annihilation', 120, 3.2, 0.5), short: 'Dancing Annihilation' },
    { ...brace('Fourth Plum Blossom Sword: Unbowed Blade', 70, 0.8, 0.3), short: 'Unbowed Blade', ai: 'guard' }] });

// ============================== Jianghu ==============================
add('lynn', { name: 'Lynn', role: 'Healer / Support', hp: 900, basic: 'Strike', origin: { name: 'Source Flow' },
  trait: ['Spirit Guides', 'Your beasts join in on their own: 40% of your main attack every round, even when you answer wrong. With a teammate to Focus on (a party of 2 or more) all your damage is +4%.'],
  mult: (c) => (c.ids.length >= 2 ? 1.04 : 1),
  after: (c) => { c.hit(0.4, { n: 'Sneak Attack', free: 1 }); },
  skills: [ally('[Focus] Awaken', cd(120), 1, { dmg: 1.4, ied: 0.5 }, { pickAlly: otherAlly }),
    { name: "Nature's Grace", cd: cd(120), ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 30% HP; everyone takes 20% less damage this round',
      use: (c) => { const h = c.healAll(0.3); c.party({ k: 'natures-grace', n: 1, name: "Nature's Grace", taken: 0.8 }); return `heals the party for ${fmt(h)} HP`; } },
    atk("Beast's Rage", cd(120), 3.2)] });

add('mo-xuan', { name: 'Mo Xuan', role: 'Damage (links)', hp: 1100, basic: 'Xuanshan Arts [Tian]', origin: { name: 'Soul Art: Jianghu Dragon' },
  trait: ['Divine Fist', 'Link your forms into arts: every round you use a class skill adds a Divine Fist stack (max 5): +8% damage each. A round without one loses a stack.'],
  gauge: { name: 'Divine Fist', max: 5 },
  mult: (c) => 1 + 0.08 * c.me.g,
  cast: (c, sk) => { if (!sk.common) c.me.v.used = true; },
  end: (c) => { c.me.g = c.me.v.used ? Math.min(5, c.me.g + 1) : Math.max(0, c.me.g - 1); c.me.v.used = false; },
  skills: [atk('Divine Art: Howling Storm', cd(60), 1.8), binder('Secret Art: Qi Disruption', 120, 1), self('Soul Art: The Opened Gate', cd(120), du(20), { dmg: 1.55 })] });

// ============================== Shine ==============================
add('sia-astelle', { name: 'Sia Astelle', role: 'Damage (constellations)', hp: 850, basic: 'Ray', origin: { name: 'Celestial Design' },
  trait: ['Stellagram', 'Every right answer fires a Ray. Every 4th Ray summons Stellar I - Antares, which hits every round for 3 rounds, even when you answer wrong. Appear makes every skill stronger while it lasts: Rays count double and your stars hit 50% harder.'],
  gauge: { name: 'Rays', max: 4 },
  mult: (c, o) => (o.sum && c.hasBuff('appear') ? 1.5 : 1),
  after: (c) => { if (c.power > 0) { c.me.g += c.hasBuff('appear') ? 2 : 1; if (c.me.g >= 4) { c.me.g -= 4; c.summon('Stellar I - Antares', 0.5, 3); c.note('completes a constellation: <b>Stellar I - Antares</b> fights for 3 rounds'); } } },
  skills: [self('Appear', cd(120), du(10), { dmg: 1.6 }, { note: 'Rays count double and your stars hit 50% harder' }),
    summon('Stellar XI - Sirius', cd(60), 0.45, 2), atk('Stellar XII - Sadalsuud', cd(120), 3.2), binder('Time Binder', 120, 0.8)] });

add('erel-light', { name: 'Erel Light', role: 'Burst damage', hp: 1200, atkBase: 0.7, basic: 'Spear of Lugh', origin: { name: 'Fall of Melin' },
  trait: ['Shining Sentinels', 'Your spear is light; your damage is Destruction of Roan. While a sentinel is out you take 20% less damage and Destruction of Roan hits 30% harder.'],
  taken: (c) => (c.me.sum.length ? 0.8 : 1),
  skills: [
    { name: 'Destruction of Roan', cd: cd(120), ph: 2, ai: 'burst', desc: (C) => `Hold it down: ${dn(C, 8)} damage (${dn(C, 10.4)} with a sentinel out)`, use: (c) => { c.hit(c.me.sum.length ? 10.4 : 8, { n: 'Destruction of Roan' }); } },
    summon('Sentinel Rise', cd(60), 0.6, 2),
    { name: 'Shield of Chulainn', cd: cd(120), ph: 1, ai: 'iframe', desc: () => 'You can’t be touched this round, not even by an ultimate', use: (c) => { c.iframe(c.pid); return 'raises the Shield of Chulainn'; } }] });

// ============================== Others ==============================
add('kinesis', { name: 'Kinesis', role: 'Damage / Control', hp: 850, basic: 'Psychic Smash', origin: { name: 'From Another Realm' },
  trait: ['Psychic Points', 'Each right answer restores 2 PP (max 10). Ultimates cost PP; Breakthrough fills it.'],
  gauge: { name: 'PP', max: 10 }, init: (p) => { p.g = 5; },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(10, c.me.g + 2); },
  skills: [binder('Mental Shock', 120, 1.2), spend(5, 'PP', atk('Psychic Nova', cd(120), 3.6)),
    self('Breakthrough', cd(120), du(30), { dmg: 1.4 }, { note: 'PP to 10', then: (c) => { c.me.g = 10; } })] });

add('zero', { name: 'Zero', role: 'Damage / Support', hp: 1150, basic: 'Giga Crash', origin: { name: 'End Time' },
  trait: ['Tag', 'Alpha and Beta take turns, a round each. Alpha: right answers in under 8 s deal +30%. Beta: +15% damage and 20% less damage taken. Steady damage, little burst.'],
  stances: { alpha: 'Alpha', beta: 'Beta' },
  mult: (c, o) => (c.me.st === 'alpha' ? (o.free == null && c.sec != null && c.sec < 8 ? 1.3 : 1) : 1.15),
  taken: (c) => (c.me.st === 'beta' ? 0.8 : 1),
  end: (c) => { c.me.st = c.me.st === 'alpha' ? 'beta' : 'alpha'; },
  skills: [binder('Chrono Break', 120, 1.2),
    { name: 'Time Holding', cd: cd(120), ph: 1, ai: 'partyiframe', noReset: true, team: true, desc: () => 'Time stops: the whole party can’t be touched this round (not even by an ultimate), and everyone’s other cooldowns drop by 1',
      use: (c) => { for (const id of c.alive()) { c.iframe(id); c.cdr(id, 1, 'time-holding'); } return 'stops time: nobody can be touched this round, cooldowns -1'; } },
    atk('Twin Blades of Time', cd(120), 3.2)] });

add('lethe', { name: 'Lethe', role: 'Summoner / Control', hp: 900, basic: 'Assize', origin: { name: 'Dominus: Eye of Eternity', short: 'Eye of Eternity' },
  trait: ['Covenant', 'A pact with your summons: while one is out, your own attacks deal +20% damage.'],
  mult: (c, o) => (o.sum ? (c.hasBuff('chains-of-command') ? 1.5 : 1) : c.me.sum.length ? 1.2 : 1),
  skills: [summon('Beckon: Dread Knight', 2, 0.45, 2), binder('Nullification', 120, 1.5),
    self('Chains of Command', cd(120), du(30), { dmg: 1.4 }, { note: 'Your summons hit 50% harder' })] });

add('beast-tamer', { name: 'Beast Tamer', role: 'Support (animals)', hp: 950, basic: 'Furious Strikes', origin: { name: 'Aerial Relief' },
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

// Boss Raid: every class's kit (the rules are in raid.js). A class =
//   - its main bossing attack (the 4th job attack with no cooldown): free, every round you answer right
//   - one trait that makes it play its own way
//   - its real skills: the ones on a ~1 minute cooldown come back every 2 rounds, its 2-minute burst skills every 4
//   - its Origin (every 12 rounds: binds, and you can't be touched), its Ascent (twice a fight, the same damage for
//     every class) and its faction's skill (the 3rd HEXA Common Node: Blitz Shield, Freud's Wisdom, ...)
// No class has a bind or an untouchable skill of its own: that is Erda Nova, Aeonian Rise, the Origin and the Ascent.
// Skill names, cooldowns and durations are the game's (GMS, from grandislibrary.com's class pages and the v.271 patch
// notes, Nov 2026): cd(seconds) and du(seconds) turn them into rounds at 30 s a round.
// Damage numbers are multiples of the class's main attack. Two things are set by tools/raid-sim.js so that the classes
// stand to each other the way they do in the game's own damage charts (CHART below): TUNE = how hard a class hits
// over a whole fight, ORIGIN = how much of that comes from its Origin.
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
const TUNE = { 'hero': 0.886, 'paladin': 1.147, 'dark-knight': 1.286, 'bishop': 0.815, 'arch-mage-i-l': 0.861, 'arch-mage-f-p': 1.115, 'dual-blade': 1.278, 'shadower': 1.006, 'night-lord': 1.132, 'pathfinder': 1.078, 'marksman': 0.894, 'bow-master': 1.136, 'cannoneer': 1.058, 'buccaneer': 1.160, 'corsair': 0.902, 'jett': 1.257, 'dawn-warrior': 0.818, 'blaze-wizard': 0.978, 'wind-archer': 0.897, 'night-walker': 0.858, 'thunder-breaker': 0.901, 'mihile': 0.940, 'mercedes': 0.897, 'aran': 1.037, 'phantom': 1.138, 'luminous': 1.091, 'evan': 0.885, 'shade': 0.879, 'battle-mage': 0.916, 'blaster': 1.042, 'mechanic': 0.760, 'wild-hunter': 0.899, 'xenon': 0.998, 'demon-slayer': 1.131, 'demon-avenger': 0.826, 'kaiser': 1.020, 'kain': 1.043, 'cadena': 1.143, 'angelic-buster': 0.824, 'kanna': 0.988, 'hayato': 0.758, 'adele': 0.760, 'ark': 0.858, 'illium': 0.885, 'khali': 1.049, 'hoyoung': 1.268, 'lara': 1.112, 'ren': 1.052, 'lynn': 1.017, 'mo-xuan': 0.983, 'sia-astelle': 0.980, 'erel-light': 1.328, 'kinesis': 1.038, 'zero': 1.220, 'lethe': 0.734, 'beast-tamer': 1.598 };
const ORIGIN = { 'hero': 0.448, 'paladin': 0.450, 'dark-knight': 0.450, 'bishop': 0.431, 'arch-mage-i-l': 0.431, 'arch-mage-f-p': 0.450, 'dual-blade': 0.450, 'shadower': 0.450, 'night-lord': 0.479, 'pathfinder': 0.450, 'marksman': 0.376, 'bow-master': 0.488, 'cannoneer': 0.450, 'buccaneer': 0.450, 'corsair': 0.395, 'jett': 0.450, 'dawn-warrior': 0.450, 'blaze-wizard': 0.450, 'wind-archer': 0.529, 'night-walker': 0.462, 'thunder-breaker': 0.450, 'mihile': 0.450, 'mercedes': 0.469, 'aran': 0.488, 'phantom': 0.450, 'luminous': 0.450, 'evan': 0.340, 'shade': 0.448, 'battle-mage': 0.436, 'blaster': 0.450, 'mechanic': 0.381, 'wild-hunter': 0.490, 'xenon': 0.460, 'demon-slayer': 0.531, 'demon-avenger': 0.450, 'kaiser': 0.450, 'kain': 0.502, 'cadena': 0.533, 'angelic-buster': 0.450, 'kanna': 0.602, 'hayato': 0.776, 'adele': 0.421, 'ark': 0.450, 'illium': 0.450, 'khali': 0.450, 'hoyoung': 0.445, 'lara': 0.450, 'ren': 0.433, 'lynn': 0.395, 'mo-xuan': 0.407, 'sia-astelle': 0.417, 'erel-light': 0.517, 'kinesis': 0.455, 'zero': 0.310, 'lethe': 0.450, 'beast-tamer': 0.450 };
R.TUNE = TUNE; R.ORIGIN = ORIGIN;

// ---------- Helpers ----------
const lowest = (c, notMe) => c.alive().filter((id) => !notMe || id !== c.pid).sort((x, y) => c.S.players[x].hp / c.S.players[x].maxHp - c.S.players[y].hp / c.S.players[y].maxHp)[0];
const otherAlly = (S, pid, ids) => { const o = ids.filter((id) => id !== pid); return o.length ? o[Math.floor(Math.random() * o.length)] : pid; };
// A skill that also costs some of the class's gauge
const spend = (n, word, sk) => ({ ...sk, cost: n,
  ok: (me, S) => me.g >= n && (!sk.ok || sk.ok(me, S)),
  desc: (C) => `${typeof sk.desc === 'function' ? sk.desc(C) : sk.desc}. Costs ${n} ${word}`,
  use: (c, arg) => { c.me.g -= n; return sk.use(c, arg); } });
const m1 = (name, mult = 1.3, o = {}) => atk(name, 2, mult, o);     // a ~1 minute skill
const m2 = (name, mult = 2.8, o = {}) => atk(name, 4, mult, o);     // a 2 minute burst skill
// A switch between a class's two modes (free, any round)
const swap = (name, text, bot) => ({ name, cd: 0, ph: 0, ai: 'stance', desc: () => text, bot,
  use: (c) => { const ks = Object.keys(c.C.stances); c.me.st = ks[(ks.indexOf(c.me.st) + 1) % ks.length]; return `turns to ${c.C.stances[c.me.st]}`; } });

// ---------- Faction skills (the 3rd HEXA Common Node, v.271) ----------
const once = (text, fn) => ({ cd: 0, ph: 0, ai: 'passive', passive: true, ok: () => false, desc: () => text, use: () => '', lethal: fn });
const FACTIONS = {
  'explorer-warrior': { name: 'Blitz Shield', cd: 2, ph: 1, ai: 'guard',
    desc: (C) => `A shield for this round: you take 50% less damage. Then it bursts for ${dn(C, 0.8)} damage`,
    bot: (S, pid, x) => x.know || x.incoming > S.players[pid].hp * 0.3,
    use: (c) => { c.buff(c.pid, { k: 'blitz-shield', n: 1, name: 'Blitz Shield', taken: 0.5 }); c.hit(0.8, { n: 'Blitz Shield' }); return 'takes 50% less damage this round'; } },
  'explorer-mage': { name: 'Arcane Overdrive', cd: 4, ph: 0, ai: 'buff',
    desc: () => 'Your damage is +21% this round, +14% the next, +7% the one after',
    use: (c) => { c.buff(c.pid, { k: 'arcane-overdrive', n: 3, name: 'Arcane Overdrive', dmg: 1.21, decay: 0.07 }); return '+21% damage, fading over 3 rounds'; } },
  'explorer-archer': summon('Fury of the Wild', 4, 0.6, 2),
  'explorer-thief': self('Shadow Walker', 4, 1, { dmg: 1.2, taken: 0.5 }),
  'explorer-pirate': party("Pirate's Banner", 4, 1, { dmg: 1.12 }),
  'cygnus': m1('Phalanx Charge', 1.2),
  'hero': { name: "Freud's Wisdom", cd: 12, ph: 0, ai: 'buff',
    desc: () => 'You can’t be touched for 2 rounds (not even by an ultimate) and deal +25% damage for 4 rounds',
    bot: (S, pid, x) => (x.inWin && x.know) || (x.mv.k === 'ult' && !x.inWin && !('rise' in x.out)),
    use: (c) => { c.iframe(c.pid); c.buff(c.pid, { k: 'freuds-guard', n: 2, name: "Freud's Wisdom (untouchable)", iframe: true }); c.buff(c.pid, { k: 'freuds-wisdom', n: 4, name: "Freud's Wisdom", dmg: 1.25 }); return 'can’t be touched for 2 rounds, +25% damage for 4'; } },
  'resistance': summon('Resistance Infantry', 2, 0.9, 1),
  'demon': { name: 'Defender of the Demon', cd: 4, ph: 0, ai: 'buff', team: true,
    desc: (C) => `Whole party, 2 rounds: 25% less damage taken. ${dn(C, 1)} damage`,
    use: (c) => { c.party({ k: 'defender-of-the-demon', n: 2, name: 'Defender of the Demon', taken: 0.75 }); c.hit(1, { n: 'Defender of the Demon' }); return 'the party takes 25% less damage for 2 rounds'; } },
  'nova': { name: 'Might of the Nova', ...once('Always on: once a fight, a hit that would take you down leaves you standing at 1 HP instead (even an ultimate)',
    (c) => { if (c.me.v.nova) return ''; c.me.v.nova = 1; c.me.hp = 1; return 'refuses to fall: <b>Might of the Nova</b> (1 HP left)'; }) },
  'zero': self('Transcendent', 4, 2, { dmg: 1.2 }),
  'kinesis': summon('Afterimage of the Otherworld', 2, 0.6, 1),
  'flora': self('Conversion Overdrive', 4, 2, { dmg: 1.25 }),
  'jianghu': { name: 'Ring of Samsara', cd: 4, ph: 0, ai: 'buff', options: ['Might: +20% damage for 2 rounds', 'Boon: heal 40% HP, 25% less damage taken for 2 rounds'],
    desc: () => 'Choose. Might: +20% damage for 2 rounds. Boon: heal 40% HP and take 25% less damage for 2 rounds',
    pickOption: (S, pid) => (S.players[pid].hp < S.players[pid].maxHp * 0.45 ? 1 : 0),
    use: (c, o) => { if (+o === 1) { c.heal(c.pid, 0.4); c.buff(c.pid, { k: 'ring-of-samsara', n: 2, name: 'Ring of Samsara: Boon', taken: 0.75 }); return 'Boon: heals and takes 25% less damage for 2 rounds'; }
      c.buff(c.pid, { k: 'ring-of-samsara', n: 2, name: 'Ring of Samsara: Might', dmg: 1.2 }); return 'Might: +20% damage for 2 rounds'; } },
  'sengoku': self('Twilight Bloom', 4, 2, { dmg: 1.15, taken: 0.8 }),
  'anima': { name: 'Lotus Flower', ...once('Always on: the first time you go down in a fight, you get straight back up at full HP without losing a life',
    (c) => { if (c.me.v.lotus) return ''; c.me.v.lotus = 1; c.me.hp = c.me.maxHp; return 'blooms again: <b>Lotus Flower</b> (full HP, no life lost)'; }) },
  'shine': { name: 'Tree of Stars', cd: 4, ph: 0, ai: 'buff',
    desc: (C) => `${dn(C, 1)} damage, and you deal +20% damage for 2 rounds`,
    use: (c) => { c.buff(c.pid, { k: 'tree-of-stars', n: 2, name: 'Tree of Stars', dmg: 1.2 }); c.hit(1, { n: 'Tree of Stars' }); return '+20% damage for 2 rounds'; } },
  'lethe': self('Demonic Wroth', 4, 1, { dmg: 1.3 }),
};
R.FACTIONS = FACTIONS;
const add = (key, C) => {
  C.atk = Math.round(A * (C.atkBase ?? 1) * (TUNE[key] ?? 1) / 10) * 10; C.originK = ORIGIN[key] ?? 1;
  const F = FACTIONS[C.fac];
  if (F) { C.faction = { ...F }; if (F.lethal) { const own = C.lethal; C.lethal = (c) => own?.(c) || F.lethal(c); } }
  R.add(key, C);
};

// ============================== Explorers ==============================
add('hero', { name: 'Hero', role: 'Damage', hp: 1200, basic: 'Raging Blow', fac: 'explorer-warrior', origin: { name: 'Spirit Calibur' }, ascent: { name: 'Ultrasonic Slash' },
  trait: ['Combo Attack', 'Each right answer adds a Combo Orb (max 10): +4% damage each. A wrong answer loses 3. Burning Soul Blade fills them all.'],
  gauge: { name: 'Combo', max: 10 },
  mult: (c) => 1 + 0.04 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(10, c.me.g + 1) : Math.max(0, c.me.g - 3); },
  skills: [m1('Worldreaver', 1.4), m1('Sword Illusion', 1.1),
    summon('Burning Soul Blade', 4, 0.9, 2, { note: 'Combo Orbs to 10', then: (c) => { c.me.g = 10; return 'calls <b>Burning Soul Blade</b> for 2 rounds: Combo Orbs full'; } }),
    self('Cry Valhalla', 4, 1, { dmg: 1.4 }),
    m2('Instinctual Combo', 2.4)] });

add('paladin', { name: 'Paladin', role: 'Tank / Support', hp: 1350, basic: 'Blast', cover: true, fac: 'explorer-warrior', origin: { name: 'Sacred Bastion' }, ascent: { name: 'Dominus Oblivion' },
  trait: ['Parashock Guard', 'You take 25% less damage. When the boss targets a teammate, you step in and take the hit yourself, at half damage.'],
  taken: () => 0.75,
  skills: [m1("Heaven's Hammer", 1.2), m1('Hammers of the Righteous', 1.2),
    ally('Divine Echo', 2, 1, { dmg: 1.3 }, { pickAlly: otherAlly, note: 'They copy your strikes' }),
    m2('Grand Guardian', 3.0)] });

add('dark-knight', { name: 'Dark Knight', role: 'Damage / Sustain', hp: 1300, basic: "Gungnir's Descent", fac: 'explorer-warrior', origin: { name: 'Dead Space' }, ascent: { name: 'Dark Halidom' },
  trait: ['Final Pact', 'Once every 8 rounds, a hit that would take you down leaves you standing at full HP instead (even an ultimate), and you deal +30% damage for 2 rounds.'],
  lethal: (c) => { if (c.me.cd._pact > 0) return ''; c.me.cd._pact = 8; c.me.hp = c.me.maxHp; c.buff(c.pid, { k: 'final-pact', n: 3, name: 'Final Pact', dmg: 1.3 }); return 'refuses to fall: <b>Final Pact</b> (full HP, +30% damage)'; },
  status: (me) => (me.cd._pact > 0 ? `Final Pact back in ${me.cd._pact}` : 'Final Pact ready'),
  skills: [m1('Spear of Darkness', 1.4),
    { name: 'Dark Resonance', cd: 2, ph: 0, ai: 'buff', desc: () => 'Heal 15% HP; this round +15% damage and you ignore 30% of its defense',
      use: (c) => { const h = c.heal(c.pid, 0.15); c.buff(c.pid, { k: 'dark-resonance', n: 1, name: 'Dark Resonance', dmg: 1.15, ied: 0.3 }); return `+${fmt(h)} HP, +15% damage this round`; } },
    m2('Calamitous Cyclone', 3.0),
    summon('Darkness Aura', 4, 0.8, 2, { note: 'You heal 10% HP a round while it is out', then: (c) => { c.buff(c.pid, { k: 'darkness-aura', n: 2, name: 'Darkness Aura', regen: 0.1 }); } })] });

add('bishop', { name: 'Bishop', role: 'Healer / Support', hp: 900, basic: 'Angel Ray', fac: 'explorer-mage', ascent: { name: 'Commandment of Heaven' },
  origin: { name: 'Holy Advent', mult: 5, note: 'For 2 rounds your skills hit 25% harder and the archangels burn the boss every round',
    then: (c) => { c.buff(c.pid, { k: 'holy-advent', n: 2, name: 'Holy Advent', dmg: 1.25 }); c.dot('holy-advent', 1.1, 2, 'Archangels'); } },
  trait: ['Righteously Indignant', 'Two modes, switch any round. Benevolence: every right answer heals the most hurt player 6% HP. Vengeance: you deal +30% damage instead. Bahamut hits the boss every round for 30% of your main attack, even when you answer wrong.'],
  stances: { vengeance: 'Vengeance', benevolence: 'Benevolence' },
  mult: (c) => (c.me.st === 'vengeance' ? 1.3 : 1),
  after: (c) => { if (c.power > 0 && c.me.st === 'benevolence') { const t = lowest(c); if (t) c.heal(t, 0.06); } c.hit(0.3, { n: 'Bahamut', free: 1 }); },
  skills: [swap('Righteously Indignant', 'Switch between Vengeance (+30% damage) and Benevolence (healing)',
      (S, pid, x) => { const hurt = x.ids.some((id) => S.players[id].hp < S.players[id].maxHp * 0.5), want = hurt && x.ids.length > 1 ? 'benevolence' : 'vengeance'; return want !== S.players[pid].st; }),
    m1('Genesis', 1.3),
    { name: "Heaven's Door", cd: 2, ph: 1, ai: 'door', team: true, desc: (C) => `${dn(C, 1)} damage. One player who has no Door yet: the next hit that would take them down leaves them at half HP instead`,
      bot: (S, pid, x) => x.ids.some((id) => !S.players[id].buffs.some((f) => f.door)),
      use: (c) => { c.hit(1, { n: "Heaven's Door" }); const t = c.alive().filter((id) => !c.hasBuff('heavens-door', id)).sort((x, y) => c.S.players[x].hp - c.S.players[y].hp)[0]; if (!t) return ''; c.buff(t, { k: 'heavens-door', n: 6, name: "Heaven's Door", door: true }); return `{p:${t}} can’t be taken down once`; } },
    { name: 'Holy Magic Shell', cd: 3, ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 30% HP', use: (c) => `heals the party for ${fmt(c.healAll(0.3))} HP` },
    party('Benediction', 4, 1, { dmg: 1.33 }),
    m2('Divine Punishment', 2.6)] });

add('arch-mage-i-l', { name: 'Arch Mage (I/L)', role: 'Damage / Control', hp: 850, basic: 'Chain Lightning', fac: 'explorer-mage', origin: { name: 'Frozen Lightning' }, ascent: { name: 'Parabolic Bolt' },
  trait: ['Frostbite', 'Every right answer puts Frost on the boss (max 5, ice skills add more): your attacks deal +6% per Frost. A wrong answer melts 2. At 5 Frost its attacks hit you 15% softer.'],
  gauge: { name: 'Frost', max: 5 },
  mult: (c) => 1 + 0.06 * c.me.g,
  taken: (c) => (c.me.g >= 5 ? 0.85 : 1),
  end: (c) => { c.me.g = c.power > 0 ? Math.min(5, c.me.g + 1) : Math.max(0, c.me.g - 2); },
  skills: [m1('Blizzard', 1.2, { note: '+2 Frost', then: (c) => { c.me.g = Math.min(5, c.me.g + 2); } }), m1('Bolt Barrage', 1.5), m1('Lightning Orb', 1.2),
    m2('Jupiter Thunder', 2.8),
    summon('Spirit of Snow', 4, 0.8, 2, { note: 'Frost to 5', then: (c) => { c.me.g = 5; } })] });

add('arch-mage-f-p', { name: 'Arch Mage (F/P)', role: 'Damage over time', hp: 850, basic: 'Flame Sweep', fac: 'explorer-mage', ascent: { name: 'Immortal Flame' },
  origin: { name: 'Infernal Venom', note: 'Your burns last 3 more rounds', then: (c) => { for (const d of c.b.dots) if (d.by === c.pid) d.n += 3; } },
  trait: ['Burn', 'Every right answer sets a burn on the boss (up to 5): each burns for 15% of your main attack every round for 3 rounds, even on rounds you get wrong. No 2-minute skills: your damage never stops.'],
  basicHit: (c) => { c.hit(1, { n: 'Flame Sweep' }); c.dot('burn', 0.15, 3, 'Burn', 5); },
  skills: [m1('Poison Nova', 1.4),
    m1('Megiddo Flame', 1.0, { note: 'Sets 2 more burns', then: (c) => { c.dot('burn', 0.15, 3, 'Burn', 5); c.dot('burn', 0.15, 3, 'Burn', 5); } }),
    { name: 'DoT Punisher', cd: 2, ph: 2, ai: 'atk', desc: (C) => `${dn(C, 0.35)} damage for every burn on the boss`,
      bot: (S, pid, x) => x.know && S.boss.dots.filter((d) => d.by === pid).length >= 3,
      use: (c) => { const n = c.b.dots.filter((d) => d.by === c.pid).length; if (n) c.hit(0.35 * n, { n: 'DoT Punisher' }); return ''; } },
    summon('Elemental Fury', 2, 1.0, 1),
    m1('Poison Chain', 1.1)] });

add('dual-blade', { name: 'Dual Blade', role: 'Damage', hp: 1000, basic: 'Phantom Blow', fac: 'explorer-thief', origin: { name: 'Karma Blade' }, ascent: { name: "Yama's Decree" },
  trait: ['Mirror Image', 'Your shadow copies your main attack at 30% damage. Every right answer in a row sharpens all your damage (+4%, up to +20%); a wrong answer resets it. No 2-minute skills: Final Cut keeps you strong.'],
  gauge: { name: 'Flow', max: 5 },
  mult: (c) => 1 + 0.04 * c.me.g,
  after: (c) => { if (c.power > 0) c.hit(0.3, { n: 'Mirror Image' }); },
  end: (c) => { c.me.g = c.power > 0 ? Math.min(5, c.me.g + 1) : 0; },
  skills: [m1("Asura's Anger", 1.5), m1('Blade Storm', 1.4), m1('Blade Tornado', 1.2),
    { name: 'Final Cut', cd: 2, ph: 2, ai: 'atk', desc: (C) => `${dn(C, 0.8)} damage, and you deal +15% damage for 2 rounds`,
      use: (c) => { c.hit(0.8, { n: 'Final Cut' }); c.buff(c.pid, { k: 'final-cut', n: 2, name: 'Final Cut', dmg: 1.15 }); return ''; } }] });

add('shadower', { name: 'Shadower', role: 'Damage / Support', hp: 1050, basic: 'Assassinate', fac: 'explorer-thief', origin: { name: 'Halve Cut' }, ascent: { name: 'Covetous Darkness' },
  trait: ['Meso Explosion', 'Right answers scatter mesos. Every 3rd one blows them up: a bonus hit worth 150% of your main attack.'],
  gauge: { name: 'Mesos', max: 3 },
  after: (c) => { if (c.power > 0 && ++c.me.g >= 3) { c.me.g = 0; c.hit(1.5, { n: 'Meso Explosion' }); } },
  skills: [m1('Sonic Blow', 1.6), m1('Trickblade', 1.2), summon('Shadow Veil', 2, 0.9, 1),
    m2('Slash Shadow Formation', 3.2),
    party('Smokescreen', 4, 1, { dmg: 1.15 }, { note: 'Critical hits bite deeper inside the smoke' })] });

add('night-lord', { name: 'Night Lord', role: 'Damage', hp: 950, basic: 'Quad Star', fac: 'explorer-thief', origin: { name: 'Life and Death' }, ascent: { name: 'Deep Strike' },
  trait: ["Assassin's Mark", 'Every right answer sets off a mark: an extra star for 30% of your main attack. While Throwing Star Barrage is up, three of them.'],
  after: (c) => { if (c.power > 0) c.hit(c.hasBuff('throwing-star-barrage') ? 0.9 : 0.3, { n: "Assassin's Mark" }); },
  skills: [m1('Shurrikane', 1.2), m1('Death Star', 1.1), summon("Dark Lord's Omen", 2, 1.1, 1),
    self('Throwing Star Barrage', 4, 1, { dmg: 1.2 }, { note: "Three Assassin's Marks instead of one" }),
    self('Throw Blasting', 4, 2, { dmg: 1.2 }, { note: 'Explosive talismans on your stars' })] });

add('pathfinder', { name: 'Pathfinder', role: 'Damage', hp: 950, basic: 'Cardinal Burst', fac: 'explorer-archer', origin: { name: 'Forsaken Relic' }, ascent: { name: 'Piercing Relic' },
  trait: ['Relic Gauge', 'Each right answer charges the Relic (max 4). Nova Blast spends all of it: the fuller, the harder it hits. Awakened Relic fills it at once.'],
  gauge: { name: 'Relic', max: 4 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(4, c.me.g + 1); },
  skills: [m1('Ancient Astra', 1.3), m1('Combo Assault', 1.2),
    { name: 'Nova Blast', cd: 4, ph: 2, ai: 'burst', desc: (C) => `${dn(C, 1)} damage + ${dn(C, 0.6)} for each Relic charge, which it spends`,
      use: (c) => { c.hit(1 + 0.6 * c.me.g, { n: 'Nova Blast' }); c.me.g = 0; return ''; } },
    { name: 'Awakened Relic', cd: 4, ph: 0, ai: 'buff', desc: () => 'Relic Gauge to 4, and +20% damage this round', use: (c) => { c.me.g = 4; c.buff(c.pid, { k: 'awakened-relic', n: 1, name: 'Awakened Relic', dmg: 1.2 }); return 'Relic full, +20% damage this round'; } },
    summon('Relic Unbound', 4, 0.9, 2),
    summon('Ancient Tempest', 4, 1.0, 1)] });

add('marksman', { name: 'Marksman', role: 'Damage (speed)', hp: 950, basic: 'Snipe', fac: 'explorer-archer', origin: { name: 'Final Aim' }, ascent: { name: 'Fatal Trigger' },
  trait: ['Weak Point', 'Speed is everything: a right answer in under 5 seconds deals +40% damage.'],
  mult: (c, o) => (o.free == null && c.sec != null && c.sec < 5 ? 1.4 : 1),
  skills: [m1('Perfect Shot', 1.7), m1('Surge Bolt', 1.3), m1('High Speed Shot', 1.1),
    self('Bullseye Shot', 4, 1, { dmg: 1.3, ied: 0.5 }),
    self('Split Shot', 4, 2, { dmg: 1.2 }),
    m2('Repeating Crossbow Cartridge', 2.4)] });

add('bow-master', { name: 'Bow Master', role: 'Steady damage', hp: 950, basic: 'Hurricane', fac: 'explorer-archer', origin: { name: 'Ascendant Shadow' }, ascent: { name: 'Flashpoint' },
  trait: ['Hurricane', 'A steady stream of arrows: when you answer right your Power is never under 85%, however slow you were.'],
  power: (c, pw) => (pw > 0 ? Math.max(0.85, pw) : 0),
  skills: [m1('Gritty Gust', 1.2),
    summon('Storm of Arrows', 4, 0.6, 2, { note: '+15% damage while it rains', then: (c) => { c.buff(c.pid, { k: 'storm-of-arrows', n: 2, name: 'Storm of Arrows', dmg: 1.15 }); } }),
    summon('Inhuman Speed', 4, 1.0, 1),
    self('Quiver Barrage', 4, 1, { dmg: 1.3 }),
    self('Concentration', 4, 1, { dmg: 1.15, ied: 0.3 })] });

add('cannoneer', { name: 'Cannoneer', role: 'Damage / Gambler', hp: 1100, basic: 'Cannon Barrage', fac: 'explorer-pirate', origin: { name: 'Super Cannon Explosion' }, ascent: { name: 'Barrel of Monkeys' },
  trait: ['Barrel Roulette', 'Every round a barrel rolls out, and you see it before you act: 🔴 +30% damage · 🟢 heal 8% HP · 🔵 take 30% less damage · ⚫ nothing. No 2-minute skills: monkeys and bombs all fight long.'],
  init: (p) => { p.v.barrel = Math.floor(Math.random() * 4); },
  start: (c) => { const r = c.me.v.barrel; if (r === 0) c.buff(c.pid, { k: 'barrel', n: 1, name: 'Red barrel', dmg: 1.3 }); if (r === 2) c.buff(c.pid, { k: 'barrel', n: 1, name: 'Blue barrel', taken: 0.7 }); },
  end: (c) => { if (c.me.v.barrel === 1) c.heal(c.pid, 0.08); c.me.v.barrel = Math.floor(c.rand() * 4); },
  status: (me) => ['🔴 Red barrel: +30% damage', '🟢 Green barrel: heal 8%', '🔵 Blue barrel: 30% less damage', '⚫ Empty barrel'][me.v.barrel],
  skills: [m1('The Nuclear Option', 1.5), m1('Nautilus Strike', 1.1), summon('Rolling Rainbow', 2, 1.0, 1), summon('Monkey Business', 2, 0.9, 1),
    { name: 'Poolmaker', cd: 2, ph: 0, ai: 'buff', desc: (C) => `+15% damage this round, and ${dn(C, 0.6)} damage`, use: (c) => { c.buff(c.pid, { k: 'poolmaker', n: 1, name: 'Poolmaker', dmg: 1.15 }); c.hit(0.6, { n: 'Poolmaker' }); return '+15% damage this round'; } }] });

add('buccaneer', { name: 'Buccaneer', role: 'Damage / Support', hp: 1050, basic: 'Octopunch', fac: 'explorer-pirate', origin: { name: 'Unleash Neptunus' }, ascent: { name: 'Haymaker' },
  trait: ['Sea Serpent', 'Right answers in a row stir the Sea Serpent (3): at 3 it fights with you, +30% damage. A wrong answer sends it back down.'],
  gauge: { name: 'Serpent', max: 3 },
  mult: (c) => (c.me.g >= 3 ? 1.3 : 1),
  end: (c) => { c.me.g = c.power > 0 ? Math.min(3, c.me.g + 1) : 0; },
  skills: [m1('Howling Fist', 1.5), m1('Nautilus Strike', 1.1), summon('Lord of the Deep', 2, 1.0, 1),
    self('Lightning Form', 4, 2, { dmg: 1.26 }),
    self('Stimulating Conversation', 4, 2, { dmg: 1.12 }),
    { name: 'Time Leap', cd: 4, ph: 0, ai: 'buff', team: true, desc: () => 'Whole party: every skill on cooldown (not Origins or faction skills) comes back 2 rounds sooner',
      use: (c) => { for (const id of c.alive()) c.cdr(id, 2, 'time-leap'); return 'winds the party’s cooldowns back 2 rounds'; } }] });

add('corsair', { name: 'Corsair', role: 'Damage', hp: 1000, basic: 'Rapid Fire', fac: 'explorer-pirate', origin: { name: 'The Dreadnought' }, ascent: { name: 'Firecracker Fusillade' },
  trait: ['Scurvy Summons', 'Your crew keeps firing: 25% of your main attack every round, even when you answer wrong.'],
  after: (c) => { c.hit(0.25, { n: 'Crew', free: 1 }); },
  skills: [m1('Bullet Barrage', 1.5), m1('Target Lock', 1.3), m1('Death Trigger', 1.2), m1('Ugly Bomb', 1.1),
    { name: "Whaler's Potion", cd: 2, ph: 0, ai: 'buff', desc: () => 'Heal 35% HP and deal +20% damage this round',
      use: (c) => { const h = c.heal(c.pid, 0.35); c.buff(c.pid, { k: 'whalers-potion', n: 1, name: "Whaler's Potion", dmg: 1.2 }); return `+${fmt(h)} HP, +20% damage this round`; } },
    m2('Nautilus Assault', 3.0)] });

add('jett', { name: 'Jett', role: 'Damage', hp: 1050, basic: 'Starforce Salvo', fac: 'explorer-pirate', origin: { name: 'Singularity Shock' },
  trait: ['Slipstream Suit', 'A flying start: while you are at full HP you deal +25% damage.'],
  mult: (c) => (c.me.hp >= c.me.maxHp ? 1.25 : 1),
  skills: [m1('Backup Beatdown', 1.4), m1('Starfall', 1.2),
    { name: 'Bionic Maximizer', cd: 4, ph: 1, ai: 'guard', desc: () => 'Heal 40% HP and take 30% less damage for 2 rounds',
      use: (c) => { const h = c.heal(c.pid, 0.4); c.buff(c.pid, { k: 'bionic', n: 2, name: 'Bionic Maximizer', taken: 0.7 }); return `+${fmt(h)} HP, 30% less damage taken for 2 rounds`; } },
    summon('Suborbital Bombardier', 4, 0.9, 2),
    m2('Planet Buster', 2.8)] });

// ============================== Cygnus Knights ==============================
add('dawn-warrior', { name: 'Dawn Warrior', role: 'Damage', hp: 1150, basic: 'Luna Divide', fac: 'cygnus', origin: { name: 'Astral Blitz' }, ascent: { name: 'Totality' },
  trait: ['Equinox Cycle', 'Moon and Sun take turns, a round each. Falling Moon: +20% damage. Rising Sun: 20% less damage taken, and a right answer heals 5% HP.'],
  stances: { moon: 'Falling Moon', sun: 'Rising Sun' },
  mult: (c) => (c.me.st === 'moon' ? 1.2 : 1), taken: (c) => (c.me.st === 'sun' ? 0.8 : 1),
  after: (c) => { if (c.me.st === 'sun' && c.power > 0) c.heal(c.pid, 0.05); },
  end: (c) => { c.me.st = c.me.st === 'moon' ? 'sun' : 'moon'; },
  skills: [m1('Cosmos', 1.5), m1('Luster Charge', 1.2),
    m2('Soul Eclipse', 3.0), m2('Rift of Damnation', 2.4), self('Cosmic Forge', 4, 1, { dmg: 1.25 })] });

add('blaze-wizard', { name: 'Blaze Wizard', role: 'Damage / Support', hp: 850, basic: 'Orbital Flame', fac: 'cygnus', origin: { name: 'Eternity' }, ascent: { name: 'Flame Concerto' },
  trait: ['Embers', 'Each right answer adds an Ember (max 6). Savage Flame burns them all at once: save up for a big one.'],
  gauge: { name: 'Embers', max: 6 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(6, c.me.g + 1); },
  skills: [
    { name: 'Savage Flame', cd: 2, ph: 2, ai: 'atk', desc: (C) => `${dn(C, 0.4)} damage + ${dn(C, 0.3)} for each Ember, which it burns`,
      bot: (S, pid, x) => x.know && (S.players[pid].g >= 4 || x.inWin),
      use: (c) => { c.hit(0.4 + 0.3 * c.me.g, { n: 'Savage Flame' }); c.me.g = 0; return ''; } },
    m1('Towering Inferno', 1.3), summon('Salamander Mischief', 2, 0.9, 1),
    party('Burning Conduit', 2, 1, { dmg: 1.08 }),
    m2('Inferno Sphere', 3.0), self('Phoenix Drive', 4, 1, { dmg: 1.2 }), atk('Cataclysm', 3, 2.2)] });

add('wind-archer', { name: 'Wind Archer', role: 'Damage', hp: 950, basic: 'Song of Heaven', fac: 'cygnus', origin: { name: 'Mistral Spring' }, ascent: { name: 'Elemental Tempest' },
  trait: ['Trifling Wind', 'Each right answer lets loose 3 spirit arrows: each has a 45% chance to hit for 25% of your main attack. Storm Whim doubles them.'],
  after: (c) => { if (c.power > 0) { let n = 0; for (let i = 0; i < (c.hasBuff('storm-whim') ? 6 : 3); i++) if (c.rand() < 0.45) n++; if (n) c.hit(0.25 * n, { n: 'Trifling Wind' }); } },
  skills: [m1('Howling Gale', 1.5), m1('Vortex Sphere', 1.2),
    self('Gale Barrier', 2, 1, { taken: 0.6, dmg: 1.1 }, { ai: 'guard', bot: (S, pid, x) => x.know || x.incoming > S.players[pid].hp * 0.4 }),
    self('Storm Whim', 4, 1, { dmg: 1.2 }, { note: 'Twice as many spirit arrows' }),
    m2('Monsoon', 2.8)] });

add('night-walker', { name: 'Night Walker', role: 'Damage', hp: 950, basic: 'Quintuple Star', fac: 'cygnus', origin: { name: 'Silence' }, ascent: { name: 'Stygian Command' },
  trait: ['Shadow Bats', 'Each right answer calls a bat (max 5). Every bat bites each round for 8% of your main attack, even when you answer wrong.'],
  gauge: { name: 'Bats', max: 5 },
  after: (c) => { if (c.me.g) c.hit(0.08 * c.me.g, { n: 'Shadow Bats', free: 1 }); if (c.power > 0) c.me.g = Math.min(5, c.me.g + 1); },
  skills: [m1('Shadow Bite', 1.4), summon('Shadow Spear', 2, 1.0, 1),
    m2('Rapid Throw', 3.0),
    { name: 'Dominion', cd: 4, ph: 0, ai: 'buff', desc: (C) => `${dn(C, 1.5)} damage, and you deal +20% damage this round`, use: (c) => { c.buff(c.pid, { k: 'dominion', n: 1, name: 'Dominion', dmg: 1.2 }); c.hit(1.5, { n: 'Dominion' }); return '+20% damage this round'; } },
    self('Shadow Illusion', 4, 1, { dmg: 1.2 }),
    summon('Greater Dark Servant', 4, 1.2, 1)] });

add('thunder-breaker', { name: 'Thunder Breaker', role: 'Damage (streaks)', hp: 1050, basic: 'Annihilate', fac: 'cygnus', origin: { name: 'Thunder Wall Sea Wave' }, ascent: { name: 'Annihilating Rush' },
  trait: ['Lightning Link', 'Right answers in a row chain your links: +12% damage per link (max 5). One wrong answer breaks the chain.'],
  gauge: { name: 'Links', max: 5 },
  mult: (c) => 1 + 0.12 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(5, c.me.g + 1) : 0; },
  skills: [m1('Deep Rising', 1.3), m1('Gale', 1.1),
    m2('Lightning Cascade', 2.6), m2('Lightning Spear Multistrike', 3.0), self('Primal Bolt', 4, 1, { dmg: 1.25 })] });

add('mihile', { name: 'Mihile', role: 'Tank / Support', hp: 1250, basic: 'Radiant Cross', fac: 'cygnus', origin: { name: 'Durendal' }, ascent: { name: 'Knights Immortal' },
  trait: ['Royal Guard', 'A right answer braces your shield: you take 30% less damage that round and strike back for 40% of your main attack.'],
  taken: (c) => (c.power > 0 ? 0.7 : 1),
  after: (c) => { if (c.power > 0) c.hit(0.4, { n: 'Royal Guard' }); },
  skills: [m1('Charging Light', 1.3), m1('Sword of Light', 1.2),
    party('Light of Courage', 2, 1, { dmg: 1.08 }),
    m2('Radiant Soul', 2.6), self('Soul Majesty', 4, 1, { dmg: 1.25 }), party('Queen of Tomorrow', 4, 2, { dmg: 1.1 })] });

// ============================== Heroes ==============================
add('mercedes', { name: 'Mercedes', role: 'Damage (speed)', hp: 950, basic: "Ishtar's Ring", fac: 'hero', origin: { name: 'Unfading Glory' }, ascent: { name: 'Primeval Spirits' },
  trait: ['Ignis Roar', 'Quick hands: a right answer in under 8 s adds a stack (max 5): +9% damage each. A wrong answer drops 2.'],
  gauge: { name: 'Ignis Roar', max: 5 },
  mult: (c) => 1 + 0.09 * c.me.g,
  end: (c) => { if (c.power > 0) { if (c.sec != null && c.sec < 8) c.me.g = Math.min(5, c.me.g + 1); } else c.me.g = Math.max(0, c.me.g - 2); },
  skills: [m1("Sylvidia's Flight", 1.6), m1('Wrath of Enlil', 1.2),
    m2("Irkalla's Wrath", 2.8), summon('Spirit of Elluel', 4, 0.8, 2), summon('Royal Knights', 4, 1.3, 1), summon('Elemental Knights', 4, 0.6, 2)] });

add('aran', { name: 'Aran', role: 'Damage (combo)', hp: 1200, basic: 'Beyond Blade', fac: 'hero', origin: { name: 'Endgame' }, ascent: { name: 'Hailstorm Howl' },
  trait: ['Adrenaline Rush', 'Right answers build Combo: +1, or +2 in under 8 s (max 10). At 10 you go into Adrenaline Rush for 2 rounds: +60% damage. Then Combo starts over. No 2-minute skills: the Rush is your burst.'],
  gauge: { name: 'Combo', max: 10 },
  mult: (c) => (c.hasBuff('adrenaline') ? 1.6 : 1),
  end: (c) => { if (c.hasBuff('adrenaline')) return; if (c.power > 0) c.me.g = Math.min(10, c.me.g + (c.sec != null && c.sec < 8 ? 2 : 1));
    if (c.me.g >= 10) { c.me.g = 0; c.buff(c.pid, { k: 'adrenaline', n: 3, name: 'Adrenaline Rush' }); c.note('goes into <b>Adrenaline Rush</b>: +60% damage for 2 rounds'); } },
  skills: [m1('Hyper Finisher - Last Stand', 1.6, { short: 'Last Stand' }), m1("Finisher - Hunter's Prey", 1.4, { short: "Hunter's Prey" }), m1("Maha's Carnage", 1.3), m1('Blizzard Tempest', 1.2),
    summon('Finisher - Adrenaline Surge', 2, 0.8, 1, { short: 'Adrenaline Surge' })] });

const CARDS = [['♠ Spade', { dmg: 1.25 }], ['♦ Diamond', { taken: 0.6 }], ['♥ Heart', { regen: 0.12 }]];
add('phantom', { name: 'Phantom', role: 'Trickster', hp: 950, basic: 'Mille Aiguilles', fac: 'hero', origin: { name: 'Defying Fate' }, ascent: { name: 'Moonlit Serenade' },
  trait: ['Carte Noir', 'Each right answer has a 40% chance to throw a Carte Noir: +40% of your main attack.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.4) c.hit(0.4, { n: 'Carte Noir' }); },
  skills: [m1("Phantom's Mark", 1.5), m1('Rift Break', 1.3), m1('Rose Carte Finale', 1.1),
    { name: 'Luck of the Draw', cd: 4, ph: 0, ai: 'buff', team: true, desc: (C) => `${dn(C, 1.2)} damage, and you draw a card for the whole party (2 rounds): ♠ +25% damage, ♦ 40% less damage taken, or ♥ heal 12% HP a round`,
      use: (c) => { const [n, b] = CARDS[Math.floor(c.rand() * 3)]; c.party({ k: 'luck-of-the-draw', n: 2, name: n, ...b }); c.hit(1.2, { n: 'Luck of the Draw' }); return `draws ${n} for the party`; } }] });

add('luminous', { name: 'Luminous', role: 'Damage (rhythm)', hp: 850, basic: 'Ender', fac: 'hero', origin: { name: 'Harmonic Paradox' }, ascent: { name: 'Lustrous Orb' },
  trait: ['Equilibrium', 'Every 3rd right answer tips light and dark into balance: the next round you are in Equilibrium: +50% damage, and class skills you use then have no cooldown.'],
  gauge: { name: 'Balance', max: 3 },
  start: (c) => { c.me.v.eqNow = !!c.me.v.eq; if (c.me.v.eq) { c.me.v.eq = false; c.buff(c.pid, { k: 'equilibrium', n: 1, name: 'Equilibrium', dmg: 1.5 }); } },
  cast: (c, sk) => { if (c.me.v.eqNow && !sk.common && !sk.origin && !sk.ascent && !sk.faction && sk.key !== 'equalize') c.me.cd[sk.key] = 0; },
  end: (c) => { if (c.power > 0 && !c.me.v.eqNow && ++c.me.g >= 3) { c.me.g = 0; c.me.v.eq = true; c.note('reaches <b>Equilibrium</b>: next round +50% damage, no cooldowns'); } },
  skills: [m1('Aether Conduit', 1.4), m1('Baptism of Light and Darkness', 1.3, { short: 'Baptism' }), m1('Death Scythe', 1.1),
    { name: 'Equalize', cd: 4, ph: 0, ai: 'buff', desc: (C) => `${dn(C, 1)} damage, and Equilibrium right now: +50% damage this round`,
      use: (c) => { c.buff(c.pid, { k: 'equilibrium', n: 1, name: 'Equilibrium', dmg: 1.5 }); c.hit(1, { n: 'Equalize' }); return 'forces <b>Equilibrium</b>: +50% damage this round'; } },
    summon('Liberation Orb', 4, 0.7, 2)] });

add('evan', { name: 'Evan', role: 'Damage (dragon)', hp: 900, basic: 'Mana Burst', fac: 'hero', origin: { name: 'Zodiac Burst' }, ascent: { name: 'United Horizons' },
  trait: ['Mir', 'Mir fights at your side: 25% of your main attack every round, even when you answer wrong. On rounds you use a class skill it is a Fusion: Mir hits twice as hard.'],
  after: (c) => { c.hit(c.rc.casts.some((x) => x.c === c && !x.sk.common && !x.sk.ascent && !x.sk.faction) ? 0.5 : 0.25, { n: 'Mir', free: 1 }); },
  skills: [m1('Elemental Barrage', 1.6), m1('Dark Fog', 1.2), summon('Summon Onyx Dragon', 2, 0.9, 1),
    m2('Elemental Radiance', 2.8), atk('Dragon Master', 8, 4.0)] });

add('shade', { name: 'Shade', role: 'Damage / Sustain', hp: 1100, basic: 'Spirit Claw', fac: 'hero', origin: { name: 'Advent of the Fox' }, ascent: { name: 'Promise Unbroken' },
  trait: ['Fox Spirits', 'Each right answer has a 40% chance to call a fox spirit: +50% of your main attack, and it heals you 5% HP.'],
  after: (c) => { if (c.power > 0 && c.rand() < 0.4) { c.hit(0.5, { n: 'Fox Spirits' }); c.heal(c.pid, 0.05); } },
  skills: [m1('Spiritgate', 1.4), m1('Death Mark', 1.2, { note: 'Heals you 10% HP', then: (c) => { c.heal(c.pid, 0.1); } }), summon('Fox Marble Fusion', 2, 0.9, 1),
    m2('Smashing Multipunch', 3.0), m2('Fox God Flash', 2.4), m2('Spirit Incarnation', 2.2)] });

// ============================== Resistance ==============================
add('battle-mage', { name: 'Battle Mage', role: 'Damage / Support (auras)', hp: 1000, basic: 'Finishing Blow', fac: 'resistance', origin: { name: 'Crimson Pact' }, ascent: { name: 'Duskbound Aura' },
  trait: ['Auras', 'Your aura covers the whole party; Dark Aura (the skill) changes it, any round. Dark: +12% damage. Blue: 18% less damage taken. Draining: everyone heals 4% HP a round. Aura Scythe gives all three at once.'],
  stances: { dark: 'Dark Aura', blue: 'Blue Aura', drain: 'Draining Aura' },
  aura: (c) => { const st = c.me.st, all = c.hasBuff('aura-scythe'); c.party({ k: 'bam-aura', n: 1, name: all ? 'Aura Scythe' : c.C.stances[st], ...(all ? { dmg: 1.12, taken: 0.82, regen: 0.04 } : st === 'dark' ? { dmg: 1.12 } : st === 'blue' ? { taken: 0.82 } : { regen: 0.04 }) }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Dark Aura', cd: 0, ph: 0, ai: 'stance', options: ['Dark Aura: party +12% damage', 'Blue Aura: party takes 18% less damage', 'Draining Aura: party heals 4% HP a round'], desc: () => 'Change your aura (it covers the whole party)',
      bot: (S, pid, x) => { const low = x.ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.5).length, want = low * 2 >= x.ids.length ? 2 : 0; return ['dark', 'blue', 'drain'][want] !== S.players[pid].st ? want : null; },
      use: (c, i) => { c.me.st = ['dark', 'blue', 'drain'][+i] || 'dark'; c.C.aura(c); return `spreads ${c.C.stances[c.me.st]}`; } },
    { name: 'Aura Scythe', cd: 2, ph: 0, ai: 'buff', team: true, desc: (C) => `This round the party gets all three auras at once, and ${dn(C, 1)} damage`,
      use: (c) => { c.buff(c.pid, { k: 'aura-scythe', n: 1, name: 'Aura Scythe' }); c.C.aura(c); c.hit(1, { n: 'Aura Scythe' }); return 'all three auras at once'; } },
    m1('Dark Genesis', 1.2), summon('Grim Harvest', 2, 1.1, 1),
    m2('Abyssal Lightning', 2.6), self('Master of Death', 4, 1, { dmg: 1.35 })] });

add('blaster', { name: 'Blaster', role: 'Damage / Tank', hp: 1250, basic: 'Magnum Punch', fac: 'resistance', origin: { name: 'Final Destroyer' }, ascent: { name: 'Vanguard Strike' },
  trait: ['Revolving Cannon', '6 bullets. Each right answer fires one for +15% damage. Empty cylinder: that round you reload instead (a weak hit).'],
  gauge: { name: 'Bullets', max: 6 }, init: (p) => { p.g = 6; },
  basicHit: (c) => { if (c.me.g > 0) { c.me.g--; c.hit(1.15, { n: 'Magnum Punch' }); } else { c.me.g = 6; c.hit(0.6, { n: 'Reload' }); } },
  skills: [m1('Bullet Blast', 1.7),
    self('Vitality Shield', 4, 1, { taken: 0.5 }, { ai: 'guard' }),
    m2('Gatling Punch', 3.0), m2('Hyper Magnum Punch', 2.4), summon('Rocket Punch', 4, 0.7, 2), self('Afterimage Shock', 4, 2, { dmg: 1.15 })] });

add('mechanic', { name: 'Mechanic', role: 'Summoner / Support', hp: 1050, basic: 'Heavy Salvo Plus', summonPlus: 1, fac: 'resistance', origin: { name: 'Ground Zero' }, ascent: { name: 'Mechanized Extinction' },
  trait: ['Robot Mastery', 'Your robots stay 1 round longer, and Support Unit: H-EX heals the whole party 3% HP at the end of every round.'],
  end: (c) => { for (const id of c.alive()) c.heal(id, 0.03); },
  skills: [m1('Giant Robot SG-88', 1.5), m1('Mobile Missile Battery', 1.2), self('Full Spread', 2, 1, { dmg: 1.12 }),
    m2('Full Metal Barrage', 3.0), summon('Doomsday Device', 4, 0.8, 2), summon('Mecha Carrier', 4, 0.6, 2)] });

add('wild-hunter', { name: 'Wild Hunter', role: 'Damage (jaguar)', hp: 1000, basic: 'Wild Arrow Blast: Apex', fac: 'resistance', origin: { name: 'Synchronous Hunt' }, ascent: { name: 'Gear Storm' },
  trait: ['Ashlii', 'Your jaguar bites every round for 30% of your main attack, even when you answer wrong. Twice as hard during Primal Bloom.'],
  after: (c) => { c.hit(c.hasBuff('primal-bloom') ? 0.6 : 0.3, { n: 'Ashlii', free: 1 }); },
  skills: [m1("Command: Predator's Eye", 1.3, { short: "Predator's Eye" }), m1('Command: Alpha Surge', 1.2, { short: 'Alpha Surge' }), m1('Command: Titan Pounce', 1.1, { short: 'Titan Pounce' }),
    m2('Wild Arrow Blast: Overdrive', 2.8, { short: 'Overdrive' }), self('Primal Bloom', 4, 1, { dmg: 1.2 }, { note: 'Ashlii bites twice as hard' })] });

add('xenon', { name: 'Xenon', role: 'Damage', hp: 1050, basic: 'Mecha Purge: Snipe', fac: 'resistance', origin: { name: 'Artificial Evolution' }, ascent: { name: 'Neoteric Snap' },
  trait: ['Supply Surplus', 'You gain 1 Surplus Energy every round (max 5): +5% damage each. A wrong answer leaks 1. Amaranth Generator fills it.'],
  gauge: { name: 'Surplus', max: 5 }, init: (p) => { p.g = 2; },
  mult: (c) => 1 + 0.05 * c.me.g,
  end: (c) => { c.me.g = c.power > 0 ? Math.min(5, c.me.g + 1) : Math.max(0, c.me.g - 1); },
  skills: [m1('Orbital Cataclysm', 1.5), m1('Photon Ray', 1.2),
    party('Hypogram Field: Fusion', 2, 1, { dmg: 1.08 }, { short: 'Hypogram: Fusion' }),
    { name: 'Amaranth Generator', cd: 2, ph: 0, ai: 'buff', desc: () => 'Surplus Energy to 5', bot: (S, pid) => S.players[pid].g <= 3, use: (c) => { c.me.g = 5; return 'Surplus Energy full'; } },
    m2('Omega Blaster', 2.8), self('Core Overload', 4, 1, { dmg: 1.25 })] });

add('demon-slayer', { name: 'Demon Slayer', role: 'Damage', hp: 1250, basic: 'Demon Impact', fac: 'demon', origin: { name: 'Nightmare' }, ascent: { name: 'Amethystine Incursion' },
  trait: ['Demon Fury', 'Each right answer builds 35 Fury (max 100). Your attack skills cost Fury: no Fury, no skills. Boundless Rage fills it.'],
  gauge: { name: 'Fury', max: 100 }, init: (p) => { p.g = 50; },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(100, c.me.g + 35); },
  skills: [spend(20, 'Fury', m1('Raven Storm', 1.4)), spend(20, 'Fury', m1('Demon Cry', 1.2)),
    spend(40, 'Fury', m2('Demon Bane', 3.0)), spend(30, 'Fury', summon('Spirit of Rage', 4, 2.2, 1)),
    summon('Orthrus', 4, 0.7, 2),
    { name: 'Boundless Rage', cd: 4, ph: 0, ai: 'buff', desc: () => 'Fury to 100, and +15% damage this round', use: (c) => { c.me.g = 100; c.buff(c.pid, { k: 'boundless-rage', n: 1, name: 'Boundless Rage', dmg: 1.15 }); return 'Fury full, +15% damage this round'; } }] });

add('demon-avenger', { name: 'Demon Avenger', role: 'Damage (HP)', hp: 1700, basic: 'Exceed: Execution', fac: 'demon', origin: { name: 'Requiem' }, ascent: { name: 'Rageborne Devil' },
  trait: ['Blood Contract', 'Your HP is your power: up to +40% damage the fuller it is. Each right answer heals 4% HP. Demonic Frenzy trades HP for damage.'],
  stances: { calm: 'Calm', frenzy: 'Demonic Frenzy' },
  mult: (c) => (1 + 0.4 * c.me.hp / c.me.maxHp) * (c.me.st === 'frenzy' ? 1.35 : 1),
  after: (c) => { if (c.power > 0) c.heal(c.pid, 0.04); },
  end: (c) => { if (c.me.st === 'frenzy') c.pay(0.08); },
  skills: [swap('Demonic Frenzy', 'Switch Demonic Frenzy on or off: +35% damage, but you lose 8% HP every round',
      (S, pid, x) => { const me = S.players[pid], want = me.hp > me.maxHp * 0.5 ? 'frenzy' : 'calm'; return want !== me.st; }),
    m1('Thousand Swords', 1.4), self('Forbidden Contract', 2, 1, { dmg: 1.15 }),
    summon('Dimensional Sword', 4, 1.2, 2),
    { name: 'Revenant', cd: 4, ph: 0, ai: 'buff', desc: () => 'Pay 15% HP: +35% damage this round', use: (c) => { c.pay(0.15); c.buff(c.pid, { k: 'revenant', n: 1, name: 'Revenant', dmg: 1.35 }); return 'pays 15% HP for +35% damage this round'; } }] });

// ============================== Nova ==============================
add('kaiser', { name: 'Kaiser', role: 'Damage / Tank', hp: 1300, basic: 'Gigas Wave', fac: 'nova', origin: { name: 'Nova Triumphant' }, ascent: { name: 'Pyroclastic Instinct' },
  trait: ['Final Form', 'Right answers fill the Morph Gauge (4). When it is full you take Final Form for 2 rounds: +40% damage, 30% less damage taken. Then it starts over.'],
  gauge: { name: 'Morph', max: 4 },
  end: (c) => { if (c.hasBuff('final-form')) return; if (c.power > 0 && ++c.me.g >= 4) { c.me.g = 0; c.buff(c.pid, { k: 'final-form', n: 3, name: 'Final Form', dmg: 1.4, taken: 0.7 }); c.note('takes <b>Final Form</b> for 2 rounds'); } },
  skills: [m1('Ancestral Prominence', 1.5), m1('Bladefall', 1.3), m1('Inferno Breath', 1.2),
    m2('Dragonflare', 2.8), summon('Nova Guardians', 4, 0.8, 2), self("Kaiser's Majesty", 4, 1, { dmg: 1.25 }),
    { name: 'Final Trance', cd: 8, ph: 0, ai: 'buff', desc: () => 'Take Final Form right now, for 2 rounds: +40% damage, 30% less damage taken', use: (c) => { c.me.g = 0; c.buff(c.pid, { k: 'final-form', n: 2, name: 'Final Form', dmg: 1.4, taken: 0.7 }); return 'takes Final Form'; } }] });

const possess = (name, cdr, mult, o = {}) => ({ name, cd: cdr, ph: 2, ai: cdr >= 3 ? 'burst' : 'atk', ...o, desc: (C) => `${dn(C, mult)} damage (${dn(C, mult * 1.5)} when Possessed)`,
  use: (c) => { if (c.me.g > 0) { c.me.g--; c.hit(mult * 1.5, { n: name }); c.heal(c.pid, 0.08); } else c.hit(mult, { n: name }); return ''; } });
add('kain', { name: 'Kain', role: 'Damage / Sustain', hp: 1000, basic: 'Falling Dust', fac: 'nova', origin: { name: 'Total Annihilation' }, ascent: { name: '[Possess/Execute] Churning Malice', short: 'Churning Malice' },
  trait: ['Possession', 'Each right answer gathers a Malice stone (max 3). An attack skill used with Malice is Possessed: it spends 1 stone, hits 50% harder and heals you 8% HP.'],
  gauge: { name: 'Malice', max: 3 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(3, c.me.g + 1); },
  skills: [possess('[Possess] Dragon Burst', 2, 1.3, { short: 'Dragon Burst' }), possess('[Execute] Fatal Blitz', 2, 1.3, { short: 'Fatal Blitz' }), possess('Unseen Sniper', 2, 1.1),
    summon('Grip of Agony', 4, 1.5, 1),
    { name: 'Thanatos Descent', cd: 4, ph: 0, ai: 'buff', desc: () => '+25% damage this round, and Malice to 3', use: (c) => { c.me.g = 3; c.buff(c.pid, { k: 'thanatos-descent', n: 1, name: 'Thanatos Descent', dmg: 1.25 }); return '+25% damage this round, Malice full'; } },
    self('Incarnation', 4, 1, { dmg: 1.2 })] });

add('cadena', { name: 'Cadena', role: 'Damage (variety)', hp: 1000, basic: 'Chain Arts: Thrash', fac: 'nova', origin: { name: 'Chain Arts: Grand Arsenal', short: 'Grand Arsenal' }, ascent: { name: 'Brutal Rampage' },
  trait: ['Weapon Variety', 'Use a different class skill than the last one you used and you gain a stack (max 6): +7% damage each. A round with no class skill, or the same one again, loses a stack.'],
  gauge: { name: 'Variety', max: 6 },
  mult: (c) => 1 + 0.07 * c.me.g,
  cast: (c, sk) => { if (!sk.common) c.me.v.now = sk.key; },
  end: (c) => { const now = c.me.v.now; if (now && now !== c.me.v.prev) c.me.g = Math.min(6, c.me.g + 1); else c.me.g = Math.max(0, c.me.g - 1); if (now) c.me.v.prev = now; c.me.v.now = null; },
  skills: [m1('Chain Arts: Crush', 1.3, { short: 'Crush' }), m1('Chain Arts: Reign of Chains', 1.2, { short: 'Reign of Chains' }), summon('Apocalypse Cannon', 2, 1.1, 1),
    m2('Chain Arts: Void Strike', 2.6, { short: 'Void Strike' }), m2('Veteran Shadowdealer', 2.2), self("Shadowdealer's Elixir", 4, 2, { dmg: 1.15 })] });

add('angelic-buster', { name: 'Angelic Buster', role: 'Damage / Support', hp: 950, basic: 'Trinity', fac: 'nova', ascent: { name: 'Surprise Encore' },
  origin: { name: 'Grand Finale', note: 'Party +15% damage for 2 rounds', then: (c) => { c.party({ k: 'grand-finale', n: 2, name: 'Grand Finale', dmg: 1.15 }); } },
  trait: ['Soul Recharge', 'After you use a class skill there is a 35% chance it recharges on the spot: no cooldown.'],
  cast: (c, sk) => { if (!sk.common && !sk.origin && !sk.ascent && !sk.faction && c.rand() < 0.35) { c.me.cd[sk.key] = 0; c.note(`<b>Recharge!</b> ${sk.name} is ready again`); } },
  skills: [m1('Mighty Mascot', 1.4), m1('Soul Resonance', 1.3), summon('Supreme Supernova', 2, 0.9, 1),
    expose('Finale Ribbon', 2, 1, 1.08, 0.6),
    m2('Sparkle Burst', 2.8), summon('Superstar Spotlight', 4, 0.8, 2), self('Final Contract', 4, 1, { dmg: 1.25 })] });

// ============================== Sengoku ==============================
add('kanna', { name: 'Kanna', role: 'Summoner (top damage)', hp: 900, basic: 'Soul-Shatter Talisman', fac: 'sengoku', origin: { name: '[Divine Will] Advent of Crimson', short: 'Advent of Crimson' }, ascent: { name: '[Divine Will] Final Rest', short: 'Final Rest' },
  trait: ['Shikigami', 'Your Shikigami fight on their own every round, even when you answer wrong. Each one that is out (max 4) also adds +10% to your own damage. Keep Oni and Tengu out, add Orochi and Haku for the burst, and unleash them all with True Name Revelation.'],
  gauge: { name: 'Shikigami', max: 4 },
  mult: (c, o) => (o.sum ? (c.hasBuff('true-name-revelation') ? 2 : 1) : 1 + 0.1 * Math.min(4, c.me.sum.length)),
  end: (c) => { c.me.g = Math.min(4, c.me.sum.length); },
  skills: [summon('Summon Oni', 2, 0.45, 2), summon('Summon Tengu', 2, 0.7, 1),
    m1('[Order] Pulverizing Strike', 1.2, { short: 'Pulverizing Strike' }),
    summon('Summon Orochi', 4, 1.1, 1),
    summon('[Spirit] Hakumenkonmou Juubi', 4, 1.6, 1, { short: 'Haku' }),
    self('True Name Revelation', 4, 1, { dmg: 1.3 }, { note: 'Your Shikigami hit twice as hard' })] });

const battou = (name, short, cdr, base) => ({ name, short, cd: cdr, ph: 2, ai: cdr >= 3 ? 'burst' : 'atk', desc: (C) => `${dn(C, base)} damage + ${dn(C, 0.5)} per Sword Energy (it spends them all, unless you are in Shogetsu Form)`,
  bot: cdr >= 3 ? undefined : (S, pid, x) => x.know && (S.players[pid].g >= 2 || x.inWin),
  use: (c) => { c.hit(base + 0.5 * c.me.g, { n: short }); if (!c.hasBuff('shogetsu-form')) c.me.g = 0; return ''; } });
add('hayato', { name: 'Hayato', role: 'Burst damage', hp: 1150, basic: '[Shinsoku] Mist Slash', fac: 'sengoku', origin: { name: 'Shin Quick Draw' }, ascent: { name: 'Fleeting Breath' },
  trait: ['Sword Energy', 'Shinsoku strikes build Sword Energy: +1 per right answer (max 3). Battou skills spend all of it and hit harder for each. In Shogetsu Form they cost nothing.'],
  gauge: { name: 'Sword Energy', max: 3 },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(3, c.me.g + 1); },
  skills: [battou("[Battou] Full Moon's Rage", "Full Moon's Rage", 2, 0.8),
    m1('[Shinsoku] Crashing Tide', 1.4, { short: 'Crashing Tide' }), m1('[Shinsoku] Silent Arc', 1.1, { short: 'Silent Arc' }),
    self('Shogetsu Form', 4, 1, { dmg: 1.6 }, { note: 'Battou skills don’t spend Sword Energy' }),
    battou('[Battou] Wailing Heavens', 'Wailing Heavens', 4, 2.0),
    self('Bushido', 4, 1, { dmg: 1.2 })] });

// ============================== Flora ==============================
add('adele', { name: 'Adele', role: 'Damage', hp: 1150, basic: 'Cleave', fac: 'flora', origin: { name: 'Maestro' }, ascent: { name: 'Einheit' },
  trait: ['Aether Swords', 'Each right answer forges an Aether Sword (max 6): +5% damage each, and they never break.'],
  gauge: { name: 'Swords', max: 6 },
  mult: (c) => 1 + 0.05 * c.me.g,
  end: (c) => { if (c.power > 0) c.me.g = Math.min(6, c.me.g + 1); },
  skills: [m1('Ruin', 1.6), m1('Shardbreaker', 1.4), m1('Aether Bloom', 1.2), summon('Storm', 2, 0.9, 1),
    m2('Infinity Blade', 3.0), self('Legacy Restoration', 4, 1, { dmg: 1.25 })] });

add('ark', { name: 'Ark', role: 'Damage (forms)', hp: 1100, basic: 'Basic Charge Drive', fac: 'flora', origin: { name: 'Primordial Abyss' }, ascent: { name: 'Whisper of Deepest Abyss' },
  trait: ['Specter State', 'Right answers in Flora form fill the Spell Gauge (4). Specter State spends 1 a round: +40% damage, and right answers heal 5% HP. Empty: back to Flora.'],
  gauge: { name: 'Spell', max: 4 }, stances: { flora: 'Flora', specter: 'Specter' },
  mult: (c) => (c.me.st === 'specter' ? 1.4 : 1),
  after: (c) => { if (c.me.st === 'specter' && c.power > 0) c.heal(c.pid, 0.05); },
  end: (c) => { if (c.me.st === 'specter') { if (--c.me.g <= 0) { c.me.g = 0; c.me.st = 'flora'; c.note('falls back to Flora form'); } } else if (c.power > 0) c.me.g = Math.min(4, c.me.g + 1); },
  skills: [
    { name: 'Specter State', cd: 0, ph: 0, ai: 'stance', ok: (me) => me.st === 'specter' || me.g >= 2, desc: () => 'On / off (needs 2 Spell Gauge to turn on). While on: +40% damage, right answers heal 5% HP, 1 gauge a round',
      bot: (S, pid, x) => { const me = S.players[pid]; return me.st !== 'specter' && (me.g >= 4 || (x.inWin && me.g >= 2)); },
      use: (c) => { c.me.st = c.me.st === 'specter' ? 'flora' : 'specter'; return c.me.st === 'specter' ? 'gives in to the <b>Specter</b>' : 'returns to Flora form'; } },
    m1('Creeping Terror', 1.5),
    m2('Abyssal Recall', 3.0), m2('Endless Agony', 2.2), summon('Endlessly Starving Beast', 4, 0.8, 2),
    { name: 'Infinity Spell', cd: 4, ph: 0, ai: 'buff', desc: () => 'Spell Gauge to 4, and +20% damage this round', use: (c) => { c.me.g = 4; c.buff(c.pid, { k: 'infinity-spell', n: 1, name: 'Infinity Spell', dmg: 1.2 }); return 'Spell Gauge full, +20% damage this round'; } }] });

add('illium', { name: 'Illium', role: 'Damage / Support', hp: 850, basic: 'Radiant Javelin', fac: 'flora', origin: { name: 'Mytocrystal Expanse' }, ascent: { name: 'Excidium' },
  trait: ['Crystal Charge', 'Right answers charge the Crystal (5). Full: Wings of Glory for 2 rounds: +45% damage. Then it starts over.'],
  gauge: { name: 'Crystal', max: 5 },
  end: (c) => { if (c.hasBuff('glory-wings')) return; if (c.power > 0 && ++c.me.g >= 5) { c.me.g = 0; c.buff(c.pid, { k: 'glory-wings', n: 3, name: 'Wings of Glory', dmg: 1.45 }); c.note('spreads <b>Wings of Glory</b>: +45% damage for 2 rounds'); } },
  skills: [m1('Reaction - Destruction', 1.3), m1('Reaction - Domination', 1.2),
    m2('Crystal Ignition', 2.8), m2('Longinus Zone', 2.2), summon('Templar Knight', 4, 1.8, 1), summon('Crystal Gate', 4, 0.6, 2)] });

add('khali', { name: 'Khali', role: 'Damage (speed)', hp: 950, basic: 'Arts: Flurry', fac: 'flora', origin: { name: 'Hex: Sandstorm' }, ascent: { name: 'Wake the Void' },
  trait: ['Chakrams', 'Fast and precise: a right answer in under 10 s throws a chakram for +35% of your main attack; under 5 s, two.'],
  after: (c) => { if (c.power > 0 && c.sec != null && c.sec < 10) c.hit(0.35 * (c.sec < 5 ? 2 : 1), { n: 'Chakram' }); },
  skills: [m1('Hex: Pandemonium', 1.4), summon('Death Blossom', 2, 0.9, 1),
    m2('Void Burst', 3.0), self('Oblivion', 4, 1, { dmg: 1.3 }), summon('Resonate: Ultimatum', 4, 1.2, 1)] });

// ============================== Anima ==============================
add('hoyoung', { name: 'Hoyoung', role: 'Damage (rhythm)', hp: 950, basic: 'Humanity: Gold-Banded Cudgel', fac: 'anima', origin: { name: 'Sage: Apotheosis' }, ascent: { name: 'Millennium Spirit' },
  trait: ['Heaven, Earth, Humanity', 'Your right answers cycle the three attributes. Every 3rd one finishes the cycle: your Clone joins you next round, +50% damage.'],
  gauge: { name: 'Attributes', max: 3 },
  end: (c) => { if (c.power > 0 && ++c.me.g >= 3) { c.me.g = 0; c.buff(c.pid, { k: 'clone', n: 2, name: 'Talisman: Clone', dmg: 1.5 }); c.note('finishes the cycle: <b>Clone</b> next round, +50% damage'); } },
  status: (me) => (me.buffs.some((f) => f.k === 'clone') ? '👥 Clone is with you this round: +50% damage' : null),
  skills: [m1('Sage: Three Paths Apparition', 1.4, { short: 'Three Paths Apparition' }),
    { name: "Sage: Tai Yu's Miracle Tonic", short: 'Miracle Tonic', cd: 2, ph: 1, ai: 'guard', desc: () => 'Heal 30% HP and take 20% less damage this round',
      use: (c) => { const h = c.heal(c.pid, 0.3); c.buff(c.pid, { k: 'miracle-tonic', n: 1, name: 'Miracle Tonic', taken: 0.8 }); return `+${fmt(h)} HP`; } },
    m2('Sage: Wrath of Gods', 3.0, { short: 'Wrath of Gods' }), summon('Scroll: Tiger of Songyu', 4, 0.9, 2, { short: 'Tiger of Songyu' }), self('Sage: Clone Rampage', 4, 1, { dmg: 1.3 }, { short: 'Clone Rampage' })] });

add('lara', { name: 'Lara', role: 'Damage / Support (veins)', hp: 850, basic: 'Essence Sprinkle', fac: 'anima', origin: { name: 'Universe in Bloom' }, ascent: { name: 'Cornucopia' },
  trait: ['Dragon Vein', 'A dragon vein runs under the party; Dragon Vein Conversion changes it, any round. Heaving River: you deal +20% damage. Whirlwind: whole party +10% damage. Sunrise Well: whole party heals 5% HP a round.'],
  stances: { river: 'Heaving River', wind: 'Whirlwind', sun: 'Sunrise Well' },
  mult: (c) => (c.me.st === 'river' ? 1.2 : 1),
  aura: (c) => { const st = c.me.st; for (const id of c.alive()) c.S.players[id].buffs = c.S.players[id].buffs.filter((f) => f.k !== 'vein'); if (st === 'wind') c.party({ k: 'vein', n: 1, name: 'Whirlwind', dmg: 1.1 }); if (st === 'sun') c.party({ k: 'vein', n: 1, name: 'Sunrise Well', regen: 0.05 }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Dragon Vein Conversion', short: 'Vein Conversion', cd: 0, ph: 0, ai: 'stance', options: ['Heaving River: you +20% damage', 'Whirlwind: party +10% damage', 'Sunrise Well: party heals 5% HP a round'], desc: () => 'Change the dragon vein',
      bot: (S, pid, x) => { const low = x.ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.5).length, want = low * 2 >= x.ids.length && x.ids.length > 1 ? 2 : x.ids.length >= 3 ? 1 : 0; return ['river', 'wind', 'sun'][want] !== S.players[pid].st ? want : null; },
      use: (c, i) => { c.me.st = ['river', 'wind', 'sun'][+i] || 'river'; c.C.aura(c); return `turns the vein to ${c.C.stances[c.me.st]}`; } },
    m1('Big Stretch', 1.6), m1('Surging Essence', 1.2), self('Unconstrained Dragon Vein', 2, 1, { dmg: 1.12 }),
    m2("Land's Connection", 2.8), expose('Arbor Away', 4, 1, 1.1)] });

add('ren', { name: 'Ren', role: 'Damage', hp: 1150, basic: 'Plum Blossom Sword: Storm', fac: 'anima', origin: { name: 'Rising Azure Dragon: Divided Heavens', short: 'Divided Heavens' }, ascent: { name: 'Rising Azure Dragon: Heartbound Verse', short: 'Heartbound Verse' },
  trait: ['Wish Unending', 'Your sword forms follow one another: every 4th right answer ends in a Final Imugi technique, a bonus hit worth 200% of your main attack.'],
  gauge: { name: 'Forms', max: 4 },
  after: (c) => { if (c.power > 0 && ++c.me.g >= 4) { c.me.g = 0; c.hit(2, { n: 'Final Imugi Spirit Sword' }); } },
  skills: [m1('Fourth Plum Blossom Sword: Unbowed Blade', 1.4, { short: 'Unbowed Blade' }), summon('Third Plum Blossom Sword: Riotous Heart', 2, 0.9, 1, { short: 'Riotous Heart' }),
    m2('Final Plum Blossom Sword: Dancing Annihilation', 3.0, { short: 'Dancing Annihilation' }),
    summon('Final Plum Blossom Sword: Thousand Blossom Flurry', 4, 0.9, 2, { short: 'Thousand Blossom Flurry' }),
    self('Soul Immeasurable', 4, 1, { dmg: 1.25 })] });

// ============================== Jianghu ==============================
add('lynn', { name: 'Lynn', role: 'Healer / Support', hp: 900, basic: 'Strike', fac: 'jianghu', origin: { name: 'Source Flow' }, ascent: { name: 'Wild Hunt' },
  trait: ['Spirit Guides', 'Your beasts join in on their own: 40% of your main attack every round, even when you answer wrong. With a teammate to Focus on (a party of 2 or more) all your damage is +4%.'],
  mult: (c) => (c.ids.length >= 2 ? 1.04 : 1),
  after: (c) => { c.hit(0.4, { n: 'Sneak Attack', free: 1 }); },
  skills: [m1('Raid', 1.4), m1("Predator's Blow", 1.2),
    { name: "Mother Nature's Touch", cd: 2, ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 20% HP', use: (c) => `heals the party for ${fmt(c.healAll(0.2))} HP` },
    summon("Beast's Rage", 4, 2.2, 1),
    ally('[Focus] Awaken', 4, 1, { dmg: 1.4, ied: 0.5 }, { pickAlly: otherAlly }),
    { name: "Nature's Grace", cd: 4, ph: 1, ai: 'heal', team: true, desc: () => 'Heal the whole party for 30% HP; everyone takes 20% less damage this round',
      use: (c) => { const h = c.healAll(0.3); c.party({ k: 'natures-grace', n: 1, name: "Nature's Grace", taken: 0.8 }); return `heals the party for ${fmt(h)} HP`; } }] });

add('mo-xuan', { name: 'Mo Xuan', role: 'Damage (links)', hp: 1100, basic: 'Xuanshan Arts [Tian]', fac: 'jianghu', origin: { name: 'Soul Art: Jianghu Dragon' }, ascent: { name: 'Soul Art: Where Destiny Falls', short: 'Where Destiny Falls' },
  trait: ['Divine Fist', 'Link your forms into arts: every round you use a class skill adds a Divine Fist stack (max 5): +8% damage each. A round without one loses a stack.'],
  gauge: { name: 'Divine Fist', max: 5 },
  mult: (c) => 1 + 0.08 * c.me.g,
  cast: (c, sk) => { if (!sk.common && !sk.ascent && !sk.faction) c.me.v.used = true; },
  end: (c) => { c.me.g = c.me.v.used ? Math.min(5, c.me.g + 1) : Math.max(0, c.me.g - 1); c.me.v.used = false; },
  skills: [m1('Divine Art: Howling Storm', 1.5, { short: 'Howling Storm' }), m1('Divine Art: Crashing Earth', 1.4, { short: 'Crashing Earth' }), m1('Soul Art: Black Wind', 1.3, { short: 'Black Wind' }),
    m2('Soul Art: Beneath Heaven', 2.8, { short: 'Beneath Heaven' }), self('Soul Art: The Opened Gate', 4, 1, { dmg: 1.35 }, { short: 'The Opened Gate' }),
    summon('Soul Art: The Conquered Self', 4, 1.3, 1, { short: 'The Conquered Self' })] });

// ============================== Shine ==============================
add('sia-astelle', { name: 'Sia Astelle', role: 'Damage (constellations)', hp: 850, basic: 'Ray', fac: 'shine', origin: { name: 'Celestial Design' }, ascent: { name: 'Starlit Cosmos' },
  trait: ['Stellagram', 'Every right answer fires a Ray. Every 4th Ray summons Stellar I - Antares, which hits every round for 3 rounds, even when you answer wrong. Appear makes every skill stronger while it lasts: Rays count double and your stars hit 50% harder.'],
  gauge: { name: 'Rays', max: 4 },
  mult: (c, o) => (o.sum && c.hasBuff('appear') ? 1.5 : 1),
  after: (c) => { if (c.power > 0) { c.me.g += c.hasBuff('appear') ? 2 : 1; if (c.me.g >= 4) { c.me.g -= 4; c.summon('Stellar I - Antares', 0.5, 3); c.note('completes a constellation: <b>Stellar I - Antares</b> fights for 3 rounds'); } } },
  skills: [m1('Stellar VII - Vega', 1.2), summon('Stellar XI - Sirius', 2, 0.6, 1), summon('Stellar IX - Canopus', 2, 0.5, 1),
    self('Appear', 4, 1, { dmg: 1.4 }, { note: 'Rays count double and your stars hit 50% harder' }),
    m2('Stellar XII - Sadalsuud', 2.8), self('Observe', 4, 2, { dmg: 1.1 })] });

add('erel-light', { name: 'Erel Light', role: 'Burst damage', hp: 1200, atkBase: 0.7, basic: 'Spear of Lugh', fac: 'shine', origin: { name: 'Fall of Melin' }, ascent: { name: 'Radiant Spear' },
  trait: ['Shining Sentinels', 'Your spear is light; your damage is Destruction of Roan. While a sentinel is out you take 20% less damage and Destruction of Roan hits 30% harder.'],
  taken: (c) => (c.me.sum.length ? 0.8 : 1),
  skills: [m1('Impulse of Chulainn', 1.4), m1('Sting of Roan', 1.1), summon('Sentinel Rise', 2, 0.6, 1), self('Piercing of Chulainn', 2, 1, { dmg: 1.12 }),
    { name: 'Destruction of Roan', cd: 4, ph: 2, ai: 'burst', desc: (C) => `Hold it down: ${dn(C, 5.5)} damage (${dn(C, 7.15)} with a sentinel out)`, use: (c) => { c.hit(c.me.sum.length ? 7.15 : 5.5, { n: 'Destruction of Roan' }); return ''; } },
    summon('Eternal Guardian', 4, 0.8, 2)] });

// ============================== Others ==============================
add('kinesis', { name: 'Kinesis', role: 'Damage', hp: 850, basic: 'Psychic Smash', fac: 'kinesis', origin: { name: 'From Another Realm' }, ascent: { name: 'Fractal Horizon' },
  trait: ['Psychic Points', 'Each right answer restores 2 PP (max 10). Ultimates cost PP; Breakthrough fills it.'],
  gauge: { name: 'PP', max: 10 }, init: (p) => { p.g = 5; },
  end: (c) => { if (c.power > 0) c.me.g = Math.min(10, c.me.g + 2); },
  skills: [spend(2, 'PP', m1('Ultimate: Gambit', 1.3)), spend(3, 'PP', m1('Ultimate: Check', 1.5)),
    spend(4, 'PP', m2('Psychic Nova', 3.0)), summon('Psychic Castle', 4, 1.1, 2),
    { name: 'Breakthrough', cd: 4, ph: 0, ai: 'buff', desc: () => 'PP to 10, and +12% damage this round', use: (c) => { c.me.g = 10; c.buff(c.pid, { k: 'breakthrough', n: 1, name: 'Breakthrough', dmg: 1.12 }); return 'PP full, +12% damage this round'; } },
    self('Mental Overdrive', 4, 2, { dmg: 1.15 })] });

add('zero', { name: 'Zero', role: 'Damage / Support', hp: 1150, basic: 'Giga Crash', fac: 'zero', origin: { name: 'End Time' }, ascent: { name: 'Bitemporis' },
  trait: ['Tag', 'Alpha and Beta take turns, a round each. Alpha: right answers in under 8 s deal +30%. Beta: +15% damage and 20% less damage taken. Steady damage, little burst.'],
  stances: { alpha: 'Alpha', beta: 'Beta' },
  mult: (c, o) => (c.me.st === 'alpha' ? (o.free == null && c.sec != null && c.sec < 8 ? 1.3 : 1) : 1.15),
  taken: (c) => (c.me.st === 'beta' ? 0.8 : 1),
  end: (c) => { c.me.st = c.me.st === 'alpha' ? 'beta' : 'alpha'; },
  skills: [m1('Shadow Flash', 1.5),
    m2('Twin Blades of Time', 3.2),
    party('Time Distortion', 8, 2, { dmg: 1.12 }),
    atk('Shadow Rain', 10, 3.0)] });

add('lethe', { name: 'Lethe', role: 'Summoner', hp: 900, basic: 'Assize', fac: 'lethe', origin: { name: 'Dominus: Eye of Eternity', short: 'Eye of Eternity' }, ascent: { name: 'Sovereign Everlasting' },
  trait: ['Covenant', 'A pact with your summons: while one is out, your own attacks deal +20% damage. Chains of Command makes them hit 50% harder.'],
  mult: (c, o) => (o.sum ? (c.hasBuff('chains-of-command') ? 1.5 : 1) : c.me.sum.length ? 1.2 : 1),
  skills: [m1('Dominus: Pack United', 1.5, { short: 'Pack United' }), m1('Dominus: Dread Onslaught', 1.3, { short: 'Dread Onslaught' }), m1('Edict: Dread Advance', 1.1, { short: 'Dread Advance' }),
    summon('Dominus: Azrath', 4, 1.0, 2, { short: 'Azrath' }),
    summon('Chains of Command', 4, 1.4, 1, { note: 'Your summons hit 50% harder this round', then: (c) => { c.buff(c.pid, { k: 'chains-of-command', n: 1, name: 'Chains of Command' }); } }),
    self('Dominus: Fel Tempest', 4, 1, { dmg: 1.25 }, { short: 'Fel Tempest' })] });

add('beast-tamer', { name: 'Beast Tamer', role: 'Support (animals)', hp: 950, basic: 'Furious Strikes', origin: { name: 'Aerial Relief' },
  trait: ['Critters', 'Pick your animal with Critter Select, any round. Bear: you deal +25% damage. Snow Leopard: answers under 8 s deal +45%. Hawk: whole party +10% damage. Cat: whole party heals 5% HP a round.'],
  stances: { bear: 'Bear', leopard: 'Snow Leopard', hawk: 'Hawk', cat: 'Cat' },
  mult: (c, o) => (c.me.st === 'bear' ? 1.25 : c.me.st === 'leopard' && o.free == null && c.sec != null && c.sec < 8 ? 1.45 : 1),
  aura: (c) => { const st = c.me.st; for (const id of c.alive()) c.S.players[id].buffs = c.S.players[id].buffs.filter((f) => f.k !== 'critter'); if (st === 'hawk') c.party({ k: 'critter', n: 1, name: 'Hawk', dmg: 1.1 }); if (st === 'cat') c.party({ k: 'critter', n: 1, name: 'Cat', regen: 0.05 }); },
  start: (c) => c.C.aura(c),
  skills: [
    { name: 'Critter Select', cd: 0, ph: 0, ai: 'stance', options: ['Bear: you +25% damage', 'Snow Leopard: fast answers +45%', 'Hawk: party +10% damage', 'Cat: party heals 5% HP a round'], desc: () => 'Change your animal',
      bot: (S, pid, x) => { const low = x.ids.filter((id) => S.players[id].hp < S.players[id].maxHp * 0.5).length, want = low * 2 >= x.ids.length && x.ids.length > 1 ? 3 : x.ids.length >= 3 ? 2 : 0; return ['bear', 'leopard', 'hawk', 'cat'][want] !== S.players[pid].st ? want : null; },
      use: (c, i) => { c.me.st = ['bear', 'leopard', 'hawk', 'cat'][+i] || 'bear'; c.C.aura(c); return `calls the ${c.C.stances[c.me.st]}`; } },
    m1('Champ Charge', 1.5),
    { name: 'Meow Card', cd: 2, ph: 0, ai: 'buff', team: true, desc: () => 'Deal the party a card for 2 rounds: 🔴 +15% damage, 🔵 20% less damage taken, 🟢 heal 6% HP a round, or 🟡 all three',
      use: (c) => { const r = c.rand(), k = r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3, f = [{ dmg: 1.15 }, { taken: 0.8 }, { regen: 0.06 }, { dmg: 1.15, taken: 0.8, regen: 0.06 }][k];
        c.party({ k: 'meow-card', n: 2, name: 'Meow Card', ...f }); return `deals a ${['🔴 red', '🔵 blue', '🟢 green', '🟡 gold'][k]} card`; } },
    m2('Cub Cavalry', 2.8)] });

// Ascent: the same damage whoever you play = 4 main attacks of the middle class
{ const a = R.ORDER.map((k) => R.cls(k).atk).sort((x, y) => x - y); R.RULES.ascentDmg = Math.round(4 * a[Math.floor(a.length / 2)] / 1000) * 1000; }

})(typeof window !== 'undefined' ? window.MapleRaid : require('./raid.js'));

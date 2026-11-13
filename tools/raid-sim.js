// Boss Raid balance: plays the real rules (raid.js + raid-classes.js) thousands of times with bots.
//   node tools/raid-sim.js report          every class: clear speed alone and in a party, win rates
//   node tools/raid-sim.js tune            suggests TUNE (each class's attack) so the classes come out even
//   node tools/raid-sim.js diff            win rates per difficulty and player level (to set the boss's numbers)
//   node tools/raid-sim.js fight hero bishop   one fight, printed round by round
const R = require('../raid.js');
require('../raid-classes.js');

const rng = (seed) => () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Players: how often they're right, and their typical answer time (the PvP bots' numbers, with a dropdown)
const LEVELS = { easy: { p: 0.5, sec: 14 }, normal: { p: 0.72, sec: 9 }, hard: { p: 0.9, sec: 5.5 }, pro: { p: 0.97, sec: 3.5 } };

function fight({ party, level = 'normal', diff = 'normal', lives = 3, seed = 1, log = false, noDeath = false, over = null, rounds = 0, track = null }) {
  const rand = rng(seed), L = LEVELS[level];
  const S = { round: 0, players: {}, stats: {} };
  party.forEach((cls, i) => { S.players['p' + i] = R.newPlayer(cls, noDeath ? 999 : lives); S.players['p' + i].bot = true; });
  S.boss = R.newBoss('Boss', '', party.length, diff);
  if (over) { const b = S.boss; if (over.hp) { b.hp = b.max = Math.round(b.max * over.hp); } if (over.atk) b.atk *= over.atk; }
  const cap = rounds || (noDeath ? 60 : R.DIFFS[S.boss.diff].cap);
  while (S.round < cap) {
    S.round++;
    R.pickMove(S, rand);
    const inputs = {};
    for (const pid of R.aliveIds(S)) {
      const right = rand() < L.p, sec = Math.max(1.5, L.sec * Math.exp((rand() - 0.5) * 0.8));
      const know = rand() < 0.9 ? right : !right;
      inputs[pid] = { power: right ? R.RULES.power(sec) : 0, sec, casts: R.botCasts(S, pid, know, rand) };
    }
    const mv = S.boss.move;
    const hp0 = S.boss.hp;
    const ev = R.resolve(S, inputs, rand);
    if (track) track(S, inputs, hp0 - S.boss.hp);
    if (log) {
      console.log(`\n— Round ${S.round} — ${R.moveText(mv, 'Boss')}`);
      for (const e of ev) console.log('  ' + e.t.replace(/<[^>]+>/g, '').replace(/\{p:(p\d)\}/g, (m, id) => R.cls(S.players[id].cls).name));
      console.log(`  Boss ${S.boss.hp}/${S.boss.max} | ` + Object.entries(S.players).map(([id, p]) => `${R.cls(p.cls).name} ${p.out ? 'OUT' : p.hp + '/' + p.maxHp + ' ♥' + p.lives} g${p.g}${p.st ? ' ' + p.st : ''}`).join(' | '));
    }
    if (S.boss.hp <= 0) return { win: true, rounds: S.round, S };
    if (!R.aliveIds(S).length) return { win: false, rounds: S.round, S };
  }
  return { win: false, rounds: S.round, S, timeout: true };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
// --write: put the result straight into raid-classes.js (TUNE) / raid.js (DIFFS)
const fs = require('fs'), path = require('path'), WRITE = process.argv.includes('--write');
function writeTune(T) {
  const line = 'const TUNE = { ' + R.ORDER.map((k) => `'${k}': ${T[k].toFixed(2)}`).join(', ') + ' };';
  console.log(line);
  if (!WRITE) return;
  const f = path.join(__dirname, '../raid-classes.js'), src = fs.readFileSync(f, 'utf8');
  if (!/^const TUNE = \{.*\};$/m.test(src)) throw new Error('TUNE line not found');
  fs.writeFileSync(f, src.replace(/^const TUNE = \{.*\};$/m, line));
  console.error('written to raid-classes.js');
}
function writeDiffs(out) {
  console.log(JSON.stringify(out));
  if (!WRITE) return;
  const f = path.join(__dirname, '../raid.js');
  let src = fs.readFileSync(f, 'utf8');
  for (const [d, v] of Object.entries(out)) {
    const re = new RegExp(`(  ${d}: +\\{ name: '[A-Za-z]+', +)hp: [\\d.]+, +atk: [\\d.]+,`);
    if (!re.test(src)) throw new Error('DIFFS line not found: ' + d);
    src = src.replace(re, `$1hp: ${v.hp}, atk: ${v.atk},`);
  }
  fs.writeFileSync(f, src);
  console.error('written to raid.js');
}
// How fast a party gets a boss down when nobody can die (pure damage + buffs): rounds, lower = stronger
function speed(party, level, n = 300, seed0 = 1, diff = 'normal') {
  const r = [];
  for (let i = 0; i < n; i++) r.push(fight({ party, level, diff, noDeath: true, seed: seed0 + i * 7919 }).rounds);
  return mean(r);
}
function winRate(party, level, diff, n = 300, seed0 = 5, over = null) {
  let w = 0, rounds = 0, timeouts = 0;
  for (let i = 0; i < n; i++) { const f = fight({ party, level, diff, seed: seed0 + i * 104729, over }); if (f.win) { w++; rounds += f.rounds; } else if (f.timeout) timeouts++; }
  return { win: w / n, rounds: w ? rounds / w : 0, timeouts: timeouts / n };
}
const REF = ['hero', 'bow-master'];   // plain damage dealers to stand next to a class in a party

function report(n = 300) {
  const rows = [];
  for (const k of R.ORDER) {
    const solo = speed([k], 'normal', n), trio = speed([k, ...REF], 'normal', n);
    const wn = winRate([k], 'normal', 'normal', n), wh = winRate([k], 'hard', 'hard', n), wt = winRate([k, ...REF], 'normal', 'normal', Math.round(n / 2));
    rows.push({ k, solo, trio, wn: wn.win, wh: wh.win, wt: wt.win });
  }
  const med = (f) => { const a = rows.map(f).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  console.log('class                 solo   trio   win(N)  win(H)  trio(N)');
  for (const r of rows.sort((a, b) => a.solo - b.solo)) console.log(r.k.padEnd(20), r.solo.toFixed(2).padStart(6), r.trio.toFixed(2).padStart(6), (r.wn * 100).toFixed(0).padStart(6) + '%', (r.wh * 100).toFixed(0).padStart(6) + '%', (r.wt * 100).toFixed(0).padStart(6) + '%');
  console.log('median', med((r) => r.solo).toFixed(2), med((r) => r.trio).toFixed(2), 'win N', (mean(rows.map((r) => r.wn)) * 100).toFixed(0) + '%', 'win H', (mean(rows.map((r) => r.wh)) * 100).toFixed(0) + '%');
  return rows;
}
// Each class's attack is scaled until its clear speed (half alone, half next to two plain damage dealers) matches
// the middle of the pack. Classes that help the party more end up with a lower attack of their own.
function tune(iter = 6, n = 200) {
  const T = Object.fromEntries(R.ORDER.map((k) => [k, R.TUNE[k] ?? 1]));
  const base = Object.fromEntries(R.ORDER.map((k) => [k, R.cls(k).atk / (R.TUNE[k] ?? 1)]));
  const apply = () => { for (const k of R.ORDER) R.cls(k).atk = Math.round(base[k] * T[k] / 10) * 10; };
  for (let it = 0; it < iter; it++) {
    apply();
    const sc = {};
    const trioRef = speed(['hero', ...REF], 'normal', n);
    for (const k of R.ORDER) {
      const solo = speed([k], 'normal', n), trio = speed([k, ...REF], 'normal', n);
      sc[k] = { solo, trio };
    }
    const soloMed = Object.values(sc).map((x) => x.solo).sort((a, b) => a - b)[Math.floor(R.ORDER.length / 2)];
    const trioMed = Object.values(sc).map((x) => x.trio).sort((a, b) => a - b)[Math.floor(R.ORDER.length / 2)];
    let worst = 0;
    for (const k of R.ORDER) {
      // rounds are ~ 1 / damage: a class that takes 10% longer than the median needs ~10% more attack (in a trio, it's a third of the damage: x3)
      const off = 0.5 * (sc[k].solo / soloMed - 1) + 0.5 * 3 * (sc[k].trio / trioMed - 1);
      T[k] = Math.max(0.4, Math.min(2, T[k] * (1 + 0.7 * off)));
      worst = Math.max(worst, Math.abs(off));
    }
    console.error(`pass ${it + 1}: solo median ${soloMed.toFixed(2)}, trio median ${trioMed.toFixed(2)} (ref trio ${trioRef.toFixed(2)}), worst off ${(worst * 100).toFixed(1)}%`);
  }
  apply();
  writeTune(T);
}
function diffTable(n = 200) {
  const sample = ['hero', 'bishop', 'night-lord', 'arch-mage-f-p', 'paladin', 'marksman', 'mechanic', 'kaiser', 'luminous', 'corsair'];
  for (const size of [1, 3]) {
    console.log(`\n${size === 1 ? 'Alone' : 'Party of 3 (class + Hero + Bow Master)'}: win % (average winning round)`);
    console.log('players \\ boss'.padEnd(16) + Object.keys(R.DIFFS).map((d) => d.padStart(14)).join(''));
    for (const lv of Object.keys(LEVELS)) {
      let line = lv.padEnd(16);
      for (const d of Object.keys(R.DIFFS)) {
        const rs = sample.map((k) => winRate(size === 1 ? [k] : [k, ...REF], lv, d, Math.round(n / sample.length * 2)));
        line += `${(mean(rs.map((x) => x.win)) * 100).toFixed(0)}% (${mean(rs.filter((x) => x.rounds).map((x) => x.rounds)).toFixed(1)})`.padStart(14);
      }
      console.log(line);
    }
  }
}

// ---------- Tuning by win rate ----------
// The boss is made as hard as it takes for the middle class to win half its fights (alone, and next to two plain
// damage dealers); then each class's attack moves until it wins about as often as the middle one. So a class that
// survives better or helps its party more ends up hitting a little softer.
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
function findOver(partyOf, level, n, target = 0.5) {
  let lo = 0.5, hi = 4;
  for (let i = 0; i < 7; i++) {
    const m = Math.sqrt(lo * hi), over = { hp: m, atk: Math.sqrt(m) };
    const w = median(R.ORDER.map((k) => winRate(partyOf(k), level, 'normal', n, 11, over).win));
    if (w > target) lo = m; else hi = m;
  }
  const m = Math.sqrt(lo * hi);
  return { hp: m, atk: Math.sqrt(m) };
}
function tuneWin(iter = 5, n = 300) {
  const T = Object.fromEntries(R.ORDER.map((k) => [k, R.TUNE[k] ?? 1]));
  const base = Object.fromEntries(R.ORDER.map((k) => [k, R.cls(k).atk / (R.TUNE[k] ?? 1)]));
  const apply = () => { for (const k of R.ORDER) R.cls(k).atk = Math.round(base[k] * T[k] / 10) * 10; };
  for (let it = 0; it < iter; it++) {
    apply();
    const oS = findOver((k) => [k], 'normal', Math.round(n / 3)), oT = findOver((k) => [k, ...REF], 'normal', Math.round(n / 3));
    let worst = 0, spread = [];
    for (const k of R.ORDER) {
      const ws = winRate([k], 'normal', 'normal', n, 23 + it, oS).win, wt = winRate([k, ...REF], 'normal', 'normal', n, 29 + it, oT).win;
      const off = 0.62 * (0.5 - ws) + 0.38 * 1.5 * (0.5 - wt);   // (alone counts a little more: it's how most people will play; in a trio a class is a third of the party, so its win rate moves less)
      T[k] = Math.max(0.5, Math.min(1.8, T[k] * Math.exp(0.5 * off)));
      worst = Math.max(worst, Math.abs(off)); spread.push(ws);
    }
    console.error(`pass ${it + 1}: boss x${oS.hp.toFixed(2)} alone / x${oT.hp.toFixed(2)} trio; solo win ${(Math.min(...spread) * 100).toFixed(0)}-${(Math.max(...spread) * 100).toFixed(0)}%, worst off ${(worst * 100).toFixed(0)}%`);
  }
  apply();
  writeTune(T);
}
// The boss's HP and attack for each difficulty: a grid search for the pair that gets closest to how often players of
// two levels should win alone (and keeps a winning fight to about 13 rounds at most).
function calibrate(n = 8) {
  const targets = { easy: [['easy', 0.9], ['normal', 0.99]], normal: [['easy', 0.6], ['normal', 0.93]], hard: [['normal', 0.55], ['hard', 0.9]], extreme: [['hard', 0.5], ['pro', 0.75]] };
  const out = {};
  const run = (lv, d, seed0) => { let w = 0, N = 0, rs = 0; for (const k of R.ORDER) for (let i = 0; i < n; i++) { const f = fight({ party: [k], level: lv, diff: d, seed: seed0 + (N++) * 104729 }); if (f.win) { w++; rs += f.rounds; } } return [w / N, w ? rs / w : 0]; };
  for (const [d, tg] of Object.entries(targets)) {
    let best = null;
    for (let hp = 0.6; hp <= 2.21; hp += 0.1) for (const atk of [0.6, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.2, 4]) {
      R.DIFFS[d].hp = hp; R.DIFFS[d].atk = atk;
      const r = tg.map(([lv]) => run(lv, d, 5));
      const err = tg.reduce((e, [, t], i) => e + (r[i][0] - t) ** 2, 0) + 0.002 * Math.max(0, r[r.length - 1][1] - 13) ** 2;
      if (!best || err < best.err) best = { hp: +hp.toFixed(2), atk, err, r };
    }
    R.DIFFS[d].hp = best.hp; R.DIFFS[d].atk = best.atk;
    out[d] = { hp: best.hp, atk: best.atk };
    console.error(`${d}: hp x${best.hp}, atk x${best.atk} -> ` + tg.map(([lv, t], i) => `${lv} players ${(best.r[i][0] * 100).toFixed(0)}% (want ${t * 100}%), wins in round ${best.r[i][1].toFixed(1)}`).join('; '));
  }
  writeDiffs(out);
}

// ---------- Tuning to the damage charts ----------
// A dummy fight the length of the charts' (5m40s = 11 rounds, nobody dies, good players): each class's attack (TUNE)
// moves until its damage stands to the lowest class's the way the chart says, and its Origin (ORIGIN) until the round
// it is used in holds the chart's share of the damage. Classes that aren't on the GMS chart get the GMS value of the
// class at the same place in the KMS ranking.
function chartTargets() {
  const kms = require('../../maplewordle-notes/raid/kms-dps-chart.json').rows;
  const byName = Object.fromEntries(R.ORDER.map((k) => [R.cls(k).name.toLowerCase(), k]));
  const rank = {}; kms.forEach((r, i) => { const k = byName[r.cls.toLowerCase()]; if (k) rank[k] = i / (kms.length - 1); });
  const gms = Object.values(R.CHART).map((v) => v[0]).sort((a, b) => b - a), shares = Object.values(R.CHART).map((v) => v[1]).sort((a, b) => a - b);
  const medShare = shares[Math.floor(shares.length / 2)];
  const at = (q) => { const x = q * (gms.length - 1), i = Math.floor(x), f = x - i; return gms[i] * (1 - f) + (gms[Math.min(gms.length - 1, i + 1)]) * f; };
  const T = {};
  for (const k of R.ORDER) T[k] = R.CHART[k] ? { rel: R.CHART[k][0], share: R.CHART[k][1] } : { rel: +at(rank[k] ?? 0.5).toFixed(1), share: medShare, placed: rank[k] == null ? 'middle' : 'kms' };
  return T;
}
function measure(k, n, party = [k]) {
  let dmg = 0, burst = 0;
  for (let i = 0; i < n; i++) {
    let b = 0;
    const f = fight({ party, level: 'hard', diff: 'hard', noDeath: true, over: { hp: 1e6 }, rounds: 16, seed: 3 + i * 7919,
      track: (S, inp) => { const st = (S.stats.p0 ??= { dmg: 0 }), d = st.dmg - (st._l || 0); st._l = st.dmg; if (Object.keys(inp.p0?.casts || {}).some((c) => R.skill(k, c)?.origin)) b += d; } });
    dmg += f.S.stats.p0?.dmg || 0; burst += b;
  }
  return { dmg: dmg / n, share: burst / dmg * 100 };
}
function chart(iter = 8, n = 150) {
  const want = chartTargets();
  const T = Object.fromEntries(R.ORDER.map((k) => [k, R.TUNE[k] ?? 1])), O = Object.fromEntries(R.ORDER.map((k) => [k, R.ORIGIN[k] ?? 1]));
  const base = Object.fromEntries(R.ORDER.map((k) => [k, R.cls(k).atk / (R.TUNE[k] ?? 1)]));
  const apply = () => { for (const k of R.ORDER) { R.cls(k).atk = Math.round(base[k] * T[k] / 10) * 10; R.cls(k).originK = O[k]; } };
  let m = {};
  for (let it = 0; it <= iter; it++) {
    apply();
    for (const k of R.ORDER) m[k] = measure(k, n);
    // the middle class keeps the attack it has, so the boss's numbers stay meaningful
    const ratio = R.ORDER.map((k) => m[k].dmg / (1 + want[k].rel / 100)), ref = median(ratio);
    let wd = 0, ws = 0;
    for (const k of R.ORDER) {
      const offD = ref * (1 + want[k].rel / 100) / m[k].dmg, s = m[k].share / 100, w = want[k].share / 100;
      const offS = (w / (1 - w)) / Math.max(0.01, s / (1 - s));
      wd = Math.max(wd, Math.abs(offD - 1)); ws = Math.max(ws, Math.abs(m[k].share - want[k].share));
      // (an Origin is never a small hit: at least ~5x attack, more for the classes the chart calls bursty)
      if (it < iter) { T[k] = Math.max(0.3, Math.min(3, T[k] * offD ** 0.9)); O[k] = Math.max(0.45 * want[k].share / 18.9, Math.min(6, O[k] * offS ** 0.8)); }
    }
    console.error(`pass ${it}: damage off by up to ${(wd * 100).toFixed(1)}%, burst share off by up to ${ws.toFixed(1)} points`);
  }
  const low = Math.min(...R.ORDER.map((k) => m[k].dmg));
  console.log('class                 chart   sim   burst chart/sim   attack  origin x');
  for (const k of R.ORDER.slice().sort((a, b) => m[b].dmg - m[a].dmg)) console.log(k.padEnd(20), ('+' + want[k].rel.toFixed(1)).padStart(6) + (want[k].placed ? '*' : ' '), ('+' + ((m[k].dmg / low - 1) * 100).toFixed(1)).padStart(6), want[k].share.toFixed(1).padStart(8), m[k].share.toFixed(1).padStart(5), String(R.cls(k).atk).padStart(8), (8 * O[k]).toFixed(1).padStart(7));
  const lines = ['const TUNE = { ' + R.ORDER.map((k) => `'${k}': ${T[k].toFixed(3)}`).join(', ') + ' };', 'const ORIGIN = { ' + R.ORDER.map((k) => `'${k}': ${O[k].toFixed(3)}`).join(', ') + ' };'];
  if (!WRITE) return console.log(lines.join('\n'));
  const f = path.join(__dirname, '../raid-classes.js'); let src = fs.readFileSync(f, 'utf8');
  if (!/^const TUNE = \{.*\};$/m.test(src) || !/^const ORIGIN = \{.*\};$/m.test(src)) throw new Error('TUNE / ORIGIN line not found');
  fs.writeFileSync(f, src.replace(/^const TUNE = \{.*\};$/m, lines[0]).replace(/^const ORIGIN = \{.*\};$/m, lines[1]));
  console.error('written to raid-classes.js');
}
const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--write');
if (cmd === 'report') report(+args[0] || 300);
else if (cmd === 'tune') tune(+args[0] || 6, +args[1] || 200);
else if (cmd === 'diff') diffTable(+args[0] || 200);
else if (cmd === 'tunewin') tuneWin(+args[0] || 5, +args[1] || 300);
else if (cmd === 'chart') chart(+args[0] || 8, +args[1] || 150);
else if (cmd === 'calibrate') calibrate(+args[0] || 8);
else if (cmd === 'fight') { const f = fight({ party: args.filter((a) => R.CLASSES[a]).length ? args.filter((a) => R.CLASSES[a]) : ['hero'], level: args.find((a) => LEVELS[a]) || 'normal', diff: (args.find((a) => a.startsWith('d=')) || 'd=normal').slice(2), seed: +(args.find((a) => /^\d+$/.test(a)) || 1), log: true }); console.log(f.win ? `\nWON in round ${f.rounds}` : `\nLOST in round ${f.rounds}`); }
else console.log('report | tune | diff | fight <classes...> [easy|normal|hard|pro] [d=hard] [seed]');
module.exports = { fight, speed, winRate, LEVELS };

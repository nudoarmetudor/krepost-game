import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fmt, fmtTime } from '../js/format.js';
import { STATS, UWS, CARDS, LABS, MODULE_SLOTS, CARD_STAR_COPIES, ENEMIES, TIERS, enemyHpAt, enemyDmgAt, enemyDmgScale } from '../js/data.js';
import {
  newSave, migrate, exportSave, importSave, offlineEarnings, applyOffline, startResearch, tickLabs,
  openCards, toggleCard, addModule, mergeModule, claimMilestones, finishRun, buyWorkshop, unlockStat,
  unlockUw, upgradeUw, idleCapSec, rushResearch, uwUnlockCost,
} from '../js/state.js';
import { computeStats } from '../js/stats.js';
import { Run } from '../js/game.js';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finite(obj, path = '') {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path}${k} is ${v}`);
    else if (v && typeof v === 'object' && !Array.isArray(v)) finite(v, path + k + '.');
  }
}

test('number formatting', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1234), '1.23K');
  assert.equal(fmt(12345), '12.3K');
  assert.equal(fmt(2.5e6), '2.5M');
  assert.equal(fmt(-1500), '-1.5K');
  assert.equal(fmtTime(3725), '1h 2m');
});

test('every stat value is finite from level 0 to max', () => {
  for (const s of STATS) {
    for (const l of [0, 1, Math.floor(s.max / 2), s.max]) assert.ok(Number.isFinite(s.v(l)), `${s.id} at ${l}`);
  }
});

test('old or broken saves still load', () => {
  const s = migrate({ coins: 50, stats: { runs: 3 }, perkOrder: ['dmg'] });
  assert.equal(s.coins, 50);
  assert.equal(s.stats.runs, 3);
  assert.equal(s.stats.kills, 0);
  assert.ok(s.perkOrder.length > 5);
  assert.equal(s.perkOrder[0], 'dmg');
  assert.deepEqual(migrate('nonsense').coins, 0);
});

test('export and import round trip', () => {
  const s = newSave(0);
  s.coins = 12345;
  s.cards.damage = 4;
  const back = importSave(exportSave(s), 0);
  assert.equal(back.coins, 12345);
  assert.equal(back.cards.damage, 4);
  assert.throws(() => importSave('hello'));
});

test('idle coins follow the recent runs and stop at the cap', () => {
  const s = newSave(0);
  s.stats.recentCps = [1, 3];
  s.lastSeen = 0;
  const hour = offlineEarnings(s, 3600 * 1000);
  assert.equal(hour.coins, Math.floor(3600 * 2 * 0.1));
  const week = offlineEarnings(s, 7 * 86400 * 1000);
  assert.equal(week.counted, idleCapSec(s));
  assert.equal(offlineEarnings(s, 30 * 1000).coins, 0);
  applyOffline(s, 3600 * 1000);
  assert.equal(s.coins, hour.coins);
  assert.equal(s.lastSeen, 3600 * 1000);
});

test('labs finish on the clock, also while away', () => {
  const s = newSave(0);
  s.coins = 1e6;
  assert.ok(startResearch(s, 'dmg', 0));
  assert.ok(!startResearch(s, 'health', 0), 'only one slot');
  const end = s.research[0].end;
  assert.deepEqual(tickLabs(s, end - 1), []);
  assert.deepEqual(tickLabs(s, end), ['dmg']);
  assert.equal(s.labs.dmg, 1);
  assert.ok(startResearch(s, 'dmg', end));
  s.gems = 100;
  assert.ok(rushResearch(s, 'dmg', end));
  assert.equal(s.labs.dmg, 2);
});

test('cards: packs, stars and slots', () => {
  const s = newSave(0);
  s.gems = 1000;
  const got = openCards(s, 10, seeded(3));
  assert.equal(got.length, 10);
  assert.equal(s.gems, 1000 - 180);
  const owned = Object.keys(s.cards);
  assert.ok(toggleCard(s, owned[0]));
  if (owned[1]) assert.ok(toggleCard(s, owned[1]));
  if (owned[2]) assert.ok(!toggleCard(s, owned[2]), 'third card needs a third slot');
  assert.equal(CARD_STAR_COPIES.length, 7);
  for (const c of CARDS) assert.equal(c.v.length, 7, c.id);
});

test('modules merge three of a kind into the next rarity', () => {
  const s = newSave(0);
  const a = addModule(s, 'cannon', 'piercer', 0);
  addModule(s, 'cannon', 'piercer', 0);
  addModule(s, 'cannon', 'piercer', 0);
  assert.ok(mergeModule(s, a.uid));
  assert.equal(s.modules.length, 1);
  assert.equal(s.modules[0].rarity, 1);
  assert.ok(!mergeModule(s, a.uid));
});

test('milestones pay once', () => {
  const s = newSave(0);
  const first = claimMilestones(s, 1, 30);
  assert.equal(first.length, 2);
  assert.equal(claimMilestones(s, 1, 30).length, 0);
});

test('a fresh run plays without errors and ends', () => {
  const s = newSave(0);
  const run = new Run(s, { rand: seeded(7) });
  let t = 0;
  while (!run.over && t < 3600) {
    run.step(1 / 30);
    t += 1 / 30;
  }
  assert.ok(run.over, 'an un-upgraded tower falls within an hour');
  assert.ok(run.wave >= 2);
  const res = run.result();
  finite(res);
  const fin = finishRun(s, res);
  assert.equal(s.stats.runs, 1);
  assert.ok(s.coins > 0);
  assert.equal(s.run, null);
  assert.ok(fin.stones >= 0);
});

test('everything unlocked: all weapons, cards and modules run together', () => {
  const s = newSave(0);
  s.coins = 1e12;
  s.stones = 1e9;
  for (const st of STATS) if (st.unlock) unlockStat(s, st.id);
  for (const st of STATS) for (let i = 0; i < 30; i++) buyWorkshop(s, st.id);
  for (const uw of UWS) {
    assert.ok(unlockUw(s, uw.id), uw.id);
    for (const p of uw.params) for (let i = 0; i < 5; i++) upgradeUw(s, uw.id, p.id);
  }
  for (const lab of LABS) s.labs[lab.id] = lab.max;
  s.cardSlots = CARDS.length;
  for (const c of CARDS) {
    s.cards[c.id] = 81;
    toggleCard(s, c.id);
  }
  for (const slot of MODULE_SLOTS) {
    const m = addModule(s, slot.id, slot.variants[0].id, 4);
    s.equipped[slot.id] = m.uid;
  }
  const S = computeStats(s, null);
  finite(S);
  assert.equal(Object.keys(S.uw).length, UWS.length);

  const run = new Run(s, { rand: seeded(11) });
  for (let i = 0; i < 60 * 600 && !run.over; i++) {
    run.step(1 / 60);
    if (run.pendingPerks) run.choosePerk(run.openPerk()[0]);
    if (i % 600 === 0) for (const st of STATS) run.buy(st.id, 3);
  }
  assert.ok(run.wave > 15, `reached wave ${run.wave}`);
  finite(run.result());
  for (const e of run.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.hp));
  assert.ok(Object.keys(run.damageBySource).length >= 5, Object.keys(run.damageBySource).join(','));
});

test('a run resumes from its snapshot', () => {
  const s = newSave(0);
  const run = new Run(s, { rand: seeded(5) });
  for (let i = 0; i < 60 * 70; i++) run.step(1 / 60);
  run.buy('damage', 2);
  const snap = JSON.parse(JSON.stringify(run.snapshot()));
  const again = new Run(s, { snapshot: snap, rand: seeded(6) });
  assert.equal(again.wave, run.wave);
  assert.equal(again.lv.damage, run.lv.damage);
  assert.equal(Math.round(again.cash), Math.round(run.cash));
  assert.ok(again.hp > 0);
});

test('in-run upgrades cost cash and respect the max', () => {
  const s = newSave(0);
  const run = new Run(s, { rand: () => 0.99 });
  run.cash = 1e9;
  const { bought } = run.buy('msTargets', 10);
  assert.equal(bought, 0, 'locked stat cannot be bought');
  const r2 = run.buy('critChance', 1000);
  assert.equal(r2.bought, 80);
  assert.ok(!run.canUpgrade('critChance'));
});

// ---------------------------------------------------------------------------
// Version 2 (2026-10-17): saves made by the first public version must keep
// working. The fixture was written by that version's own code (commit 55ce892)
// and holds a run in progress.

import { readFileSync } from 'node:fs';
import { load, SAVE_KEY } from '../js/state.js';

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('a version 1 save loads with everything in it, and its run carries on', () => {
  const raw = fixture('save-v1.json');
  const old = JSON.parse(raw);
  const store = { getItem: (k) => (k === SAVE_KEY ? raw : null) };
  const s = load(store, old.lastSeen);
  for (const k of ['coins', 'gems', 'stones', 'shards', 'tier', 'tiersUnlocked']) assert.equal(s[k], old[k], k);
  assert.deepEqual(s.ws, old.ws);
  assert.deepEqual(s.best, old.best);
  assert.deepEqual(s.cards, old.cards);
  assert.deepEqual(s.equippedCards, old.equippedCards);
  assert.deepEqual(s.modules, old.modules);
  assert.deepEqual(s.uws, old.uws);
  assert.deepEqual(s.research, old.research);

  const run = new Run(s, { tier: s.run.tier, snapshot: s.run, rand: seeded(3) });
  assert.equal(run.wave, old.run.wave);
  assert.deepEqual(run.lv, old.run.lv);
  assert.equal(Math.round(run.cash), Math.round(old.run.cash));
  for (let i = 0; i < 60 * 120 && !run.over; i++) run.step(1 / 60);
  assert.ok(run.wave > old.run.wave);
  finite(run.result());
  const fin = finishRun(s, run.result());
  assert.ok(fin.stones >= 0 && s.coins > old.coins);
  finite(computeStats(s, null));
});

test('a version 1 export code imports', () => {
  const s = importSave(fixture('save-v1.code.txt'));
  const old = JSON.parse(fixture('save-v1.json'));
  assert.deepEqual(s.ws, old.ws);
  assert.equal(s.run.wave, old.run.wave);
});

test('the stats panel shows the numbers the game uses', () => {
  const s = JSON.parse(fixture('save-v1.json'));
  const run = new Run(migrate(s, 0), { snapshot: s.run, rand: seeded(4) });
  const S = run.S;
  for (const [id, ex] of Object.entries(S.explain)) {
    assert.equal(ex.total, S[id], id);
    let v = ex.base;
    for (const p of ex.parts) v = p.op === '×' ? v * p.v : p.op === '+' ? v + p.v : p.v;
    assert.ok(Math.abs(v - S[id]) <= 1e-9 * Math.max(1, Math.abs(v)), `${id}: ${v} vs ${S[id]}`);
  }
  for (const type of Object.keys(ENEMIES)) {
    const e = run.addEnemy(type, 30, 0);
    assert.equal(e.maxHp, enemyHpAt(ENEMIES[type], run.wave, run.tier, S.enemyHpMult).total, type);
  }
});

// A run with nothing on the field except what a test puts there.
function quietRun() {
  const s = newSave(0);
  const run = new Run(s, { rand: seeded(9) });
  run.spawnAcc = -1e9;
  run.S.atkSpeed = 30;
  run.S.critChance = 0;
  run.S.msChance = 0;
  run.S.bounceChance = 0;
  const origins = [];
  const fire = run.fireShot.bind(run);
  run.fireShot = (x, y, ...a) => { origins.push([x, y]); return fire(x, y, ...a); };
  return { run, fired: () => origins.length, origins };
}

test('the tower fires only the shots an enemy needs, from its centre', () => {
  const { run, fired, origins } = quietRun();
  const e = run.addEnemy('basic', 25, 0);
  e.hp = e.maxHp = run.S.damage * 2.5; // three shots
  for (let i = 0; i < 60 && !e.dead; i++) run.step(1 / 60);
  assert.ok(e.dead);
  assert.equal(fired(), 3);
  assert.deepEqual(origins, [[0, 0], [0, 0], [0, 0]]);
  assert.equal(run.shots.length, 0);
});

test('a shot whose enemy dies on the way goes on to another one', () => {
  const { run } = quietRun();
  const a = run.addEnemy('basic', 25, 0);
  const b = run.addEnemy('basic', 0, 27);
  a.hp = a.maxHp = b.hp = b.maxHp = run.S.damage * 0.5;
  run.S.atkSpeed = 1;
  run.atkAcc = 1; // exactly one shot ready, at the nearer enemy
  run.updateTower(0);
  run.atkAcc = -1e9;
  assert.equal(run.shots.length, 1);
  assert.equal(run.shots[0].target, a);
  run.damage(a, 1e9, 'orbs');
  for (let i = 0; i < 90 && !b.dead; i++) run.step(1 / 60);
  assert.ok(b.dead, 'the shot moved on to the other enemy');
  assert.equal(b.pending, 0);
});

test('Mine Ring mines never pile up past the cap', () => {
  const s = newSave(0);
  s.stones = 1e6;
  assert.ok(unlockUw(s, 'minering'));
  const run = new Run(s, { rand: seeded(2) });
  run.spawnAcc = -1e9;
  for (let i = 0; i < 200; i++) run.triggerUw('minering', run.S.uw.minering, run.uw.minering);
  assert.ok(run.mines.length <= 60, `${run.mines.length} mines`);
});

test('idle income averages the last five runs, and an old save starts from its best run', () => {
  const old = migrate({ stats: { bestCoinsPerSec: 4 } }, 0);
  assert.deepEqual(old.stats.recentCps, [4]);
  const s = newSave(0);
  for (const c of [10, 1, 1, 1, 1, 1]) finishRun(s, { tier: 1, wave: 5, coins: c * 100, cash: 0, kills: 0, bossKills: 0, simSec: 100, damage: 0 });
  assert.deepEqual(s.stats.recentCps, [1, 1, 1, 1, 1]);
  assert.equal(s.stats.bestCoinsPerSec, 10);
});

test('each ultimate weapon unlocked makes the next one dearer, in any order', () => {
  const s = newSave(0);
  s.stones = 10000;
  assert.equal(uwUnlockCost(s), 5);
  assert.ok(unlockUw(s, 'venom'));
  assert.equal(s.stones, 9995);
  assert.equal(uwUnlockCost(s), 50);
  assert.ok(unlockUw(s, 'wave'));
  assert.equal(s.stones, 9945);
});

test('the first boss of tier 1 has half health and damage, later ones do not', () => {
  const boss = ENEMIES.boss;
  assert.ok(Math.abs(enemyHpAt(boss, 10, 1).total * 2 - enemyHpAt(boss, 10, 2).total / TIERS[1].hp) < 1e-9);
  assert.ok(Math.abs(enemyDmgAt(boss, 20, 1).total - boss.dmg * enemyDmgScale(20, 1)) < 1e-9);
  assert.ok(Math.abs(enemyDmgAt(boss, 10, 1).total - boss.dmg * enemyDmgScale(10, 1) * 0.5) < 1e-9);
});

// ---------------------------------------------------------------------------
// Version 3 (2026-10-19): missions, the weekly challenge, seasons, card
// collections, refining, tabs that open as the player gets there.

import {
  ensureMissions, claimMission, missionDone, ensureChallenge, challengeMods, ensureSeason, seasonThemes,
  cardSetProgress, canRefine, buyRefine, refineCost, tabOpen, bestTierForCoins, weekKey,
} from '../js/meta.js';
import { CARD_SETS, CHALLENGE_REWARDS } from '../js/data.js';

const runResult = (o) => ({ tier: 1, wave: 20, coins: 1000, cash: 0, kills: 400, bossKills: 2, simSec: 300, damage: 0, ...o });

test('missions come with the first run, count runs, and pay once when claimed', () => {
  const now = new Date(2026, 9, 20, 12).getTime();
  const s = newSave(now);
  assert.equal(ensureMissions(s, now), false); // nothing before the first run
  finishRun(s, runResult({}), now);
  assert.equal(s.missions.daily.length, 3);
  assert.equal(s.missions.weekly.length, 2);
  const runs = s.missions.daily.findIndex((x) => x.kind === 'runs');
  const x = s.missions.daily[runs >= 0 ? runs : 0];
  for (let i = 0; i < 40 && !missionDone(x); i++) finishRun(s, runResult({ wave: 200, coins: 1e6, kills: 1e5, bossKills: 50 }), now);
  assert.ok(missionDone(x));
  const gems = s.gems;
  assert.ok(claimMission(s, 'daily', s.missions.daily.indexOf(x)));
  assert.equal(s.gems, gems + x.gems);
  assert.equal(claimMission(s, 'daily', s.missions.daily.indexOf(x)), null);
  // the same date gives the same missions on any device
  const t = newSave(now);
  finishRun(t, runResult({}), now);
  assert.deepEqual(t.missions.daily.map((m) => m.kind), s.missions.daily.map((m) => m.kind));
});

test('a challenge run uses its modifiers, pays its stones once a week, and sets no records', () => {
  const now = new Date(2026, 9, 21, 12).getTime();
  const s = newSave(now);
  s.tiersUnlocked = 3;
  const c = ensureChallenge(s, now);
  assert.equal(c.tier, 2);
  assert.equal(c.mods.length, 2);
  assert.equal(c.week, weekKey(now));
  const run = new Run(s, { tier: c.tier, challenge: { week: c.week, mods: ['glass', 'giants'] }, rand: seeded(3) });
  const plain = new Run(s, { tier: c.tier, rand: seeded(3) });
  assert.ok(Math.abs(run.S.maxHp - plain.S.maxHp * 0.5) < 1e-9);
  assert.equal(run.bossEvery(), 5);
  assert.deepEqual(challengeMods(['horde']).count, 2);
  const back = new Run(s, { tier: 2, snapshot: run.snapshot() });
  assert.equal(back.bossEvery(), 5);
  const stones = s.stones;
  const fin = finishRun(s, { ...runResult({ tier: 2, wave: 30 }), challenge: true, week: c.week }, now);
  assert.equal(s.best[2], undefined);
  assert.equal(s.tiersUnlocked, 3);
  const want = CHALLENGE_REWARDS.filter((r) => r.wave <= 30).reduce((a, r) => a + Math.round(r.stones * 1.25), 0);
  assert.equal(fin.challenge.reduce((a, r) => a + r.stones, 0), want);
  assert.equal(s.stones, stones + fin.stones + want);
  const again = finishRun(s, { ...runResult({ tier: 2, wave: 30 }), challenge: true, week: c.week }, now);
  assert.equal(again.challenge.length, 0);
});

test('a season counts waves and hands out its two colours, then a crest', () => {
  const now = new Date(2026, 10, 20, 12).getTime();
  const s = newSave(now);
  const se = ensureSeason(s, now);
  assert.equal(se.id, 2);
  const [a, b] = seasonThemes(se.id);
  assert.notEqual(a.id, 'ember');
  let got = [];
  for (let i = 0; i < 12; i++) got = got.concat(finishRun(s, runResult({ wave: 200 }), now).season);
  assert.ok(s.themes.includes(a.id) && s.themes.includes(b.id));
  assert.deepEqual(s.crests, [2]);
  assert.equal(got.length, 3);
});

test('a full card collection pays its bonus without being equipped', () => {
  const s = newSave(0);
  const set = CARD_SETS[0];
  const before = computeStats(s, null).coinMult;
  for (const c of CARDS.filter((x) => x.rarity === set.rarity)) s.cards[c.id] = CARD_STAR_COPIES[set.stars - 1];
  assert.ok(cardSetProgress(s, set).done);
  assert.ok(Math.abs(computeStats(s, null).coinMult - before * (1 + set.coins)) < 1e-9);
});

test('a maxed stat refines 1% a level, a stat below max does not', () => {
  const s = newSave(0);
  s.coins = 1e15;
  assert.equal(canRefine(s, 'critChance'), false);
  s.ws.critChance = 80;
  const before = computeStats(s, null).critChance;
  const cost = refineCost(s, 'critChance');
  assert.ok(buyRefine(s, 'critChance'));
  assert.equal(s.coins, 1e15 - cost);
  assert.ok(Math.abs(computeStats(s, null).critChance - before * 1.01) < 1e-9);
  s.ws.msTargets = 5;
  assert.equal(canRefine(s, 'msTargets'), false);
});

test('tabs open as the player gets there, and old saves keep everything open', () => {
  const s = newSave(0);
  assert.deepEqual(['labs', 'ultimates', 'cards', 'modules'].map((t) => tabOpen(s, t)), [false, false, false, false]);
  finishRun(s, runResult({ wave: 30 }));
  assert.equal(tabOpen(s, 'labs'), true);
  assert.equal(tabOpen(s, 'cards'), true);
  const raw = fixture('save-v1.json');
  const old = load({ getItem: (k) => (k === SAVE_KEY ? raw : null) });
  assert.deepEqual(['labs', 'ultimates', 'cards', 'modules'].map((t) => tabOpen(old, t)), [true, true, true, true]);
  assert.ok(Array.isArray(old.missions.daily) && old.challenge && old.season && old.themes.includes('ember'));
  assert.equal(old.settings.speed, JSON.parse(fixture('save-v1.json')).settings.speed);
});

test('Home recommends the tier that paid the most coins per minute lately', () => {
  const s = newSave(0);
  s.tiersUnlocked = 3;
  finishRun(s, runResult({ tier: 1, coins: 3000, simSec: 300 }));
  assert.equal(bestTierForCoins(s), null);
  finishRun(s, runResult({ tier: 2, coins: 9000, simSec: 300 }));
  finishRun(s, runResult({ tier: 3, coins: 6000, simSec: 300 }));
  assert.equal(bestTierForCoins(s).tier, 2);
});

test('a new player starts at double speed', () => {
  assert.equal(newSave(0).settings.speed, 2);
});

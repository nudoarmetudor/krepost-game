import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fmt, fmtTime } from '../js/format.js';
import { STATS, UWS, CARDS, LABS, MODULE_SLOTS, CARD_STAR_COPIES } from '../js/data.js';
import {
  newSave, migrate, exportSave, importSave, offlineEarnings, applyOffline, startResearch, tickLabs,
  openCards, toggleCard, addModule, mergeModule, claimMilestones, finishRun, buyWorkshop, unlockStat,
  unlockUw, upgradeUw, idleCapSec, rushResearch,
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

test('idle coins follow the best run and stop at the cap', () => {
  const s = newSave(0);
  s.stats.bestCoinsPerSec = 2;
  s.lastSeen = 0;
  const hour = offlineEarnings(s, 3600 * 1000);
  assert.equal(hour.coins, Math.floor(3600 * 2 * 0.15));
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
import { ENEMIES, enemyHpAt } from '../js/data.js';

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

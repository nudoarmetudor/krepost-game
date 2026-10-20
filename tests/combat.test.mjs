// Version 3 combat rules: Fortitude, Lancers that stand off farther on higher
// tiers, and the three late enemies (Phalanx, Pouncer, Shepherd).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ENEMIES, FORTITUDE, standoffAt } from '../js/data.js';
import { newSave } from '../js/state.js';
import { Run } from '../js/game.js';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A run with nothing on the field and a tower that does not shoot.
function emptyRun(tier = 1) {
  const run = new Run(newSave(0), { tier, rand: seeded(5) });
  run.spawnAcc = -1e9;
  run.atkAcc = -1e9;
  run.S.atkSpeed = 1e-9;
  return run;
}

test('Fortitude: however much hits the walls, a second lets in at most its share of health', () => {
  const run = emptyRun();
  run.S.regen = 0;
  run.S.defPct = 0.5;
  run.S.defAbs = 0;
  run.step(1 / 60); // fills the allowance
  const max = run.S.maxHp;
  const before = run.hp;
  for (let i = 0; i < 20; i++) run.hitTower(max * 0.2, null);
  const lost = before - run.hp;
  assert.ok(lost <= max * FORTITUDE.cap * 0.5 + 1e-9, `lost ${lost} of ${max}`);
  assert.ok(lost > max * FORTITUDE.cap * 0.5 * 0.99);
  assert.ok(run.hp > 0, 'four times its health in one go, and still standing');
});

test('Fortitude: strain raises the allowance while the walls stay overrun, then relaxes', () => {
  const run = emptyRun();
  run.S.regen = 0;
  run.S.defPct = 0.9; // so it does not fall in this test
  run.step(1 / 60);
  const cap0 = run.fortCap();
  for (let i = 0; i < 600; i++) {
    run.hitTower(run.S.maxHp, null);
    run.step(1 / 60);
  }
  assert.ok(run.strain > 9, `strain ${run.strain}`);
  assert.ok(run.fortCap() > cap0 * (1 + FORTITUDE.strain * 9));
  for (let i = 0; i < 60 * 30; i++) run.step(1 / 60);
  assert.equal(run.strain, 0);
});

test('an overrun tower still falls, and Defense % makes it hold longer', () => {
  const hold = (defPct) => {
    const run = emptyRun();
    run.S.regen = 0;
    run.S.defPct = defPct;
    let t = 0;
    while (!run.over && t < 600) {
      run.hitTower(run.S.maxHp * 5, null);
      run.step(1 / 20);
      t += 1 / 20;
    }
    assert.ok(run.over, `defense ${defPct} held for ${t}s`);
    return t;
  };
  const bare = hold(0);
  const armoured = hold(0.75);
  assert.ok(armoured > bare * 2, `${bare}s bare, ${armoured}s with 75% defense`);
});

test('under strain, Regen cannot outlast Fortitude on walls with little health', () => {
  const run = emptyRun();
  run.S.defPct = 0;
  run.S.regen = run.S.maxHp; // a full wall a second, four times the allowance
  let t = 0;
  while (!run.over && t < 600) {
    run.hitTower(run.S.maxHp * 5, null);
    run.step(1 / 20);
    t += 1 / 20;
  }
  assert.ok(run.over, 'Regen alone held the walls');
  assert.ok(t < 2 / (FORTITUDE.cap * (1 - FORTITUDE.mend)), `held ${t}s`);
});

test('Lancers stand farther out on higher tiers, past the base range from tier 5', () => {
  const def = ENEMIES.ranged;
  assert.equal(standoffAt(def, 1), 24);
  assert.ok(standoffAt(def, 4) < 28);
  assert.ok(standoffAt(def, 5) > 28);
  const run = emptyRun(6);
  const e = run.addEnemy('ranged', 50, 0);
  for (let i = 0; i < 60 * 10; i++) run.step(1 / 60);
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - standoffAt(def, 6)) < 0.01);
  assert.ok(Math.hypot(e.x, e.y) > run.S.range, 'out of reach of a bare tower');
  assert.ok(run.enemyShots.length + (run.hp < run.S.maxHp ? 1 : 0) > 0, 'and it fires from there');
});

test('a Phalanx shield soaks its first hits whatever their size; the tower counts them', () => {
  const run = emptyRun(4);
  const e = run.addEnemy('guarded', 20, 0);
  const n = ENEMIES.guarded.guard;
  for (let i = 0; i < n; i++) assert.equal(run.damage(e, 1e30, 'tower'), 0);
  assert.equal(e.hp, e.maxHp);
  assert.equal(e.guard, 0);
  run.damage(e, 1, 'tower');
  assert.equal(e.hp, e.maxHp - 1);
  // the tower sends one shot per plate plus the ones the health needs
  const f = emptyRun(4);
  f.S.atkSpeed = 30;
  f.S.critChance = 0;
  f.S.msChance = 0;
  f.S.bounceChance = 0;
  f.atkAcc = 0;
  let shots = 0;
  const fire = f.fireShot.bind(f);
  f.fireShot = (...a) => { shots++; return fire(...a); };
  const g = f.addEnemy('guarded', 20, 0);
  g.hp = g.maxHp = f.S.damage * 1.5;
  for (let i = 0; i < 120 && !g.dead; i++) f.step(1 / 60);
  assert.ok(g.dead);
  assert.equal(shots, n + 2);
});

test('a Pouncer stops just outside the base range, then leaps close to the walls', () => {
  const run = emptyRun(5);
  const def = ENEMIES.leaper;
  const e = run.addEnemy('leaper', 45, 0);
  let paused = false;
  for (let i = 0; i < 60 * 8 && !e.leapt; i++) {
    run.step(1 / 60);
    if (e.windup > 0) paused = true;
  }
  assert.ok(paused && e.leapt);
  assert.ok(Math.hypot(e.x, e.y) <= def.leapTo + 0.5);
  assert.ok(def.leapAt > 28, 'the base range does not reach it before it leaps');
});

test('a Shepherd heals the enemies around it, not those far away', () => {
  const run = emptyRun(6);
  const s = run.addEnemy('healer', 40, 0);
  const near = run.addEnemy('basic', 44, 0);
  const far = run.addEnemy('basic', -40, 0);
  for (const e of [s, near, far]) e.speed = 0;
  near.hp = far.hp = near.maxHp * 0.5;
  for (let i = 0; i < 60; i++) run.step(1 / 60);
  const want = near.maxHp * (0.5 + ENEMIES.healer.heals);
  assert.ok(Math.abs(near.hp - want) < near.maxHp * 0.02, `${near.hp / near.maxHp}`);
  assert.equal(far.hp, far.maxHp * 0.5);
});

test('the new enemies only come on the tiers they belong to', async () => {
  const { spawnTable } = await import('../js/data.js');
  const has = (w, t, type) => spawnTable(w, t).some(([x]) => x === type);
  assert.ok(!has(100, 3, 'guarded') && has(100, 4, 'guarded'));
  assert.ok(!has(100, 4, 'leaper') && has(100, 5, 'leaper'));
  assert.ok(!has(100, 5, 'healer') && has(100, 6, 'healer'));
});

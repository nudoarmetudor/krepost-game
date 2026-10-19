// Which upgrade buys the most per coin. A small model of the tower against the
// coming waves, read from computeStats, so every rule the game applies to its
// stats (cards, labs, perks, modules) is counted without being copied here.
// No DOM: the run panel, the workshop, auto-buy, the tests and the sim share it.

import { STATS, STAT_BY_ID, ENEMIES, WORLD, enemyHpAt, enemyDmgAt, spawnInterval, TIERS } from './data.js';
import { computeStats } from './stats.js';
import { isUnlocked, wsLevel, workshopCost } from './state.js';

// How much the walls count, how much cash and coins count, next to killing.
const RUN_W = { cash: 0.55, coin: 0.25, free: 0.3 };
const WS_W = { cash: 0.3, coin: 0.55, free: 0.3 };
const LOOKAHEAD = 4; // waves ahead the in-run model plans for
const MIN_DANGER = 0.03; // even at full health a little defense is worth something

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// The tower against wave w. O: kills per second, overkill aware, blended with
// raw damage per second for bosses. Dv: how many hits the walls absorb.
// cashInc, coinInc: income per wave. free: free-upgrade chances.
export function towerModel(S, w, tier) {
  const T = TIERS[tier - 1];
  const hpE = enemyHpAt(ENEMIES.basic, w, tier, S.enemyHpMult).total;
  const raw = enemyDmgAt(ENEMIES.basic, w, tier).total;
  const crit = 1 + S.critChance * (S.critFactor - 1);
  const dist = Math.min(S.range, 18);
  const dmgShot = S.damage * crit * (1 + S.dmgPerMeter * dist);
  const shots = S.atkSpeed * (1 + S.msChance * (S.msTargets - 1)) * (1 + S.bounceChance * S.bounceTargets * 0.8);
  // more range: enemies are under fire for longer before they reach the walls
  const rangeF = Math.pow(Math.max(1, S.range - 6) / 22, 0.4);
  const extraDps = S.damage * (S.orbs * S.orbSpeed * 0.8 + (S.swSize > 0 ? (2.5 * S.swSize) / 10 / S.swInterval : 0)
    + S.mineChance * S.mineDmg * 1.5 + (S.plasma ? S.plasma / 8 : 0));
  const killRate = (shots / Math.max(1, hpE / dmgShot)) * rangeF + extraDps / hpE;
  const dps = dmgShot * shots + extraDps;
  const O = Math.pow(killRate, 0.7) * Math.pow(dps, 0.3);
  const mit = Math.max(raw * 0.002, Math.max(0, raw - S.defAbs) * (1 - S.defPct));
  let Dv = (S.maxHp + 25 * S.regen) / mit;
  Dv *= 1 + 2 * S.thorns + (S.kbChance * S.kbForce) / 8 + S.pkgChance * S.recovery * 3 + S.lifesteal * 8;
  const kills = ((WORLD.waveSeconds - 2) / spawnInterval(w)) * S.enemyCountMult;
  const cashInc = S.cashWave * S.cashMult + kills * 2.6 * (1 + 0.025 * w) * S.cashMult * T.cash
    + Math.min(S.interest * kills * 15 * S.cashMult, (30 + 12 * w) * S.cashMult * S.interestCapMult);
  const coinInc = S.coinWave * S.coinMult * T.coins + kills * 0.75 * (1 + 0.012 * w) * S.coinMult * T.coins;
  const free = Math.log(1 / ((1 - S.freeAtk) * (1 - S.freeDef) * (1 - S.freeUtil)));
  return { O, Dv, cashInc, coinInc, free, dmgShot, singleDps: dmgShot * S.atkSpeed };
}

// How badly the next boss would go, 0 (easily) to 1 (the walls fall first):
// the time the tower needs to kill it against the time the walls hold.
export function bossDanger(S, w, tier) {
  const wb = Math.max(10, Math.ceil(w / 10) * 10);
  const boss = ENEMIES.boss;
  const hp = enemyHpAt(boss, wb, tier, S.enemyHpMult).total;
  const hit = Math.max(0, enemyDmgAt(boss, wb, tier).total - S.defAbs) * (1 - S.defPct);
  const m = towerModel(S, wb, tier);
  const tKill = hp / Math.max(1e-9, m.singleDps);
  const walk = Math.max(1, S.range - WORLD.towerRadius - boss.r) / boss.speed;
  const drain = hit - S.regen;
  const tHold = walk + (drain > 0 ? S.maxHp / drain : Infinity);
  const near = clamp(1 - (wb - w - 2) / 6, 0, 1); // counts fully from two waves out
  return clamp(tKill / tHold, 0, 1) * near;
}

// Danger seen in this run: how low the walls have been lately. Forgets
// slowly (about 1% of health per second of run time).
function seenDanger(run) {
  const frac = clamp(run.hp / run.S.maxHp, 0, 1);
  const st = run._advLow || { low: frac, t: run.simTime };
  st.low = Math.min(frac, st.low + (run.simTime - st.t) * 0.01);
  st.t = run.simTime;
  run._advLow = st;
  return clamp((1 - st.low) * 1.5, 0, 1);
}

function utility(S, w, tier, W, danger) {
  const m = towerModel(S, w, tier);
  return Math.log(m.O) + danger * Math.log(m.Dv) + W.cash * Math.log(m.cashInc + 1)
    + W.coin * Math.log(m.coinInc + 1e-9) + W.free * m.free;
}

function freeChance(S, stat) {
  return stat.cat === 'attack' ? S.freeAtk : stat.cat === 'defense' ? S.freeDef : S.freeUtil;
}

// Every stat the run can still raise, with its value per cash of one more
// level, best first. Value 0 means the model sees no gain.
export function rankRun(run) {
  const w = run.wave + LOOKAHEAD;
  const danger = Math.max(MIN_DANGER, seenDanger(run), bossDanger(run.S, run.wave, run.tier));
  const base = utility(run.S, w, run.tier, RUN_W, danger);
  const out = [];
  for (const st of STATS) {
    if (!run.canUpgrade(st.id)) continue;
    // a stand-in run with one more level; inherits everything else the run has
    const probe = Object.create(run);
    probe.lv = { ...run.lv, [st.id]: (run.lv[st.id] || 0) + 1 };
    const du = utility(computeStats(run.save, probe), w, run.tier, RUN_W, danger) - base;
    const cost = run.upgradeCost(st.id) * (1 - freeChance(run.S, st));
    out.push({ id: st.id, cat: st.cat, value: du > 0 ? du / Math.max(1e-9, cost) : 0, cost: run.upgradeCost(st.id) });
  }
  out.sort((a, b) => b.value - a.value);
  return { danger, list: out };
}

// The same for the workshop: coins instead of cash, the best wave on the
// tier as the wave to plan for. The tower died there, but the model does not
// know from what, so the walls count by the next boss, and at least a third.
export function rankWorkshop(save, tier = save.tier) {
  const w = Math.max(10, save.best[tier] || 0);
  const S0 = computeStats(save, null);
  const danger = Math.max(1 / 3, bossDanger(S0, w, tier));
  const base = utility(S0, w, tier, WS_W, danger);
  const out = [];
  for (const st of STATS) {
    if (!isUnlocked(save, st) || wsLevel(save, st.id) >= st.max) continue;
    const cost = workshopCost(save, st.id);
    save.ws[st.id] = wsLevel(save, st.id) + 1;
    const du = utility(computeStats(save, null), w, tier, WS_W, danger) - base;
    save.ws[st.id]--;
    out.push({ id: st.id, cat: st.cat, value: du > 0 ? du / Math.max(1e-9, cost) : 0, cost });
  }
  out.sort((a, b) => b.value - a.value);
  return { danger, list: out };
}

// The ids worth a "best value" badge: the top one, and the second if it is
// close (within 70% of the top's value per coin).
export function bestIds(ranked, n = 2) {
  const list = ranked.list.filter((x) => x.value > 0);
  if (!list.length) return [];
  const out = [list[0].id];
  for (let i = 1; i < n && i < list.length; i++) if (list[i].value >= list[0].value * 0.7) out.push(list[i].id);
  return out;
}

// Rankings change only when levels, perks, the wave or the danger band do,
// so the run panel asks through this and pays for the model rarely.
export function runAdvice(run) {
  const S = run.S;
  const band = Math.round(Math.max(seenDanger(run), bossDanger(S, run.wave, run.tier)) * 10);
  const key = `${run.wave}|${band}|${JSON.stringify(run.lv)}|${JSON.stringify(run.perks)}`;
  if (run._advice && run._advice.key === key) return run._advice;
  const ranked = rankRun(run);
  run._advice = { key, ranked, best: bestIds(ranked) };
  return run._advice;
}

export { STAT_BY_ID };

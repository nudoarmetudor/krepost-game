// Balance check: plays runs headless with a simple bot and prints how far
// a player gets as the workshop grows.  node tools/sim.mjs [runs] [tier]

import { Run } from '../js/game.js';
import { newSave, finishRun, buyWorkshop, workshopCost, unlockStat, startResearch, tickLabs } from '../js/state.js';
import { STATS, LABS } from '../js/data.js';

const runs = Number(process.argv[2] || 8);
const tier = Number(process.argv[3] || 1);
const save = newSave(0);
const BOT_PRIORITY = ['damage', 'atkSpeed', 'health', 'regen', 'defAbs', 'cashBonus', 'cashWave', 'critChance', 'critFactor', 'defPct', 'range', 'coinKill', 'thorns', 'kbChance'];

function botBuy(run) {
  // buy the cheapest of the priority stats, repeatedly
  for (let guard = 0; guard < 200; guard++) {
    let best = null;
    let bc = Infinity;
    for (const id of BOT_PRIORITY) {
      if (!run.canUpgrade(id)) continue;
      const c = run.upgradeCost(id) * (id === 'damage' || id === 'health' ? 0.6 : id === 'atkSpeed' || id === 'regen' ? 0.8 : 1);
      if (c < bc) { bc = c; best = id; }
    }
    if (!best || run.upgradeCost(best) > run.cash) return;
    run.buy(best, 1);
  }
}

let clock = 0;
for (let i = 0; i < runs; i++) {
  save.tier = tier;
  const run = new Run(save, { tier });
  let t = 0;
  while (!run.over && t < 4 * 3600) {
    run.step(1 / 30);
    t += 1 / 30;
    if (Math.floor(t * 30) % 30 === 0) botBuy(run);
    if (run.pendingPerks) run.autoPickPerk();
  }
  const res = run.result();
  const fin = finishRun(save, res);
  clock += t * 1000;
  // spend coins in the workshop on the cheapest priority stat
  for (let g = 0; g < 2000; g++) {
    let best = null;
    let bc = Infinity;
    for (const id of BOT_PRIORITY) {
      const c = workshopCost(save, id);
      if (c < bc) { bc = c; best = id; }
    }
    if (!best || bc > save.coins) break;
    buyWorkshop(save, best);
  }
  tickLabs(save, clock);
  console.log(`run ${i + 1}: wave ${res.wave}, ${Math.round(t / 60)} min, coins ${res.coins}, kills ${res.kills}, stones +${fin.stones}, ws dmg ${save.ws.damage || 0} hp ${save.ws.health || 0}`);
}

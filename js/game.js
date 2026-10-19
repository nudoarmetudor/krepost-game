// One run: the tower, the waves, every shot. No DOM here, so the same code
// runs in the browser and in the Node tests.

import {
  WORLD, STATS, STAT_BY_ID, runCost, ENEMIES, enemyHpAt, enemyDmgAt, enemyCashAt, enemyCoinsAt, spawnInterval, spawnTable,
  TIERS, PERKS, PERK_BY_ID, BOSS_GEM_CHANCE, BOSS_MODULE_CHANCE, GEM_DROP_EVERY,
} from './data.js';
import { computeStats } from './stats.js';
import { isUnlocked, rollModule } from './state.js';
import { challengeMods } from './meta.js';
import { runAdvice } from './advisor.js';

const TAU = Math.PI * 2;
const MAX_ENEMIES = 450;
const MAX_FX = 260;
const MAX_MINES = 60;

export class Run {
  constructor(save, { tier = save.tier, rand = Math.random, snapshot = null, challenge = null } = {}) {
    this.save = save;
    this.rand = rand;
    this.tier = tier;
    this.lv = {};
    this.perks = {};
    // a weekly challenge run: { week, mods: [ids] }
    this.challenge = snapshot ? snapshot.challenge || null : challenge;
    this.mods = this.challenge ? challengeMods(this.challenge.mods) : null;
    this.S = computeStats(save, this);
    this.wave = 1;
    this.waveTime = 0;
    this.simTime = 0;
    this.cash = 0;
    this.coins = 0;
    this.cashEarned = 0;
    this.kills = 0;
    this.bossKills = 0;
    this.damageDealt = 0;
    this.gemsFound = 0;
    this.stonesFound = 0;
    this.shardsFound = 0;
    this.modulesFound = [];
    this.hp = this.S.maxHp;
    this.enemies = [];
    this.shots = [];
    this.enemyShots = [];
    this.mines = [];
    this.pools = [];
    this.packages = [];
    this.fx = [];
    this.sfx = [];
    this.log = [];
    this.spawnAcc = 0;
    this.atkAcc = 0;
    this.swAcc = 0;
    this.shotCount = 0;
    this.orbAngle = 0;
    this.orbHits = new Map();
    this.perkCounter = 0;
    this.pendingPerks = 0;
    this.perkChoicesNow = null;
    this.shieldAcc = 0;
    this.shieldReady = this.S.shieldEvery > 0;
    this.secondWindUsed = false;
    this.demonUsed = false;
    this.demonT = 0;
    this.plasmaAcc = 0;
    this.gemAcc = 0;
    this.gemBubble = null;
    this.bossSpawned = 0;
    this.uw = {};
    this.searchAngle = 0;
    this.over = false;
    this.nextId = 1;
    this.target = null;
    this.aim = -Math.PI / 2;
    this.fireT = 0;
    this.shake = 0;
    this.damageBySource = {};
    this.spent = { attack: 0, defense: 0, utility: 0 };
    this.autoAcc = 0;

    if (snapshot) this.restore(snapshot);
    else {
      this.cash = 20 + this.S.startCash;
      if (this.S.introWave > 1) {
        this.wave = this.S.introWave;
        this.cash += 40 * this.S.introWave;
      }
    }
    this.initUw();
  }

  // ------------------------------------------------------------ snapshot
  snapshot() {
    return {
      tier: this.tier, wave: this.wave, cash: this.cash, coins: this.coins, cashEarned: this.cashEarned,
      kills: this.kills, bossKills: this.bossKills, damageDealt: this.damageDealt, hpFrac: this.hp / this.S.maxHp,
      lv: { ...this.lv }, perks: { ...this.perks }, perkCounter: this.perkCounter, pendingPerks: this.pendingPerks,
      simTime: this.simTime, secondWindUsed: this.secondWindUsed, demonUsed: this.demonUsed,
      gemsFound: this.gemsFound, shardsFound: this.shardsFound, gemAcc: this.gemAcc,
      damageBySource: { ...this.damageBySource }, challenge: this.challenge, spent: { ...this.spent },
    };
  }

  restore(s) {
    Object.assign(this, {
      tier: s.tier, wave: s.wave, cash: s.cash, coins: s.coins, cashEarned: s.cashEarned || 0,
      kills: s.kills, bossKills: s.bossKills, damageDealt: s.damageDealt || 0,
      perkCounter: s.perkCounter || 0, pendingPerks: s.pendingPerks || 0, simTime: s.simTime || 0,
      secondWindUsed: !!s.secondWindUsed, demonUsed: !!s.demonUsed, gemsFound: s.gemsFound || 0,
      shardsFound: s.shardsFound || 0, gemAcc: s.gemAcc || 0, damageBySource: s.damageBySource || {},
    });
    this.lv = { ...(s.lv || {}) };
    this.perks = { ...(s.perks || {}) };
    this.spent = { attack: 0, defense: 0, utility: 0, ...(s.spent || {}) };
    this.bossSpawned = this.wave % this.bossEvery() === 0 ? this.wave : 0;
    this.recompute();
    this.hp = Math.max(1, (s.hpFrac || 1) * this.S.maxHp);
  }

  recompute() {
    const oldMax = this.S ? this.S.maxHp : 0;
    this.S = computeStats(this.save, this);
    if (oldMax && this.S.maxHp > oldMax) this.hp += this.S.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.S.maxHp);
  }

  // ----------------------------------------------------------- upgrades
  runLevel(id) {
    return this.lv[id] || 0;
  }

  canUpgrade(id) {
    const stat = STAT_BY_ID[id];
    if (!isUnlocked(this.save, stat)) return false;
    return (this.save.ws[id] || 0) + this.runLevel(id) < stat.max;
  }

  upgradeCost(id) {
    return runCost(STAT_BY_ID[id], this.runLevel(id));
  }

  // How many levels n cost together, or Infinity past the max.
  bulkCost(id, n) {
    const stat = STAT_BY_ID[id];
    const room = stat.max - (this.save.ws[id] || 0) - this.runLevel(id);
    if (n > room) return Infinity;
    let total = 0;
    for (let i = 0; i < n; i++) total += runCost(stat, this.runLevel(id) + i);
    return total;
  }

  maxAffordable(id) {
    const stat = STAT_BY_ID[id];
    const room = stat.max - (this.save.ws[id] || 0) - this.runLevel(id);
    let cash = this.cash;
    let n = 0;
    while (n < room) {
      const cst = runCost(stat, this.runLevel(id) + n);
      if (cst > cash) break;
      cash -= cst;
      n++;
      if (n > 5000) break;
    }
    return n;
  }

  buy(id, n = 1) {
    const stat = STAT_BY_ID[id];
    const freeChance = stat.cat === 'attack' ? this.S.freeAtk : stat.cat === 'defense' ? this.S.freeDef : this.S.freeUtil;
    let bought = 0;
    let free = 0;
    while (bought < n && this.canUpgrade(id)) {
      const cost = this.upgradeCost(id);
      if (cost > this.cash) break;
      if (this.rand() < freeChance) free++;
      else this.cash -= cost;
      this.spent[stat.cat] += cost;
      this.lv[id] = this.runLevel(id) + 1;
      bought++;
    }
    if (bought) {
      this.recompute();
      this.sfx.push('buy');
    }
    return { bought, free };
  }

  // Spend cash the way the player split it: the category furthest below its
  // share goes next, and inside it the upgrade with the best value per cash.
  // Waits (saves up) when that upgrade costs more than the cash on hand. The
  // ranking is taken once per call; a level bought scales its value by the
  // price step, which keeps a call cheap on a phone.
  autoBuyStep() {
    const split = this.save.settings.autoSplit || {};
    const cats = ['attack', 'defense', 'utility'].filter((c) => (split[c] || 0) > 0);
    const want = cats.reduce((a, c) => a + split[c], 0);
    if (!want) return 0;
    const list = runAdvice(this).ranked.list.filter((x) => x.value > 0).map((x) => ({ ...x }));
    let bought = 0;
    for (let guard = 0; guard < 60; guard++) {
      const total = this.spent.attack + this.spent.defense + this.spent.utility;
      let pick = null;
      let gap = -Infinity;
      for (const c of cats) {
        if (!list.some((x) => x.cat === c)) continue;
        const g = split[c] / want - (total ? this.spent[c] / total : 0);
        if (g > gap) { gap = g; pick = c; }
      }
      if (!pick) break;
      let top = null;
      for (const x of list) if (x.cat === pick && (!top || x.value > top.value)) top = x;
      if (top.cost > this.cash) break;
      if (!this.buy(top.id, 1).bought) break;
      bought++;
      if (!this.canUpgrade(top.id)) list.splice(list.indexOf(top), 1);
      else {
        const next = this.upgradeCost(top.id);
        top.value *= top.cost / next;
        top.cost = next;
      }
    }
    return bought;
  }

  // -------------------------------------------------------------- perks
  availablePerks() {
    return PERKS.filter((p) => {
      const have = this.perks[p.id] || 0;
      if (have >= p.max) return false;
      if (p.id === 'uwcd' && !Object.keys(this.S.uw).length) return false;
      if (p.id === 'orb' && this.S.orbs === 0) return false;
      return true;
    });
  }

  rollPerkChoices() {
    const pool = this.availablePerks();
    const out = [];
    while (out.length < this.S.perkChoices && pool.length) {
      const i = Math.floor(this.rand() * pool.length);
      out.push(pool.splice(i, 1)[0].id);
    }
    return out;
  }

  openPerk() {
    if (this.pendingPerks <= 0) return null;
    if (!this.perkChoicesNow) this.perkChoicesNow = this.rollPerkChoices();
    return this.perkChoicesNow;
  }

  choosePerk(id) {
    if (this.pendingPerks <= 0) return false;
    const p = PERK_BY_ID[id];
    if (!p) return false;
    this.perks[id] = (this.perks[id] || 0) + 1;
    this.pendingPerks--;
    this.perkChoicesNow = null;
    if (id === 'instant') {
      const gain = Math.max(100, this.S.cashWave * this.S.cashMult * 10);
      this.gainCash(gain);
    }
    this.recompute();
    this.sfx.push('perk');
    this.log.push({ t: this.simTime, text: `Perk: ${p.name}` });
    return true;
  }

  autoPickPerk() {
    const choices = this.openPerk();
    if (!choices || !choices.length) {
      this.pendingPerks = 0;
      return;
    }
    const order = this.save.perkOrder;
    const best = [...choices].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    this.choosePerk(best);
  }

  // ------------------------------------------------------- ultimate weps
  initUw() {
    for (const id of Object.keys(this.S.uw)) {
      const cfg = this.S.uw[id];
      this.uw[id] = { cd: cfg.cd ? cfg.cd * 0.35 : 0, active: 0, queued: 0, queueT: 0 };
    }
  }

  // ----------------------------------------------------------- economy
  gainCash(x) {
    this.cash += x;
    this.cashEarned += x;
  }

  midasMult() {
    const m = this.uw.midas;
    return m && m.active > 0 ? this.S.uw.midas.bonus : 1;
  }

  // -------------------------------------------------------------- step
  step(dt) {
    if (this.over) return;
    const S = this.S;
    this.simTime += dt;
    this.waveTime += dt;

    // boss at the start of every tenth wave (more often in some challenges)
    if (this.wave % this.bossEvery() === 0 && this.bossSpawned !== this.wave) {
      this.bossSpawned = this.wave;
      this.spawn('boss');
      this.shake = 0.6;
      this.sfx.push('boss');
    }

    this.spawnAcc += dt;
    const interval = spawnInterval(this.wave) / S.enemyCountMult;
    while (this.spawnAcc >= interval) {
      this.spawnAcc -= interval;
      if (this.waveTime < WORLD.waveSeconds - 2) this.spawn();
    }
    if (this.waveTime >= WORLD.waveSeconds) this.endWave();

    this.updateTower(dt);
    this.updateUw(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateOrbs(dt);
    this.updateMines(dt);
    this.updatePools(dt);
    this.updatePackages(dt);
    this.updateFx(dt);

    if (this.pendingPerks > 0 && S.autoPerk) this.autoPickPerk();

    // auto upgrade: a few times a second, not every tick
    if (S.autoBuy) {
      this.autoAcc += dt;
      if (this.autoAcc >= 0.5) {
        this.autoAcc = 0;
        this.autoBuyStep();
      }
    }

    // floating gem every few minutes of play
    this.gemAcc += dt;
    if (!this.gemBubble && this.gemAcc >= GEM_DROP_EVERY) {
      this.gemAcc = 0;
      const a = this.rand() * TAU;
      this.gemBubble = { x: Math.cos(a) * 18, y: Math.sin(a) * 18, t: 0 };
      this.sfx.push('gem');
    }
    if (this.gemBubble) {
      this.gemBubble.t += dt;
      if (this.gemBubble.t > 40) this.collectGem();
    }

    if (this.hp <= 0) this.onDefeat();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }

  bossEvery() {
    return this.mods ? this.mods.bossEvery : 10;
  }

  collectGem() {
    if (!this.gemBubble) return false;
    this.gemBubble = null;
    this.gemsFound += 2;
    this.sfx.push('gem');
    this.addFx({ type: 'text', x: 0, y: -8, text: '+2 gems', color: '#6fe7ff', ttl: 1.5 });
    return true;
  }

  onDefeat() {
    if (this.S.secondWind && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.hp = this.S.maxHp * this.S.secondWind;
      for (const e of this.enemies) {
        if (!e.boss && Math.hypot(e.x, e.y) < 15) this.push(e, 12);
      }
      this.enemyShots = [];
      this.addFx({ type: 'ring', x: 0, y: 0, r0: 0, r1: 20, color: '#ffffff', ttl: 0.6 });
      this.log.push({ t: this.simTime, text: 'Second Wind' });
      this.sfx.push('perk');
      return;
    }
    this.hp = 0;
    this.over = true;
    this.sfx.push('defeat');
  }

  endWave() {
    const S = this.S;
    this.waveTime -= WORLD.waveSeconds;
    let rewards = 1;
    if (S.waveSkip && this.rand() < S.waveSkip) {
      rewards = 2;
      this.wave++;
      this.log.push({ t: this.simTime, text: `Skipped wave ${this.wave}` });
    }
    this.wave++;
    const tier = TIERS[this.tier - 1];
    for (let i = 0; i < rewards; i++) {
      this.gainCash(S.cashWave * S.cashMult);
      this.coins += S.coinWave * S.coinMult * tier.coins;
      if (S.interest > 0) {
        const cap = (30 + 12 * this.wave) * S.cashMult * S.interestCapMult;
        this.gainCash(Math.min(this.cash * S.interest, cap));
      }
    }
    if (S.pkgChance && this.rand() < S.pkgChance) {
      const a = this.rand() * TAU;
      const d = 6 + this.rand() * 10;
      this.packages.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, t: 0 });
    }
    this.perkCounter++;
    if (this.perkCounter >= S.perkInterval) {
      this.perkCounter = 0;
      if (this.availablePerks().length) {
        this.pendingPerks++;
        this.sfx.push('perkReady');
      }
    }
    this.sfx.push('wave');
    this.waveEnded = true;
  }

  // ------------------------------------------------------------ enemies
  spawn(type) {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    if (!type) {
      let table = spawnTable(this.wave, this.tier);
      if (this.mods && this.mods.lancers !== 1) table = table.map(([t, w]) => [t, t === 'ranged' ? w * this.mods.lancers : w]);
      const total = table.reduce((a, [, w]) => a + w, 0);
      let x = this.rand() * total;
      type = table[0][0];
      for (const [t, w] of table) {
        x -= w;
        if (x <= 0) { type = t; break; }
      }
    }
    const a = this.rand() * TAU;
    return this.addEnemy(type, Math.cos(a) * WORLD.spawnRadius, Math.sin(a) * WORLD.spawnRadius);
  }

  addEnemy(type, x, y, hpScale = 1) {
    const def = ENEMIES[type];
    const hp = enemyHpAt(def, this.wave, this.tier, this.S.enemyHpMult).total * hpScale;
    const e = {
      id: this.nextId++, type, def, x, y, hp, maxHp: hp,
      dmg: enemyDmgAt(def, this.wave, this.tier).total,
      speed: def.speed * (0.92 + this.rand() * 0.16) * (this.mods ? this.mods.speed : 1),
      r: def.r, boss: !!def.boss, atkAcc: 0, fireAcc: this.rand(), slow: 0, hitFlash: 0,
      wave: this.wave, angle: Math.atan2(-y, -x), pending: 0,
    };
    this.enemies.push(e);
    return e;
  }

  updateEnemies(dt) {
    const S = this.S;
    const tf = this.uw.timefield && this.uw.timefield.active > 0 ? this.S.uw.timefield : null;
    const sing = this.singularity;
    const protectors = this.enemies.filter((e) => e.def.aura);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const d = Math.hypot(e.x, e.y);
      let speed = e.speed;
      if (S.slowAura && d < 15) speed *= 1 - S.slowAura;
      if (tf && d < S.range) speed *= 1 - tf.slow;
      e.shielded = false;
      for (const p of protectors) {
        if (p !== e && !p.dead && Math.hypot(p.x - e.x, p.y - e.y) < p.def.aura) { e.shielded = true; break; }
      }
      // singularity pull
      if (sing) {
        const dx = sing.x - e.x;
        const dy = sing.y - e.y;
        const sd = Math.hypot(dx, dy);
        if (sd < sing.size * 2.2 && sd > 0.01) {
          const pull = (e.boss ? 1.5 : 7) * dt;
          e.x += (dx / sd) * Math.min(pull, sd);
          e.y += (dy / sd) * Math.min(pull, sd);
        }
      }
      const contact = WORLD.towerRadius + e.r;
      const stop = e.def.standoff ? Math.max(contact, e.def.standoff) : contact;
      if (d > stop) {
        const step = Math.min(speed * dt, d - stop);
        e.x -= (e.x / d) * step;
        e.y -= (e.y / d) * step;
      } else if (e.def.standoff) {
        e.fireAcc += dt;
        if (e.fireAcc >= e.def.fireEvery) {
          e.fireAcc = 0;
          const dd = Math.hypot(e.x, e.y) || 1;
          this.enemyShots.push({ x: e.x, y: e.y, vx: (-e.x / dd) * 22, vy: (-e.y / dd) * 22, dmg: e.dmg, from: e });
        }
      } else {
        e.atkAcc += dt;
        if (e.atkAcc >= 1) {
          e.atkAcc -= 1;
          this.hitTower(e.dmg, e);
        }
      }
    }
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);

    // enemy projectiles
    for (const s of this.enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.hypot(s.x, s.y) < WORLD.towerRadius + 0.5) {
        s.done = true;
        this.hitTower(s.dmg, null);
      }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.done);
  }

  hitTower(raw, attacker) {
    const S = this.S;
    if (this.demonT > 0) return;
    if (this.shieldReady) {
      this.shieldReady = false;
      this.shieldAcc = 0;
      this.addFx({ type: 'ring', x: 0, y: 0, r0: 4, r1: 6, color: '#6fe7ff', ttl: 0.35 });
      return;
    }
    const dmg = Math.max(0, raw - S.defAbs) * (1 - S.defPct);
    this.hp -= dmg;
    if (dmg > 0) this.towerFlash = 0.12;
    if (attacker && !attacker.dead) {
      if (S.thorns > 0) this.damage(attacker, attacker.maxHp * S.thorns, 'thorns');
      if (attacker.def.drains && !attacker.dead) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.maxHp * attacker.def.drains);
      }
    }
    if (S.demonSec && !this.demonUsed && this.hp > 0 && this.hp < S.maxHp * 0.25) {
      this.demonUsed = true;
      this.demonT = S.demonSec;
      this.sfx.push('perk');
      this.log.push({ t: this.simTime, text: 'Wrath' });
    }
  }

  push(e, dist) {
    const d = Math.hypot(e.x, e.y) || 1;
    const nd = Math.min(WORLD.spawnRadius, d + dist);
    e.x = (e.x / d) * nd;
    e.y = (e.y / d) * nd;
  }

  // Deal damage to an enemy; returns the damage dealt.
  damage(e, amount, source) {
    if (e.dead || amount <= 0) return 0;
    if (e.shielded) amount *= 0.5;
    if (this.inSearchlight(e)) amount *= this.S.uw.searchlight.bonus;
    const dealt = Math.min(e.hp, amount);
    e.hp -= amount;
    e.hitFlash = 0.08;
    this.damageDealt += dealt;
    this.damageBySource[source] = (this.damageBySource[source] || 0) + dealt;
    if (e.hp <= 0) this.kill(e, source);
    return dealt;
  }

  kill(e, source) {
    if (e.dead) return;
    e.dead = true;
    const S = this.S;
    const midas = this.midasMult();
    const def = e.def;
    this.gainCash(enemyCashAt(def, this.wave, this.tier, S, midas).total);
    this.coins += enemyCoinsAt(def, this.wave, this.tier, S, midas).total;
    this.kills++;
    this.addFx({ type: 'burst', x: e.x, y: e.y, color: def.color, ttl: 0.45, n: e.boss ? 26 : 8, r: e.r });
    if (midas > 1) this.addFx({ type: 'text', x: e.x, y: e.y, text: '¢', color: '#ffd84d', ttl: 0.7 });
    this.sfx.push(e.boss ? 'bossDie' : 'pop');

    if (def.splits) {
      for (let i = 0; i < def.splits; i++) {
        const a = this.rand() * TAU;
        this.addEnemy('shard', e.x + Math.cos(a) * 1.5, e.y + Math.sin(a) * 1.5);
      }
    }
    if (e.boss) {
      this.bossKills++;
      this.shake = 0.4;
      const shards = Math.round((3 + this.tier * 2) * S.shardMult);
      this.shardsFound += shards;
      if (this.rand() < BOSS_GEM_CHANCE) {
        const g = 1 + Math.floor(this.rand() * 3);
        this.gemsFound += g;
        this.addFx({ type: 'text', x: e.x, y: e.y - 3, text: `+${g} gems`, color: '#6fe7ff', ttl: 1.5 });
      }
      if (this.rand() < BOSS_MODULE_CHANCE) {
        const m = rollModule(this.save, this.rand, [80, 18, 2, 0, 0]);
        this.modulesFound.push(m);
        this.addFx({ type: 'text', x: e.x, y: e.y - 5, text: 'Module found', color: '#c792ff', ttl: 2 });
      }
    }
    // venom marsh
    const vm = S.uw.venom;
    if (vm && this.rand() < vm.chance && this.pools.length < 12) {
      this.pools.push({ x: e.x, y: e.y, r: 4.5, t: vm.dur, ttl: vm.dur });
    }
    // splitter module
    if (S.splitShots) {
      for (let i = 0; i < S.splitShots; i++) {
        const t = this.nearest(e.x, e.y, 18, new Set([e.id]), true);
        if (t) this.fireShot(e.x, e.y, t, S.damage, false, { bounces: 0, pierce: 0, noArc: true });
      }
    }
  }

  // ------------------------------------------------------------- tower
  nearest(x, y, maxDist, exclude, random = false) {
    let best = null;
    let bd = maxDist;
    const pool = [];
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e.id))) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= maxDist) {
        if (random) pool.push(e);
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (random && pool.length) return pool[Math.floor(this.rand() * pool.length)];
    return best;
  }

  nearestN(n, maxDist) {
    const list = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x, e.y);
      if (d <= maxDist) list.push([d, e]);
    }
    list.sort((a, b) => a[0] - b[0]);
    return list.slice(0, n).map((x) => x[1]);
  }

  // The n nearest enemies in range that the shots already in the air will
  // not kill. The tower never spends a shot on an enemy that is as good as dead.
  openTargets(n, maxDist) {
    const list = [];
    for (const e of this.enemies) {
      if (e.dead || e.pending >= e.hp) continue;
      const d = Math.hypot(e.x, e.y);
      if (d <= maxDist) list.push([d, e]);
    }
    list.sort((a, b) => a[0] - b[0]);
    return list.slice(0, n).map((x) => x[1]);
  }

  // Roughly what a tower shot of `dmg` will take off `e` when it lands. Errs
  // low (the enemy walks in while the shot flies out, and the searchlight is
  // left out), so the tower fires one shot too many rather than one too few.
  expectedHit(e, dmg) {
    const dist = Math.hypot(e.x, e.y) * 0.9;
    return dmg * (1 + this.S.dmgPerMeter * dist) * (e.shielded ? 0.5 : 1);
  }

  claim(s, e) {
    this.release(s);
    s.claim = e;
    s.est = this.expectedHit(e, s.dmg);
    e.pending += s.est;
  }

  release(s) {
    if (!s.claim) return;
    s.claim.pending = Math.max(0, s.claim.pending - s.est);
    s.claim = null;
  }

  damageMult() {
    const S = this.S;
    let m = 1;
    if (S.berserk) m *= 1 + S.berserk * (1 - Math.max(0, this.hp) / S.maxHp);
    if (this.demonT > 0) m *= 2;
    return m;
  }

  updateTower(dt) {
    const S = this.S;
    this.hp = Math.min(S.maxHp, this.hp + S.regen * dt);
    if (this.demonT > 0) this.demonT = Math.max(0, this.demonT - dt);
    if (this.towerFlash > 0) this.towerFlash -= dt;
    if (this.fireT > 0) this.fireT -= dt;
    if (S.shieldEvery && !this.shieldReady) {
      this.shieldAcc += dt;
      if (this.shieldAcc >= S.shieldEvery) this.shieldReady = true;
    }

    const period = 1 / S.atkSpeed;
    this.atkAcc = Math.min(this.atkAcc + dt, period * 4);
    while (this.atkAcc >= period) {
      const targets = this.openTargets(this.rand() < S.msChance ? S.msTargets : 1, S.range);
      if (!targets.length) {
        this.atkAcc = Math.min(this.atkAcc, period);
        break;
      }
      this.atkAcc -= period;
      this.target = targets[0];
      this.aim = Math.atan2(targets[0].y, targets[0].x);
      this.fireT = 0.12;
      this.shotCount++;
      const over = S.overcharge && this.shotCount % 10 === 0 ? S.overcharge : 1;
      for (const t of targets) {
        const crit = this.rand() < S.critChance;
        const dmg = S.damage * this.damageMult() * (crit ? S.critFactor : 1) * over;
        const bounces = this.rand() < S.bounceChance ? S.bounceTargets : 0;
        const shot = this.fireShot(0, 0, t, dmg, crit, { bounces, pierce: S.pierce, big: over > 1 });
        if (shot) this.claim(shot, t);
      }
      this.sfx.push('shot');
    }

    // shockwave
    if (S.swSize > 0) {
      this.swAcc += dt;
      if (this.swAcc >= S.swInterval) {
        this.swAcc = 0;
        this.addFx({ type: 'ring', x: 0, y: 0, r0: 2, r1: S.swSize, color: '#5ab0ff', ttl: 0.5 });
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x, e.y) < S.swSize + e.r) {
            this.damage(e, S.damage * this.damageMult(), 'shockwave');
            if (!e.dead) this.push(e, e.boss ? 0.8 : 3);
          }
        }
      }
    }

    // land mines
    if (S.mineChance > 0 && this.rand() < S.mineChance * dt && this.mines.length < 30) {
      const a = this.rand() * TAU;
      const d = 6 + this.rand() * Math.max(2, S.range * 0.8 - 6);
      this.mines.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, dmg: S.mineDmg, r: 4, big: false });
    }

    // siege cannon card
    if (S.plasma) {
      this.plasmaAcc += dt;
      if (this.plasmaAcc >= 8) {
        let best = null;
        for (const e of this.enemies) {
          if (!e.dead && Math.hypot(e.x, e.y) <= S.range && (!best || e.hp > best.hp)) best = e;
        }
        if (best) {
          this.plasmaAcc = 0;
          this.addFx({ type: 'beam', x: best.x, y: best.y, color: '#ff9bf2', ttl: 0.3, w: 1.4 });
          this.damage(best, S.damage * this.damageMult() * S.plasma, 'siege');
          this.sfx.push('zap');
        }
      }
    }
  }

  fireShot(x, y, target, dmg, crit, opts = {}) {
    if (this.shots.length > 600) return null;
    const s = { x, y, target, dmg, crit, bounces: opts.bounces || 0, pierce: opts.pierce || 0, noArc: !!opts.noArc, hit: opts.hit || null, big: !!opts.big, speed: 70, claim: null, est: 0 };
    this.shots.push(s);
    return s;
  }

  // A shot whose enemy died on the way (to an orb, a mine, an arc) looks for
  // another one that still needs the damage, then for any enemy close by,
  // and only then fades out where it is.
  retarget(s) {
    this.release(s);
    let best = null;
    let bd = 30;
    const range = this.S.range + 2;
    for (const e of this.enemies) {
      if (e.dead || e.pending >= e.hp || (s.hit && s.hit.has(e.id))) continue;
      if (Math.hypot(e.x, e.y) > range) continue;
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      s.target = best;
      if (!s.missile) this.claim(s, best);
      return true;
    }
    s.target = this.nearest(s.x, s.y, 14, s.hit);
    if (s.target) return true;
    s.done = true;
    this.addFx({ type: 'fizzle', x: s.x, y: s.y, color: s.crit ? '#ffd35a' : '#fff1d6', ttl: 0.3 });
    return false;
  }

  updateShots(dt) {
    const S = this.S;
    for (const s of this.shots) {
      if (!s.target || s.target.dead) {
        if (!this.retarget(s)) continue;
      }
      const t = s.target;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.speed * dt;
      if (d <= step + t.r * 0.6) {
        s.x = t.x;
        s.y = t.y;
        this.shotHit(s, t);
      } else {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
      }
    }
    this.shots = this.shots.filter((s) => !s.done);
  }

  shotHit(s, t) {
    const S = this.S;
    this.release(s);
    if (s.missile) {
      s.done = true;
      this.addFx({ type: 'ring', x: t.x, y: t.y, r0: 0.5, r1: 3.5, color: '#ffb547', ttl: 0.3 });
      for (const o of this.enemies) {
        if (!o.dead && Math.hypot(o.x - t.x, o.y - t.y) < 3.5 + o.r) this.damage(o, s.dmg, 'missiles');
      }
      this.sfx.push('boom');
      return;
    }
    const dist = Math.hypot(t.x, t.y);
    const dmg = s.dmg * (1 + S.dmgPerMeter * dist);
    const dealt = this.damage(t, dmg, 'tower');
    if (S.lifesteal > 0 && dealt > 0) this.hp = Math.min(S.maxHp, this.hp + Math.min(dealt * S.lifesteal, S.maxHp * 0.02));
    if (this.save.settings.dmgNumbers && (s.crit || s.big)) {
      this.addFx({ type: 'num', x: t.x, y: t.y - t.r, text: dmg, color: s.big ? '#ff9bf2' : '#ffd35a', ttl: 0.7 });
    }
    if (!t.dead && S.kbChance && this.rand() < S.kbChance) this.push(t, t.boss ? S.kbForce * 0.15 : S.kbForce);
    // arc storm
    const arc = S.uw.arc;
    if (arc && !s.noArc && this.rand() < arc.chance) this.arcStorm(t, arc);
    const hit = s.hit || new Set();
    hit.add(t.id);
    if (s.bounces > 0) {
      const n = this.nearest(t.x, t.y, 12, hit);
      if (n) {
        s.bounces--;
        s.target = n;
        s.hit = hit;
        s.dmg *= 0.9;
        return;
      }
    }
    if (s.pierce > 0) {
      const n = this.nearest(t.x, t.y, 9, hit);
      if (n) {
        s.pierce--;
        s.target = n;
        s.hit = hit;
        return;
      }
    }
    s.done = true;
  }

  arcStorm(from, arc) {
    const hit = new Set([from.id]);
    let cur = from;
    const pts = [[from.x, from.y]];
    for (let i = 0; i < arc.targets; i++) {
      const n = this.nearest(cur.x, cur.y, 14, hit);
      if (!n) break;
      hit.add(n.id);
      pts.push([n.x, n.y]);
      this.damage(n, this.S.damage * this.damageMult() * arc.dmg, 'arc');
      cur = n;
    }
    if (pts.length > 1) {
      this.addFx({ type: 'bolt', pts, color: '#7fe3ff', ttl: 0.22 });
      this.sfx.push('zap');
    }
  }

  updateOrbs(dt) {
    const S = this.S;
    if (!S.orbs) return;
    this.orbAngle += S.orbSpeed * dt;
    const R = this.orbRadius();
    for (const [id, t] of this.orbHits) {
      if (t - dt <= 0) this.orbHits.delete(id);
      else this.orbHits.set(id, t - dt);
    }
    for (let i = 0; i < S.orbs; i++) {
      const a = this.orbAngle + (i * TAU) / S.orbs;
      const ox = Math.cos(a) * R;
      const oy = Math.sin(a) * R;
      for (const e of this.enemies) {
        if (e.dead || this.orbHits.has(e.id)) continue;
        if (Math.hypot(e.x - ox, e.y - oy) < 1.3 + e.r) {
          this.orbHits.set(e.id, 0.5);
          this.damage(e, S.damage * this.damageMult() * (e.boss ? 1 : 4), 'orbs');
        }
      }
    }
  }

  orbRadius() {
    return Math.max(9, Math.min(22, this.S.range * 0.45));
  }

  updateMines(dt) {
    for (const m of this.mines) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - m.x, e.y - m.y) < e.r + 1) {
          m.done = true;
          this.addFx({ type: 'ring', x: m.x, y: m.y, r0: 0.5, r1: m.r, color: m.big ? '#ff9b5e' : '#ffb547', ttl: 0.35 });
          for (const o of this.enemies) {
            if (!o.dead && Math.hypot(o.x - m.x, o.y - m.y) < m.r + o.r) this.damage(o, this.S.damage * this.damageMult() * m.dmg, m.big ? 'minering' : 'mines');
          }
          this.sfx.push('boom');
          break;
        }
      }
    }
    if (this.mines.some((m) => m.done)) this.mines = this.mines.filter((m) => !m.done);
  }

  updatePools(dt) {
    const vm = this.S.uw.venom;
    for (const p of this.pools) {
      p.t -= dt;
      if (p.t <= 0) { p.done = true; continue; }
      if (!vm) continue;
      for (const e of this.enemies) {
        if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r) {
          this.damage(e, e.maxHp * vm.dmg * (e.boss ? 0.15 : 1) * dt, 'venom');
        }
      }
    }
    if (this.pools.some((p) => p.done)) this.pools = this.pools.filter((p) => !p.done);
  }

  updatePackages(dt) {
    for (const p of this.packages) {
      p.t += dt;
      if (p.t > 1.6) {
        p.done = true;
        const heal = this.S.maxHp * this.S.recovery;
        this.hp = Math.min(this.S.maxHp, this.hp + heal);
        this.addFx({ type: 'text', x: p.x, y: p.y, text: '+' + Math.round(this.S.recovery * 100) + '% hp', color: '#7cf5a8', ttl: 1 });
        this.sfx.push('heal');
      }
    }
    if (this.packages.some((p) => p.done)) this.packages = this.packages.filter((p) => !p.done);
  }

  updateUw(dt) {
    const S = this.S;
    const hasEnemies = this.enemies.length > 0;
    for (const id of Object.keys(S.uw)) {
      const cfg = S.uw[id];
      const st = this.uw[id] || (this.uw[id] = { cd: cfg.cd ? cfg.cd * 0.35 : 0, active: 0, queued: 0, queueT: 0 });
      if (st.active > 0) st.active = Math.max(0, st.active - dt);
      if (cfg.cd !== undefined) {
        if (st.cd > 0) st.cd -= dt;
        if (st.cd <= 0 && hasEnemies && st.active <= 0) {
          st.cd = cfg.cd;
          this.triggerUw(id, cfg, st);
        }
      }
      if (st.queued > 0) {
        st.queueT -= dt;
        if (st.queueT <= 0) {
          st.queued--;
          st.queueT = 0.7;
          this.waves = this.waves || [];
          this.waves.push({ r: WORLD.towerRadius, hit: new Set(), dmg: cfg.dmg });
        }
      }
    }
    // annihilation wave rings
    if (this.waves && this.waves.length) {
      for (const w of this.waves) {
        w.r += 32 * dt;
        for (const e of this.enemies) {
          if (e.dead || w.hit.has(e.id)) continue;
          if (Math.abs(Math.hypot(e.x, e.y) - w.r) < 1.8 + e.r) {
            w.hit.add(e.id);
            this.damage(e, S.damage * this.damageMult() * w.dmg, 'wave');
          }
        }
        if (w.r > WORLD.spawnRadius + 4) w.done = true;
      }
      this.waves = this.waves.filter((w) => !w.done);
    }
    // singularity
    if (this.singularity) {
      const sg = this.singularity;
      sg.t -= dt;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - sg.x, e.y - sg.y) < sg.size * 0.55 + e.r * 0.5) {
          if (e.boss) this.damage(e, S.damage * this.damageMult() * 25 * dt, 'singularity');
          else this.damage(e, e.hp + 1, 'singularity');
        }
      }
      if (sg.t <= 0) this.singularity = null;
    }
    if (S.uw.searchlight) this.searchAngle += 0.55 * dt;
  }

  triggerUw(id, cfg, st) {
    const S = this.S;
    switch (id) {
      case 'wave':
        st.queued = Math.round(cfg.count);
        st.queueT = 0;
        this.sfx.push('uw');
        break;
      case 'missiles': {
        const targets = [...this.enemies].filter((e) => !e.dead).sort((a, b) => b.hp - a.hp);
        for (let i = 0; i < cfg.count; i++) {
          const t = targets[i % Math.max(1, targets.length)];
          if (!t) break;
          const a = this.rand() * TAU;
          this.shots.push({ x: Math.cos(a) * 2, y: Math.sin(a) * 2, target: t, dmg: S.damage * this.damageMult() * cfg.dmg, missile: true, speed: 34, bounces: 0, pierce: 0, noArc: true, hit: null });
        }
        this.sfx.push('uw');
        break;
      }
      case 'singularity': {
        const near = this.nearestN(8, S.range);
        const t = near.length ? near[Math.floor(this.rand() * near.length)] : null;
        const a = this.rand() * TAU;
        const x = t ? t.x : Math.cos(a) * 20;
        const y = t ? t.y : Math.sin(a) * 20;
        this.singularity = { x, y, size: cfg.size, t: cfg.dur, ttl: cfg.dur };
        st.active = cfg.dur;
        this.sfx.push('uw');
        break;
      }
      case 'midas':
        st.active = cfg.dur;
        this.sfx.push('uw');
        break;
      case 'timefield':
        st.active = cfg.dur;
        this.sfx.push('uw');
        break;
      case 'minering':
        for (let i = 0; i < cfg.count; i++) {
          const a = (i / cfg.count) * TAU + this.rand() * 0.3;
          this.mines.push({ x: Math.cos(a) * 9, y: Math.sin(a) * 9, dmg: cfg.dmg, r: 5, big: true });
        }
        // late in a run enemies may never reach the ring; keep the newest
        // mines so they cannot pile up into the hundreds
        if (this.mines.length > MAX_MINES) this.mines.splice(0, this.mines.length - MAX_MINES);
        this.sfx.push('uw');
        break;
      default:
        break;
    }
  }

  inSearchlight(e) {
    const sl = this.S.uw.searchlight;
    if (!sl) return false;
    const d = Math.hypot(e.x, e.y);
    if (d > this.S.range + 4) return false;
    const a = Math.atan2(e.y, e.x);
    const half = (sl.angle * Math.PI) / 360;
    for (let b = 0; b < sl.beams; b++) {
      const beam = this.searchAngle + (b * TAU) / sl.beams;
      let diff = Math.abs(((a - beam) % TAU + TAU + Math.PI) % TAU - Math.PI);
      if (diff < half) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- fx
  addFx(f) {
    if (this.fx.length >= MAX_FX) this.fx.shift();
    f.age = 0;
    this.fx.push(f);
  }

  updateFx(dt) {
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < f.ttl);
  }

  // ------------------------------------------------------------ result
  result() {
    return {
      tier: this.tier, wave: this.wave, coins: Math.floor(this.coins), cash: Math.floor(this.cashEarned),
      kills: this.kills, bossKills: this.bossKills, simSec: this.simTime, damage: this.damageDealt,
      gems: this.gemsFound, shards: this.shardsFound, modules: this.modulesFound.length,
      damageBySource: this.damageBySource,
      challenge: !!this.challenge, week: this.challenge ? this.challenge.week : null,
    };
  }
}

export function statsForCat(cat) {
  return STATS.filter((s) => s.cat === cat);
}

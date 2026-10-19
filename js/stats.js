// Folds the workshop, labs, cards, modules, ultimate weapons and the run's own
// upgrades and perks into one flat object the simulation reads every tick.

import {
  STAT_BY_ID, CARD_BY_ID, cardStars, UWS, MODULE_SLOT_BY_ID, LAB_BY_ID, PERK_BY_ID, RARITY, MODULE_RARITIES,
} from './data.js';
import { wsLevel, isUnlocked, labValue, moduleByUid, moduleMainValue, moduleEffectValue, uwState } from './state.js';

export function statLevel(save, run, stat) {
  if (!isUnlocked(save, stat)) return 0;
  return Math.min(stat.max, wsLevel(save, stat.id) + (run ? run.lv[stat.id] || 0 : 0));
}

export function cardValue(save, id) {
  if (!save.equippedCards.includes(id)) return 0;
  const stars = cardStars(save.cards[id] || 0);
  if (!stars) return 0;
  return CARD_BY_ID[id].v[stars - 1];
}

export function cardOn(save, id) {
  return save.equippedCards.includes(id) && cardStars(save.cards[id] || 0) > 0;
}

export function equippedModule(save, slot) {
  const uid = save.equipped[slot];
  return uid ? moduleByUid(save, uid) : null;
}

function moduleMain(save, slot) {
  const m = equippedModule(save, slot);
  return m ? moduleMainValue(m) : 0;
}

// Value of the equipped module's variant effect, or the neutral value.
function moduleFx(save, slot, variant, neutral) {
  const m = equippedModule(save, slot);
  if (!m || m.variant !== variant) return neutral;
  return moduleEffectValue(m);
}

// Records how one stat was built: the upgrade value it starts from, then every
// multiplier and bonus in the order applied. The stats panel reads this, so
// what it shows is the formula the game runs, not a copy of it.
class Track {
  constructor(X, id, label, base) {
    this.e = { base, label, parts: [], total: base };
    X[id] = this.e;
    this.val = base;
  }

  mul(label, f) {
    if (f !== 1) {
      this.e.parts.push({ label, op: '×', v: f });
      this.val *= f;
    }
    return this;
  }

  add(label, a) {
    if (a) {
      this.e.parts.push({ label, op: '+', v: a });
      this.val += a;
    }
    return this;
  }

  cap(c, label = 'Cap') {
    if (this.val > c) {
      this.e.parts.push({ label, op: 'cap', v: c });
      this.val = c;
    }
    return this;
  }

  floor(c, label = 'Floor') {
    if (this.val < c) {
      this.e.parts.push({ label, op: 'floor', v: c });
      this.val = c;
    }
    return this;
  }

  get v() {
    this.e.total = this.val;
    return this.val;
  }
}

export function computeStats(save, run) {
  const lvl = (id) => statLevel(save, run, STAT_BY_ID[id]);
  const v = (id) => STAT_BY_ID[id].v(lvl(id));
  const p = (id) => (run ? run.perks[id] || 0 : 0);
  const c = (id) => cardValue(save, id);
  const lab = (id) => labValue(save, id);
  const X = {};
  const lvLabel = (id) => {
    const stat = STAT_BY_ID[id];
    if (!isUnlocked(save, stat)) return 'Locked in the workshop';
    const ws = wsLevel(save, id);
    const rl = run ? run.lv[id] || 0 : 0;
    return `Level ${Math.min(stat.max, ws + rl)} (workshop ${ws}${run ? ` + run ${rl}` : ''})`;
  };
  // stat built from an upgrade
  const T = (id, sid = id) => new Track(X, id, lvLabel(sid), v(sid));
  // stat with a fixed starting value
  const F = (id, label, base) => new Track(X, id, label, base);
  const labL = (id) => `Lab: ${LAB_BY_ID[id].name}`;
  const cardL = (id) => `Card: ${CARD_BY_ID[id].name} ★${cardStars(save.cards[id] || 0)}`;
  const modL = (slot) => {
    const m = equippedModule(save, slot);
    return m ? `Module: ${MODULE_SLOT_BY_ID[slot].name} (${RARITY[MODULE_RARITIES[m.rarity]].name})` : '';
  };
  const modFxL = (slot) => {
    const m = equippedModule(save, slot);
    const vr = m && MODULE_SLOT_BY_ID[slot].variants.find((x) => x.id === m.variant);
    return vr ? `Module: ${vr.name}` : '';
  };
  const perkL = (id) => `Perk: ${PERK_BY_ID[id].name}${p(id) > 1 ? ` ×${p(id)}` : ''}`;

  const glass = p('glass') ? 1 : 0;
  const fortify = p('fortify') ? 1 : 0;
  const S = {};

  S.damage = T('damage').mul(labL('dmg'), 1 + lab('dmg')).mul(cardL('damage'), 1 + c('damage'))
    .mul(modL('cannon'), 1 + moduleMain(save, 'cannon')).mul(perkL('dmg'), 1.15 ** p('dmg'))
    .mul(perkL('glass'), glass ? 1.8 : 1).mul(perkL('fortify'), fortify ? 0.8 : 1).v;
  S.atkSpeed = T('atkSpeed').mul(labL('atkSpeed'), 1 + lab('atkSpeed')).mul(cardL('atkSpeed'), 1 + c('atkSpeed'))
    .mul(perkL('overclock'), p('overclock') ? 1.35 : 1).mul(perkL('ironskin'), p('ironskin') ? 0.85 : 1).v;
  S.critChance = T('critChance').add(cardL('crit'), c('crit')).cap(1).v;
  S.critFactor = T('critFactor').mul(labL('critFactor'), 1 + lab('critFactor')).v;
  S.range = T('range').add(cardL('range'), c('range')).add(perkL('range'), 3 * p('range')).v;
  S.dmgPerMeter = T('dmgPerMeter').v;
  S.msChance = T('msChance').v;
  S.msTargets = T('msTargets').v;
  S.bounceChance = T('bounceChance').v;
  S.bounceTargets = T('bounceTargets').v;

  S.maxHp = T('maxHp', 'health').mul(labL('health'), 1 + lab('health')).mul(cardL('health'), 1 + c('health'))
    .mul(modL('armor'), 1 + moduleMain(save, 'armor')).mul(perkL('hp'), 1.2 ** p('hp'))
    .mul(perkL('glass'), glass ? 0.6 : 1).mul(perkL('fortify'), fortify ? 1.6 : 1).v;
  S.regen = T('regen').mul(labL('regen'), 1 + lab('regen')).mul(cardL('regen'), 1 + c('regen'))
    .mul(perkL('regen'), 1.3 ** p('regen')).mul(perkL('overclock'), p('overclock') ? 0.5 : 1)
    .mul(modFxL('armor'), moduleFx(save, 'armor', 'mender', 1)).v;
  S.defPct = T('defPct').add(cardL('defense'), c('defense')).add(perkL('defense'), 0.04 * p('defense'))
    .add(perkL('ironskin'), p('ironskin') ? 0.12 : 0).add(modFxL('armor'), moduleFx(save, 'armor', 'bulwark', 0))
    .cap(0.95).v;
  S.defAbs = T('defAbs').mul(labL('defAbs'), 1 + lab('defAbs')).v;
  S.thorns = T('thorns').mul(modFxL('armor'), moduleFx(save, 'armor', 'reflector', 1)).v;
  S.lifesteal = T('lifesteal').add(perkL('lifesteal'), 0.015 * p('lifesteal')).v;
  S.kbChance = T('kbChance').v;
  S.kbForce = T('kbForce').v;
  S.orbs = T('orbs').add(perkL('orb'), p('orb')).add(cardL('extraOrb'), cardOn(save, 'extraOrb') ? 1 : 0).v;
  S.orbSpeed = T('orbSpeed').mul(cardL('extraOrb'), 1 + c('extraOrb')).v;
  S.swSize = T('swSize').v;
  S.swInterval = T('swInterval').v;
  S.mineChance = T('mineChance').v;
  S.mineDmg = T('mineDmg').v;

  const genMain = 1 + moduleMain(save, 'generator');
  S.enemyCountMult = F('enemyCountMult', 'Base', 1).mul(cardL('enemyBalance'), 1 + c('enemyBalance'))
    .mul(perkL('swarm'), p('swarm') ? 1.5 : 1).v;
  S.enemyHpMult = F('enemyHpMult', 'Base', 1).mul(perkL('bounty'), p('bounty') ? 1.35 : 1).v;
  S.cashMult = T('cashMult', 'cashBonus').mul(labL('cash'), 1 + lab('cash')).mul(cardL('cash'), 1 + c('cash'))
    .mul(modL('generator'), genMain).mul(perkL('cash'), 1.15 ** p('cash')).mul(perkL('bounty'), p('bounty') ? 1.6 : 1).v;
  S.cashWave = T('cashWave').v;
  S.coinMult = T('coinMult', 'coinKill').mul(labL('coins'), 1 + lab('coins')).mul(cardL('coins'), 1 + c('coins'))
    .mul(modL('generator'), genMain).mul(perkL('coins'), 1.12 ** p('coins'))
    .mul(perkL('swarm'), p('swarm') ? 1.5 : 1).mul(cardL('enemyBalance'), 1 + c('enemyBalance')).v;
  S.coinWave = T('coinWave').v;
  const freeC = c('freeUps');
  const freeP = 0.05 * p('freeUps');
  for (const id of ['freeAtk', 'freeDef', 'freeUtil']) {
    S[id] = T(id).add(cardL('freeUps'), freeC).add(perkL('freeUps'), freeP).cap(0.9).v;
  }
  S.interest = T('interest').v;
  S.interestCapMult = F('interestCapMult', 'Base', 1).mul(labL('interestCap'), 1 + lab('interestCap'))
    .mul(modFxL('generator'), moduleFx(save, 'generator', 'compound', 1)).v;
  S.recovery = T('recovery').v;
  S.pkgChance = isUnlocked(save, STAT_BY_ID.pkgChance)
    ? T('pkgChance').add(cardL('packages'), c('packages')).cap(1).v
    : F('pkgChance', 'Locked in the workshop', 0).v;
  S.bossCoinMult = F('bossCoinMult', 'Base', 1).mul(modFxL('generator'), moduleFx(save, 'generator', 'harvester', 1)).v;

  // cards with their own mechanics
  S.slowAura = c('slowAura');
  S.waveSkip = c('waveSkip');
  S.introWave = c('introSprint');
  S.secondWind = c('secondWind');
  S.shieldEvery = c('shield');
  S.berserk = c('berserker');
  S.demonSec = c('demon');
  S.plasma = c('plasma');

  // module specials
  S.splitShots = moduleFx(save, 'cannon', 'splitter', 0);
  S.overcharge = moduleFx(save, 'cannon', 'overcharge', 0);
  S.pierce = moduleFx(save, 'cannon', 'piercer', 0);

  // ultimate weapons
  S.uwCdMult = F('uwCdMult', 'Base', 1).mul(labL('uwCooldown'), 1 - lab('uwCooldown'))
    .mul(modL('core'), 1 - moduleMain(save, 'core')).mul(perkL('uwcd'), 0.92 ** p('uwcd')).v;
  S.uw = {};
  for (const uw of UWS) {
    const st = uwState(save, uw.id);
    if (!st || !st.on) continue;
    const o = {};
    for (const prm of uw.params) o[prm.id] = prm.v(st.lv[prm.id] || 0);
    if (o.cd) o.cd *= S.uwCdMult;
    S.uw[uw.id] = o;
  }
  if (S.uw.arc) S.uw.arc.chance += moduleFx(save, 'core', 'storm', 0);
  if (S.uw.singularity) S.uw.singularity.size += moduleFx(save, 'core', 'void', 0);
  if (S.uw.wave) S.uw.wave.count += moduleFx(save, 'core', 'tide', 0);
  if (S.uw.midas) {
    S.uw.midas.dur += moduleFx(save, 'generator', 'midaslink', 0);
    S.uw.midas.cd = Math.max(S.uw.midas.cd, S.uw.midas.dur + 5);
  }

  // run rhythm
  S.gameSpeedMax = 2 + lab('gameSpeed');
  S.perkInterval = Math.max(4, Math.round(10 - lab('perkFreq')));
  S.perkChoices = 3 + lab('perkChoices');
  S.autoPerk = lab('autoPerk') > 0 && save.autoPerk;
  S.autoBuy = lab('autoBuy') > 0 && !!save.settings.autoBuy;
  S.startCash = lab('startCash');
  S.shardMult = 1 + lab('shards');
  // not enumerable, so S still copies and compares as plain numbers
  Object.defineProperty(S, 'explain', { value: X, enumerable: false });
  return S;
}

export { MODULE_SLOT_BY_ID };

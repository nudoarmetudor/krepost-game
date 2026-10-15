// Folds the workshop, labs, cards, modules, ultimate weapons and the run's own
// upgrades and perks into one flat object the simulation reads every tick.

import { STATS, CARD_BY_ID, cardStars, UWS, MODULE_SLOT_BY_ID } from './data.js';
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

export function computeStats(save, run) {
  const lvl = (id) => statLevel(save, run, STATS.find((s) => s.id === id));
  const v = (id) => STATS.find((s) => s.id === id).v(lvl(id));
  const p = (id) => (run ? run.perks[id] || 0 : 0);
  const c = (id) => cardValue(save, id);
  const lab = (id) => labValue(save, id);

  const glass = p('glass') ? 1 : 0;
  const fortify = p('fortify') ? 1 : 0;
  const S = {};

  S.damage = v('damage') * (1 + lab('dmg')) * (1 + c('damage')) * (1 + moduleMain(save, 'cannon'))
    * 1.15 ** p('dmg') * (glass ? 1.8 : 1) * (fortify ? 0.8 : 1);
  S.atkSpeed = v('atkSpeed') * (1 + lab('atkSpeed')) * (1 + c('atkSpeed'))
    * (p('overclock') ? 1.35 : 1) * (p('ironskin') ? 0.85 : 1);
  S.critChance = Math.min(1, v('critChance') + c('crit'));
  S.critFactor = v('critFactor') * (1 + lab('critFactor'));
  S.range = v('range') + c('range') + 3 * p('range');
  S.dmgPerMeter = v('dmgPerMeter');
  S.msChance = v('msChance');
  S.msTargets = v('msTargets');
  S.bounceChance = v('bounceChance');
  S.bounceTargets = v('bounceTargets');

  S.maxHp = v('health') * (1 + lab('health')) * (1 + c('health')) * (1 + moduleMain(save, 'armor'))
    * 1.2 ** p('hp') * (glass ? 0.6 : 1) * (fortify ? 1.6 : 1);
  S.regen = v('regen') * (1 + lab('regen')) * (1 + c('regen')) * 1.3 ** p('regen')
    * (p('overclock') ? 0.5 : 1) * moduleFx(save, 'armor', 'mender', 1);
  S.defPct = Math.min(0.95, v('defPct') + c('defense') + 0.04 * p('defense') + (p('ironskin') ? 0.12 : 0)
    + moduleFx(save, 'armor', 'bulwark', 0));
  S.defAbs = v('defAbs') * (1 + lab('defAbs'));
  S.thorns = v('thorns') * moduleFx(save, 'armor', 'reflector', 1);
  S.lifesteal = v('lifesteal') + 0.015 * p('lifesteal');
  S.kbChance = v('kbChance');
  S.kbForce = v('kbForce');
  S.orbs = v('orbs') + p('orb') + (cardOn(save, 'extraOrb') ? 1 : 0);
  S.orbSpeed = v('orbSpeed') * (1 + c('extraOrb'));
  S.swSize = v('swSize');
  S.swInterval = v('swInterval');
  S.mineChance = v('mineChance');
  S.mineDmg = v('mineDmg');

  const genMain = 1 + moduleMain(save, 'generator');
  S.enemyCountMult = (1 + c('enemyBalance')) * (p('swarm') ? 1.5 : 1);
  S.enemyHpMult = p('bounty') ? 1.35 : 1;
  S.cashMult = v('cashBonus') * (1 + lab('cash')) * (1 + c('cash')) * genMain * 1.15 ** p('cash') * (p('bounty') ? 1.6 : 1);
  S.cashWave = v('cashWave');
  S.coinMult = v('coinKill') * (1 + lab('coins')) * (1 + c('coins')) * genMain * 1.12 ** p('coins')
    * (p('swarm') ? 1.5 : 1) * (1 + c('enemyBalance'));
  S.coinWave = v('coinWave');
  const free = c('freeUps') + 0.05 * p('freeUps');
  S.freeAtk = Math.min(0.9, v('freeAtk') + free);
  S.freeDef = Math.min(0.9, v('freeDef') + free);
  S.freeUtil = Math.min(0.9, v('freeUtil') + free);
  S.interest = v('interest');
  S.interestCapMult = (1 + lab('interestCap')) * moduleFx(save, 'generator', 'compound', 1);
  S.recovery = v('recovery');
  S.pkgChance = isUnlocked(save, STATS.find((s) => s.id === 'pkgChance')) ? Math.min(1, v('pkgChance') + c('packages')) : 0;
  S.bossCoinMult = moduleFx(save, 'generator', 'harvester', 1);

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
  S.uwCdMult = (1 - lab('uwCooldown')) * (1 - moduleMain(save, 'core')) * 0.92 ** p('uwcd');
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
  S.startCash = lab('startCash');
  S.shardMult = 1 + lab('shards');
  return S;
}

export { MODULE_SLOT_BY_ID };

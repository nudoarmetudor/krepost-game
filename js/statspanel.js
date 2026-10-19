// The stats panel: every tower number with what it is made of, what the
// tower does with them, and what the enemies bring at any wave.

import { app } from './app.js';
import { h, modal } from './dom.js';
import { fmt, fmtPct, fmtTime } from './format.js';
import { play } from './audio.js';
import {
  STAT_BY_ID, ENEMIES, WORLD, PERK_BY_ID, enemyHpAt, enemyDmgAt, enemyCashAt, enemyCoinsAt,
  spawnInterval, spawnTable, standoffAt, FORTITUDE,
} from './data.js';
import { computeStats } from './stats.js';
import { isUnlocked } from './state.js';

const trim = (x, d) => x.toFixed(d).replace(/\.?0+$/, '');
const mult = (x) => '×' + (x >= 1000 ? fmt(x) : trim(x, x < 10 ? 3 : 1));
const pct2 = (x) => fmtPct(x, 2);

// id in S.explain -> [name, upgrade it comes from, formatter]
const ROWS = {
  Attack: [
    ['damage'], ['atkSpeed'], ['critChance'], ['critFactor'], ['range'], ['dmgPerMeter'],
    ['msChance'], ['msTargets'], ['bounceChance'], ['bounceTargets'],
  ],
  Defense: [
    ['maxHp', 'health'], ['regen'], ['defPct'], ['defAbs'], ['thorns'], ['lifesteal'], ['kbChance'], ['kbForce'],
    ['orbs'], ['orbSpeed'], ['swSize'], ['swInterval'], ['mineChance'], ['mineDmg'],
  ],
  Economy: [
    ['cashMult', 'cashBonus', 'Cash Bonus'], ['cashWave'], ['coinMult', 'coinKill', 'Coin Bonus'], ['coinWave'],
    ['interest'], ['interestCapMult', null, 'Interest Cap', mult], ['freeAtk'], ['freeDef'], ['freeUtil'],
    ['recovery'], ['pkgChance'], ['bossCoinMult', null, 'Boss Coins', mult],
  ],
  Battlefield: [
    ['enemyCountMult', null, 'Enemy Count', mult], ['enemyHpMult', null, 'Enemy Health', mult],
    ['uwCdMult', null, 'Ultimate Cooldowns', mult],
  ],
};

function rowMeta([id, sid = id, name, f]) {
  const stat = sid ? STAT_BY_ID[sid] : null;
  const sf = stat ? (stat.f === 'big' ? (x) => fmt(x) : stat.f) : (x) => fmt(x);
  return { id, stat, name: name || (stat ? stat.name : id), f: f || sf };
}

function partText(pt, f) {
  if (pt.op === '×') return mult(pt.v);
  if (pt.op === '+') return '+' + f(pt.v);
  return (pt.op === 'cap' ? 'max ' : 'min ') + f(pt.v);
}

// One line with its value; tapping it opens how the value is made.
function breakdownRow(name, value, ex, f, { neutral = false } = {}) {
  const n = ex && ex.parts.length;
  const detail = n
    ? h('div', { class: 'sdetail', hidden: true },
      h('div', { class: 'sl' }, h('span', {}, ex.label), h('b', {}, f(ex.base))),
      ex.parts.map((pt) => h('div', { class: 'sl' }, h('span', {}, pt.label), h('b', { class: neutral ? '' : pt.op === '×' && pt.v < 1 ? 'neg' : 'pos' }, partText(pt, f)))),
      h('div', { class: 'sl total' }, h('span', {}, 'Total'), h('b', {}, value)))
    : null;
  const btn = h('button', { class: 'srow' + (n ? ' has' : ''), disabled: !n, onclick: () => {
    detail.hidden = !detail.hidden;
    btn.classList.toggle('open', !detail.hidden);
    play('click');
  } },
  h('span', { class: 'sn' }, name, ex && ex.label && !n ? h('small', {}, ex.label) : null),
  n ? h('span', { class: 'sx' }, `${n} ${n === 1 ? 'factor' : 'factors'}`) : null,
  h('b', { class: 'sv' }, value));
  return h('div', { class: 'sitem' }, btn, detail);
}

function towerTab(save, run, S) {
  const live = run ? run.damageMult() : 1;
  const critAvg = 1 + S.critChance * (S.critFactor - 1);
  const perShot = S.damage * critAvg * live;
  const shotsPerSec = S.atkSpeed * (1 + S.msChance * (S.msTargets - 1));
  const dps = perShot * shotsPerSec;
  const edge = 1 + S.dmgPerMeter * S.range;
  const ehp = S.maxHp / (1 - S.defPct);
  const wave = run ? run.wave : Math.max(1, save.best[save.tier] || 1);
  const tier = run ? run.tier : save.tier;
  const drone = enemyDmgAt(ENEMIES.basic, wave, tier).total;
  const taken = Math.max(0, drone - S.defAbs) * (1 - S.defPct);

  const kv = (pairs) => h('div', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => [h('span', {}, k), h('b', {}, v)]));
  const summary = h('div', { class: 'card sum' },
    h('h3', {}, 'What the tower does'),
    kv([
      ['Average damage per shot', fmt(perShot)],
      ['Shots per second', trim(shotsPerSec, 2)],
      ['Tower DPS (expected)', fmt(dps)],
      S.dmgPerMeter > 0 ? ['DPS at the edge of range', fmt(dps * edge)] : null,
      ['Effective health', fmt(ehp)],
      ['Damage blocked', S.defAbs || S.defPct ? `${fmt(S.defAbs)} flat, then ${pct2(S.defPct)}` : 'none'],
      [`A Drone hit at wave ${wave}`, `${fmt(drone)} → ${fmt(taken)}`],
      ['Regen', S.regen > 0 ? `${fmt(S.regen)}/s, full in ${fmtTime(S.maxHp / S.regen)}` : 'none'],
      ['Fortitude', `at most ${fmt(S.maxHp * S.fortitude)} raw damage a second (${fmtPct(S.fortitude, 0)} of health)`],
      ['Overrun, the walls hold', holdText(S)],
    ]),
    h('p', { class: 'muted small' }, 'Expected DPS counts critical hits and multishot on a target in range. Fortitude: however many enemies reach the walls, they lose at most that much raw damage a second, before Defense; while more keeps coming, strain raises the limit by ' + fmtPct(FORTITUDE.strain, 0) + ' a second. Health, Regen, Lifesteal and Defense % decide how long you hold. Tap any line below to see what it is made of.'));

  const effects = run ? liveEffects(run, S) : [];
  const effectsCard = effects.length
    ? h('div', { class: 'card' }, h('h3', {}, 'Right now'), h('div', { class: 'kv' }, effects.flatMap(([k, v, cls]) => [h('span', {}, k), h('b', { class: cls || '' }, v)])))
    : null;

  const sections = Object.entries(ROWS).map(([title, rows]) => {
    const items = rows.map(rowMeta).filter((m) => !m.stat || isUnlocked(save, m.stat)).map((m) => {
      const ex = S.explain[m.id];
      return breakdownRow(m.name, m.f(S[m.id]), ex, m.f);
    });
    return h('div', { class: 'card ssec' }, h('h3', {}, title), items);
  });

  const perks = run ? Object.entries(run.perks).filter(([, n]) => n > 0) : [];
  const perkCard = perks.length
    ? h('div', { class: 'card' }, h('h3', {}, 'Perks this run'),
      h('div', { class: 'kv' }, perks.flatMap(([id, n]) => [h('span', {}, PERK_BY_ID[id].name + (n > 1 ? ` ×${n}` : '')),
        h('b', { class: 'small' }, PERK_BY_ID[id].good + (PERK_BY_ID[id].bad ? ', ' + PERK_BY_ID[id].bad : ''))])))
    : null;

  return h('div', { class: 'list' }, summary, effectsCard, ...sections, perkCard);
}

// How long the walls last once overrun: Fortitude lets in at most
// cap × (1 + strain·t) raw damage a second, Defense % takes its share, Regen
// heals. Lifesteal is left out: it depends on hitting something.
export function holdSeconds(S) {
  const F = S.fortitude * (1 - S.defPct);
  const a = (F * FORTITUDE.strain) / 2;
  const b = F - S.regen / S.maxHp;
  return (-b + Math.sqrt(b * b + 4 * a)) / (2 * a);
}

function holdText(S) {
  return `about ${fmtTime(holdSeconds(S))}`;
}

// Effects that come and go during a run.
function liveEffects(run, S) {
  const out = [];
  if (S.berserk) {
    const lost = 1 - Math.max(0, run.hp) / S.maxHp;
    out.push(['Last Stand', `damage ${mult(1 + S.berserk * lost)} (health lost ${fmtPct(lost, 0)})`]);
  }
  if (S.demonSec) {
    if (run.demonT > 0) out.push(['Wrath', `damage ×2, untouchable, ${Math.ceil(run.demonT)}s left`, 'pos']);
    else out.push(['Wrath', run.demonUsed ? 'used this run' : 'ready below 25% health']);
  }
  if (S.secondWind) out.push(['Second Wind', run.secondWindUsed ? 'used this run' : `ready, back with ${fmtPct(S.secondWind, 0)} health`]);
  if (S.shieldEvery) out.push(['Aegis', run.shieldReady ? 'ready to block a hit' : `recharging, ${Math.ceil(S.shieldEvery - run.shieldAcc)}s`]);
  if (S.slowAura) out.push(['Frost Moat', `enemies within 15m are ${fmtPct(S.slowAura, 0)} slower`]);
  if (S.overcharge) out.push(['Overcharge', `every 10th shot deals ×${S.overcharge}`]);
  if (S.pierce) out.push(['Piercer', `shots pass through ${S.pierce} more`]);
  if (S.splitShots) out.push(['Splitter', `kills launch ${S.splitShots} shots`]);
  if (S.plasma) out.push(['Siege Cannon', `×${S.plasma} damage on the strongest enemy every 8s`]);
  const midas = run.uw.midas;
  if (midas && midas.active > 0) out.push(['Midas Keep', `cash and coins ×${trim(S.uw.midas.bonus, 2)}, ${Math.ceil(midas.active)}s left`, 'pos']);
  const tf = run.uw.timefield;
  if (tf && tf.active > 0) out.push(['Time Field', `enemies in range ${fmtPct(S.uw.timefield.slow, 0)} slower, ${Math.ceil(tf.active)}s left`, 'pos']);
  if (S.uw.searchlight) out.push(['Searchlight', `enemies in the beam take ×${trim(S.uw.searchlight.bonus, 1)}`]);
  if (run.strain > 0.5) out.push(['Strain', `walls overrun for ${Math.round(run.strain)}s: Fortitude lets in ${mult(1 + FORTITUDE.strain * run.strain)}`, 'neg']);
  if (S.lifesteal > 0) out.push(['Lifesteal', `${pct2(S.lifesteal)} of tower shot damage, at most 2% health a hit`]);
  return out;
}

function enemiesTab(save, run, S, state, rerender) {
  const tier = run ? run.tier : save.tier;
  const w = state.wave;
  const live = run ? run.damageMult() : 1;
  const perShot = S.damage * (1 + S.critChance * (S.critFactor - 1)) * live;
  const interval = spawnInterval(w) / S.enemyCountMult;
  const perWave = Math.round((WORLD.waveSeconds - 2) / interval);
  const table = spawnTable(w, tier);
  const total = table.reduce((a, [, x]) => a + x, 0);
  const types = table.map(([t, x]) => [t, x / total]);
  if (table.some(([t]) => t === 'scatter')) types.push(['shard', null]);
  types.push(['boss', null]);

  const step = (d) => h('button', { class: 'btn small', onclick: () => { state.wave = Math.max(1, state.wave + d); play('click'); rerender(); } }, (d > 0 ? '+' : '−') + Math.abs(d));
  const stepper = h('div', { class: 'card stepper' },
    h('div', { class: 'row spread' }, step(-10), step(-1),
      h('div', { class: 'grow', style: { textAlign: 'center' } }, h('div', { class: 'big' }, 'Wave ' + w), h('div', { class: 'muted small' }, `Tier ${tier}`)),
      step(1), step(10)),
    run && w !== run.wave ? h('button', { class: 'btn small', onclick: () => { state.wave = run.wave; rerender(); } }, `Back to wave ${run.wave}`) : null,
    h('div', { class: 'kv', style: { marginTop: '8px' } },
      h('span', {}, 'A new enemy every'), h('b', {}, trim(interval, 2) + 's'),
      h('span', {}, 'Enemies this wave'), h('b', {}, '≈ ' + perWave),
      h('span', {}, 'Next boss'), h('b', {}, 'wave ' + Math.max(10, Math.ceil(w / 10) * 10)),
      h('span', {}, 'Health scale'), h('b', {}, mult(enemyHpAt({ hp: 1 }, w, tier, S.enemyHpMult).total)),
      h('span', {}, 'Damage scale'), h('b', {}, mult(enemyDmgAt({ dmg: 1 }, w, tier).total)),
    ));

  const cards = types.map(([type, chance]) => {
    const def = ENEMIES[type];
    const hp = enemyHpAt(def, w, tier, S.enemyHpMult);
    const dmg = enemyDmgAt(def, w, tier);
    const cash = enemyCashAt(def, w, tier, S);
    const coins = enemyCoinsAt(def, w, tier, S);
    const taken = Math.max(0, dmg.total - S.defAbs) * (1 - S.defPct);
    const shots = Math.max(1, Math.ceil(hp.total / perShot));
    const ex = (o, label) => ({ base: o.base, label, parts: o.parts });
    const note = type === 'boss' ? 'Comes every 10th wave. Slow, huge, hits hard.'
      : def.standoff ? `Stops at ${trim(standoffAt(def, tier), 1)}m on tier ${tier} and fires every ${def.fireEvery}s.${standoffAt(def, tier) > S.range ? ` That is beyond your range (${trim(S.range, 1)}m): only orbs, bounces and ultimates reach it.` : ''}`
        : def.guard ? `A shield in front soaks its first ${def.guard} hits, however strong. Many hits break it: Multishot, Bounce, Arc Storm, Orbs.`
          : def.leapAt ? `Stops at ${def.leapAt}m, just outside the base range, then leaps to ${def.leapTo}m from the walls. Range past ${def.leapAt}m lets you hit it on the way.`
            : def.heals ? `Heals every enemy within ${def.healR}m by ${fmtPct(def.heals, 0)} of its health each second. Kill it fast: big hits and Crits.`
        : def.splits ? `Splits into ${def.splits} Shards when it dies.`
          : def.aura ? `Enemies within ${def.aura}m of it take half damage.`
            : def.drains ? `Heals ${fmtPct(def.drains, 0)} of its health each time it hits.`
              : type === 'shard' ? 'Comes out of a Splitter.' : null;
    return h('div', { class: 'card ecard' },
      h('div', { class: 'row' }, enemyIcon(def), h('b', { class: 'grow' }, def.name),
        chance !== null ? h('span', { class: 'tag' }, fmtPct(chance, 0) + ' of spawns') : null),
      note ? h('div', { class: 'muted small' }, note) : null,
      breakdownRow('Health', fmt(hp.total), ex(hp, 'Base, wave 1 tier 1'), fmt, { neutral: true }),
      breakdownRow('Damage per hit', `${fmt(dmg.total)} → you take ${fmt(taken)}`, ex(dmg, 'Base, wave 1 tier 1'), fmt, { neutral: true }),
      breakdownRow('Speed', `≈ ${trim(def.speed, 1)} m/s`, null, fmt),
      breakdownRow('Cash per kill', '$' + fmt(cash.total), ex(cash, 'Base'), fmt, { neutral: true }),
      breakdownRow('Coins per kill', fmt(coins.total), ex(coins, 'Base'), fmt, { neutral: true }),
      breakdownRow('Shots to kill (average)', String(shots), null, fmt));
  });
  return h('div', { class: 'list' }, stepper, ...cards);
}

function enemyIcon(def) {
  const c = def.color;
  const shapes = {
    square: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
    triangle: '<path d="M21 12 5 20V4Z"/>',
    diamond: '<path d="M21 12 12 19 3 12 12 5Z"/>',
    hex: '<path d="M21 12 16.5 19.8h-9L3 12l4.5-7.8h9Z"/>',
    ring: '<circle cx="12" cy="12" r="8"/>',
    shield: '<path d="M21 12 15 20 4 17V7l11-3Z"/>',
    chevron: '<path d="M21 12 4 21 9 12 4 3Z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
    boss: '<path d="M12 2 14.8 6.3 19.8 5.6 18.5 10.5 22 12 18.5 13.5 19.8 18.4 14.8 17.7 12 22 9.2 17.7 4.2 18.4 5.5 13.5 2 12 5.5 10.5 4.2 5.6 9.2 6.3Z"/>',
  };
  return h('span', { class: 'eicon', html: `<svg viewBox="0 0 24 24" fill="${c}" stroke="rgba(0,0,0,.45)" stroke-width="1">${shapes[def.shape] || shapes.square}</svg>` });
}

export function openStats(tab) {
  const save = app.save;
  const state = { tab: tab || app.ui.statsTab || 'tower', wave: app.run ? app.run.wave : Math.max(1, save.best[save.tier] || 1) };
  const body = h('div', { class: 'list' });
  const head = h('div', { class: 'row' });
  const render = () => {
    const run = app.run && !app.run.over ? app.run : null;
    const S = run ? run.S : computeStats(save, null);
    head.replaceChildren(
      h('div', { class: 'seg grow' }, [['tower', 'Tower'], ['enemies', 'Enemies']].map(([v, label]) =>
        h('button', { class: state.tab === v ? 'on' : '', onclick: () => { state.tab = v; app.ui.statsTab = v; play('click'); render(); } }, label))),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, '✕'));
    body.replaceChildren(...[
      !run ? h('div', { class: 'muted small' }, 'Outside a run: workshop, labs, cards and modules only. In battle this also counts run upgrades and perks.') : null,
      state.tab === 'tower' ? towerTab(save, run, S) : enemiesTab(save, run, S, state, render)].filter(Boolean));
  };
  render();
  const close = modal(h('div', { class: 'list' }, h('h2', {}, 'Stats'), head, body), { cls: 'wide stats' });
  return close;
}



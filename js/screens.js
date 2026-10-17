// The between-runs screens: home, workshop, labs, cards, modules, ultimate
// weapons, and the settings/stats page.

import { app, commit } from './app.js';
import { h, icon, cur, toast, modal } from './dom.js';
import { fmt, fmtInt, fmtTime, fmtPct } from './format.js';
import { play } from './audio.js';
import {
  STATS, CATS, LABS, labTimeSec, labCost, LAB_SLOT_COSTS, CARDS, CARD_BY_ID, cardStars, CARD_STAR_COPIES,
  CARD_PACK, CARD_SLOT_COSTS, RARITY, UWS, uwParamCost, PERK_BY_ID, MODULE_SLOTS, MODULE_SLOT_BY_ID,
  MODULE_RARITIES, MODULE_MAX_LEVEL, MODULE_PACK_COST, MODULE_MERGE_COUNT, moduleLevelCost, TIERS,
  MILESTONES, wsCost,
} from './data.js';
import {
  wsLevel, isUnlocked, workshopCost, buyWorkshop, unlockStat, wsDiscount, labLevel, labSpeedBonus, researchFor,
  startResearch, rushCost, rushResearch, buyLabSlot, openCards, toggleCard, buyCardSlot, uwState, unlockUw,
  upgradeUw, buyModulePack, equipModule, levelModule, mergeCandidates, mergeModule, dismantleModule,
  moduleMainValue, moduleEffectValue, idleRate, idleCapSec, exportSave, importSave, newSave, SAVE_KEY,
} from './state.js';
import { setNotation } from './format.js';
import { setSound } from './audio.js';

const TABS = [
  ['home', 'Home', 'home'],
  ['workshop', 'Workshop', 'workshop'],
  ['labs', 'Labs', 'labs'],
  ['cards', 'Cards', 'cards'],
  ['modules', 'Modules', 'modules'],
  ['ultimates', 'Ultimates', 'ultimate'],
];

// ------------------------------------------------------------ chrome

export function renderTopbar() {
  const s = app.save;
  const bar = document.getElementById('topbar');
  bar.replaceChildren(
    h('div', { class: 'brand' }, 'KREPOST'),
    h('span', { class: 'chip' }, cur('coin', fmt(s.coins))),
    h('span', { class: 'chip' }, cur('gem', fmtInt(s.gems))),
    h('span', { class: 'chip' }, cur('stone', fmtInt(s.stones))),
    h('button', { class: 'icon-btn', 'aria-label': 'Tower and enemy stats', onclick: () => { play('click'); app.openStats(); } }, icon('stats')),
    h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => app.go('more') }, icon('gear')),
  );
}

export function renderTabs() {
  const nav = document.getElementById('tabs');
  const s = app.save;
  const labIdle = s.research.length < s.labSlots;
  nav.replaceChildren(...TABS.map(([id, label, ic]) =>
    h('button', { class: app.screen === id ? 'on' : '', onclick: () => { play('click'); app.go(id); } },
      icon(ic), label, id === 'labs' && labIdle && s.stats.runs > 0 ? h('span', { class: 'dot' }) : null)));
}

function costBtn(curName, cost, can, onclick, label) {
  return h('button', { class: 'btn small buy' + (can ? ' primary' : ''), disabled: !can, onclick },
    label || null, curName ? cur(curName, fmt(cost)) : null);
}

function seg(options, value, onpick) {
  return h('div', { class: 'seg' }, options.map(([v, label]) =>
    h('button', { class: v === value ? 'on' : '', onclick: () => { play('click'); onpick(v); } }, label)));
}

// --------------------------------------------------------------- home

export function homeScreen() {
  const s = app.save;
  const tier = s.tier;
  const best = s.best[tier] || 0;
  const claimed = s.milestones['t' + tier] || [];
  const next = MILESTONES.find((m) => !claimed.includes(m.wave));
  const canNext = tier < s.tiersUnlocked;
  const canPrev = tier > 1;
  const nextTier = TIERS[s.tiersUnlocked];
  const hasRun = !!s.run;

  const pickTier = (d) => {
    s.tier = Math.max(1, Math.min(s.tiersUnlocked, s.tier + d));
    commit();
    app.refresh();
  };

  const hero = h('div', { class: 'card hero' },
    h('div', { style: { width: '120px', height: '120px', margin: '0 auto' }, html: icon('logo').innerHTML }),
    h('div', { class: 'tier-pick' },
      h('button', { class: 'icon-btn', disabled: !canPrev || hasRun, onclick: () => pickTier(-1), 'aria-label': 'Previous tier' }, '‹'),
      h('div', { class: 't' }, 'Tier ' + tier),
      h('button', { class: 'icon-btn', disabled: !canNext || hasRun, onclick: () => pickTier(1), 'aria-label': 'Next tier' }, '›'),
    ),
    h('div', { class: 'muted small' }, best ? `Best wave on this tier: ${best}` : 'Not played yet'),
    h('div', { class: 'muted small' }, `Enemies ×${fmt(TIERS[tier - 1].hp)} health · Coins ×${TIERS[tier - 1].coins}`),
    hasRun
      ? h('button', { class: 'btn primary battle-btn', onclick: () => app.continueRun() }, `CONTINUE · WAVE ${s.run.wave}`)
      : h('button', { class: 'btn primary battle-btn', onclick: () => app.startRun() }, 'BATTLE'),
    hasRun ? h('button', { class: 'btn small', style: { marginTop: '8px' }, onclick: abandonRun }, 'Abandon this run') : null,
  );

  const progress = h('div', { class: 'card' },
    h('h3', {}, 'Progress'),
    h('div', { class: 'kv', style: { marginTop: '8px' } },
      h('span', {}, 'Next milestone'), h('b', {}, next ? `wave ${next.wave}` : 'all done'),
      next ? h('span', { class: 'muted' }, 'Reward') : null,
      next ? h('b', {}, `${Math.round(next.gems * (1 + 0.5 * (tier - 1)))} gems, ${Math.round(next.stones * (1 + 0.5 * (tier - 1)))} stones`) : null,
      nextTier ? h('span', {}, `Tier ${s.tiersUnlocked + 1} opens at`) : null,
      nextTier ? h('b', {}, `wave ${nextTier.unlockWave} on tier ${s.tiersUnlocked}`) : null,
    ),
  );

  const idle = s.stats.bestCoinsPerSec * idleRate(s) * 3600;
  const away = h('div', { class: 'card' },
    h('h3', {}, 'While you are away'),
    h('div', { class: 'kv', style: { marginTop: '8px' } },
      h('span', {}, 'Idle coins'), h('b', {}, idle ? fmt(idle) + ' / hour' : 'finish a run first'),
      h('span', {}, 'Counted for up to'), h('b', {}, fmtTime(idleCapSec(s))),
      h('span', {}, 'Labs running'), h('b', {}, `${s.research.length} of ${s.labSlots}`),
    ),
  );

  const page = h('div', { class: 'page' }, hero, progress, away);
  if (!s.seenIntro) page.append(h('div', { class: 'card' }, h('h3', {}, 'How to play'), howTo()));
  return page;
}

export function howTo() {
  return h('div', { class: 'small', style: { marginTop: '6px' } },
    h('p', {}, 'Your fortress fires on its own. Enemies come in waves from every side, and every tenth wave brings a boss.'),
    h('p', {}, 'During a run, spend cash on Attack, Defense and Utility upgrades. They reset when the run ends.'),
    h('p', {}, 'Between runs, spend coins in the Workshop for permanent upgrades, start research in the Labs, collect Cards and Modules with gems, and unlock Ultimate weapons with stones.'),
    h('p', {}, 'The bars icon shows every number: what your tower does, what each bonus adds, and what the enemies bring at any wave.'),
    h('p', {}, 'Labs keep running and coins keep coming while you are away. No ads, no purchases: everything is earned by playing.'),
  );
}

function abandonRun() {
  const close = modal(h('div', {},
    h('h2', {}, 'Abandon the run?'),
    h('p', { class: 'muted' }, 'You keep the coins it has earned so far.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn grow', onclick: () => close() }, 'Keep it'),
      h('button', { class: 'btn danger grow', onclick: () => { close(); app.continueRun(true); } }, 'Abandon'),
    )));
}

// ----------------------------------------------------------- workshop

export function workshopScreen() {
  const s = app.save;
  const tab = app.ui.wsTab;
  const mult = app.ui.wsMult;
  const list = h('div', { class: 'list' });

  for (const stat of STATS.filter((x) => x.cat === tab)) {
    const lvl = wsLevel(s, stat.id);
    const fmtV = (x) => (stat.f === 'big' ? fmt(x) : stat.f(x));
    if (!isUnlocked(s, stat)) {
      list.append(h('div', { class: 'item locked' },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, stat.name), h('div', { class: 'sub' }, 'Locked')),
        costBtn('coin', stat.unlock, s.coins >= stat.unlock, () => {
          if (unlockStat(s, stat.id)) { play('buy'); toast(`${stat.name} unlocked`); commit(); app.refresh(); }
        }, 'Unlock')));
      continue;
    }
    const maxed = lvl >= stat.max;
    let n = mult === 'max' ? 0 : mult;
    let total = 0;
    if (!maxed) {
      const disc = wsDiscount(s, stat.cat);
      if (mult === 'max') {
        let c = s.coins;
        while (lvl + n < stat.max) {
          const k = wsCost(stat, lvl + n, disc);
          if (k > c) break;
          c -= k; total += k; n++;
        }
        if (n === 0) { n = 1; total = wsCost(stat, lvl, disc); }
      } else {
        n = Math.min(n, stat.max - lvl);
        for (let i = 0; i < n; i++) total += wsCost(stat, lvl + i, disc);
      }
    }
    const can = !maxed && s.coins >= total;
    list.append(h('div', { class: 'item' },
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'name' }, stat.name), h('span', { class: 'lv' }, `Lv ${lvl}${stat.max < 6000 ? '/' + stat.max : ''}`)),
        h('div', { class: 'sub val' }, maxed ? fmtV(stat.v(lvl)) + ' · max' : `${fmtV(stat.v(lvl))} → ${fmtV(stat.v(lvl + n))}`),
      ),
      maxed ? h('span', { class: 'tag' }, 'MAX') : costBtn('coin', total, can, () => {
        let k = 0;
        while (k < n && buyWorkshop(s, stat.id)) k++;
        if (k) { play('buy'); commit(); app.refresh(); }
      }, n > 1 ? `×${n}` : null),
    ));
  }

  return h('div', { class: 'page' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Workshop'), cur('coin', fmt(s.coins))),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Permanent upgrades. Every run starts from these levels.'),
    seg(CATS.map((c) => [c.id, c.name]), tab, (v) => { app.ui.wsTab = v; app.refresh(); }),
    seg([[1, '×1'], [10, '×10'], ['max', 'Max']], mult, (v) => { app.ui.wsMult = v; app.refresh(); }),
    list,
  );
}

// --------------------------------------------------------------- labs

export function labsScreen() {
  const s = app.save;
  const now = Date.now();
  const speed = labSpeedBonus(s);
  const running = h('div', { class: 'list' });
  for (let i = 0; i < s.labSlots; i++) {
    const r = s.research[i];
    if (!r) {
      running.append(h('div', { class: 'item' }, h('div', { class: 'grow muted' }, `Slot ${i + 1}: free`)));
      continue;
    }
    const lab = LABS.find((l) => l.id === r.lab);
    const barFill = h('i', { style: { width: '0%' } });
    const left = h('span', { class: 'small muted' });
    const rushBtn = h('button', { class: 'btn small', onclick: () => {
      if (rushResearch(s, r.lab, Date.now())) { play('buy'); toast(`${lab.name} finished`); commit(); app.refresh(); }
      else toast('Not enough gems');
    } });
    const upd = () => {
      const t = Date.now();
      const frac = Math.min(1, (t - r.start) / (r.end - r.start));
      barFill.style.width = (frac * 100).toFixed(1) + '%';
      left.textContent = fmtTime((r.end - t) / 1000) + ' left';
      rushBtn.replaceChildren('Finish ', cur('gem', String(rushCost(r, t))));
    };
    upd();
    app.live.push(upd);
    running.append(h('div', { class: 'item' },
      h('div', { class: 'grow' },
        h('div', { class: 'row spread' }, h('span', { class: 'name' }, `${lab.name} → Lv ${labLevel(s, r.lab) + 1}`), left),
        h('div', { class: 'bar', style: { marginTop: '6px' } }, barFill),
      ),
      rushBtn));
  }
  const slotCost = LAB_SLOT_COSTS[s.labSlots];
  const busy = s.research.length >= s.labSlots;

  const list = h('div', { class: 'list' });
  for (const lab of LABS) {
    const lvl = labLevel(s, lab.id);
    const maxed = lvl >= lab.max;
    const r = researchFor(s, lab.id);
    const cost = labCost(lab, lvl);
    const time = labTimeSec(lab, lvl, speed);
    list.append(h('div', { class: 'item' },
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'name' }, lab.name), h('span', { class: 'lv' }, `Lv ${lvl}/${lab.max}`)),
        h('div', { class: 'sub' }, lab.desc),
        h('div', { class: 'sub val' }, maxed ? lab.f(lvl * lab.per) + ' · max' : `${lab.f(+(lvl * lab.per).toFixed(4))} → ${lab.f(+((lvl + 1) * lab.per).toFixed(4))} · ${fmtTime(time)}`),
      ),
      maxed ? h('span', { class: 'tag' }, 'MAX') : r ? h('span', { class: 'tag' }, 'Running')
        : costBtn('coin', cost, !busy && s.coins >= cost, () => {
          if (startResearch(s, lab.id, Date.now())) { play('buy'); commit(); app.refresh(); }
        }),
    ));
  }

  return h('div', { class: 'page' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Labs'), cur('coin', fmt(s.coins))),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Research runs in real time, also while the game is closed.'),
    running,
    slotCost !== undefined ? h('button', { class: 'btn', disabled: s.gems < slotCost, onclick: () => {
      if (buyLabSlot(s)) { play('buy'); commit(); app.refresh(); }
    } }, 'Open another lab slot ', cur('gem', String(slotCost))) : null,
    list,
  );
}

// -------------------------------------------------------------- cards

const CARD_GLYPH = {
  damage: '⚔', atkSpeed: '»', health: '♥', regen: '✚', cash: '$', packages: '▣', coins: '¢', range: '◎', crit: '✦',
  slowAura: '❄', defense: '⛨', freeUps: '♢', enemyBalance: '⁂', extraOrb: '●', waveSkip: '⇥', introSprint: '▶',
  secondWind: '↺', shield: '◯', berserker: '!', demon: '☄', plasma: '✺',
};

export function cardsScreen() {
  const s = app.save;
  const slotCost = CARD_SLOT_COSTS[s.cardSlots];
  const grid = h('div', { class: 'cards-grid' });
  for (const c of CARDS) {
    const copies = s.cards[c.id] || 0;
    const stars = cardStars(copies);
    const on = s.equippedCards.includes(c.id);
    const col = RARITY[c.rarity].color;
    if (!copies) {
      grid.append(h('div', { class: 'gcard unknown' },
        h('div', { class: 'art', style: { background: '#0e1427', color: col } }, '?'),
        h('div', { class: 'nm' }, c.name), h('div', { class: 'ds', style: { color: col } }, RARITY[c.rarity].name)));
      continue;
    }
    const val = c.f(c.v[stars - 1]);
    const nextNeed = CARD_STAR_COPIES[stars];
    grid.append(h('button', { class: 'gcard' + (on ? ' on' : ''), style: { borderColor: on ? undefined : col + '66' }, onclick: () => {
      if (toggleCard(s, c.id)) { play('click'); commit(); app.refresh(); }
      else toast(`All ${s.cardSlots} card slots are full`);
    } },
      on ? h('span', { class: 'eq' }, 'ON') : null,
      h('div', { class: 'art', style: { background: col + '33', color: col } }, CARD_GLYPH[c.id] || '•'),
      h('div', { class: 'nm' }, c.name),
      h('div', { class: 'stars' }, '★'.repeat(stars) + '☆'.repeat(7 - stars)),
      h('div', { class: 'ds' }, c.desc.replace('{v}', val)),
      h('div', { class: 'ds' }, nextNeed ? `${copies}/${nextNeed} copies` : 'max stars'),
    ));
  }

  const pack = (n, cost) => h('button', { class: 'btn primary grow', disabled: s.gems < cost, onclick: () => {
    const got = openCards(s, n);
    if (!got) return;
    play('gem');
    commit();
    app.refresh();
    showPack(got);
  } }, `Open ${n} `, cur('gem', String(cost)));

  return h('div', { class: 'page' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Cards'), cur('gem', fmtInt(s.gems))),
    h('p', { class: 'muted small', style: { margin: 0 } }, `Tap a card to equip or remove it. Slots in use: ${s.equippedCards.length} of ${s.cardSlots}. Copies raise a card's stars.`),
    h('div', { class: 'row' }, pack(1, CARD_PACK.one), pack(10, CARD_PACK.ten)),
    slotCost !== undefined ? h('button', { class: 'btn', disabled: s.gems < slotCost, onclick: () => {
      if (buyCardSlot(s)) { play('buy'); commit(); app.refresh(); }
    } }, 'Another card slot ', cur('gem', String(slotCost))) : null,
    grid,
  );
}

function showPack(ids) {
  const close = modal(h('div', {},
    h('h2', {}, ids.length > 1 ? 'New cards' : 'New card'),
    h('div', { class: 'cards-grid', style: { marginTop: '10px' } }, ids.map((id) => {
      const c = CARD_BY_ID[id];
      const col = RARITY[c.rarity].color;
      return h('div', { class: 'gcard', style: { borderColor: col } },
        h('div', { class: 'art', style: { background: col + '33', color: col } }, CARD_GLYPH[id] || '•'),
        h('div', { class: 'nm' }, c.name), h('div', { class: 'ds', style: { color: col } }, RARITY[c.rarity].name));
    })),
    h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => close() }, 'Nice'),
  ));
}

// ------------------------------------------------------------ modules

const RARITY_COLORS = MODULE_RARITIES.map((r) => RARITY[r].color);

function moduleDesc(m) {
  const slot = MODULE_SLOT_BY_ID[m.slot];
  const v = slot.variants.find((x) => x.id === m.variant);
  const eff = moduleEffectValue(m);
  const active = m.rarity >= 2;
  const effText = v.effect.replace('{v}', v.pct ? fmtPct(eff, 0) : String(eff));
  return {
    title: `${v.name} ${slot.name}`,
    main: `${slot.main} +${fmtPct(moduleMainValue(m), 1)}`,
    effect: active ? effText : `${v.effect.replace('{v}', '…')} (from Epic)`,
    active,
  };
}

export function modulesScreen() {
  const s = app.save;
  const slots = h('div', { class: 'mod-slots' }, MODULE_SLOTS.map((slot) => {
    const m = s.modules.find((x) => x.uid === s.equipped[slot.id]);
    if (!m) return h('div', { class: 'mod' }, h('div', { class: 'r muted' }, slot.name), h('div', { class: 'muted small' }, 'Empty slot'));
    const d = moduleDesc(m);
    return h('button', { class: 'mod', style: { borderColor: RARITY_COLORS[m.rarity], textAlign: 'left' }, onclick: () => moduleModal(m) },
      h('div', { class: 'r', style: { color: RARITY_COLORS[m.rarity] } }, `${slot.name} · ${RARITY[MODULE_RARITIES[m.rarity]].name}`),
      h('div', { class: 'name', style: { fontWeight: 700 } }, d.title),
      h('div', { class: 'small' }, d.main),
      h('div', { class: 'small', style: { color: d.active ? 'var(--cash)' : 'var(--muted)' } }, d.effect),
      h('div', { class: 'lv' }, `Lv ${m.level}/${MODULE_MAX_LEVEL[m.rarity]}`));
  }));

  const filter = app.ui.modFilter;
  const inv = s.modules
    .filter((m) => filter === 'all' || m.slot === filter)
    .sort((a, b) => b.rarity - a.rarity || b.level - a.level);
  const list = h('div', { class: 'list' }, inv.length ? inv.map((m) => {
    const d = moduleDesc(m);
    const eq = s.equipped[m.slot] === m.uid;
    const dupes = mergeCandidates(s, m.uid).filter((o) => s.equipped[o.slot] !== o.uid).length;
    return h('button', { class: 'item', style: { borderColor: RARITY_COLORS[m.rarity] + '88', textAlign: 'left' }, onclick: () => moduleModal(m) },
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'name', style: { color: RARITY_COLORS[m.rarity] } }, d.title), h('span', { class: 'lv' }, `Lv ${m.level}`)),
        h('div', { class: 'sub' }, `${d.main} · ${d.effect}`)),
      eq ? h('span', { class: 'tag' }, 'Equipped') : dupes >= MODULE_MERGE_COUNT - 1 ? h('span', { class: 'tag', style: { color: 'var(--accent)' } }, 'Merge') : null);
  }) : h('div', { class: 'muted small' }, 'No modules yet. Open one with gems, or find them on bosses.'));

  return h('div', { class: 'page' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Modules'), h('div', { class: 'row' }, cur('gem', fmtInt(s.gems)), cur('shard', fmtInt(s.shards)))),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'One module per slot. Shards level them up; three identical modules merge into a rarer one. Epic and above add a special effect.'),
    slots,
    h('button', { class: 'btn primary', disabled: s.gems < MODULE_PACK_COST, onclick: () => {
      const m = buyModulePack(s);
      if (!m) return;
      play('gem');
      commit();
      app.refresh();
      const d = moduleDesc(m);
      toast(`${RARITY[MODULE_RARITIES[m.rarity]].name}: ${d.title}`);
    } }, 'Open a module ', cur('gem', String(MODULE_PACK_COST))),
    seg([['all', 'All'], ...MODULE_SLOTS.map((x) => [x.id, x.name])], filter, (v) => { app.ui.modFilter = v; app.refresh(); }),
    list,
  );
}

function moduleModal(m) {
  const s = app.save;
  const d = moduleDesc(m);
  const eq = s.equipped[m.slot] === m.uid;
  const maxed = m.level >= MODULE_MAX_LEVEL[m.rarity];
  const cost = moduleLevelCost(m.level);
  const dupes = mergeCandidates(s, m.uid).filter((o) => s.equipped[o.slot] !== o.uid).length;
  const canMerge = m.rarity < MODULE_RARITIES.length - 1 && dupes >= MODULE_MERGE_COUNT - 1;
  const done = () => { close(); commit(); app.refresh(); };
  const close = modal(h('div', { class: 'list' },
    h('h2', { style: { color: RARITY_COLORS[m.rarity] } }, d.title),
    h('div', { class: 'muted small', style: { textAlign: 'center' } }, `${RARITY[MODULE_RARITIES[m.rarity]].name} · Lv ${m.level}/${MODULE_MAX_LEVEL[m.rarity]}`),
    h('div', { class: 'card' }, h('div', {}, d.main), h('div', { style: { color: d.active ? 'var(--cash)' : 'var(--muted)' } }, d.effect)),
    eq ? null : h('button', { class: 'btn primary', onclick: () => { equipModule(s, m.uid); play('click'); done(); } }, 'Equip'),
    h('button', { class: 'btn', disabled: maxed || s.shards < cost, onclick: () => { if (levelModule(s, m.uid)) { play('buy'); done(); moduleModal(m); } } },
      maxed ? 'Max level' : 'Level up ', maxed ? null : cur('shard', fmtInt(cost))),
    h('button', { class: 'btn', disabled: !canMerge, onclick: () => { if (mergeModule(s, m.uid)) { play('perk'); toast('Merged'); done(); } } },
      `Merge (needs ${MODULE_MERGE_COUNT - 1} more copies, have ${dupes})`),
    h('button', { class: 'btn danger', disabled: eq, onclick: () => { const back = dismantleModule(s, m.uid); if (back) { toast(`+${back} shards`); done(); } } }, 'Dismantle for shards'),
  ));
}

// ---------------------------------------------------------- ultimates

const UW_COLOR = Object.fromEntries(UWS.map((u) => [u.id, u.color]));
export { UW_COLOR };

export function ultimatesScreen() {
  const s = app.save;
  const list = h('div', { class: 'list' });
  for (const uw of UWS) {
    const st = uwState(s, uw.id);
    const head = h('div', { class: 'row' },
      h('b', { style: { width: '26px', height: '26px', borderRadius: '7px', background: uw.color + '22', color: uw.color, display: 'grid', placeItems: 'center', flex: 'none' } }, uw.glyph),
      h('span', { class: 'name grow', style: { fontWeight: 700 } }, uw.name));
    if (!st) {
      list.append(h('div', { class: 'card' }, head, h('div', { class: 'muted small', style: { margin: '4px 0 8px' } }, uw.desc),
        h('button', { class: 'btn' + (s.stones >= uw.unlock ? ' primary' : ''), disabled: s.stones < uw.unlock, onclick: () => {
          if (unlockUw(s, uw.id)) { play('perk'); toast(`${uw.name} unlocked`); commit(); app.refresh(); }
        } }, 'Unlock ', cur('stone', String(uw.unlock)))));
      continue;
    }
    const rows = uw.params.map((p) => {
      const lvl = st.lv[p.id] || 0;
      const maxed = lvl >= p.max;
      const cost = uwParamCost(p, lvl);
      return h('div', { class: 'row', style: { marginTop: '6px' } },
        h('div', { class: 'grow' }, h('div', { class: 'small' }, p.name, ' ', h('span', { class: 'lv' }, `Lv ${lvl}/${p.max}`)),
          h('div', { class: 'val' }, maxed ? p.f(p.v(lvl)) : `${p.f(+p.v(lvl).toFixed(3))} → ${p.f(+p.v(lvl + 1).toFixed(3))}`)),
        maxed ? h('span', { class: 'tag' }, 'MAX') : costBtn('stone', cost, s.stones >= cost, () => {
          if (upgradeUw(s, uw.id, p.id)) { play('buy'); commit(); app.refresh(); }
        }));
    });
    list.append(h('div', { class: 'card', style: { borderColor: uw.color + '66' } }, head, h('div', { class: 'muted small' }, uw.desc), rows));
  }
  return h('div', { class: 'page' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Ultimate Weapons'), cur('stone', fmtInt(s.stones))),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Earn stones in every run (one per 10 waves, more on higher tiers) and from milestones. Ultimates fire on their own.'),
    list,
  );
}

// -------------------------------------------------------- more / stats

export function moreScreen() {
  const s = app.save;
  const st = s.stats;
  const setting = (key, label, after) => h('div', { class: 'toggle' }, h('span', {}, label),
    h('button', { class: 'switch' + (s.settings[key] ? ' on' : ''), 'aria-label': label, onclick: () => {
      s.settings[key] = !s.settings[key];
      if (after) after(s.settings[key]);
      commit();
      app.refresh();
    } }));

  const order = h('div', { class: 'perk-order' }, s.perkOrder.map((id, i) => {
    const p = PERK_BY_ID[id];
    const move = (d) => {
      const j = i + d;
      if (j < 0 || j >= s.perkOrder.length) return;
      [s.perkOrder[i], s.perkOrder[j]] = [s.perkOrder[j], s.perkOrder[i]];
      commit();
      app.refresh();
    };
    return h('div', { class: 'item' },
      h('span', { class: 'lv', style: { width: '20px' } }, String(i + 1)),
      h('div', { class: 'grow small' }, h('b', {}, p.name), ' ', h('span', { class: 'muted' }, p.good + (p.bad ? ', ' + p.bad : ''))),
      h('button', { class: 'btn small', disabled: i === 0, onclick: () => move(-1), 'aria-label': 'Up' }, '▲'),
      h('button', { class: 'btn small', disabled: i === s.perkOrder.length - 1, onclick: () => move(1), 'aria-label': 'Down' }, '▼'));
  }));

  const bestRows = [];
  for (let t = 1; t <= s.tiersUnlocked; t++) bestRows.push(h('span', {}, `Best wave, tier ${t}`), h('b', {}, String(s.best[t] || 0)));

  return h('div', { class: 'page' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Settings & Stats'), h('button', { class: 'btn small', onclick: () => app.go('home') }, 'Done')),
    h('div', { class: 'card' },
      setting('sound', 'Sound', (v) => setSound(v)),
      setting('vibrate', 'Vibration'),
      setting('dmgNumbers', 'Damage numbers'),
      setting('confirmEnd', 'Ask before ending a run'),
      h('div', { class: 'toggle' }, h('span', {}, 'Numbers'), seg([['letters', '1.5M'], ['scientific', '1.5e6']], s.settings.notation, (v) => {
        s.settings.notation = v; setNotation(v); commit(); app.refresh();
      })),
    ),
    h('div', { class: 'card' },
      h('h3', {}, 'Stats'),
      h('div', { class: 'kv', style: { marginTop: '8px' } },
        h('span', {}, 'Runs'), h('b', {}, fmtInt(st.runs)),
        ...bestRows,
        h('span', {}, 'Enemies destroyed'), h('b', {}, fmt(st.kills)),
        h('span', {}, 'Bosses destroyed'), h('b', {}, fmt(st.bossKills)),
        h('span', {}, 'Waves survived'), h('b', {}, fmt(st.waves)),
        h('span', {}, 'Coins earned'), h('b', {}, fmt(st.coinsEarned)),
        h('span', {}, 'Cash earned'), h('b', {}, fmt(st.cashEarned)),
        h('span', {}, 'Gems earned'), h('b', {}, fmt(st.gemsEarned)),
        h('span', {}, 'Damage dealt'), h('b', {}, fmt(st.damage)),
        h('span', {}, 'Best coins per second'), h('b', {}, fmt(st.bestCoinsPerSec)),
        h('span', {}, 'Time in battle'), h('b', {}, fmtTime(st.playSec)),
      )),
    h('div', { class: 'card' },
      h('h3', {}, 'Perk priority'),
      h('p', { class: 'muted small' }, labLevel(s, 'autoPerk') ? 'Auto Perk picks the highest of the offered perks in this order.' : 'Research Auto Perk in the Labs to have perks picked for you in this order.'),
      labLevel(s, 'autoPerk') ? h('div', { class: 'toggle' }, h('span', {}, 'Auto Perk on'),
        h('button', { class: 'switch' + (s.autoPerk ? ' on' : ''), 'aria-label': 'Auto Perk', onclick: () => {
          s.autoPerk = !s.autoPerk; commit(); app.refresh();
        } })) : null,
      order),
    h('div', { class: 'card' },
      h('h3', {}, 'Save'),
      h('p', { class: 'muted small' }, 'Progress is saved on this device. Copy the code to move it to another device or keep a backup.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn grow', onclick: exportModal }, 'Export save'),
        h('button', { class: 'btn grow', onclick: importModal }, 'Import save'),
        h('button', { class: 'btn danger grow', onclick: resetModal }, 'Reset')),
    ),
    h('div', { class: 'card' }, h('h3', {}, 'How to play'), howTo()),
    h('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Krepost · no ads, no purchases, no tracking · © 2026 Tudor Lapp · MIT licence'),
  );
}

function exportModal() {
  const code = exportSave(app.save);
  const ta = h('textarea', { readonly: true }, code);
  const close = modal(h('div', { class: 'list' },
    h('h2', {}, 'Export save'),
    ta,
    h('button', { class: 'btn primary', onclick: async () => {
      try { await navigator.clipboard.writeText(code); toast('Copied'); } catch { ta.select(); toast('Select and copy the text'); }
    } }, 'Copy'),
    h('button', { class: 'btn', onclick: () => close() }, 'Close')));
}

function importModal() {
  const ta = h('textarea', { placeholder: 'Paste a KREPOST1 save code' });
  const close = modal(h('div', { class: 'list' },
    h('h2', {}, 'Import save'),
    h('p', { class: 'muted small' }, 'This replaces the progress on this device.'),
    ta,
    h('button', { class: 'btn primary', onclick: () => {
      try {
        const s = importSave(ta.value);
        s.lastSeen = Date.now();
        app.save = s;
        app.run = null;
        commit();
        close();
        toast('Save imported');
        app.go('home');
      } catch (e) {
        toast(e.message || 'That code did not work');
      }
    } }, 'Import'),
    h('button', { class: 'btn', onclick: () => close() }, 'Cancel')));
}

function resetModal() {
  const close = modal(h('div', { class: 'list' },
    h('h2', {}, 'Reset everything?'),
    h('p', { class: 'muted' }, 'All progress on this device is deleted. Export a backup first if you might want it back.'),
    h('button', { class: 'btn danger', onclick: () => {
      localStorage.removeItem(SAVE_KEY);
      app.save = newSave();
      app.run = null;
      commit();
      close();
      app.go('home');
    } }, 'Delete my progress'),
    h('button', { class: 'btn', onclick: () => close() }, 'Cancel')));
}

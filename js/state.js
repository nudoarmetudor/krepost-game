// The permanent save: everything that survives between runs. Pure functions
// where possible, so tests can drive them with a fake clock.

import {
  VERSION, STATS, LABS, LAB_BY_ID, labTimeSec, labCost, LAB_SLOT_COSTS, CARDS, CARD_BY_ID,
  CARD_PACK, CARD_SLOT_COSTS, RARITY, UWS, UW_BY_ID, uwParamCost, DEFAULT_PERK_ORDER,
  MODULE_SLOTS, MODULE_SLOT_BY_ID, MODULE_RARITIES, MODULE_MAX_LEVEL, MODULE_PACK_COST,
  MODULE_PACK_WEIGHTS, MODULE_MERGE_COUNT, MODULE_DISMANTLE, moduleLevelCost, wsCost,
  STAT_BY_ID, TIERS, MILESTONES, DAILY_GEMS, OFFLINE_BASE_RATE, OFFLINE_BASE_CAP_H, IDLE_RUNS, TIER_REWARD_STEP, UW_UNLOCK_COSTS,
} from './data.js';

export const SAVE_KEY = 'krepost-save-v1';

export function newSave(now = Date.now()) {
  return {
    v: VERSION,
    created: now,
    coins: 0,
    gems: 20,
    stones: 0,
    shards: 0,
    ws: {},
    unlocked: {},
    labs: {},
    labSlots: 1,
    research: [],
    cards: {},
    cardSlots: 2,
    equippedCards: [],
    uws: {},
    modules: [],
    equipped: {},
    nextUid: 1,
    perkOrder: [...DEFAULT_PERK_ORDER],
    autoPerk: true,
    tier: 1,
    tiersUnlocked: 1,
    best: {},
    milestones: {},
    stats: {
      runs: 0, kills: 0, bossKills: 0, coinsEarned: 0, cashEarned: 0, gemsEarned: 0,
      playSec: 0, damage: 0, waves: 0, bestCoinsPerSec: 0, recentCps: [],
    },
    lastSeen: now,
    lastDaily: '',
    settings: { sound: true, vibrate: true, notation: 'letters', dmgNumbers: true, confirmEnd: true, speed: 1 },
    run: null,
    seenIntro: false,
  };
}

// Fill any fields a newer version added, so old saves keep loading.
export function migrate(raw, now = Date.now()) {
  const base = newSave(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  for (const k of ['ws', 'unlocked', 'labs', 'cards', 'uws', 'equipped', 'best', 'milestones']) {
    if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
  }
  for (const k of ['research', 'equippedCards', 'modules']) if (!Array.isArray(s[k])) s[k] = [];
  // perks added after the save was made go to the end of the priority list
  const order = Array.isArray(s.perkOrder) ? s.perkOrder.filter((id) => DEFAULT_PERK_ORDER.includes(id)) : [];
  for (const id of DEFAULT_PERK_ORDER) if (!order.includes(id)) order.push(id);
  s.perkOrder = order;
  // idle used to follow the best run ever; start the recent list from it
  if (!Array.isArray(s.stats.recentCps)) s.stats.recentCps = [];
  if (!s.stats.recentCps.length && s.stats.bestCoinsPerSec > 0) s.stats.recentCps = [s.stats.bestCoinsPerSec];
  s.v = VERSION;
  return s;
}

export function load(storage, now = Date.now()) {
  try {
    const txt = storage.getItem(SAVE_KEY);
    return migrate(txt ? JSON.parse(txt) : null, now);
  } catch {
    return newSave(now);
  }
}

export function persist(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function exportSave(save) {
  const json = JSON.stringify(save);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'KREPOST1:' + btoa(bin);
}

export function importSave(text, now = Date.now()) {
  const t = String(text).trim();
  if (!t.startsWith('KREPOST1:')) throw new Error('This is not a Krepost save code.');
  const bin = atob(t.slice(9));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return migrate(JSON.parse(new TextDecoder().decode(bytes)), now);
}

// ---------------------------------------------------------------- workshop

export function wsLevel(save, id) {
  return save.ws[id] || 0;
}

export function isUnlocked(save, stat) {
  return !stat.unlock || !!save.unlocked[stat.id];
}

export function wsDiscount(save, cat) {
  const lab = { attack: 'wsAttack', defense: 'wsDefense', utility: 'wsUtility' }[cat];
  return labValue(save, lab);
}

export function workshopCost(save, id) {
  const stat = STAT_BY_ID[id];
  return wsCost(stat, wsLevel(save, id), wsDiscount(save, stat.cat));
}

export function buyWorkshop(save, id) {
  const stat = STAT_BY_ID[id];
  if (!isUnlocked(save, stat)) return false;
  if (wsLevel(save, id) >= stat.max) return false;
  const cost = workshopCost(save, id);
  if (save.coins < cost) return false;
  save.coins -= cost;
  save.ws[id] = wsLevel(save, id) + 1;
  return true;
}

export function unlockStat(save, id) {
  const stat = STAT_BY_ID[id];
  if (!stat.unlock || save.unlocked[id]) return false;
  if (save.coins < stat.unlock) return false;
  save.coins -= stat.unlock;
  // paired stats (chance + targets) open together
  for (const s of STATS) if (s.grp === stat.grp) save.unlocked[s.id] = true;
  return true;
}

// -------------------------------------------------------------------- labs

export function labLevel(save, id) {
  return save.labs[id] || 0;
}

export function labValue(save, id) {
  const lab = LAB_BY_ID[id];
  return lab ? labLevel(save, id) * lab.per : 0;
}

export function labSpeedBonus(save) {
  return labValue(save, 'labSpeed');
}

export function researchFor(save, id) {
  return save.research.find((r) => r.lab === id);
}

export function startResearch(save, id, now = Date.now()) {
  const lab = LAB_BY_ID[id];
  const lvl = labLevel(save, id);
  if (lvl >= lab.max || researchFor(save, id)) return false;
  if (save.research.length >= save.labSlots) return false;
  const cost = labCost(lab, lvl);
  if (save.coins < cost) return false;
  save.coins -= cost;
  const dur = labTimeSec(lab, lvl, labSpeedBonus(save)) * 1000;
  save.research.push({ lab: id, start: now, end: now + dur });
  return true;
}

// Gems to finish a research now: one gem per started 10 minutes left.
export function rushCost(r, now = Date.now()) {
  return Math.max(1, Math.ceil((r.end - now) / 600000));
}

export function rushResearch(save, id, now = Date.now()) {
  const r = researchFor(save, id);
  if (!r) return false;
  const cost = rushCost(r, now);
  if (save.gems < cost) return false;
  save.gems -= cost;
  r.end = now;
  tickLabs(save, now);
  return true;
}

// Finish everything whose time has come. Returns the ids that finished.
export function tickLabs(save, now = Date.now()) {
  const done = [];
  save.research = save.research.filter((r) => {
    if (now >= r.end) {
      save.labs[r.lab] = labLevel(save, r.lab) + 1;
      done.push(r.lab);
      return false;
    }
    return true;
  });
  return done;
}

export function buyLabSlot(save) {
  const cost = LAB_SLOT_COSTS[save.labSlots];
  if (cost === undefined || save.gems < cost) return false;
  save.gems -= cost;
  save.labSlots++;
  return true;
}

// ------------------------------------------------------------------- cards

export function openCards(save, n, rand = Math.random) {
  const cost = n === 10 ? CARD_PACK.ten : CARD_PACK.one * n;
  if (save.gems < cost) return null;
  save.gems -= cost;
  const got = [];
  const total = CARDS.reduce((a, c) => a + RARITY[c.rarity].weight, 0);
  for (let i = 0; i < n; i++) {
    let x = rand() * total;
    let pick = CARDS[0];
    for (const c of CARDS) {
      x -= RARITY[c.rarity].weight;
      if (x <= 0) { pick = c; break; }
    }
    save.cards[pick.id] = (save.cards[pick.id] || 0) + 1;
    got.push(pick.id);
  }
  return got;
}

export function toggleCard(save, id) {
  const i = save.equippedCards.indexOf(id);
  if (i >= 0) {
    save.equippedCards.splice(i, 1);
    return true;
  }
  if (!save.cards[id] || save.equippedCards.length >= save.cardSlots) return false;
  save.equippedCards.push(id);
  return true;
}

export function buyCardSlot(save) {
  const cost = CARD_SLOT_COSTS[save.cardSlots];
  if (cost === undefined || save.gems < cost) return false;
  save.gems -= cost;
  save.cardSlots++;
  return true;
}

// -------------------------------------------------------- ultimate weapons

export function uwState(save, id) {
  return save.uws[id] || null;
}

export function unlockedUwCount(save) {
  return Object.values(save.uws).filter((u) => u && u.on).length;
}

// The next weapon costs more the more you already own, whichever you pick.
export function uwUnlockCost(save) {
  const n = unlockedUwCount(save);
  return UW_UNLOCK_COSTS[Math.min(n, UW_UNLOCK_COSTS.length - 1)];
}

export function unlockUw(save, id) {
  if (uwState(save, id)) return false;
  const cost = uwUnlockCost(save);
  if (save.stones < cost) return false;
  save.stones -= cost;
  save.uws[id] = { on: true, lv: {} };
  return true;
}

export function upgradeUw(save, id, paramId) {
  const st = uwState(save, id);
  if (!st) return false;
  const p = UW_BY_ID[id].params.find((x) => x.id === paramId);
  const lvl = st.lv[paramId] || 0;
  if (lvl >= p.max) return false;
  const cost = uwParamCost(p, lvl);
  if (save.stones < cost) return false;
  save.stones -= cost;
  st.lv[paramId] = lvl + 1;
  return true;
}

export function uwValue(save, id, paramId) {
  const st = uwState(save, id);
  const p = UW_BY_ID[id].params.find((x) => x.id === paramId);
  return p.v(st ? st.lv[paramId] || 0 : 0);
}

// ----------------------------------------------------------------- modules

export function addModule(save, slot, variant, rarity) {
  const m = { uid: save.nextUid++, slot, variant, rarity, level: 0 };
  save.modules.push(m);
  if (!save.equipped[slot]) save.equipped[slot] = m.uid;
  return m;
}

export function rollModule(save, rand = Math.random, weights = MODULE_PACK_WEIGHTS) {
  const slot = MODULE_SLOTS[Math.floor(rand() * MODULE_SLOTS.length)];
  const variant = slot.variants[Math.floor(rand() * slot.variants.length)];
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  let r = 0;
  for (; r < weights.length; r++) {
    x -= weights[r];
    if (x <= 0) break;
  }
  return addModule(save, slot.id, variant.id, Math.min(r, MODULE_RARITIES.length - 1));
}

export function buyModulePack(save, rand = Math.random) {
  if (save.gems < MODULE_PACK_COST) return null;
  save.gems -= MODULE_PACK_COST;
  return rollModule(save, rand);
}

export function moduleByUid(save, uid) {
  return save.modules.find((m) => m.uid === uid);
}

export function equipModule(save, uid) {
  const m = moduleByUid(save, uid);
  if (!m) return false;
  save.equipped[m.slot] = uid;
  return true;
}

export function levelModule(save, uid) {
  const m = moduleByUid(save, uid);
  if (!m || m.level >= MODULE_MAX_LEVEL[m.rarity]) return false;
  const cost = moduleLevelCost(m.level);
  if (save.shards < cost) return false;
  save.shards -= cost;
  m.level++;
  return true;
}

export function mergeCandidates(save, uid) {
  const m = moduleByUid(save, uid);
  if (!m || m.rarity >= MODULE_RARITIES.length - 1) return [];
  return save.modules.filter((o) => o.uid !== uid && o.slot === m.slot && o.variant === m.variant && o.rarity === m.rarity);
}

// Merge the module with two copies of itself into one of the next rarity.
// The kept module carries the highest level of the three.
export function mergeModule(save, uid) {
  const m = moduleByUid(save, uid);
  const others = mergeCandidates(save, uid)
    .filter((o) => save.equipped[o.slot] !== o.uid)
    .slice(0, MODULE_MERGE_COUNT - 1);
  if (!m || others.length < MODULE_MERGE_COUNT - 1) return false;
  m.level = Math.max(m.level, ...others.map((o) => o.level));
  m.rarity++;
  const gone = new Set(others.map((o) => o.uid));
  save.modules = save.modules.filter((o) => !gone.has(o.uid));
  return true;
}

export function dismantleModule(save, uid) {
  const m = moduleByUid(save, uid);
  if (!m || save.equipped[m.slot] === uid) return false;
  let back = MODULE_DISMANTLE[m.rarity];
  for (let l = 0; l < m.level; l++) back += Math.floor(moduleLevelCost(l) * 0.5);
  save.shards += back;
  save.modules = save.modules.filter((o) => o.uid !== uid);
  return back;
}

export function moduleMainValue(m) {
  const slot = MODULE_SLOT_BY_ID[m.slot];
  return slot.mainV[m.rarity] * (1 + 0.02 * m.level);
}

export function moduleEffectValue(m) {
  const slot = MODULE_SLOT_BY_ID[m.slot];
  const v = slot.variants.find((x) => x.id === m.variant);
  return v.v[m.rarity];
}

// ----------------------------------------------------------- daily + idle

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function claimDaily(save, now = Date.now()) {
  const k = dayKey(now);
  if (save.lastDaily === k) return 0;
  save.lastDaily = k;
  save.gems += DAILY_GEMS;
  save.stats.gemsEarned += DAILY_GEMS;
  return DAILY_GEMS;
}

export function idleRate(save) {
  return OFFLINE_BASE_RATE + labValue(save, 'idleRate');
}

export function idleCapSec(save) {
  return (OFFLINE_BASE_CAP_H + labValue(save, 'idleCap')) * 3600;
}

// Coins per second of the last few runs, averaged: one lucky run does not
// raise idle income for good.
export function idleCps(save) {
  const r = save.stats.recentCps || [];
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}

// Coins earned while away, based on the recent runs' coins per second.
export function offlineEarnings(save, now = Date.now()) {
  const away = Math.max(0, (now - (save.lastSeen ?? now)) / 1000);
  const cps = idleCps(save);
  if (away < 60 || !cps) return { away, coins: 0, counted: 0 };
  const counted = Math.min(away, idleCapSec(save));
  const coins = Math.floor(counted * cps * idleRate(save));
  return { away, coins, counted };
}

export function applyOffline(save, now = Date.now()) {
  const res = offlineEarnings(save, now);
  if (res.coins > 0) {
    save.coins += res.coins;
    save.stats.coinsEarned += res.coins;
  }
  const labsDone = tickLabs(save, now);
  save.lastSeen = now;
  return { ...res, labsDone };
}

// --------------------------------------------------------------- run end

export function milestoneKey(tier) {
  return 't' + tier;
}

// Rewards for waves reached the first time on a tier. Mutates the save.
export function claimMilestones(save, tier, wave) {
  const key = milestoneKey(tier);
  const claimed = save.milestones[key] || [];
  const got = [];
  for (const m of MILESTONES) {
    if (wave >= m.wave && !claimed.includes(m.wave)) {
      claimed.push(m.wave);
      const gems = Math.round(m.gems * tierReward(tier));
      const stones = Math.round(m.stones * tierReward(tier));
      save.gems += gems;
      save.stones += stones;
      save.stats.gemsEarned += gems;
      got.push({ wave: m.wave, gems, stones });
    }
  }
  save.milestones[key] = claimed;
  return got;
}

export function tierReward(tier) {
  return 1 + TIER_REWARD_STEP * (tier - 1);
}

export function runStones(wave, tier) {
  return Math.floor((wave / 10) * tierReward(tier));
}

// Close a finished run into the save. Returns what the summary screen shows.
export function finishRun(save, result) {
  const { tier, wave, coins, cash, kills, bossKills, simSec, damage, gems = 0, shards = 0 } = result;
  const stones = runStones(wave, tier);
  save.stones += stones;
  save.coins += coins;
  save.gems += gems;
  save.shards += shards;
  save.stats.gemsEarned += gems;
  save.stats.runs++;
  save.stats.kills += kills;
  save.stats.bossKills += bossKills;
  save.stats.coinsEarned += coins;
  save.stats.cashEarned += cash;
  save.stats.damage += damage;
  save.stats.waves += wave;
  if (simSec > 60) {
    const cps = coins / simSec;
    if (cps > save.stats.bestCoinsPerSec) save.stats.bestCoinsPerSec = cps;
    save.stats.recentCps = [...save.stats.recentCps, cps].slice(-IDLE_RUNS);
  }
  const prevBest = save.best[tier] || 0;
  if (wave > prevBest) save.best[tier] = wave;
  const milestones = claimMilestones(save, tier, wave);
  let newTier = 0;
  while (save.tiersUnlocked < TIERS.length && (save.best[save.tiersUnlocked] || 0) >= TIERS[save.tiersUnlocked].unlockWave) {
    save.tiersUnlocked++;
    newTier = save.tiersUnlocked;
  }
  save.run = null;
  return { stones, milestones, newBest: wave > prevBest, newTier };
}

export { STATS, LABS, CARDS, CARD_BY_ID, UWS, MODULE_SLOTS };

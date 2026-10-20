// Everything around the runs that gives a reason to come back: missions, the
// weekly challenge, seasons, card collections, refining, the per-tier records
// and which tabs are open yet. Plain functions over the save, no DOM.

import {
  CARDS, cardStars, CARD_SETS, DAILY_MISSIONS, WEEKLY_MISSIONS, CHALLENGE_MODS, CHALLENGE_REWARDS,
  SEASON_EPOCH, SEASON_DAYS, SEASON_REWARDS, THEMES, TIERS, STAT_BY_ID, REFINE, refinable, wsCost,
  TIER_REWARD_STEP,
} from './data.js';

const DAY = 86400000;

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// The Monday that starts the week, local time.
export function weekKey(now) {
  const d = new Date(now);
  const back = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `w${m.getFullYear()}-${m.getMonth() + 1}-${m.getDate()}`;
}

export function weekEnds(now) {
  const d = new Date(now);
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back + 7).getTime();
}

// A small seeded generator, so the same date gives the same picks everywhere.
function seededPick(key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // mix the hash so keys a few characters apart (one week to the next) start
  // far apart; without this three weeks in a row drew the same modifiers
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistinct(list, n, rand) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);
const tierReward = (tier) => 1 + TIER_REWARD_STEP * (tier - 1);

// ---------------------------------------------------------------- missions

function missionTarget(save, def, weekly) {
  const tier = save.tier;
  const best = save.best[tier] || 0;
  switch (def.kind) {
    case 'reach':
      return { tier, n: weekly ? round5(Math.max(10, best + def.plus)) : round5(Math.max(10, best * 0.85)) };
    case 'kills':
      return { n: Math.round((1000 + 30 * Math.max(...Object.values(save.best), 0)) / 100) * 100 };
    case 'coins':
      return { n: Math.max(500, Math.round(((save.stats.lastRunCoins || 0) * 2) / 100) * 100) };
    default:
      return { n: def.n };
  }
}

function makeMission(save, def, weekly) {
  const t = missionTarget(save, def, weekly);
  const stones = def.stones ? Math.round(def.stones * tierReward(save.tiersUnlocked)) : 0;
  return { kind: def.kind, ...t, have: 0, gems: def.gems, stones, claimed: false };
}

// New missions when the day or the week turns. Returns true if anything changed.
export function ensureMissions(save, now = Date.now()) {
  if (!save.stats.runs) return false;
  const m = save.missions;
  let changed = false;
  const dk = dayKey(now);
  if (m.day !== dk) {
    m.day = dk;
    m.daily = pickDistinct(DAILY_MISSIONS, 3, seededPick('d' + dk)).map((d) => makeMission(save, d, false));
    changed = true;
  }
  const wk = weekKey(now);
  if (m.week !== wk) {
    m.week = wk;
    m.weekly = pickDistinct(WEEKLY_MISSIONS, 2, seededPick(wk)).map((d) => makeMission(save, d, true));
    changed = true;
  }
  return changed;
}

export function missionText(x) {
  switch (x.kind) {
    case 'reach': return `Reach wave ${x.n} on tier ${x.tier}`;
    case 'runs': return `Finish ${x.n} runs`;
    case 'bosses': return `Destroy ${x.n} bosses`;
    case 'kills': return `Destroy ${x.n.toLocaleString('en')} enemies`;
    case 'coins': return `Earn ${x.n.toLocaleString('en')} coins in runs`;
    default: return x.kind;
  }
}

export function missionDone(x) {
  return x.have >= x.n;
}

function progressMission(x, r) {
  if (missionDone(x)) return;
  if (x.kind === 'reach') {
    if (!r.challenge && r.tier === x.tier && r.wave >= x.n) x.have = x.n;
  } else if (x.kind === 'runs') x.have++;
  else if (x.kind === 'bosses') x.have += r.bossKills;
  else if (x.kind === 'kills') x.have += r.kills;
  else if (x.kind === 'coins') x.have += r.coins;
  x.have = Math.min(x.have, x.n);
}

export function claimMission(save, list, i) {
  const x = save.missions[list][i];
  if (!x || x.claimed || !missionDone(x)) return null;
  x.claimed = true;
  save.gems += x.gems;
  save.stones += x.stones;
  save.stats.gemsEarned += x.gems;
  return x;
}

export function missionsWaiting(save) {
  const m = save.missions;
  return [...(m.daily || []), ...(m.weekly || [])].filter((x) => missionDone(x) && !x.claimed).length;
}

// ------------------------------------------------------- weekly challenge

// The challenge is played at the frontier: the highest tier open when the week starts.
export function challengeTier(save) {
  return save.tiersUnlocked;
}

// Offered once the player has three tiers, so it never crowds the first hours.
export function challengeOpen(save) {
  return save.tiersUnlocked >= 3;
}

// This week's challenge, set up the first time it is looked at in the week.
export function ensureChallenge(save, now = Date.now()) {
  const wk = weekKey(now);
  const c = save.challenge;
  if (c.week === wk) return c;
  const mods = pickDistinct(CHALLENGE_MODS, 2, seededPick('c' + wk)).map((m) => m.id);
  save.challenge = { week: wk, mods, tier: challengeTier(save), best: 0, claimed: [] };
  return save.challenge;
}

// The two modifiers folded into one set of multipliers for the run.
export function challengeMods(ids) {
  const out = { hp: 1, dmg: 1, count: 1, ehp: 1, lancers: 1, cash: 1, startCash: 0, speed: 1, bossEvery: 10, range: 1, names: [] };
  for (const id of ids || []) {
    const m = CHALLENGE_MODS.find((x) => x.id === id);
    if (!m) continue;
    out.names.push(m.name);
    for (const k of ['hp', 'dmg', 'count', 'ehp', 'lancers', 'cash', 'speed', 'range']) if (m[k]) out[k] *= m[k];
    if (m.startCash) out.startCash += m.startCash;
    if (m.bossEvery) out.bossEvery = Math.min(out.bossEvery, m.bossEvery);
  }
  return out;
}

export function challengeReward(r, tier) {
  return Math.round(r.stones * tierReward(tier));
}

function closeChallenge(save, r) {
  const c = save.challenge;
  const got = [];
  if (r.week !== c.week) return got; // a run carried over from last week
  if (r.wave > c.best) c.best = r.wave;
  for (const rw of CHALLENGE_REWARDS) {
    if (r.wave >= rw.wave && !c.claimed.includes(rw.wave)) {
      c.claimed.push(rw.wave);
      const stones = challengeReward(rw, c.tier);
      save.stones += stones;
      got.push({ wave: rw.wave, stones });
    }
  }
  return got;
}

// ----------------------------------------------------------------- seasons

export function seasonId(now) {
  return Math.floor((now - SEASON_EPOCH) / (SEASON_DAYS * DAY)) + 1;
}

export function seasonEnds(now) {
  return SEASON_EPOCH + seasonId(now) * SEASON_DAYS * DAY;
}

// The two colours a season hands out (never the default one).
export function seasonThemes(id) {
  const rest = THEMES.slice(1);
  const k = ((id - 1) * 2) % rest.length;
  return [rest[k], rest[(k + 1) % rest.length]];
}

export function ensureSeason(save, now = Date.now()) {
  const id = seasonId(now);
  if (save.season.id !== id) save.season = { id, waves: 0, claimed: [] };
  return save.season;
}

// Reward i of a season: two tower colours, then the season crest.
export function seasonRewardOf(id, i) {
  const th = seasonThemes(id);
  return i < 2 ? { theme: th[i].id, name: th[i].name + ' tower' } : { crest: id, name: `Season ${id} crest` };
}

function closeSeason(save, r, now) {
  const s = ensureSeason(save, now);
  s.waves += r.wave;
  const got = [];
  SEASON_REWARDS.forEach((rw, i) => {
    if (s.waves >= rw.waves && !s.claimed.includes(i)) {
      s.claimed.push(i);
      const it = seasonRewardOf(s.id, i);
      if (it.theme && !save.themes.includes(it.theme)) save.themes.push(it.theme);
      if (it.crest && !save.crests.includes(it.crest)) save.crests.push(it.crest);
      got.push(it);
    }
  });
  return got;
}

// --------------------------------------------------------------- card sets

export function cardSetProgress(save, set) {
  const cards = CARDS.filter((c) => c.rarity === set.rarity);
  const have = cards.filter((c) => cardStars(save.cards[c.id] || 0) >= set.stars).length;
  return { have, of: cards.length, done: have === cards.length };
}

export function cardSetBonus(save, key) {
  let b = 0;
  for (const set of CARD_SETS) if (set[key] && cardSetProgress(save, set).done) b += set[key];
  return b;
}

// ------------------------------------------------------------------ refine

export function refineLevel(save, id) {
  return save.refine[id] || 0;
}

export function canRefine(save, id) {
  const stat = STAT_BY_ID[id];
  return refinable(stat) && (save.ws[id] || 0) >= stat.max && refineLevel(save, id) < REFINE.max;
}

export function refineCost(save, id, discount = 0) {
  const stat = STAT_BY_ID[id];
  return Math.round(wsCost(stat, stat.max - 1, discount) * REFINE.first * REFINE.g ** refineLevel(save, id));
}

export function buyRefine(save, id, discount = 0) {
  if (!canRefine(save, id)) return false;
  const cost = refineCost(save, id, discount);
  if (save.coins < cost) return false;
  save.coins -= cost;
  save.refine[id] = refineLevel(save, id) + 1;
  return true;
}

// ------------------------------------------------------ records and advice

// Best wave per tier and day, for the progress chart. Keeps 90 days.
function recordDay(save, r, now) {
  const k = dayKey(now);
  const day = save.history[k] || (save.history[k] = {});
  if (r.wave > (day[r.tier] || 0)) day[r.tier] = r.wave;
  const keys = Object.keys(save.history);
  if (keys.length > 90) {
    keys.sort((a, b) => new Date(a) - new Date(b));
    for (const old of keys.slice(0, keys.length - 90)) delete save.history[old];
  }
}

// Coins per second of the last five runs on each tier.
function recordTierRate(save, r) {
  if (r.simSec <= 60) return;
  const list = save.tierRates[r.tier] || [];
  save.tierRates[r.tier] = [...list, r.coins / r.simSec].slice(-5);
}

// Which open tier has paid the most coins per minute lately.
export function bestTierForCoins(save) {
  let best = null;
  let tried = 0;
  for (let t = 1; t <= save.tiersUnlocked; t++) {
    const list = save.tierRates[t];
    if (!list || !list.length) continue;
    tried++;
    const cpm = (list.reduce((a, b) => a + b, 0) / list.length) * 60;
    if (!best || cpm > best.cpm) best = { tier: t, cpm };
  }
  return tried >= 2 ? best : null;
}

// --------------------------------------------------------------- the tabs

export function tabOpen(save, id) {
  switch (id) {
    case 'labs': return save.stats.runs > 0 || Object.keys(save.labs).length > 0 || save.research.length > 0;
    case 'ultimates': return save.stones >= 5 || Object.keys(save.uws).length > 0;
    case 'cards': return Object.keys(save.milestones).some((k) => save.milestones[k].length) || Object.keys(save.cards).length > 0;
    case 'modules': return save.tiersUnlocked >= 3 || save.modules.length > 0;
    default: return true;
  }
}

// --------------------------------------------------------------- run end

// Everything a finished run adds around the run itself. Returns what the
// summary screen shows.
export function closeMeta(save, r, now = Date.now()) {
  ensureMissions(save, now);
  for (const x of [...(save.missions.daily || []), ...(save.missions.weekly || [])]) progressMission(x, r);
  const out = { challenge: [], season: [] };
  if (r.challenge) out.challenge = closeChallenge(save, r);
  else {
    recordDay(save, r, now);
    recordTierRate(save, r);
  }
  out.season = closeSeason(save, r, now);
  save.stats.lastRunCoins = r.coins;
  return out;
}

export { TIERS };

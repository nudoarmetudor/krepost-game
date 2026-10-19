// Every number that defines the game lives here: upgrades, enemies, tiers,
// labs, cards, ultimate weapons, perks, modules, milestones.

export const VERSION = 1;

// World geometry, in meters. The tower sits at the origin.
export const WORLD = {
  spawnRadius: 60,
  towerRadius: 4.6,
  waveSeconds: 26,
};

// Fortitude: the walls take at most `cap` of their max health in raw damage per
// second. Defense Absolute comes off each hit before the cap counts it, Defense %
// off what the cap lets through. While more is coming than the cap lets in,
// strain builds and the cap rises by `strain` for every second of it, so a tower
// that is overrun still falls; it relaxes at `relax` seconds per second once the
// pressure is off. Under strain, Regen and Lifesteal together make up at most
// `mend` of what gets through, so walls with little health and a lot of Regen
// cannot outlast the cap. Lifesteal heals at most `lifesteal` × its own
// percentage of max health a second.
export const FORTITUDE = { cap: 0.25, strain: 0.03, relax: 0.5, mend: 0.5, lifesteal: 0.25 };

// ---------------------------------------------------------------- upgrades
// One definition per tower stat. The effective level of a stat during a run
// is workshop level + run level; v(level) gives the stat's value.
// run: cash cost of the n-th in-run level = base * g^n
// ws:  coin cost of the n-th workshop level = base * g^n
// unlock: coins to unlock the stat in the workshop (absent = always open)

export const CATS = [
  { id: 'attack', name: 'Attack', color: '#ff7a59' },
  { id: 'defense', name: 'Defense', color: '#5ab0ff' },
  { id: 'utility', name: 'Utility', color: '#f5c542' },
];

const pct = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';
const num = (x) => (Number.isInteger(x) ? String(x) : x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.round(x).toString());
const mult = (x) => '×' + num(x);
const meters = (x) => num(x) + 'm';
const perSec = (x) => num(x) + '/s';

export const STATS = [
  // attack
  { id: 'damage', cat: 'attack', name: 'Damage', v: (l) => 3 * (1 + 0.2 * l) * 1.013 ** l, max: 6000, run: [4, 1.06], ws: [12, 1.075], f: 'big' },
  { id: 'atkSpeed', cat: 'attack', name: 'Attack Speed', v: (l) => 1 + 0.035 * l, max: 99, run: [6, 1.085], ws: [30, 1.12], f: perSec },
  { id: 'critChance', cat: 'attack', name: 'Critical Chance', v: (l) => 0.005 * l, max: 80, run: [10, 1.1], ws: [40, 1.13], f: pct },
  { id: 'critFactor', cat: 'attack', name: 'Critical Factor', v: (l) => 1.2 + 0.08 * l, max: 150, run: [8, 1.08], ws: [35, 1.10], f: mult },
  { id: 'range', cat: 'attack', name: 'Range', v: (l) => 28 + 0.6 * l, max: 45, run: [10, 1.12], ws: [45, 1.14], f: meters },
  { id: 'dmgPerMeter', cat: 'attack', name: 'Damage / Meter', v: (l) => 0.0006 * l, max: 200, run: [15, 1.075], ws: [60, 1.09], f: (x) => '+' + (x * 100).toFixed(2) + '%/m', unlock: 300, grp: 'dpm' },
  { id: 'msChance', cat: 'attack', name: 'Multishot Chance', v: (l) => 0.01 * l, max: 60, run: [25, 1.10], ws: [80, 1.12], f: pct, unlock: 800, grp: 'multishot' },
  { id: 'msTargets', cat: 'attack', name: 'Multishot Targets', v: (l) => 2 + l, max: 5, run: [400, 3.2], ws: [1500, 3.5], f: num, unlock: 800, grp: 'multishot' },
  { id: 'bounceChance', cat: 'attack', name: 'Bounce Shot Chance', v: (l) => 0.01 * l, max: 60, run: [30, 1.10], ws: [100, 1.12], f: pct, unlock: 3000, grp: 'bounce' },
  { id: 'bounceTargets', cat: 'attack', name: 'Bounce Shot Targets', v: (l) => 1 + l, max: 6, run: [500, 3.0], ws: [2000, 3.3], f: num, unlock: 3000, grp: 'bounce' },

  // defense
  { id: 'health', cat: 'defense', name: 'Health', v: (l) => 12 * (1 + 0.28 * l) * 1.013 ** l, max: 6000, run: [4, 1.06], ws: [12, 1.075], f: 'big' },
  { id: 'regen', cat: 'defense', name: 'Health Regen', v: (l) => 0.05 * l * 1.014 ** l, max: 6000, run: [5, 1.065], ws: [20, 1.08], f: (x) => num(x) + '/s' },
  { id: 'defPct', cat: 'defense', name: 'Defense %', v: (l) => 0.004 * l, max: 160, run: [10, 1.08], ws: [40, 1.095], f: pct },
  { id: 'defAbs', cat: 'defense', name: 'Defense Absolute', v: (l) => 0.4 * l * 1.012 ** l, max: 6000, run: [6, 1.07], ws: [30, 1.08], f: 'big' },
  { id: 'thorns', cat: 'defense', name: 'Thorns (melee)', v: (l) => 0.01 * l, max: 60, run: [15, 1.10], ws: [50, 1.12], f: pct },
  { id: 'lifesteal', cat: 'defense', name: 'Lifesteal', v: (l) => 0.001 * l, max: 120, run: [20, 1.075], ws: [70, 1.09], f: pct, unlock: 600, grp: 'lifesteal' },
  { id: 'kbChance', cat: 'defense', name: 'Knockback Chance', v: (l) => 0.01 * l, max: 50, run: [10, 1.10], ws: [40, 1.12], f: pct },
  { id: 'kbForce', cat: 'defense', name: 'Knockback Force', v: (l) => 1 + 0.12 * l, max: 40, run: [12, 1.11], ws: [45, 1.13], f: meters },
  { id: 'orbs', cat: 'defense', name: 'Orbs', v: (l) => l, max: 4, run: [800, 4.0], ws: [2500, 4.0], f: num, unlock: 1500, grp: 'orbs' },
  { id: 'orbSpeed', cat: 'defense', name: 'Orb Speed', v: (l) => 1.2 + 0.08 * l, max: 30, run: [40, 1.13], ws: [150, 1.15], f: (x) => num(x) + ' rad/s', unlock: 1500, grp: 'orbs' },
  { id: 'swSize', cat: 'defense', name: 'Shockwave Size', v: (l) => (l === 0 ? 0 : 8 + 0.6 * l), max: 40, run: [40, 1.12], ws: [140, 1.14], f: meters, unlock: 2500, grp: 'shockwave' },
  { id: 'swInterval', cat: 'defense', name: 'Shockwave Frequency', v: (l) => 20 - 0.3 * l, max: 40, run: [40, 1.12], ws: [140, 1.14], f: (x) => 'every ' + num(x) + 's', unlock: 2500, grp: 'shockwave' },
  { id: 'mineChance', cat: 'defense', name: 'Land Mine Chance', v: (l) => 0.012 * l, max: 50, run: [45, 1.11], ws: [160, 1.13], f: (x) => pct(x) + '/s', unlock: 4000, grp: 'mines' },
  { id: 'mineDmg', cat: 'defense', name: 'Land Mine Damage', v: (l) => 3 + 0.25 * l, max: 120, run: [40, 1.08], ws: [140, 1.10], f: (x) => mult(x) + ' dmg', unlock: 4000, grp: 'mines' },

  // utility
  { id: 'cashBonus', cat: 'utility', name: 'Cash Bonus', v: (l) => 1 + 0.025 * l, max: 200, run: [6, 1.08], ws: [25, 1.085], f: mult },
  { id: 'cashWave', cat: 'utility', name: 'Cash / Wave', v: (l) => 6 * l * 1.01 ** l, max: 400, run: [6, 1.075], ws: [30, 1.08], f: num },
  { id: 'coinKill', cat: 'utility', name: 'Coins / Kill Bonus', v: (l) => 1 + 0.012 * l, max: 160, run: [15, 1.085], ws: [50, 1.10], f: mult },
  { id: 'coinWave', cat: 'utility', name: 'Coins / Wave', v: (l) => 1 + 0.6 * l, max: 200, run: [12, 1.08], ws: [45, 1.095], f: num },
  { id: 'freeAtk', cat: 'utility', name: 'Free Attack Upgrade', v: (l) => 0.004 * l, max: 100, run: [15, 1.09], ws: [50, 1.10], f: pct },
  { id: 'freeDef', cat: 'utility', name: 'Free Defense Upgrade', v: (l) => 0.004 * l, max: 100, run: [15, 1.09], ws: [50, 1.10], f: pct },
  { id: 'freeUtil', cat: 'utility', name: 'Free Utility Upgrade', v: (l) => 0.004 * l, max: 100, run: [15, 1.09], ws: [50, 1.10], f: pct },
  { id: 'interest', cat: 'utility', name: 'Interest / Wave', v: (l) => 0.005 * l, max: 50, run: [20, 1.10], ws: [70, 1.11], f: pct, unlock: 500, grp: 'interest' },
  { id: 'recovery', cat: 'utility', name: 'Recovery Amount', v: (l) => 0.05 + 0.01 * l, max: 35, run: [20, 1.11], ws: [70, 1.12], f: pct, unlock: 1200, grp: 'packages' },
  { id: 'pkgChance', cat: 'utility', name: 'Package Chance', v: (l) => 0.15 + 0.01 * l, max: 60, run: [20, 1.10], ws: [70, 1.11], f: pct, unlock: 1200, grp: 'packages' },
];

export const STAT_BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s]));

export function runCost(stat, runLevel) {
  return Math.round(stat.run[0] * stat.run[1] ** runLevel);
}

export function wsCost(stat, wsLevel, discount = 0) {
  return Math.round(stat.ws[0] * stat.ws[1] ** wsLevel * (1 - discount));
}

// ----------------------------------------------------------------- enemies
// hp, dmg, speed (m/s), radius (m), cash and coins are per enemy at wave 1, tier 1.
export const ENEMIES = {
  basic: { name: 'Drone', hp: 4, dmg: 1, speed: 5.5, r: 1.65, cash: 2.5, coins: 0.7, color: '#e8eefc', shape: 'square' },
  fast: { name: 'Dart', hp: 2.5, dmg: 0.8, speed: 10, r: 1.35, cash: 3, coins: 0.9, color: '#ffd35a', shape: 'triangle' },
  tank: { name: 'Bastion', hp: 18, dmg: 2.5, speed: 3.2, r: 2.7, cash: 10, coins: 2.4, color: '#ff6b6b', shape: 'square' },
  ranged: { name: 'Lancer', hp: 4, dmg: 1.2, speed: 4.5, r: 1.65, cash: 5, coins: 1.4, color: '#7cf5a8', shape: 'diamond', standoff: 24, standoffTier: 1.3, fireEvery: 1.6 },
  scatter: { name: 'Splitter', hp: 8, dmg: 1, speed: 4.8, r: 2.1, cash: 6.25, coins: 1.6, color: '#c792ff', shape: 'hex', splits: 3 },
  shard: { name: 'Shard', hp: 2, dmg: 0.6, speed: 7, r: 1.05, cash: 1, coins: 0.3, color: '#c792ff', shape: 'triangle' },
  protector: { name: 'Warden', hp: 10, dmg: 1, speed: 4, r: 2.25, cash: 7.5, coins: 2, color: '#6fe7ff', shape: 'ring', aura: 8, shield: 0.5 },
  vampire: { name: 'Leech', hp: 8, dmg: 1.5, speed: 6, r: 1.8, cash: 7.5, coins: 2.2, color: '#ff4fa3', shape: 'diamond', drains: 0.03 },
  // tier 4+: a shield in front soaks the first `guard` hits, however big; many hits beat it
  guarded: { name: 'Phalanx', hp: 14, dmg: 2, speed: 3.8, r: 2.4, cash: 9, coins: 2.2, color: '#a9c1ff', shape: 'shield', guard: 4 },
  // tier 5+: walks to `leapAt` (just outside the base range), gathers itself, then leaps to `leapTo`
  leaper: { name: 'Pouncer', hp: 9, dmg: 2.2, speed: 6, r: 1.8, cash: 8, coins: 2.2, color: '#ffa04d', shape: 'chevron', leapAt: 31, leapTo: 9, leapWind: 0.8 },
  // tier 6+: heals every enemy within `healR` a share of its max health each second
  healer: { name: 'Shepherd', hp: 12, dmg: 1, speed: 4.2, r: 2.1, cash: 9, coins: 2.4, color: '#b6ff8a', shape: 'cross', heals: 0.04, healR: 10 },
  boss: { name: 'Colossus', hp: 60, dmg: 6, speed: 2.4, r: 5.1, cash: 100, coins: 24, color: '#ff3d3d', shape: 'boss', boss: true },
};

// Where a ranged enemy stops: farther out on higher tiers, so Range decides
// whether the tower can answer it.
export function standoffAt(def, tier) {
  return def.standoff ? def.standoff + (def.standoffTier || 0) * (tier - 1) : 0;
}

export function enemyHpScale(wave, tier) {
  const t = TIERS[tier - 1];
  return (1 + 0.1 * wave) * 1.034 ** wave * t.hp;
}

export function enemyDmgScale(wave, tier) {
  const t = TIERS[tier - 1];
  return (1 + 0.08 * wave) * 1.03 ** wave * t.dmg;
}

// The same numbers broken into their parts, for the game and for the stats
// panel alike. Each returns { base, parts: [{ label, op, v }], total }.
function built(base, parts) {
  let total = base;
  for (const pt of parts) total *= pt.v;
  return { base, parts: parts.filter((pt) => pt.v !== 1), total };
}

export function enemyHpAt(def, wave, tier, hpMult = 1) {
  const t = TIERS[tier - 1];
  const parts = [
    { label: `Wave ${wave}`, op: '×', v: enemyHpScale(wave, 1) },
    { label: `Tier ${tier}`, op: '×', v: t.hp },
    { label: 'Perk: Bounty', op: '×', v: hpMult },
  ];
  if (def.boss) parts.push({ label: 'Boss, +15% every 10 waves', op: '×', v: 1 + Math.floor(wave / 10) * 0.15 });
  parts.push({ label: 'First boss, gentler', op: '×', v: firstBoss(def, wave, tier) });
  return built(def.hp, parts);
}

export function enemyDmgAt(def, wave, tier) {
  return built(def.dmg, [
    { label: `Wave ${wave}`, op: '×', v: enemyDmgScale(wave, 1) },
    { label: `Tier ${tier}`, op: '×', v: TIERS[tier - 1].dmg },
    { label: 'First boss, gentler', op: '×', v: firstBoss(def, wave, tier) },
  ]);
}

// The very first boss a player meets teaches rather than ends the run.
export function firstBoss(def, wave, tier) {
  return def.boss && tier === 1 && wave === 10 ? 0.5 : 1;
}

// S: the tower's computed stats (cashMult, coinMult, bossCoinMult)
export function enemyCashAt(def, wave, tier, S, midas = 1) {
  return built(def.cash, [
    { label: `Wave ${wave}`, op: '×', v: 1 + 0.025 * wave },
    { label: 'Your cash bonus', op: '×', v: S.cashMult },
    { label: `Tier ${tier}`, op: '×', v: TIERS[tier - 1].cash },
    { label: 'Midas Keep', op: '×', v: midas },
  ]);
}

export function enemyCoinsAt(def, wave, tier, S, midas = 1) {
  return built(def.coins, [
    { label: `Wave ${wave}`, op: '×', v: 1 + 0.012 * wave },
    { label: 'Your coin bonus', op: '×', v: S.coinMult },
    { label: `Tier ${tier}`, op: '×', v: TIERS[tier - 1].coins },
    { label: 'Midas Keep', op: '×', v: midas },
    { label: 'Module: Harvester', op: '×', v: def.boss ? S.bossCoinMult : 1 },
  ]);
}

export function spawnInterval(wave) {
  return Math.max(0.16, 1.5 * 0.975 ** (wave - 1));
}

// which enemy types can appear at a wave, with weights
export function spawnTable(wave, tier) {
  const t = [['basic', 100]];
  const early = Math.max(0, (tier - 1) * 4);
  if (wave + early >= 4) t.push(['fast', 18 + tier * 2]);
  if (wave + early >= 9) t.push(['tank', 10 + tier * 2]);
  if (wave + early >= 14) t.push(['ranged', 12 + tier]);
  if (wave + early >= 22) t.push(['scatter', 7 + tier]);
  if (wave + early >= 32) t.push(['protector', 4 + tier]);
  if (tier >= 3 && wave >= 20) t.push(['vampire', 3 + tier]);
  if (tier >= 4 && wave >= 15) t.push(['guarded', 2 + tier]);
  if (tier >= 5 && wave >= 25) t.push(['leaper', tier]);
  if (tier >= 6 && wave >= 30) t.push(['healer', tier - 2]);
  return t;
}

// ------------------------------------------------------------------- tiers
// unlockWave: wave to reach on the previous tier to open this one.
export const TIERS = [
  { hp: 1, dmg: 1, cash: 1, coins: 1, unlockWave: 0 },
  { hp: 6, dmg: 4, cash: 1.5, coins: 1.6, unlockWave: 60 },
  { hp: 36, dmg: 16, cash: 2.2, coins: 2.5, unlockWave: 100 },
  { hp: 200, dmg: 64, cash: 3.2, coins: 3.8, unlockWave: 140 },
  { hp: 1100, dmg: 250, cash: 4.5, coins: 5.6, unlockWave: 180 },
  { hp: 6000, dmg: 1000, cash: 6.3, coins: 8.2, unlockWave: 220 },
  { hp: 32000, dmg: 4000, cash: 9, coins: 12, unlockWave: 260 },
  { hp: 170000, dmg: 16000, cash: 12.5, coins: 17.5, unlockWave: 300 },
  { hp: 900000, dmg: 64000, cash: 17.5, coins: 25, unlockWave: 350 },
  { hp: 4800000, dmg: 256000, cash: 24, coins: 36, unlockWave: 400 },
];

// Milestone gems and stones, and the stones a run pays, grow this much per tier.
export const TIER_REWARD_STEP = 0.25;

// -------------------------------------------------------------------- labs
// time: minutes for level n = base * g^n; cost: coins = base * g^n
// per: effect added per level
export const LABS = [
  { id: 'gameSpeed', name: 'Game Speed', desc: 'Raises the fastest game speed by 0.5', per: 0.5, max: 6, time: [20, 1.9], cost: [300, 2.4], f: (x) => '+' + x + '×' },
  { id: 'labSpeed', name: 'Lab Speed', desc: 'Research runs faster', per: 0.04, max: 25, time: [30, 1.18], cost: [400, 1.35], f: pct },
  { id: 'dmg', name: 'Damage', desc: 'Tower damage', per: 0.03, max: 60, time: [10, 1.12], cost: [100, 1.22], f: pct },
  { id: 'atkSpeed', name: 'Attack Speed', desc: 'Tower attack speed', per: 0.02, max: 40, time: [15, 1.14], cost: [150, 1.25], f: pct },
  { id: 'critFactor', name: 'Critical Factor', desc: 'Critical hit multiplier', per: 0.02, max: 40, time: [15, 1.14], cost: [150, 1.25], f: pct },
  { id: 'health', name: 'Health', desc: 'Tower max health', per: 0.03, max: 60, time: [10, 1.12], cost: [100, 1.22], f: pct },
  { id: 'regen', name: 'Health Regen', desc: 'Tower regeneration', per: 0.03, max: 60, time: [10, 1.12], cost: [100, 1.22], f: pct },
  { id: 'defAbs', name: 'Defense Absolute', desc: 'Flat damage blocked', per: 0.03, max: 50, time: [12, 1.13], cost: [120, 1.23], f: pct },
  { id: 'cash', name: 'Cash Bonus', desc: 'Cash from every source', per: 0.03, max: 60, time: [10, 1.12], cost: [100, 1.22], f: pct },
  { id: 'coins', name: 'Coin Bonus', desc: 'Coins from every source', per: 0.03, max: 60, time: [15, 1.14], cost: [200, 1.25], f: pct },
  { id: 'wsAttack', name: 'Workshop Attack Discount', desc: 'Cheaper attack upgrades in the workshop', per: 0.015, max: 25, time: [20, 1.15], cost: [250, 1.28], f: pct },
  { id: 'wsDefense', name: 'Workshop Defense Discount', desc: 'Cheaper defense upgrades in the workshop', per: 0.015, max: 25, time: [20, 1.15], cost: [250, 1.28], f: pct },
  { id: 'wsUtility', name: 'Workshop Utility Discount', desc: 'Cheaper utility upgrades in the workshop', per: 0.015, max: 25, time: [20, 1.15], cost: [250, 1.28], f: pct },
  { id: 'startCash', name: 'Starting Cash', desc: 'Cash at the start of every run', per: 25, max: 40, time: [10, 1.13], cost: [80, 1.24], f: (x) => '+' + x },
  { id: 'interestCap', name: 'Max Interest', desc: 'Raises the cap on interest per wave', per: 0.15, max: 30, time: [20, 1.15], cost: [250, 1.27], f: pct },
  { id: 'perkFreq', name: 'Perk Frequency', desc: 'A perk every fewer waves', per: 0.5, max: 10, time: [60, 1.35], cost: [800, 1.6], f: (x) => '-' + x + ' waves' },
  { id: 'perkChoices', name: 'Perk Choices', desc: 'One more perk to choose from', per: 1, max: 2, time: [240, 3], cost: [5000, 5], f: (x) => '+' + x },
  { id: 'autoPerk', name: 'Auto Perk', desc: 'Picks perks for you, in your priority order', per: 1, max: 1, time: [180, 1], cost: [3000, 1], f: (x) => (x ? 'on' : 'off') },
  { id: 'uwCooldown', name: 'Ultimate Cooldown', desc: 'Ultimate weapons recharge faster', per: 0.015, max: 25, time: [45, 1.2], cost: [600, 1.32], f: pct },
  { id: 'idleRate', name: 'Idle Earnings', desc: 'Coins earned while you are away', per: 0.03, max: 15, time: [30, 1.25], cost: [400, 1.4], f: pct },
  { id: 'idleCap', name: 'Idle Time Cap', desc: 'Longer away time counts towards coins', per: 1, max: 12, time: [30, 1.25], cost: [400, 1.4], f: (x) => '+' + x + 'h' },
  { id: 'shards', name: 'Shard Finder', desc: 'More module shards from bosses', per: 0.1, max: 20, time: [30, 1.2], cost: [500, 1.3], f: pct },
];

export const LAB_BY_ID = Object.fromEntries(LABS.map((l) => [l.id, l]));

export function labTimeSec(lab, level, speedBonus) {
  return (lab.time[0] * lab.time[1] ** level * 60) / (1 + speedBonus);
}

export function labCost(lab, level) {
  return Math.round(lab.cost[0] * lab.cost[1] ** level);
}

export const LAB_SLOT_COSTS = [0, 150, 400, 900, 1800]; // gems; first slot is free

// ------------------------------------------------------------------- cards
// v: value at stars 1..7
export const RARITY = {
  common: { name: 'Common', color: '#9aa6bf', weight: 60 },
  rare: { name: 'Rare', color: '#5ab0ff', weight: 30 },
  epic: { name: 'Epic', color: '#c792ff', weight: 10 },
  legendary: { name: 'Legendary', color: '#ffb547', weight: 0 },
  mythic: { name: 'Mythic', color: '#ff5f7a', weight: 0 },
};

export const CARDS = [
  { id: 'damage', name: 'Sharpened', rarity: 'common', desc: 'Damage +{v}', v: [0.15, 0.25, 0.4, 0.6, 0.85, 1.2, 1.6], f: pct },
  { id: 'atkSpeed', name: 'Quick Hands', rarity: 'common', desc: 'Attack speed +{v}', v: [0.06, 0.1, 0.15, 0.2, 0.27, 0.35, 0.45], f: pct },
  { id: 'health', name: 'Thick Walls', rarity: 'common', desc: 'Max health +{v}', v: [0.2, 0.35, 0.5, 0.75, 1, 1.4, 1.9], f: pct },
  { id: 'regen', name: 'Masonry', rarity: 'common', desc: 'Health regen +{v}', v: [0.25, 0.45, 0.7, 1, 1.4, 1.9, 2.5], f: pct },
  { id: 'cash', name: 'Tax Collector', rarity: 'common', desc: 'Cash +{v}', v: [0.2, 0.35, 0.5, 0.7, 0.95, 1.25, 1.6], f: pct },
  { id: 'packages', name: 'Supply Line', rarity: 'common', desc: 'Package chance +{v}', v: [0.05, 0.08, 0.11, 0.14, 0.18, 0.22, 0.27], f: pct },
  { id: 'coins', name: 'Treasury', rarity: 'rare', desc: 'Coins +{v}', v: [0.15, 0.25, 0.35, 0.5, 0.65, 0.85, 1.1], f: pct },
  { id: 'range', name: 'Watchtower', rarity: 'rare', desc: 'Range +{v}', v: [2, 3, 4, 5, 6, 7, 8], f: (x) => x + 'm' },
  { id: 'crit', name: 'Weak Spot', rarity: 'rare', desc: 'Critical chance +{v}', v: [0.03, 0.05, 0.07, 0.09, 0.11, 0.13, 0.15], f: pct },
  { id: 'slowAura', name: 'Frost Moat', rarity: 'rare', desc: 'Enemies within 15m are {v} slower', v: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4], f: pct },
  { id: 'defense', name: 'Iron Gate', rarity: 'rare', desc: 'Defense % +{v}', v: [0.03, 0.045, 0.06, 0.075, 0.09, 0.105, 0.12], f: pct },
  { id: 'freeUps', name: 'Guild Favor', rarity: 'rare', desc: 'Free upgrade chances +{v}', v: [0.03, 0.05, 0.07, 0.09, 0.11, 0.13, 0.15], f: pct },
  { id: 'enemyBalance', name: 'Crowded Field', rarity: 'rare', desc: '{v} more enemies, and as many more coins', v: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4], f: pct },
  { id: 'extraOrb', name: 'Satellite', rarity: 'epic', desc: '+1 orb, orb speed +{v}', v: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], f: pct },
  { id: 'waveSkip', name: 'Forced March', rarity: 'epic', desc: '{v} chance to skip a wave and keep its rewards', v: [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.19], f: pct },
  { id: 'introSprint', name: 'Head Start', rarity: 'epic', desc: 'Start the run at wave {v}', v: [5, 10, 15, 20, 30, 40, 50], f: (x) => String(x) },
  { id: 'secondWind', name: 'Second Wind', rarity: 'epic', desc: 'Once per run, come back from defeat with {v} health', v: [0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1], f: pct },
  { id: 'shield', name: 'Aegis', rarity: 'epic', desc: 'Blocks one hit every {v}s', v: [12, 10.5, 9, 7.5, 6, 5, 4], f: (x) => String(x) },
  { id: 'berserker', name: 'Last Stand', rarity: 'epic', desc: 'Up to +{v} damage as health drops', v: [0.5, 0.75, 1, 1.4, 1.9, 2.5, 3.2], f: pct },
  { id: 'demon', name: 'Wrath', rarity: 'epic', desc: 'Below 25% health once per run: invulnerable and ×2 damage for {v}s', v: [6, 8, 10, 12, 15, 18, 22], f: (x) => String(x) },
  { id: 'plasma', name: 'Siege Cannon', rarity: 'epic', desc: 'Every 8s, hits the strongest enemy for ×{v} damage', v: [8, 12, 18, 26, 36, 50, 70], f: (x) => String(x) },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// copies owned needed for stars 1..7
export const CARD_STAR_COPIES = [1, 3, 6, 11, 21, 41, 81];
export const CARD_PACK = { one: 20, ten: 180 };
export const CARD_SLOT_COSTS = [0, 0, 40, 80, 140, 220, 320, 450, 600, 800, 1000, 1300]; // gems, slot n

export function cardStars(copies) {
  let s = 0;
  for (const need of CARD_STAR_COPIES) if (copies >= need) s++;
  return s;
}

// --------------------------------------------------------- ultimate weapons
// Each has three upgradeable parameters; cost in stones = base * g^level.
export const UWS = [
  {
    id: 'wave', glyph: '◎', name: 'Annihilation Wave', color: '#ff5f7a',
    desc: 'Rings of force roll out from the tower and crush what they pass.',
    params: [
      { id: 'dmg', name: 'Damage', v: (l) => 8 + 6 * l, max: 30, cost: [3, 1.18], f: (x) => '×' + x + ' damage' },
      { id: 'count', name: 'Rings', v: (l) => 1 + l, max: 4, cost: [25, 2.2], f: (x) => String(x) },
      { id: 'cd', name: 'Cooldown', v: (l) => 80 - 2.5 * l, max: 20, cost: [4, 1.2], f: (x) => x + 's' },
    ],
  },
  {
    id: 'arc', glyph: 'ϟ', name: 'Arc Storm', color: '#7fe3ff',
    desc: 'Shots can call lightning that leaps between enemies.',
    params: [
      { id: 'chance', name: 'Chance', v: (l) => 0.03 + 0.01 * l, max: 22, cost: [4, 1.2], f: pct },
      { id: 'targets', name: 'Targets', v: (l) => 3 + l, max: 7, cost: [12, 1.6], f: (x) => String(x) },
      { id: 'dmg', name: 'Damage', v: (l) => 2 + 1.2 * l, max: 30, cost: [3, 1.18], f: (x) => '×' + x.toFixed(1) },
    ],
  },
  {
    id: 'missiles', glyph: '➶', name: 'Seeker Missiles', color: '#ffb547',
    desc: 'A volley of homing missiles that explode on impact.',
    params: [
      { id: 'dmg', name: 'Damage', v: (l) => 6 + 4 * l, max: 30, cost: [3, 1.18], f: (x) => '×' + x },
      { id: 'count', name: 'Missiles', v: (l) => 3 + l, max: 12, cost: [8, 1.35], f: (x) => String(x) },
      { id: 'cd', name: 'Cooldown', v: (l) => 30 - l, max: 22, cost: [4, 1.22], f: (x) => x + 's' },
    ],
  },
  {
    id: 'singularity', glyph: '◉', name: 'Singularity', color: '#a98bff',
    desc: 'Tears open a void that pulls enemies in and erases them.',
    params: [
      { id: 'size', name: 'Size', v: (l) => 5 + 0.5 * l, max: 16, cost: [6, 1.3], f: meters },
      { id: 'dur', name: 'Duration', v: (l) => 8 + l, max: 20, cost: [5, 1.25], f: (x) => x + 's' },
      { id: 'cd', name: 'Cooldown', v: (l) => 110 - 3.5 * l, max: 20, cost: [5, 1.25], f: (x) => x + 's' },
    ],
  },
  {
    id: 'midas', glyph: '¢', name: 'Midas Keep', color: '#ffd84d',
    desc: 'For a while, every kill pays out much more cash and coins.',
    params: [
      { id: 'bonus', name: 'Bonus', v: (l) => 1.5 + 0.25 * l, max: 20, cost: [5, 1.25], f: (x) => '×' + x },
      { id: 'dur', name: 'Duration', v: (l) => 12 + l, max: 25, cost: [4, 1.2], f: (x) => x + 's' },
      { id: 'cd', name: 'Cooldown', v: (l) => 150 - 4 * l, max: 22, cost: [5, 1.25], f: (x) => x + 's' },
    ],
  },
  {
    id: 'searchlight', glyph: '✷', name: 'Searchlight', color: '#fff3a8',
    desc: 'A sweeping beam; enemies caught in it take extra damage.',
    params: [
      { id: 'bonus', name: 'Damage Bonus', v: (l) => 1.5 + 0.3 * l, max: 30, cost: [4, 1.2], f: (x) => '×' + x.toFixed(1) },
      { id: 'angle', name: 'Angle', v: (l) => 24 + 3 * l, max: 15, cost: [5, 1.25], f: (x) => x + '°' },
      { id: 'beams', name: 'Beams', v: (l) => 1 + l, max: 2, cost: [40, 2.5], f: (x) => String(x) },
    ],
  },
  {
    id: 'timefield', glyph: '⌛', name: 'Time Field', color: '#66ffd1',
    desc: 'Everything inside the field crawls.',
    params: [
      { id: 'slow', name: 'Slow', v: (l) => 0.35 + 0.025 * l, max: 20, cost: [4, 1.22], f: pct },
      { id: 'dur', name: 'Duration', v: (l) => 10 + l, max: 20, cost: [4, 1.22], f: (x) => x + 's' },
      { id: 'cd', name: 'Cooldown', v: (l) => 90 - 3 * l, max: 20, cost: [5, 1.25], f: (x) => x + 's' },
    ],
  },
  {
    id: 'minering', glyph: '✹', name: 'Mine Ring', color: '#ff9b5e',
    desc: 'Plants a ring of heavy mines close to the walls.',
    params: [
      { id: 'dmg', name: 'Damage', v: (l) => 20 + 10 * l, max: 30, cost: [3, 1.18], f: (x) => '×' + x },
      { id: 'count', name: 'Mines', v: (l) => 4 + l, max: 8, cost: [10, 1.45], f: (x) => String(x) },
      { id: 'cd', name: 'Cooldown', v: (l) => 50 - 1.5 * l, max: 20, cost: [4, 1.22], f: (x) => x + 's' },
    ],
  },
  {
    id: 'venom', glyph: '☠', name: 'Venom Marsh', color: '#9dff5e',
    desc: 'Kills can leave a pool that eats a share of enemy health every second.',
    params: [
      { id: 'chance', name: 'Chance', v: (l) => 0.05 + 0.01 * l, max: 20, cost: [4, 1.22], f: pct },
      { id: 'dmg', name: 'Health / s', v: (l) => 0.03 + 0.01 * l, max: 17, cost: [5, 1.25], f: pct },
      { id: 'dur', name: 'Duration', v: (l) => 6 + l, max: 14, cost: [4, 1.22], f: (x) => x + 's' },
    ],
  },
];

// Stones to unlock the n-th ultimate weapon, whichever it is: the player picks the order.
export const UW_UNLOCK_COSTS = [5, 50, 150, 300, 500, 800, 1200, 1700, 2300];

export const UW_BY_ID = Object.fromEntries(UWS.map((u) => [u.id, u]));

export function uwParamCost(param, level) {
  return Math.round(param.cost[0] * param.cost[1] ** level);
}

// ------------------------------------------------------------------- perks
// max: how many times one run can take it. bad: the trade-off side, shown in red.
export const PERKS = [
  { id: 'dmg', name: 'Honed Steel', good: 'Damage ×1.15', max: 6 },
  { id: 'hp', name: 'Reinforced', good: 'Max health ×1.2', max: 6 },
  { id: 'regen', name: 'Mortar', good: 'Health regen ×1.3', max: 6 },
  { id: 'cash', name: 'Levy', good: 'Cash ×1.15', max: 6 },
  { id: 'coins', name: 'Tithe', good: 'Coins ×1.12', max: 6 },
  { id: 'defense', name: 'Bulwark', good: 'Defense % +4%', max: 4 },
  { id: 'lifesteal', name: 'Leeching Bolts', good: 'Lifesteal +1.5%', max: 3 },
  { id: 'uwcd', name: 'Overcharge', good: 'Ultimate cooldowns -8%', max: 4 },
  { id: 'orb', name: 'Extra Orb', good: '+1 orb', max: 2 },
  { id: 'range', name: 'Spyglass', good: 'Range +3m', max: 3 },
  { id: 'freeUps', name: 'Patronage', good: 'Free upgrade chances +5%', max: 3 },
  { id: 'instant', name: 'Windfall', good: 'Cash +(10 waves of cash/wave)', max: 99 },
  { id: 'glass', name: 'Glass Cannon', good: 'Damage ×1.8', bad: 'Max health ×0.6', max: 1 },
  { id: 'swarm', name: 'Swarm', good: 'Coins ×1.5', bad: 'Enemies +50%', max: 1 },
  { id: 'ironskin', name: 'Iron Skin', good: 'Defense % +12%', bad: 'Attack speed ×0.85', max: 1 },
  { id: 'bounty', name: 'Bounty', good: 'Cash ×1.6', bad: 'Enemy health ×1.35', max: 1 },
  { id: 'overclock', name: 'Overclock', good: 'Attack speed ×1.35', bad: 'Health regen ×0.5', max: 1 },
  { id: 'fortify', name: 'Fortify', good: 'Max health ×1.6', bad: 'Damage ×0.8', max: 1 },
];

export const PERK_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));
export const DEFAULT_PERK_ORDER = PERKS.map((p) => p.id);
export const BASE_PERK_INTERVAL = 10;

// ----------------------------------------------------------------- modules
// One equipped module per slot. main: main-stat value by rarity index, grows
// +2% per level. Variants unlock a special effect from Epic up.
export const MODULE_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const MODULE_MAX_LEVEL = [20, 40, 60, 80, 100];

export const MODULE_SLOTS = [
  {
    id: 'cannon', name: 'Cannon', main: 'Damage', mainV: [0.2, 0.45, 0.8, 1.4, 2.4], color: '#ff7a59',
    variants: [
      { id: 'splitter', name: 'Splitter', effect: 'Kills launch {v} extra shots', v: [0, 0, 1, 2, 3] },
      { id: 'overcharge', name: 'Overcharge', effect: 'Every 10th shot deals ×{v}', v: [0, 0, 4, 7, 12] },
      { id: 'piercer', name: 'Piercer', effect: 'Shots pierce {v} enemies', v: [0, 0, 1, 2, 3] },
    ],
  },
  {
    id: 'armor', name: 'Armor', main: 'Health', mainV: [0.2, 0.45, 0.8, 1.4, 2.4], color: '#5ab0ff',
    variants: [
      { id: 'reflector', name: 'Reflector', effect: 'Thorn damage ×{v}', v: [1, 1, 1.5, 2, 3] },
      { id: 'bulwark', name: 'Plated', effect: 'Defense % +{v}', v: [0, 0, 0.05, 0.08, 0.12], pct: true },
      { id: 'mender', name: 'Mender', effect: 'Health regen ×{v}', v: [1, 1, 1.5, 2.2, 3.2] },
    ],
  },
  {
    id: 'generator', name: 'Generator', main: 'Cash & Coins', mainV: [0.08, 0.15, 0.25, 0.4, 0.65], color: '#f5c542',
    variants: [
      { id: 'midaslink', name: 'Midas Link', effect: 'Midas Keep lasts +{v}s', v: [0, 0, 5, 10, 18] },
      { id: 'compound', name: 'Compound', effect: 'Interest cap ×{v}', v: [1, 1, 1.5, 2.2, 3.5] },
      { id: 'harvester', name: 'Harvester', effect: 'Boss coins ×{v}', v: [1, 1, 2, 3, 5] },
    ],
  },
  {
    id: 'core', name: 'Core', main: 'Ultimate Cooldown', mainV: [0.03, 0.06, 0.1, 0.15, 0.22], color: '#c792ff',
    variants: [
      { id: 'storm', name: 'Storm', effect: 'Arc Storm chance +{v}', v: [0, 0, 0.05, 0.1, 0.18], pct: true },
      { id: 'void', name: 'Void', effect: 'Singularity size +{v}m', v: [0, 0, 2, 4, 7] },
      { id: 'tide', name: 'Tide', effect: 'Annihilation Wave +{v} rings', v: [0, 0, 1, 1, 2] },
    ],
  },
];

export const MODULE_SLOT_BY_ID = Object.fromEntries(MODULE_SLOTS.map((m) => [m.id, m]));
export const MODULE_PACK_COST = 60; // gems
export const MODULE_PACK_WEIGHTS = [68, 25, 6, 1, 0];
export const MODULE_MERGE_COUNT = 3; // same slot + variant + rarity -> next rarity
export const MODULE_DISMANTLE = [10, 30, 90, 300, 1000]; // shards back

export function moduleLevelCost(level) {
  return Math.round(8 * 1.09 ** level);
}

// -------------------------------------------------------------- milestones
// First time a wave is reached on a tier. Rewards scale with the tier.
export const MILESTONES = [
  { wave: 10, gems: 3, stones: 0 },
  { wave: 25, gems: 6, stones: 2 },
  { wave: 50, gems: 12, stones: 5 },
  { wave: 75, gems: 18, stones: 8 },
  { wave: 100, gems: 30, stones: 12 },
  { wave: 150, gems: 45, stones: 18 },
  { wave: 200, gems: 70, stones: 25 },
  { wave: 300, gems: 110, stones: 40 },
  { wave: 500, gems: 200, stones: 70 },
  { wave: 1000, gems: 400, stones: 150 },
];

export const DAILY_GEMS = 10;
export const GEM_DROP_EVERY = 600; // seconds of run time between floating gems
export const BOSS_GEM_CHANCE = 0.06;
export const BOSS_MODULE_CHANCE = 0.03;
export const OFFLINE_BASE_RATE = 0.10; // share of recent coins/second earned while away
export const IDLE_RUNS = 5; // idle coins follow the average of this many recent runs
export const OFFLINE_BASE_CAP_H = 12;

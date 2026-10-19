// Boot, navigation, the battle screen and the game loop.

import { app, commit } from './app.js';
import { h, icon, cur, toast, modal, modalOpen } from './dom.js';
import { fmt, fmtInt, fmtClock, fmtTime, setNotation } from './format.js';
import { play, unlockAudio, setSound } from './audio.js';
import { STATS, STAT_BY_ID, CATS, WORLD, PERK_BY_ID, UWS, TIERS } from './data.js';
import { load, applyOffline, claimDaily, finishRun, isUnlocked } from './state.js';
import { Run } from './game.js';
import { Renderer } from './render.js';
import { openStats } from './statspanel.js';
import { runAdvice } from './advisor.js';
import {
  renderTopbar, renderTabs, homeScreen, workshopScreen, labsScreen, cardsScreen, modulesScreen,
  ultimatesScreen, moreScreen, howTo, UW_COLOR,
} from './screens.js';

const STEP = 1 / 60;
const SCREENS = {
  home: homeScreen, workshop: workshopScreen, labs: labsScreen, cards: cardsScreen,
  modules: modulesScreen, ultimates: ultimatesScreen, more: moreScreen, battle: battleScreen,
};

// --------------------------------------------------------------- boot

function boot() {
  app.save = load(localStorage);
  setNotation(app.save.settings.notation);
  setSound(app.save.settings.sound);
  const away = applyOffline(app.save, Date.now());
  const daily = claimDaily(app.save, Date.now());
  commit();

  app.go = go;
  app.refresh = refresh;
  app.startRun = startRun;
  app.continueRun = continueRun;
  app.openStats = openStats;

  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) commit();
    else tick();
  });
  window.addEventListener('pagehide', commit);
  window.addEventListener('resize', () => app.renderer && app.renderer.resize());

  go('home');
  welcome(away, daily);
  setInterval(tick, 1000);
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // A new version takes over in the background; restart into it at the
    // next quiet moment, never in the middle of a battle.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      app.updateReady = true;
      reloadIfQuiet();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function reloadIfQuiet() {
  if (!app.updateReady || app.screen === 'battle' || modalOpen()) return;
  app.updateReady = false;
  commit();
  location.reload();
}

function welcome(away, daily) {
  const s = app.save;
  const parts = [];
  if (away.coins > 0) parts.push(h('div', { class: 'row spread' }, h('span', {}, `Away for ${fmtTime(away.away)}`), cur('coin', '+' + fmt(away.coins))));
  if (away.labsDone && away.labsDone.length) parts.push(h('div', {}, `Research finished: ${away.labsDone.length}`));
  if (daily) parts.push(h('div', { class: 'row spread' }, h('span', {}, 'Daily gems'), cur('gem', '+' + daily)));
  if (!s.seenIntro) {
    s.seenIntro = true;
    commit();
    const close = modal(h('div', { class: 'list' },
      h('div', { style: { width: '96px', height: '96px', margin: '0 auto' }, html: icon('logo').innerHTML }),
      h('h2', {}, 'Krepost'),
      h('p', { class: 'muted', style: { textAlign: 'center', margin: 0 } }, 'Hold the fortress.'),
      howTo(),
      h('button', { class: 'btn primary', onclick: () => close() }, 'Start')));
    return;
  }
  if (!parts.length) return;
  const close = modal(h('div', { class: 'list' }, h('h2', {}, 'Welcome back'), ...parts,
    h('button', { class: 'btn primary', onclick: () => close() }, 'Collect')));
  play('gem');
}

// ---------------------------------------------------------- navigation

function go(screen) {
  if (app.screen === 'battle' && screen !== 'battle') document.body.classList.remove('in-battle');
  app.screen = screen;
  refresh();
  setTimeout(reloadIfQuiet, 400);
}

function refresh() {
  app.live = [];
  const main = document.getElementById('screen');
  const scroll = main.scrollTop;
  const sameScreen = main.dataset.screen === app.screen;
  if (app.screen !== 'battle') {
    renderTopbar();
    renderTabs();
  }
  main.dataset.screen = app.screen;
  main.replaceChildren(SCREENS[app.screen]());
  if (sameScreen) main.scrollTop = scroll;
  else if (main.firstChild && main.firstChild.classList) main.firstChild.classList.add('enter');
  if (app.screen === 'battle' && app.renderer) app.renderer.resize();
}

// Once a second: labs, idle coins, daily gems, autosave.
let saveTick = 0;
function tick() {
  const s = app.save;
  if (!s || document.hidden) return;
  const now = Date.now();
  const away = applyOffline(s, now);
  for (const id of away.labsDone) toast('Research finished');
  const daily = claimDaily(s, now);
  if (away.coins > 0 || daily) welcome(away, daily);
  if (app.screen !== 'battle') {
    renderTopbar();
    if (away.labsDone.length) refresh();
  }
  for (const f of app.live) f();
  if (++saveTick % 10 === 0 || away.labsDone.length) commit();
}

// -------------------------------------------------------------- runs

function startRun() {
  const s = app.save;
  app.run = new Run(s, { tier: s.tier });
  s.run = app.run.snapshot();
  app.paused = false;
  commit();
  enterBattle();
}

function continueRun(abandon = false) {
  const s = app.save;
  if (!s.run) return startRun();
  app.run = new Run(s, { tier: s.run.tier, snapshot: s.run });
  if (abandon) {
    app.run.over = true;
    endRun();
    return;
  }
  app.paused = false;
  enterBattle();
}

function enterBattle() {
  document.body.classList.add('in-battle');
  go('battle');
}

let summaryOpen = false;

function endRun() {
  const run = app.run;
  if (!run) return;
  const res = run.result();
  const fin = finishRun(app.save, res);
  app.run = null;
  commit();
  summaryOpen = true;
  if (app.save.settings.vibrate && navigator.vibrate) navigator.vibrate([60, 40, 120]);

  const srcNames = { tower: 'Tower shots', thorns: 'Thorns', orbs: 'Orbs', shockwave: 'Shockwave', mines: 'Land mines', siege: 'Siege Cannon', arc: 'Arc Storm', missiles: 'Seeker Missiles', wave: 'Annihilation Wave', singularity: 'Singularity', minering: 'Mine Ring', venom: 'Venom Marsh' };
  const total = Object.values(res.damageBySource).reduce((a, b) => a + b, 0) || 1;
  const sources = Object.entries(res.damageBySource).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) =>
    h('div', {}, h('div', { class: 'row spread small' }, h('span', {}, srcNames[k] || k), h('b', {}, fmt(v))),
      h('div', { class: 'bar' }, h('i', { style: { width: ((v / total) * 100).toFixed(1) + '%' } }))));

  const rewards = [
    ['Coins', cur('coin', '+' + fmt(res.coins))],
    ['Stones', cur('stone', '+' + fin.stones)],
  ];
  if (res.gems) rewards.push(['Gems found', cur('gem', '+' + res.gems)]);
  if (res.shards) rewards.push(['Shards', cur('shard', '+' + res.shards)]);
  if (res.modules) rewards.push(['Modules found', String(res.modules)]);
  for (const m of fin.milestones) rewards.push([`Wave ${m.wave} milestone`, h('span', { class: 'row' }, cur('gem', '+' + m.gems), m.stones ? cur('stone', '+' + m.stones) : null)]);

  const close = modal(h('div', { class: 'list' },
    h('h2', {}, fin.newBest ? 'New best!' : 'The walls fell'),
    h('div', { style: { textAlign: 'center', fontSize: '40px', fontWeight: 800 } }, 'Wave ' + res.wave),
    h('div', { class: 'muted small', style: { textAlign: 'center' } }, `Tier ${res.tier} · ${fmtTime(res.simSec)} · ${fmt(res.kills)} enemies · ${res.bossKills} bosses`),
    fin.newTier ? h('div', { class: 'card', style: { textAlign: 'center', borderColor: 'var(--accent)' } }, `Tier ${fin.newTier} is open!`) : null,
    h('div', { class: 'kv' }, rewards.flatMap(([k, v]) => [h('span', {}, k), h('b', {}, v)])),
    sources.length ? h('div', { class: 'sources' }, h('h3', {}, 'Damage'), sources) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn grow', onclick: () => { close(); go('home'); } }, 'Home'),
      h('button', { class: 'btn primary grow', onclick: () => { close(); startRun(); } }, 'Battle again')),
  ), { dismissable: false, onClose: () => { summaryOpen = false; } });
  document.body.classList.remove('in-battle');
  app.screen = 'home';
  refresh();
}

function confirmEnd() {
  const run = app.run;
  if (!run) return;
  const doEnd = () => { run.over = true; endRun(); };
  if (!app.save.settings.confirmEnd) return doEnd();
  const close = modal(h('div', { class: 'list' },
    h('h2', {}, 'End this run?'),
    h('p', { class: 'muted', style: { margin: 0 } }, `You keep ${fmt(run.coins)} coins and the stones for wave ${run.wave}.`),
    h('div', { class: 'row' },
      h('button', { class: 'btn grow', onclick: () => close() }, 'Keep going'),
      h('button', { class: 'btn danger grow', onclick: () => { close(); doEnd(); } }, 'End run'))));
}

function pauseMenu() {
  app.paused = true;
  const close = modal(h('div', { class: 'list' },
    h('h2', {}, 'Paused'),
    h('button', { class: 'btn primary', onclick: () => close() }, 'Resume'),
    h('button', { class: 'btn', onclick: () => { close(); app.paused = false; commit(); document.body.classList.remove('in-battle'); go('home'); } }, 'Leave for now (run is kept)'),
    h('button', { class: 'btn danger', onclick: () => { close(); confirmEnd(); } }, 'End run'),
    h('div', { class: 'toggle' }, h('span', {}, 'Sound'), h('button', { class: 'switch' + (app.save.settings.sound ? ' on' : ''), onclick: (e) => {
      app.save.settings.sound = !app.save.settings.sound;
      setSound(app.save.settings.sound);
      e.currentTarget.classList.toggle('on', app.save.settings.sound);
      commit();
    } })),
  ), { onClose: () => { app.paused = false; } });
}

function perkMenu() {
  const run = app.run;
  if (!run) return;
  const choices = run.openPerk();
  if (!choices) return;
  const close = modal(h('div', { class: 'list' },
    h('h2', {}, 'Choose a perk'),
    run.pendingPerks > 1 ? h('div', { class: 'muted small', style: { textAlign: 'center' } }, `${run.pendingPerks} perks waiting`) : null,
    h('div', { class: 'choices' }, choices.map((id) => {
      const p = PERK_BY_ID[id];
      return h('button', { class: 'choice', onclick: () => {
        run.choosePerk(id);
        close();
        if (run.pendingPerks > 0) setTimeout(perkMenu, 120);
      } }, h('div', { style: { fontWeight: 800 } }, p.name, (run.perks[id] || 0) ? h('span', { class: 'lv' }, ` (have ${run.perks[id]})`) : null),
        h('div', { class: 'good small' }, p.good), p.bad ? h('div', { class: 'bad small' }, p.bad) : null);
    })),
    h('button', { class: 'btn', onclick: () => close() }, 'Later'),
  ));
}

// ------------------------------------------------------- battle screen

let hud = null;

function battleScreen() {
  const run = app.run;
  if (!run) {
    setTimeout(() => go('home'));
    return h('div');
  }
  const canvas = h('canvas', { 'aria-label': 'Battlefield' });
  app.renderer = new Renderer(canvas);
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = app.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
    const b = run.gemBubble;
    if (b && Math.hypot(p.x - b.x, p.y - b.y) < 6) run.collectGem();
  });

  const waveLabel = h('span', { class: 'wave' });
  const waveFill = h('i');
  const timeLabel = h('span', { class: 'small muted' });
  const cashLabel = h('span', { class: 'amt' });
  const speedBtn = h('button', { class: 'btn small speed', onclick: cycleSpeed });
  const pauseBtn = h('button', { class: 'icon-btn', onclick: pauseMenu, 'aria-label': 'Pause' }, icon('pause'));
  const statsBtn = h('button', { class: 'icon-btn', onclick: () => { play('click'); openStats(); }, 'aria-label': 'Stats' }, icon('stats'));
  const banner = h('div', { class: 'banner' });
  const bossName = h('span');
  const bossHp = h('span');
  const bossFill = h('i');
  const bossBar = h('div', { class: 'bossbar', hidden: true }, h('div', { class: 'row spread' }, bossName, bossHp), h('div', { class: 'bar' }, bossFill));
  let shownWave = run.wave;
  const showBanner = (text, boss) => {
    banner.textContent = text;
    banner.className = 'banner' + (boss ? ' boss' : '');
    void banner.offsetWidth; // restart the animation
    banner.classList.add('show');
  };
  const hpText = h('span');
  const hpFill = h('i');
  const coinLabel = h('span', { class: 'amt' });
  const gemLabel = h('span', { class: 'amt' });
  const perkBtn = h('button', { class: 'btn primary small perk-btn', onclick: perkMenu, style: { display: 'none' } }, 'Perk!');
  const uwBox = h('div', { class: 'uws' });
  const uwEls = {};
  for (const uw of UWS) {
    if (!run.S.uw[uw.id]) continue;
    const fill = h('i');
    const el = h('div', { class: 'uw', title: uw.name, style: { color: UW_COLOR[uw.id] } }, fill, h('b', {}, uw.glyph));
    uwEls[uw.id] = { el, fill };
    uwBox.append(el);
  }

  const grid = h('div', { class: 'upg-grid' });
  const tabsBox = h('div', { class: 'ptabs' });
  const panel = h('div', { class: 'panel' }, tabsBox, grid);

  let buttons = [];
  let catSeg = null;
  // Auto Upgrade, once researched: on and off during the run
  const autoBtn = h('button', { class: 'btn small auto-btn', 'aria-label': 'Auto upgrade', onclick: () => {
    app.save.settings.autoBuy = !app.save.settings.autoBuy;
    run.recompute();
    play('click');
    commit();
    updatePanel();
  } });
  const buildPanel = () => {
    const tab = app.ui.runTab;
    const mult = app.ui.runMult;
    catSeg = segEl(CATS.map((c) => [c.id, c.name]), tab, (v) => { app.ui.runTab = v; buildPanel(); });
    tabsBox.replaceChildren(...[
      catSeg,
      segEl([[1, '×1'], [10, '×10'], ['max', 'Max']], mult, (v) => { app.ui.runMult = v; buildPanel(); }, { flex: '0 0 auto' }),
      app.save.labs.autoBuy ? autoBtn : null,
    ].filter(Boolean));
    buttons = [];
    grid.replaceChildren();
    for (const stat of STATS.filter((x) => x.cat === tab && isUnlocked(app.save, x))) {
      const n = h('span', { class: 'n' }, stat.name);
      const v = h('span', { class: 'v' });
      const c = h('span', { class: 'c' });
      const l = h('span', { class: 'l' });
      const buyOnce = () => {
        const want = app.ui.runMult === 'max' ? run.maxAffordable(stat.id) : app.ui.runMult;
        const { bought, free } = run.buy(stat.id, Math.max(1, want));
        if (free) toast(free > 1 ? `${free} free upgrades` : 'Free upgrade!');
        if (bought) {
          flash(b);
          if (app.save.settings.vibrate && navigator.vibrate) navigator.vibrate(8);
          updatePanel();
        } else play('nope');
        return bought;
      };
      const b = h('button', { class: 'upg ' + stat.cat }, h('div', { class: 'in' }, n, v, c), l, h('span', { class: 'bv' }, 'Best value'));
      holdToRepeat(b, buyOnce);
      buttons.push({ stat, b, v, c, l });
      grid.append(b);
    }
    updatePanel();
  };

  const updatePanel = () => {
    const mult = app.ui.runMult;
    // the best value per cash, by the advisor's model: badge it, and dot the
    // category tab that holds it
    const best = runAdvice(run).best;
    if (catSeg) CATS.forEach((cat, i) => catSeg.children[i].classList.toggle('hasbest', best.some((id) => STAT_BY_ID[id].cat === cat.id)));
    autoBtn.textContent = 'Auto';
    autoBtn.setAttribute('aria-pressed', app.save.settings.autoBuy ? 'true' : 'false');
    autoBtn.classList.toggle('primary', !!app.save.settings.autoBuy);
    for (const { stat, b, v, c, l } of buttons) {
      const lvl = Math.min(stat.max, (app.save.ws[stat.id] || 0) + run.runLevel(stat.id));
      const fmtV = (x) => (stat.f === 'big' ? fmt(x) : stat.f(x));
      v.textContent = fmtV(stat.v(lvl));
      l.textContent = run.runLevel(stat.id) ? '+' + run.runLevel(stat.id) : '';
      if (!run.canUpgrade(stat.id)) {
        c.textContent = 'MAX';
        b.className = 'upg max ' + stat.cat;
        b.disabled = true;
        continue;
      }
      let n = mult === 'max' ? Math.max(1, run.maxAffordable(stat.id)) : mult;
      let cost = run.bulkCost(stat.id, n);
      if (cost === Infinity) {
        n = 1;
        cost = run.bulkCost(stat.id, 1);
      }
      c.textContent = '$' + fmt(cost) + (n > 1 ? ` ×${n}` : '');
      const can = run.cash >= cost;
      b.className = 'upg ' + stat.cat + (can ? '' : ' no') + (best.includes(stat.id) ? ' best' : '');
      b.disabled = false;
    }
  };

  hud = () => {
    const S = run.S;
    if (run.wave !== shownWave) {
      shownWave = run.wave;
      if (run.wave % 10 === 0) showBanner(`Wave ${run.wave} · Boss`, true);
      else if (run.wave % 5 === 0) showBanner(`Wave ${run.wave}`, false);
    }
    const boss = run.enemies.find((e) => e.boss && !e.dead);
    bossBar.hidden = !boss;
    if (boss) {
      bossName.textContent = boss.def.name;
      bossHp.textContent = fmt(Math.max(0, boss.hp));
      bossFill.style.width = ((Math.max(0, boss.hp) / boss.maxHp) * 100).toFixed(1) + '%';
    }
    field.classList.toggle('danger', run.hp / S.maxHp < 0.25);
    waveLabel.textContent = 'Wave ' + run.wave;
    waveFill.style.width = ((run.waveTime / WORLD.waveSeconds) * 100).toFixed(1) + '%';
    timeLabel.textContent = fmtClock(run.simTime) + ' · Tier ' + run.tier;
    cashLabel.textContent = '$' + fmt(run.cash);
    hpText.textContent = `${fmt(Math.max(0, run.hp))} / ${fmt(S.maxHp)}`;
    hpFill.style.width = ((Math.max(0, run.hp) / S.maxHp) * 100).toFixed(1) + '%';
    coinLabel.textContent = fmt(run.coins);
    gemLabel.textContent = String(run.gemsFound);
    speedBtn.textContent = '×' + currentSpeed();
    perkBtn.style.display = run.pendingPerks > 0 ? '' : 'none';
    perkBtn.textContent = run.pendingPerks > 1 ? `Perks ×${run.pendingPerks}` : 'Perk!';
    for (const [id, { el, fill }] of Object.entries(uwEls)) {
      const st = run.uw[id];
      const cfg = S.uw[id];
      if (!st || !cfg) continue;
      const frac = cfg.cd ? Math.max(0, Math.min(1, st.cd / cfg.cd)) : 0;
      fill.style.height = (frac * 100).toFixed(0) + '%';
      el.classList.toggle('active', st.active > 0 || (!cfg.cd && true));
    }
    updatePanel();
  };

  const field = h('div', { class: 'field' }, canvas,
    h('div', { class: 'overlay-top' },
      h('div', { class: 'hpbox' }, h('div', { class: 'row spread' }, h('span', {}, 'Walls'), hpText), h('div', { class: 'bar' }, hpFill)),
      h('div', { class: 'runcur' }, cur('coin', coinLabel), cur('gem', gemLabel))),
    bossBar, banner, perkBtn, uwBox);
  const view = h('div', { class: 'battle' },
    h('div', { class: 'hud' },
      pauseBtn, statsBtn,
      h('div', { class: 'stack grow' }, h('div', { class: 'row spread' }, waveLabel, timeLabel), h('div', { class: 'wavebar' }, waveFill)),
      h('span', { class: 'cur chip', style: { color: 'var(--cash)' } }, cashLabel),
      speedBtn),
    field,
    panel,
  );
  buildPanel();
  requestAnimationFrame(() => { app.renderer.resize(); hud(); });
  return view;
}

// Tap buys once; holding keeps buying, faster the longer it is held.
function holdToRepeat(el, fn) {
  let timer = null;
  let repeated = false;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
  };
  const loop = (delay) => {
    timer = setTimeout(() => {
      repeated = true;
      if (!fn()) return stop();
      loop(Math.max(45, delay * 0.82));
    }, delay);
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    repeated = false;
    stop();
    loop(380);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
  el.addEventListener('click', () => {
    if (repeated) {
      repeated = false;
      return;
    }
    fn();
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function segEl(options, value, onpick, style) {
  return h('div', { class: 'seg', style }, options.map(([v, label]) =>
    h('button', { class: v === value ? 'on' : '', onclick: () => { play('click'); onpick(v); } }, label)));
}

function speeds() {
  const max = app.run ? app.run.S.gameSpeedMax : 2;
  const out = [];
  for (let x = 1; x <= max + 1e-9; x += 0.5) out.push(+x.toFixed(1));
  return out;
}

function currentSpeed() {
  const list = speeds();
  const sp = Math.min(app.save.settings.speed || 1, list[list.length - 1]);
  return list.includes(sp) ? sp : 1;
}

function cycleSpeed() {
  const list = speeds();
  const i = list.indexOf(currentSpeed());
  app.save.settings.speed = list[(i + 1) % list.length];
  play('click');
  if (hud) hud();
}

// ---------------------------------------------------------------- loop

let last = performance.now();
let acc = 0;
let hudAcc = 0;

function frame(t) {
  const real = Math.min(0.1, Math.max(0, (t - last) / 1000));
  last = t;
  const run = app.run;
  if (app.screen === 'battle' && run && app.renderer) {
    if (!app.paused && !modalOpen() && !run.over) {
      acc += real * currentSpeed();
      let steps = 0;
      while (acc >= STEP && steps < 400) {
        run.step(STEP);
        acc -= STEP;
        steps++;
        if (run.over) break;
      }
      if (steps >= 400) acc = 0;
      app.save.stats.playSec += real;
    }
    drainSounds(run);
    app.renderer.draw(run, real);
    if (run.waveEnded) {
      run.waveEnded = false;
      commit();
    }
    hudAcc += real;
    if (hud && hudAcc > 0.15) {
      hudAcc = 0;
      hud();
    }
    if (run.over && !summaryOpen) endRun();
  }
  requestAnimationFrame(frame);
}

function drainSounds(run) {
  if (!run.sfx.length) return;
  const seen = new Set(run.sfx);
  run.sfx.length = 0;
  for (const name of seen) play(name);
  if (app.save.settings.vibrate && navigator.vibrate) {
    if (seen.has('boss')) navigator.vibrate(80);
    else if (seen.has('perkReady')) navigator.vibrate(20);
  }
}

boot();

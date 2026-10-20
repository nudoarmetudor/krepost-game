// Opens the game in a phone-sized headless browser, clicks through every
// screen, and saves screenshots.  node tools/smoke.mjs [outdir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] || '/tmp/krepost-shots';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));

await page.goto(url);
await page.waitForTimeout(500);
await shot('01-intro');
await page.click('.modal button:has-text("Start")');
await shot('02-home');
await page.click('button:has-text("BATTLE")');
await page.waitForTimeout(4000);
await shot('03-battle');
for (let i = 0; i < 6; i++) { await page.click('.upg >> nth=0'); await page.waitForTimeout(150); }
await page.click('.seg >> nth=0 >> text=Defense');
await page.waitForTimeout(3000);
await shot('04-battle-defense');
await page.click('[aria-label="Stats"]');
await page.waitForTimeout(300);
await shot('04a-stats-tower');
await page.locator('.srow').first().click({ force: true });
await page.waitForTimeout(200);
await shot('04b-stats-damage-open');
await page.click('.modal .seg >> text=Enemies');
await page.waitForTimeout(200);
await shot('04c-stats-enemies');
await page.click('.modal .ecard .srow.has >> nth=0');
await page.click('.modal button:has-text("+10")');
await page.waitForTimeout(200);
await shot('04d-stats-enemies-wave');
await page.click('[aria-label="Close"]');
// fast-forward the run from the page
await page.evaluate(async () => {
  const { app } = await import('./js/app.js');
  for (let i = 0; i < 60 * 200 && !app.run.over; i++) app.run.step(1 / 60);
});
await page.waitForTimeout(800);
await shot('05-battle-later');
await page.evaluate(async () => {
  const { app } = await import('./js/app.js');
  while (app.run && !app.run.over) app.run.step(1 / 60);
});
await page.waitForTimeout(800);
await shot('06-summary');
await page.click('.modal button:has-text("Home")');
// tabs open in turn: after one run, Workshop and Labs
await page.click('#tabs >> text=Labs');
await page.waitForTimeout(300);
await shot('07-labs-intro');
// a mid-game save opens the rest, the weekly challenge and refining
await page.evaluate(async () => {
  const { app, commit } = await import('./js/app.js');
  const s = app.save;
  s.tiersUnlocked = 6; s.tier = 6; s.best = { 1: 160, 2: 120, 3: 100, 4: 80, 5: 60, 6: 30 };
  s.stones = 60; s.gems = 300; s.coins = 5e6; s.ws.critChance = 80; s.refine = { critChance: 3 };
  s.milestones = { t1: [10, 25, 50, 75, 100] };
  for (const id of ['damage', 'health', 'regen', 'defPct', 'atkSpeed', 'range']) s.ws[id] = Math.max(s.ws[id] || 0, 150);
  s.uws.wave = { on: true, lv: {} };
  s.history = { '2026-10-12': { 5: 30 }, '2026-10-14': { 5: 48 }, '2026-10-16': { 6: 21 }, '2026-10-19': { 6: 30 } };
  commit(); app.go('home');
});
await page.waitForTimeout(300);
await shot('08-home-midgame');
for (const [i, name] of ['Workshop', 'Cards', 'Modules', 'Ultimates'].entries()) {
  await page.click(`#tabs >> text=${name}`);
  await page.waitForTimeout(300);
  await shot(`${String(9 + i).padStart(2, "0")}-${name.toLowerCase()}`);
  await page.click('button:has-text("Got it")', { timeout: 500 }).catch(() => {});
}
await page.click('[aria-label="Settings"]');
await page.waitForTimeout(300);
await shot('13-settings');
// tier 6: Phalanx, Pouncer and Shepherd
await page.click('#tabs >> text=Home');
await page.click('button:has-text("BATTLE")');
await page.evaluate(async () => {
  const { app } = await import('./js/app.js');
  // walls that never fall, so the new enemies pile up where they can be seen
  app.run.S.maxHp = app.run.hp = 1e30;
  for (let i = 0; i < 60 * 600 && !app.run.over && app.run.wave < 32; i++) app.run.step(1 / 60);
});
await page.waitForTimeout(600);
await shot('14-tier6-enemies');

// a save written by version 1, with a run in progress
const old = (await readFile(join(root, 'tests/fixtures/save-v1.json'), 'utf8')).trim();
const page2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
page2.on('pageerror', (e) => errors.push('v1 save: ' + e.message));
await page2.addInitScript((txt) => { if (!sessionStorage.seeded) { localStorage.setItem('krepost-save-v1', txt); sessionStorage.seeded = 1; } }, old);
await page2.goto(url);
await page2.waitForTimeout(500);
await page2.screenshot({ path: `${out}/15-v1-save-home.png` });
await page2.click('.modal button >> nth=-1').catch(() => {});
await page2.click('button:has-text("CONTINUE")');
await page2.waitForTimeout(3000);
await page2.screenshot({ path: `${out}/16-v1-save-battle.png` });
await page2.evaluate(async () => {
  const { app } = await import('./js/app.js');
  for (let i = 0; i < 60 * 40 && !app.run.over; i++) app.run.step(1 / 60);
});
await page2.waitForTimeout(1200);
await page2.screenshot({ path: `${out}/17-v1-save-boss.png` });
await page2.click('[aria-label="Stats"]');
await page2.waitForTimeout(300);
await page2.screenshot({ path: `${out}/18-v1-save-stats.png`, fullPage: false });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
server.close();

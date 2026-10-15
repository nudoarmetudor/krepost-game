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
for (const [i, name] of ['Workshop', 'Labs', 'Cards', 'Modules', 'Ultimates'].entries()) {
  await page.click(`#tabs >> text=${name}`);
  await page.waitForTimeout(300);
  await shot(`0${7 + i}-${name.toLowerCase()}`);
}
await page.click('[aria-label="Settings and stats"]');
await page.waitForTimeout(300);
await shot('12-settings');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
server.close();

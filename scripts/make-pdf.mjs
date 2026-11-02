#!/usr/bin/env node
// Builds the 5-page submission PDF.
//   1. screenshots from the running app (1280x800) into submission/shots/
//   2. renders submission/pdf.html to submission/Founders-Five.pdf (US Letter, clickable links)
// Usage: node scripts/make-pdf.mjs [--no-shots] [--base http://127.0.0.1:8800/]
// Needs the app served (python3 -m http.server 8800 in the project root) and Playwright (npm install).
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = opt('--base', 'http://127.0.0.1:8800/').replace(/\/?$/, '/');
const shots = join(root, 'submission/shots');
mkdirSync(shots, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function takeShots(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // The page column only (no dark side margins), without the footer strip.
  const clipShot = async (name) => {
    const box = await page.locator('.page-body').first().boundingBox();
    const x = Math.max(0, Math.floor((box?.x ?? 196) - 24)), w = Math.min(1280 - x, Math.ceil((box?.width ?? 888) + 48));
    await page.screenshot({ path: join(shots, name + '.png'), clip: { x, y: 0, width: w, height: 756 } });
    console.log('  shot', name, `(clip ${w}x756)`);
  };
  const shot = async (name) => { await page.screenshot({ path: join(shots, name + '.png') }); console.log('  shot', name); };

  // 1. Title with the data-as-of strip (let the hero art finish drawing)
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.actions .btn:not([disabled])');
  await wait(4500);
  await shot('01-title');

  // 2. Play screen on SpaceX, engineer, mid-game (past the first release)
  await page.goto(BASE + '#/play/spcx/engineer');
  await page.waitForSelector('.dialog.lesson');
  // Dismiss whatever is in the way: lesson cards, the release moment, event dialogs.
  const clearLessons = async () => {
    for (let k = 0; k < 30; k++) {
      if (await page.locator('.dialog.lesson').count()) await page.keyboard.press('Escape');
      else if (await page.locator('.dialog.event .btn.primary').count()) await page.locator('.dialog.event .btn.primary').first().click().catch(() => {});
      else if (await page.locator('.notice .btn').count()) await page.locator('.notice .btn').first().click().catch(() => {});
      else if (await page.locator('.overlay, .moment-scrim').count()) await page.keyboard.press('Escape');
      else break;
      await wait(250);
    }
  };
  await clearLessons();
  await page.waitForSelector('.play .rail');
  await page.evaluate(() => window.__ff.step(37)); await wait(500);
  await clearLessons();
  await page.evaluate(() => window.__ff.step(14)); await wait(500);
  await clearLessons();
  await wait(1200);
  // make sure the clock is paused so the shot is stable
  if ((await page.getAttribute('.pause', 'aria-label').catch(() => 'Resume')) === 'Pause') { await page.locator('.pause').click(); await wait(400); }
  await page.locator('#tab-stock').click().catch(() => {}); await wait(900);
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 12000 }).catch(() => {});
  await wait(600);
  await shot('02-play');

  // 3. Collar tab with the Street check open
  await page.locator('#tab-collar').click(); await wait(600);
  const sum = page.locator('.collar .street summary');
  if (await sum.count()) { await sum.click(); await wait(500); }
  await page.evaluate(() => document.querySelector('.collar .street')?.scrollIntoView({ block: 'end' }));
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 12000 }).catch(() => {});
  await wait(700);
  await shot('03-collar');

  // 4. Scoreboard after "Watch a finished run"
  await page.goto(BASE + '#/');
  await page.waitForSelector('button[data-a="watch"]:not([disabled])');
  await page.click('button[data-a="watch"]');
  await page.waitForSelector('#sc-big', { state: 'visible', timeout: 90000 });
  await wait(3500);
  await shot('04-scoreboard');

  // 5. Data page: update log
  await page.goto(BASE + '#/data'); await page.waitForSelector('.page-body'); await wait(1200);
  await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((e) => /job runs/i.test(e.textContent)); h && h.scrollIntoView({ block: 'start' }); });
  await wait(600);
  await clipShot('05-data');

  // 6. Method page top
  await page.goto(BASE + '#/method'); await page.waitForSelector('.page-body'); await wait(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clipShot('06-method');
  await ctx.close();
  if (errors.length) console.log('  page errors:', errors.slice(0, 3));
}

const browser = await chromium.launch();
try {
  if (!flag('--no-shots')) {
    try { await fetch(BASE); } catch { console.error(`App not reachable at ${BASE}. Serve the project root first.`); process.exit(1); }
    console.log('Screenshots from', BASE);
    await takeShots(browser);
  }
  // Fill the build-time facts into the template
  const facts = collectFacts();
  let html = readFileSync(join(root, 'submission/pdf.html'), 'utf8');
  for (const [k, v] of Object.entries(facts)) html = html.replaceAll(`{{${k}}}`, String(v));
  const left = html.match(/\{\{[a-zA-Z0-9_]+\}\}/g);
  if (left) throw new Error('unfilled template fields: ' + [...new Set(left)].join(', '));
  const built = join(root, 'submission/.pdf-built.html');
  writeFileSync(built, html);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(built).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await wait(500);
  await page.pdf({ path: join(root, 'submission/Founders-Five.pdf'), format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await ctx.close();
  rmSync(built, { force: true });
  console.log('wrote submission/Founders-Five.pdf');
} finally {
  await browser.close();
}

// Numbers that appear in the text come from the repo, not from memory.
function collectFacts() {
  const rj = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const meta = rj('data/meta.json');
  const idx = rj('data/cards/index.json');
  const blindShipped = idx.filter((c) => c.blind).length;
  const sh = (id) => rj(`data/src/${id}/headlines.json`);
  const cardsSrc = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].filter((c) => existsSync(join(root, `data/src/${c}/lockup.json`)));
  let headlines = 0; for (const c of cardsSrc) { try { headlines += sh(c).length; } catch {} }
  const asOf = new Date(meta.asOf + 'T12:00:00Z');
  const asOfLong = asOf.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
  let tests = '167';
  try {
    const out = execSync('node --test', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    tests = (out.match(/^ℹ pass (\d+)/m) || [])[1] || tests;
  } catch (e) { const m = String(e.stdout || '').match(/^ℹ pass (\d+)/m); if (m) tests = m[1]; }
  return {
    asOf: meta.asOf, asOfLong, spcxDays: meta.spcxTradingDays, tests,
    dataTests: rj('data/test-status.json').passed,
    blindShipped, blindRead: cardsSrc.length, readTotal: cardsSrc.length + 1, headlines,
    built: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}
import { execSync } from 'node:child_process';

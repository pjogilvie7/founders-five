#!/usr/bin/env node
// Records the demo video: 1280x800, 45 to 60 s, then converts to submission/demo.mp4 (H.264, yuv420p).
//   title (2 s) -> Watch a finished run -> scoreboard (scrolled slowly) -> Play SpaceX as the engineer at 4x
//   (a release moment and one sale) -> Method page.
// Usage: node scripts/record-demo.mjs [--base http://127.0.0.1:8800/]
// Needs the app served and ffmpeg at /Users/pjogilvie/.local/bin/ffmpeg (or on PATH).
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://127.0.0.1:8800/').replace(/\/?$/, '/');
const FFMPEG = existsSync('/Users/pjogilvie/.local/bin/ffmpeg') ? '/Users/pjogilvie/.local/bin/ffmpeg' : 'ffmpeg';
const tmp = join(root, 'submission/.video-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try { await fetch(BASE); } catch { console.error(`App not reachable at ${BASE}`); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: tmp, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const t0 = Date.now();
const mark = (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${m}`);

// Slow human-like cursor so clicks are visible in the video.
await page.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:99999;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(176,138,62,.55);border:2px solid #F1ECDF;pointer-events:none;transition:transform .06s linear';
    document.body.appendChild(d);
    window.addEventListener('mousemove', (e) => { d.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
  });
});
async function clickAt(loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await wait(250);
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await wait(250);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
// Click through whatever is on screen: lesson cards (Next, Got it, Start the clock), the release notice (Continue), event dialogs.
const dismiss = async (pause = 700) => {
  for (let k = 0; k < 24; k++) {
    if (await page.locator('.dialog.lesson .btn.primary').count()) await page.locator('.dialog.lesson .btn.primary').first().click().catch(() => {});
    else if (await page.locator('.dialog.event .btn.primary').count()) await page.locator('.dialog.event .btn.primary').first().click().catch(() => {});
    else if (await page.locator('.notice .btn').count()) await page.locator('.notice .btn').first().click().catch(() => {});
    else break;
    await wait(pause);
  }
};

// 1. Title, 2 s
await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
await page.waitForSelector('button[data-a="watch"]:not([disabled])');
await wait(2000);
mark('title');

// 2. Watch a finished run, wait for the scoreboard
await clickAt(page.locator('button[data-a="watch"]'));
mark('watch clicked');
await page.waitForSelector('#sc-big', { state: 'visible', timeout: 90000 });
mark('scoreboard shown');
await wait(2500);

// 3. Scroll the scoreboard slowly
for (let k = 0; k < 10; k++) {
  await page.mouse.wheel(0, 90);
  await wait(380);
}
mark('scoreboard scrolled');
await wait(800);

// 4. Play SpaceX as the engineer at 4x
await page.goto(BASE + '#/play/spcx/engineer');
await page.waitForSelector('.dialog.lesson');
await wait(1200);
await dismiss(800); // the intro cards, ending on "Start the clock"
await page.waitForSelector('.play .rail');
await wait(600);
await clickAt(page.locator('.speed[data-speed="4"]'));
mark('playing at 4x');
// run until the first release moment (about day 38), cap 25 s
const tPlay = Date.now();
let seenRelease = false;
while (Date.now() - tPlay < 25000) {
  if (await page.locator('.overlay, .notice .btn').count()) { seenRelease = true; break; }
  await wait(150);
}
mark(seenRelease ? 'release moment' : 'no release moment seen');
await wait(2500);
await dismiss(500);
// the clock restarts when the last card closes: pause it straight away so the sale is made on a still screen
if ((await page.getAttribute('.pause', 'aria-label').catch(() => 'Resume')) === 'Pause') await page.locator('.pause').click().catch(() => {});
await wait(500);

// one sale: Stock tab, 20,000 shares
await clickAt(page.locator('#tab-stock'));
await wait(500);
await page.waitForSelector('.stock .fld-in', { state: 'visible', timeout: 5000 }).catch(() => {});
const fld = page.locator('.stock .fld-in').first();
if (await fld.isVisible()) {
  await fld.click({ timeout: 4000 }).catch((e) => console.log('  field click:', String(e).slice(0, 400)));
  await page.keyboard.type('20000', { delay: 120 });
  await wait(900);
  const go = page.locator('.stock .t-go');
  await clickAt(go);
  const stamped = await page.waitForSelector('.stock .t-stamp', { timeout: 5000 }).then(() => true).catch(() => false);
  mark(stamped ? 'sold 20,000 shares' : 'SALE DID NOT REGISTER: ' + (await page.locator('.stock .t-go').innerText().catch(() => '?')));
  await wait(1500);
}
// resume at 4x for a few more seconds
await clickAt(page.locator('.pause'));
await wait(2500);
await dismiss(900);
mark('play done');

// 5. Method page
await page.goto(BASE + '#/method');
await page.waitForSelector('.page-body');
await wait(1500);
for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, 140); await wait(400); }
await wait(1000);
mark('method');

const total = (Date.now() - t0) / 1000;
await ctx.close();
await browser.close();
console.log(`recorded ${total.toFixed(1)} s`);

const webm = readdirSync(tmp).find((f) => f.endsWith('.webm'));
const out = join(root, 'submission/demo.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', join(tmp, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
const mb = statSync(out).size / 1e6;
console.log(`wrote submission/demo.mp4 (${mb.toFixed(1)} MB)`);
if (mb > 15) { console.error('demo.mp4 is over 15 MB'); process.exit(2); }
if (total < 45 || total > 60) console.warn(`NOTE: ${total.toFixed(1)} s is outside the 45 to 60 s target`);

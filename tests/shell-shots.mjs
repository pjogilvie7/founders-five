// Screenshots of the UI shell at 1280x800 and 375x812. Fails on any console error or page error.
// Run: node tests/shell-shots.mjs   (starts `python3 -m http.server 8765` itself if nothing is listening)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.env.OUT || 'tests/out/shell');
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT || 8765);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

// Files other tasks are still writing. A 404 for these is expected today and is reported, not failed.
const OPTIONAL = [/\/ui\/pages\.js/, /\/ui\/tabs\/(stock|plan|collar|credit|cash)\.js/, /\/ui\/chart\.js/, /\/ui\/events\.js/, /\/ui\/scoreboard\.js/, /\/ui\/guilloche\.js/, /\/assets\/art-manifest\.json/, /\/engine\/(sim|bots)\.js/, /\/data\/.*\.json/, /\/assets\//];

let server;
async function up() { try { const r = await fetch(BASE + '/index.html'); return r.ok; } catch { return false; } }
if (!(await up())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let k = 0; k < 40 && !(await up()); k++) await new Promise((r) => setTimeout(r, 100));
}
const hasData = (await fetch(BASE + '/data/meta.json')).ok && (await fetch(BASE + '/data/cards/index.json')).ok;
const hasBlind = hasData && (await (await fetch(BASE + '/data/cards/index.json')).json()).some((c) => c.blind);
const Q = hasData ? '' : '?mock=1';
const QA = Q ? '&' : '?';
console.log(`server ${BASE}  data: ${hasData ? 'real' : 'mock (?mock=1)'}`);

const failures = [], notes = new Set();
const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const shot = async (n) => { await page.screenshot({ path: join(out, `${name}-${n}.png`) }); console.log('  shot', `${name}-${n}.png`); };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && OPTIONAL.some((re) => re.test(url))) { notes.add(url.replace(BASE, '')); return; }
    if (/fonts\.g(oogleapis|static)|cdnjs/.test(url) && /ERR_(INTERNET|NAME|CONNECTION|BLOCKED)/.test(m.text())) { notes.add('offline: ' + url); return; }
    failures.push(`[${name}] console.error: ${m.text()} ${url}`);
  });
  page.on('pageerror', (e) => failures.push(`[${name}] pageerror: ${e.message}`));
  const check = (cond, msg) => { if (!cond) failures.push(`[${name}] ${msg}`); };
  const noOverflow = async (label) => check(await page.evaluate(() => { const w = window.innerWidth + 1; return document.documentElement.scrollWidth <= w && [...document.querySelectorAll('#screen > *, .play, .rail, .paper, .tabbar')].every((e) => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).overflowX !== 'visible' && e.clientWidth <= w); }), `horizontal overflow on ${label}`);

  console.log(name);
  // error + stale states
  await page.goto(`${BASE}/?fail=1#/`); await page.waitForSelector('.alert.err'); await wait(300); await shot('00-title-error');
  await page.goto(`${BASE}/${Q}${QA}now=2026-12-20#/`); await page.waitForSelector('.strip.stale'); await wait(2600); await shot('00-title-stale');
  // title
  await page.goto(`${BASE}/${Q}#/`); await page.waitForSelector('.actions .btn:not([disabled])');
  await wait(400); await shot('01-title-drawing'); await wait(3000); await shot('01-title');
  await noOverflow('title');
  check(/Prices through Fri Oct 30, 2026 close/.test(await page.textContent('#t-strip')), 'data strip text');
  check(/Prices through Oct 30, 2026 close/.test(await page.textContent('.site-foot')), 'footer text');
  // seat
  await page.click('text=Play SpaceX (live)'); await page.waitForSelector('.seats'); await wait(300); await shot('02-seat');
  check(await page.locator('.seat.sealed').count() === 1, 'founder card sealed on SpaceX');
  await noOverflow('seat');
  // intro
  await page.click('[data-seat-go=engineer]'); await page.waitForSelector('.dialog.lesson'); await wait(500); await shot('03-intro');
  // The intro has N cards ("k of N"); Enter advances through all of them.
  const introN = Number(((await page.textContent('.dialog.lesson .lesson-body')).match(/of (\d+)/) || [0, 3])[1]);
  for (let k = 1; k < introN; k++) await page.keyboard.press('Enter');
  check((await page.textContent('.dialog.lesson .lesson-body')).includes(`${introN} of ${introN}`), `intro reached card ${introN} with Enter`);
  await page.keyboard.press('Enter'); await page.waitForSelector('.dialog.lesson', { state: 'detached' });
  // play: the board shows paused after the intro; Space (focus is on the play key) runs it, Space again pauses
  await page.waitForSelector('.play .rail'); await wait(900); await shot('04-play-paused');
  await noOverflow('play');
  check(await page.getAttribute('.pause', 'aria-label') === 'Play', 'the game starts paused after the intro');
  check(/Paused\. Press play/.test(await page.textContent('.clock-note')), 'the paused line is shown');
  const day0 = await page.textContent('.daylabel'); await wait(1500);
  check(await page.textContent('.daylabel') === day0, 'the day does not run while paused');
  await page.keyboard.press('Space'); await wait(250);
  check(await page.getAttribute('.pause', 'aria-label') === 'Pause', 'Space resumes');
  await wait(1400); await shot('04-play-running-1x');
  await page.keyboard.press('Space'); await wait(250);
  check(await page.getAttribute('.pause', 'aria-label') === 'Play', 'Space pauses');
  await page.click('.speed[data-speed="4"]');
  // tabs by keyboard; sealed tab shows its reason
  await page.keyboard.press('3'); await wait(150);
  check(await page.getAttribute('#tab-collar', 'aria-selected') === 'true', 'key 3 selects Collar');
  check((await page.textContent('.panel')).includes('sealed'), 'locked tab shows reason');
  await shot('05-play-sealed-tab');
  await page.keyboard.press('1');
  // run to the first release (day ~38 on SpaceX)
  await page.evaluate(() => { const ff = window.__ff; for (let k = 0; k < 120 && !ff.G.holds.has('notice'); k++) ff.step(1); }); await wait(300); // step to the release itself, not past it
  await page.waitForSelector('.notice .moment', { timeout: 8000 }); await wait(900); await shot('06-play-release');
  check(await page.locator('.seal.broken').count() >= 1, 'a seal is broken after the first release');
  check(await page.locator('.notice').count() === 1 && await page.locator('.dialog.lesson').count() === 0, 'the release card comes first, with no lesson open behind it');
  await page.keyboard.press('Space'); await wait(300); // Continue has focus, so Space presses it
  check(await page.locator('.notice .moment').count() === 0, 'Space dismisses the notice');
  await page.waitForSelector('.dialog.lesson', { timeout: 8000 }); await wait(500); await shot('07-lesson');
  check(/\d tools unlocked/.test(await page.textContent('.dialog.lesson .kicker')), 'one lesson dialog for the tools the release unlocked');
  for (let k = 0; k < 12 && await page.locator('.dialog.lesson').count(); k++) { await page.keyboard.press('Escape'); await wait(250); }
  await wait(600); await shot('07-play-release-closed-paused');
  check(await page.getAttribute('.pause', 'aria-label') === 'Play', 'the clock stays paused after the release card and lesson close');
  await page.keyboard.press('3'); await wait(200); await shot('08-play-collar-open');
  await page.keyboard.press('1');
  // margin call banner
  await page.evaluate(() => window.__ff.inject({ type: 'marginCall', d: window.__ff.G.state.d, pause: true,
    text: 'Maintenance call. Loan-to-value is 37.2%; the limit is 35%. Post $2.4M by Wed Nov 4, or the bank sells about 21,400 shares at that day’s close. The sale is taxable.',
    data: { issuedOn: window.__ff.G.state.d, deadline: '2026-11-04', toPost: 2400000, ltv: 0.372 } }));
  await wait(700); await shot('09-margin-call');
  check(await page.locator('.margin').count() === 1, 'margin banner');
  await noOverflow('margin');
  if (mobile) { await page.click('.rivals-toggle'); await wait(300); await shot('10-rivals-open'); await page.click('.rivals-toggle'); }
  else { await page.click('summary:has-text("Achievements")'); await wait(200); await shot('10-drawer-open'); }
  // watch -> score
  await page.goto(`${BASE}/${Q}#/watch`); await page.waitForSelector('.play.watching'); await wait(1200); await shot('11-watch');
  await page.waitForSelector('.score-ph, .score-wrap > *', { timeout: 20000 }); await wait(600); await shot('12-score');
  // pages fall back gracefully
  await page.goto(`${BASE}/${Q}#/method`); await page.waitForSelector('.page-body'); await wait(500); await shot('13-page-method');
  // blind card path
  await page.goto(`${BASE}/${hasBlind ? Q : '?mock=1'}#/`); await page.waitForSelector('.actions .btn:not([disabled])');
  await page.click('text=Deal a blind IPO'); await page.waitForSelector('.seats'); await wait(300);
  check(await page.locator('.seat.sealed').count() === 0, 'both seats open on a blind card');
  await shot('14-seat-blind');
  // five-year card (mock engine): the house event opens a centered modal with choices
  await page.goto(`${BASE}/?mock=1#/play/c1/engineer`); await page.waitForSelector('.dialog.lesson'); await page.keyboard.press('Escape'); await wait(400);
  await page.evaluate(() => window.__ff.step(400)); await wait(400);
  for (let k = 0; k < 8 && await page.locator('.dialog.lesson').count(); k++) { await page.keyboard.press('Escape'); await wait(300); }
  await page.waitForSelector('.dialog.event', { timeout: 5000 }); await wait(500); await shot('15-house-modal');
  check(await page.locator('.dialog.event .choice .btn').count() === 3, 'house modal has three choices (no skip; decision RUN-6)');
  check(await page.locator('.dialog.event .btn.primary').count() === 0, 'no house choice is primary');
  await page.click('.dialog.event .btn:not([aria-disabled])'); await page.waitForSelector('.dialog.event', { state: 'detached' });
  await wait(300); await shot('16-blind-play');
  check(/Year \d of 5/.test(await page.textContent('.daylabel')), 'five-year day label');
  await ctx.close();
  // reduced motion: draw-in is skipped
  const rm = await browser.newContext({ viewport, reducedMotion: 'reduce' }); const rp = await rm.newPage();
  await rp.goto(`${BASE}/${Q}#/`); await rp.waitForSelector('.medallion path');
  check(await rp.evaluate(() => getComputedStyle(document.querySelector('.medallion path')).strokeDashoffset) === '0px', 'reduced motion: no draw-on line');
  await rm.close();
}

try {
  await session('desktop', { width: 1280, height: 800 }, false);
  await session('phone', { width: 375, height: 812 }, true);
} finally {
  await browser.close();
  server?.kill();
}
if (notes.size) console.log('\nnot yet landed or offline (not counted as failures):\n  ' + [...notes].sort().join('\n  '));
if (failures.length) { console.error('\nFAILURES:\n' + failures.map((f) => '  ' + f).join('\n')); process.exit(1); }
console.log(`\nOK: screenshots in ${out}, zero console errors.`);

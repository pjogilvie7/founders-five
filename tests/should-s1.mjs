// S1 check: percentile histogram, share code and compare runs. Run: node tests/should-s1.mjs
// Finishes the Watch run, waits for the histogram (within 10 s), copies a share code, opens #/code/{code} in a fresh browser
// context and compares the after-tax wealth, then screenshots at 1280x800 and 375x812 into tests/out/should/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests/out/should');
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT || 8774);
const BASE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  FAIL', msg); } else console.log('  ok  ', msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
const up = async () => { try { return (await fetch(BASE + '/index.html')).ok; } catch { return false; } };
if (!(await up())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let k = 0; k < 50 && !(await up()); k++) await wait(100);
}
let browser;
const watchErrors = (page, label) => {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/\/ui\/tabs\/.*\.js/.test(url) && /404/.test(m.text())) return;
    if (/fonts\.g(oogleapis|static)|cdnjs/.test(url)) return;
    failures.push(`${label} console.error: ${m.text()} ${url}`);
  });
  page.on('pageerror', (e) => failures.push(`${label} pageerror: ${e.message}`));
};
const shot = async (page, name) => {
  await page.addStyleTag({ content: '#root{height:auto!important;display:block!important}#screen{overflow:visible!important}' }).catch(() => {});
  await page.screenshot({ path: join(out, name), fullPage: true });
  console.log('  shot', name);
};

try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  watchErrors(page, 'first');

  console.log('Watch run to the scoreboard');
  await page.goto(`${BASE}/#/watch`);
  await page.waitForSelector('.sc[data-watch="true"]', { timeout: 90000 });
  const t0 = Date.now();
  await page.waitForSelector('#sc-pct-body[data-ready="true"]', { timeout: 10000 });
  const ms = Date.now() - t0;
  console.log(`  histogram ready ${ms} ms after the scoreboard appeared`);
  check(ms < 10000, `histogram rendered within 10 s (${ms} ms)`);
  await wait(1800); // entrance animations and the count-up
  const pct = await page.evaluate(() => ({
    svgs: document.querySelectorAll('.sc-pct svg.hg').length,
    bars: document.querySelectorAll('.sc-pct .hg-bar').length,
    marks: [...document.querySelectorAll('.sc-pct svg.hg')].map((s) => s.querySelectorAll('.hg-mark').length),
    line: document.getElementById('sc-pct-line').textContent,
    line2: document.getElementById('sc-pct-line2').textContent,
    tag: (document.querySelector('.sc-pct-tag') || {}).textContent,
    keys: document.querySelectorAll('.sc-pct-key li').length,
    text: document.querySelector('.sc-pct').textContent,
    big: document.getElementById('sc-big').textContent,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  console.log('  line:', pct.line);
  check(pct.svgs === 2, 'two histograms (wealth, Sharpe)');
  check(pct.bars >= 4, `bars drawn (${pct.bars})`);
  check(pct.marks.every((n) => n === 3), `three markers per histogram in watch mode (${pct.marks})`);
  check(/^The Playbook finished ahead of \d+% of 500 random legal strategies on after-tax wealth\.$/.test(pct.line), 'percentile line wording');
  check(pct.tag === '98-day card', `SpaceX label: "${pct.tag}"`);
  check(pct.keys === 3, 'key lists the three bots in watch mode');
  check(!/recommend|!/.test(pct.text), 'no advice wording, no exclamation marks');
  check(!pct.overflow, 'no horizontal overflow at 1280');
  const bigFirst = pct.big;
  const hooks = await page.evaluate(() => [...document.querySelectorAll('[data-hook]')].map((e) => e.dataset.hook + (e.hidden ? ':hidden' : '')));
  check(hooks.length === 2 && hooks.every((h) => !h.endsWith(':hidden')), `both buttons visible: ${hooks}`);

  console.log('Copy share code');
  await page.click('[data-hook="copy-share-code"]');
  await page.waitForFunction(() => /copied|Select the link/.test(document.getElementById('sc-share-note').textContent));
  const link = await page.inputValue('#sc-share-link');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const note = await page.textContent('#sc-share-note');
  console.log('  link:', link.length > 120 ? link.slice(0, 120) + '…' : link, `(${link.length} chars)`);
  check(/#\/code\/[A-Za-z0-9_-]+$/.test(link), 'link has #/code/{code}');
  check(clip === link, 'clipboard holds the link');
  check(/^Link copied/.test(note), `note: ${note}`);
  check(!/!/.test(note), 'no exclamation marks in the note');

  console.log('Compare runs (watch mode saves none)');
  await page.click('[data-hook="compare-runs"]');
  await page.waitForSelector('#sc-compare:not([hidden])');
  check(/does not save it/.test(await page.textContent('#sc-compare')), 'watch mode compare says watching saves nothing');
  await shot(page, 'watch-1280.png');
  await page.screenshot({ path: join(out, 'watch-1280-fold.png') });

  console.log('Open the link in a fresh browser context');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  watchErrors(p2, 'fresh');
  // seed two earlier runs on the same card and seat so Compare has something to show
  await p2.addInitScript(() => {
    if (localStorage.getItem('ff.runs')) return;
    const mk = (n, w, sh, dd, irr) => ({ runId: 'spcx|engineer|' + w + '|' + n, at: Date.now() - n * 86400000 * 3, cardId: 'spcx', seat: 'engineer', blind: false, sharpe: sh, maxDrawdown: dd, irr, afterTaxWealth: w });
    localStorage.setItem('ff.runs', JSON.stringify([mk(2, 78500000, -0.31, -0.082, 0.021), mk(1, 79900000, 0.12, -0.061, 0.044)]));
  });
  await p2.goto(link);
  await p2.waitForSelector('.sc[data-seat]', { timeout: 30000 });
  const big2 = await p2.textContent('#sc-big');
  await wait(1700);
  const big2f = await p2.textContent('#sc-big');
  const dv1 = await page.getAttribute('#sc-big', 'data-value'), dv2 = await p2.getAttribute('#sc-big', 'data-value');
  console.log('  first:', bigFirst, ' shared:', big2f, ' exact values', dv1, dv2);
  check(big2f === bigFirst, `shared run shows the same after-tax wealth (${big2f})`);
  check(dv1 === dv2, 'exact after-tax wealth matches to the cent in the data attribute');
  check(/shared/i.test(await p2.textContent('.sc-head')), 'header says it is a shared run');
  const ls = await p2.evaluate(() => JSON.parse(localStorage.getItem('ff.runs') || '[]').length);
  check(ls === 2, 'opening a shared run does not save it to ff.runs');
  await p2.waitForSelector('#sc-pct-body[data-ready="true"]', { timeout: 10000 });
  check(/^You finished ahead of \d+% of 500 random legal strategies on after-tax wealth\.$/.test(await p2.textContent('#sc-pct-line')), 'shared view percentile line');
  await p2.click('[data-hook="compare-runs"]');
  await p2.waitForSelector('#sc-compare:not([hidden]) .sc-cmp-table');
  const rows = await p2.evaluate(() => [...document.querySelectorAll('.sc-cmp-table tbody tr')].map((r) => ({ cur: r.classList.contains('current'), t: r.textContent.replace(/\s+/g, ' ').trim() })));
  console.log('  compare rows:', rows.map((r) => r.t).join(' | '));
  check(rows.length === 3 && rows[0].cur && rows.filter((r) => r.cur).length === 1, 'compare shows 2 saved runs plus the shared one, current highlighted');
  const hdr = await p2.evaluate(() => [...document.querySelectorAll('.sc-cmp-table thead th')].map((t) => t.textContent));
  check(JSON.stringify(hdr) === JSON.stringify(['Date', 'After-tax wealth', 'Sharpe', 'Max drawdown', 'IRR']), `compare columns: ${hdr}`);
  await shot(p2, 'shared-1280.png');

  console.log('Tampered and cut codes');
  const code = link.split('#/code/')[1];
  const mid = Math.floor(code.length / 2);
  const bad = code.slice(0, mid) + (code[mid] === 'A' ? 'B' : 'A') + code.slice(mid + 1);
  await p2.goto(`${BASE}/#/code/${bad}`);
  await p2.waitForSelector('.page-h', { timeout: 10000 });
  check(/did not open/.test(await p2.textContent('.page-h')) && /does not check out/.test(await p2.textContent('#screen')), 'tampered code is refused with a plain message');

  console.log('Phone layout');
  await p2.goto(link);
  await p2.reload();
  await p2.waitForSelector('#sc-pct-body[data-ready="true"]', { timeout: 15000 });
  await p2.setViewportSize({ width: 375, height: 812 });
  await wait(1500);
  await p2.click('[data-hook="copy-share-code"]').catch(() => {});
  await p2.click('[data-hook="compare-runs"]');
  await wait(400);
  check(!(await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'no horizontal overflow at 375');
  const small = await p2.evaluate(() => {
    const t = document.querySelector('.hg-axis'); const svg = t.closest('svg');
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return { axisPx: parseFloat(getComputedStyle(t).fontSize) * scale, letterPx: parseFloat(getComputedStyle(document.querySelector('.hg-letter')).fontSize) * scale };
  });
  console.log('  rendered axis text px at 375:', small.axisPx.toFixed(1), ' seal letter px:', small.letterPx.toFixed(1));
  check(small.axisPx >= 11.5, 'axis text at least 11.5px on a phone');
  await shot(p2, 'shared-375.png');
  await p2.evaluate(() => document.querySelector('.sc-pct').scrollIntoView());
  await p2.screenshot({ path: join(out, 'pct-375-fold.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await wait(500);
  await shot(page, 'watch-375.png');
} catch (e) {
  failures.push('test crashed: ' + (e && e.stack || e));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
if (failures.length) { console.log('\nFAILURES'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('\nshould-s1: all checks passed');

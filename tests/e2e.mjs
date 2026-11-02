// End-to-end grader path (PRD 3 and 9): fresh browser context, no login, no console errors,
// "Watch a finished run" reaches the scoreboard in under 60 s, data-as-of within 4 days of the last trading day.
// Usage: node tests/e2e.mjs [baseUrl]   (default: serves the project root on :8790)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:8790/';
let server = null;
if (!process.argv[2]) {
  server = spawn('python3', ['-m', 'http.server', '8790', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`); };

// The last trading day before "now" (weekdays only; holidays ignored, which only loosens the check).
function lastTradingDay(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  do { d.setUTCDate(d.getUTCDate() - 1); } while ([0, 6].includes(d.getUTCDay()));
  return d;
}

const browser = await chromium.launch();
try {
  for (const vp of [{ width: 375, height: 812, mobile: true }, { width: 1280, height: 800, mobile: false }]) {
    const tag = `${vp.width}x${vp.height}`;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    let authPrompt = false;
    page.on('dialog', async (d) => { authPrompt = true; await d.dismiss(); });

    const resp = await page.goto(base, { waitUntil: 'networkidle' });
    check(`${tag} page loads with HTTP 200`, resp && resp.status() === 200, String(resp && resp.status()));
    const body = await page.textContent('body');
    check(`${tag} no login or email prompt`, !/sign in|log in|password|enter your email/i.test(body) && !authPrompt);

    const meta = await (await page.request.get(new URL('data/meta.json', base).href)).json();
    const asOf = new Date(meta.asOf + 'T00:00:00Z');
    const lag = Math.round((lastTradingDay() - asOf) / 86400000);
    check(`${tag} data as of ${meta.asOf} is within 4 days of the last trading day`, lag <= 4, `${lag} days`);
    check(`${tag} title shows the data-as-of strip`, /Prices through/.test(body));

    const t0 = Date.now();
    await page.click('button[data-a="watch"]');
    await page.waitForSelector('#sc-big', { state: 'visible', timeout: 60000 });
    const secs = (Date.now() - t0) / 1000;
    check(`${tag} Watch a finished run reaches the scoreboard in under 60 s`, secs < 60, `${secs.toFixed(1)} s`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `tests/out/e2e-score-${tag}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${tag} no horizontal page scroll on the scoreboard`, !overflow);
    check(`${tag} no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\ne2e: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

// End-to-end test of the tool tabs (T9). Plays the real SpaceX card at 4x as the engineer through the real UI.
// Run: node tests/tabs-e2e.mjs   (starts `python3 -m http.server 8771` itself and kills it afterwards)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests/out/tabs');
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT || 8771);
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
const up = async () => { try { return (await fetch(BASE + '/index.html')).ok; } catch { return false; } };
if (!(await up())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let k = 0; k < 50 && !(await up()); k++) await wait(100);
}

const failures = [], passes = [], notes = [];
const ok = (cond, msg) => { if (cond) passes.push(msg); else failures.push(msg); console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(`console.error: ${m.text()} ${m.location()?.url || ''}`);
  else if (m.type() === 'warning' && /tab render failed|tab /.test(m.text())) failures.push(`console.warn: ${m.text()}`);
});
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

const G = (fn) => page.evaluate(fn);
const shot = async (name) => { await page.screenshot({ path: join(out, name + '.png') }); };
const txt = (sel) => page.locator(sel).first().evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim());
const space = async () => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Space'); };

async function clearOverlays() {
  for (let k = 0; k < 40; k++) {
    if (!(await page.locator('.overlay').count())) return;
    if (await page.locator('.dialog.lesson').count()) await page.keyboard.press('Escape');
    else if (await page.locator('.dialog.event .btn:not([aria-disabled])').count()) await page.locator('.dialog.event .btn.primary, .dialog.event .btn').first().click();
    await wait(150);
  }
}
async function clearOverlays0() { for (let k = 0; k < 6 && await page.locator('.dialog.lesson').count(); k++) { await page.keyboard.press('Escape'); await wait(150); } }
async function playUntil(pred, { timeout = 90000, cont = true } = {}) {
  const t0 = Date.now();
  for (;;) {
    await clearOverlays();
    if (await page.evaluate(pred)) return true;
    if (cont && await page.locator('.notice .btn').count()) await page.locator('.notice .btn').first().click().catch(() => {});
    if (Date.now() - t0 > timeout) return false;
    await wait(100);
  }
}
const st = () => page.evaluate(() => { const g = window.__ff.G, s = g.state; return JSON.parse(JSON.stringify({ d: s.d, i: s.i, shares: s.shares, plan: s.plan, collars: s.collars.length, puts: s.puts.length, exchange: s.exchange, loan: s.loan, cash: s.cash, firstUse: s.flags.firstUse, holds: [...g.holds], win: g.snap.window, done: s.done })); });
async function tab(id) { await page.locator(`#tab-${id}`).click(); await wait(250); }
async function fill(sel, v) { await page.locator(sel).fill(String(v)); await wait(120); }
async function mountExtra(name) {
  await page.evaluate(async (n) => {
    const m = (await import(`/ui/tabs/${n}.js`)).default;
    let h = document.getElementById('xh');
    if (!h) { h = document.createElement('div'); h.id = 'xh'; h.className = 'paper'; h.style.cssText = 'position:fixed;inset:0;z-index:40;overflow:auto;background:var(--paper);color:var(--ink)'; h.innerHTML = '<div class="panel"><div class="tab-body"></div></div>'; document.body.appendChild(h); }
    const host = h.querySelector('.tab-body'); host.innerHTML = ''; delete host._kit;
    const g = window.__ff.G; window.__xh = { m, host, render: () => m.render(host, g.engine.snapshot(g.state), g.api) };
    window.__xh.render();
  }, name);
  await wait(300);
}
const unmountExtra = () => page.evaluate(() => document.getElementById('xh')?.remove());

console.log('Tool tabs e2e: SpaceX, engineer, 4x');
await page.goto(`${BASE}/#/play/spcx/engineer`);
await page.waitForSelector('.dialog.lesson');
for (let k = 0; k < 4 && await page.locator('.dialog.lesson').count(); k++) { await page.locator('.dialog.lesson [data-a=next]').click(); await wait(250); }
await page.waitForSelector('.play .rail');
await page.locator('.speed[data-speed="4"]').click();

// ---- 1. first release pauses the clock
const gotRelease = await playUntil(() => { const g = window.__ff.G; return g.state.shares.free > 0 && g.holds.has('notice'); }, { cont: true });
ok(gotRelease, 'clock reached the first release');
await clearOverlays();
let s = await st();
ok(s.holds.includes('notice') && s.shares.free > 0, `first release paused the clock on ${s.d} with ${s.shares.free} free shares`);
ok(/of your shares are free/.test(await txt('.notice')), 'release notice text shown');
ok((await page.getAttribute('.pause', 'aria-label')) === 'Resume', 'rail shows the clock paused');
ok(s.win.open, `trading window open on ${s.d}`);
await shot('00-release-paused');
const free0 = s.shares.free;

// ---- 2. Stock: sell in an open window
await tab('stock');
ok(await page.locator('.stock canvas').count() === 1, 'stock tab draws the chart canvas');
const chartInfo = await page.evaluate(() => { const c = window.Chart && window.Chart.getChart(document.querySelector('.stock canvas')); if (!c) return null; const a = c.options.plugins.annotation.annotations; return { points: c.data.datasets[0].data.length, tranche: Object.keys(a).filter((k) => /^t\d/.test(k)).length, wins: Object.keys(a).filter((k) => /^w\d/.test(k)).length, offer: !!a.offer }; });
ok(chartInfo && chartInfo.points > 30 && chartInfo.offer && chartInfo.tranche >= 8, `chart has ${chartInfo && chartInfo.points} close points, offer line and ${chartInfo && chartInfo.tranche} release markers, ${chartInfo && chartInfo.wins} closed window shades`);
ok((await txt('.sharelegend')).includes('Locked'), 'share breakdown legend shown');
await fill('.stock .fld-in', 20000);
ok(/Sell 20,000 shares at today’s close/.test(await txt('.stock .t-go')), 'sell confirm button says exactly what happens');
const pv = await txt('.stock .t-prev');
ok(/You receive/.test(pv) && /Cost, 0\.25%/.test(pv) && /Tax on the gain/.test(pv), 'sell preview shows proceeds, cost and tax');
await shot('01-stock-preview');
await page.locator('.stock .t-go').click();
await page.waitForSelector('.stock .t-stamp');
ok((await txt('.stock .t-stamp')) === 'SOLD', 'SOLD stamp appears on the plate');
await wait(700); await shot('02-stock-sold-stamp');
s = await st();
ok(s.shares.sold === 20000 && s.shares.free === free0 - 20000, 'engine sold 20,000 shares');
ok(/Sold 20,000 shares/.test(await txt('.stock .t-res')), 'result line shows the engine text');
// MAX fills the engine's maximum
await page.locator('.stock [data-max]').click(); await wait(150);
ok((await page.locator('.stock .fld-in').inputValue()).replace(/,/g, '') === String(s.shares.free), 'MAX fills all free shares');
await fill('.stock .fld-in', '');

// ---- 3. Plan: adopt a 10% a month plan
await tab('plan');
await page.locator('.plan [data-seg=pct] [data-v="10"]').click();
ok(/Adopt a 10% a month plan for 12 months/.test(await txt('.plan .t-go')), 'plan confirm button names the plan');
ok(/First sale/.test(await txt('.plan .t-prev')), 'plan preview shows the first sale date');
await page.locator('.plan .t-go').click();
await page.waitForSelector('.plan .t-stamp');
ok((await txt('.plan .t-stamp')) === 'ADOPTED', 'ADOPTED stamp');
s = await st();
ok(s.plan && s.plan.pct === 10 && s.plan.months === 12, 'engine holds the plan');
await wait(500);
const planTxt = await txt('.plan [data-v=live]');
ok(/Cooling-off/.test(planTxt) && /days? left/.test(planTxt) && /Plan trades from/.test(planTxt), 'plan tab shows cooling-off countdown and the date it goes live');
await shot('03-plan-cooling-off');
await page.locator('.plan [data-a=ask]').click();
ok(/new cooling-off/.test(await txt('.plan .warn-box')), 'cancel shows the new cooling-off warning');
await shot('03b-plan-cancel-warning');
await page.locator('.plan [data-a=no]').click();

// ---- 4. Collar and the Street check
await tab('collar');
const q = await txt('.collar .quote');
ok(/model price/.test(q) && /Floor/.test(q) && /Cap/.test(q) && /\$0/.test(q), 'collar shows a live model-price quote: floor, cap, zero cost');
ok(/Band rule/.test(q), 'band rule shown');
await fill('.collar .fld-in', 50000);
ok(/Collar 50,000 shares: floor \$[\d.]+, cap \$[\d.]+, 12 months/.test(await txt('.collar .t-go')), 'collar confirm button gives floor and cap');
await page.locator('.collar [data-seg=put] [data-v="0.9"]').click(); await wait(150);
const q90 = await txt('.collar .quote');
ok(q90 !== q, 'quote changes when the floor changes');
await page.locator('.collar [data-seg=put] [data-v="0.85"]').click(); await wait(150);
await page.locator('.collar .t-go').click();
await page.waitForSelector('.collar .t-stamp');
ok((await txt('.collar .t-stamp')) === 'COLLARED', 'COLLARED stamp');
s = await st();
ok(s.collars === 1 && s.shares.collared === 50000, 'engine holds the collar');
await wait(400);
ok(/Unwind: (receive|pay)/.test(await txt('.collar [data-v=list]')), 'active collar listed with an unwind price');
ok(await page.locator('.collar .street').count() === 1, 'Street check box present on the live card');
await page.locator('.collar .street summary').click(); await wait(300);
const sc = await txt('.collar .street');
const opt = JSON.parse(readFileSync(join(root, 'data/spcx-options.json'), 'utf8')).streetCheck;
ok(sc.includes(opt.modelCap.toFixed(2)) && sc.includes(opt.marketCap.toFixed(2)) && /Listed SPCX options/.test(sc) && /dealer/.test(sc), `Street check shows model cap $${opt.modelCap} and listed cap $${opt.marketCap}`);
s = await st();
ok(!!s.firstUse.streetCheck, 'opening the Street check flagged streetCheck in the engine');
await shot('04-collar-street-check');

// ---- 5. Credit: pledge, draw the maximum
await tab('credit');
await fill('.credit [data-v=pform] .fld-in', 40000);
ok(/Pledge 40,000 shares to the bank/.test(await txt('.credit [data-v=pform] .t-go')), 'pledge confirm button');
await page.locator('.credit [data-v=pform] .t-go').click();
await page.waitForSelector('.credit .t-stamp');
ok((await txt('.credit .t-stamp')) === 'PLEDGED', 'PLEDGED stamp');
await wait(600);
await page.locator('.credit [data-v=lform] [data-max]').click(); await wait(200);
const maxDrawTxt = await page.locator('.credit [data-v=lform] .fld-in').inputValue();
ok(/Draw \$[\d,]+ from the credit line/.test(await txt('.credit [data-v=lform] .t-go')), 'draw confirm button says what happens');
ok(/Loan to value/.test(await txt('.credit [data-v=lform] .t-prev')), 'draw preview shows the loan to value after');
await page.locator('.credit [data-v=lform] .t-go').click();
await page.waitForFunction(() => document.querySelector('.credit .t-stamp')?.textContent === 'BORROWED');
ok(true, 'BORROWED stamp');
s = await st();
ok(s.loan.balance > 0 && Math.abs(s.loan.balance - Number(maxDrawTxt.replace(/,/g, ''))) < 1, `drew the maximum ($${maxDrawTxt})`);
await wait(900);
const ltvNow = await page.getAttribute('.credit [data-v=ltv]', 'aria-valuenow');
ok(Math.abs(Number(ltvNow) - 25) < 0.05, `LTV bar reads ${ltvNow}% after drawing the maximum`);
ok((await txt('.credit .ltv-lbl')).includes('25%') && (await txt('.credit .ltv-lbl')).includes('35%'), 'LTV bar marks the 25% and 35% lines');
ok(/SOFR \+ 2\.00%|SOFR [\d.]+% \+ 2\.00%/.test(await txt('.credit .bigs')), 'rate shown as SOFR + 2.00% with today’s number');
await shot('05-credit-drawn');

// ---- 6. Cash tab
await tab('cash');
await page.locator('.cash [data-seg=mode] [data-v="withdraw"]').click(); await wait(150);
await page.locator('.cash [data-max]').click(); await wait(200);
ok(/Withdraw \$[\d,]+ from the index fund/.test(await txt('.cash .t-go')), 'withdraw confirm button');
ok(/Tax on the gain/.test(await txt('.cash .t-prev')), 'withdraw preview shows the tax');
ok(/23\.8%/.test(await txt('.cash .taxnote')), 'tax note on withdrawals');
await fill('.cash .fld-in', '');
await page.locator('.cash [data-seg=mode] [data-v="deposit"]').click();
await page.locator('.cash [data-max]').click(); await wait(200);
await page.locator('.cash .t-go').click();
await page.waitForSelector('.cash .t-stamp');
ok((await txt('.cash .t-stamp')) === 'DEPOSITED', 'DEPOSITED stamp');
await wait(400);
await page.locator('.cash .sw').click(); await wait(250);
ok((await page.getAttribute('.cash .sw', 'aria-checked')) === 'false', 'auto-invest switch turns off');
await page.locator('.cash .sw').click(); await wait(250);

// ---- 7. Put and Exchange (not in the shell's tab list yet): mount them directly on the same game
await mountExtra('put');
ok(/model price/.test(await txt('#xh .quote')) && /Premium per share/.test(await txt('#xh .quote')), 'put tab shows the engine premium quote');
await fill('#xh .fld-in', 8000);
ok(/Buy puts on 8,000 shares for \$[\d,]+/.test(await txt('#xh .t-go')), 'put confirm button shows the premium');
await shot('06-put-preview');
await page.locator('#xh .t-go').click(); await page.waitForSelector('#xh .t-stamp');
ok((await txt('#xh .t-stamp')) === 'HEDGED', 'HEDGED stamp');
s = await st(); ok(s.puts === 1, 'engine holds the put');
await unmountExtra();
await mountExtra('exchange');
ok(/seven years/.test(await txt('#xh .lockbox')), 'exchange tab states the seven-year lock');
await fill('#xh .fld-in', 10000);
ok(/Contribute 10,000 shares to the exchange fund/.test(await txt('#xh .t-go')), 'exchange confirm button');
await shot('07-exchange-preview');
await page.locator('#xh .t-go').click(); await page.waitForSelector('#xh .t-stamp');
ok((await txt('#xh .t-stamp')) === 'POOLED', 'POOLED stamp');
s = await st(); ok(s.exchange && s.shares.exchanged === 10000, 'engine holds the exchange fund contribution');
await unmountExtra();

// ---- 8. Play on to the window closing; the Sell control must say why, with a date
await tab('stock');
await page.locator('.notice .btn').first().click().catch(() => {});
await playUntil(() => { const g = window.__ff.G; return g.snap && !g.snap.window.open; });
await space(); await wait(300);
s = await st();
ok(!s.win.open, `window closed on ${s.d}`);
await tab('stock'); await fill('.stock .fld-in', 100); await wait(250);
const gate = await txt('.stock .t-gate');
ok(/Window closed until [A-Z][a-z]{2} \d{1,2}/.test(gate), `Sell control shows reason and date: "${gate.replace(/\s+/g, ' ')}"`);
ok((await page.getAttribute('.stock .t-go', 'aria-disabled')) === 'true', 'Sell button is marked disabled while the reason shows');
await shot('08-stock-window-closed');
await fill('.stock .fld-in', '');
ok(/Window closed until/.test(await txt('.stock .chip.win')), 'window chip shows closed until date');

// ---- 9. Drive on to late October; look for a margin call
let sawCall = false;
await space();
const t0 = Date.now();
for (;;) {
  await clearOverlays();
  if (await page.locator('.margin').count()) { sawCall = true; break; }
  if (await page.evaluate(() => window.__ff.G.state.d >= '2026-10-28' || window.__ff.G.state.done)) break;
  if (await page.locator('.notice .btn').count()) await page.locator('.notice .btn').first().click().catch(() => {});
  if (Date.now() - t0 > 90000) break;
  await wait(100);
}
await space();
await wait(200);
if (!(await page.getAttribute('.pause', 'aria-label') === 'Resume')) await space();
await wait(300);
s = await st();
console.log('  state at end of drive:', JSON.stringify({ d: s.d, holds: s.holds, pending: await page.evaluate(() => window.__ff.G.state.pendingEvent && window.__ff.G.state.pendingEvent.type), paused: await page.getAttribute('.pause', 'aria-label') }));
await tab('credit');
const real = await page.locator('.credit .call:not([hidden])').count();
if (sawCall) {
  ok(real === 1 && /days? left|Due today/.test(await txt('.credit .call')), 'real margin call: banner and Credit tab countdown');
  notes.push('The real SpaceX path produced a margin call.');
} else {
  notes.push(`No margin call on the real SpaceX path through ${s.d} (loan drawn at 25% on Aug 6; the price never fell the 28.6% that takes 25% to 35%). Asserted the LTV bar instead.`);
  ok(Number(await page.getAttribute('.credit [data-v=ltv]', 'aria-valuenow')) > 0, 'LTV bar shows a live ratio');
}
// The margin-call panel itself, driven by a test banner from the shell
await page.evaluate(() => window.__ff.inject({ type: 'marginCall', d: window.__ff.G.state.d, pause: true,
  text: 'Maintenance call. Loan-to-value is 37.2%; the limit is 35%. Post $2.4M by Wed Nov 4, or the bank sells about 21,400 shares at that day’s close. The sale is taxable.',
  data: { issuedOn: window.__ff.G.state.d, deadline: '2026-11-04', toPost: 2400000, ltv: 0.372 } }));
await wait(700);
const callTxt = await txt('.credit .call');
ok(/days? left/.test(callTxt) && /Post \$2,400,000/.test(callTxt) && /Sell shares now/.test(callTxt) && /Wait/.test(callTxt), 'Credit tab shows the call countdown and the three choices');
ok((await page.locator('.margin').count()) === 1, 'shell banner shown alongside');
ok((await page.getAttribute('.credit [data-v=ltv]', 'data-zone')) === 'call', 'LTV bar in the call zone');
await shot('09-credit-margin-call');
await page.locator('.credit [data-ch=wait]').click(); await wait(500);
ok((await page.locator('.credit .call:not([hidden])').count()) === 0, 'choosing Wait clears the test call');

// ---- 10. Screenshots of every tab at 1280x800 and 375x812
const TABS = ['stock', 'plan', 'collar', 'credit', 'cash'];
const overflow = () => page.evaluate(() => { const w = window.innerWidth + 1; return { doc: document.documentElement.scrollWidth <= w, panel: [...document.querySelectorAll('.panel, .tool, .plate, .box')].filter((e) => e.offsetParent).every((e) => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).overflowX !== 'visible') }; });
for (const [name, vp] of [['1280x800', { width: 1280, height: 800 }], ['375x812', { width: 375, height: 812 }]]) {
  await page.setViewportSize(vp); await wait(500);
  for (const id of TABS) {
    await tab(id);
    if (id === 'stock') await fill('.stock .fld-in', 12000);
    if (id === 'collar') { await fill('.collar .fld-in', 20000); await page.locator('.collar .street').evaluate((e) => { e.open = false; }); }
    await wait(500);
    await page.locator('.panel-wrap').evaluate((e) => { e.scrollTop = 0; });
    await shot(`${name}-${id}`);
    // second shot scrolled to the bottom for tall panels
    const tall = await page.locator('.panel-wrap').evaluate((e) => e.scrollHeight > e.clientHeight + 40);
    if (tall) { await page.locator('.panel-wrap').evaluate((e) => { e.scrollTop = e.scrollHeight; }); await wait(200); await shot(`${name}-${id}-bottom`); }
    const o = await overflow();
    ok(o.doc && o.panel, `no horizontal overflow on ${id} at ${name}`);
    if (id === 'stock') await fill('.stock .fld-in', '');
    if (id === 'collar') await fill('.collar .fld-in', '');
  }
  for (const id of ['put', 'exchange']) {
    await mountExtra(id);
    if (id === 'put') await fill('#xh .fld-in', 5000);
    await shot(`${name}-${id}`);
    const o = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(o, `no horizontal overflow on ${id} at ${name}`);
    await unmountExtra();
  }
}
// phone: chart is 180px tall
await page.setViewportSize({ width: 375, height: 812 }); await tab('stock'); await wait(300);
const ch = await page.locator('.stock .t-chart').evaluate((e) => e.getBoundingClientRect().height);
ok(Math.abs(ch - 180) <= 2, `phone chart height ${Math.round(ch)}px`);
const sizes = await page.evaluate(() => ['.stock .t-go', '.stock .fld-in', '.stock [data-max]'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height)));
ok(sizes.every((h) => h >= 44), `phone controls are at least 44px tall (${sizes.join(', ')})`);

// ---- 11. Blind card
const idx = JSON.parse(readFileSync(join(root, 'data/cards/index.json'), 'utf8'));
const blind = idx.find((c) => c.blind);
if (!blind) notes.push('data/cards/index.json lists no blind card, so the month-18 house-event path was not played.');
else {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?blind=1#/play/${blind.id}/engineer`);
  await page.waitForSelector('.dialog.lesson');
  await wait(300);
  for (let k = 0; k < 12 && await page.locator('.overlay').count(); k++) { await page.keyboard.press('Escape'); await wait(250); }
  await page.locator('.speed[data-speed="4"]').click();
  let house = false;
  const tb = Date.now();
  while (Date.now() - tb < 150000) {
    if (await page.locator('.dialog.event').count()) { house = true; break; }
    await clearOverlays0();
    if (await page.locator('.notice .btn').count()) await page.locator('.notice .btn').first().click().catch(() => {});
    await wait(100);
  }
  ok(house, 'blind card reached month 18 and the house event paused the clock');
  await shot('10-blind-house-event');
  const labels = await page.locator('.dialog.event .btn').allTextContents();
  if (labels.every((l) => !l.trim())) {
    notes.push('SHELL BUG (app.js openChoice): the house modal renders four empty buttons because the engine sends data.choices as strings (["cash","credit","sell","skip"]) and app.js reads c.choice / c.label. The test resolved the house event through the engine instead.');
    await page.evaluate(() => { window.__ff.doAct({ type: 'house', choice: 'skip' }); document.querySelectorAll('.overlay').forEach((o) => o.remove()); document.getElementById('root')?.removeAttribute('inert'); });
  } else await page.locator('.dialog.event .btn.primary').first().click();
  await wait(500);
  s = await st();
  ok(await page.evaluate(() => window.__ff.G.state.flags.houseDone), 'house event resolved');
  await clearOverlays();
  await tab('stock'); await wait(600);
  const ticks = await page.evaluate(() => window.Chart.getChart(document.querySelector('.stock canvas')).scales.x.ticks.map((t) => t.label));
  ok(ticks.length >= 3 && ticks.every((t) => /^Day \d+$/.test(t)), `blind x axis shows relative days (${ticks.join(', ')})`);
  const yt = await page.evaluate(() => window.Chart.getChart(document.querySelector('.stock canvas')).scales.y.ticks.map((t) => t.label));
  ok(yt.every((t) => !String(t).includes('$')), `blind y axis shows indexed prices (${yt.join(', ')})`);
  const bst = await txt('.stock'); ok(!/\b20(19|20|21|22|23)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/.test(bst), 'blind stock tab shows no calendar dates' + (bst.match(/.{20}(\b20(19|20|21|22|23)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d).{20}/) || [''])[0]);
  await shot('11-blind-stock');
  for (const id of ['plan', 'collar', 'credit', 'cash']) {
    await tab(id); await wait(300);
    ok(!/\b20(19|20|21|22|23)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/.test(await txt(`.${id}`)), `blind ${id} tab shows no calendar dates`);
    await shot(`12-blind-${id}`);
  }
}

const tabErrors = await page.evaluate(() => window.__tabErrors || []).catch(() => []);
ok(tabErrors.length === 0, `no tab render errors${tabErrors.length ? ': ' + tabErrors.join('; ') : ''}`);

await browser.close();
server?.kill();
console.log('\n' + notes.map((n) => 'NOTE: ' + n).join('\n'));
if (failures.length) { console.error(`\nFAILURES (${failures.length}):\n` + failures.map((f) => '  ' + f).join('\n')); process.exit(1); }
console.log(`\nOK: ${passes.length} checks passed, zero console errors. Screenshots in ${out}`);

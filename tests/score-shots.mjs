// Scoreboard test. Run: node tests/score-shots.mjs
// Watches a finished run (#/watch) to the scoreboard, checks every table value against the engine's own score() for the same
// card, seat and market (to the displayed precision), screenshots at 1280x800 and 375x812 into tests/out/score/, and fails
// on any console or page error. Blind cards: if data/cards/index.json has one it is played through the engine and rendered;
// otherwise a blind variant of the finished card is rendered so the flip, reveal and lesson card are still exercised.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.env.OUT || 'tests/out/score');
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT || 8772);
const BASE = `http://127.0.0.1:${PORT}`;
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); else console.log('  ok  ', msg); };

// ------------------------------------------------------------------ expected values from the engine, in Node
const { runBot } = await import(pathToFileURL(join(root, 'engine/bots.js')));
const market = readJSON('data/market.json'), opts = readJSON('data/spcx-options.json');
const index = readJSON('data/cards/index.json');
const spcx = readJSON('data/cards/spcx.json');
const expected = {};
for (const id of ['holder', 'seller', 'playbook']) expected[id] = runBot(id, spcx, 'engineer', market, opts).score;

// ------------------------------------------------------------------ server
let server;
const up = async () => { try { return (await fetch(BASE + '/index.html')).ok; } catch { return false; } };
if (!(await up())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let k = 0; k < 50 && !(await up()); k++) await new Promise((r) => setTimeout(r, 100));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/\/ui\/tabs\/(stock|plan|collar|credit|cash)\.js/.test(url) && /404/.test(m.text())) return; // tab modules owned by other tasks
    if (/fonts\.g(oogleapis|static)|cdnjs/.test(url) && /ERR_(INTERNET|NAME|CONNECTION|BLOCKED)|Failed to load resource/.test(m.text())) return;
    failures.push(`console.error: ${m.text()} ${url}`);
  });
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

  const shot = async (name, full = true) => {
    if (full) await page.addStyleTag({ content: '#root{height:auto!important;display:block!important}#screen{overflow:visible!important}' }).catch(() => {});
    await page.screenshot({ path: join(out, name), fullPage: full });
    console.log('  shot', name);
  };

  // ---------------------------------------------------------------- watch a finished run
  console.log('Watch a finished run');
  await page.goto(`${BASE}/#/watch`);
  await page.waitForSelector('.sc[data-watch="true"]', { timeout: 90000 });
  await wait(2200); // count-up and entrance animations
  check(await page.locator('.sc-table').count() === 1, 'scoreboard table rendered');

  const cells = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('.sc-table td').forEach((td) => {
      const k = td.dataset.col + '|' + td.dataset.measure;
      o[k] = { text: td.querySelector('.sc-v').textContent, sub: (td.querySelector('.sc-sub') || {}).textContent || '', best: td.classList.contains('best') };
    });
    return { cells: o, cols: [...document.querySelectorAll('.sc-table thead th[data-col]')].map((t) => t.textContent.trim()), big: document.getElementById('sc-big').textContent };
  });
  check(JSON.stringify(cells.cols) === JSON.stringify(['The Playbook (watched)', 'The Holder', 'The Seller']), `watch columns: ${cells.cols.join(' | ')}`);

  const num = (t) => Number(String(t).replace('−', '-').replace(/[$,%]/g, '').replace(/M$/, ''));
  const near = (shown, actual, dp, scale = 1) => Math.abs(num(shown) - actual * scale) <= 0.5 * 10 ** -dp + 1e-9;
  const mdate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${d}, ${y}`; };
  const bestOf = { sharpe: null, drawdown: null, irr: null, wealth: null };
  const colMap = { you: 'playbook', holder: 'holder', seller: 'seller' };
  for (const [col, bot] of Object.entries(colMap)) {
    const s = expected[bot];
    const get = (m) => cells.cells[`${col}|${m}`];
    check(near(get('sharpe').text, s.sharpe, 1), `${col} Sharpe ${get('sharpe').text} = ${s.sharpe.toFixed(4)}`);
    check(near(get('drawdown').text, s.maxDrawdown.pct, 1, 100), `${col} drawdown ${get('drawdown').text} = ${(s.maxDrawdown.pct * 100).toFixed(3)}%`);
    check(get('drawdown').sub === `${mdate(s.maxDrawdown.peakDate)} to ${mdate(s.maxDrawdown.troughDate)}`, `${col} drawdown dates "${get('drawdown').sub}"`);
    check(near(get('irr').text, s.irr, 1, 100), `${col} IRR ${get('irr').text} = ${(s.irr * 100).toFixed(3)}%`);
    // wealth shows "$131.4M" (10M and above) or "$2,140,000"
    const w = get('wealth').text, wDp = /M$/.test(w) ? 1 : 0, wScale = /M$/.test(w) ? 1e-6 : 1;
    check(near(w, s.afterTaxWealth, wDp, wScale), `${col} wealth ${w} = ${s.afterTaxWealth.toFixed(0)}`);
  }
  // best marks agree with the engine
  const vals = { sharpe: (s) => s.sharpe, drawdown: (s) => s.maxDrawdown.pct, irr: (s) => s.irr, wealth: (s) => s.afterTaxWealth };
  for (const m of Object.keys(vals)) {
    const shown = Object.keys(colMap).map((c) => cells.cells[`${c}|${m}`].text);
    const marked = Object.keys(colMap).filter((c) => cells.cells[`${c}|${m}`].best);
    if (shown.every((t) => t === shown[0])) { check(marked.length === 0, `${m}: all three look the same, so none is marked`); continue; }
    const top = Math.max(...Object.values(colMap).map((b) => vals[m](expected[b])));
    const win = Object.entries(colMap).filter(([, b]) => vals[m](expected[b]) === top).map(([c]) => c);
    check(win.every((c) => marked.includes(c)), `best ${m} is marked on ${win.join(', ')}`);
  }
  // big number equals the engine's after-tax wealth to the dollar
  check(Math.abs(num(cells.big) - expected.playbook.afterTaxWealth) <= 0.5, `big number ${cells.big} = ${expected.playbook.afterTaxWealth.toFixed(2)}`);

  const texts = await page.evaluate(() => ({
    verdict: (document.getElementById('sc-verdict') || {}).textContent || '',
    paras: document.querySelectorAll('.sc-para').length,
    live: (document.querySelector('.sc-live') || {}).textContent || '',
    leaves: document.querySelector('.sc-leaves').textContent,
    hooks: [...document.querySelectorAll('[data-hook]')].map((e) => e.dataset.hook + (e.hidden ? ':hidden' : '')),
    primary: (document.querySelector('.sc-actions .btn.primary') || {}).textContent,
    bangs: /!/.test(document.querySelector('.sc').textContent),
    ls: { fin: localStorage.getItem('ff.finished'), runs: localStorage.getItem('ff.runs') },
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  console.log('  verdict:', texts.verdict);
  check(/^The Playbook beat The Holder on \d of 4 and The Seller on \d of 4 measures\.$/.test(texts.verdict), 'watch verdict wording');
  check(texts.paras >= 2, 'debrief paragraphs shown');
  check(/^Live card: 98 trading days so far\. Not comparable with five-year cards\.$/.test(texts.live), `live line: ${texts.live}`);
  check(/Pre-IPO GRATs/.test(texts.leaves) && /QSBS/.test(texts.leaves) && /dealer spreads/.test(texts.leaves), 'what the replay leaves out');
  check(texts.primary === 'Play it yourself', 'primary button when watching');
  check(texts.hooks.includes('compare-runs') && texts.hooks.includes('copy-share-code'), 'compare / share hooks present and visible');
  check(!texts.bangs, 'no exclamation marks');
  check((JSON.parse(texts.ls.fin || '[]')).includes('spcx'), 'ff.finished has spcx');
  check(!texts.ls.runs || JSON.parse(texts.ls.runs).length === 0, 'watching does not save a run');
  await shot('score-watch-1280.png');
  await page.screenshot({ path: join(out, 'score-watch-1280-fold.png') }).catch(() => {});

  await page.setViewportSize({ width: 375, height: 812 });
  await wait(400);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'no horizontal overflow at 375');
  await shot('score-watch-375.png');

  // ---------------------------------------------------------------- blind card (engine-played if one exists, else a blind variant)
  console.log('Blind card reveal');
  await page.setViewportSize({ width: 1280, height: 800 });
  const blindEntry = index.find((c) => c.blind);
  const blindInfo = await page.evaluate(async ({ blindId }) => {
    const store = await import('/ui/store.js');
    const { renderScoreboard } = await import('/ui/scoreboard.js');
    const base = store.getState().result;
    const data = store.getState().boot.data;
    let card = base.card, result = base;
    if (blindId) {
      // play the real blind card to the end with the engine, as The Seller would
      const sim = await import('/engine/sim.js'), bots = await import('/engine/bots.js');
      const c = await (await fetch(`/data/cards/${blindId}.json`)).json();
      const r = bots.runBot('seller', c, 'engineer', data.market, data.spcxOptions);
      const holder = bots.runBot('holder', c, 'engineer', data.market, data.spcxOptions), playbook = bots.runBot('playbook', c, 'engineer', data.market, data.spcxOptions);
      result = { cardId: blindId, seat: 'engineer', watch: false, card: c, state: r.state, snap: sim.snapshot(r.state), score: r.score, botScores: { holder: holder.score, seller: r.score, playbook: playbook.score }, achievements: [], engine: sim };
      card = c;
    } else {
      card = { ...base.card, id: 'c1', blind: true, live: false, name: 'Example Holdings', ticker: 'EXMP', industry: 'Software',
        vignette: 'assets/vignettes/neutral-lighthouse.png', revealVignette: 'assets/vignettes/reveal-software.png',
        reveal: { text: 'Example Holdings sold workflow software to mid-sized companies. This sample paragraph stands in for the reveal text written for each card.', numbersChecked: true } };
      const stats = { ...base.state.stats, forced: [{ d: '2026-08-06', shares: 41000, price: 120, gross: 4920000, gain: 3000000 }] };
      result = { ...base, cardId: 'c1', seat: 'engineer', watch: false, card, state: { ...base.state, stats }, botScores: base.botScores };
    }
    const d2 = { ...data, cardsIndex: [...data.cardsIndex, ...(blindId ? [] : [{ id: 'c1', blind: true, label: 'Card 1' }, { id: 'c2', blind: true, label: 'Card 2' }])] };
    const host = document.getElementById('screen');
    host.dataset.screen = 'score';
    host.innerHTML = '<div class="score-wrap"></div>';
    await renderScoreboard(host.firstElementChild, { ...result, go: () => {}, data: d2 });
    return { id: result.cardId, synthetic: !blindId };
  }, { blindId: blindEntry && blindEntry.id });
  console.log('  rendered', JSON.stringify(blindInfo));
  await wait(250);
  await page.screenshot({ path: join(out, 'score-blind-front-mid.png') }); console.log('  shot score-blind-front-mid.png');
  await wait(1700);
  check((await page.getAttribute('#sc-cert', 'data-state')) === 'back', 'certificate flipped to the reveal');
  const b = await page.evaluate(() => ({
    jpm: document.querySelector('.sc-jpm').textContent, name: document.querySelector('.back .sc-co').textContent,
    reveal: !!document.getElementById('sc-reveal-text'), lesson: !!document.querySelector('[data-lesson="forced-sale"]'),
    nowMedals: document.querySelectorAll('.sc-medal.now').length, runs: JSON.parse(localStorage.getItem('ff.runs') || '[]').length,
    fin: JSON.parse(localStorage.getItem('ff.finished') || '[]'), ach: localStorage.getItem('ff.achievements'),
    deal: [...document.querySelectorAll('[data-action="deal-another"]')].map((a) => a.getAttribute('href')),
    again: (document.querySelector('[data-action="play-again"]') || {}).getAttribute?.('href'),
    cols: [...document.querySelectorAll('.sc-table thead th[data-col]')].map((t) => t.textContent.trim()),
  }));
  check(b.jpm === 'In J.P. Morgan\'s 2014 study of Russell 3000 stocks from 1980 to 2014, about 40% fell 70% or more from their peak and never recovered. That is a lifetime figure, not a five-year rate.', 'J.P. Morgan line verbatim');
  check(b.name.length > 0, `reveal name: ${b.name}`);
  check(b.reveal, 'reveal paragraph shown'); check(b.lesson || !blindInfo.synthetic, 'forced-sale lesson card shown (synthetic)');
  check(b.runs === 1, 'one run saved'); check(b.fin.includes(blindInfo.id), 'ff.finished has the blind card');
  check(b.cols.length === 4 && b.cols[0] === 'You', `player columns: ${b.cols.join(' | ')}`);
  check(b.again && /^#\/play\/.+\/engineer$/.test(b.again), `play again link ${b.again}`);
  check(b.deal.length === 1, `deal another link ${b.deal}`);
  console.log('  earned this run:', b.nowMedals, ' stored:', b.ach);
  await shot('score-blind-1280.png');
  await page.setViewportSize({ width: 375, height: 812 });
  await wait(500);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'no horizontal overflow at 375 (blind)');
  await shot('score-blind-375.png');
  // reduced motion: the certificate is already turned over, the number is already final
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    const store = await import('/ui/store.js'); const { renderScoreboard } = await import('/ui/scoreboard.js');
    const r = store.getState().result, host = document.getElementById('screen');
    host.innerHTML = '<div class="score-wrap"></div>';
    await renderScoreboard(host.firstElementChild, { ...r, card: { ...r.card, id: 'c1', blind: true, live: false, name: 'Example Holdings', ticker: 'EXMP', vignette: 'assets/vignettes/neutral-key.png', revealVignette: 'assets/vignettes/reveal-software.png' }, cardId: 'c1', go() {}, data: store.getState().boot.data });
  });
  check((await page.getAttribute('#sc-cert', 'data-state')) === 'back', 'reduced motion: certificate flipped at once');
  check((await page.textContent('#sc-big')) === (await page.getAttribute('#sc-big', 'data-value')).replace(/^(\d+)(\.\d+)?$/, (m, a) => '$' + Number(Math.round(m)).toLocaleString('en-US')), 'reduced motion: number final at once');
} catch (e) {
  failures.push('test crashed: ' + (e && e.stack || e));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

if (failures.length) { console.log('\nFAILURES'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('\nscore-shots: all checks passed');

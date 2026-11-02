#!/usr/bin/env node
// Nightly data job. Incremental by default; --full rebuilds data/market.json and data/src/spcx/base.json from scratch.
// Exit 0 even when a source fails (the failure is logged and the last good data stays). Exit 1 only on a bug.
// Flags: --full, --no-cards (skip build-cards), --no-test (skip node --test).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { P, readJson, writeJson, addDays, isoDate } from './lib/io.mjs';
import { SourceError } from './lib/http.mjs';
import { fetchBars } from './lib/yahoo.mjs';
import { fetchSeries } from './lib/fred.mjs';
import { fetchChain, chainQuoteTime, checkChainSession } from './lib/cboe.mjs';
import { fetchFilings, fetchOfferFacts, URL_424B4 } from './lib/sec.mjs';
import { mergeRows, appendSeries } from './lib/merge.mjs';
import { deriveOptions } from './lib/options.mjs';

// `node --test scripts/` may execute every file in scripts/ as a test in older Node versions; never run the job from there.
if (process.env.NODE_TEST_CONTEXT) process.exit(0);

const FULL = process.argv.includes('--full');
const SPY_START = '2018-12-01';
const SPCX_PRICE_FROM = '2026-06-10';
const FIRST_TRADE = '2026-06-12';
const FILES = {
  market: P('data', 'market.json'), base: P('data', 'src', 'spcx', 'base.json'), options: P('data', 'spcx-options.json'),
  meta: P('data', 'meta.json'), log: P('data', 'update-log.json'), tests: P('data', 'test-status.json'),
};
// Verified from the 424B4 on 2026-11-01; used only if the live parse fails.
const OFFER_FALLBACK = { proceedsUSD: 74999999925, sharesOutPost: 7380196910 };
const SANITY = { firstClose: 160.95, peakClose: 211.39, peakDate: '2026-06-16', lowClose: 108.27, lowDate: '2026-08-05', closeOct30: 134.72 };

const changed = [], errors = [], warnings = [], bugs = [];
const say = (...a) => console.log(...a);

// Run one step. SourceError = a data source failed (logged, last good data kept). Anything else is a bug (exit 1).
async function step(name, fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof SourceError) { errors.push(e.message); say(`  [${name}] source failed: ${e.message}`); }
    else { bugs.push(`${name}: ${e.stack || e.message}`); errors.push(`${name}: bug: ${e.message}`); say(`  [${name}] BUG: ${e.stack || e.message}`); }
    return null;
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- market.json: SPY adjusted close and the three FRED rates ------------------------------------
async function updateMarket() {
  const prev = readJson(FILES.market, null);
  const full = FULL || !prev;
  const m = full ? { spy: [], rates: { dgs1mo: [], dgs1: [], sofr: [] } } : structuredClone(prev);
  let touched = false;

  await step('spy', async () => {
    const lastD = m.spy.length ? m.spy[m.spy.length - 1][0] : null;
    const from = lastD ? addDays(lastD, -14) : SPY_START;
    const bars = (await fetchBars('SPY', from)).map((b) => [b[0], b[2]]);
    if (!bars.length) throw new SourceError('yahoo', 'SPY returned no bars');
    const r = mergeRows(m.spy, bars, { adjIdx: 1 });
    m.spy = r.rows;
    if (r.added) { changed.push(full ? 'SPY full rebuild' : `SPY +${r.added} day${r.added > 1 ? 's' : ''}`); touched = true; }
    if (r.rebased) { changed.push(`SPY rebased x${r.rebased.toFixed(6)} (dividend)`); touched = true; }
  });

  for (const [key, id] of [['dgs1mo', 'DGS1MO'], ['dgs1', 'DGS1'], ['sofr', 'SOFR']]) {
    await step(id, async () => {
      const lastD = m.rates[key].length ? m.rates[key][m.rates[key].length - 1][0] : null;
      const since = lastD || (key === 'sofr' ? null : addDays(SPY_START, -1));
      const rows = await fetchSeries(id, since);
      const r = appendSeries(m.rates[key], rows);
      m.rates[key] = r.rows;
      if (r.added) { changed.push(full ? `${id} full rebuild` : id); touched = true; }
    });
  }

  // A failed full rebuild must not replace good data with a partial file.
  const complete = m.spy.length && Object.values(m.rates).every((r) => r.length);
  if (touched && complete && !same(m, prev)) writeJson(FILES.market, m);
  else if (touched && !complete) errors.push('market.json not written: incomplete rebuild');
  return complete ? m : prev;
}

// ---- data/src/spcx/base.json ---------------------------------------------------------------------
function baseSkeleton(prev, offer) {
  return {
    id: 'spcx', blind: false, live: true, name: 'SpaceX', ticker: 'SPCX', industry: 'Aerospace',
    ipo: {
      offerPrice: 135, pricingDate: '2026-06-11', firstTrade: FIRST_TRADE,
      proceedsUSD: offer.proceedsUSD, sharesOutPost: offer.sharesOutPost,
      source: { url: URL_424B4, page: 'cover; The Offering, p. 17' },
    },
    prices: prev?.prices || [], earnings: prev?.earnings || [], reports: prev?.reports || [],
    notes: prev?.notes || [],
  };
}

async function updateSpcx() {
  const prev = readJson(FILES.base, null);
  const full = FULL || !prev;
  let base = baseSkeleton(prev, prev?.ipo ? { proceedsUSD: prev.ipo.proceedsUSD, sharesOutPost: prev.ipo.sharesOutPost } : OFFER_FALLBACK);
  if (full) base.prices = [];
  const startPrices = base.prices.length;

  if (full || !prev?.ipo?.proceedsUSD) {
    const o = await step('424B4', () => fetchOfferFacts());
    if (o) base.ipo.proceedsUSD = o.proceedsUSD, base.ipo.sharesOutPost = o.sharesOutPost;
    else if (!prev?.ipo) { base.ipo.proceedsUSD = OFFER_FALLBACK.proceedsUSD; base.ipo.sharesOutPost = OFFER_FALLBACK.sharesOutPost; errors.push('424B4: used verified constants'); }
  }

  await step('spcx-bars', async () => {
    const lastD = base.prices.length ? base.prices[base.prices.length - 1][0] : null;
    const from = lastD ? addDays(lastD, -14) : SPCX_PRICE_FROM;
    const bars = (await fetchBars('SPCX', from)).filter((b) => b[0] >= FIRST_TRADE);
    if (!bars.length) throw new SourceError('yahoo', 'SPCX returned no bars');
    const r = mergeRows(base.prices, bars, { adjIdx: 2, closeIdx: 1 });
    base.prices = r.rows;
    if (r.added) changed.push(full && !startPrices ? `SPCX full rebuild (${r.added} days)` : `SPCX +${r.added} day${r.added > 1 ? 's' : ''}`);
    if (r.rebased) changed.push(`SPCX rebased x${r.rebased.toFixed(6)}`);
  });

  await step('spcx-filings', async () => {
    const f = await fetchFilings();
    const known = new Set(base.earnings.map((e) => e.d));
    const fresh = f.earnings.filter((e) => !known.has(e.d));
    if (prev && fresh.length) {
      for (const e of fresh) {
        base.notes.push(`${e.d}: new 8-K Item 2.02 filed (${e.url}). SpaceX lockup tranches that depend on earnings must be re-resolved: re-read the lockup if needed, then run node scripts/build-cards.mjs.`);
        changed.push(`SPCX 8-K 2.02 ${e.d} (re-resolve tranches)`);
      }
    } else if (fresh.length) changed.push(`SPCX earnings x${fresh.length}`);
    base.earnings = f.earnings;
    const knownR = new Set(base.reports.map((r) => r.d + r.form));
    const freshR = f.reports.filter((r) => !knownR.has(r.d + r.form));
    if (prev && freshR.length) changed.push(...freshR.map((r) => `SPCX ${r.form} ${r.d}`));
    base.reports = f.reports;
  });

  if (!base.prices.length) { errors.push('base.json not written: no prices'); return prev; }
  if (!same(base, prev)) writeJson(FILES.base, base);
  checkSanity(base.prices);
  return base;
}

function checkSanity(prices) {
  const by = new Map(prices.map((r) => [r[0], r[1]]));
  const bad = [];
  if (by.get(FIRST_TRADE) !== SANITY.firstClose) bad.push(`first close ${by.get(FIRST_TRADE)} != ${SANITY.firstClose}`);
  if (by.get(SANITY.peakDate) !== SANITY.peakClose) bad.push(`06-16 close ${by.get(SANITY.peakDate)} != ${SANITY.peakClose}`);
  if (by.get(SANITY.lowDate) !== SANITY.lowClose) bad.push(`08-05 close ${by.get(SANITY.lowDate)} != ${SANITY.lowClose}`);
  if (by.has('2026-10-30') && by.get('2026-10-30') !== SANITY.closeOct30) bad.push(`10-30 close ${by.get('2026-10-30')} != ${SANITY.closeOct30}`);
  const max = Math.max(...prices.map((r) => r[1])), min = Math.min(...prices.map((r) => r[1]));
  if (max !== SANITY.peakClose) bad.push(`peak close ${max} != ${SANITY.peakClose}`);
  if (min !== SANITY.lowClose) bad.push(`low close ${min} != ${SANITY.lowClose}`);
  if (bad.length) { const msg = `FACT MISMATCH vs PRD 4.1: ${bad.join('; ')}`; say('  !!! ' + msg); errors.push(msg); }
  else say('  sanity facts match (160.95 / 211.39 / 108.27 / 134.72)');
}

// ---- spcx-options.json -----------------------------------------------------------------------------
async function updateOptions(base, market) {
  if (!base?.prices?.length || !market?.rates?.dgs1?.length) return;
  await step('cboe', async () => {
    const chain = await fetchChain('SPCX');
    const last = base.prices[base.prices.length - 1];
    const spot = last[1], asOf = last[0];
    // Never mix intraday option quotes with the prior close: only an end-of-day chain for the asOf session is used.
    // Otherwise keep the existing spcx-options.json and carry on (a warning, not an error: prices still commit).
    const session = checkChainSession(chainQuoteTime(chain), asOf);
    if (!session.ok) {
      const msg = `SPCX options not updated: ${session.reason}. Kept the existing data/spcx-options.json.`;
      warnings.push(msg); say(`  WARNING: ${msg}`);
      return;
    }
    say(`  cboe: ${session.reason}`);
    const ref = [chain.data.close, chain.data.current_price].filter((x) => x > 0);
    if (!ref.some((x) => Math.abs(x / spot - 1) < 0.1)) throw new SourceError('cboe', `chain underlying ${ref.join('/')} does not match last close ${spot}`);
    const rate = market.rates.dgs1[market.rates.dgs1.length - 1][1];
    let out;
    try { out = deriveOptions(chain, { spot, asOf, rate }); }
    catch (e) { throw new SourceError('cboe', `could not derive options numbers: ${e.message}`); }
    out.streetCheck.rateAsOf = market.rates.dgs1[market.rates.dgs1.length - 1][0];
    if (out.streetCheck.marketCap == null) throw new SourceError('cboe', 'no market cap (expiries bracketing one year not usable)');
    const prev = readJson(FILES.options, null);
    if (!same(out, prev)) { writeJson(FILES.options, out); changed.push('SPCX options'); }
  });
}

// ---- meta, log, tests -------------------------------------------------------------------------------
function writeMeta(base, run) {
  const prev = readJson(FILES.meta, null);
  const prices = base?.prices || [];
  const asOf = prices.length ? prices[prices.length - 1][0] : prev?.asOf;
  const meta = { asOf, lastRun: run, schema: 1, spcxTradingDays: prices.length || prev?.spcxTradingDays || 0 };
  if (!isoDate(String(asOf))) { errors.push('meta.json not written: no asOf'); return; }
  writeJson(FILES.meta, meta);
}

function runNode(args, timeoutMs) {
  return spawnSync(process.execPath, args, { cwd: P(), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
}

function runTests(run) {
  const r = runNode(['--test', '--test-reporter=tap'], 600000);
  const out = (r.stdout || '') + (r.stderr || '');
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)`, 'm').exec(out); return m ? Number(m[1]) : null; };
  const total = n('tests'), passed = n('pass'), failed = n('fail');
  const status = { run, passed: passed ?? 0, failed: failed ?? 0, total: total ?? 0, ok: r.status === 0 && total != null && failed === 0 };
  writeJson(FILES.tests, status);
  say(`  tests: ${status.passed}/${status.total} passed, ${status.failed} failed`);
  if (!status.ok) {
    const lines = out.split('\n').filter((l) => /^not ok|^# Subtest|failureType|error:/.test(l)).slice(0, 12);
    say(lines.map((l) => '    ' + l).join('\n'));
    errors.push(`tests failed: ${status.failed} of ${status.total}`);
  }
  return status;
}

function writeLog(run) {
  const log = readJson(FILES.log, []);
  log.unshift({ run, ok: errors.length === 0, changed, error: errors.length ? errors.join(' | ') : null, ...(warnings.length ? { warnings } : {}) });
  writeJson(FILES.log, log.slice(0, 60));
}

// ---- main -------------------------------------------------------------------------------------------
async function main() {
  const run = new Date().toISOString();
  say(`update-data ${FULL ? '--full ' : ''}${run}`);
  const market = await updateMarket();
  const base = await updateSpcx();
  await updateOptions(base, market);
  writeMeta(base, run);

  if (!process.argv.includes('--no-cards')) {
    const r = runNode([P('scripts', 'build-cards.mjs')], 120000);
    say((r.stdout || '').trimEnd().split('\n').map((l) => '  ' + l).join('\n'));
    if (r.status !== 0) { bugs.push('build-cards failed: ' + (r.stderr || '').slice(0, 500)); errors.push('build-cards failed'); }
  }
  if (!process.argv.includes('--no-test')) runTests(run);
  writeLog(run);

  say(`changed: ${changed.length ? changed.join(', ') : 'nothing'}`);
  if (warnings.length) say(`warnings: ${warnings.join(' | ')}`);
  if (errors.length) say(`errors: ${errors.join(' | ')}`);
  if (bugs.length) { console.error('BUGS:\n' + bugs.join('\n')); process.exitCode = 1; }
}

main().catch((e) => { console.error('BUG (uncaught):', e.stack || e); process.exit(1); });

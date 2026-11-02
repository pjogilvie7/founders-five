// Data shape tests (node --test). They read the committed data files; the nightly job runs them before it commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeRows, appendSeries } from './lib/merge.mjs';
import { bsPrice, zeroCostCall } from './lib/bs.mjs';
import { checkChainSession, chainQuoteTime } from './lib/cboe.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function assertAscending(rows, label) {
  const d = (r) => (Array.isArray(r) ? r[0] : r.d);
  for (let i = 0; i < rows.length; i++) {
    assert.match(d(rows[i]), ISO, `${label} row ${i} date`);
    if (i) assert.ok(d(rows[i]) > d(rows[i - 1]), `${label}: ${d(rows[i])} not after ${d(rows[i - 1])} (order or duplicate)`);
  }
}

test('market.json shape', () => {
  const m = read('data', 'market.json');
  assert.ok(Array.isArray(m.spy) && m.spy.length > 1900, 'spy has about 8 years of rows');
  assertAscending(m.spy, 'spy');
  for (const r of m.spy) { assert.equal(r.length, 2); assert.ok(Number.isFinite(r[1]) && r[1] > 0); }
  assert.ok(m.spy[0][0] >= '2018-12-01' && m.spy[0][0] <= '2018-12-07', `spy starts ${m.spy[0][0]}`);
  for (const k of ['dgs1mo', 'dgs1', 'sofr']) {
    assert.ok(Array.isArray(m.rates[k]) && m.rates[k].length > 1000, `${k} has rows`);
    assertAscending(m.rates[k], k);
    for (const r of m.rates[k]) { assert.equal(r.length, 2); assert.ok(Number.isFinite(r[1]) && r[1] > -1 && r[1] < 30, `${k} ${r[0]} = ${r[1]}`); }
  }
  assert.equal(m.rates.sofr[0][0], '2018-04-03', 'sofr starts at its own start');
  assert.ok(m.rates.dgs1mo[0][0] >= '2018-12-01' && m.rates.dgs1[0][0] >= '2018-12-01');
  assert.equal(m.rates.dgs1mo.length, new Set(m.rates.dgs1mo.map((r) => r[0])).size);
});

test('spcx base shape', () => {
  const b = read('data', 'src', 'spcx', 'base.json');
  assert.equal(b.id, 'spcx'); assert.equal(b.blind, false); assert.equal(b.live, true);
  assert.equal(b.name, 'SpaceX'); assert.equal(b.ticker, 'SPCX'); assert.equal(b.industry, 'Aerospace');
  assert.equal(b.ipo.offerPrice, 135); assert.equal(b.ipo.pricingDate, '2026-06-11'); assert.equal(b.ipo.firstTrade, '2026-06-12');
  assert.ok(b.ipo.proceedsUSD > 7e10 && b.ipo.proceedsUSD < 8e10, 'proceeds about $75B');
  assert.ok(b.ipo.sharesOutPost > 7.3e9 && b.ipo.sharesOutPost < 7.5e9, 'shares out about 7.38B');
  assert.match(b.ipo.source.url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1181412\//); assert.ok(b.ipo.source.page);
  assert.ok(b.prices.length >= 98);
  assertAscending(b.prices, 'prices');
  for (const r of b.prices) {
    assert.equal(r.length, 4);
    assert.ok(r[1] > 0 && r[2] > 0 && Number.isInteger(r[3]) && r[3] > 0, `bad row ${r.join(',')}`);
  }
  assert.equal(b.prices[0][0], b.ipo.firstTrade, 'first price row is the first trade');
  assertAscending(b.earnings, 'earnings'); assertAscending(b.reports, 'reports');
  for (const e of b.earnings) assert.match(e.url, /^https:\/\/www\.sec\.gov\/Archives\//);
  for (const r of b.reports) assert.ok(['10-Q', '10-K'].includes(r.form));
  const eds = b.earnings.map((e) => e.d);
  assert.ok(eds.includes('2026-08-04') && eds.includes('2026-10-20'), `earnings ${eds}`);
});

test('spcx facts from the PRD (frozen history)', () => {
  const by = new Map(read('data', 'src', 'spcx', 'base.json').prices.map((r) => [r[0], r[1]]));
  assert.equal(by.get('2026-06-12'), 160.95);
  assert.equal(by.get('2026-06-16'), 211.39);
  assert.equal(by.get('2026-08-05'), 108.27);
  assert.equal(by.get('2026-10-30'), 134.72);
  const closes = [...by.values()];
  assert.equal(Math.max(...closes), 211.39); assert.equal(Math.min(...closes), 108.27);
});

test('meta.asOf equals the last spcx price date', () => {
  const meta = read('data', 'meta.json');
  const prices = read('data', 'src', 'spcx', 'base.json').prices;
  assert.equal(meta.schema, 1);
  assert.equal(meta.asOf, prices[prices.length - 1][0]);
  assert.equal(meta.spcxTradingDays, prices.length);
  assert.ok(!Number.isNaN(Date.parse(meta.lastRun)));
});

test('update-log shape', () => {
  const log = read('data', 'update-log.json');
  assert.ok(Array.isArray(log) && log.length <= 60);
  for (const e of log) { assert.ok(!Number.isNaN(Date.parse(e.run))); assert.equal(typeof e.ok, 'boolean'); assert.ok(Array.isArray(e.changed)); assert.ok(e.error === null || typeof e.error === 'string'); }
  for (let i = 1; i < log.length; i++) assert.ok(log[i - 1].run >= log[i].run, 'newest first');
});

test('spcx-options shape and street check', () => {
  const o = read('data', 'spcx-options.json');
  const meta = read('data', 'meta.json');
  assert.ok(o.asOf <= meta.asOf);
  assert.ok(o.iv30 > 5 && o.iv30 < 400);
  assert.ok(o.smile.length > 20);
  for (const s of o.smile) { assert.match(s.expiry, ISO); assert.ok(s.strikePct > 0.4 && s.strikePct < 2 && s.iv > 0.05 && s.iv < 3, JSON.stringify(s)); }
  const sc = o.streetCheck;
  assert.ok(Math.abs(sc.floor - 0.85 * sc.spot) < 0.01);
  assert.ok(Math.abs(sc.vol - o.iv30 / 100) < 1e-3);
  assert.ok(sc.modelCap > sc.spot && sc.modelCap < 5 * sc.spot);
  assert.ok(sc.marketCap > sc.spot && sc.marketCap < 5 * sc.spot);
  assert.equal(typeof sc.method, 'string'); assert.match(sc.asOf, ISO);
  const raw = JSON.stringify(o);
  assert.ok(!/"bid"|"ask"|open_interest/.test(raw), 'no raw chain fields');
});

test('test-status.json shape', () => {
  const t = read('data', 'test-status.json');
  assert.deepEqual(Object.keys(t).sort(), ['failed', 'ok', 'passed', 'run', 'total']);
});

test('card index and cards, when built, agree', () => {
  const idx = read('data', 'cards', 'index.json');
  for (const e of idx) {
    const c = read('data', 'cards', `${e.id}.json`);
    assert.equal(c.id, e.id); assert.equal(c.blind, e.blind); assert.equal(c.prices.length, e.tradingDays);
    for (const g of c.lockup.groups) for (const t of g.tranches) assert.equal(t.reconciled, true);
  }
  if (idx.length) assert.equal(idx[0].id, 'spcx');
});

// ---- library unit tests ----------------------------------------------------------------------------

test('mergeRows appends only new rows', () => {
  const stored = [['2026-10-28', 10, 10, 5], ['2026-10-29', 11, 11, 5]];
  const fetched = [['2026-10-28', 10, 10, 5], ['2026-10-29', 11, 11, 5], ['2026-10-30', 12, 12, 5]];
  const r = mergeRows(stored, fetched, { adjIdx: 2, closeIdx: 1 });
  assert.equal(r.added, 1); assert.equal(r.rows.length, 3); assert.equal(r.rebased, null);
  assert.equal(mergeRows(r.rows, fetched, { adjIdx: 2, closeIdx: 1 }).added, 0, 'second merge appends nothing');
});

test('mergeRows rebases adjusted closes after a dividend and refuses a split', () => {
  const stored = [['2026-10-28', 100, 100], ['2026-10-29', 100, 100]];
  const div = [['2026-10-29', 100, 99], ['2026-10-30', 100, 100]];
  const r = mergeRows(stored, div, { adjIdx: 2, closeIdx: 1 });
  assert.equal(r.added, 1); assert.ok(Math.abs(r.rows[0][2] - 99) < 1e-6); assert.ok(Math.abs(r.rebased - 0.99) < 1e-9);
  assert.throws(() => mergeRows(stored, [['2026-10-29', 50, 50], ['2026-10-30', 50, 50]], { adjIdx: 2, closeIdx: 1 }), /split/);
});

test('appendSeries skips old dates', () => {
  assert.equal(appendSeries([['2026-01-02', 4]], [['2026-01-02', 4], ['2026-01-05', 4.1]]).added, 1);
});

test('Black-Scholes golden values (PRD 4.7)', () => {
  assert.ok(Math.abs(bsPrice({ type: 'put', S: 134.72, K: 114.512, T: 1, r: 0.04, vol: 0.537 }) - 15.325) < 0.01);
  assert.ok(Math.abs(zeroCostCall({ S: 134.72, Kp: 114.512, T: 1, r: 0.04, vol: 0.537 }).Kc - 186.99) < 0.05);
});

test('chain session guard: only end-of-day quotes for the asOf session pass (2026-10-30 is a Friday)', () => {
  const F = '2026-10-30';
  const ok = (q, asOf = F) => checkChainSession(q, asOf).ok;
  assert.equal(ok('2026-11-02T10:50:00'), false, '10:50 ET on a newer session (the 2026-11-02 bug)');
  assert.equal(ok('2026-11-02T10:50:00', '2026-11-02'), false, '10:50 ET, same session still trading');
  assert.equal(ok('2026-10-30T18:30:00'), true, '18:30 ET on the asOf date');
  assert.equal(ok('2026-10-30T16:00:00'), true, '16:00 ET exactly');
  assert.equal(ok('2026-10-30T15:59:58'), true, 'closing trade stamped just before 16:00');
  assert.equal(ok('2026-10-30T15:50:00'), false, 'ten minutes before the close');
  assert.equal(ok('2026-10-30T13:00:00'), false, '13:00 ET on the asOf date');
  assert.equal(ok('2026-11-03T08:00:00', '2026-11-02'), true, '08:00 ET next weekday');
  assert.equal(ok('2026-11-02T08:00:00'), true, 'Monday 08:00 ET after a Friday asOf');
  assert.equal(ok('2026-10-31T12:00:00'), true, 'Saturday after a Friday asOf');
  assert.equal(ok('2026-11-02T09:29:00'), true, 'last minute before the open');
  assert.equal(ok('2026-11-02T09:30:00'), false, 'the open of the next session');
  assert.equal(ok('2026-11-02T18:30:00'), false, 'close of a newer session than asOf');
  assert.equal(ok('2026-10-29T18:30:00'), false, 'older than the last close');
  assert.equal(ok(null), false, 'missing quote time');
  assert.equal(ok(undefined), false);
  assert.equal(ok(''), false);
  assert.equal(ok('not a time'), false, 'unparseable');
  assert.equal(ok('2026-11-02T25:00:00'), false, 'impossible hour');
  assert.equal(ok('2026-10-30T18:30:00', 'bad'), false, 'bad asOf');
  assert.equal(chainQuoteTime({ timestamp: '2026-10-30 22:30:00', data: {} }), null, 'the UTC file timestamp is not a quote time');
  assert.equal(chainQuoteTime({ data: { last_trade_time: '2026-10-30T16:00:00' } }), '2026-10-30T16:00:00');
  assert.match(checkChainSession(null, F).reason, /no usable quote time/);
});

test('chain session guard converts zoned times with America/New_York (daylight saving)', () => {
  // 2026-10-30 is EDT (UTC-4): 20:30Z = 16:30 ET (end of day), 19:30Z = 15:30 ET (intraday).
  assert.equal(checkChainSession('2026-10-30T20:30:00Z', '2026-10-30').ok, true);
  assert.equal(checkChainSession('2026-10-30T19:30:00Z', '2026-10-30').ok, false);
  // 2026-11-02 is EST (UTC-5; clocks went back on 11-01): 13:00Z = 08:00 ET (pre-market), 15:50Z = 10:50 ET (intraday).
  assert.equal(checkChainSession(new Date('2026-11-02T13:00:00Z'), '2026-10-30').ok, true);
  assert.equal(checkChainSession(new Date('2026-11-02T15:50:00Z'), '2026-10-30').ok, false);
  // 2026-11-02 14:45Z is 09:45 EST (after the open) but would be 10:45 under a stale EDT offset.
  assert.equal(checkChainSession('2026-11-02T14:25:00Z', '2026-10-30').ok, true, '09:25 EST, pre-market');
  assert.equal(checkChainSession('2026-11-02T14:35:00-00:00', '2026-10-30').ok, false, '09:35 EST, after the open');
  assert.equal(checkChainSession(new Date('nope'), '2026-10-30').ok, false);
});

// node --test scripts/universe.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fnv1a32, mulberry32, drawOrder, loadUniverse, recompute } from './universe.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const u = loadUniverse();

test('hash and PRNG match reference values', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  const r = mulberry32(1);
  assert.equal(r(), 0.6270739405881613);
  assert.equal(r(), 0.002735721180215478);
});

test('the draw is reproducible from the seed', () => {
  assert.equal(u.seed, 'founders-five-2026-11-01');
  const r = recompute(u);
  assert.equal(r.seedInt, u.seedInt);
  assert.deepEqual(r.sortedTickers, u.sortedTickers);
  assert.deepEqual(r.drawOrder, u.drawOrder);
  assert.deepEqual(drawOrder([...u.sortedTickers].reverse(), u.seed), u.drawOrder, 'input order must not matter');
  assert.deepEqual(u.drawn, u.drawOrder.slice(0, 10));
  assert.deepEqual([...u.drawOrder].sort(), u.sortedTickers, 'drawOrder is a permutation of the included tickers');
  assert.equal(new Set(u.sortedTickers).size, u.sortedTickers.length);
});

test('every included row has a 424B4 URL and proceeds of at least $1B', () => {
  assert.ok(u.included.length >= 10);
  for (const r of u.included) {
    assert.match(r.url424b4, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/[^/]*424b4[^/]*\.htm$/i, `${r.ticker} url`);
    assert.ok(r.proceedsUSD >= 1e9, `${r.ticker} proceeds ${r.proceedsUSD}`);
    assert.ok(r.pricingDate >= '2019-01-01' && r.pricingDate <= '2021-06-30', `${r.ticker} pricing date ${r.pricingDate}`);
    assert.ok(r.firstTrade >= r.pricingDate, `${r.ticker} first trade before pricing`);
    assert.ok(r.offerPrice > 0 && r.sharesOffered > 0);
    assert.ok(Math.abs(r.offerPrice * r.sharesOffered - r.proceedsUSD) < 1, `${r.ticker} proceeds = price x shares`);
    assert.ok(['NYSE', 'Nasdaq'].includes(r.exchange));
  }
});

test('every exclusion has a ticker and a reason', () => {
  const included = new Set(u.sortedTickers);
  for (const x of u.excluded) {
    assert.ok(x.ticker && x.reason, JSON.stringify(x));
    assert.ok(!included.has(x.ticker), `${x.ticker} is both included and excluded`);
  }
});

const srcDir = join(root, 'data', 'src');
const cardDirs = existsSync(srcDir) ? readdirSync(srcDir).filter((d) => /^c\d+$/.test(d) && existsSync(join(srcDir, d, 'base.json'))) : [];

test('base data exists for the first ten drawn', () => {
  assert.deepEqual(cardDirs.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), Array.from({ length: 10 }, (_, i) => `c${i + 1}`));
});

for (const id of cardDirs) {
  test(`${id}/base.json: 1,261 ascending price rows and the card schema`, () => {
    const c = JSON.parse(readFileSync(join(srcDir, id, 'base.json'), 'utf8'));
    const n = Number(id.slice(1));
    const ticker = u.drawOrder[n - 1];
    assert.equal(c.id, id);
    assert.equal(c.ticker, ticker);
    assert.ok(!id.toLowerCase().includes(ticker.toLowerCase()), 'id must not contain the ticker');
    assert.equal(c.blind, true);
    assert.equal(c.live, false);
    assert.ok(['software', 'consumer', 'fintech', 'health', 'mobility', 'travel', 'other'].includes(c.industry));
    assert.equal(c.prices.length, 1261);
    for (let i = 0; i < c.prices.length; i++) {
      const [d, close, adj, vol] = c.prices[i];
      assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(close > 0 && adj > 0 && vol >= 0, `${id} row ${i}`);
      if (i) assert.ok(d > c.prices[i - 1][0], `${id} dates ascend at row ${i}`);
    }
    assert.equal(c.prices[0][0], c.ipo.firstTrade);
    const row = u.included.find((r) => r.ticker === ticker);
    assert.equal(c.ipo.firstTrade, row.firstTrade);
    assert.equal(c.ipo.pricingDate, row.pricingDate);
    assert.equal(c.ipo.proceedsUSD, row.proceedsUSD);
    assert.equal(c.ipo.source.url, row.url424b4);
    assert.ok(Number.isInteger(c.ipo.source.page) && c.ipo.source.page > 0, 'page cite');
    assert.ok(c.ipo.sharesOutPost > 0);
    // offer price is on the same (split-adjusted) basis as the closes: first close within 60% of the offer
    const ratio = c.prices[0][1] / c.ipo.offerPrice;
    assert.ok(ratio > 0.4 && ratio < 2.5, `${id} first close / offer = ${ratio}`);
    if (c.ipo.splitFactor) assert.ok(Math.abs(c.ipo.offerPrice * c.ipo.splitFactor - c.ipo.offerPriceRaw) < 1e-6);
    for (const list of [c.earnings, c.reports]) {
      for (let i = 0; i < list.length; i++) {
        assert.match(list[i].url, /^https:\/\/www\.sec\.gov\/Archives\//);
        if (i) assert.ok(list[i].d >= list[i - 1].d);
      }
    }
    assert.ok(c.earnings.length >= 15, `${id} earnings ${c.earnings.length}`);
    assert.ok(c.reports.length >= 5, `${id} reports ${c.reports.length}`);
    assert.ok(existsSync(join(root, 'research', '424b4', `${id}.txt`)) || !existsSync(join(root, 'research')), '424B4 text saved');
  });
}

// node --test scripts/headlines.test.js
// Blind-card headlines (8 per card) and reveal paragraphs, c1..c8. Re-runs the name filter and the number check live,
// so a stale "pass" flag in the JSON cannot hide a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_IDS, buildBanned, checkHeadlines, checkReveal, checkRevealText, termRegex, topMoves } from './check-headlines.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (id, f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/src', id, f), 'utf8'));

test('eight blind cards c1..c8', () => assert.equal(CARD_IDS.length, 8));

for (const id of CARD_IDS) {
  test(`${id}: exactly 8 headlines, all passing the name filter, dated inside the window`, () => {
    const base = load(id, 'base.json');
    const hs = load(id, 'headlines.json');
    const first = base.prices[0][0];
    const last = base.prices[base.prices.length - 1][0];
    assert.equal(hs.length, 8);
    assert.equal(new Set(hs.map((h) => h.d)).size, 8, 'dates are unique');
    for (const h of hs) {
      assert.equal(h.nameFilter, 'pass', `${h.d} nameFilter`);
      assert.ok(h.d >= first && h.d <= last, `${h.d} inside ${first}..${last}`);
      assert.ok(h.text && h.text.trim().split(/\s+/).length <= 12, `${h.d} has at most 12 words`);
      assert.ok(h.source === 'market' || /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//.test(h.source), `${h.d} source`);
      assert.ok(['pending', 'pass'].includes(h.review), `${h.d} review state`);
      assert.ok(!/!/.test(h.text) && !/recommend/i.test(h.text), `${h.d} copy rules`);
    }
    assert.deepEqual(hs.map((h) => h.d), topMoves(base.prices), 'one headline per 8 largest absolute adjClose moves');
  });

  test(`${id}: name filter re-run finds no banned term`, () => {
    const banned = buildBanned(id, { write: false });
    assert.ok(banned.all.length >= 40, 'banned list is substantial');
    const { errors } = checkHeadlines(id, banned);
    assert.deepEqual(errors, []);
  });

  test(`${id}: reveal paragraph numbers verified against base.json`, () => {
    const rv = load(id, 'reveal.json');
    assert.equal(rv.numbersChecked, true);
    assert.deepEqual(checkReveal(id).errors, []);
    const words = rv.text.trim().split(/\s+/).length;
    assert.ok(words >= 60 && words <= 100, `${words} words`);
  });
}

test('the filter catches what it should', () => {
  assert.ok(termRegex('Airbnb').test('AIRBNB shares jump'));
  assert.ok(termRegex('Host').test('Hosts earn more'));
  assert.ok(!termRegex('Bank').test('banking scrutiny'));
  assert.ok(!termRegex('Chang').test('program changes'));
  const banned = buildBanned('c1', { write: false });
  assert.ok(banned.all.includes('Airbnb') && banned.all.includes('ABNB') && banned.all.includes('Chesky'));
  assert.ok(buildBanned('c8', { write: false }).all.includes('Lyft'));
});

test('the number check rejects invented numbers', () => {
  const base = load('c4', 'base.json');
  const ok = 'Pinterest priced its IPO on April 17, 2019 at $19 a share and closed its first day at $24.40.';
  assert.deepEqual(checkRevealText('c4', base, ok).errors.filter((e) => /number|date/.test(e)), []);
  assert.ok(checkRevealText('c4', base, ok.replace('$24.40', '$25.40')).errors.some((e) => /\$25\.40/.test(e)));
  assert.ok(checkRevealText('c4', base, ok.replace('April 17, 2019', 'April 18, 2018')).errors.some((e) => /date/.test(e)));
  assert.ok(checkRevealText('c4', base, ok + ' It rose 500.0% in a year.').errors.some((e) => /500\.0%/.test(e)));
});

test('the split-adjusted card says so', () => {
  assert.match(load('c6', 'reveal.json').text, /split-adjusted/i);
});

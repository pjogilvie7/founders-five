#!/usr/bin/env node
// Prints the blind-card draw from data/universe.json and checks it against the stored order.
//   node scripts/universe.mjs            print the draw (and fail if the stored order differs)
//   node scripts/universe.mjs --json     print {seed, seedInt, sortedTickers, drawOrder} as JSON
// The draw: seedInt = FNV-1a 32-bit of the seed string; sort tickers alphabetically; Fisher-Yates
// from i = n-1 down to 1 with j = floor(rand()*(i+1)); rand = Mulberry32(seedInt).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fnv1a32, mulberry32, drawOrder } from './lib-hist.mjs';

export { fnv1a32, mulberry32, drawOrder };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadUniverse(path = join(root, 'data', 'universe.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Recompute everything derivable from the included tickers and the seed. */
export function recompute(u) {
  const sortedTickers = u.included.map((r) => r.ticker).sort();
  return { seed: u.seed, seedInt: fnv1a32(u.seed), sortedTickers, drawOrder: drawOrder(sortedTickers, u.seed) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const u = loadUniverse();
  const r = recompute(u);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r));
  } else {
    console.log(`seed        ${r.seed}`);
    console.log(`seedInt     ${r.seedInt} (FNV-1a 32)`);
    console.log(`universe    ${u.included.length} included, ${u.excluded.length} excluded`);
    console.log(`sorted      ${r.sortedTickers.join(' ')}`);
    console.log(`drawOrder   ${r.drawOrder.join(' ')}`);
    console.log('first ten   ' + r.drawOrder.slice(0, 10).map((t, i) => `c${i + 1}=${t}`).join(' '));
  }
  const same = JSON.stringify(r.drawOrder) === JSON.stringify(u.drawOrder) && JSON.stringify(r.sortedTickers) === JSON.stringify(u.sortedTickers);
  if (!same) {
    console.error('MISMATCH: data/universe.json drawOrder/sortedTickers differ from the recomputed draw');
    process.exit(1);
  }
}

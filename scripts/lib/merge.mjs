import { SourceError } from './http.mjs';

const round6 = (x) => Math.round(x * 1e6) / 1e6;

// Append-only merge of daily rows (ascending by date in column 0).
//   stored, fetched: arrays of rows; fetched should start a few days before the last stored date so the two overlap.
//   adjIdx: column holding the adjusted close. closeIdx: column holding the raw close (or null when there is none).
// If a dividend went ex since the last run, Yahoo's adjusted closes shift for all history: the stored history is multiplied by the
// ratio seen on the overlap date (adjusted closes are multiplicative), so the series stays on one basis.
// If the raw close on the overlap date changed (a split), nothing is merged and a SourceError asks for --full.
export function mergeRows(stored, fetched, { adjIdx, closeIdx = null, source = 'yahoo' }) {
  if (!stored.length) return { rows: fetched.slice(), added: fetched.length, rebased: null };
  const last = stored[stored.length - 1];
  const newer = fetched.filter((r) => r[0] > last[0]);
  const overlap = fetched.find((r) => r[0] === last[0]);
  if (!overlap) {
    if (!newer.length) return { rows: stored, added: 0, rebased: null };
    throw new SourceError(source, `fetched rows do not overlap the last stored date ${last[0]}`);
  }
  if (closeIdx != null && Math.abs(overlap[closeIdx] / last[closeIdx] - 1) > 0.002) {
    throw new SourceError(source, `raw close on ${last[0]} changed from ${last[closeIdx]} to ${overlap[closeIdx]} (split?). Run with --full`);
  }
  const ratio = overlap[adjIdx] / last[adjIdx];
  let rows = stored, rebased = null;
  if (Math.abs(ratio - 1) > 2e-5) {
    rebased = ratio;
    rows = stored.map((r) => { const c = r.slice(); c[adjIdx] = round6(r[adjIdx] * ratio); return c; });
  }
  return { rows: rows.concat(newer), added: newer.length, rebased };
}

// Append-only merge for [d, value] series from FRED (no overlap needed; fetched is already filtered to d > last).
export function appendSeries(stored, fetched) {
  const last = stored.length ? stored[stored.length - 1][0] : '';
  const add = fetched.filter((r) => r[0] > last);
  return { rows: stored.concat(add), added: add.length };
}

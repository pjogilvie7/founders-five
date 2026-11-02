// percentile.js: 500 random legal strategies on the same card and seat (PRD 4.8, should-have).
// Deterministic: the PRNG is Mulberry32 seeded from FNV-1a of the string `${card.id}|${seat}` (or the caller's seed string).
// "Legal" means every action is first checked with canDo, and the engine applies it only if it accepts it.
// The synchronous function is for Node and tests. The async one yields between small batches so the page stays responsive.
import { createGame, canDo, runWithPolicy, score } from "./sim.js";

export const DEFAULT_N = 500;
export const BATCH = 25;

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ["sell", "adoptPlan", "cancelPlan", "collar", "unwindCollar", "pledge", "unpledge", "draw", "repay", "deposit", "withdraw", "buyPut", "exchange"];

// One random strategy = a personality (how often it acts, how much it favours each move, how big the moves are) plus a
// stream of random choices. Different personalities are what spread the results from "does almost nothing" to "sells and
// hedges constantly". Every action is gated by canDo.
export function randomPolicy(rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const rate = 0.002 + 0.1 * rnd() * rnd();           // chance of acting on any day
  const w = {};
  let total = 0;
  for (const t of TYPES) { w[t] = -Math.log(1 - rnd()) * (t === "sell" ? 2.2 : 1); total += w[t]; }
  const kind = () => { let x = rnd() * total; for (const t of TYPES) { x -= w[t]; if (x <= 0) return t; } return "sell"; };
  const sizeBias = 0.15 + 0.85 * rnd();               // typical share of the maximum used per move
  const frac = () => Math.min(1, Math.max(0.02, sizeBias * (0.4 + 1.2 * rnd())));
  const answers = {                                   // leanings for the three choices the clock forces
    house: [rnd(), rnd(), rnd()],                     // cash, credit, sell
    margin: [0.6 + rnd(), rnd() * 0.6, rnd() * 0.4],  // post, sell, wait
    expiry: [rnd(), rnd()],                           // roll, end
  };
  const weighted = (ws) => { let x = rnd() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; } return 0; };

  const make = (type, s) => {
    const g = canDo(s, type, {});
    if (type === "cancelPlan") return g.allowed ? { type } : null;
    if (type === "unwindCollar") return s.collars.length ? { type, id: pick(s.collars).id } : null;
    if (type === "adoptPlan") return g.allowed ? { type, pct: pick([2, 5, 10]), months: pick([6, 12, 18]) } : null;
    if (!g.allowed || !g.max || g.max < 1) return null;
    const part = (max) => Math.max(1, Math.floor(max * frac()));
    switch (type) {
      case "sell": case "pledge": case "unpledge": return { type, shares: part(g.max) };
      case "collar": return { type, shares: part(g.max), tenorMonths: pick([6, 12, 24]), putPct: pick([0.8, 0.85, 0.9]) };
      case "buyPut": return { type, shares: Math.max(1, Math.floor(part(g.max) / 4)), putPct: pick([0.8, 0.85, 0.9]), tenorMonths: pick([6, 12]) };
      case "exchange": return { type, shares: Math.max(1, Math.floor(part(g.max) / 3)) };
      case "draw": case "repay": case "deposit": case "withdraw": return { type, amount: Math.max(1, Math.floor(g.max * frac())) };
      default: return null;
    }
  };

  const step = (s) => {
    if (s.done || rnd() > rate) return [];
    const a = make(kind(), s);
    return a ? [a] : [];
  };
  return {
    start: step,
    day: step,
    respond(s, e) {
      if (e.type === "house") return { type: "house", choice: ["cash", "credit", "sell"][weighted(answers.house)] };
      if (e.type === "marginCall") return { type: "marginCall", choice: ["post", "sell", "wait"][weighted(answers.margin)] };
      return { type: "collarExpiry", choice: ["roll", "end"][weighted(answers.expiry)] };
    },
  };
}

function seedString({ card, seat, seed }) {
  return seed != null ? String(seed) : `${card.id}|${seat}`;
}

// Builds a runner: run(k) returns the k-th result; k must be called in order 0..n-1 (the sub-seeds come from one stream).
function makeRunner({ card, seat, market, spcxOptions = null, seed }) {
  const start = createGame({ card, seat, market, spcxOptions });
  const master = mulberry32(fnv1a(seedString({ card, seat, seed })));
  return () => {
    const sub = Math.floor(master() * 4294967296);
    const end = runWithPolicy(start, randomPolicy(mulberry32(sub)));
    const sc = score(end);
    return { afterTaxWealth: sc.afterTaxWealth, sharpe: sc.sharpe };
  };
}

/** n random legal strategies, synchronously. Same inputs give the same output. */
export function randomStrategies({ card, seat, market, spcxOptions = null, n = DEFAULT_N, seed, onProgress }) {
  const run = makeRunner({ card, seat, market, spcxOptions, seed });
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push(run());
    if (onProgress && (k + 1) % BATCH === 0) onProgress((k + 1) / n);
  }
  return out;
}

const nextTick = () => new Promise((res) => setTimeout(res, 0));

/** The same results without holding the page: runs in batches of up to `batch` strategies (and about 12 ms), then yields. */
export async function randomStrategiesAsync({ card, seat, market, spcxOptions = null, n = DEFAULT_N, seed, batch = BATCH, onProgress, shouldStop }) {
  const run = makeRunner({ card, seat, market, spcxOptions, seed });
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const out = [];
  while (out.length < n) {
    if (shouldStop && shouldStop()) return null;
    const t0 = now();
    let k = 0;
    while (out.length < n && k < batch && (k === 0 || now() - t0 < 12)) { out.push(run()); k++; }
    if (onProgress) onProgress(out.length / n);
    await nextTick();
  }
  return out;
}

let jobId = 0;

/**
 * For the browser: tries a Web Worker (engine/percentile.worker.js), and if that cannot start runs the batches on the page's
 * thread, yielding between them. Returns a promise of [{afterTaxWealth, sharpe}]. `cancel()` on the returned promise stops it.
 */
export function randomStrategiesInBackground(params, { onProgress } = {}) {
  let stopped = false, worker = null;
  const promise = new Promise((resolve, reject) => {
    const fallback = () => {
      if (stopped) return resolve(null);
      randomStrategiesAsync({ ...params, onProgress, shouldStop: () => stopped }).then(resolve, reject);
    };
    if (typeof Worker === "undefined") { fallback(); return; }
    const id = ++jobId;
    try {
      worker = new Worker(new URL("./percentile.worker.js", import.meta.url), { type: "module" });
    } catch { fallback(); return; }
    let settled = false;
    const end = () => { try { worker.terminate(); } catch { /* gone */ } worker = null; };
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.id !== id || settled) return;
      if (m.progress != null && onProgress) onProgress(m.progress);
      if (m.done) { settled = true; end(); resolve(m.results); }
      if (m.error) { settled = true; end(); fallback(); }
    };
    worker.onerror = () => { if (settled) return; settled = true; end(); fallback(); };
    try { worker.postMessage({ id, params: { ...params, onProgress: undefined } }); } catch { settled = true; end(); fallback(); }
  });
  promise.cancel = () => { stopped = true; if (worker) { try { worker.terminate(); } catch { /* gone */ } worker = null; } };
  return promise;
}

/**
 * Percent (0 to 100) of the strategies that the value beats; a tie counts half. Non-finite entries are ignored.
 */
export function percentileOf(value, arr) {
  if (!Number.isFinite(value)) return null;
  let below = 0, equal = 0, n = 0;
  for (const x of arr) {
    if (!Number.isFinite(x)) continue;
    n++;
    if (x < value) below++; else if (x === value) equal++;
  }
  return n ? ((below + 0.5 * equal) / n) * 100 : null;
}

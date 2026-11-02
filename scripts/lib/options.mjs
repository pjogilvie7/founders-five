import { bsPrice, impliedVol, zeroCostCall } from './bs.mjs';
import { parseOption } from './cboe.mjs';
import { daysBetween, addDays } from './io.mjs';

export const MIN_STRIKES = 5;
const R4 = (x) => Math.round(x * 1e4) / 1e4;
const mid = (o) => (o.bid > 0 && o.ask > 0 && o.ask >= o.bid ? (o.bid + o.ask) / 2 : null);

function monthsAfter(d, n) { // asOf + n calendar months
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  dt.setUTCDate(Math.min(day, new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()));
  return dt.toISOString().slice(0, 10);
}

// A quote is usable when two-sided and tight: spread within 9% of mid (or 10 cents). Drops thin expiries such as 2027-10-15.
function usable(o, m) { return m != null && (o.ask - o.bid) <= Math.max(0.10, 0.09 * m); }

// Group the chain: Map expiry -> {calls:[{K, mid, iv}], puts:[...]} with only usable quotes.
function group(chain, spot, asOf, r) {
  const byExp = new Map();
  for (const o of chain.data.options) {
    const p = parseOption(o.option);
    if (!p) continue;
    const m = mid(o);
    if (!usable(o, m)) continue;
    const T = daysBetween(asOf, p.expiry) / 365;
    if (T <= 0) continue;
    let iv = o.iv > 0.05 && o.iv < 3 ? o.iv : null; // file's own iv where present and sane
    if (iv == null) iv = impliedVol({ type: p.type, S: spot, K: p.strike, T, r, price: m });
    if (!byExp.has(p.expiry)) byExp.set(p.expiry, { T, calls: [], puts: [] });
    byExp.get(p.expiry)[p.type === 'call' ? 'calls' : 'puts'].push({ K: p.strike, mid: m, iv });
  }
  for (const [expiry, g] of byExp) {
    g.calls.sort((a, b) => a.K - b.K); g.puts.sort((a, b) => a.K - b.K);
    // The informative side is out of the money: puts at or below spot, calls above it. An expiry with fewer than MIN_STRIKES
    // usable strikes there (such as 2027-10-15, three) cannot support a smile or an interpolation in time: drop it.
    const usableStrikes = g.puts.filter((p) => p.K <= spot).length + g.calls.filter((c) => c.K > spot).length;
    if (usableStrikes < MIN_STRIKES) byExp.delete(expiry);
  }
  return byExp;
}

// Linear interpolation of y over sorted points [[x,y]] at x; null when x is outside the range.
function interp(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x >= x0 && x <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return null;
}

// Call strike whose mid equals the given price (call mids fall as strike rises).
function callStrikeForPrice(calls, price) {
  const pts = calls.map((c) => [c.mid, c.K]).sort((a, b) => a[0] - b[0]);
  return interp(pts, price);
}

// Zero-cost call strike at one year implied by listed mids: for each expiry find the put mid at Kp (interpolating between listed
// strikes), then the call strike with the same mid; then interpolate in time between the two expiries that bracket one year.
export function marketCap(chain, { spot, floor, asOf, r }) {
  const g = group(chain, spot, asOf, r);
  const per = [];
  for (const [expiry, e] of g) {
    if (e.T < 0.5 || e.T > 2) continue;
    const putMid = interp(e.puts.map((p) => [p.K, p.mid]), floor);
    if (putMid == null) continue;
    const Kc = callStrikeForPrice(e.calls.filter((c) => c.K > spot), putMid);
    if (Kc == null) continue;
    per.push({ expiry, T: e.T, putMid, Kc });
  }
  per.sort((a, b) => a.T - b.T);
  const below = per.filter((x) => x.T <= 1).pop();
  const above = per.find((x) => x.T >= 1);
  if (!below || !above) return { cap: null, per };
  const w = above.T === below.T ? 0 : (1 - below.T) / (above.T - below.T);
  return { cap: below.Kc + w * (above.Kc - below.Kc), per, bracket: [below.expiry, above.expiry] };
}

// Derived numbers only; the raw chain never leaves this function.
export function deriveOptions(chain, { spot, asOf, rate /* percent */ }) {
  const r = rate / 100;
  const floor = 0.85 * spot;
  const iv30 = chain.data.iv30;
  if (!(iv30 > 5 && iv30 < 400)) throw new Error(`iv30 out of range: ${iv30}`);
  const vol = iv30 / 100;
  const model = zeroCostCall({ S: spot, Kp: floor, T: 1, r, vol });
  const mc = marketCap(chain, { spot, floor, asOf, r });
  const g = group(chain, spot, asOf, r);
  const lo = monthsAfter(asOf, 5), hi = monthsAfter(asOf, 30);
  const smile = [];
  for (const [expiry, e] of [...g].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (expiry < lo || expiry > hi) continue;
    // out-of-the-money side only: puts at or below spot, calls above it (the liquid, informative side)
    const pts = [...e.puts.filter((p) => p.K <= spot), ...e.calls.filter((c) => c.K > spot)];
    for (const p of pts) {
      const strikePct = p.K / spot;
      if (strikePct < 0.5 || strikePct > 1.8 || p.iv == null) continue;
      smile.push({ expiry, strikePct: R4(strikePct), iv: R4(p.iv) });
    }
  }
  return {
    asOf, iv30, units: { iv30: 'percent', 'smile.iv': 'decimal', 'smile.strikePct': 'strike / spot' },
    smile,
    streetCheck: {
      modelCap: +model.Kc.toFixed(2),
      marketCap: mc.cap == null ? null : +mc.cap.toFixed(2),
      floor: +floor.toFixed(2), spot, vol: R4(vol), rate,
      method: 'Model cap: zero-cost call for the 85% put, flat vol = 30-day implied vol, one year, Treasury 1-year rate, bisection to $0.01. Market cap: same put priced from listed mid quotes, call strike read from listed call mids, interpolated between the two expiries that bracket one year.',
      asOf,
      marketBracket: mc.bracket || null,
    },
  };
}

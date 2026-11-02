// metrics.js: Sharpe, max drawdown, XIRR (PRD 4.8).
import { daysBetween } from "./calendar.js";

// Daily risk-free rate from an annual percent (4.06 means 4.06%).
export function dailyRf(pct) {
  return Math.pow(1 + pct / 100, 1 / 252) - 1;
}

// mean(R - rf) / sampleStdev(R - rf) * sqrt(252). rfs is an array (same length) or a single number. n < 2 or zero stdev gives 0.
export function sharpe(returns, rfs = 0) {
  const n = returns.length;
  if (n < 2) return 0;
  const ex = returns.map((r, k) => r - (Array.isArray(rfs) ? rfs[k] : rfs));
  const mean = ex.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (const x of ex) ss += (x - mean) * (x - mean);
  const sd = Math.sqrt(ss / (n - 1));
  return sd === 0 ? 0 : (mean / sd) * Math.sqrt(252);
}

// Largest peak-to-trough fall of a value series. pct is negative (-0.25) or 0 when there is no fall.
export function maxDrawdown(values, dates) {
  let peakI = 0, bestPeak = 0, bestTrough = 0, worst = 0;
  for (let j = 0; j < values.length; j++) {
    if (values[j] > values[peakI]) peakI = j;
    const dd = values[j] / values[peakI] - 1;
    if (dd < worst) { worst = dd; bestPeak = peakI; bestTrough = j; }
  }
  return {
    pct: worst,
    peakIndex: bestPeak,
    troughIndex: bestTrough,
    peakDate: dates ? dates[bestPeak] ?? null : null,
    troughDate: dates ? dates[bestTrough] ?? null : null,
  };
}

// Annualized IRR on dated flows [{d, amount}], 365-day year. Newton from 0.1, bisection on [-0.9999, 10] as
// fallback. Returns NaN when no rate in the bracket solves it (e.g. all flows share a sign).
export function xirr(flows) {
  if (!flows || flows.length < 2) return NaN;
  const d0 = flows.reduce((m, f) => (f.d < m ? f.d : m), flows[0].d);
  const ts = flows.map((f) => daysBetween(d0, f.d) / 365);
  const as = flows.map((f) => f.amount);
  const f = (r) => { let s = 0; for (let k = 0; k < as.length; k++) s += as[k] * Math.pow(1 + r, -ts[k]); return s; };
  const df = (r) => { let s = 0; for (let k = 0; k < as.length; k++) s -= ts[k] * as[k] * Math.pow(1 + r, -ts[k] - 1); return s; };
  const LO = -0.9999, HI = 10, TOL = 1e-10;

  let r = 0.1, ok = false;
  for (let it = 0; it < 100; it++) {
    const v = f(r), d = df(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= LO || next >= HI) break;
    if (Math.abs(next - r) < TOL) { r = next; ok = true; break; }
    r = next;
  }
  if (ok) return r;

  let a = LO, b = HI, fa = f(a), fb = f(b);
  if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
  for (let it = 0; it < 300 && b - a > TOL; it++) {
    const m = (a + b) / 2, fm = f(m);
    if (fm === 0) return m;
    if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

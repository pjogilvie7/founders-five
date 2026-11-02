// pricing.js: Black-Scholes (European, no dividends), zero-cost collar solver, volatility rules (PRD 4.7).
// r is the annual rate as a decimal (0.04), used as a continuous rate: discount factor e^{-rT}.

// Standard normal CDF. Hart / West (2005) double-precision rational approximation, absolute error ~1e-15.
export function normCdf(x) {
  const ax = Math.abs(x);
  let c;
  if (ax > 37) {
    c = 0;
  } else {
    const e = Math.exp(-ax * ax / 2);
    if (ax < 7.07106781186547) {
      let b = 3.52624965998911e-2 * ax + 0.700383064443688;
      b = b * ax + 6.37396220353165;
      b = b * ax + 33.912866078383;
      b = b * ax + 112.079291497871;
      b = b * ax + 221.213596169931;
      b = b * ax + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * ax + 1.75566716318264;
      b = b * ax + 16.064177579207;
      b = b * ax + 86.7807322029461;
      b = b * ax + 296.564248779674;
      b = b * ax + 637.333633378831;
      b = b * ax + 793.826512519948;
      b = b * ax + 440.413735824752;
      c = c / b;
    } else {
      let b = ax + 0.65;
      b = ax + 4 / b;
      b = ax + 3 / b;
      b = ax + 2 / b;
      b = ax + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

// European option value per share. type "put" | "call". T in years; T <= 0 or vol <= 0 gives intrinsic/forward value.
export function bsPrice({ type, S, K, T, r, vol }) {
  const df = Math.exp(-r * T);
  if (!(T > 0) || !(vol > 0)) {
    const fwd = S - K * df;
    return type === "put" ? Math.max(0, -fwd) : Math.max(0, fwd);
  }
  const sd = vol * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + vol * vol / 2) * T) / sd;
  const d2 = d1 - sd;
  if (type === "call") return S * normCdf(d1) - K * df * normCdf(d2);
  return K * df * normCdf(-d2) - S * normCdf(-d1);
}

export function putMark({ S, K, T, r, vol }) {
  return bsPrice({ type: "put", S, K, T, r, vol });
}

// Mark of a long put + short call, per share (holder's view): put value minus call value.
export function collarMark({ S, Kp, Kc, T, r, volPut, volCall }) {
  return bsPrice({ type: "put", S, K: Kp, T, r, vol: volPut }) -
         bsPrice({ type: "call", S, K: Kc, T, r, vol: volCall });
}

// Call strike that makes the collar free: call(Kc, volCall) = put(Kp, volPut). Bisection on [S, 5S] until the
// bracket is under $0.01; Kc is the midpoint.
export function zeroCostCall({ S, Kp, T, r, volPut, volCall }) {
  const putPrice = bsPrice({ type: "put", S, K: Kp, T, r, vol: volPut });
  const call = (K) => bsPrice({ type: "call", S, K, T, r, vol: volCall });
  let lo = S, hi = 5 * S;
  while (hi - lo >= 0.01) {
    const mid = (lo + hi) / 2;
    if (call(mid) > putPrice) lo = mid; else hi = mid; // call value falls as the strike rises
  }
  const Kc = (lo + hi) / 2;
  return { Kc, putPrice, callPrice: call(Kc) };
}

// Annualized sample stdev of daily log returns. Fewer than 2 returns gives 0.
export function realizedVol(closes) {
  const n = closes.length - 1;
  if (n < 2) return 0;
  let sum = 0;
  const rets = new Array(n);
  for (let k = 1; k <= n; k++) { rets[k - 1] = Math.log(closes[k] / closes[k - 1]); sum += rets[k - 1]; }
  const mean = sum / n;
  let ss = 0;
  for (const x of rets) ss += (x - mean) * (x - mean);
  return Math.sqrt(ss / (n - 1)) * Math.sqrt(252);
}

// Base vol on day i: realized vol over the 60 log returns ending at i (or since index 0 if fewer), needing at
// least 20 returns (else 0.30); floored at 0.30; then times 1.10.
export function baseVol(closes, i) {
  const start = Math.max(0, i - 60);
  const nRet = i - start;
  let rv = 0.30;
  if (nRet >= 20) rv = realizedVol(closes.slice(start, i + 1));
  return Math.max(rv, 0.30) * 1.10;
}

export function skewVols(base) {
  return { put: base + 0.015, call: base - 0.015 };
}

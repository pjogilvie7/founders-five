// Tiny Black-Scholes, no dividends. r is the annual rate as a decimal, continuous compounding. Own copy: engine/ is owned elsewhere.
export function normCdf(x) {
  // Numerical Recipes erfc approximation, fractional error below 1.2e-7 everywhere
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const erfc = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - 0.5 * erfc : 0.5 * erfc;
}

export function bsPrice({ type, S, K, T, r, vol }) {
  if (T <= 0 || vol <= 0) return Math.max(0, type === 'call' ? S - K : K - S);
  const sd = vol * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * vol * vol) * T) / sd;
  const d2 = d1 - sd;
  const df = Math.exp(-r * T);
  return type === 'call' ? S * normCdf(d1) - K * df * normCdf(d2) : K * df * normCdf(-d2) - S * normCdf(-d1);
}

// Implied vol by bisection on [0.01, 5]; null if the price is outside the no-arbitrage range.
export function impliedVol({ type, S, K, T, r, price }) {
  let lo = 0.01, hi = 5;
  if (!(price > bsPrice({ type, S, K, T, r, vol: lo })) || price >= bsPrice({ type, S, K, T, r, vol: hi })) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bsPrice({ type, S, K, T, r, vol: mid }) < price) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Zero-cost call: strike Kc in [S, 5S] (bisection to $0.01) where call(Kc) = put(Kp). Flat vol on both legs.
export function zeroCostCall({ S, Kp, T, r, vol }) {
  const putPrice = bsPrice({ type: 'put', S, K: Kp, T, r, vol });
  let lo = S, hi = 5 * S;
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (bsPrice({ type: 'call', S, K: mid, T, r, vol }) > putPrice) lo = mid; else hi = mid;
  }
  const Kc = (lo + hi) / 2;
  return { Kc, putPrice, callPrice: bsPrice({ type: 'call', S, K: Kc, T, r, vol }) };
}

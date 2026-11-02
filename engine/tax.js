// tax.js: flat 23.8% on realized gains (20% federal + 3.8% NIIT).
export const RATE = 0.238;

// proceeds = gross shares*price; cost = proceeds*costRate; gain = proceeds - cost - shares*basis;
// tax = RATE*gain (negative means a loss that reduces cumulative tax owed).
export function saleTax({ shares, price, basis, costRate = 0 }) {
  const proceeds = shares * price;
  const cost = proceeds * costRate;
  const gain = proceeds - cost - shares * basis;
  return { proceeds, cost, gain, tax: RATE * gain };
}

// Tax owed on cumulative net realized gain G (losses carry; nothing owed while G <= 0).
export function taxOwed(cumulativeRealized) {
  return RATE * Math.max(0, cumulativeRealized);
}

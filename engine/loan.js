// loan.js: the single-stock credit line (PRD 4.5). Pure math, no state.

export const ADVANCE = 0.25;   // max advance, share of pledged value
export const CALL_LTV = 0.35;  // maintenance call above this
export const CURE_LTV = 0.25;  // a cure brings the loan back to this

export function maxAdvance(collateralValue) {
  return ADVANCE * Math.max(0, collateralValue);
}

// Loan-to-value. No debt is 0; debt with no collateral is Infinity.
export function ltv(balance, collateralValue) {
  if (!(balance > 0)) return 0;
  if (!(collateralValue > 0)) return Infinity;
  return balance / collateralValue;
}

// Amount to repay so the loan is 25% of the collateral.
export function callCure(balance, collateralValue) {
  return Math.max(0, balance - CURE_LTV * Math.max(0, collateralValue));
}

// Fall in the collateral price that takes a loan at 25% to the 35% call: 1 - 0.25/0.35 = 28.57%.
export function fallToCall(from = CURE_LTV, to = CALL_LTV) {
  return 1 - from / to;
}

// Cash applied to the loan per share sold: sale price less the 0.25% cost, less tax on the gain.
export function netPerShare(price, costRate, taxRate, basis) {
  const net = price * (1 - costRate);
  return net - taxRate * Math.max(0, net - basis);
}

// Shares the bank sells so that the loan after net proceeds is 25% of the remaining collateral:
//   (balance - n*a) = 0.25 * (pledged - n) * price,  a = netPerShare  =>  n = (balance - 0.25*C) / (a - 0.25*price)
// Rounded up to whole shares and capped at the pledged shares.
export function forcedSaleShares(balance, price, pledgedShares, costRate, taxRate, basis) {
  const C = pledgedShares * price;
  if (!(balance > CURE_LTV * C)) return 0;
  const a = netPerShare(price, costRate, taxRate, basis);
  const denom = a - CURE_LTV * price;
  if (!(denom > 0)) return pledgedShares;
  const n = Math.ceil((balance - CURE_LTV * C) / denom - 1e-9);
  return Math.min(pledgedShares, Math.max(0, n));
}

export const loanRate = (sofrPct) => (sofrPct + 2) / 100;       // SOFR + 2.00%
export const overdraftRate = (sofrPct) => (sofrPct + 4) / 100;  // SOFR + 4.00%

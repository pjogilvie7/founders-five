// debrief.js: the three templated paragraphs, the verdict line and the achievement list (PRD 4.9, 4.10).
// Plain, second person, no advice, no exclamation marks. Every number comes from the state or the score.
import { money, commas, fmtLong } from "./rules.js";

export const ACHIEVEMENTS = {
  "inside-the-window": { title: "Inside the Window", lesson: "You made your first sale in an open trading window." },
  "cooling-off": { title: "Cooling Off", lesson: "A 10b5-1 plan went live after its cooling-off period." },
  "through-the-blackout": { title: "Through the Blackout", lesson: "A plan sold while the trading window was closed." },
  "floor-plan": { title: "Floor Plan", lesson: "You put a collar on released shares." },
  "street-smart": { title: "Street Smart", lesson: "You opened the Street check." },
  "cured": { title: "Cured", lesson: "You met a margin call with cash." },
  "seal-breaker": { title: "Seal Breaker", lesson: "You watched every lockup tranche release." },
  "diversified": { title: "Diversified", lesson: "Less than half of your wealth sat in the stock." },
  "tax-aware": { title: "Tax Aware", lesson: "You paid less tax than The Seller and ended wealthier." },
  "beat-holder": { title: "Beat The Holder", lesson: "You beat The Holder on at least 3 of 4 measures." },
  "beat-seller": { title: "Beat The Seller", lesson: "You beat The Seller on at least 3 of 4 measures." },
  "beat-playbook": { title: "Beat The Playbook", lesson: "You beat The Playbook on at least 3 of 4 measures." },
};

export const BOT_NAMES = { holder: "The Holder", seller: "The Seller", playbook: "The Playbook" };

// The scoreboard shows Sharpe to one decimal, max drawdown and IRR as a percent to one decimal, and wealth in dollars
// ($131.4M from $10M up, $1.23B from $1B up, whole dollars below $10M). Two scores that show the same number are tied.
const shown = {
  sharpe: (x) => Number(x.toFixed(1)),
  maxDrawdown: (x) => Number((x * 100).toFixed(1)),
  irr: (x) => Number((x * 100).toFixed(1)),
  afterTaxWealth: (x) => {
    const a = Math.abs(x), sign = x < 0 ? -1 : 1;
    if (a >= 1e9) return sign * Number((a / 1e9).toFixed(2)) * 1e9;
    if (a >= 1e7) return sign * Number((a / 1e6).toFixed(1)) * 1e6;
    return Math.round(x);
  },
};
const finite = (x) => typeof x === "number" && Number.isFinite(x);

// How many of the four measures `a` beats `b` on: Sharpe, max drawdown (shallower), after-tax IRR, after-tax wealth.
// Compared at the displayed precision, so a near-tie is a tie: neither side wins it.
export function compare(a, b) {
  const pick = {
    sharpe: [a.sharpe, b.sharpe],
    maxDrawdown: [a.maxDrawdown && a.maxDrawdown.pct, b.maxDrawdown && b.maxDrawdown.pct],
    irr: [a.irr, b.irr],
    afterTaxWealth: [a.afterTaxWealth, b.afterTaxWealth],
  };
  const wins = {}, ties = {};
  for (const k of Object.keys(pick)) {
    const [x, y] = pick[k];
    const fx = finite(x), fy = finite(y);
    if (!fx && !fy) { wins[k] = false; ties[k] = true; continue; }
    if (fx !== fy) { wins[k] = fx; ties[k] = false; continue; }
    const sx = shown[k](x), sy = shown[k](y);
    wins[k] = sx > sy;
    ties[k] = sx === sy;
  }
  return { wins, ties, count: Object.values(wins).filter(Boolean).length, tied: Object.values(ties).filter(Boolean).length };
}

export function achievements(state, sc, botScores) {
  const earned = new Set(state.flags.achievements || []);
  if (botScores) {
    for (const [id, key] of [["beat-holder", "holder"], ["beat-seller", "seller"], ["beat-playbook", "playbook"]]) {
      if (botScores[key] && compare(sc, botScores[key]).count >= 3) earned.add(id);
    }
    const s = botScores.seller;
    if (s && sc.taxesPaid < s.taxesPaid && sc.afterTaxWealth > s.afterTaxWealth) earned.add("tax-aware");
  }
  return Object.keys(ACHIEVEMENTS).filter((id) => earned.has(id));
}

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
const signedPct = (x) => `${x >= 0 ? "up" : "down"} ${Math.abs(x * 100).toFixed(0)}%`;

export function debrief(state, sc, botScores = {}) {
  const h = state.history;
  const closes = h.map((r) => r.close);
  const first = closes[0], last = closes[closes.length - 1];
  const peak = Math.max(...closes), trough = Math.min(...closes);
  const peakDay = h[closes.indexOf(peak)].d, troughDay = h[closes.indexOf(trough)].d;
  const st = state.stats;
  const days = h.length;
  const unit = state.blind ? "indexed to $100 at the offer" : "dollars a share";
  const px = (x) => `$${x.toFixed(2)}`;
  const when = (d) => (state.blind ? `day ${h.findIndex((r) => r.d === d) + 1}` : fmtLong(d));

  // 1. What happened to the stock
  const p1 = `Over ${commas(days)} trading days the stock went from ${px(first)} to ${px(last)} (${signedPct(last / first - 1)}, ${unit}). ` +
    `Its highest close was ${px(peak)} on ${when(peakDay)} and its lowest was ${px(trough)} on ${when(troughDay)}. ` +
    `Your wealth ${sc.finalW - h[0].W >= 0 ? "rose" : "fell"} by ${money(Math.abs(sc.finalW - h[0].W))} over the card (spending is added back when returns are measured), with a worst fall of ${pct1(-sc.maxDrawdown.pct)} ` +
    `${sc.maxDrawdown.peakDate ? `from ${when(sc.maxDrawdown.peakDate)} to ${when(sc.maxDrawdown.troughDate)}` : ""}.`;

  // 2. What each of your tools did
  const bits = [];
  if (st.sells > 0) bits.push(`You sold ${commas(st.sharesSold)} shares in ${st.sells} ${st.sells === 1 ? "sale" : "sales"} for ${money(st.saleGross)} before the 0.25% cost.`);
  if (st.planSells > 0) bits.push(`Your 10b5-1 plan sold ${commas(st.planShares)} shares in ${st.planSells} ${st.planSells === 1 ? "sale" : "sales"}${st.blackoutPlanSale ? ", some of them while the window was closed" : ""}.`);
  if (st.collarCount > 0) bits.push(`You opened ${st.collarCount} ${st.collarCount === 1 ? "collar" : "collars"}; settled and unwound, they ${st.collarNet >= 0 ? "paid you" : "cost you"} ${money(Math.abs(st.collarNet))}.`);
  if (st.interest > 0 || st.drawn > 0) bits.push(`The credit line charged ${money(st.interest)} of interest${st.marginCalls ? ` and issued ${st.marginCalls} maintenance ${st.marginCalls === 1 ? "call" : "calls"}` : ""}.`);
  if (st.forced.length) bits.push(`The bank sold ${commas(st.forced.reduce((a, f) => a + f.shares, 0))} pledged shares at the close, ignoring the trading window, and the sales were taxed.`);
  if (st.putNet !== 0 || st.putCount > 0) bits.push(`Your protective puts ${st.putNet >= 0 ? "paid you" : "cost you"} ${money(Math.abs(st.putNet))} net of premiums.`);
  if (st.exchangeContrib > 0) bits.push(`You put ${commas(st.exchangeContrib)} shares into the exchange fund, which stays locked beyond the end of the card.`);
  if (!bits.length) bits.push("You made no sales and used none of the tools, so your wealth followed the stock.");
  bits.push(`You paid ${money(sc.taxesPaid)} of tax during the card and would owe about ${money(Math.max(0, sc.unrealizedTax))} more if you sold everything at the end.`);
  if (st.dividends > 0) bits.push(`The stock paid ${money(st.dividends)} in dividends on your shares, taxed at 23.8%.`);
  if (state.flags.houseDone) bits.push("You paid for the house when it came due.");
  const p2 = bits.join(" ");

  // 3. How you compare with the bots, and why
  const lines = [];
  const counts = {};
  for (const key of ["holder", "seller", "playbook"]) {
    const b = botScores[key];
    if (!b) continue;
    const c = compare(sc, b);
    counts[key] = c.count;
    const diff = sc.afterTaxWealth - b.afterTaxWealth;
    lines.push(`${BOT_NAMES[key]} ended with ${money(b.afterTaxWealth)} after tax, ${Math.abs(diff) < 1000 ? "level with you" : diff >= 0 ? "so you finished " + money(diff) + " ahead" : "so you finished " + money(-diff) + " behind"}.`);
  }
  let why = "";
  if (botScores.seller && botScores.holder) {
    const sellerBetter = botScores.seller.afterTaxWealth > botScores.holder.afterTaxWealth;
    why = sellerBetter
      ? "Selling early beat holding on this card, which is the diversification argument: the stock gave back more than the index fund earned."
      : "Holding beat selling on this card: the stock out-earned the index fund after the tax paid on selling, which will not be true of every card.";
  }
  const p3 = `${lines.join(" ")} ${why}`.trim();

  const names = [["holder", "The Holder"], ["seller", "The Seller"], ["playbook", "The Playbook"]].filter(([k]) => counts[k] !== undefined);
  let verdict = "";
  if (names.length === 1) verdict = `You beat ${names[0][1]} on ${counts[names[0][0]]} of 4 measures.`;
  else if (names.length > 1) {
    const parts = names.map(([k, n]) => `${n} on ${counts[k]} of 4`);
    verdict = `You beat ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} measures.`.replace(/ measures\.$/, " measures.");
  }
  return { paragraphs: [p1, p2, p3], verdict, counts };
}

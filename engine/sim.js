// sim.js: the Founder's Five game engine (types.md section 2, PRD 4). Pure functions over a JSON-serializable state.
// No Date.now, no Math.random. act/tick never mutate their input.
import {
  addCalendarDays, daysBetween, addMonths, businessDaysAfter, tradingIndexOnOrAfter,
  windowState, quarterEndIndexes, firstTradingDayOfMonthIndexes,
} from "./calendar.js";
import { bsPrice, zeroCostCall, baseVol, skewVols } from "./pricing.js";
import { dailyRf, sharpe, maxDrawdown, xirr } from "./metrics.js";
import { RATE } from "./tax.js";
import { groupForSeat, seatBlockedReason, trancheShares } from "./lockup.js";
import {
  maxAdvance, ltv as ltvOf, callCure, forcedSaleShares, netPerShare, CALL_LTV, CURE_LTV, loanRate, overdraftRate,
} from "./loan.js";
import {
  fmtShort, fmtWeekday, commas, money, pctText, aboutShares, tradingDateOnOrAfter, dayNumber,
  coolingOff, rule144, rule144ResetOn, smileVol,
} from "./rules.js";
import { ACHIEVEMENTS } from "./debrief.js";

export const START_CASH = 3_000_000;
export const SPEND = 166_667;
export const HOUSE = 10_000_000;
export const COST = 0.0025;          // sale cost, share of proceeds
export const EXCHANGE_MIN = 1_000_000;
export const EXCHANGE_FEE = 0.01;    // per year
export const UNWIND_FEE = 0.01;      // of collar notional
export const CALL_DEADLINE_DAYS = 3; // trading days after the call day; the bank sells at the close of the next trading day
export const MIN_HISTORY = 20;       // trading days of price history before an option can be priced (index of the first day)
export const RULE_PLAN_ACTIVE = "A 10b5-1 plan is active, so new collars and puts are not allowed: a new hedge on the stock would void the plan's defense (Rule 10b5-1(c)(1)(i)(C)). Cancelling the plan lifts the block, and a later plan starts a new cooling-off.";
const EPS = 1e-9;
export const HOUSE_CHOICES = [
  { choice: "cash", label: "Pay from cash and the index fund" },
  { choice: "credit", label: "Draw the credit line" },
  { choice: "sell", label: "Sell shares" },
];

// ---------------------------------------------------------------- context (data that never changes in a game)
const REG = new Map();

function alignSeries(dates, pairs, fallback) {
  const out = new Array(dates.length);
  if (!pairs || !pairs.length) return out.fill(fallback);
  let p = 0, last = pairs[0][1];
  for (let j = 0; j < dates.length; j++) {
    while (p < pairs.length && pairs[p][0] <= dates[j]) { last = pairs[p][1]; p++; }
    out[j] = last;
  }
  return out;
}

export function normalizeCard(card) {
  if (card.normalized) return card;
  const f = 100 / card.ipo.offerPrice;
  return {
    ...card,
    normalized: true,
    ipo: { ...card.ipo, offerPrice: card.ipo.offerPrice * f, sharesOutPost: card.ipo.sharesOutPost / f },
    prices: card.prices.map((r) => [r[0], r[1] * f, r[2] * f, r[3] / f]),
  };
}

function ctxKey(card, seat, market, spcxOptions) {
  const n = card.prices.length;
  let sum = 0;
  for (const r of card.prices) sum += r[1];
  return `${card.id}|${seat}|${n}|${card.prices[n - 1][0]}|${sum.toFixed(4)}|${market && market.spy ? market.spy.length : 0}|${spcxOptions ? 1 : 0}`;
}

function buildCtx(card, seat, market, spcxOptions, group) {
  const prices = card.prices;
  const n = prices.length;
  const dates = prices.map((r) => r[0]);
  const rates = (market && market.rates) || {};
  const total = Math.round(100_000_000 / card.ipo.offerPrice);
  const sched = trancheShares(card, group.id, total);
  const releases = sched.map((r) => ({
    ...r,
    idx: r.date ? tradingIndexOnOrAfter(prices, r.date) : -1,
  }));
  // Limited sale windows (e.g. a 7-trading-day employee window at the IPO): shares from that tranche
  // still free after windowEnd go back under the lockup until the next release of the group.
  const tByIdx = (group.tranches || []);
  releases.forEach((r, k) => {
    const t = tByIdx.find((x) => x.id === r.id) || tByIdx[k];
    if (t && t.windowEnd && r.idx >= 0) {
      const endIdx = tradingIndexOnOrAfter(prices, t.windowEnd);
      const relockIdx = endIdx >= 0 && endIdx + 1 < n ? endIdx + 1 : -1;
      const later = sched.filter((x) => x.status === "resolved" && x.date && x.date > t.windowEnd).map((x) => tradingIndexOnOrAfter(prices, x.date)).filter((x) => x >= 0);
      r.window = { endDate: t.windowEnd, relockIdx, reopenIdx: later.length ? Math.min(...later) : -1 };
    }
  });
  // Cash dividends from the adjusted series: D_t = close_{t-1} * adj_t / adj_{t-1} - close_t, kept when above 0.01% of the close.
  const div = new Array(n).fill(0);
  for (let j = 1; j < n; j++) {
    const c0 = prices[j - 1][1], c1 = prices[j][1], a0 = prices[j - 1][2], a1 = prices[j][2];
    if (a0 > 0 && c1 > 0) {
      const d = (c0 * a1) / a0 - c1;
      if (d > 0.0001 * c1) div[j] = d;
    }
  }
  const first = (card.ipo && card.ipo.firstTrade) || dates[0];
  const headIdx = new Map();
  for (const h of card.headlines || []) {
    const idx = tradingIndexOnOrAfter(prices, h.d);
    if (idx >= 0) { if (!headIdx.has(idx)) headIdx.set(idx, []); headIdx.get(idx).push(h); }
  }
  const ctx = {
    card, seat, group, prices, n, dates, total,
    close: prices.map((r) => r[1]),
    adj: prices.map((r) => r[2]),
    div,
    spy: alignSeries(dates, market && market.spy, 100),
    dgs1mo: alignSeries(dates, rates.dgs1mo, 0),
    dgs1: alignSeries(dates, rates.dgs1, 0),
    sofr: alignSeries(dates, rates.sofr, 0),
    live: !!card.live,
    blind: !!card.blind,
    offer: card.ipo.offerPrice,
    basis: 0.01 * card.ipo.offerPrice,
    firstTrade: first,
    ftdom: new Set(firstTradingDayOfMonthIndexes(prices).filter((j) => j >= 1)),
    qEnd: new Set(quarterEndIndexes(prices)),
    earnings: card.earnings || [],
    reports: card.reports || [],
    releases,
    houseIdx: card.live ? -1 : tradingIndexOnOrAfter(prices, addMonths(first, 18)),
    headIdx,
    spcxOptions: spcxOptions || null,
    volCache: new Map(),
    winCache: new Map(),
  };
  return ctx;
}

export function getCtx(state) {
  const c = REG.get(state.ctxId);
  if (!c) throw new Error("Game data is not loaded for this state. Call attach() with the same card and market, or rebuild it with replay().");
  return c;
}

function baseVolAt(ctx, i) {
  let v = ctx.volCache.get(i);
  if (v === undefined) { v = baseVol(ctx.close, i); ctx.volCache.set(i, v); }
  return v;
}

function windowAt(ctx, i) {
  let w = ctx.winCache.get(i);
  if (!w) {
    w = windowState(ctx.prices, ctx.earnings, i, { live: ctx.live });
    ctx.winCache.set(i, w);
  }
  return w;
}

// Date label: "Aug 6" on the live card, "day 214" on blind cards.
export function labelDate(ctx, d) {
  return ctx.blind ? `day ${dayNumber(ctx.prices, d)}` : fmtShort(d);
}
function labelDateWd(ctx, d) {
  return ctx.blind ? `day ${dayNumber(ctx.prices, d)}` : fmtWeekday(d);
}

// ---------------------------------------------------------------- create / clone
function cloneStats(st) {
  return { ...st, forced: st.forced.map((f) => ({ ...f })) };
}

function cloneState(s) {
  return {
    ...s,
    shares: { ...s.shares },
    index: { ...s.index },
    loan: { ...s.loan, call: s.loan.call ? { ...s.loan.call } : null },
    collars: s.collars.map((c) => ({ ...c, volAdj: { ...c.volAdj } })),
    puts: s.puts.map((p) => ({ ...p })),
    plan: s.plan ? { ...s.plan } : null,
    exchange: s.exchange ? { ...s.exchange } : null,
    tax: { ...s.tax },
    log: s.log.slice(),
    history: s.history.slice(),
    flags: {
      ...s.flags,
      seenTranches: s.flags.seenTranches.slice(),
      firstUse: { ...s.flags.firstUse },
      achievements: s.flags.achievements.slice(),
    },
    pendingQueue: s.pendingQueue.slice(),
    sales144: s.sales144.slice(),
    stats: cloneStats(s.stats),
    opts: { ...s.opts },
    px: { ...s.px },
  };
}

export function createGame({ card, seat, market, spcxOptions = null, opts = {} }) {
  if (card.blind && !card.normalized) card = normalizeCard(card);
  const group = groupForSeat(card, seat);
  if (!group) throw new Error(seatBlockedReason(card, seat));
  const ctx = buildCtx(card, seat, market, spcxOptions, group);
  const ctxId = ctxKey(card, seat, market, spcxOptions);
  REG.set(ctxId, ctx);
  const o = { collaredLending: false, ...opts };
  const s = {
    ctxId,
    cardId: card.id, seat, blind: ctx.blind, live: ctx.live, i: 0, d: ctx.dates[0], done: false,
    total: ctx.total, basis: ctx.basis,
    shares: { locked: ctx.total, free: 0, collared: 0, pledged: 0, sold: 0, exchanged: 0 },
    cash: START_CASH, overdraft: 0, overdraftAccrued: 0,
    index: { units: 0, cost: 0 },
    loan: { balance: 0, accrued: 0, call: null },
    collars: [], puts: [], plan: null, exchange: null,
    tax: { realized: 0, paid: 0 },
    log: [], history: [],
    flags: { houseDone: false, seenTranches: [], firstUse: {}, achievements: [] },
    pendingEvent: null, pendingQueue: [],
    spentToday: 0, nextId: 1, windowOpen: windowAt(ctx, 0).open,
    sales144: [],
    px: { close: ctx.close[0], spy: ctx.spy[0] },
    opts: o,
    stats: {
      sells: 0, sharesSold: 0, saleGross: 0, planSells: 0, planShares: 0, blackoutPlanSale: false,
      collarCount: 0, collarNet: 0, putCount: 0, putNet: 0, interest: 0, overdraftInterest: 0, drawn: 0,
      marginCalls: 0, dividends: 0, forced: [], spendTotal: 0, houseChoice: null, exchangeContrib: 0, curedWithCash: false,
    },
  };
  // Tranches already due on the first day are free from the start, silently.
  for (const r of ctx.releases) {
    if (r.status === "resolved" && r.idx === 0) {
      const n = Math.min(r.shares, s.shares.locked);
      s.shares.locked -= n; s.shares.free += n;
      s.flags.seenTranches.push(r.id);
    }
  }
  pushRow(s, ctx, false);
  return s;
}

// Re-register the context for a state that was serialized and reloaded.
export function attach({ card, seat, market, spcxOptions = null }, state) {
  if (card.blind && !card.normalized) card = normalizeCard(card);
  const group = groupForSeat(card, seat);
  if (!group) throw new Error(seatBlockedReason(card, seat));
  REG.set(ctxKey(card, seat, market, spcxOptions), buildCtx(card, seat, market, spcxOptions, group));
  return state;
}

// ---------------------------------------------------------------- wealth
function indexValue(s, ctx) { return s.index.units * ctx.spy[s.i]; }
function pledgedValue(s, ctx) { return s.shares.pledged * ctx.close[s.i]; }
function loanDebt(s) { return s.loan.balance + s.loan.accrued; }
function taxLiability(s) { return Math.max(0, RATE * Math.max(0, s.tax.realized) - s.tax.paid); }
function stockShares(s) { return s.shares.locked + s.shares.free + s.shares.collared + s.shares.pledged; }

function volsFor(ctx, i, adj) {
  const sv = skewVols(baseVolAt(ctx, i));
  return { put: Math.max(0.01, sv.put + (adj ? adj.put : 0)), call: Math.max(0.01, sv.call + (adj ? adj.call : 0)) };
}

function collarMarkPerShare(s, ctx, c) {
  const i = s.i;
  const S = ctx.close[i];
  const T = Math.max(0, daysBetween(s.d, c.expiry)) / 365;
  const r = ctx.dgs1[i] / 100;
  const v = volsFor(ctx, i, c.volAdj);
  return bsPrice({ type: "put", S, K: c.Kp, T, r, vol: v.put }) - bsPrice({ type: "call", S, K: c.Kc, T, r, vol: v.call });
}

function putMarkPerShare(s, ctx, p) {
  const i = s.i;
  const T = Math.max(0, daysBetween(s.d, p.expiry)) / 365;
  const v = volsFor(ctx, i, null);
  return bsPrice({ type: "put", S: ctx.close[i], K: p.K, T, r: ctx.dgs1[i] / 100, vol: v.put });
}

// The parts of W_t (PRD 4.8). W = sum of the signed parts.
export function wealthParts(state) {
  const ctx = getCtx(state);
  return partsOf(state, ctx);
}
function partsOf(s, ctx) {
  const P = ctx.close[s.i];
  const stock = stockShares(s) * P;
  let collars = 0;
  for (const c of s.collars) collars += c.shares * collarMarkPerShare(s, ctx, c);
  let puts = 0;
  for (const p of s.puts) puts += p.shares * putMarkPerShare(s, ctx, p);
  const index = indexValue(s, ctx);
  const exchange = s.exchange ? s.exchange.value : 0;
  const loan = loanDebt(s);
  const overdraft = s.overdraft + s.overdraftAccrued;
  const tax = taxLiability(s);
  const W = stock + collars + puts + index + exchange + s.cash - loan - overdraft - tax;
  return { stock, collars, puts, index, exchange, cash: s.cash, loan, overdraft, tax, W };
}

// Tax still to come if everything were sold or settled on the last day (PRD 4.8, decision of 2026-11-02):
//   0.238 * max(0, G + U) - tax already paid - tax the ledger still owes
// G is the realized gain in the ledger and U the unrealized gains on shares, the index fund and the exchange fund plus the
// open collars (zero cost, so the whole mark) and puts (mark less premium). Losses net against gains, and tax paid in earlier
// quarters is credited, so paid + owed + this = 0.238 * max(0, G + U) even when a later loss leaves more paid than 0.238 * G.
// The result is floored at minus what the ledger already owes, so a fall in the stock never refunds tax already paid.
export function terminalTax(state) {
  const ctx = getCtx(state);
  return terminalTaxOf(state, ctx);
}
function terminalTaxOf(s, ctx) {
  const P = ctx.close[s.i];
  let U = stockShares(s) * (P - s.basis);
  U += indexValue(s, ctx) - s.index.cost;
  if (s.exchange) U += s.exchange.value - s.exchange.basisShares * s.basis;
  for (const c of s.collars) U += c.shares * collarMarkPerShare(s, ctx, c);
  for (const p of s.puts) U += p.shares * putMarkPerShare(s, ctx, p) - p.premium;
  const G = s.tax.realized;
  const owed = taxLiability(s);
  const raw = RATE * Math.max(0, G + U) - s.tax.paid - owed;
  return { unrealizedTax: Math.max(-owed, raw) || 0, U, G };
}

function pushRow(s, ctx, replace) {
  const W = partsOf(s, ctx).W;
  // A: after-tax net worth, W less the tax still to come on everything unsold (the same figure score() uses on the last day)
  const row = { d: s.d, W, A: W - terminalTaxOf(s, ctx).unrealizedTax, S: s.spentToday, rf: dailyRf(ctx.dgs1mo[s.i]), close: ctx.close[s.i], cash: s.cash };
  if (replace) s.history[s.history.length - 1] = row; else s.history.push(row);
}

// ---------------------------------------------------------------- money movements (mutate the working copy)
function withdrawIndex(s, ctx, amount) {
  const v = indexValue(s, ctx);
  const amt = Math.min(amount, v);
  if (!(amt > 0)) return { got: 0, gain: 0 };
  const frac = amt / v;
  const costOut = s.index.cost * frac;
  const gain = amt - costOut;
  if (frac >= 1 - 1e-12) { s.index.units = 0; s.index.cost = 0; }
  else { s.index.units -= s.index.units * frac; s.index.cost -= costOut; }
  s.tax.realized += gain;
  return { got: amt, gain };
}

function headroom(s, ctx) {
  return Math.max(0, maxAdvance(pledgedValue(s, ctx)) - loanDebt(s));
}

// Source order: cash, index fund (taxed, average cost), credit line headroom, overdraft.
function pay(s, ctx, amount, { credit = true, overdraft = true } = {}) {
  const r = { cash: 0, index: 0, indexGain: 0, credit: 0, overdraft: 0, short: 0 };
  let need = amount;
  const c = Math.min(Math.max(0, s.cash), need);
  s.cash -= c; r.cash = c; need -= c;
  if (need > EPS) { const w = withdrawIndex(s, ctx, need); r.index = w.got; r.indexGain = w.gain; need -= w.got; }
  if (need > EPS && credit) {
    const t = Math.min(headroom(s, ctx), need);
    if (t > 0) { s.loan.balance += t; s.stats.drawn += t; r.credit = t; need -= t; }
  }
  if (need > EPS) {
    if (overdraft) { s.overdraft += need; r.overdraft = need; } else r.short = need;
  }
  return r;
}

function payText(what, amount, r) {
  const parts = [];
  if (r.cash > 0.005) parts.push({ k: "cash", t: `${money(r.cash)} from cash` });
  if (r.index > 0.005) parts.push({ k: "index", t: `${money(r.index)} from the index fund${r.indexGain > 0.005 ? "; the gain is taxed at quarter end" : ""}` });
  if (r.credit > 0.005) parts.push({ k: "credit", t: `${money(r.credit)} from the credit line` });
  if (r.overdraft > 0.005) parts.push({ k: "over", t: `${money(r.overdraft)} on the overdraft at SOFR + 4.00%` });
  if (!parts.length) return `Paid ${what} ${money(amount)}.`;
  if (parts.length === 1) {
    const only = parts[0];
    const t = only.t.replace(/^\$[\d.,]+M? /, "");
    return `Paid ${money(amount)}${what ? " " + what : ""} ${t}.`.replace(/\s+/g, " ");
  }
  return `Paid ${money(amount)}${what ? " " + what : ""}: ${parts.map((p) => p.t).join(", ")}.`.replace(/\s+/g, " ");
}

// Money in: clears the overdraft first, then lands in cash.
function receive(s, amount) {
  let x = amount;
  if (x > 0 && s.overdraftAccrued > 0) { const t = Math.min(x, s.overdraftAccrued); s.overdraftAccrued -= t; x -= t; }
  if (x > 0 && s.overdraft > 0) { const t = Math.min(x, s.overdraft); s.overdraft -= t; x -= t; }
  if (x > 0) s.cash += x;
}

function repayLoan(s, amount) {
  let x = Math.min(amount, loanDebt(s));
  const applied = x;
  const a = Math.min(x, s.loan.accrued); s.loan.accrued -= a; x -= a;
  s.loan.balance -= x;
  if (s.loan.balance < 1e-7) s.loan.balance = Math.max(0, s.loan.balance);
  return applied;
}

function sweepOverdraft(s) {
  if (s.cash > 0 && (s.overdraft > 0 || s.overdraftAccrued > 0)) {
    let x = s.cash;
    const a = Math.min(x, s.overdraftAccrued); s.overdraftAccrued -= a; x -= a;
    const b = Math.min(x, s.overdraft); s.overdraft -= b; x -= b;
    s.cash = x;
  }
}

// Sell n shares from a bucket at today's close. Returns the amounts; the caller routes the money.
function doSale(s, ctx, n, bucket) {
  const P = ctx.close[s.i];
  const gross = n * P;
  const fee = gross * COST;
  const net = gross - fee;
  const gain = net - n * s.basis;
  s.shares[bucket] -= n;
  s.shares.sold += n;
  s.tax.realized += gain;
  s.stats.saleGross += gross;
  return { n, price: P, gross, fee, net, gain };
}

function award(s, id, ev) {
  if (s.flags.achievements.includes(id)) return;
  s.flags.achievements.push(id);
  const a = ACHIEVEMENTS[id];
  ev.push({ type: "achievement", d: s.d, pause: false, text: `${a.title}. ${a.lesson}`, data: { id, title: a.title } });
}

function setPending(s, e) {
  if (!s.pendingEvent) s.pendingEvent = e; else s.pendingQueue.push(e);
}
function resolvePending(s, type) {
  if (s.pendingEvent && s.pendingEvent.type === type) {
    s.pendingEvent = s.pendingQueue.length ? s.pendingQueue.shift() : null;
  } else {
    const k = s.pendingQueue.findIndex((e) => e.type === type);
    if (k >= 0) s.pendingQueue.splice(k, 1);
  }
}

// ---------------------------------------------------------------- collars and puts
export function collarQuote(state, tenorMonths, putPct, shares) {
  return quoteCollar(state, getCtx(state), tenorMonths, putPct, shares);
}

function quoteCollar(s, ctx, tenorMonths, putPct, shares) {
  const i = s.i, S = ctx.close[i];
  const expiry = tradingDateOnOrAfter(ctx.prices, addMonths(s.d, tenorMonths));
  const T = daysBetween(s.d, expiry) / 365;
  const r = ctx.dgs1[i] / 100;
  const Kp = putPct * S;
  const sv = skewVols(baseVolAt(ctx, i));
  let volPut = sv.put, volCall = sv.call;
  const smile = ctx.live && i === ctx.n - 1 && ctx.spcxOptions && ctx.spcxOptions.smile;
  let z = zeroCostCall({ S, Kp, T, r, volPut, volCall });
  if (smile) {
    const vp = smileVol(smile, expiry, putPct);
    if (vp) volPut = vp;
    for (let k = 0; k < 5; k++) {
      z = zeroCostCall({ S, Kp, T, r, volPut, volCall });
      const vc = smileVol(smile, expiry, z.Kc / S);
      if (vc) volCall = vc;
    }
    z = zeroCostCall({ S, Kp, T, r, volPut, volCall });
  }
  const out = {
    S, Kp, Kc: z.Kc, T, r, expiry, tenorMonths, putPct, volPut, volCall,
    volAdj: { put: volPut - sv.put, call: volCall - sv.call },
    putPrice: z.putPrice, callPrice: z.callPrice, capPct: z.Kc / S, usedSmile: !!smile, error: null,
  };
  if (putPct > 0.9 + EPS) out.error = "The floor must be at most 90% of today's price.";
  else if (z.Kc < 1.1 * S - EPS) out.error = "At this floor the cap would sit below 110% of today's price, which is too tight a band for the game.";
  // Totals for a typed share count: the least the shares are worth at expiry (floor) and the most (cap), in cents.
  if (Number.isInteger(shares) && shares > 0) {
    out.shares = shares;
    out.floorValue = Math.round(shares * Kp * 100) / 100;
    out.capValue = Math.round(shares * z.Kc * 100) / 100;
  }
  return out;
}

function openCollar(s, ctx, shares, tenorMonths, putPct, ev) {
  const q = quoteCollar(s, ctx, tenorMonths, putPct);
  if (q.error) return q.error;
  s.shares.free -= shares; s.shares.collared += shares;
  const c = {
    id: `c${s.nextId++}`, shares, Kp: q.Kp, Kc: q.Kc, start: s.d, expiry: q.expiry, tenorMonths, putPct,
    volAdj: q.volAdj, S0: q.S,
  };
  s.collars.push(c);
  s.stats.collarCount++;
  award(s, "floor-plan", ev);
  ev.push({
    type: "note", d: s.d, pause: false,
    text: `Collar set on ${commas(shares)} shares: floor $${q.Kp.toFixed(2)} (${Math.round(putPct * 100)}%), cap $${q.Kc.toFixed(2)} (${Math.round(q.capPct * 100)}%), ends ${labelDate(ctx, q.expiry)}. It costs nothing up front.`,
    data: { collar: c },
  });
  return null;
}

function realizeCash(s, ctx, amount) { // positive: money in to cash; negative: pay out of sources
  if (amount >= 0) { s.cash += amount; return null; }
  return pay(s, ctx, -amount);
}

function settleCollars(s, ctx, ev) {
  const S = ctx.close[s.i];
  const keep = [];
  for (const c of s.collars) {
    if (s.d < c.expiry) { keep.push(c); continue; }
    const payoff = Math.max(c.Kp - S, 0) - Math.max(S - Kc(c), 0);
    const net = c.shares * payoff;
    realizeCash(s, ctx, net);
    s.tax.realized += net;
    s.stats.collarNet += net;
    s.shares.collared -= c.shares; s.shares.free += c.shares;
    const rollBlock = rollGate(s, ctx);
    const side = payoff > 0 ? `The put paid ${money(net)}.` : payoff < 0 ? `The call cost you ${money(-net)}.` : "Neither side paid.";
    const text = `Your ${c.tenorMonths}-month collar on ${commas(c.shares)} shares ended at $${S.toFixed(2)}. ${side} The shares are free again. ` +
      (rollBlock ? `${rollBlock.reason.replace(/\.$/, "")}. You can let it end now.` : "Roll it at today's prices or let it end.");
    const e = {
      type: "collarExpiry", d: s.d, pause: true, text,
      data: {
        collarId: c.id, shares: c.shares, tenorMonths: c.tenorMonths, putPct: c.putPct, Kp: c.Kp, Kc: c.Kc, S, payoff, net,
        choices: ["roll", "end"], canRoll: !rollBlock, rollReason: rollBlock ? rollBlock.reason : null, opensOn: rollBlock ? rollBlock.opensOn : null,
      },
    };
    ev.push(e);
    setPending(s, e);
  }
  s.collars = keep;
}
function Kc(c) { return c.Kc; }

function rollGate(s, ctx) {
  const g = hedgeBlock(s, ctx, "Collars", "a new collar can be set up then");
  return g ? { reason: g.reason, opensOn: g.opensOn } : null;
}

function settlePuts(s, ctx, ev) {
  const S = ctx.close[s.i];
  const keep = [];
  for (const p of s.puts) {
    if (s.d < p.expiry) { keep.push(p); continue; }
    const payoff = Math.max(p.K - S, 0) * p.shares;
    s.cash += payoff;
    s.tax.realized += payoff - p.premium;
    s.stats.putNet += payoff - p.premium;
    ev.push({
      type: "note", d: s.d, pause: false,
      text: payoff > 0 ? `Your put on ${commas(p.shares)} shares ended in the money and paid ${money(payoff)}.` : `Your put on ${commas(p.shares)} shares ended worthless. The premium of ${money(p.premium)} is a capital loss.`,
      data: { putId: p.id },
    });
  }
  s.puts = keep;
}

// ---------------------------------------------------------------- gates
const no = (reason, opensOn = null, extra = {}) => ({ allowed: false, reason, opensOn, ...extra });
const yes = (extra = {}) => ({ allowed: true, reason: null, opensOn: null, ...extra });

function nextReleaseOf(s, ctx) {
  let best = null;
  for (const r of ctx.releases) {
    if (r.status !== "resolved" || !r.date || s.flags.seenTranches.includes(r.id)) continue;
    if (!best || r.date < best.date) best = r;
  }
  return best;
}

// `what` completes "No free shares to ...". Nothing released yet reads as the lockup; some released but none free now (all sold,
// pledged, collared or exchanged) says so plainly and names the next release, so it does not read as a lock.
function noFreeShares(s, ctx, what = "use") {
  if (s.shares.locked > 0) {
    const nr = nextReleaseOf(s, ctx);
    if (s.total - s.shares.locked > 0) {
      return nr
        ? no(`No free shares to ${what}. The next release is ${labelDate(ctx, nr.date)}.`, nr.date)
        : no(`No free shares to ${what}. The rest of your shares have no release date yet.`);
    }
    return nr
      ? no(`Locked by the lockup until ${labelDate(ctx, nr.date)}`, nr.date)
      : no("Locked by the lockup: the rest of your shares have no release date yet");
  }
  if (s.shares.collared > 0) {
    const e = s.collars.map((c) => c.expiry).sort()[0];
    return no(`Collared shares are held until the collar ends on ${labelDate(ctx, e)}`, e);
  }
  if (s.shares.pledged > 0) return no("Pledged shares are held by the bank until they are unpledged");
  if (s.shares.exchanged > 0) return no("Your remaining shares are in the exchange fund");
  return no("You have no shares left");
}

function windowBlock(s, ctx, then) {
  const w = windowAt(ctx, s.i);
  if (w.open) return null;
  const proj = w.projected ? " (projected)" : "";
  return no(`Window closed until ${labelDate(ctx, w.opensOn)}${proj}: ${then}`, w.opensOn);
}

// The sell gate's window text claims a plan only when one exists: live ("keeps selling") or in cooling-off ("starts selling").
function sellWindowBlock(s, ctx) {
  const w = windowAt(ctx, s.i);
  if (w.open) return null;
  const proj = w.projected ? " (projected)" : "";
  let tail = ".";
  if (s.plan) tail = s.d < s.plan.firstTradeOn ? `, your plan starts selling ${labelDate(ctx, s.plan.firstTradeOn)}.` : ", your 10b5-1 plan keeps selling.";
  return no(`Window closed until ${labelDate(ctx, w.opensOn)}${proj}${tail}`, w.opensOn);
}

// New hedges (collars, puts): need 20 trading days of price history, no 10b5-1 plan adopted, and an open window.
function hedgeBlock(s, ctx, kind, then) {
  if (s.i < MIN_HISTORY) {
    const when = ctx.dates[MIN_HISTORY];
    return no(`Options need ${MIN_HISTORY} trading days of price history to price. ${kind} open on ${labelDate(ctx, when)}.`, when);
  }
  if (s.plan) return no(RULE_PLAN_ACTIVE);
  return windowBlock(s, ctx, then);
}

function founderGate(s, ctx) {
  if (s.seat !== "founder") return null;
  const open = addCalendarDays(ctx.firstTrade, 90); // IPO day 91 counting the first trade as day 1
  if (s.d < open) {
    const when = tradingDateOnOrAfter(ctx.prices, open);
    return no(`Affiliates cannot sell before IPO day 91 (${labelDate(ctx, when)})`, when);
  }
  return null;
}

function rule144Room(s, ctx) {
  if (s.seat !== "founder") return Infinity;
  return rule144({ prices: ctx.prices, i: s.i, sharesOutPost: ctx.card.ipo.sharesOutPost, sales: s.sales144 }).remaining;
}

// Sale of free or pledged shares, for curing a maintenance call. Same window and Rule 144 gates as any sale.
function cureSellCheck(s, ctx) {
  if (s.shares.free + s.shares.pledged <= 0) return noFreeShares(s, ctx, "sell");
  const fg = founderGate(s, ctx);
  if (fg) return fg;
  const wb = windowBlock(s, ctx, "shares can be sold to meet the call then; posting cash is open now");
  if (wb) return wb;
  const room = rule144Room(s, ctx);
  if (room <= 0) return no("Rule 144 volume limit reached for this three-month period");
  return yes({ max: Math.min(s.shares.free + s.shares.pledged, room) });
}

function sellCheck(s, ctx, shares) {
  if (s.shares.free <= 0) return noFreeShares(s, ctx, "sell");
  const fg = founderGate(s, ctx);
  if (fg) return fg;
  const wb = sellWindowBlock(s, ctx);
  if (wb) return wb;
  const room = rule144Room(s, ctx);
  if (room <= 0) {
    const back = rule144ResetOn(s.sales144, s.d);
    return no(`Rule 144 volume limit reached for this three-month period${back ? `; room returns ${labelDate(ctx, back)}` : ""}`, back);
  }
  const max = Math.min(s.shares.free, room);
  if (shares !== undefined) {
    if (!Number.isInteger(shares) || shares <= 0) return no("Enter a whole number of shares", null, { max });
    if (shares > max) {
      return no(room < s.shares.free ? `Rule 144 volume limit: you can sell up to ${commas(room)} more shares in this three-month period` : `You have ${commas(s.shares.free)} free shares`, null, { max });
    }
  }
  return yes({ max });
}

export function canDo(state, type, params = {}) {
  const ctx = getCtx(state);
  return check(state, ctx, type, params);
}

function check(s, ctx, type, p) {
  if (s.done) return no("The card has ended");
  switch (type) {
    case "sell": return sellCheck(s, ctx, p.shares);
    case "adoptPlan": {
      if (s.plan) {
        return s.d < s.plan.firstTradeOn
          ? no(`Cooling-off: plan trades from ${labelDate(ctx, s.plan.firstTradeOn)}. One plan at a time`, s.plan.firstTradeOn)
          : no(`A plan is running (${s.plan.salesDone} of ${s.plan.salesTotal} sales done). One plan at a time`);
      }
      if (stockShares(s) + s.shares.exchanged <= 0 && s.shares.free + s.shares.locked + s.shares.collared + s.shares.pledged <= 0) return no("You have no shares left");
      const wb = windowBlock(s, ctx, "a plan can be adopted then");
      if (wb) return wb;
      if (p.pct !== undefined && ![2, 5, 10].includes(p.pct)) return no("A plan sells 2%, 5% or 10% a month");
      if (p.months !== undefined && ![6, 12, 18].includes(p.months)) return no("A plan runs 6, 12 or 18 months");
      const co = coolingOff({ seat: s.seat, adoptedOn: s.d, prices: ctx.prices, reports: ctx.reports });
      return yes({ firstTradeOn: co.firstTradeOn, coolingOffEnds: co.endsOn, basis: co.basis });
    }
    case "cancelPlan":
      return s.plan ? yes() : no("You have no plan to cancel");
    case "collar": {
      if (s.shares.free <= 0) return noFreeShares(s, ctx, "collar");
      const wb = hedgeBlock(s, ctx, "Collars", "a new collar can be set up then");
      if (wb) return wb;
      if (p.tenorMonths !== undefined && ![6, 12, 24].includes(p.tenorMonths)) return no("A collar runs 6, 12 or 24 months");
      if (p.putPct !== undefined && ![0.8, 0.85, 0.9].includes(p.putPct)) return no("The floor is 80%, 85% or 90% of today's price");
      if (p.shares !== undefined) {
        if (!Number.isInteger(p.shares) || p.shares <= 0) return no("Enter a whole number of shares", null, { max: s.shares.free });
        if (p.shares > s.shares.free) return no(`You have ${commas(s.shares.free)} free shares`, null, { max: s.shares.free });
      }
      const tenor = p.tenorMonths ?? 12, pp = p.putPct ?? 0.85;
      const q = quoteCollar(s, ctx, tenor, pp);
      if (q.error) return no(q.error, null, { max: s.shares.free, quote: q });
      return yes({ max: s.shares.free, quote: q });
    }
    case "unwindCollar": {
      const c = s.collars.find((x) => x.id === p.id);
      return c ? yes() : no("That collar is not open");
    }
    case "pledge": {
      if (s.shares.free <= 0) return noFreeShares(s, ctx, "pledge");
      if (p.shares !== undefined && (!Number.isInteger(p.shares) || p.shares <= 0 || p.shares > s.shares.free)) {
        return no(`Enter a whole number up to ${commas(s.shares.free)}`, null, { max: s.shares.free });
      }
      return yes({ max: s.shares.free });
    }
    case "unpledge": {
      if (s.shares.pledged <= 0) return no("You have no pledged shares");
      const debt = loanDebt(s);
      const P = ctx.close[s.i];
      const maxRel = debt <= 0 ? s.shares.pledged : Math.max(0, Math.floor(s.shares.pledged - debt / (CURE_LTV * P)));
      if (maxRel <= 0) return no("The bank releases shares only while the loan stays under 25% of the shares left", null, { max: 0 });
      if (p.shares !== undefined && (!Number.isInteger(p.shares) || p.shares <= 0 || p.shares > maxRel)) {
        return no(`You can release up to ${commas(maxRel)} shares while the loan stays under 25%`, null, { max: maxRel });
      }
      return yes({ max: maxRel });
    }
    case "draw": {
      if (s.shares.pledged <= 0) {
        return s.shares.locked > 0 && s.shares.free <= 0
          ? no("No shares are pledged yet, and locked shares cannot be pledged", nextReleaseOf(s, ctx) ? nextReleaseOf(s, ctx).date : null)
          : no("No shares are pledged yet");
      }
      const h = headroom(s, ctx);
      if (h <= 0.005) return no("The credit line is full: the bank lends 25% of the pledged value", null, { max: 0 });
      if (p.amount !== undefined && !(p.amount > 0 && p.amount <= h + 0.005)) return no(`You can draw up to ${money(h)}`, null, { max: h });
      return yes({ max: h });
    }
    case "repay": {
      const debt = loanDebt(s);
      if (debt <= 0.005) return no("You have no loan to repay");
      if (s.cash <= 0.005) return no("No cash to repay with");
      const max = Math.min(s.cash, debt);
      if (p.amount !== undefined && !(p.amount > 0 && p.amount <= max + 0.005)) return no(`You can repay up to ${money(max)}`, null, { max });
      return yes({ max });
    }
    case "deposit": {
      const debt = loanDebt(s) + s.overdraft + s.overdraftAccrued;
      const max = Math.max(0, s.cash - debt);
      if (s.cash <= 0.005) return no("No cash to move", null, { max: 0 });
      if (max <= 0.005) return no("The credit line cannot buy securities: only cash above what you owe can go to the index fund", null, { max: 0 });
      if (p.amount !== undefined && !(p.amount > 0 && p.amount <= max + 0.005)) return no(`You can move up to ${money(max)}`, null, { max });
      return yes({ max });
    }
    case "withdraw": {
      const v = indexValue(s, ctx);
      if (v <= 0.005) return no("The index fund is empty", null, { max: 0 });
      if (p.amount !== undefined && !(p.amount > 0 && p.amount <= v + 0.005)) return no(`You can withdraw up to ${money(v)}`, null, { max: v });
      return yes({ max: v });
    }
    case "buyPut": {
      if (s.shares.free <= 0) return noFreeShares(s, ctx, "protect with a put");
      const wb = hedgeBlock(s, ctx, "Puts", "a put can be bought then");
      if (wb) return wb;
      if (p.putPct !== undefined && ![0.8, 0.85, 0.9].includes(p.putPct)) return no("The strike is 80%, 85% or 90% of today's price");
      if (p.tenorMonths !== undefined && ![6, 12].includes(p.tenorMonths)) return no("A put runs 6 or 12 months");
      if (p.shares !== undefined && (!Number.isInteger(p.shares) || p.shares <= 0 || p.shares > s.shares.free)) {
        return no(`Enter a whole number up to ${commas(s.shares.free)}`, null, { max: s.shares.free });
      }
      return yes({ max: s.shares.free });
    }
    case "exchange": {
      if (s.shares.free <= 0) return noFreeShares(s, ctx, "contribute");
      const wb = windowBlock(s, ctx, "shares can be contributed then");
      if (wb) return wb;
      const P = ctx.close[s.i];
      if (s.shares.free * P < EXCHANGE_MIN) return no(`The exchange fund needs at least ${money(EXCHANGE_MIN)} of free shares`);
      if (p.shares !== undefined) {
        if (!Number.isInteger(p.shares) || p.shares <= 0 || p.shares > s.shares.free) return no(`Enter a whole number up to ${commas(s.shares.free)}`, null, { max: s.shares.free });
        if (p.shares * P < EXCHANGE_MIN) return no(`The exchange fund needs at least ${money(EXCHANGE_MIN)}`, null, { max: s.shares.free });
      }
      return yes({ max: s.shares.free });
    }
    case "house": {
      if (p.choice === "credit") {
        const h = headroom(s, ctx);
        return h >= HOUSE - 0.005 ? yes() : no(`The credit line has ${money(h)} of room, short of ${money(HOUSE)}.`);
      }
      if (p.choice === "sell") { const g = houseCanSell(s, ctx).check; return g.allowed ? yes() : g; }
      return yes();
    }
    case "marginCall":
      // "sell" in a maintenance call sells free shares first, then pledged ones: the same window and Rule 144 gates as a sale
      if (p.choice === "sell") return cureSellCheck(s, ctx);
      return yes();
    case "collarExpiry": case "flag":
      return yes();
    default:
      return no("Unknown action");
  }
}

export function gates(state) {
  const ctx = getCtx(state);
  const out = {};
  for (const [k, t] of [["sell", "sell"], ["adoptPlan", "adoptPlan"], ["cancelPlan", "cancelPlan"], ["collar", "collar"], ["pledge", "pledge"],
    ["draw", "draw"], ["repay", "repay"], ["deposit", "deposit"], ["withdraw", "withdraw"], ["buyPut", "buyPut"], ["exchange", "exchange"]]) {
    out[k] = check(state, ctx, t, {});
  }
  out.marginSell = check(state, ctx, "marginCall", { choice: "sell" }); // the maintenance-call "sell" button: free shares first, then pledged
  return out;
}

// ---------------------------------------------------------------- actions
function expect(s, type) {
  return s.pendingEvent && s.pendingEvent.type === type ? s.pendingEvent : (s.pendingQueue.find((e) => e.type === type) || null);
}

function houseCanSell(s, ctx) {
  const P = ctx.close[s.i];
  const n = Math.ceil(HOUSE / (P * (1 - COST)));
  const g = sellCheck(s, ctx, n);
  return { n, check: g };
}

function applyAction(s, ctx, a, ev) {
  const P = ctx.close[s.i];
  if (s.done) return "The card has ended.";
  const type = a.type;
  const cd = ["sell", "adoptPlan", "cancelPlan", "collar", "unwindCollar", "pledge", "unpledge", "draw", "repay", "deposit", "withdraw", "buyPut", "exchange"].includes(type)
    ? check(s, ctx, type, a) : null;
  if (cd && !cd.allowed) return cd.reason;
  switch (type) {
    case "sell": {
      const sale = doSale(s, ctx, a.shares, "free");
      receive(s, sale.net);
      s.stats.sells++; s.stats.sharesSold += a.shares;
      if (s.seat === "founder") s.sales144.push({ d: s.d, shares: a.shares });
      award(s, "inside-the-window", ev);
      ev.push({ type: "sale", d: s.d, pause: false, text: `Sold ${commas(a.shares)} shares at $${sale.price.toFixed(2)} for ${money(sale.gross)}. The 0.25% cost was ${money(sale.fee)}. Tax on the gain is paid at quarter end.`, data: sale });
      return null;
    }
    case "adoptPlan": {
      const co = coolingOff({ seat: s.seat, adoptedOn: s.d, prices: ctx.prices, reports: ctx.reports });
      s.plan = { adoptedOn: s.d, pct: a.pct, months: a.months, firstTradeOn: co.firstTradeOn, salesDone: 0, salesTotal: a.months, lastSaleI: -1, coolingOffEnds: co.endsOn, basis: co.basis };
      ev.push({ type: "note", d: s.d, pause: false, text: `Plan adopted: sell ${a.pct}% of your free shares each month for ${a.months} months. Cooling-off: plan trades from ${labelDate(ctx, co.firstTradeOn)}.`, data: { plan: s.plan } });
      return null;
    }
    case "cancelPlan": {
      s.plan = null;
      ev.push({ type: "note", d: s.d, pause: false, text: "Plan cancelled. A new plan starts a new cooling-off.", data: {} });
      return null;
    }
    case "collar":
      return openCollar(s, ctx, a.shares, a.tenorMonths, a.putPct, ev);
    case "unwindCollar": {
      const k = s.collars.findIndex((c) => c.id === a.id);
      const c = s.collars[k];
      const mark = c.shares * collarMarkPerShare(s, ctx, c);
      const fee = UNWIND_FEE * c.shares * P;
      const net = mark - fee;
      s.collars.splice(k, 1);
      s.shares.collared -= c.shares; s.shares.free += c.shares;
      realizeCash(s, ctx, net);
      s.tax.realized += net;
      s.stats.collarNet += net;
      ev.push({ type: "note", d: s.d, pause: false, text: `Collar unwound at model value ${money(mark)} less a 1% fee of ${money(fee)}. ${net >= 0 ? "You received" : "You paid"} ${money(Math.abs(net))}. The shares are free again.`, data: { id: c.id, mark, fee, net } });
      return null;
    }
    case "pledge":
      s.shares.free -= a.shares; s.shares.pledged += a.shares;
      ev.push({ type: "note", d: s.d, pause: false, text: `Pledged ${commas(a.shares)} shares. The bank will lend up to ${money(maxAdvance(pledgedValue(s, ctx)))} against them.`, data: {} });
      return null;
    case "unpledge":
      s.shares.pledged -= a.shares; s.shares.free += a.shares;
      return null;
    case "draw":
      s.loan.balance += a.amount; s.cash += a.amount; s.stats.drawn += a.amount;
      ev.push({ type: "note", d: s.d, pause: false, text: `Drew ${money(a.amount)} from the credit line at SOFR + 2.00%.`, data: {} });
      return null;
    case "repay":
      repayLoan(s, a.amount); s.cash -= a.amount;
      return null;
    case "deposit":
      s.cash -= a.amount; s.index.units += a.amount / ctx.spy[s.i]; s.index.cost += a.amount;
      return null;
    case "withdraw": {
      const w = withdrawIndex(s, ctx, a.amount);
      s.cash += w.got;
      if (w.gain > 0.005) ev.push({ type: "note", d: s.d, pause: false, text: `Withdrew ${money(w.got)}. The gain of ${money(w.gain)} is taxed at quarter end.`, data: {} });
      return null;
    }
    case "flag":
      s.flags.firstUse[a.name] = s.flags.firstUse[a.name] || s.d;
      if (a.name === "streetCheck") award(s, "street-smart", ev);
      return null;
    case "house": return answerHouse(s, ctx, a, ev);
    case "marginCall": return answerCall(s, ctx, a, ev);
    case "collarExpiry": return answerCollar(s, ctx, a, ev);
    case "buyPut": {
      const tenor = a.tenorMonths ?? 12;
      const expiry = tradingDateOnOrAfter(ctx.prices, addMonths(s.d, tenor));
      const T = daysBetween(s.d, expiry) / 365;
      const K = a.putPct * P;
      const per = bsPrice({ type: "put", S: P, K, T, r: ctx.dgs1[s.i] / 100, vol: volsFor(ctx, s.i, null).put });
      const premium = per * a.shares;
      if (s.cash + indexValue(s, ctx) < premium) return `The premium is ${money(premium)}; cash and the index fund hold less.`;
      pay(s, ctx, premium, { credit: false, overdraft: false });
      s.puts.push({ id: `p${s.nextId++}`, shares: a.shares, K, expiry, premium, putPct: a.putPct, tenorMonths: tenor });
      s.stats.putCount++;
      ev.push({ type: "note", d: s.d, pause: false, text: `Bought puts on ${commas(a.shares)} shares at $${K.toFixed(2)} for ${money(premium)} (model price), ending ${labelDate(ctx, expiry)}.`, data: {} });
      return null;
    }
    case "exchange": {
      s.shares.free -= a.shares; s.shares.exchanged += a.shares;
      const v = a.shares * P;
      if (s.exchange) { s.exchange.value += v; s.exchange.basisShares += a.shares; }
      else s.exchange = { value: v, basisShares: a.shares, contributedOn: s.d };
      s.stats.exchangeContrib += a.shares;
      ev.push({ type: "note", d: s.d, pause: false, text: `Contributed ${commas(a.shares)} shares to the exchange fund. They stay locked for seven years; at the end of the card they are valued at the fund value less 23.8% tax on the gain over your carried-over basis.`, data: {} });
      return null;
    }
    default:
      return "That action is not available.";
  }
}

function answerHouse(s, ctx, a, ev) {
  if (!expect(s, "house")) return "There is no house payment waiting.";
  const choice = a.choice;
  if (choice === "cash") {
    // cash, then the index fund (taxed); anything still short goes on the overdraft
    const r = pay(s, ctx, HOUSE, { credit: false, overdraft: true });
    ev.push({ type: "spend", d: s.d, pause: false, text: payText("for the house", HOUSE, r), data: { source: "house", ...r } });
  } else if (choice === "credit") {
    const h = headroom(s, ctx);
    if (h < HOUSE - 0.005) return `The credit line has ${money(h)} of room, short of ${money(HOUSE)}.`;
    s.loan.balance += HOUSE; s.stats.drawn += HOUSE;
    ev.push({ type: "spend", d: s.d, pause: false, text: `Paid ${money(HOUSE)} for the house from the credit line at SOFR + 2.00%.`, data: { source: "house", credit: HOUSE } });
  } else if (choice === "sell") {
    const { n, check: g } = houseCanSell(s, ctx);
    if (!g.allowed) return g.reason;
    const sale = doSale(s, ctx, n, "free");
    if (s.seat === "founder") s.sales144.push({ d: s.d, shares: n });
    s.stats.sells++; s.stats.sharesSold += n;
    receive(s, sale.net - HOUSE);
    ev.push({ type: "spend", d: s.d, pause: false, text: `Sold ${commas(n)} shares at $${sale.price.toFixed(2)} and paid ${money(HOUSE)} for the house. Tax on the gain is paid at quarter end.`, data: { source: "house", sale } });
  } else return "The house choices are cash, credit or sell.";
  s.spentToday += HOUSE; s.stats.spendTotal += HOUSE;
  s.flags.houseDone = true;
  s.stats.houseChoice = choice;
  resolvePending(s, "house");
  return null;
}

function answerCollar(s, ctx, a, ev) {
  const pe = expect(s, "collarExpiry");
  if (!pe) return "No collar is waiting for an answer.";
  const d = pe.data;
  if (a.choice === "roll") {
    const g = check(s, ctx, "collar", {});
    if (!g.allowed) return g.reason;
    const n = Math.min(d.shares, s.shares.free);
    if (n <= 0) return "Those shares are no longer free.";
    const err = openCollar(s, ctx, n, d.tenorMonths, d.putPct, ev);
    if (err) return err;
  } else if (a.choice !== "end") return "The collar choices are roll or end.";
  resolvePending(s, "collarExpiry");
  return null;
}

function estShares(s, ctx) {
  const P = ctx.close[s.i];
  return forcedSaleShares(loanDebt(s), P, s.shares.pledged, COST);
}

// Date of the nth trading day after index i: the card's own price dates, then weekdays past the end of a live card.
function tradingDayDate(ctx, i, n) {
  const j = i + n;
  if (j < ctx.n) return ctx.dates[j];
  return businessDaysAfter(ctx.dates[ctx.n - 1], j - (ctx.n - 1));
}

function answerCall(s, ctx, a, ev) {
  const call = s.loan.call;
  if (!call) return "There is no maintenance call.";
  const P = ctx.close[s.i];
  const debt0 = loanDebt(s);
  const coll = pledgedValue(s, ctx);
  if (a.choice === "wait") {
    resolvePending(s, "marginCall");
    return null;
  }
  if (a.choice === "post") {
    const need = callCure(debt0, coll);
    let got = Math.min(s.cash, need);
    let rest = need - got;
    let gotIdx = 0;
    if (rest > EPS) { const w = withdrawIndex(s, ctx, rest); gotIdx = w.got; }
    const total = got + gotIdx;
    if (total <= 0.005) return "You have no cash or index fund to post.";
    s.cash -= got;
    repayLoan(s, total);
    const r = ltvOf(loanDebt(s), coll);
    if (r <= CALL_LTV + EPS) {
      s.loan.call = null;
      resolvePending(s, "marginCall");
      if (total >= need - 0.005) { s.stats.curedWithCash = true; award(s, "cured", ev); }
      ev.push({ type: "marginCall", d: s.d, pause: false, text: `You posted ${money(total)}${gotIdx > 0 ? ` (${money(got)} cash, ${money(gotIdx)} from the index fund, taxed at quarter end)` : ""}. Loan-to-value is ${pctText(r)}.`, data: { resolved: true, posted: total } });
    } else {
      resolvePending(s, "marginCall");
      s.loan.call = { ...call, toPost: callCure(loanDebt(s), coll), ltv: Math.min(r, 9.99) };
      ev.push({ type: "marginCall", d: s.d, pause: false, text: `You posted ${money(total)}. Loan-to-value is still ${pctText(r)}; it takes ${money(s.loan.call.toPost)} more by ${labelDateWd(ctx, call.deadline)} to bring it back to ${pctText(CURE_LTV, 0)}. If the loan is above ${pctText(CALL_LTV, 0)} at the close of ${labelDateWd(ctx, call.sellOn)}, the bank sells at that close.`, data: { resolved: false, posted: total } });
    }
    return null;
  }
  if (a.choice === "sell") {
    const cs = cureSellCheck(s, ctx);
    if (!cs.allowed) return cs.reason;
    const aPer = netPerShare(P, COST);
    let cap = cs.max;
    let applied = 0, soldN = 0, leftover = 0;
    // free shares first: they do not shrink the collateral
    const cure = callCure(debt0, coll);
    const nFree = Math.min(cap, s.shares.free, Math.ceil(cure / aPer - 1e-9));
    const sellBucket = (n, bucket) => {
      if (n <= 0) return;
      const sale = doSale(s, ctx, n, bucket);
      const toLoan = Math.min(sale.net, loanDebt(s));
      repayLoan(s, toLoan);
      s.cash += sale.net - toLoan; // any excess stays in cash; the tax on the gain is accrued in the ledger
      applied += toLoan; soldN += n; cap -= n;
      s.stats.sells++; s.stats.sharesSold += n;
      if (s.seat === "founder") s.sales144.push({ d: s.d, shares: n });
    };
    sellBucket(nFree, "free");
    const coll2 = pledgedValue(s, ctx);
    if (ltvOf(loanDebt(s), coll2) > CURE_LTV + EPS && cap > 0) {
      const n = Math.min(cap, forcedSaleShares(loanDebt(s), P, s.shares.pledged, COST));
      sellBucket(n, "pledged");
    }
    const r = ltvOf(loanDebt(s), pledgedValue(s, ctx));
    resolvePending(s, "marginCall");
    if (r <= CALL_LTV + EPS) s.loan.call = null;
    else s.loan.call = { ...call, toPost: callCure(loanDebt(s), pledgedValue(s, ctx)), ltv: Math.min(r, 9.99) };
    ev.push({ type: "marginCall", d: s.d, pause: false, text: `You sold ${commas(soldN)} shares at $${P.toFixed(2)} and put ${money(applied)} against the loan. Loan-to-value is ${pctText(Math.min(r, 9.99))}. Tax on the sale is paid at quarter end.`, data: { resolved: r <= CALL_LTV + EPS, sold: soldN } });
    return null;
  }
  return "The call choices are post, sell or wait.";
}

// After any accepted action: clear a call that is no longer needed and refresh today's history row.
function afterAction(s, ctx, ev) {
  if (s.loan.call) {
    const r = ltvOf(loanDebt(s), pledgedValue(s, ctx));
    if (r <= CALL_LTV + EPS) {
      s.loan.call = null;
      resolvePending(s, "marginCall");
      ev.push({ type: "marginCall", d: s.d, pause: false, text: `The maintenance call is cleared. Loan-to-value is ${pctText(r)}.`, data: { cleared: true } });
    }
  }
  pushRow(s, ctx, true);
  s.px = { close: ctx.close[s.i], spy: ctx.spy[s.i] };
}

export function act(state, action) {
  if (!action || !action.type) return { state, events: [], error: "That action is not available." };
  const ctx = getCtx(state);
  const s = cloneState(state);
  const ev = [];
  const err = applyAction(s, ctx, action, ev);
  if (err) return { state, events: [], error: err };
  s.log.push({ ...action, d: s.d });
  if (!s.flags.firstUse[action.type]) s.flags.firstUse[action.type] = s.d;
  afterAction(s, ctx, ev);
  return { state: s, events: ev };
}

// ---------------------------------------------------------------- the clock
function planDue(s, ctx) {
  const p = s.plan;
  if (!p) return false;
  if (p.salesDone === 0) return s.d >= p.firstTradeOn;
  return ctx.ftdom.has(s.i) && s.i > p.lastSaleI;
}

function runPlanSale(s, ctx, ev) {
  const p = s.plan;
  const P = ctx.close[s.i];
  const closed = !windowAt(ctx, s.i).open;
  if (p.salesDone === 0) {
    ev.push({ type: "planLive", d: s.d, pause: true, text: `Your 10b5-1 plan is live. It sells ${p.pct}% of your free shares on the first trading day of each month, window open or not.`, data: { plan: { ...p } } });
    award(s, "cooling-off", ev);
  }
  let n = Math.floor((p.pct / 100) * s.shares.free + 1e-9);
  if (s.seat === "founder") n = Math.min(n, rule144Room(s, ctx));
  if (n > 0) {
    const sale = doSale(s, ctx, n, "free");
    receive(s, sale.net);
    if (s.seat === "founder") s.sales144.push({ d: s.d, shares: n });
    s.stats.planSells++; s.stats.planShares += n; s.stats.saleGross += 0;
    if (closed) { s.stats.blackoutPlanSale = true; award(s, "through-the-blackout", ev); }
    ev.push({ type: "planSale", d: s.d, pause: false, text: `Plan sale ${p.salesDone + 1} of ${p.salesTotal}: ${commas(n)} shares at $${P.toFixed(2)} for ${money(sale.gross)}${closed ? ", while the window is closed" : ""}.`, data: { ...sale, window: !closed } });
  } else {
    ev.push({ type: "planSale", d: s.d, pause: false, text: `Plan sale ${p.salesDone + 1} of ${p.salesTotal}: no free shares to sell today.`, data: { n: 0 } });
  }
  p.salesDone++; p.lastSaleI = s.i;
  if (p.salesDone >= p.salesTotal) {
    s.plan = null;
    ev.push({ type: "planSale", d: s.d, pause: false, text: "That was the plan's last sale. A new plan needs a new cooling-off.", data: { ended: true } });
  }
}

function checkLoan(s, ctx, ev) {
  const debt = loanDebt(s);
  const P = ctx.close[s.i];
  if (debt <= EPS && !s.loan.call) return;
  const coll = pledgedValue(s, ctx);
  const r = ltvOf(debt, coll);
  const call = s.loan.call;
  const callChoices = ["post", "sell", "wait"];
  if (call) {
    if (r <= CALL_LTV + EPS) {
      s.loan.call = null;
      resolvePending(s, "marginCall");
      ev.push({ type: "marginCall", d: s.d, pause: false, text: `The maintenance call is cleared. Loan-to-value is ${pctText(r)}.`, data: { cleared: true } });
    } else if (s.d > call.deadline) {
      forcedSale(s, ctx, ev); // the deadline day has closed with the loan still above 35%: the bank sells at this close
    } else if (s.d === call.deadline) {
      const toPost = callCure(debt, coll);
      const est = forcedSaleShares(debt, P, s.shares.pledged, COST);
      s.loan.call = { ...call, toPost, ltv: Math.min(r, 9.99) };
      const e = {
        type: "marginCall", d: s.d, pause: true,
        text: `Last day to meet the call. Loan-to-value is ${pctText(r)}. It takes ${money(toPost)} posted today to bring it back to ${pctText(CURE_LTV, 0)}. If the loan is still above ${pctText(CALL_LTV, 0)} at the close of ${labelDateWd(ctx, call.sellOn)}, the bank sells about ${aboutShares(est)} shares at that close. The sale is taxable.`,
        data: { ltv: Math.min(r, 9.99), toPost, deadline: call.deadline, sellOn: call.sellOn, estShares: est, lastDay: true, choices: callChoices, canPost: s.cash + indexValue(s, ctx) },
      };
      ev.push(e);
      setPending(s, e);
    }
  } else if (r > CALL_LTV + EPS) {
    const toPost = callCure(debt, coll);
    const deadline = tradingDayDate(ctx, s.i, CALL_DEADLINE_DAYS);
    const sellOn = tradingDayDate(ctx, s.i, CALL_DEADLINE_DAYS + 1);
    s.loan.call = { issuedOn: s.d, deadline, sellOn, toPost, ltv: Math.min(r, 9.99) };
    s.stats.marginCalls++;
    const est = forcedSaleShares(debt, P, s.shares.pledged, COST);
    const e = {
      type: "marginCall", d: s.d, pause: true,
      text: `Maintenance call. Loan-to-value is ${pctText(r)}; the limit is ${pctText(CALL_LTV, 0)}. It takes ${money(toPost)} posted by ${labelDateWd(ctx, deadline)}, the third trading day, to bring it back to ${pctText(CURE_LTV, 0)}. If the loan is above ${pctText(CALL_LTV, 0)} at the close of ${labelDateWd(ctx, sellOn)}, the bank sells about ${aboutShares(est)} shares at that close. The sale is taxable.`,
      data: { ltv: Math.min(r, 9.99), toPost, deadline, sellOn, estShares: est, choices: callChoices, canPost: s.cash + indexValue(s, ctx) },
    };
    ev.push(e);
    setPending(s, e);
  }
}

function forcedSale(s, ctx, ev) {
  const P = ctx.close[s.i];
  const debt = loanDebt(s);
  const n = forcedSaleShares(debt, P, s.shares.pledged, COST);
  const sale = doSale(s, ctx, n, "pledged");
  if (s.seat === "founder" && n > 0) s.sales144.push({ d: s.d, shares: n });
  const toLoan = Math.min(sale.net, debt);
  repayLoan(s, toLoan);
  s.cash += sale.net - toLoan;
  let moved = 0;
  if (s.shares.pledged <= 0 && loanDebt(s) > 0.005) { // nothing left to lend against: the rest becomes an overdraft
    moved = loanDebt(s);
    s.overdraft += moved; s.loan.balance = 0; s.loan.accrued = 0;
  }
  s.loan.call = null;
  resolvePending(s, "marginCall");
  const taxApprox = Math.max(0, RATE * sale.gain);
  s.stats.forced.push({ d: s.d, shares: n, price: P, gross: sale.gross, gain: sale.gain });
  const text = `The bank sold ${commas(n)} pledged shares at $${P.toFixed(2)}, ignoring the trading window, to bring the loan back to 25% of the shares left. ` +
    `${money(toLoan)} went against the loan. The sale is taxable: the tax, about ${money(taxApprox)} on a gain of ${money(sale.gain)}, is your bill and is paid at quarter end. ` +
    `Lesson: a credit line against one stock can be called when the price falls. The bank sells at that day's close, at whatever price the stock has by then, and the trading window does not apply.` +
    (moved > 0 ? ` No pledged shares are left, so the remaining ${money(moved)} moved to the overdraft at SOFR + 4.00%.` : "");
  ev.push({ type: "forcedSale", d: s.d, pause: true, text, data: { shares: n, price: P, gross: sale.gross, gain: sale.gain, toLoan } });
}

function advance(s, ctx, ev) {
  const prevD = s.d;
  const i = s.i + 1;
  const d = ctx.dates[i];
  s.i = i; s.d = d; s.spentToday = 0;
  const P = ctx.close[i];

  // 1. interest and accruals
  if (s.cash > 0) s.cash += s.cash * dailyRf(ctx.dgs1mo[i]);
  const days = daysBetween(prevD, d);
  const sofr = ctx.sofr[i];
  s.loan.accrued += s.loan.balance * loanRate(sofr) * days / 365;
  s.overdraftAccrued += s.overdraft * overdraftRate(sofr) * days / 365;
  if (ctx.ftdom.has(i)) {
    s.stats.interest += s.loan.accrued;
    s.stats.overdraftInterest += s.overdraftAccrued;
    s.loan.balance += s.loan.accrued; s.loan.accrued = 0;
    s.overdraft += s.overdraftAccrued; s.overdraftAccrued = 0;
  }
  sweepOverdraft(s);
  if (s.exchange) {
    s.exchange.value *= (ctx.spy[i] / ctx.spy[i - 1]) * Math.pow(1 - EXCHANGE_FEE, days / 365);
  }

  // 1b. cash dividends from the adjusted series, on every share held (locked included); taxed through the ledger
  const dps = ctx.div[i];
  if (dps > 0) {
    const held = stockShares(s);
    if (held > 0) {
      const amt = held * dps;
      receive(s, amt);
      s.tax.realized += amt;
      s.stats.dividends += amt;
      ev.push({ type: "dividend", d, pause: false, text: `Dividend of $${dps.toFixed(2)} a share on ${commas(held)} shares: ${money(amt)} paid to cash. It is taxed at 23.8%, paid at quarter end.`, data: { perShare: dps, shares: held, amount: amt } });
    }
  }

  if (i === 1) ev.push({ type: "toolUnlock", d, pause: true, text: "New tool: Cash and Index Fund. Open it to see how your cash earns interest and how the index fund is taxed.", data: { tool: "cash" } });

  // 2. releases
  let relShares = 0;
  const relIds = [];
  for (const r of ctx.releases) {
    if (r.status !== "resolved" || r.idx < 0 || r.idx > i || s.flags.seenTranches.includes(r.id)) continue;
    const n = Math.min(r.shares, s.shares.locked);
    s.shares.locked -= n; s.shares.free += n;
    s.flags.seenTranches.push(r.id);
    relShares += n; relIds.push(r.id);
  }
  for (const r of ctx.releases) {
    if (!r.window) continue;
    if (i === r.window.relockIdx && s.flags.seenTranches.includes(r.id)) {
      const soldSince = s.shares.sold - ((s.flags.soldAtRelease || {})[r.id] || 0);
      const back = Math.max(0, Math.min(s.shares.free, r.shares - soldSince));
      if (back > 0) {
        s.shares.free -= back; s.shares.locked += back;
        s.flags.relocked = { ...(s.flags.relocked || {}), [r.id]: back };
        ev.push({ type: "release", d, pause: false, text: `The ${Math.round((r.shares / s.total) * 100)}% employee sale window has closed. ${commas(back)} unsold shares are locked again until the next release.`, data: { relocked: back, tranche: r.id } });
      }
    }
    if (i === r.window.reopenIdx && s.flags.relocked && s.flags.relocked[r.id]) {
      const back = Math.min(s.flags.relocked[r.id], s.shares.locked);
      s.shares.locked -= back; s.shares.free += back; relShares += back;
      s.flags.relocked = { ...s.flags.relocked, [r.id]: 0 };
    }
  }
  if (relIds.length) {
    for (const id of relIds) s.flags.soldAtRelease = { ...(s.flags.soldAtRelease || {}), [id]: s.shares.sold };
    const firstEver = !s.flags.firstUse.release;
    s.flags.firstUse.release = s.flags.firstUse.release || d;
    const pct = Math.round((relShares / s.total) * 100);
    ev.push({
      type: "release", d, pause: true,
      text: `${pct}% of your shares are free.${firstEver ? " New: Sell, 10b5-1 plan, Collar, Credit Line, Put, Exchange Fund." : ""}`,
      data: { tranches: relIds, shares: relShares, pct, locked: s.shares.locked, first: firstEver },
    });
    if (firstEver) {
      for (const [tool, label, pause] of [["sell", "Sell", true], ["plan", "10b5-1 Plan", true], ["collar", "Collar", true], ["credit", "Credit Line", true], ["put", "Protective Put", false], ["exchange", "Exchange Fund", false]]) {
        ev.push({ type: "toolUnlock", d, pause, text: `New tool: ${label}. Open it to read how it works.`, data: { tool } });
      }
    }
    const fired = ctx.releases.filter((r) => r.status === "resolved");
    if (fired.every((r) => r.idx >= 0 && s.flags.seenTranches.includes(r.id)) && !ctx.releases.some((r) => r.status === "unknown")) award(s, "seal-breaker", ev);
  }
  for (const r of ctx.releases) {
    if (r.status === "never" && r.noteDate) {
      const k = tradingIndexOnOrAfter(ctx.prices, r.noteDate);
      if (k === i) ev.push({ type: "release", d, pause: false, text: "A price trigger was not met, so those shares were not released early. They unlock with the last release.", data: { never: r.id } });
    }
  }

  // 3. trading window
  const w = windowAt(ctx, i);
  if (w.open !== s.windowOpen) {
    s.windowOpen = w.open;
    if (w.open) {
      ev.push({ type: "windowOpen", d, pause: true, text: w.closesOn ? `The trading window is open until ${labelDate(ctx, w.closesOn)}${w.projected ? " (projected)" : ""}.` : "The trading window is open.", data: { closesOn: w.closesOn, projected: w.projected } });
    } else {
      let tail = "";
      if (s.plan) tail = s.d < s.plan.firstTradeOn ? ` Your plan starts selling ${labelDate(ctx, s.plan.firstTradeOn)}.` : " Your 10b5-1 plan keeps selling.";
      ev.push({ type: "windowClose", d, pause: false, text: `The trading window is closed until ${labelDate(ctx, w.opensOn)}${w.projected ? " (projected)" : ""}.${tail}`, data: { opensOn: w.opensOn, projected: w.projected } });
    }
  }

  // 4. expiries
  settleCollars(s, ctx, ev);
  settlePuts(s, ctx, ev);

  // 5. spending on the first trading day of each month
  if (ctx.ftdom.has(i)) {
    const r = pay(s, ctx, SPEND);
    s.spentToday += SPEND; s.stats.spendTotal += SPEND;
    ev.push({ type: "spend", d, pause: false, text: payText("", SPEND, r), data: { source: "living", ...r } });
  }

  // 6. 10b5-1 plan
  if (planDue(s, ctx)) runPlanSale(s, ctx, ev);

  // 7. quarter-end tax
  if (ctx.qEnd.has(i)) {
    const due = RATE * Math.max(0, s.tax.realized) - s.tax.paid;
    if (due > 0.005) {
      const r = pay(s, ctx, due);
      s.tax.paid += due;
      ev.push({ type: "taxPaid", d, pause: false, text: payText("of tax for the quarter", due, r), data: { amount: due, ...r } });
    }
  }

  // 8. credit line
  checkLoan(s, ctx, ev);

  // 9. the house
  if (ctx.houseIdx === i && !s.flags.houseDone) {
    const sellInfo = houseCanSell(s, ctx);
    const e = {
      type: "house", d, pause: true, text: "$10M is due for the family's house in 30 days. Choose how to pay.",
      data: {
        amount: HOUSE, choices: HOUSE_CHOICES.map((c) => ({ ...c })),
        liquid: s.cash + indexValue(s, ctx), headroom: headroom(s, ctx),
        canSell: sellInfo.check.allowed, sellReason: sellInfo.check.reason, sharesToSell: sellInfo.n,
      },
    };
    ev.push(e);
    setPending(s, e);
  }

  // 10. news
  for (const h of ctx.headIdx.get(i) || []) ev.push({ type: "news", d, pause: false, text: h.text, data: { source: h.source || null } });

  // 11. close of day
  s.px = { close: P, spy: ctx.spy[i] };
  pushRow(s, ctx, false);
  const parts = partsOf(s, ctx);
  if (parts.W > 0 && parts.stock / parts.W < 0.5) award(s, "diversified", ev);
  if (i >= ctx.n - 1) {
    s.done = true;
    ev.push({ type: "cardEnd", d, pause: true, text: ctx.live ? "That is the latest close in the data. Check back after the next trading day." : "The five years are over.", data: {} });
  }
}

export function tick(state) {
  if (state.done) return { state, events: [] };
  if (state.pendingEvent) return { state, events: [], blocked: true };
  const ctx = getCtx(state);
  const s = cloneState(state);
  const ev = [];
  advance(s, ctx, ev);
  return { state: s, events: ev };
}

// ---------------------------------------------------------------- policies, runs, replay
function defaultRespond(s, e) {
  if (e.type === "house") {
    const d = e.data;
    if (d.liquid >= HOUSE) return { type: "house", choice: "cash" };
    if (d.headroom >= HOUSE) return { type: "house", choice: "credit" };
    if (d.canSell) return { type: "house", choice: "sell" };
    return { type: "house", choice: "cash" };
  }
  if (e.type === "marginCall") return { type: "marginCall", choice: "post" };
  if (e.type === "collarExpiry") return { type: "collarExpiry", choice: "end" };
  return null;
}

// policy = {start?(s), day?(s, events), respond?(s, event)} each returning an action, an array of actions, or null.
export function runWithPolicy(state, policy = {}, onDay = null) {
  let s = state;
  let todays = [];
  const apply = (res) => {
    const list = Array.isArray(res) ? res : res ? [res] : [];
    for (const a of list) {
      const r = act(s, a);
      if (!r.error) { s = r.state; todays.push(...r.events); }
    }
  };
  const answer = () => {
    let guard = 0;
    while (s.pendingEvent && guard++ < 20) {
      const e = s.pendingEvent;
      const respond = policy.respond || defaultRespond;
      let r = act(s, respond(s, e) || defaultRespond(s, e));
      if (r.error) {
        // fall back to the safest answer so the run cannot stall
        const fb = e.type === "house" ? { type: "house", choice: "cash" } : e.type === "collarExpiry" ? { type: "collarExpiry", choice: "end" } : { type: "marginCall", choice: "wait" };
        r = act(s, fb);
        if (r.error) break;
      }
      s = r.state; todays.push(...r.events);
    }
  };
  if (policy.start) { apply(policy.start(s)); answer(); }
  if (onDay) { onDay(todays, s); todays = []; }
  while (!s.done) {
    const t = tick(s);
    if (t.blocked) break;
    s = t.state; todays.push(...t.events);
    answer();
    if (policy.day) { apply(policy.day(s, todays)); answer(); }
    if (onDay) { onDay(todays, s); todays = []; }
  }
  return s;
}

export function runToEnd(state, policy) {
  return runWithPolicy(state, policy || {});
}

// Rebuild a game from its action log (determinism, share codes). Ticks to each action's date, applies it, then
// optionally runs to the end with the default answers.
export function replay(cfg, log, { toEnd = false } = {}) {
  let s = createGame(cfg);
  for (const a of log) {
    while (s.d < a.d && !s.done) {
      const t = tick(s);
      if (t.blocked) break;
      s = t.state;
    }
    const { d, ...action } = a;
    const r = act(s, action);
    if (r.error) throw new Error(`Replay failed on ${a.d} ${a.type}: ${r.error}`);
    s = r.state;
  }
  return toEnd ? runToEnd(s) : s;
}

// ---------------------------------------------------------------- snapshot and score
function dayLabelOf(s, ctx) {
  if (ctx.live) return `Day ${s.i + 1} of ${ctx.n} so far`;
  const year = Math.min(5, Math.floor(s.i / 252) + 1);
  const month = Math.min(12, Math.floor((s.i - (year - 1) * 252) / 21) + 1);
  return `Year ${year} of 5 · Month ${month}`;
}

// Trading days from index i to a date (0 when the date is today or past); weekdays past the end of a live card.
function tradingDaysTo(ctx, i, date) {
  if (date <= ctx.dates[i]) return 0;
  const last = ctx.dates[ctx.n - 1];
  if (date <= last) return Math.max(0, tradingIndexOnOrAfter(ctx.prices, date) - i);
  let k = ctx.n - 1 - i, x = last;
  while (x < date) { x = businessDaysAfter(x, 1); k++; }
  return k;
}

export function snapshot(state, rivals = null) {
  const ctx = getCtx(state);
  const s = state;
  const i = s.i;
  const parts = partsOf(s, ctx);
  const P = ctx.close[i];
  const W0 = s.history[0].W;
  const debt = loanDebt(s);
  const w = windowAt(ctx, i);
  const nr = nextReleaseOf(s, ctx);
  const tt = terminalTaxOf(s, ctx);
  let nextRelease = null;
  if (nr) {
    const same = ctx.releases.filter((r) => r.status === "resolved" && r.date === nr.date && !s.flags.seenTranches.includes(r.id));
    const sh = same.reduce((a, r) => a + r.shares, 0);
    nextRelease = { date: nr.date, pct: Math.round((sh / s.total) * 1000) / 10, shares: sh };
  }
  let riv;
  if (rivals) riv = { holder: rivals.holder ? rivals.holder[i] : null, seller: rivals.seller ? rivals.seller[i] : null, playbook: rivals.playbook ? rivals.playbook[i] : null };
  return {
    d: s.d, i, done: s.done, dayLabel: dayLabelOf(s, ctx), close: P, offerPrice: ctx.offer,
    shares: { ...s.shares, total: s.total },
    cash: s.cash, overdraft: s.overdraft + s.overdraftAccrued,
    index: { value: parts.index, units: s.index.units, cost: s.index.cost },
    loan: {
      balance: s.loan.balance, accrued: s.loan.accrued, owed: debt,
      ltv: Math.min(ltvOf(debt, pledgedValue(s, ctx)), 9.99), maxDraw: headroom(s, ctx), call: s.loan.call ? { ...s.loan.call, daysLeft: tradingDaysTo(ctx, i, s.loan.call.deadline) } : null,
    },
    collars: s.collars.map((c) => ({ ...c, mark: c.shares * collarMarkPerShare(s, ctx, c), markPerShare: collarMarkPerShare(s, ctx, c), daysLeft: daysBetween(s.d, c.expiry) })),
    puts: s.puts.map((p) => ({ ...p, mark: p.shares * putMarkPerShare(s, ctx, p) })),
    plan: s.plan ? { ...s.plan, status: s.d < s.plan.firstTradeOn ? "cooling-off" : "live" } : null,
    exchange: s.exchange ? { ...s.exchange } : null,
    taxOwed: parts.tax, taxPaid: s.tax.paid, W: parts.W, profit: parts.W - W0, parts,
    unrealizedTax: tt.unrealizedTax, afterTaxW: parts.W - tt.unrealizedTax,
    Wat: parts.W - tt.unrealizedTax, profitAt: parts.W - tt.unrealizedTax - s.history[0].A, // after-tax net worth, and its change since day 0
    window: { open: w.open, closesOn: w.closesOn, opensOn: w.opensOn, projected: w.projected },
    nextRelease, gates: gates(s), rivals: riv, pendingEvent: s.pendingEvent, achievements: s.flags.achievements.slice(),
    spentToday: s.spentToday,
  };
}

// Cash held beyond a year of spending (12 * SPEND), averaged over the card, and what that same cash earned at the cash rate
// versus what it would have earned in the index fund over the same days (daily, not compounded, before tax). Each day's gain
// is on the previous close's idle balance. Null when no cash sat idle.
export function idleCash(state) {
  const h = state.history;
  if (!h || h.length < 2 || typeof h[0].cash !== "number") return null;
  const ctx = getCtx(state);
  const keep = 12 * SPEND;
  let sum = 0, cashGain = 0, indexGain = 0;
  for (let t = 1; t < h.length; t++) {
    const idle = Math.max(0, h[t - 1].cash - keep);
    sum += idle;
    cashGain += idle * h[t].rf;
    indexGain += idle * (ctx.spy[t] / ctx.spy[t - 1] - 1);
  }
  const avg = sum / (h.length - 1);
  if (!(avg > 0)) return null;
  return { avg, cashEarned: cashGain, indexWould: indexGain, diff: indexGain - cashGain, days: h.length - 1 };
}

export function score(state) {
  const h = state.history;
  const rets = [], rfs = [], V = [1];
  for (let t = 1; t < h.length; t++) {
    const R = (h[t].W + h[t].S) / h[t - 1].W - 1;
    rets.push(R); rfs.push(h[t].rf);
    V.push(V[t - 1] * (1 + R));
  }
  const dd = maxDrawdown(V, h.map((r) => r.d));
  const last = h[h.length - 1];
  const unrealizedTax = terminalTax(state).unrealizedTax;
  const totalSpending = h.reduce((a, r) => a + r.S, 0);
  // Both ends after tax (decision RUN-5): day-0 wealth net of the tax embedded in the stake.
  const embeddedTax0 = RATE * Math.max(0, state.total * (h[0].close - state.basis));
  const flows = [{ d: h[0].d, amount: -(h[0].W - embeddedTax0) }];
  for (let t = 1; t < h.length; t++) if (h[t].S > 0) flows.push({ d: h[t].d, amount: h[t].S });
  flows.push({ d: last.d, amount: last.W - unrealizedTax });
  let irr = xirr(flows);
  if (!Number.isFinite(irr)) irr = null;
  return {
    sharpe: sharpe(rets, rfs),
    maxDrawdown: { pct: dd.pct, peakDate: dd.peakDate, troughDate: dd.troughDate },
    irr,
    afterTaxWealth: last.W - unrealizedTax + totalSpending,
    idleCash: idleCash(state), totalSpending, taxesPaid: state.tax.paid, finalW: last.W, unrealizedTax, days: h.length, flows,
  };
}

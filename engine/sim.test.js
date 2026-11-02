// sim.test.js: golden tests 6, 7, 8, 11, 12 and the rule tests for the game engine. Run: node --test engine/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { addCalendarDays, addMonths, daysBetween, weekday } from "./calendar.js";
import { RATE, saleTax } from "./tax.js";
import { dailyRf } from "./metrics.js";
import { groupForSeat, resolveTranches, trancheShares, priceCondition } from "./lockup.js";
import { maxAdvance, ltv, callCure, forcedSaleShares, fallToCall, netPerShare } from "./loan.js";
import { coolingOff, rule144 } from "./rules.js";
import {
  createGame, tick, act, canDo, gates, snapshot, runToEnd, runWithPolicy, replay, score, normalizeCard, wealthParts,
  getCtx, collarQuote, terminalTax, COST, SPEND, HOUSE, AUTO_INVEST_KEEP,
} from "./sim.js";
import { BOTS, runBot, botPolicy } from "./bots.js";
import { debrief, achievements, ACHIEVEMENTS, compare } from "./debrief.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", f), "utf8"));
const market = load("market.json");
const spcxLike = load("spcx-like.json");
const fiveYear = load("five-year.json");
const spcxOptions = load("spcx-options.json");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b} (tol ${tol})`);

// ---- helpers
function weekdays(from, n) {
  const out = []; let d = from;
  while (out.length < n) { if (weekday(d) !== 0 && weekday(d) !== 6) out.push(d); d = addCalendarDays(d, 1); }
  return out;
}
// A controllable card: close = fn(date, i). Everything releases on day 1. Offer $100, so 1,000,000 shares.
function flatCard({ n = 500, close = () => 100, earnings = [], sharesOutPost = 100_000_000, vol = 1_000_000, id = "flat" } = {}) {
  const dates = weekdays("2020-01-02", n);
  const prices = dates.map((d, i) => { const c = close(d, i); return [d, c, c, vol]; });
  const tr = (i) => ({ id: "t", pct: 100, trigger: { type: "date", date: dates[1] }, resolvedDate: dates[1] });
  return {
    id, blind: false, live: false, name: "Flat", ticker: "FLAT", industry: "other",
    ipo: { offerPrice: 100, pricingDate: "2019-12-31", firstTrade: "2020-01-02", proceedsUSD: 1e9, sharesOutPost, source: {} },
    prices, earnings, reports: [],
    lockup: { groups: [{ id: "g-e", seats: ["engineer"], tranches: [tr()] }, { id: "g-f", seats: ["founder"], tranches: [tr()] }] },
    headlines: [],
  };
}
const game = (card, seat = "engineer", extra = {}) => createGame({ card, seat, market, ...extra });
function tickTo(s, d) {
  while (s.d < d && !s.done) {
    const t = tick(s);
    assert.ok(!t.blocked, `blocked by ${s.pendingEvent && s.pendingEvent.type} on ${s.d}`);
    s = t.state;
  }
  return s;
}
function tickToIdx(s, i) { while (s.i < i) { const t = tick(s); assert.ok(!t.blocked); s = t.state; } return s; }
function ok(res) { assert.equal(res.error, undefined, res.error); return res.state; }
function tickUntilEvent(s, type) {
  const seen = [];
  while (!s.done) {
    const t = tick(s);
    if (t.blocked) break;
    s = t.state; seen.push(...t.events);
    const e = t.events.find((x) => x.type === type);
    if (e) return { state: s, event: e, seen };
    if (s.pendingEvent) break;
  }
  return { state: s, event: null, seen };
}

// ================================================================ fixtures and normalization
test("normalizeCard: blind cards start at $100 and 1,000,000 shares; idempotent; input untouched", () => {
  const before = JSON.stringify(fiveYear);
  const n = normalizeCard(fiveYear);
  assert.equal(JSON.stringify(fiveYear), before);
  assert.equal(n.ipo.offerPrice, 100);
  near(n.prices[0][1], 52 * 2.5, 1e-9);
  near(n.prices[0][3], fiveYear.prices[0][3] / 2.5, 1e-6);
  near(n.ipo.sharesOutPost, 150_000_000 / 2.5, 1e-6);
  assert.equal(normalizeCard(n), n);
  const g = game(fiveYear);
  assert.equal(g.total, 1_000_000);
  assert.equal(g.basis, 1);
});

test("fixtures: five-year has 1,261 days; spcx-like has 98 days", () => {
  assert.equal(fiveYear.prices.length, 1261);
  assert.equal(spcxLike.prices.length, 98);
  assert.equal(spcxLike.prices[0][0], "2026-06-12");
});

// ================================================================ test 6: SpaceX ladder
test("6: SpaceX ladder resolves to the PRD 4.1 dates and shares; condition (b) is false", () => {
  const want = { a: "2026-08-06", b: null, c1: "2026-08-20", c2: "2026-09-09", c3: "2026-09-24", c4: "2026-10-09", c5: "2026-10-26", d: "2026-10-22", e: "2026-12-08" };
  const res = resolveTranches(spcxLike, "engineer-180");
  for (const r of res) assert.equal(r.date, want[r.id], `tranche ${r.id}`);
  assert.equal(res.find((r) => r.id === "b").status, "never");
  // the stored dates on the card agree with the recompute
  for (const t of spcxLike.lockup.groups[0].tranches) assert.equal(t.resolvedDate, want[t.id]);
  // shares: 20 / 0 / 7x5 / 28 / 17 percent of 740,741
  const sh = trancheShares(spcxLike, "engineer-180", 740741);
  const byId = Object.fromEntries(sh.map((x) => [x.id, x.shares]));
  assert.equal(byId.a, 148148);
  assert.equal(byId.b, 0);
  for (const id of ["c1", "c2", "c3", "c4", "c5"]) assert.equal(byId[id], 51852);
  assert.equal(byId.d, 207407);
  assert.equal(byId.e, 125926);
  assert.equal(sh.reduce((a, x) => a + x.shares, 0), 740741);
  near(byId.e / 740741, 0.17, 1e-5);
  // condition (b): max close between 2026-07-22 and 2026-08-04 is 125.33, far under 175.50
  const trig = spcxLike.lockup.groups[0].tranches[1].trigger;
  const c = priceCondition(spcxLike, trig);
  assert.equal(c.known, true);
  assert.equal(c.met, false);
  assert.equal(c.count, 0);
  assert.equal(c.from, "2026-07-22");
  assert.equal(c.to, "2026-08-04");
  assert.equal(c.max, 125.33);
  near(c.threshold, 175.5, 1e-9);
  assert.equal(Math.max(...spcxLike.prices.filter((r) => r[0] >= "2026-07-22" && r[0] <= "2026-08-04").map((r) => r[1])), 125.33);
});

test("6b: the same schedule on the real built card (if present) matches its stored dates", (t) => {
  const f = path.join(here, "..", "data", "cards", "spcx.json");
  if (!fs.existsSync(f)) return t.skip("data/cards/spcx.json not built");
  const card = JSON.parse(fs.readFileSync(f, "utf8"));
  const g = card.lockup.groups.find((x) => x.seats.includes("engineer"));
  const sh = trancheShares(card, g.id, 740741);
  for (const x of sh) {
    const stored = g.tranches.find((y) => y.id === x.id).resolvedDate;
    assert.equal(x.date, stored ?? null, x.id);
  }
  assert.equal(sh.reduce((a, x) => a + x.shares, 0), 740741);
  assert.equal(groupForSeat(card, "founder"), null);
});

test("6c: SpaceX founder seat throws the 424B4 reason; engineer starts all locked with 740,741 shares", () => {
  assert.equal(groupForSeat(spcxLike, "founder"), null);
  assert.throws(() => game(spcxLike, "founder"), { message: "The founder's shares are locked until June 12, 2027 (424B4)." });
  const g = game(spcxLike, "engineer");
  assert.equal(g.total, 740741);
  assert.equal(g.basis, 1.35);
  assert.equal(g.shares.locked, 740741);
  assert.equal(g.cash, 3_000_000);
});

test("6d: releases happen on the ladder dates, free shares match, and the lockup copy is exact", () => {
  let s = game(spcxLike);
  const got = [];
  while (!s.done) {
    const t = tick(s); s = t.state;
    for (const e of t.events) if (e.type === "release" && e.data.shares) got.push([e.d, e.data.shares, e.text]);
  }
  assert.deepEqual(got.map((x) => x[0]), ["2026-08-06", "2026-08-20", "2026-09-09", "2026-09-24", "2026-10-09", "2026-10-22", "2026-10-26"]);
  assert.equal(got[0][2], "20% of your shares are free. New: Sell, Collar, Credit Line.");
  assert.equal(got[1][2], "7% of your shares are free.");
  assert.equal(s.shares.locked, 125926);
  assert.equal(s.shares.free, 740741 - 125926);
  assert.equal(snapshot(s).nextRelease.date, "2026-12-08");
  assert.equal(snapshot(s).nextRelease.pct, 17);
});

// ================================================================ test 7: cooling-off
test("7: engineer adopting 2026-10-22 first trades 2026-11-23", () => {
  let s = tickTo(game(spcxLike), "2026-10-22");
  assert.equal(s.d, "2026-10-22");
  const g = canDo(s, "adoptPlan", { pct: 5, months: 12 });
  assert.equal(g.allowed, true, g.reason);
  assert.equal(g.firstTradeOn, "2026-11-23");
  s = ok(act(s, { type: "adoptPlan", pct: 5, months: 12 }));
  assert.equal(s.plan.firstTradeOn, "2026-11-23");
  assert.equal(s.plan.coolingOffEnds, "2026-11-21");
  assert.equal(snapshot(s).plan.status, "cooling-off");
  const two = act(s, { type: "adoptPlan", pct: 2, months: 6 });
  assert.match(two.error, /^Cooling-off: plan trades from Nov 23/);
});

test("7b: founder cooling-off: 90-day, report, and 120-day-cap cases; the report is the one for the quarter of adoption", () => {
  const prices = weekdays("2026-01-02", 400).map((d) => [d, 100, 100, 1]);
  const adopt = "2026-01-05"; // quarter ends 2026-03-31; +90 = 2026-04-05, +120 = 2026-05-05
  const near90 = coolingOff({ seat: "founder", adoptedOn: adopt, prices, reports: [{ d: "2026-04-01" }] });
  assert.equal(near90.endsOn, "2026-04-05"); assert.equal(near90.basis, "90days");
  assert.equal(near90.firstTradeOn, "2026-04-06"); // Sunday -> Monday
  assert.equal(near90.quarterEnd, "2026-03-31"); assert.equal(near90.reportOn, "2026-04-01");
  const rep = coolingOff({ seat: "founder", adoptedOn: adopt, prices, reports: [{ d: "2026-04-20" }] });
  assert.equal(rep.endsOn, "2026-04-22"); assert.equal(rep.basis, "report"); // two business days after Mon Apr 20
  const cap = coolingOff({ seat: "founder", adoptedOn: adopt, prices, reports: [{ d: "2026-06-01" }] });
  assert.equal(cap.endsOn, "2026-05-05"); assert.equal(cap.basis, "cap");
  const none = coolingOff({ seat: "founder", adoptedOn: adopt, prices, reports: [{ d: "2025-11-01" }] });
  assert.equal(none.endsOn, "2026-05-05");
  const eng = coolingOff({ seat: "engineer", adoptedOn: adopt, prices, reports: [{ d: "2026-02-10" }] });
  assert.equal(eng.endsOn, "2026-02-04");
  // a report filed before the quarter ends is not the report for that quarter: the first one filed AFTER the quarter end counts
  const early = coolingOff({ seat: "founder", adoptedOn: adopt, prices, reports: [{ d: "2025-11-01" }, { d: "2026-02-10" }, { d: "2026-04-20" }] });
  assert.equal(early.reportOn, "2026-04-20"); assert.equal(early.basis, "report"); assert.equal(early.endsOn, "2026-04-22");
  // adoption on the last day of a quarter still uses the report filed after that quarter
  const eoq = coolingOff({ seat: "founder", adoptedOn: "2026-03-31", prices, reports: [{ d: "2026-02-10" }, { d: "2026-05-12" }] });
  assert.equal(eoq.reportOn, "2026-05-12"); assert.equal(eoq.endsOn, "2026-06-29"); assert.equal(eoq.basis, "90days");
});

test("7b2: banker repro: a founder adopting 2022-01-03 on c6 first trades on 2022-05-03 (the 120-day cap), not 2022-04-04", (t) => {
  const f = path.join(here, "..", "data", "cards", "c6.json");
  if (!fs.existsSync(f)) return t.skip("data/cards/c6.json not built");
  const card = JSON.parse(fs.readFileSync(f, "utf8"));
  const co = coolingOff({ seat: "founder", adoptedOn: "2022-01-03", prices: card.prices, reports: card.reports });
  assert.equal(co.quarterEnd, "2022-03-31");
  assert.equal(co.reportOn, "2022-05-11");
  assert.equal(co.basis, "cap");
  assert.equal(co.endsOn, "2022-05-03");
  assert.equal(co.firstTradeOn, "2022-05-03");
  // adopting 2022-04-04 instead: the Q2 report (filed in August) is later than the cap, so the cap rules again
  const co2 = coolingOff({ seat: "founder", adoptedOn: "2022-04-04", prices: card.prices, reports: card.reports });
  assert.equal(co2.quarterEnd, "2022-06-30");
  assert.ok(co2.firstTradeOn >= "2022-07-04");
});

test("7c: founder plan in the sim uses the card's reports; sales start after cooling-off, then monthly on the first trading day", () => {
  let s = game(fiveYear, "founder");
  s = tickTo(s, "2020-04-01"); // IPO day 91 and the window is open
  const g = canDo(s, "adoptPlan", { pct: 5, months: 6 });
  assert.equal(g.allowed, true, g.reason);
  const want = coolingOff({ seat: "founder", adoptedOn: s.d, prices: fiveYear.prices, reports: fiveYear.reports });
  assert.equal(g.firstTradeOn, want.firstTradeOn);
  s = ok(act(s, { type: "adoptPlan", pct: 5, months: 6 }));
  const sales = [];
  while (s.plan && !s.done) {
    const t = tick(s); s = t.state;
    for (const e of t.events) if (e.type === "planSale" && e.data.n !== 0 && !e.data.ended) sales.push(e.d);
    if (s.pendingEvent) s = ok(act(s, { type: "house", choice: "cash" }));
  }
  assert.equal(sales[0], want.firstTradeOn);
  const ftdom = getCtx(s).ftdom;
  for (const d of sales.slice(1)) assert.ok(ftdom.has(getCtx(s).dates.indexOf(d)), `${d} is a first trading day of a month`);
  assert.equal(sales.length, 6);
});

test("7d: plan rules: one at a time, cancel starts over, adoption needs an open window, plan sells through a closed window", () => {
  let s = tickTo(game(spcxLike), "2026-08-06");
  s = ok(act(s, { type: "adoptPlan", pct: 10, months: 6 }));
  assert.match(act(s, { type: "adoptPlan", pct: 5, months: 6 }).error, /One plan at a time/);
  const first = s.plan.firstTradeOn;
  s = ok(act(s, { type: "cancelPlan" }));
  assert.equal(s.plan, null);
  s = tickTo(s, "2026-08-20");
  s = ok(act(s, { type: "adoptPlan", pct: 10, months: 6 }));
  assert.ok(s.plan.firstTradeOn > first);
  // closed window: Sep 21 .. Oct 21
  let c = tickTo(game(spcxLike), "2026-09-21");
  const e = act(c, { type: "adoptPlan", pct: 5, months: 6 });
  assert.equal(e.error, "Window closed until Oct 22: a plan can be adopted then");
});

test("7e: a plan sells in a closed window and earns Through the Blackout; discretionary sale is blocked there", () => {
  let s = tickTo(game(spcxLike), "2026-08-06");
  s = ok(act(s, { type: "adoptPlan", pct: 10, months: 6 }));
  assert.equal(s.plan.firstTradeOn, "2026-09-08"); // 2026-08-06 + 30 = Sep 5 (Sat) -> Mon Sep 7 is Labor Day -> Sep 8
  const t = tickUntilEvent(s, "planSale");
  assert.equal(t.event.d, "2026-09-08");
  s = t.state;
  const n = Math.floor(0.1 * (148148 + 51852) + 1e-9); // c2 releases on Sep 9, after the first sale
  assert.equal(s.stats.planShares, n);
  // Oct 1 is in the closed window (Sep 20 to Oct 21): the plan still sells
  const t2 = tickUntilEvent(s, "planSale");
  assert.equal(t2.event.d, "2026-10-01");
  assert.ok(t2.state.flags.achievements.includes("through-the-blackout"));
  assert.ok(t2.state.flags.achievements.includes("cooling-off"));
  assert.equal(canDo(t2.state, "sell").allowed, false);
});

// ================================================================ test 8: the loan
test("8: loan math: 25% LTV reaches 35% after a 28.57% fall; cure and forced-sale closed forms", () => {
  near(fallToCall(), 0.2857142857, 1e-9);
  const C = 100_000_000;
  const bal = maxAdvance(C);
  assert.equal(bal, 25_000_000);
  assert.equal(ltv(bal, C), 0.25);
  near(ltv(bal, C * (1 - fallToCall())), 0.35, 1e-12);
  near(ltv(bal, C * (1 - 0.2857)), 0.35, 1e-4);
  // cure: repay to 25%
  const C2 = C * (1 - 0.30);
  assert.equal(callCure(bal, C2), bal - 0.25 * C2);
  near(ltv(bal - callCure(bal, C2), C2), 0.25, 1e-12);
  // forced sale closed form: n = (L - 0.25 C) / (a - 0.25 P), a = P (1 - cost). Tax is the client's bill, not withheld from the loan repayment.
  const P = 70, pledged = 1_000_000;
  const a = P * (1 - 0.0025);
  near(netPerShare(P, 0.0025), a, 1e-12);
  const exact = (bal - 0.25 * pledged * P) / (a - 0.25 * P);
  const n = forcedSaleShares(bal, P, pledged, 0.0025);
  assert.equal(n, Math.ceil(exact));
  assert.equal(n, 143335);
  assert.ok(bal - n * a <= 0.25 * (pledged - n) * P + 1e-6);
  assert.ok(bal - (n - 1) * a > 0.25 * (pledged - n + 1) * P);
  assert.equal(forcedSaleShares(10, 100, 1000, 0.0025), 0); // already under 25%
});

function marginScenario() {
  // flat at $100 for 60 days, then $70 (a 30% fall). Pledge everything, draw the maximum.
  const card = flatCard({ n: 120, close: (d, i) => (i <= 60 ? 100 : 70) });
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "pledge", shares: s.shares.free }));
  const mx = canDo(s, "draw").max;
  near(mx, 25_000_000, 1e-6);
  s = ok(act(s, { type: "draw", amount: mx }));
  return { card, s };
}

test("8b: maintenance call: exact copy, amounts, 'post' cures with cash", () => {
  let { s } = marginScenario();
  const r = tickUntilEvent(s, "marginCall");
  assert.ok(r.event, "a call is issued");
  s = r.state;
  assert.equal(s.i, 61);
  assert.ok(s.pendingEvent && s.pendingEvent.type === "marginCall");
  assert.match(r.event.text, /^Maintenance call\. Loan-to-value is 3\d\.\d%; the limit is 35%\. It takes \$\d\.\dM posted by \w{3} \w{3} \d+, the third trading day, to bring it back to 25%\. If the loan is above 35% at the close of \w{3} \w{3} \d+, the bank sells about [\d,]+ shares at that close\. The sale is taxable\.$/);
  const debt = s.loan.balance + s.loan.accrued;
  const coll = s.shares.pledged * 70;
  near(s.loan.call.toPost, debt - 0.25 * coll, 1e-6);
  assert.equal(s.loan.call.deadline, addBusiness(s.d, 3)); // the card has no holidays: 3 trading days = 3 weekdays
  assert.equal(s.loan.call.sellOn, addBusiness(s.d, 4));
  assert.equal(snapshot(s).loan.call.daysLeft, 3);
  assert.equal(tick(s).blocked, true); // the clock waits for an answer
  const cash0 = s.cash;
  s = ok(act(s, { type: "marginCall", choice: "post" }));
  assert.equal(s.pendingEvent, null);
  assert.equal(s.loan.call, null);
  near(ltv(s.loan.balance + s.loan.accrued, coll), 0.25, 1e-9);
  near(cash0 - s.cash, debt - 0.25 * coll, 1e-6);
  assert.ok(s.flags.achievements.includes("cured"));
});
function addBusiness(d, n) { let x = d; while (n > 0) { x = addCalendarDays(x, 1); if (weekday(x) !== 0 && weekday(x) !== 6) n--; } return x; }

test("8c: ignoring the call: pause on the deadline day, then the bank sells at the next close to 25%, taxed, window ignored, lesson text, no achievement", () => {
  let { s } = marginScenario();
  s = tickUntilEvent(s, "marginCall").state;
  const call = s.loan.call;
  s = ok(act(s, { type: "marginCall", choice: "wait" }));
  const realized0 = s.tax.realized;
  const total = s.total;
  // two quiet days, then the deadline day: the clock pauses with "Last day to meet the call"; nothing is sold yet
  const last = tickUntilEvent(s, "marginCall");
  assert.ok(last.event, "last-day pause");
  s = last.state;
  assert.equal(s.d, call.deadline);
  assert.equal(last.event.pause, true);
  assert.equal(last.event.data.lastDay, true);
  assert.match(last.event.text, /^Last day to meet the call\. /);
  assert.equal(s.stats.forced.length, 0);
  assert.equal(s.tax.realized, realized0);
  assert.equal(s.pendingEvent.type, "marginCall");
  assert.equal(tick(s).blocked, true);
  // the player can still act through the deadline day's close, so wait again and let it run
  s = ok(act(s, { type: "marginCall", choice: "wait" }));
  const t = tickUntilEvent(s, "forcedSale");
  assert.ok(t.event, "forced sale happened");
  s = t.state;
  assert.equal(s.d, call.sellOn); // the close of the next trading day
  assert.ok(s.d > call.deadline);
  assert.equal(s.loan.call, null);
  const coll = s.shares.pledged * 70;
  const l = ltv(s.loan.balance + s.loan.accrued, coll);
  assert.ok(l <= 0.25 + 1e-9 && l > 0.2495, `ltv after forced sale ${l}`);
  assert.ok(s.tax.realized > realized0);
  assert.equal(s.stats.forced.length, 1);
  assert.match(t.event.text, /ignoring the trading window/);
  assert.match(t.event.text, /Lesson:/);
  assert.equal(t.event.pause, true);
  assert.ok(!t.event.text.includes("!"));
  const sh = s.shares;
  assert.equal(sh.locked + sh.free + sh.collared + sh.pledged + sh.sold + sh.exchanged, total);
  assert.equal(sh.sold, t.event.data.shares);
  // the closed form: the fewest shares so that loan - n * 70 * (1 - 0.0025) <= 0.25 * (pledged - n) * 70, with all proceeds on the loan
  const n = t.event.data.shares, a = 70 * (1 - COST);
  near(t.event.data.price, 70, 1e-9);
  // the tax on the gain is the client's bill (ledger), not withheld from the loan repayment
  near(t.event.data.toLoan, n * a, 1e-6);
  near(s.tax.realized - realized0, n * a - n * 1, 1e-6);
  const debtBefore = s.loan.balance + s.loan.accrued + t.event.data.toLoan, pledgedBefore = s.shares.pledged + n;
  assert.ok(debtBefore - n * a <= 0.25 * (pledgedBefore - n) * 70 + 1e-6, "n shares are enough");
  assert.ok(debtBefore - (n - 1) * a > 0.25 * (pledgedBefore - n + 1) * 70, "n - 1 shares are not");
  assert.equal(s.flags.achievements.filter((a) => /forced|margin/i.test(a)).length, 0);
});

test("8c2: the deadline counts trading days from the card's own dates: a holiday is not a trading day", () => {
  // Remove Fri Mar 6 2020 from the series: a call on Wed Mar 4 has the deadline Wed Mar 11, not Mon Mar 9
  const card = flatCard({ n: 120, close: (d) => (d >= "2020-03-04" ? 70 : 100) });
  card.prices = card.prices.filter((r) => r[0] !== "2020-03-06");
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "pledge", shares: s.shares.free }));
  s = ok(act(s, { type: "draw", amount: canDo(s, "draw").max }));
  const r = tickUntilEvent(s, "marginCall");
  assert.equal(r.event.d, "2020-03-04");
  assert.equal(r.state.loan.call.deadline, "2020-03-10"); // Mar 5, Mar 9, Mar 10
  assert.equal(r.state.loan.call.sellOn, "2020-03-11");
});

test("8c3: a founder's bank sale is recorded in the Rule 144 volume ledger", () => {
  const card = flatCard({ n: 160, close: (d, i) => (i <= 100 ? 100 : 70), sharesOutPost: 100_000_000 });
  let s = tickToIdx(game(card, "founder"), 95);
  s = ok(act(s, { type: "pledge", shares: s.shares.free }));
  s = ok(act(s, { type: "draw", amount: canDo(s, "draw").max }));
  const r = tickUntilEvent(s, "marginCall");
  s = ok(act(r.state, { type: "marginCall", choice: "wait" }));
  s = tickUntilEvent(s, "marginCall").state;
  s = ok(act(s, { type: "marginCall", choice: "wait" }));
  const t = tickUntilEvent(s, "forcedSale");
  assert.ok(t.event);
  assert.equal(t.state.sales144.length, 1);
  assert.equal(t.state.sales144[0].shares, t.event.data.shares);
  assert.equal(t.state.sales144[0].d, t.state.d);
});

test("8d: sell to cure needs an open window; with a closed window it explains why", () => {
  const card = flatCard({ n: 120, close: (d, i) => (i <= 60 ? 100 : 70), earnings: [{ d: "2020-04-10" }] });
  // window closed from Mar 11 2020; the call comes on day 61 (Mar 26 2020)
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "pledge", shares: s.shares.free }));
  s = ok(act(s, { type: "draw", amount: canDo(s, "draw").max }));
  const r = tickUntilEvent(s, "marginCall");
  const e = act(r.state, { type: "marginCall", choice: "sell" });
  assert.match(e.error, /^Window closed until /);
});

test("8d2: the margin-call sell gate comes from the engine: with every share pledged the plain sell gate is shut but the call's sell is open, and it sells pledged shares", () => {
  const { s: s0 } = marginScenario();             // every share pledged, none free
  const s = tickUntilEvent(s0, "marginCall").state;
  assert.equal(s.shares.free, 0);
  assert.equal(canDo(s, "sell").allowed, false);
  assert.match(canDo(s, "sell").reason, /until they are unpledged/);
  assert.equal(gates(s).sell.allowed, false);
  assert.equal(canDo(s, "marginCall", { choice: "sell" }).allowed, true);
  assert.equal(gates(s).marginSell.allowed, true);
  assert.ok(canDo(s, "marginCall", { choice: "sell" }).max > 0);
  const pledged0 = s.shares.pledged;
  const after = ok(act(s, { type: "marginCall", choice: "sell" }));
  assert.ok(after.shares.pledged < pledged0);
  // a closed window shuts the call's sell, with the engine's reason
  const card = flatCard({ n: 120, close: (d, i) => (i <= 60 ? 100 : 70), earnings: [{ d: "2020-04-10" }] });
  let c = tickToIdx(game(card), 2);
  c = ok(act(c, { type: "pledge", shares: c.shares.free }));
  c = ok(act(c, { type: "draw", amount: canDo(c, "draw").max }));
  c = tickUntilEvent(c, "marginCall").state;
  assert.equal(gates(c).marginSell.allowed, false);
  assert.match(gates(c).marginSell.reason, /^Window closed until .*posting cash is open now/);
});

test("8e: sell choice (window open) repays and clears the call", () => {
  const card = flatCard({ n: 120, close: (d, i) => (i <= 60 ? 100 : 70) });
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "sell", shares: 200_000 }));
  s = ok(act(s, { type: "pledge", shares: 800_000 }));
  s = ok(act(s, { type: "draw", amount: canDo(s, "draw").max }));
  s = tickUntilEvent(s, "marginCall").state;
  const total = s.total;
  s = ok(act(s, { type: "marginCall", choice: "sell" }));
  assert.equal(s.pendingEvent, null);
  const l = ltv(s.loan.balance + s.loan.accrued, s.shares.pledged * 70);
  assert.ok(l <= 0.25 + 1e-6, `ltv ${l}`);
  assert.equal(s.shares.locked + s.shares.free + s.shares.collared + s.shares.pledged + s.shares.sold, total);
});

test("8f: credit rules: no pledging locked shares, draw cap, deposit cannot be funded by the loan, interest accrues and capitalizes monthly", () => {
  const card = flatCard({ n: 120 });
  let s = game(card);
  assert.equal(canDo(s, "pledge").allowed, false);
  assert.match(canDo(s, "pledge").reason, /^Locked by the lockup until Jan 3$/);
  s = tickToIdx(s, 2);
  s = ok(act(s, { type: "pledge", shares: 400_000 }));
  assert.match(act(s, { type: "draw", amount: 10_000_001 }).error, /You can draw up to/);
  s = ok(act(s, { type: "draw", amount: 10_000_000 }));
  assert.match(act(s, { type: "unpledge", shares: 100_000 }).error, /under 25%|up to/);
  // the loan cannot buy securities: deposit only above what you owe
  assert.equal(canDo(s, "deposit").max, s.cash - 10_000_000);
  const bal0 = s.loan.balance;
  const drawn = s.d;
  s = tickTo(s, "2020-02-03"); // first trading day of February
  assert.ok(s.loan.accrued === 0 && s.loan.balance > bal0, "capitalized on the first trading day of the month");
  const sofr = getCtx(s).sofr[s.i];
  // calendar days since the draw at SOFR+2% on 10M, capitalized once
  const expect = 10_000_000 * ((sofr + 2) / 100) * daysBetween(drawn, s.d) / 365;
  near(s.loan.balance - bal0, expect, 5, "interest");
});

// ================================================================ spending and cash
test("spending: first trading day of each month, $166,667, never on day 0; source text names the source", () => {
  let s = game(spcxLike);
  const spend = [];
  for (let k = 0; k < 40; k++) { const t = tick(s); s = t.state; for (const e of t.events) if (e.type === "spend") spend.push(e); }
  assert.deepEqual(spend.map((e) => e.d), ["2026-07-01", "2026-08-03"]);
  assert.equal(spend[0].text, "Paid $166,667 from cash.");
  assert.equal(s.history.filter((r) => r.S > 0).length, 2);
});

test("spending: cash first, then the index fund (taxed), then the credit line, then the overdraft", () => {
  const card = flatCard({ n: 200 });
  const start = () => tickToIdx(game(card), 2);
  // cash first, then the index fund
  let s = start();
  s = ok(act(s, { type: "deposit", amount: s.cash - 100_000 }));
  const t1 = tickUntilEvent(s, "spend");
  assert.equal(t1.event.d, "2020-02-03");
  assert.match(t1.event.text, /^Paid \$166,667: \$100,\d{3} from cash, \$66,\d{3} from the index fund/);
  // all in the index fund
  let w = start();
  w = ok(act(w, { type: "deposit", amount: w.cash }));
  const t2 = tickUntilEvent(w, "spend");
  assert.match(t2.event.text, /^Paid \$166,667 from the index fund; the gain is taxed at quarter end\.$|^Paid \$166,667 from the index fund\.$/);
  // credit line: no cash, no index fund, shares pledged
  let c = start();
  c = ok(act(c, { type: "pledge", shares: 1_000_000 }));
  c = { ...c, cash: 0 };
  const t3 = tickUntilEvent(c, "spend");
  assert.equal(t3.event.text, "Paid $166,667 from the credit line.");
  near(t3.state.loan.balance, 166667, 1);
  // overdraft: nothing else is left
  const o = { ...start(), cash: 0 };
  const t4 = tickUntilEvent(o, "spend");
  assert.equal(t4.event.text, "Paid $166,667 on the overdraft at SOFR + 4.00%.");
  near(t4.state.overdraft, 166667, 1);
  // the overdraft is cleared by the next money in
  const sold = ok(act(t4.state, { type: "sell", shares: 10_000 }));
  assert.equal(sold.overdraft, 0);
});

test("tax: engine sale matches saleTax; selling 100,000 shares at $150 with $1.35 basis is $3,537,870 at zero cost", () => {
  assert.equal(saleTax({ shares: 100000, price: 150, basis: 1.35 }).tax, 3537870);
  const card = flatCard({ n: 80 });
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "sell", shares: 100_000 }));
  const want = saleTax({ shares: 100_000, price: 100, basis: 1, costRate: COST });
  near(s.tax.realized, want.gain, 1e-6);
  near(wealthParts(s).tax, RATE * want.gain, 1e-6);
});

test("quarterly tax: paid on the last trading day of the quarter; unpaid tax is a liability in W", () => {
  const card = flatCard({ n: 120 });
  let s = tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 2); // proceeds stay in cash, so the tax is paid from cash
  s = ok(act(s, { type: "sell", shares: 100_000 }));
  const owed = RATE * (100_000 * 100 * (1 - COST) - 100_000 * 1);
  near(wealthParts(s).tax, owed, 1e-6);
  const w0 = wealthParts(s).W;
  assert.equal(s.history[s.history.length - 1].W, w0); // history row refreshed after the action
  s = tickTo(s, "2020-03-30");
  const before = s;
  assert.equal(before.tax.paid, 0);
  const t = tick(before);
  assert.equal(t.state.d, "2020-03-31");
  const ev = t.events.find((e) => e.type === "taxPaid");
  assert.ok(ev, "tax paid on Mar 31");
  near(t.state.tax.paid, owed, 1e-6);
  near(wealthParts(t.state).tax, 0, 1e-6);
  assert.match(ev.text, /^Paid \$2\.4M of tax for the quarter from cash\.$/);
});

// ================================================================ gates
test("gates: every blocked control says why and when", () => {
  let s = game(spcxLike);
  const g = gates(s);
  assert.equal(g.sell.reason, "Locked by the lockup until Aug 6");
  assert.equal(g.sell.opensOn, "2026-08-06");
  assert.equal(g.collar.reason, "Locked by the lockup until Aug 6");
  assert.equal(g.pledge.reason, "Locked by the lockup until Aug 6");
  assert.equal(g.draw.allowed, false);
  assert.equal(g.adoptPlan.allowed, true); // window open on day 0
  assert.equal(g.cancelPlan.allowed, false);
  // blind card labels dates as day numbers
  const b = gates(game(fiveYear));
  assert.match(b.sell.reason, /^Locked by the lockup until day \d+$/);
  // closed window with free shares
  s = tickTo(s, "2026-09-21");
  const c = gates(s);
  assert.equal(c.sell.reason, "Window closed until Oct 22."); // no plan, so no plan claim
  assert.equal(c.adoptPlan.reason, "Window closed until Oct 22: a plan can be adopted then");
  assert.equal(c.sell.opensOn, "2026-10-22");
  assert.equal(c.collar.reason, "Window closed until Oct 22: a new collar can be set up then");
  assert.equal(c.pledge.allowed, true);
  assert.equal(c.buyPut.allowed, false);
  assert.equal(c.exchange.allowed, false);
  // collared shares cannot be sold; pledged shares cannot be sold
  let h = tickToIdx(game(flatCard({ n: 30 })), 2);
  h = ok(act(h, { type: "pledge", shares: 1_000_000 }));
  const r = canDo(h, "sell");
  assert.equal(r.allowed, false);
  assert.match(r.reason, /Pledged shares are held by the bank/);
});

test("gates: founder cannot sell before IPO day 91; Rule 144 volume cap binds and resets", () => {
  let s = tickTo(game(fiveYear, "founder"), "2020-03-02");
  const early = canDo(s, "sell");
  assert.equal(early.allowed, false);
  assert.match(early.reason, /^Affiliates cannot sell before IPO day 91 \(day \d+\)$/);
  s = tickTo(s, "2020-03-31");
  assert.equal(canDo(s, "sell").allowed, false);
  s = tickTo(s, "2020-04-01");
  assert.equal(canDo(s, "sell").allowed, true, canDo(s, "sell").reason);

  const card = flatCard({ n: 200, sharesOutPost: 20_000_000, vol: 100 });
  let f = tickTo(game(card, "founder"), "2020-04-01");
  const g = canDo(f, "sell");
  assert.equal(g.allowed, true);
  assert.equal(g.max, 200_000); // 1% of 20,000,000 outstanding
  assert.match(canDo(f, "sell", { shares: 200_001 }).reason, /^Rule 144 volume limit: you can sell up to 200,000 more shares/);
  f = ok(act(f, { type: "sell", shares: 200_000 }));
  const blocked = canDo(f, "sell");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "Rule 144 volume limit reached for this three-month period; room returns Jul 1");
  f = tickTo(f, "2020-06-30");
  assert.equal(canDo(f, "sell").allowed, false);
  f = tickTo(f, "2020-07-01");
  assert.equal(canDo(f, "sell").allowed, true);
  // average weekly volume can lift the cap
  const prices = weekdays("2020-01-02", 60).map((d) => [d, 100, 100, 10_000_000]);
  const r = rule144({ prices, i: 59, sharesOutPost: 20_000_000, sales: [] });
  assert.ok(r.cap > 200_000);
  near(r.avgWeekly, (20 * 10_000_000) / 4, 1e-6); // 20 weekdays in the prior 28 days
});

test("act rejects what the rules forbid and never mutates its input", () => {
  const s = game(spcxLike);
  const before = JSON.stringify(s);
  const r = act(s, { type: "sell", shares: 10 });
  assert.equal(r.error, "Locked by the lockup until Aug 6");
  assert.equal(r.state, s);
  assert.equal(act(s, { type: "collar", shares: 10, tenorMonths: 12, putPct: 0.85 }).error, "Locked by the lockup until Aug 6");
  assert.match(act(s, { type: "house", choice: "cash" }).error, /no house/);
  assert.equal(JSON.stringify(s), before);
  let u = tickTo(s, "2026-08-06");
  const b2 = JSON.stringify(u);
  ok(act(u, { type: "sell", shares: 100 }));
  assert.equal(JSON.stringify(u), b2);
  assert.equal(act(u, { type: "sell", shares: 0 }).error, "Enter a whole number of shares");
  assert.match(act(u, { type: "sell", shares: 999_999 }).error, /You have 148,148 free shares/);
});

// ================================================================ collars
test("collar: opens at zero cost inside the band; settles with max(Kp-S,0) - max(S-Kc,0); taxed; shares return to free", () => {
  const exp = "2020-07-30";
  const card = flatCard({ n: 200, close: (d) => (d >= exp ? 70 : 100) });
  let s = tickToIdx(game(card), 20); // options need 20 trading days of history
  const q = canDo(s, "collar", { shares: 500_000, tenorMonths: 6, putPct: 0.85 });
  assert.equal(q.allowed, true, q.reason);
  assert.ok(q.quote.Kc >= 110);
  s = ok(act(s, { type: "collar", shares: 500_000, tenorMonths: 6, putPct: 0.85 }));
  const c = s.collars[0];
  assert.equal(c.Kp, 85);
  assert.equal(c.expiry, exp);
  assert.equal(s.shares.collared, 500_000);
  assert.equal(s.shares.free, 500_000);
  assert.match(canDo(s, "sell", { shares: 500_001 }).reason, /You have 500,000 free shares/);
  const sn = snapshot(s);
  assert.ok(Math.abs(sn.collars[0].markPerShare) < 0.02, `mark ${sn.collars[0].markPerShare}`);
  // golden zero-cost call against the pricing module's own check
  assert.ok(c.Kc > 110 && c.Kc < 200);
  // expiry
  s = tickTo(s, "2020-07-29");
  assert.equal(s.collars.length, 1);
  const cash0 = s.cash, real0 = s.tax.realized;
  const t = tick(s);
  s = t.state;
  const e = t.events.find((x) => x.type === "collarExpiry");
  assert.ok(e && e.pause);
  const payoff = Math.max(85 - 70, 0) - Math.max(70 - c.Kc, 0);
  near(e.data.net, 500_000 * payoff, 1e-6);
  assert.equal(payoff, 15);
  near(s.cash - cash0, 7_500_000, 2000);
  near(s.tax.realized - real0, 7_500_000, 1e-6);
  assert.equal(s.shares.collared, 0);
  assert.equal(s.shares.free, 1_000_000);
  assert.equal(s.pendingEvent.type, "collarExpiry");
  assert.deepEqual(e.data.choices, ["roll", "end"]);
  assert.equal(e.data.canRoll, true);
  assert.equal(tick(s).blocked, true);
  // roll: a new collar on the same shares at today's prices
  const r = ok(act(s, { type: "collarExpiry", choice: "roll" }));
  assert.equal(r.collars.length, 1);
  assert.equal(r.collars[0].shares, 500_000);
  assert.equal(r.collars[0].Kp, 0.85 * 70);
  assert.equal(r.pendingEvent, null);
  const end = ok(act(s, { type: "collarExpiry", choice: "end" }));
  assert.equal(end.collars.length, 0);
  assert.equal(end.pendingEvent, null);
});

test("collar: call side loses when the stock ends above the cap", () => {
  const exp = "2020-07-30";
  const card = flatCard({ n: 200, close: (d) => (d >= exp ? 160 : 100) });
  let s = tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 20); // no index fund, so paying the loss realizes nothing else
  s = ok(act(s, { type: "collar", shares: 500_000, tenorMonths: 6, putPct: 0.85 }));
  const Kc = s.collars[0].Kc;
  s = tickTo(s, "2020-07-29");
  const real0 = s.tax.realized;
  const t = tick(s);
  const e = t.events.find((x) => x.type === "collarExpiry");
  near(e.data.net, -500_000 * (160 - Kc), 1e-6);
  near(t.state.tax.realized - real0, e.data.net, 1e-6);
  assert.match(e.text, /The call cost you/);
});

test("collar: roll at expiry obeys the trading window; shares return to free; canDo gives the reason with the reopen date", () => {
  const exp = "2020-07-30";
  const card = flatCard({ n: 200, earnings: [{ d: "2020-08-10" }] }); // window closed Jul 11 to Aug 11
  let s = tickToIdx(game(card), 20);
  s = ok(act(s, { type: "collar", shares: 400_000, tenorMonths: 6, putPct: 0.85 }));
  s = tickTo(s, "2020-07-29");
  const t = tick(s);
  s = t.state;
  const e = t.events.find((x) => x.type === "collarExpiry");
  assert.equal(s.d, exp);
  assert.equal(s.shares.free, 1_000_000);
  assert.equal(e.data.canRoll, false);
  assert.equal(e.data.rollReason, "Window closed until Aug 12: a new collar can be set up then");
  assert.equal(canDo(s, "collar").reason, "Window closed until Aug 12: a new collar can be set up then");
  assert.equal(canDo(s, "collar").opensOn, "2020-08-12");
  const bad = act(s, { type: "collarExpiry", choice: "roll" });
  assert.equal(bad.error, "Window closed until Aug 12: a new collar can be set up then");
  s = ok(act(s, { type: "collarExpiry", choice: "end" }));
  s = tickTo(s, "2020-08-12");
  assert.equal(canDo(s, "collar", { shares: 400_000, tenorMonths: 12, putPct: 0.85 }).allowed, true);
});

test("collar: band rule, early unwind at model value less 1% of notional, collared shares cannot be sold or pledged", () => {
  const card = flatCard({ n: 120 });
  let s = tickToIdx(game(card), 20);
  assert.match(canDo(s, "collar", { shares: 10, tenorMonths: 6, putPct: 0.95 }).reason, /80%, 85% or 90%/);
  assert.match(canDo(s, "collar", { shares: 10, tenorMonths: 7, putPct: 0.85 }).reason, /6, 12 or 24/);
  s = ok(act(s, { type: "collar", shares: 1_000_000, tenorMonths: 12, putPct: 0.9 }));
  assert.equal(canDo(s, "sell").allowed, false);
  assert.match(canDo(s, "sell").reason, /^Collared shares are held until the collar ends on /);
  assert.equal(canDo(s, "pledge").allowed, false);
  s = tickToIdx(s, 25);
  const c = s.collars[0];
  const mark = snapshot(s).collars[0].mark;
  const cash0 = s.cash, real0 = s.tax.realized;
  s = ok(act(s, { type: "unwindCollar", id: c.id }));
  const net = mark - 0.01 * 1_000_000 * 100;
  near(s.cash - cash0, net, 1e-6);
  near(s.tax.realized - real0, net, 1e-6);
  assert.equal(s.shares.free, 1_000_000);
  assert.equal(s.collars.length, 0);
});

test("collar: last SpaceX data day uses the options smile; flat vol otherwise", () => {
  let s = runToEnd(game(spcxLike, "engineer", { spcxOptions }));
  assert.equal(s.done, true);
  const q = collarQuote(s, 12, 0.85);
  assert.equal(q.usedSmile, true);
  assert.equal(q.error, null);
  assert.ok(q.capPct > 1.1 && q.capPct < 1.6, `cap ${q.capPct}`);
  assert.ok(Math.abs(q.volPut - 0.54) < 0.05);
  const flat = game(spcxLike, "engineer");
  const q2 = collarQuote(runToEnd(flat), 12, 0.85);
  assert.equal(q2.usedSmile, false);
  // a collar opened with the smile marks at ~zero (the vol offset is kept for the life of the collar)
});

// ================================================================ puts and exchange fund (should-haves)
test("put: premium from cash, free shares stay sellable, settles to cash with premium as a loss", () => {
  const exp = "2020-07-30";
  const card = flatCard({ n: 200, close: (d) => (d >= exp ? 60 : 100) });
  let s = tickToIdx(game(card), 20);
  const cash0 = s.cash + wealthParts(s).index;
  s = ok(act(s, { type: "buyPut", shares: 100_000, putPct: 0.85, tenorMonths: 6 }));
  const prem = s.puts[0].premium;
  assert.ok(prem > 0);
  near(cash0 - (s.cash + wealthParts(s).index), prem, 1e-6);
  assert.equal(s.shares.free, 1_000_000);
  s = tickTo(s, "2020-07-29");
  const t = tick(s);
  near(t.state.tax.realized - s.tax.realized, 100_000 * 25 - prem, 1e-6);
  assert.equal(t.state.puts.length, 0);
});

test("exchange fund: free shares move into it, value follows SPY less 1% a year, counted in W and unrealized tax", () => {
  const card = flatCard({ n: 120 });
  let s = tickToIdx(game(card), 2);
  assert.equal(canDo(s, "exchange", { shares: 5000 }).allowed, false);
  s = ok(act(s, { type: "exchange", shares: 300_000 }));
  assert.equal(s.shares.exchanged, 300_000);
  near(s.exchange.value, 30_000_000, 1e-6);
  const W0 = wealthParts(s).W;
  s = tickToIdx(s, 60);
  const ctx = getCtx(s);
  const ratio = ctx.spy[60] / ctx.spy[2];
  const fee = Math.pow(0.99, daysBetween(ctx.dates[2], ctx.dates[60]) / 365);
  near(s.exchange.value, 30_000_000 * ratio * fee, 1e-3);
  const sc = score(s);
  assert.ok(sc.unrealizedTax > 0);
  assert.equal(s.shares.locked + s.shares.free + s.shares.collared + s.shares.pledged + s.shares.sold + s.shares.exchanged, s.total);
  assert.ok(W0 > 0);
});

// ================================================================ the house
function houseScenario() {
  const card = flatCard({ n: 500 });
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "sell", shares: 400_000 })); // proceeds to the index fund
  const r = tickUntilEvent(s, "house");
  return { s: r.state, event: r.event, card };
}

test("house: five-year cards only, month 18, the exact copy, three choices as {choice, label}, no skip", () => {
  const { s, event } = houseScenario();
  assert.equal(event.text, "$10M is due for the family's house in 30 days. Choose how to pay.");
  assert.equal(event.pause, true);
  assert.deepEqual(event.data.choices, [
    { choice: "cash", label: "Pay from cash and the index fund" },
    { choice: "credit", label: "Draw the credit line" },
    { choice: "sell", label: "Sell shares" },
  ]);
  assert.equal(s.d, "2021-07-02");
  assert.equal(s.pendingEvent.type, "house");
  assert.equal(tick(s).blocked, true);
  assert.match(act(s, { type: "house", choice: "skip" }).error, /The house choices are cash, credit or sell/);
  assert.ok(!/no effect on your score|score effect/i.test(event.text));
  // never on the live card
  const live = runToEnd(game(spcxLike));
  assert.equal(live.flags.houseDone, false);
});

test("house: cash (cash then index, overdraft if short), credit (needs headroom), sell (needs allowance)", () => {
  const { s } = houseScenario();
  // credit with no pledged shares
  assert.match(act(s, { type: "house", choice: "credit" }).error, /^The credit line has \$0 of room/);
  assert.equal(canDo(s, "house", { choice: "credit" }).allowed, false);
  assert.equal(canDo(s, "house", { choice: "sell" }).allowed, true);
  assert.equal(canDo(s, "house", { choice: "cash" }).allowed, true);
  // cash: cash then index
  const a = ok(act(s, { type: "house", choice: "cash" }));
  assert.equal(a.pendingEvent, null);
  assert.equal(a.flags.houseDone, true);
  assert.equal(a.history[a.history.length - 1].S, a.spentToday);
  near(a.spentToday - s.spentToday, HOUSE, 1e-6);
  near(wealthParts(a).W - wealthParts(s).W, -HOUSE, 1e-3); // paid with real money: W falls by 10M (S_t adds it back)
  assert.equal(a.overdraft, 0);
  // credit with pledged shares
  let c = ok(act(s, { type: "pledge", shares: 400_001 }));
  c = ok(act(c, { type: "house", choice: "credit" }));
  near(c.loan.balance, HOUSE, 1e-6);
  // sell
  const sl = ok(act(s, { type: "house", choice: "sell" }));
  const P = 100;
  assert.equal(sl.shares.sold, 400_000 + Math.ceil(HOUSE / (P * (1 - COST))));
  assert.equal(sl.flags.houseDone, true);
  // cash when cash and the index fund fall short: the rest goes on the overdraft
  const poor = { ...s, cash: 1_000_000, index: { units: 0, cost: 0 } };
  const o = ok(act(poor, { type: "house", choice: "cash" }));
  near(o.overdraft, HOUSE - 1_000_000, 1e-6);
  assert.equal(o.flags.houseDone, true);
  const dd = debrief(a, score(a), {});
  assert.match(dd.paragraphs[1], /paid for the house/);
  assert.ok(!dd.paragraphs.join(" ").includes("skipped"));
});

test("house: 'sell' while the window is closed gives the reason and the reopen date", () => {
  const card = flatCard({ n: 500, earnings: [{ d: "2021-07-20" }] });
  let s = tickToIdx(game(card), 2);
  s = ok(act(s, { type: "sell", shares: 100_000 }));
  const r = tickUntilEvent(s, "house");
  assert.equal(r.event.data.canSell, false);
  assert.equal(act(r.state, { type: "house", choice: "sell" }).error, "Window closed until Jul 22.");
  assert.equal(canDo(r.state, "house", { choice: "sell" }).reason, "Window closed until Jul 22.");
});

// ================================================================ events, snapshot
test("snapshot: shape, day labels, window, nextRelease", () => {
  const s = game(spcxLike);
  const sn = snapshot(s);
  assert.equal(sn.dayLabel, "Day 1 of 98 so far");
  assert.equal(sn.close, 160.95);
  assert.equal(sn.offerPrice, 135);
  assert.equal(sn.window.open, true);
  assert.equal(sn.window.closesOn, "2026-07-05");
  assert.deepEqual(sn.nextRelease, { date: "2026-08-06", pct: 20, shares: 148148 });
  assert.equal(sn.profit, 0);
  assert.ok(sn.gates.sell.reason);
  for (const k of ["shares", "cash", "overdraft", "index", "loan", "collars", "puts", "plan", "exchange", "taxOwed", "W", "window", "gates"]) assert.ok(k in sn, k);
  const f = game(fiveYear);
  assert.equal(snapshot(f).dayLabel, "Year 1 of 5 · Month 1");
  assert.equal(snapshot(tickToIdx(f, 300)).dayLabel, "Year 2 of 5 · Month 3");
  const rivals = { holder: [1, 2], seller: [3, 4], playbook: [5, 6] };
  assert.deepEqual(snapshot(tickToIdx(f, 1), rivals).rivals, { holder: 2, seller: 4, playbook: 6 });
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(snapshot(s)))), JSON.stringify(snapshot(s)));
});

test("events: window copy, news on its date, plan live, card end", () => {
  let s = game(fiveYear);
  const all = [];
  while (!s.done) {
    const t = tick(s); s = t.state; all.push(...t.events);
    if (s.pendingEvent) s = ok(act(s, { type: "house", choice: "cash" }));
  }
  const closes = all.filter((e) => e.type === "windowClose");
  assert.ok(closes.length >= 15);
  assert.match(closes[0].text, /^The trading window is closed until day \d+\.$/); // no plan, so no plan claim
  assert.equal(all.filter((e) => e.type === "news").length, 1);
  assert.equal(all[all.length - 1].type, "cardEnd");
  for (const e of all) { assert.ok(!e.text.includes("!"), e.text); assert.ok(!/recommended/i.test(e.text)); assert.ok(typeof e.pause === "boolean"); assert.ok(e.d); }
  // spcx live card: window close copy uses real dates
  let l = game(spcxLike); const le = [];
  while (!l.done) { const t = tick(l); l = t.state; le.push(...t.events); }
  const wc = le.find((e) => e.type === "windowClose");
  assert.equal(wc.text, "The trading window is closed until Aug 6.");
  assert.equal(wc.d, "2026-07-06");
});

// ================================================================ test 11: determinism
function scripted() {
  return {
    day(s) {
      const g = gates(s);
      const out = [];
      if (s.i === 90 && g.sell.allowed) out.push({ type: "sell", shares: Math.floor(g.sell.max / 10) });
      if (s.i === 95 && g.collar.allowed) out.push({ type: "collar", shares: 100_000, tenorMonths: 12, putPct: 0.85 });
      if (s.i === 100 && g.pledge.allowed) out.push({ type: "pledge", shares: 50_000 });
      if (s.i === 101 && s.shares.pledged > 0) out.push({ type: "draw", amount: Math.floor(canDo(s, "draw").max / 2) });
      if (s.i === 200 && g.adoptPlan.allowed) out.push({ type: "adoptPlan", pct: 5, months: 12 });
      if (s.i === 400 && g.exchange.allowed) out.push({ type: "exchange", shares: Math.floor(s.shares.free / 4) });
      if (s.i === 500 && g.buyPut.allowed) out.push({ type: "buyPut", shares: 20_000, putPct: 0.9, tenorMonths: 6 });
      return out;
    },
  };
}

test("11: determinism: same card, seat and action log give the same result to the cent; state is JSON-clean", () => {
  const cfg = { card: fiveYear, seat: "engineer", market };
  const a = runWithPolicy(createGame(cfg), scripted());
  assert.ok(a.log.length >= 5, `log has ${a.log.length} actions`);
  const b = replay(cfg, a.log, { toEnd: true });
  assert.equal(JSON.stringify(b.history), JSON.stringify(a.history));
  const sa = score(a), sb = score(b);
  assert.equal(sa.afterTaxWealth, sb.afterTaxWealth);
  assert.equal(sa.sharpe, sb.sharpe);
  assert.equal(sa.irr, sb.irr);
  assert.equal(Math.round(sa.afterTaxWealth * 100), Math.round(sb.afterTaxWealth * 100));
  const c = runWithPolicy(createGame(cfg), scripted());
  assert.equal(JSON.stringify(c), JSON.stringify(a));
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(a))), JSON.stringify(a));
});

test("11b: bots are deterministic and return {state, series, events, score}", () => {
  for (const bot of BOTS) {
    const r1 = runBot(bot, fiveYear, "engineer", market);
    const r2 = runBot(bot, fiveYear, "engineer", market);
    assert.equal(JSON.stringify(r1.series), JSON.stringify(r2.series));
    assert.equal(JSON.stringify(r1.score), JSON.stringify(r2.score));
    assert.equal(r1.series.length, 1261);
    assert.equal(r1.events.length, 1261);
    assert.equal(r1.series[1260], r1.state.history[1260].W);
    assert.equal(r1.state.done, true);
  }
});

// ================================================================ test 12: invariants
function invariants(state, label) {
  const ctx = getCtx(state);
  const sh = state.shares;
  const sum = sh.locked + sh.free + sh.collared + sh.pledged + sh.sold + sh.exchanged;
  assert.equal(sum, state.total, `${label} partition ${state.d}`);
  for (const k of Object.keys(sh)) assert.ok(sh[k] >= 0 && Number.isInteger(sh[k]), `${label} ${k}=${sh[k]} on ${state.d}`);
  // locked shares leave only through the lockup ladder
  let released = 0;
  for (const r of ctx.releases) if (state.flags.seenTranches.includes(r.id)) released += r.shares;
  // shares re-locked after a limited employee sale window count as locked until they return
  const relocked = Object.values(state.flags.relocked || {}).reduce((a, x) => a + x, 0);
  assert.equal(sh.locked, state.total - released + relocked, `${label} locked ${state.d}`);
  assert.ok(state.cash >= -1e-6, `${label} cash ${state.cash} on ${state.d}`);
  assert.ok(state.overdraft >= -1e-6 && state.loan.balance >= -1e-6);
  const collared = state.collars.reduce((a, c) => a + c.shares, 0);
  assert.equal(collared, sh.collared, `${label} collar shares ${state.d}`);
  // no hedge is opened while a 10b5-1 plan is active (a collar set earlier the same day, before the plan, may stay)
  if (state.plan) for (const c of state.collars) assert.ok(c.start <= state.plan.adoptedOn, `${label} collar ${c.id} opened ${c.start} under the plan adopted ${state.plan.adoptedOn}`);
  // W recomputes from parts
  const p = wealthParts(state);
  const P = ctx.close[state.i];
  const W = (sh.locked + sh.free + sh.collared + sh.pledged) * P + p.collars + p.puts + state.index.units * ctx.spy[state.i] +
    (state.exchange ? state.exchange.value : 0) + state.cash - state.loan.balance - state.loan.accrued - state.overdraft - state.overdraftAccrued -
    Math.max(0, RATE * Math.max(0, state.tax.realized) - state.tax.paid);
  near(p.W, W, 1e-6 * Math.max(1, Math.abs(W)), `${label} W parts ${state.d}`);
  near(state.history[state.history.length - 1].W, p.W, 1e-6 * Math.max(1, Math.abs(W)), `${label} row W ${state.d}`);
  assert.equal(state.history.length, state.i + 1);
}

function runChecked(label, card, seat, policy, opts = {}) {
  const start = createGame({ card, seat, market, opts });
  invariants(start, label);
  let days = 0;
  const end = runWithPolicy(start, policy, (_ev, s) => { invariants(s, label); days++; });
  assert.ok(end.done);
  return { end, days };
}

for (const [name, card, seats] of [["five-year", fiveYear, ["engineer", "founder"]], ["spcx-like", spcxLike, ["engineer"]]]) {
  for (const seat of seats) {
    for (const bot of BOTS) {
      test(`12: invariants every day: ${bot} on ${name} (${seat})`, () => {
        const { end, days } = runChecked(`${bot}/${name}/${seat}`, card, seat, botPolicy(bot));
        assert.ok(days >= card.prices.length);
        assert.equal(end.history.length, card.prices.length);
      });
    }
  }
}

// a seeded chaos policy that tries every action type; the invariants must hold whatever it manages to do
function chaos(seed) {
  let x = seed >>> 0;
  const rnd = () => { x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return {
    day(s) {
      if (rnd() > 0.12) return [];
      const type = pick(["sell", "adoptPlan", "cancelPlan", "collar", "unwindCollar", "pledge", "unpledge", "draw", "repay", "deposit", "withdraw", "buyPut", "exchange"]);
      const g = canDo(s, type === "unwindCollar" ? "cancelPlan" : type, {});
      const frac = () => 0.1 + 0.9 * rnd();
      switch (type) {
        case "sell": return g.max ? [{ type, shares: Math.max(1, Math.floor(g.max * frac())) }] : [];
        case "adoptPlan": return [{ type, pct: pick([2, 5, 10]), months: pick([6, 12, 18]) }];
        case "cancelPlan": return [{ type }];
        case "collar": return g.max ? [{ type, shares: Math.max(1, Math.floor(g.max * frac())), tenorMonths: pick([6, 12, 24]), putPct: pick([0.8, 0.85, 0.9]) }] : [];
        case "unwindCollar": return s.collars.length ? [{ type, id: s.collars[0].id }] : [];
        case "pledge": return g.max ? [{ type, shares: Math.max(1, Math.floor(g.max * frac())) }] : [];
        case "unpledge": { const m = canDo(s, "unpledge").max; return m ? [{ type, shares: Math.max(1, Math.floor(m * frac())) }] : []; }
        case "draw": return g.max ? [{ type, amount: Math.floor(g.max * frac()) }] : [];
        case "repay": return g.max ? [{ type, amount: Math.floor(g.max * frac()) }] : [];
        case "deposit": return g.max ? [{ type, amount: Math.floor(g.max * frac()) }] : [];
        case "withdraw": return g.max ? [{ type, amount: Math.floor(g.max * frac()) }] : [];
        case "buyPut": return g.max ? [{ type, shares: Math.max(1, Math.floor(g.max * frac() / 4)), putPct: pick([0.8, 0.85, 0.9]), tenorMonths: pick([6, 12]) }] : [];
        case "exchange": return g.max ? [{ type, shares: Math.max(1, Math.floor(g.max * frac() / 3)) }] : [];
        default: return [];
      }
    },
    respond(s, e) {
      if (e.type === "house") return { type: "house", choice: pick(["cash", "credit", "sell"]) };
      if (e.type === "marginCall") return { type: "marginCall", choice: pick(["post", "sell", "wait"]) };
      return { type: "collarExpiry", choice: pick(["roll", "end"]) };
    },
  };
}

for (const seed of [1, 2, 3, 4]) {
  for (const [name, card, seat] of [["five-year", fiveYear, "engineer"], ["five-year", fiveYear, "founder"], ["spcx-like", spcxLike, "engineer"]]) {
    test(`12: invariants every day: seeded chaos ${seed} on ${name} (${seat})`, () => {
      const { end } = runChecked(`chaos${seed}/${name}/${seat}`, card, seat, chaos(seed * 7919 + (seat === "founder" ? 1 : 0)));
      assert.ok(end.log.length >= 1);
      const sc = score(end);
      assert.ok(Number.isFinite(sc.finalW));
    });
  }
}

// ================================================================ scores, bots, debrief
test("bots: sensible behaviour on the five-year card; scores have every field", (t) => {
  const res = {};
  for (const b of BOTS) res[b] = runBot(b, fiveYear, "engineer", market);
  for (const b of BOTS) {
    const sc = res[b].score;
    for (const k of ["sharpe", "maxDrawdown", "irr", "afterTaxWealth", "totalSpending", "taxesPaid", "finalW", "unrealizedTax", "days", "flows"]) assert.ok(k in sc, `${b} ${k}`);
    assert.ok(Number.isFinite(sc.sharpe));
    assert.ok(sc.maxDrawdown.pct <= 0);
    assert.ok(sc.maxDrawdown.peakDate <= sc.maxDrawdown.troughDate);
    t.diagnostic(`${b}: sharpe ${sc.sharpe.toFixed(2)}, maxDD ${(sc.maxDrawdown.pct * 100).toFixed(1)}%, irr ${(sc.irr * 100).toFixed(1)}%, wealth ${Math.round(sc.afterTaxWealth)}`);
  }
  assert.equal(res.holder.state.shares.sold < res.holder.state.total * 0.6, true);
  assert.equal(res.holder.state.collars.length, 0);
  assert.equal(res.holder.state.loan.balance, 0);
  assert.equal(res.holder.state.stats.collarCount, 0);
  assert.equal(res.seller.state.shares.locked + res.seller.state.shares.free, 0);
  assert.ok(res.playbook.state.stats.collarCount >= 1);
  assert.ok(res.playbook.state.stats.sells >= 1 || res.playbook.state.stats.planSells >= 1);
  // total spending: 59 months from the second month plus the house
  const months = res.holder.state.history.filter((r) => r.S === SPEND).length;
  assert.ok(months >= 55);
  assert.equal(res.holder.state.flags.houseDone, true);
  assert.ok(!("houseSkipped" in res.seller.state.flags)); // the house cannot be skipped
  // after-tax wealth identity
  const sc = res.seller.score;
  near(sc.afterTaxWealth, sc.finalW - sc.unrealizedTax + sc.totalSpending, 1e-6);
});

test("score: R_t, Sharpe, drawdown and IRR come from the history exactly as PRD 4.8 says", () => {
  const r = runBot("seller", fiveYear, "engineer", market);
  const h = r.state.history, sc = r.score;
  const R = [];
  for (let t = 1; t < h.length; t++) R.push((h[t].W + h[t].S) / h[t - 1].W - 1);
  const ex = R.map((x, k) => x - h[k + 1].rf);
  const mean = ex.reduce((a, b) => a + b, 0) / ex.length;
  const sd = Math.sqrt(ex.reduce((a, b) => a + (b - mean) ** 2, 0) / (ex.length - 1));
  near(sc.sharpe, (mean / sd) * Math.sqrt(252), 1e-9);
  let v = 1, peak = 1, mdd = 0;
  for (const x of R) { v *= 1 + x; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
  near(sc.maxDrawdown.pct, mdd, 1e-12);
  near(h[1].rf, dailyRf(getCtx(r.state).dgs1mo[1]), 1e-15);
  // Decision RUN-5: day-0 flow is after the tax embedded in the stake.
  near(sc.flows[0].amount, -(h[0].W - 0.238 * Math.max(0, r.state.total * (h[0].close - r.state.basis))), 1e-6);
  assert.equal(sc.flows[sc.flows.length - 1].d, h[h.length - 1].d);
  near(sc.flows.slice(1, -1).reduce((a, f) => a + f.amount, 0) + (h[h.length - 1].S > 0 ? 0 : 0), sc.totalSpending - (h[h.length - 1].S > 0 ? h[h.length - 1].S : 0), 1e-6);
  assert.ok(sc.irr > -0.99 && sc.irr < 10);
});

test("debrief and achievements: three paragraphs, a verdict, plain copy", () => {
  const bots = {};
  for (const b of BOTS) bots[b] = runBot(b, fiveYear, "engineer", market);
  const me = bots.seller; // pretend the player is the Seller run
  const botScores = { holder: bots.holder.score, seller: bots.seller.score, playbook: bots.playbook.score };
  const d = debrief(me.state, me.score, botScores);
  assert.equal(d.paragraphs.length, 3);
  for (const p of d.paragraphs) { assert.ok(p.length > 40); assert.ok(!p.includes("!")); assert.ok(!/recommended/i.test(p)); }
  assert.match(d.verdict, /^You beat /);
  assert.match(d.verdict, /of 4/);
  assert.match(d.paragraphs[2], /after tax/);
  const mine = achievements(me.state, me.score, botScores);
  for (const id of mine) assert.ok(ACHIEVEMENTS[id], id);
  assert.ok(!mine.includes("beat-seller")); // a run cannot beat itself on 3 of 4 measures
  assert.ok(Object.keys(ACHIEVEMENTS).length === 12);
  assert.ok(!Object.keys(ACHIEVEMENTS).some((id) => /forced|margin-call-survivor|leverage/.test(id)));
});

test("bots run on the live SpaceX-like card and the engineer seat only", () => {
  for (const b of BOTS) {
    const r = runBot(b, spcxLike, "engineer", market, spcxOptions);
    assert.equal(r.series.length, 98);
    assert.equal(r.state.flags.houseDone, false);
  }
  assert.throws(() => runBot("holder", spcxLike, "founder", market), /locked until June 12, 2027/);
});

// ================================================================ accuracy fixes (critics, 2026-11-02)
const PLAN_RULE = "A 10b5-1 plan is active, so new collars and puts are not allowed: a new hedge on the stock would void the plan's defense (Rule 10b5-1(c)(1)(i)(C)). Cancelling the plan lifts the block, and a later plan starts a new cooling-off.";

test("2: no new collar or put while a 10b5-1 plan is active, cooling-off included; existing hedges stay; cancelling frees the hedge tools", () => {
  const card = flatCard({ n: 300 });
  let s = tickToIdx(game(card), 21);
  s = ok(act(s, { type: "collar", shares: 100_000, tenorMonths: 6, putPct: 0.85 })); // before the plan
  s = ok(act(s, { type: "adoptPlan", pct: 5, months: 12 }));
  assert.equal(snapshot(s).plan.status, "cooling-off");
  for (const [type, p] of [["collar", { shares: 10_000, tenorMonths: 12, putPct: 0.85 }], ["buyPut", { shares: 10_000, putPct: 0.85, tenorMonths: 6 }]]) {
    assert.equal(canDo(s, type, p).allowed, false, type);
    assert.equal(canDo(s, type, p).reason, PLAN_RULE);
    assert.equal(act(s, { type, ...p }).error, PLAN_RULE);
  }
  assert.equal(gates(s).collar.reason, PLAN_RULE);
  assert.equal(gates(s).buyPut.reason, PLAN_RULE);
  assert.equal(s.collars.length, 1); // the existing collar may stay
  // a live plan blocks too
  let live = tickTo(s, s.plan.firstTradeOn);
  live = tickUntilEvent(live, "planSale").state;
  assert.equal(snapshot(live).plan.status, "live");
  assert.equal(canDo(live, "collar").reason, PLAN_RULE);
  // cancel the plan: hedging is allowed again (window open)
  const c = ok(act(s, { type: "cancelPlan" }));
  assert.equal(canDo(c, "collar", { shares: 10_000, tenorMonths: 12, putPct: 0.85 }).allowed, true);
  assert.equal(canDo(c, "buyPut", { shares: 10_000, putPct: 0.85, tenorMonths: 6 }).allowed, true);
});

test("2b: a collar rolled at expiry is a new hedge: blocked while a plan is active", () => {
  const card = flatCard({ n: 300 });
  let s = tickToIdx(game(card), 20);
  s = ok(act(s, { type: "collar", shares: 100_000, tenorMonths: 6, putPct: 0.85 }));
  s = ok(act(s, { type: "adoptPlan", pct: 2, months: 18 }));
  const r = tickUntilEvent(s, "collarExpiry");
  assert.ok(r.event);
  assert.equal(r.event.data.canRoll, false);
  assert.match(r.event.data.rollReason, /^A 10b5-1 plan is active/);
  assert.match(act(r.state, { type: "collarExpiry", choice: "roll" }).error, /^A 10b5-1 plan is active/);
  assert.ok(!/\.\./.test(r.event.text), r.event.text);
  ok(act(r.state, { type: "collarExpiry", choice: "end" }));
});

test("2c: The Playbook collars its thirds first, adopts its plan only once nothing is left to collar, and never hedges under a plan", () => {
  for (const [card, seat] of [[fiveYear, "engineer"], [fiveYear, "founder"], [spcxLike, "engineer"]]) {
    const r = runBot("playbook", card, seat, market, spcxOptions);
    const log = r.state.log;
    const firstPlan = log.findIndex((a) => a.type === "adoptPlan");
    const firstCollar = log.findIndex((a) => a.type === "collar");
    assert.ok(firstCollar >= 0, `${card.id} ${seat} collars`);
    assert.ok(firstPlan > firstCollar, `${card.id} ${seat}: the first collar comes before the first plan`);
    // replay the log: no collar or put is ever accepted while a plan is active (the engine would have rejected it)
    let plan = false;
    for (const a of log) {
      if (a.type === "adoptPlan") plan = true;
      if (a.type === "cancelPlan") plan = false;
      if (plan && (a.type === "collar" || a.type === "buyPut")) assert.fail(`${a.type} on ${a.d} under a plan`);
    }
    assert.ok(r.state.stats.collarCount >= 1);
  }
});

test("7: collars and puts need 20 trading days of price history", () => {
  const card = flatCard({ n: 60 });
  let s = tickToIdx(game(card), 19);
  const c = canDo(s, "collar", { shares: 10, tenorMonths: 12, putPct: 0.85 });
  assert.equal(c.allowed, false);
  assert.equal(c.reason, "Options need 20 trading days of price history to price. Collars open on Jan 30.");
  assert.equal(c.opensOn, "2020-01-30");
  assert.equal(canDo(s, "buyPut", { shares: 10, putPct: 0.85, tenorMonths: 6 }).reason, "Options need 20 trading days of price history to price. Puts open on Jan 30.");
  assert.equal(act(s, { type: "collar", shares: 10, tenorMonths: 12, putPct: 0.85 }).error, c.reason);
  s = tickToIdx(s, 20);
  assert.equal(canDo(s, "collar", { shares: 10, tenorMonths: 12, putPct: 0.85 }).allowed, true);
  assert.equal(canDo(s, "buyPut", { shares: 10, putPct: 0.85, tenorMonths: 6 }).allowed, true);
  // blind cards name the day, not the date
  const b = tickToIdx(game(fiveYear), 5);
  assert.ok(b.shares.free === 0 || /day \d+|Locked/.test(canDo(b, "collar").reason));
});

test("6: terminal tax = 0.238 * max(0, G + U) - 0.238 * max(0, G); realized losses net against unrealized gains", () => {
  // sell 1,000 shares at a loss (close 0.5 against a $1 basis), then the stock goes to $100
  const card = flatCard({ n: 80, close: (d, i) => (i === 2 ? 0.5 : 100) });
  let s = tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 2);
  s = ok(act(s, { type: "sell", shares: 1000 }));
  const G = s.tax.realized;
  assert.ok(G < 0);
  s = tickToIdx(s, 30);
  const tt = terminalTax(s);
  const U = s.shares.free * (100 - 1) + (s.index.units * getCtx(s).spy[s.i] - s.index.cost);
  near(tt.U, U, 1e-6); near(tt.G, G, 1e-9);
  near(tt.unrealizedTax, RATE * (G + U), 1e-6); // the old formula charged RATE * U
  assert.ok(tt.unrealizedTax < RATE * U);
  near(score(s).unrealizedTax, tt.unrealizedTax, 1e-9);
  near(snapshot(s).unrealizedTax, tt.unrealizedTax, 1e-9);
  near(score(s).afterTaxWealth, score(s).finalW - tt.unrealizedTax + score(s).totalSpending, 1e-6);
  // an open collar's mark (zero cost, so all gain or loss) counts in U
  let c = tickToIdx(game(flatCard({ n: 80 }), "engineer", { opts: { autoInvest: false } }), 21);
  c = ok(act(c, { type: "collar", shares: 500_000, tenorMonths: 12, putPct: 0.85 }));
  c = tickToIdx(c, 40);
  const mark = snapshot(c).collars[0].mark;
  const base = RATE * (c.total * (100 - 1) + mark) - RATE * Math.max(0, c.tax.realized);
  near(terminalTax(c).unrealizedTax, Math.max(-wealthParts(c).tax, base), 1e-6);
  near(terminalTax(c).U, c.total * 99 + mark, 1e-6);
});

test("6a: tax already paid is credited at the end: paid + owed + terminal tax = 23.8% * max(0, G + U), even when a later loss leaves more paid than 23.8% of G", () => {
  // sell 300,000 shares at $100 (a large gain) and buy a put; the quarter-end payments go out; the put then expires worthless, a realized loss
  const card = flatCard({ n: 250 });
  let s = tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 2);
  s = ok(act(s, { type: "sell", shares: 300_000 }));
  s = tickToIdx(s, 21);
  s = ok(act(s, { type: "buyPut", shares: 100_000, putPct: 0.85, tenorMonths: 6 }));
  const premium = s.puts[0].premium;
  assert.ok(premium > 100_000);
  while (s.puts.length && !s.done) s = tickToIdx(s, s.i + 1);
  assert.equal(s.puts.length, 0, "the put expired");
  const tt = terminalTax(s);
  assert.ok(s.tax.paid > 0);
  assert.ok(RATE * tt.G < s.tax.paid - 1_000, "more tax was paid than 23.8% of the gain now on the ledger");
  const total = s.tax.paid + wealthParts(s).tax + tt.unrealizedTax;
  near(total, RATE * Math.max(0, tt.G + tt.U), 1e-6, "tax in total");
  near(tt.unrealizedTax, RATE * (tt.G + tt.U) - s.tax.paid, 1e-6);
  near(score(s).unrealizedTax, tt.unrealizedTax, 1e-9);
});

test("6a2: the shipped card c6 Seller is not overtaxed: tax paid + owed + terminal tax = 23.8% * (G + U) to the cent", (t) => {
  const cf = path.join(here, "..", "data", "cards", "c6.json"), mf = path.join(here, "..", "data", "market.json");
  if (!fs.existsSync(cf) || !fs.existsSync(mf)) return t.skip("c6 not built");
  const card = JSON.parse(fs.readFileSync(cf, "utf8")), mk = JSON.parse(fs.readFileSync(mf, "utf8"));
  const r = runBot("seller", card, "engineer", mk, null);
  const tt = terminalTax(r.state);
  assert.ok(RATE * tt.G < r.state.tax.paid, "the Seller paid more than 23.8% of its final realized gain");
  near(r.state.tax.paid + wealthParts(r.state).tax + tt.unrealizedTax, RATE * Math.max(0, tt.G + tt.U), 0.01);
});

test("6b: never below what the ledger already owes: a crash after the tax is paid cannot create a refund", () => {
  const card = flatCard({ n: 120, close: (d, i) => (i >= 90 ? 0.01 : 100) });
  let s = tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 2);
  s = ok(act(s, { type: "sell", shares: 1000 }));
  const owed0 = wealthParts(s).tax;
  assert.ok(owed0 > 0);
  // before the quarter-end payment the whole owed tax can be refunded against a collapse in the stock
  s = tickToIdx(s, 30);
  assert.ok(terminalTax(s).unrealizedTax <= 0 || Math.abs(terminalTax(s).unrealizedTax) > 0);
  s = tickToIdx(s, 95); // paid on Mar 31, then the stock is at $0.01
  assert.ok(s.tax.paid > 0);
  assert.equal(wealthParts(s).tax, 0);
  assert.equal(terminalTax(s).unrealizedTax, 0); // raw would be negative; floored at what the ledger owes (nothing)
  // with the tax still unpaid, the refund stops at the ledger's liability
  let t = tickToIdx(game(flatCard({ n: 40, close: (d, i) => (i >= 20 ? 0.01 : 100) }), "engineer", { opts: { autoInvest: false } }), 2);
  t = ok(act(t, { type: "sell", shares: 1000 }));
  t = tickToIdx(t, 25);
  near(terminalTax(t).unrealizedTax, -wealthParts(t).tax, 1e-6);
});

// A flat $100 card whose adjusted close steps up on idx 30 as a $2 dividend would make it: close_{t-1} * adj_t/adj_{t-1} - close_t = 2.
function dividendCard() {
  const card = flatCard({ n: 120 });
  let adj = 100;
  card.prices = card.prices.map((r, i) => { if (i === 30) adj *= 102 / 100; return [r[0], r[1], adj, r[3]]; });
  return card;
}

test("8: dividends: D_t from the adjusted series, paid on every share held (locked and pledged included) to cash, taxed at 23.8%, in W", () => {
  const card = dividendCard();
  const ctx0 = getCtx(game(card));
  assert.equal(ctx0.div.filter((x) => x > 0).length, 1);
  near(ctx0.div[30], 2, 1e-9);
  let s = tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 5);
  s = ok(act(s, { type: "pledge", shares: 200_000 }));
  s = ok(act(s, { type: "sell", shares: 100_000 }));
  const sold = 100_000;
  s = tickToIdx(s, 29);
  const cash0 = s.cash, real0 = s.tax.realized, W0 = wealthParts(s).W;
  const t = tick(s);
  const ev = t.events.find((e) => e.type === "dividend");
  assert.ok(ev, "dividend event");
  const held = 1_000_000 - sold; // free + pledged; sold shares earn nothing
  near(ev.data.amount, held * 2, 1e-6);
  const s2 = t.state;
  near(s2.cash - cash0, held * 2 + (cash0 * dailyRf(getCtx(s2).dgs1mo[30])), 1e-3);
  near(s2.tax.realized - real0, held * 2, 1e-6);
  assert.ok(wealthParts(s2).W - W0 > held * 2 * (1 - RATE) - 5000, "the dividend is in W, net of the tax accrued on it");
  assert.match(ev.text, /^Dividend of \$2\.00 a share on 900,000 shares: \$1\.8M paid to cash\./);
  assert.equal(s2.stats.dividends, held * 2);
  // locked shares earn it too: pay the dividend on day 30 while a tranche is still locked
  const c2 = dividendCard();
  c2.lockup.groups[0].tranches[0].trigger = { type: "date", date: c2.prices[60][0] };
  c2.lockup.groups[0].tranches[0].resolvedDate = c2.prices[60][0];
  c2.lockup.groups[1].tranches[0].trigger = { type: "date", date: c2.prices[60][0] };
  c2.lockup.groups[1].tranches[0].resolvedDate = c2.prices[60][0];
  let l = tickToIdx(game(c2, "engineer", { opts: { autoInvest: false } }), 30);
  assert.equal(l.shares.locked, 1_000_000);
  near(l.stats.dividends, 2_000_000, 1e-6);
});

test("8b: dividends on the shipped KE Holdings card (c3) come from its adjusted series; the Holder collects them", (t) => {
  const f = path.join(here, "..", "data", "cards", "c3.json");
  const mf = path.join(here, "..", "data", "market.json");
  if (!fs.existsSync(f) || !fs.existsSync(mf)) return t.skip("c3 not built");
  const card = JSON.parse(fs.readFileSync(f, "utf8"));
  const mk = JSON.parse(fs.readFileSync(mf, "utf8"));
  const r = runBot("holder", card, "engineer", mk);
  const ctx = getCtx(r.state);
  const days = ctx.dates.filter((d, i) => ctx.div[i] > 0);
  assert.deepEqual(days, ["2023-09-14", "2024-04-04", "2025-04-09"]);
  assert.ok(r.state.stats.dividends > 0);
  // every other shipped card has adj == close: no dividends
  for (const id of ["c1", "c2", "c4", "c5", "c6", "spcx"]) {
    const cf = path.join(here, "..", "data", "cards", `${id}.json`);
    if (!fs.existsSync(cf)) continue;
    const c = JSON.parse(fs.readFileSync(cf, "utf8"));
    const g = createGame({ card: c, seat: "engineer", market: mk });
    assert.equal(getCtx(g).div.filter((x) => x > 0).length, 0, id);
  }
});

test("9: auto-invest sweeps cash above $2M into the index fund on the first trading day of each month, never borrowed money", () => {
  const card = flatCard({ n: 200 });
  let s = tickToIdx(game(card), 2);
  s = tickTo(s, "2020-02-03"); // first trading day of February: spend $166,667, then sweep
  near(s.cash, AUTO_INVEST_KEEP, 1e-6);
  assert.ok(s.index.cost > 800_000 && s.index.cost < 840_000, `swept ${s.index.cost}`);
  near(s.index.cost, 3_000_000 - 166_667 - AUTO_INVEST_KEEP + (s.index.cost - (3_000_000 - 166_667 - AUTO_INVEST_KEEP)), 1e-6);
  // with auto-invest off, nothing is swept
  const off = tickTo(tickToIdx(game(card, "engineer", { opts: { autoInvest: false } }), 2), "2020-02-03");
  assert.ok(off.cash > 2_800_000);
  assert.equal(off.index.units, 0);
  // borrowed cash is never swept: draw $10M against pledged shares (cash goes to ~13M); the sweep stops at cash = loan owed
  let b = tickToIdx(game(card), 2);
  b = ok(act(b, { type: "pledge", shares: 1_000_000 }));
  b = ok(act(b, { type: "draw", amount: 10_000_000 }));
  const idx0 = b.index.cost;
  b = tickTo(b, "2020-02-03");
  const owed = b.loan.balance + b.loan.accrued + b.overdraft + b.overdraftAccrued;
  assert.ok(b.cash - owed >= -1e-6, `cash ${b.cash} owed ${owed}`);
  near(b.cash, owed, 1); // swept down to exactly the borrowed amount
  assert.ok(b.cash > AUTO_INVEST_KEEP);
  assert.ok(b.index.cost > idx0);
  // the deposit rule is unchanged: only cash above what you owe
  assert.equal(canDo(b, "deposit").allowed, false);
});

test("10: gate copy claims a plan only when one exists: none, cooling-off, live", () => {
  // no plan: the window text stands alone
  let a = tickTo(game(spcxLike, "engineer"), "2026-09-21");
  assert.equal(canDo(a, "sell").reason, "Window closed until Oct 22.");
  assert.ok(!/plan/i.test(canDo(a, "sell").reason));
  // plan adopted Sep 1 (window open): cooling-off to Oct 1 when the window closes on Sep 21
  let c = tickTo(game(spcxLike, "engineer"), "2026-09-01");
  c = ok(act(c, { type: "adoptPlan", pct: 5, months: 6 }));
  assert.equal(c.plan.firstTradeOn, "2026-10-01");
  const close = tickUntilEvent(c, "windowClose");
  assert.equal(close.event.text, "The trading window is closed until Oct 22. Your plan starts selling Oct 1.");
  assert.equal(canDo(close.state, "sell").reason, "Window closed until Oct 22, your plan starts selling Oct 1.");
  // live plan: keeps selling
  let l = tickTo(game(spcxLike, "engineer"), "2026-08-06");
  l = ok(act(l, { type: "adoptPlan", pct: 10, months: 6 }));
  const lc = tickUntilEvent(l, "windowClose");
  assert.equal(lc.event.text, "The trading window is closed until Oct 22. Your 10b5-1 plan keeps selling.");
  assert.equal(canDo(lc.state, "sell").reason, "Window closed until Oct 22, your 10b5-1 plan keeps selling.");
});

test("10b: the UI copy fixes: no score-effect claim, no state-tax toggle, no early-exit promise, the lesson title", () => {
  const read = (f) => fs.readFileSync(path.join(here, "..", f), "utf8");
  const pages = read("ui/pages.js"), exch = read("ui/tabs/exchange.js"), credit = read("ui/tabs/credit.js");
  assert.ok(!/no score effect|no effect on (your|the) score/i.test(pages));
  assert.ok(!/state-tax toggle/i.test(pages));
  assert.ok(!/leave early and you get your own shares back/i.test(pages + exch));
  assert.match(exch, /Leaving early \(returning your own shares\) is not modeled; the game holds the fund to the end\./);
  assert.ok(!/Borrow instead of selling/.test(credit));
  assert.match(credit, /Borrowing against your shares/);
});

test("13: compare() measures at the displayed precision, so near-ties are ties", () => {
  const mk = (sharpe, dd, irr, w) => ({ sharpe, maxDrawdown: { pct: dd }, irr, afterTaxWealth: w });
  const a = mk(0.5449, -0.4521, 0.0531, 123_410_000), b = mk(0.5001, -0.4524, 0.0534, 123_430_000);
  const c = compare(a, b);
  assert.deepEqual(c.wins, { sharpe: false, maxDrawdown: false, irr: false, afterTaxWealth: false });
  assert.deepEqual(c.ties, { sharpe: true, maxDrawdown: true, irr: true, afterTaxWealth: true });
  assert.equal(c.count, 0); assert.equal(c.tied, 4);
  assert.equal(compare(b, a).count, 0);
  // a real difference at display precision still wins
  const d = compare(mk(0.70, -0.40, 0.07, 130_000_000), mk(0.50, -0.45, 0.05, 120_000_000));
  assert.equal(d.count, 4);
  assert.equal(compare(mk(0.70, -0.40, 0.07, 130_000_000), mk(0.50, -0.45, 0.05, 120_000_000)).tied, 0);
  // drawdown: shallower wins; missing values lose
  assert.equal(compare(mk(0.5, -0.30, 0.05, 1e8), mk(0.5, -0.35, 0.05, 1e8)).wins.maxDrawdown, true);
  assert.equal(compare(mk(null, -0.3, null, 1e8), mk(0.1, -0.3, 0.02, 1e8)).wins.sharpe, false);
  assert.equal(compare(mk(0.1, -0.3, 0.02, 1e8), mk(null, -0.3, null, 1e8)).wins.irr, true);
});

// ================================================================ the shipped data (skipped when absent)
const dataDir = path.join(here, "..", "data");
test("shipped cards: bots run on every card and seat in data/cards with the real market", (t) => {
  const mf = path.join(dataDir, "market.json");
  const cf = path.join(dataDir, "cards");
  if (!fs.existsSync(mf) || !fs.existsSync(cf)) return t.skip("data/ not built");
  const mk = JSON.parse(fs.readFileSync(mf, "utf8"));
  const opt = fs.existsSync(path.join(dataDir, "spcx-options.json")) ? JSON.parse(fs.readFileSync(path.join(dataDir, "spcx-options.json"), "utf8")) : null;
  let ran = 0;
  for (const f of fs.readdirSync(cf).filter((x) => x.endsWith(".json") && x !== "index.json")) {
    const card = JSON.parse(fs.readFileSync(path.join(cf, f), "utf8"));
    for (const seat of ["engineer", "founder"]) {
      if (!groupForSeat(card.blind ? normalizeCard(card) : card, seat)) {
        assert.throws(() => createGame({ card, seat, market: mk }), (e) => e instanceof Error && e.message.length > 10);
        continue;
      }
      for (const bot of BOTS) {
        const start = createGame({ card, seat, market: mk, spcxOptions: opt });
        const end = runWithPolicy(start, botPolicy(bot), (_e, s) => invariants(s, `${card.id}/${seat}/${bot}`));
        assert.ok(end.done);
        const sc = score(end);
        assert.ok(Number.isFinite(sc.afterTaxWealth) && Number.isFinite(sc.sharpe), `${card.id} ${seat} ${bot}`);
        t.diagnostic(`${card.id} ${seat} ${bot}: sharpe ${sc.sharpe.toFixed(2)} dd ${(sc.maxDrawdown.pct * 100).toFixed(1)}% irr ${sc.irr == null ? "n/a" : (sc.irr * 100).toFixed(1) + "%"} wealth ${Math.round(sc.afterTaxWealth)}`);
        ran++;
      }
    }
  }
  assert.ok(ran >= 3);
});

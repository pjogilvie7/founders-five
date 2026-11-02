// Golden tests for pricing, metrics, tax and calendar. Run: node --test engine/core.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { normCdf, bsPrice, zeroCostCall, collarMark, putMark, realizedVol, baseVol, skewVols } from "./pricing.js";
import { dailyRf, sharpe, maxDrawdown, xirr } from "./metrics.js";
import { RATE, saleTax, taxOwed } from "./tax.js";
import {
  addCalendarDays, daysBetween, addMonths, businessDaysAfter, tradingIndexOnOrAfter,
  nthTradingDayAfter, windowState, quarterEndIndexes, firstTradingDayOfMonthIndexes,
} from "./calendar.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} +/- ${tol}, got ${a}`);

// ---------- pricing ----------
test("normCdf matches an independent erf series to 1e-12", () => {
  // erf(z) = 2/sqrt(pi) * sum_{n} (-1)^n z^(2n+1) / (n! (2n+1)); Phi(x) = (1 + erf(x/sqrt2))/2
  const erf = (z) => {
    let term = z, sum = z;
    for (let n = 1; n < 200; n++) { term *= -z * z / n; sum += term / (2 * n + 1); }
    return 2 / Math.sqrt(Math.PI) * sum;
  };
  for (let x = -4; x <= 4; x += 0.25) near(normCdf(x), 0.5 * (1 + erf(x / Math.SQRT2)), 1e-12, `x=${x}`);
  near(normCdf(0), 0.5, 1e-15);
  near(normCdf(1.959963984540054), 0.975, 1e-9);
  assert.equal(normCdf(-50), 0);
  assert.equal(normCdf(50), 1);
});

test("golden 1: put 15.325, zero-cost call 186.99", () => {
  const S = 134.72, K = 114.512, T = 1, r = 0.04, vol = 0.537;
  near(bsPrice({ type: "put", S, K, T, r, vol }), 15.325, 0.01);
  const z = zeroCostCall({ S, Kp: K, T, r, volPut: vol, volCall: vol });
  near(z.Kc, 186.99, 0.05);
  near(z.callPrice, z.putPrice, 0.01);
  near(collarMark({ S, Kp: K, Kc: z.Kc, T, r, volPut: vol, volCall: vol }), 0, 0.01);
  assert.equal(putMark({ S, K, T, r, vol }), bsPrice({ type: "put", S, K, T, r, vol }));
});

test("golden 2: put-call parity C - P = S - K e^{-rT} to 1e-9", () => {
  const cases = [
    [100, 100, 1, 0.04, 0.3], [134.72, 114.512, 1, 0.04, 0.537], [50, 80, 0.5, 0.02, 0.9],
    [250, 200, 2, 0.05, 0.25], [100, 140, 0.25, 0.0, 0.6], [10, 9.5, 0.1, 0.06, 0.45], [100, 100, 3, 0.01, 0.15],
  ];
  for (const [S, K, T, r, vol] of cases) {
    const c = bsPrice({ type: "call", S, K, T, r, vol });
    const p = bsPrice({ type: "put", S, K, T, r, vol });
    near(c - p, S - K * Math.exp(-r * T), 1e-9, `S=${S} K=${K}`);
  }
});

test("bsPrice at expiry is intrinsic", () => {
  assert.equal(bsPrice({ type: "put", S: 90, K: 100, T: 0, r: 0.04, vol: 0.3 }), 10);
  assert.equal(bsPrice({ type: "call", S: 90, K: 100, T: 0, r: 0.04, vol: 0.3 }), 0);
});

test("zeroCostCall: Kc is monotone non-decreasing as the put strike falls, and prices match", () => {
  const S = 100, T = 1, r = 0.04, volPut = 0.45, volCall = 0.42;
  let prev = Infinity;
  for (const pct of [0.80, 0.85, 0.90, 0.95]) { // higher put strike -> dearer put -> lower cap
    const z = zeroCostCall({ S, Kp: S * pct, T, r, volPut, volCall });
    assert.ok(z.Kc < prev, `Kc should fall as Kp rises (pct ${pct}: ${z.Kc} vs ${prev})`);
    assert.ok(z.Kc > S);
    near(z.callPrice, z.putPrice, 0.02);
    prev = z.Kc;
  }
});

test("realizedVol, baseVol floor, 20-day minimum, 60-day window, skew", () => {
  // constant-growth series has zero vol
  const flat = Array.from({ length: 100 }, (_, k) => 100 * Math.pow(1.001, k));
  near(realizedVol(flat), 0, 1e-12);
  // floor 0.30 applied before 1.10
  near(baseVol(flat, 99), 0.30 * 1.10, 1e-12);
  // fewer than 20 returns -> 0.30 default, even if the data is wild
  const wild = Array.from({ length: 100 }, (_, k) => 100 * (k % 2 ? 1.1 : 1));
  near(baseVol(wild, 19), 0.33, 1e-12); // 19 returns
  assert.ok(baseVol(wild, 20) > 0.33); // 20 returns -> realized used
  // known value: alternating +/-1% log returns -> sample stdev
  const alt = [100]; for (let k = 1; k <= 80; k++) alt.push(alt[k - 1] * Math.exp(k % 2 ? 0.04 : -0.04));
  const rv = realizedVol(alt.slice(80 - 60, 81));
  near(baseVol(alt, 80), rv * 1.10, 1e-12);
  near(rv, 0.04 * Math.sqrt(252) * Math.sqrt(60 / 59), 1e-9);
  // window really is the last 60 returns: early history does not matter
  const alt2 = alt.slice(); alt2[0] = 1; alt2[1] = 5; // return k=1 changes, outside window ending at 80 (returns 21..80)
  near(baseVol(alt2, 80), baseVol(alt, 80), 1e-12);
  const s = skewVols(0.5);
  near(s.put, 0.515, 1e-15); near(s.call, 0.485, 1e-15);
});

// ---------- metrics ----------
test("golden 3: xirr 730 days at 21% total = 10%", () => {
  const r = xirr([{ d: "2020-01-01", amount: -100 }, { d: "2021-12-31", amount: 121 }]);
  near(r, 0.1, 0.0001);
});

test("xirr with many flows round-trips a known rate (and is order-independent)", () => {
  const rate = 0.0725;
  const flows = [{ d: "2019-01-02", amount: -1000000 }];
  let pv = 0;
  for (let k = 0; k < 60; k++) {
    const d = addMonths("2019-02-01", k);
    flows.push({ d, amount: 10000 });
  }
  // terminal flow chosen so NPV at `rate` is exactly zero
  const end = "2024-02-01";
  let npv = -1000000;
  for (const f of flows.slice(1)) npv += f.amount / Math.pow(1 + rate, daysBetween("2019-01-02", f.d) / 365);
  flows.push({ d: end, amount: -npv * Math.pow(1 + rate, daysBetween("2019-01-02", end) / 365) });
  near(xirr(flows), rate, 1e-9);
  near(xirr(flows.slice().reverse()), rate, 1e-9);
});

test("xirr: negative return, bisection fallback region, and unsolvable input", () => {
  near(xirr([{ d: "2020-01-01", amount: -100 }, { d: "2021-01-01", amount: 50 }]), 50 / 100 - 1 + 0, 0.01); // ~ -0.5 over 366 days
  const hi = xirr([{ d: "2020-01-01", amount: -100 }, { d: "2020-07-01", amount: 300 }]); // huge annualized
  assert.ok(hi > 5 && hi < 10, `got ${hi}`);
  assert.ok(Number.isNaN(xirr([{ d: "2020-01-01", amount: 100 }, { d: "2021-01-01", amount: 50 }])));
});

test("golden 4: sharpe of [0.01,-0.005,0.02,0,-0.01], rf 0 = 3.95", () => {
  near(sharpe([0.01, -0.005, 0.02, 0, -0.01], 0), 3.95, 0.01);
  near(sharpe([0.01, -0.005, 0.02, 0, -0.01], [0, 0, 0, 0, 0]), 3.95, 0.01);
  // rf subtracts
  near(sharpe([0.011, -0.004, 0.021, 0.001, -0.009], 0.001), 3.95, 0.01);
  assert.equal(sharpe([0.01, 0.01, 0.01], 0), 0);
  near(dailyRf(4.06), Math.pow(1.0406, 1 / 252) - 1, 1e-15);
});

test("golden 5: maxDrawdown of [100,120,90,95,130,104] = -0.25", () => {
  const dates = ["a", "b", "c", "d", "e", "f"];
  const m = maxDrawdown([100, 120, 90, 95, 130, 104], dates);
  assert.equal(m.pct, -0.25);
  assert.equal(m.peakIndex, 1); assert.equal(m.troughIndex, 2);
  assert.equal(m.peakDate, "b"); assert.equal(m.troughDate, "c");
  const up = maxDrawdown([1, 2, 3]);
  assert.equal(up.pct, 0); assert.equal(up.peakDate, null);
  // later, deeper fall wins
  const m2 = maxDrawdown([100, 110, 99, 200, 100]);
  assert.equal(m2.pct, -0.5); assert.equal(m2.peakIndex, 3); assert.equal(m2.troughIndex, 4);
});

// ---------- tax ----------
test("golden 9: 100,000 sh at $150, basis $1.35 owes $3,537,870", () => {
  const t = saleTax({ shares: 100000, price: 150, basis: 1.35 });
  assert.equal(t.tax, 3537870);
  assert.equal(t.proceeds, 15000000); assert.equal(t.cost, 0);
  near(t.gain, 14865000, 1e-6);
  assert.equal(RATE, 0.238);
});

test("saleTax with sale cost and losses; taxOwed floors at zero", () => {
  const t = saleTax({ shares: 1000, price: 100, basis: 1, costRate: 0.0025 });
  near(t.cost, 250, 1e-9); near(t.gain, 100000 - 250 - 1000, 1e-9); near(t.tax, 0.238 * t.gain, 1e-9);
  const loss = saleTax({ shares: 1000, price: 1, basis: 5 });
  assert.ok(loss.gain < 0 && loss.tax < 0);
  assert.equal(taxOwed(-5000), 0);
  near(taxOwed(1000000), 238000, 1e-9);
});

// ---------- calendar ----------
test("date helpers", () => {
  assert.equal(addCalendarDays("2024-02-28", 2), "2024-03-01");
  assert.equal(addCalendarDays("2024-01-01", -1), "2023-12-31");
  assert.equal(daysBetween("2020-01-01", "2021-12-31"), 730);
  assert.equal(daysBetween("2021-12-31", "2020-01-01"), -730);
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2023-01-31", 1), "2023-02-28");
  assert.equal(addMonths("2024-11-30", 3), "2025-02-28");
  assert.equal(addMonths("2024-03-15", -4), "2023-11-15");
  assert.equal(businessDaysAfter("2024-05-02", 2), "2024-05-06"); // Thu -> Fri, Mon
  assert.equal(businessDaysAfter("2024-05-04", 1), "2024-05-06"); // Sat -> Mon
  assert.equal(businessDaysAfter("2026-10-22", 0), "2026-10-22");
});

// Weekdays of 2024, minus 2024-05-03 (a fake exchange holiday-style gap) to prove trading-day counting.
function fixture({ skip = [], from = "2024-01-01", to = "2024-12-31" } = {}) {
  const rows = [];
  for (let d = from; d <= to; d = addCalendarDays(d, 1)) {
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd === 0 || wd === 6 || skip.includes(d)) continue;
    rows.push([d, 100, 100, 1000]);
  }
  return rows;
}
const idx = (prices, d) => prices.findIndex((p) => p[0] === d);

test("trading-day helpers", () => {
  const p = fixture({ skip: ["2024-05-03"] });
  assert.equal(tradingIndexOnOrAfter(p, "2024-05-03"), idx(p, "2024-05-06"));
  assert.equal(tradingIndexOnOrAfter(p, "2025-01-01"), -1);
  assert.equal(nthTradingDayAfter(p, "2024-05-02", 1), "2024-05-06");
  assert.equal(nthTradingDayAfter(p, "2024-05-02", 2), "2024-05-07");
  assert.equal(nthTradingDayAfter(p, "2024-05-04", 1), "2024-05-06"); // d not a trading day
  assert.equal(nthTradingDayAfter(p, "2024-12-30", 2), null);
});

test("golden 10: window closes 30 calendar days before earnings, reopens on the 2nd trading day after", () => {
  const p = fixture();
  const earnings = [{ d: "2024-05-02" }, { d: "2024-08-01" }];
  const at = (d, e = earnings, o = {}) => windowState(p, e, idx(p, d), o);
  // day before the first closed day (earnings - 30 = 2024-04-02)
  let w = at("2024-04-01");
  assert.deepEqual(w, { open: true, closesOn: "2024-04-02", opensOn: null, projected: false });
  w = at("2024-04-02"); // first closed day
  assert.deepEqual(w, { open: false, closesOn: null, opensOn: "2024-05-06", projected: false });
  w = at("2024-05-02"); // earnings day
  assert.equal(w.open, false); assert.equal(w.opensOn, "2024-05-06");
  w = at("2024-05-03"); // 1st trading day after
  assert.equal(w.open, false); assert.equal(w.opensOn, "2024-05-06");
  w = at("2024-05-06"); // 2nd trading day after: open again
  assert.deepEqual(w, { open: true, closesOn: "2024-07-02", opensOn: null, projected: false });
  // second release
  assert.equal(at("2024-07-01").open, true);
  assert.equal(at("2024-07-02").open, false);
  assert.equal(at("2024-08-05").open, true);
  assert.equal(at("2024-08-05").closesOn, null);
  // every day in the fixture is closed iff inside one of the two intervals
  for (let j = 0; j < p.length; j++) {
    const d = p[j][0];
    const closed = (d >= "2024-04-02" && d < "2024-05-06") || (d >= "2024-07-02" && d < "2024-08-05");
    assert.equal(windowState(p, earnings, j).open, !closed, d);
  }
  assert.equal(at("2024-01-02").closesOn, "2024-04-02");
});

test("window counts trading days, not weekdays, when the series has a gap", () => {
  const p = fixture({ skip: ["2024-05-03"] }); // 1st trading day after 05-02 is 05-06, 2nd is 05-07
  const earnings = [{ d: "2024-05-02" }];
  assert.equal(windowState(p, earnings, idx(p, "2024-05-06")).open, false);
  assert.deepEqual(windowState(p, earnings, idx(p, "2024-05-06")).opensOn, "2024-05-07");
  assert.equal(windowState(p, earnings, idx(p, "2024-05-07")).open, true);
});

test("window: earnings before the first trade closes the start of the series", () => {
  const p = fixture({ from: "2024-04-12" }); // IPO Apr 12; earnings on Apr 25 (closed since Mar 26)
  const w = windowState(p, [{ d: "2024-04-25" }], 0);
  assert.equal(w.open, false);
  assert.equal(w.opensOn, "2024-04-29");
});

test("window: live card projects the next release at last + 91 days", () => {
  const p = fixture();
  const earnings = [{ d: "2024-05-02" }, { d: "2024-08-01" }, { d: "2024-10-31" }];
  // 2024-10-31 + 91 = 2025-01-30; closes 2024-12-31; reopens about 2nd weekday after = 2025-02-03
  const live = { live: true };
  let w = windowState(p, earnings, idx(p, "2024-12-30"), live);
  assert.deepEqual(w, { open: true, closesOn: "2024-12-31", opensOn: null, projected: true });
  w = windowState(p, earnings, idx(p, "2024-12-31"), live);
  assert.deepEqual(w, { open: false, closesOn: null, opensOn: "2025-02-03", projected: true });
  // a real (not projected) window earlier is not marked projected
  w = windowState(p, earnings, idx(p, "2024-10-15"), live);
  assert.equal(w.open, false); assert.equal(w.projected, false); assert.equal(w.opensOn, "2024-11-04");
  // not live: no projection
  w = windowState(p, earnings, idx(p, "2024-12-31"));
  assert.deepEqual(w, { open: true, closesOn: null, opensOn: null, projected: false });
  // live but the series already reaches last+91: no projection
  const longer = fixture({ to: "2025-02-10" });
  w = windowState(longer, earnings, idx(longer, "2024-12-31"), live);
  assert.equal(w.open, true); assert.equal(w.closesOn, null);
});

test("window: a release whose 2nd trading day is past the data end uses a weekday estimate", () => {
  const p = fixture({ to: "2024-11-01" });
  const w = windowState(p, [{ d: "2024-10-31" }], idx(p, "2024-11-01"));
  assert.equal(w.open, false); assert.equal(w.opensOn, "2024-11-04");
});

test("quarter-end and first-of-month indexes", () => {
  const p = fixture();
  const q = quarterEndIndexes(p).map((j) => p[j][0]);
  assert.deepEqual(q, ["2024-03-29", "2024-06-28", "2024-09-30", "2024-12-31"]);
  const short = fixture({ to: "2024-05-15" });
  assert.deepEqual(quarterEndIndexes(short).map((j) => short[j][0]), ["2024-03-29"]);
  const m = firstTradingDayOfMonthIndexes(p).map((j) => p[j][0]);
  assert.equal(m.length, 12);
  assert.equal(m[0], "2024-01-01"); assert.equal(m[1], "2024-02-01"); assert.equal(m[4], "2024-05-01"); assert.equal(m[11], "2024-12-02");
  const mid = fixture({ from: "2024-04-12", to: "2024-07-31" });
  assert.deepEqual(firstTradingDayOfMonthIndexes(mid).map((j) => mid[j][0]), ["2024-05-01", "2024-06-03", "2024-07-01"]);
});

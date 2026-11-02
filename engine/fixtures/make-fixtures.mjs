// Regenerates engine/fixtures/*.json. Deterministic (seeded). Run: node engine/fixtures/make-fixtures.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCalendarDays, weekday, businessDaysAfter } from "../calendar.js";
import { resolveTranches } from "../lockup.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const write = (name, obj) => fs.writeFileSync(path.join(here, name), JSON.stringify(obj));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rnd) => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// NYSE-like holiday list (approximate): enough to make a realistic calendar.
function holidays(year) {
  const set = new Set();
  const nth = (m, wd, n) => { let d = `${year}-${String(m).padStart(2, "0")}-01`, c = 0; while (true) { if (weekday(d) === wd && ++c === n) return d; d = addCalendarDays(d, 1); } };
  const last = (m, wd) => { let d = `${year}-${String(m).padStart(2, "0")}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`; while (weekday(d) !== wd) d = addCalendarDays(d, -1); return d; };
  const obs = (d) => (weekday(d) === 6 ? addCalendarDays(d, -1) : weekday(d) === 0 ? addCalendarDays(d, 1) : d);
  [`${year}-01-01`, `${year}-06-19`, `${year}-07-04`, `${year}-12-25`].forEach((d) => set.add(obs(d)));
  set.add(nth(1, 1, 3)); set.add(nth(2, 1, 3)); set.add(last(5, 1)); set.add(nth(9, 1, 1)); set.add(nth(11, 4, 4));
  return set;
}
function tradingDays(from, count) {
  const out = []; let d = from; const hol = {};
  while (out.length < count) {
    const y = +d.slice(0, 4); hol[y] = hol[y] || holidays(y);
    if (weekday(d) !== 0 && weekday(d) !== 6 && !hol[y].has(d)) out.push(d);
    d = addCalendarDays(d, 1);
  }
  return out;
}
const r2 = (x) => Math.round(x * 100) / 100;

// ---- market: SPY (adj close), DGS1MO, DGS1, SOFR, weekdays 2019-12-02 .. 2027-12-31
{
  const rnd = mulberry32(7);
  const spy = []; let v = 300; let d = "2019-12-02";
  while (d <= "2027-12-31") {
    if (weekday(d) !== 0 && weekday(d) !== 6) { v *= Math.exp(0.0004 + 0.011 * gauss(rnd)); spy.push([d, r2(v)]); }
    d = addCalendarDays(d, 1);
  }
  const step = (pts) => { const out = []; let dd = "2019-12-02"; let cur = pts[0][1]; let p = 0; while (dd <= "2027-12-31") { while (p < pts.length && pts[p][0] <= dd) { cur = pts[p][1]; p++; } if (weekday(dd) !== 0 && weekday(dd) !== 6) out.push([dd, cur]); dd = addCalendarDays(dd, 1); } return out; };
  write("market.json", {
    spy,
    rates: {
      dgs1mo: step([["2019-12-02", 1.5], ["2020-04-01", 0.1], ["2022-03-01", 0.5], ["2022-12-01", 4.2], ["2024-09-01", 4.8], ["2026-01-01", 4.1]]),
      dgs1: step([["2019-12-02", 1.6], ["2020-04-01", 0.2], ["2022-03-01", 1.0], ["2022-12-01", 4.7], ["2024-09-01", 4.4], ["2026-01-01", 3.9]]),
      sofr: step([["2019-12-02", 1.6], ["2020-04-01", 0.1], ["2022-03-01", 0.5], ["2022-12-01", 4.3], ["2024-09-01", 4.9], ["2026-01-01", 3.94]]),
    },
  });
}

// ---- spcx-like: the real SPCX closes (98 days), earnings and reports, with the PRD 4.1 ladder written out
{
  const real = JSON.parse(fs.readFileSync(path.join(root, "data", "cards", "spcx.json"), "utf8"));
  const T = (id, pct, trigger, extra = {}) => ({ id, pct, trigger, quote: "fixture", page: "fixture", resolvedDate: undefined, readA: null, readB: null, reconciled: true, human: { status: "pending", by: null, date: null }, ...extra });
  const c = (id, days) => T(id, 7, { type: "calendarDaysAfter", days, from: "pricingDate", onOrAfter: true });
  const card = {
    id: "spcx-like", blind: false, live: true, name: "Fixture Rocket Co", ticker: "SPCX", industry: "other",
    ipo: { ...real.ipo },
    prices: real.prices, earnings: real.earnings, reports: real.reports,
    lockup: {
      groups: [
        {
          id: "engineer-180", seats: ["engineer"], label: "180-day group",
          tranches: [
            T("a", 20, { type: "afterEarnings", n: 1, tradingDaysAfter: 2 }),
            T("b", 10, { type: "priceCondition", pct: 30, of: "offerPrice", daysMet: 5, window: 10, endsOn: "firstEarnings" }),
            c("c1", 70), c("c2", 90), c("c3", 105), c("c4", 120), c("c5", 135),
            T("d", 28, { type: "afterEarnings", n: 2, tradingDaysAfter: 2 }),
            T("e", 7, { type: "remainder", days: 180, from: "pricingDate" }),
          ],
        },
        { id: "founder-366", seats: ["founder"], label: "Founder group", tranches: [T("f", 100, { type: "date", date: "2027-06-14" })] },
      ],
    },
    headlines: [], reveal: null, notes: [],
  };
  const resolved = { a: "2026-08-06", b: null, c1: "2026-08-20", c2: "2026-09-09", c3: "2026-09-24", c4: "2026-10-09", c5: "2026-10-26", d: "2026-10-22", e: "2026-12-08", f: "2027-06-14" };
  for (const g of card.lockup.groups) for (const t of g.tranches) t.resolvedDate = resolved[t.id];
  write("spcx-like.json", card);
}

// ---- five-year: synthetic 1,261 days, earnings about every 91 days with 10-Q/10-K, 180-day lockup, two seats
{
  const rnd = mulberry32(2024);
  const dates = tradingDays("2020-01-02", 1261);
  let p = 52; const prices = [];
  for (let k = 0; k < dates.length; k++) {
    if (k > 0) {
      let shock = 0;
      if (k >= 560 && k < 620) shock = -0.012; // a long slide
      if (k >= 620 && k < 700) shock = 0.008;
      p *= Math.exp(0.0003 + shock + 0.026 * gauss(rnd));
    }
    const close = r2(p);
    prices.push([dates[k], close, r2(close * (1 - 0.0001 * (1261 - k) / 100)), Math.round(900000 + 400000 * rnd())]);
  }
  const wd = (d) => { while (weekday(d) === 0 || weekday(d) === 6) d = addCalendarDays(d, 1); return d; };
  const earnings = [], reports = [];
  for (let k = -1, d = "2019-11-08"; ; k++) {
    if (d > "2025-02-01") break;
    earnings.push({ d: wd(d), url: "fixture" });
    const form = (+d.slice(5, 7) <= 2 ? "10-K" : "10-Q");
    reports.push({ d: wd(addCalendarDays(wd(d), 3)), form, url: "fixture" });
    d = addCalendarDays(d, 91);
  }
  const T = (id, pct, trigger) => ({ id, pct, trigger, quote: "fixture", page: "fixture", resolvedDate: undefined, readA: null, readB: null, reconciled: true, human: { status: "pending", by: null, date: null } });
  const card = {
    id: "c1", blind: true, live: false, name: "Fixture Five Year", ticker: "FIVE", industry: "software",
    ipo: { offerPrice: 40, pricingDate: "2019-12-31", firstTrade: "2020-01-02", proceedsUSD: 2e9, sharesOutPost: 150_000_000, source: { url: "fixture", page: "fixture" } },
    prices, earnings, reports,
    lockup: {
      groups: [
        { id: "engineer-180", seats: ["engineer"], label: "Employees", tranches: [
          T("e1", 25, { type: "afterEarnings", n: 1, tradingDaysAfter: 2 }),
          T("e2", 25, { type: "calendarDaysAfter", days: 120, from: "firstTrade", onOrAfter: true }),
          T("e3", 50, { type: "remainder", days: 180, from: "pricingDate" }),
        ] },
        { id: "founder-180", seats: ["founder"], label: "Founders", tranches: [
          T("f1", 40, { type: "date", date: "2020-03-02" }),
          T("f2", 60, { type: "remainder", days: 180, from: "pricingDate" }),
        ] },
      ],
    },
    headlines: [{ d: prices[100][0], text: "Company raises full-year outlook", source: "fixture", nameFilter: "pass", review: "pass" }],
    reveal: null, notes: [],
  };
  for (const g of card.lockup.groups) {
    const res = resolveTranches(card, g.id);
    g.tranches.forEach((t, k) => { t.resolvedDate = res[k].date; });
  }
  write("five-year.json", card);
}
console.log("fixtures written");

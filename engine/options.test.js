// options.test.js: the SpaceX options derivation drops thin expiries (fix 11, 2026-11-02).
import test from "node:test";
import assert from "node:assert/strict";
import { deriveOptions, marketCap, MIN_STRIKES } from "../scripts/lib/options.mjs";
import { bsPrice } from "../scripts/lib/bs.mjs";

const SPOT = 100, ASOF = "2026-10-30";
function sym(expiry, type, strike) {
  return `SPCX${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}${type === "call" ? "C" : "P"}${String(Math.round(strike * 1000)).padStart(8, "0")}`;
}
// A chain with the given strikes per expiry, priced flat at 50% vol with a tight two-sided quote.
function chain(spec) {
  const options = [];
  for (const [expiry, strikes] of Object.entries(spec)) {
    const T = (Date.parse(expiry) - Date.parse(ASOF)) / 86400000 / 365;
    for (const K of strikes) {
      for (const type of ["call", "put"]) {
        const m = bsPrice({ type, S: SPOT, K, T, r: 0.04, vol: 0.5 });
        options.push({ option: sym(expiry, type, K), bid: m - 0.01, ask: m + 0.01, iv: 0.5 });
      }
    }
  }
  return { data: { iv30: 50, options } };
}
const WIDE = [60, 70, 80, 85, 90, 95, 100, 105, 110, 120, 140, 160, 180, 200];

test("deriveOptions drops an expiry with fewer than 5 usable out-of-the-money strikes from the smile", () => {
  assert.equal(MIN_STRIKES, 5);
  const thin = [90, 95, 140]; // 2027-10-15: two out-of-the-money puts and one call, three usable strikes
  const c = chain({ "2027-04-16": WIDE, "2027-09-17": WIDE, "2027-10-15": thin, "2027-12-17": WIDE });
  const out = deriveOptions(c, { spot: SPOT, asOf: ASOF, rate: 4 });
  const expiries = new Set(out.smile.map((p) => p.expiry));
  assert.ok(expiries.has("2027-09-17") && expiries.has("2027-12-17") && expiries.has("2027-04-16"));
  assert.ok(!expiries.has("2027-10-15"), "the thin expiry is gone from the smile");
  // a flat 50% chain reads back as about 50% everywhere
  for (const p of out.smile) assert.ok(Math.abs(p.iv - 0.5) < 0.02, `${p.expiry} ${p.strikePct} ${p.iv}`);
});

test("marketCap ignores a thin expiry that would otherwise bracket one year", () => {
  const withThin = chain({ "2027-04-16": WIDE, "2027-09-17": WIDE, "2027-10-15": [90, 95, 140], "2027-12-17": WIDE });
  const without = chain({ "2027-04-16": WIDE, "2027-09-17": WIDE, "2027-12-17": WIDE });
  const a = marketCap(withThin, { spot: SPOT, floor: 85, asOf: ASOF, r: 0.04 });
  const b = marketCap(without, { spot: SPOT, floor: 85, asOf: ASOF, r: 0.04 });
  assert.ok(a.cap != null && b.cap != null);
  assert.equal(a.cap, b.cap);
  assert.ok(!a.per.some((x) => x.expiry === "2027-10-15"));
  assert.deepEqual(a.bracket, ["2027-09-17", "2027-12-17"]);
});

test("the shipped data/spcx-options.json has no thin expiry and a sane Street check", async (t) => {
  const fs = await import("node:fs"), path = await import("node:path"), { fileURLToPath } = await import("node:url");
  const f = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "spcx-options.json");
  if (!fs.existsSync(f)) return t.skip("not built");
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const count = {};
  for (const p of j.smile) count[p.expiry] = (count[p.expiry] || 0) + 1;
  for (const [e, n] of Object.entries(count)) assert.ok(n >= 5, `${e} has ${n} smile points`);
  // the chain changes every night, so check the rule, not one day's figure (2026-10-30 read 182.59)
  const sc = j.streetCheck;
  assert.ok(sc.marketCap > sc.spot && sc.marketCap < 2 * sc.spot, `market cap ${sc.marketCap} vs spot ${sc.spot}`);
  assert.ok(Math.abs(sc.marketCap / sc.modelCap - 1) < 0.2, `market cap ${sc.marketCap} vs model cap ${sc.modelCap}`);
});

// Fixture context for the pages harness (T11). Fictional blind-card names on purpose: the test looks for them.
export const BLIND_NAMES = { c1: ["Zephyr Holdings", "ZPHR"], c2: ["Quillon Systems", "QLLN"] };

const prices = (first) => [[first, 100, 100, 1000]];

function tranche(id, pct, trigger, quote, page, resolvedDate, human) {
  return {
    id, pct, trigger, quote, page, resolvedDate,
    readA: { trigger: trigger.type, date: resolvedDate, pct },
    readB: { trigger: trigger.type, date: resolvedDate, pct },
    reconciled: true,
    human: human || { status: "pending", by: null, date: null }
  };
}

const spcx = {
  id: "spcx", blind: false, live: true, name: "SpaceX", ticker: "SPCX", industry: "other",
  ipo: { offerPrice: 135, pricingDate: "2026-06-11", firstTrade: "2026-06-12", proceedsUSD: 7.5e10, sharesOutPost: 7.38e9,
    source: { url: "https://www.sec.gov/Archives/edgar/data/1181412/000162828026042639/spaceexplorationtechnologi.htm", page: 259 } },
  prices: prices("2026-06-12"),
  earnings: [
    { d: "2026-08-04", url: "https://www.sec.gov/Archives/edgar/data/1181412/example-8k-aug" },
    { d: "2026-10-20", url: "https://www.sec.gov/Archives/edgar/data/1181412/example-8k-oct" }
  ],
  lockup: { groups: [{ id: "g180", seats: ["engineer"], label: "180-day group", tranches: [
    tranche("a", 20, { type: "afterEarnings", n: 1, tradingDaysAfter: 2 }, "the second full trading day after the release of Q2 2026 results", 272, "2026-08-06", { status: "signed", by: "A. Teammate", date: "2026-11-03" }),
    tranche("b", 10, { type: "priceCondition", pct: 30, of: "offerPrice", daysMet: 5, window: 10, endsOn: "firstEarnings" }, "closing price at least 30% above the IPO price on at least 5 of the 10 trading days", 272, null),
    tranche("c1", 7, { type: "calendarDaysAfter", days: 70, from: "pricingDate", onOrAfter: true }, "on or after the 70th day after the date of this prospectus", 272, "2026-08-20"),
    tranche("c2", 7, { type: "calendarDaysAfter", days: 90, from: "pricingDate", onOrAfter: true }, "on or after the 90th day", 272, "2026-09-09"),
    tranche("d", 28, { type: "afterEarnings", n: 2, tradingDaysAfter: 2 }, "the second full trading day after the release of Q3 2026 results", 273, "2026-10-22"),
    tranche("e", 28 - 21, { type: "remainder", days: 180, from: "pricingDate" }, "the remaining shares on the 180th day", 273, "2026-12-08")
  ] }] },
  headlines: [], notes: []
};

function blind(id, label, name, ticker, human) {
  return {
    id, blind: true, live: false, name, ticker, industry: "software",
    ipo: { offerPrice: 100, pricingDate: "2020-09-15", firstTrade: "2020-09-16", proceedsUSD: 3e9, sharesOutPost: 1e6,
      source: { url: "https://www.sec.gov/Archives/edgar/data/0/example-424b4.htm", page: 230 } },
    prices: prices("2020-09-16"),
    earnings: [{ d: "2020-12-01", url: "https://www.sec.gov/example" }],
    lockup: { groups: [{ id: "g1", seats: ["engineer", "founder"], label: `${name} standard lockup`, tranches: [
      tranche("t1", 25, { type: "afterEarnings", n: 1, tradingDaysAfter: 2 }, `${name} common stock may be sold after the second trading day following results`, 231, "2020-12-03", human),
      tranche("t2", 25, { type: "date", date: "2021-03-15" }, `no sales of ${ticker} before March 15, 2021`, 231, "2021-03-15"),
      tranche("t3", 50, { type: "remainder", days: 180, from: "pricingDate" }, "the rest on day 180", 231, "2021-03-14")
    ] }] },
    headlines: Array.from({ length: 8 }, (_, i) => ({ d: "2021-01-0" + (i + 1), text: "A company reports a quarter.", source: "8-K", nameFilter: "pass", review: "pass" })),
    reveal: { text: `${name} (${ticker}) priced at $100 in the fixture. This text stands in for a checked paragraph.`, numbersChecked: true },
    notes: []
  };
}

const cards = { spcx, c1: blind("c1", "Card 1", ...BLIND_NAMES.c1), c2: blind("c2", "Card 2", ...BLIND_NAMES.c2, { status: "signed", by: "B. Teammate", date: "2026-11-03" }) };
cards.c1.headlineStats = { written: 11, rejected: 3, edited: 2 };

export function makeCtx() {
  const log = Array.from({ length: 26 }, (_, i) => ({
    run: new Date(Date.UTC(2026, 10, 2, 23, 40) - i * 86400000).toISOString(),
    ok: i !== 3,
    changed: i === 3 ? [] : i % 5 === 0 ? ["SPCX +1 day", "DGS1MO", "SOFR"] : ["SPCX +1 day"],
    error: i === 3 ? "FRED returned HTTP 503; kept the last good rates" : null
  }));
  return {
    meta: { asOf: "2026-10-30", lastRun: "2026-11-02T01:12:00Z", schema: 1, spcxTradingDays: 98 },
    log,
    market: { spy: [], rates: {} },
    cardsIndex: [
      { id: "spcx", blind: false, label: "SpaceX (SPCX)", tradingDays: 98 },
      { id: "c1", blind: true, label: "Card 1", tradingDays: 1260 },
      { id: "c2", blind: true, label: "Card 2", tradingDays: 1260 }
    ],
    spcxOptions: { asOf: "2026-10-30", iv30: 53.744, smile: [],
      streetCheck: { modelCap: 188.84, marketCap: 182.59, floor: 114.51, spot: 134.72, vol: 0.5374, method: "Black-Scholes, flat vol both legs; market cap interpolated from mid prices on listed Sept 2027 and Dec 2027 options.", asOf: "2026-10-30" } },
    universe: {
      rule: "US IPOs (no direct listings, no SPACs) priced 2019-01-01 to 2021-06-30 with gross proceeds of at least $1B.",
      seed: "founders-five-2026-11-01",
      included: [
        { ticker: "ZPHR", name: "Zephyr Holdings", url424b4: "https://www.sec.gov/example/zphr" },
        { ticker: "QLLN", name: "Quillon Systems", url424b4: "https://www.sec.gov/example/qlln" },
        { ticker: "ABCD", name: "Abcd Inc", url424b4: "https://www.sec.gov/example/abcd" }
      ],
      excluded: [{ ticker: "XYZQ", reason: "Direct listing, no 424B4 offering" }, { ticker: "LMNO", reason: "Fewer than 1,260 trading days of history" }],
      drawOrder: ["ZPHR", "QLLN"], drawn: ["ZPHR", "QLLN"]
    },
    testStatus: { ok: true, total: 64, failed: 0, ranAt: "2026-11-02T01:11:00Z" },
    loadCard: async (id) => cards[id]
  };
}

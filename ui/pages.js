// Founder's Five: content pages (T11). Method & Sources, Data, How AI was used, Glossary.
//
//   renderPage(name, el, ctx)   name: "method" | "data" | "ai" | "glossary"; returns a Promise.
//   ctx = {meta, log, market, cardsIndex, spcxOptions, loadCard(id) -> Promise<card>, universe?, testStatus?}
//   Any missing ctx field is fetched from ../data/ (relative to this module). A missing file degrades to a note.
//
// Plain ES module, no dependencies. Math is plain HTML (sub/sup). Blind cards never show a company name or
// ticker here unless the card id is in localStorage "ff.finished" (and then only on the AI page).

import { GLOSSARY, term, glossaryKeys } from "./glossary.js";

export const PAGES = ["method", "data", "ai", "glossary"];
export const PAGE_TITLES = {
  method: "Method & Sources",
  data: "Data",
  ai: "How AI was used",
  glossary: "Glossary"
};

const DATA_BASE = new URL("../data/", import.meta.url);
const ACTIONS_URL = "https://github.com/pjogilvie7/founders-five/actions";
const REPO_URL = "https://github.com/pjogilvie7/founders-five";
const DISCLAIMER = "A historical replay for education. Not investment, tax or legal advice, and not a view on any stock today.";

// ---------------------------------------------------------------- helpers

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseISO(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
function fmtDate(d) {
  const t = parseISO(d);
  return t ? `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}` : "—";
}
function fmtDateWd(d) {
  const t = parseISO(d);
  return t ? `${WEEKDAYS[t.getUTCDay()]} ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}` : "—";
}
function daysBetween(a, b) {
  const x = parseISO(a), y = parseISO(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
}
function fmtRun(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return esc(iso || "—");
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())} UTC`;
}
function money(n, dp = 2) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
const link = (href, text, extra = "") =>
  `<a href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""}${extra}>${text}</a>`;

/** Plain-text math to HTML. R_t -> sub, W_{t−1} -> sub, ^(1/252) -> sup. Reversible by the acceptance check. */
function math(text) {
  return esc(text)
    .replace(/_\{([^}]+)\}/g, "<sub>$1</sub>")
    .replace(/_([A-Za-z0-9])(?![A-Za-z0-9])/g, "<sub>$1</sub>")
    .replace(/\^(\([^)]*\))/g, "<sup>$1</sup>");
}

/** Tag chip. label like "VERIFIED 2026-11-01, 424B4". Printed with brackets. */
function tag(label) {
  const kind = String(label).trim().split(/[\s:]/)[0].toLowerCase();
  const known = ["verified", "session", "assumption", "unconfirmed"].includes(kind) ? kind : "other";
  return `<span class="pg-tag pg-tag-${known}">[${esc(label)}]</span>`;
}

function finishedSet() {
  try {
    const v = JSON.parse(localStorage.getItem("ff.finished") || "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch (e) {
    return new Set();
  }
}

async function loadJSON(path) {
  try {
    const r = await fetch(new URL(path, DATA_BASE));
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  }
}

async function gather(ctx, needs) {
  const c = { raw: ctx };
  const want = (k) => needs.includes(k);
  const jobs = [];
  const pull = (key, file) => {
    if (!want(key)) return;
    if (ctx[key] != null) { c[key] = ctx[key]; return; }
    jobs.push(loadJSON(file).then((v) => { c[key] = v; }));
  };
  pull("meta", "meta.json");
  pull("log", "update-log.json");
  pull("cardsIndex", "cards/index.json");
  pull("spcxOptions", "spcx-options.json");
  pull("universe", "universe.json");
  pull("testStatus", "test-status.json");
  await Promise.all(jobs);
  if (want("cards")) {
    const index = Array.isArray(c.cardsIndex) ? c.cardsIndex : Array.isArray(ctx.cardsIndex) ? ctx.cardsIndex : (await loadJSON("cards/index.json")) || [];
    c.cardsIndex = index;
    const get = typeof ctx.loadCard === "function" ? ctx.loadCard : (id) => loadJSON(`cards/${id}.json`);
    c.cards = {};
    await Promise.all(
      index.map(async (e) => {
        try { c.cards[e.id] = await get(e.id); } catch (err) { c.cards[e.id] = null; }
      })
    );
  }
  return c;
}

const note = (html) => `<p class="pg-note">${html}</p>`;
const missing = (what) => note(`${esc(what)} could not be loaded. The page shows what it has.`);

function section(id, title, body) {
  return `<section class="pg-section" id="${id}"><h2>${esc(title)}</h2>${body}</section>`;
}

function shell(page, title, lede, sections) {
  const toc = sections
    .map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`)
    .join("");
  return (
    `<header class="pg-head"><p class="pg-kicker">Founder's Five</p><h1 id="pg-${page}-top" tabindex="-1">${esc(title)}</h1>` +
    `<p class="pg-lede">${lede}</p>` +
    `<nav class="pg-toc" aria-label="On this page"><p class="pg-toc-title">On this page</p><ol>${toc}</ol></nav></header>` +
    sections.map((s) => s.html).join("") +
    `<footer class="pg-foot"><p class="pg-disclaimer">${esc(DISCLAIMER)}</p></footer>`
  );
}

// ---------------------------------------------------------------- shared source list

const SRC = {
  spcx424: "https://www.sec.gov/Archives/edgar/data/1181412/000162828026042639/spaceexplorationtechnologi.htm",
  spcxSubs: "https://data.sec.gov/submissions/CIK0001181412.json",
  cfr10b51: "https://www.ecfr.gov/current/title-17/section-240.10b5-1",
  cfr144: "https://www.ecfr.gov/current/title-17/section-230.144",
  sia: "https://www.sifma.org/wp-content/uploads/2017/05/sia-submits-comments-to-the-us-department-of-treasury-and-the-irs-on-guidance-related-to-constructive-sales.pdf",
  finra: "https://www.finra.org/investors/insights/securities-backed-lines-credit",
  irc1259: "https://www.law.cornell.edu/uscode/text/26/1259",
  irc704: "https://www.law.cornell.edu/uscode/text/26/704",
  irc737: "https://www.law.cornell.edu/uscode/text/26/737",
  stax: "https://buildyourstax.com/",
  fred: (id) => `https://fred.stlouisfed.org/series/${id}`,
  yahoo: "https://query1.finance.yahoo.com/v8/finance/chart/SPCX",
  cboe: "https://cdn.cboe.com/api/global/delayed_quotes/options/SPCX.json"
};

function sourcesList(spcxCard) {
  const eightKs = ((spcxCard && spcxCard.earnings) || [])
    .filter((e) => e && e.url)
    .map((e) => link(e.url, esc(e.d)))
    .join(", ");
  const items = [
    `SpaceX 424B4, 2026-06-12: ${link(SRC.spcx424, "sec.gov, spaceexplorationtechnologi.htm")} ${tag("VERIFIED 2026-11-01")}`,
    `SpaceX submissions JSON: ${link(SRC.spcxSubs, "data.sec.gov/submissions/CIK0001181412.json")} ${tag("VERIFIED 2026-11-01")}`,
    `SpaceX 8-Ks 2026-08-04 and 2026-10-20 (Item 2.02)${eightKs ? `: ${eightKs}` : ""} ${tag("VERIFIED 2026-11-01")}`,
    `17 CFR 240.10b5-1, eCFR 2026-10-01 edition: ${link(SRC.cfr10b51, "ecfr.gov, section 240.10b5-1")} ${tag("VERIFIED 2026-11-01")}`,
    `17 CFR 230.144, eCFR 2026-10-01 edition: ${link(SRC.cfr144, "ecfr.gov, section 230.144")} ${tag("VERIFIED 2026-11-01")}`,
    `Yahoo chart endpoint, SPCX closes 2026-06-12 to 2026-10-30: ${link(SRC.yahoo, "query1.finance.yahoo.com, chart, SPCX")} ${tag("VERIFIED 2026-11-01")}`,
    `CBOE delayed quotes, SPCX, file stamped 2026-11-01 17:05: ${link(SRC.cboe, "cdn.cboe.com, delayed_quotes, options, SPCX")} ${tag("VERIFIED 2026-11-01")}`,
    `FRED DGS1MO, DGS1, DTB4WK, SOFR CSVs: ${link(SRC.fred("DGS1MO"), "DGS1MO")}, ${link(SRC.fred("DGS1"), "DGS1")}, ${link(SRC.fred("DTB4WK"), "DTB4WK")}, ${link(SRC.fred("SOFR"), "SOFR")} ${tag("VERIFIED 2026-11-01")}`,
    `SIA comment letter to Treasury on constructive sales: ${link(SRC.sia, "sifma.org, SIA comments on constructive sales")} ${tag("VERIFIED 2026-11-01")}`,
    `FINRA, Securities-Backed Lines of Credit: ${link(SRC.finra, "finra.org, securities-backed lines of credit")} ${tag("SESSION A")}`,
    `J.P. Morgan, The Agony and the Ecstasy (2014) and Part IV (2024) ${tag("SESSION C")}`,
    `Exchange fund seven-year rule: IRC 704(c)(1)(B) and 737 (${link(SRC.irc704, "section 704")}, ${link(SRC.irc737, "section 737")}), secondary sources and an IRS letter ruling ${tag("UNCONFIRMED at statute")}`,
    `October 2008 executive margin calls (24/7 Wall St; Bloomberg 2012) ${tag("SESSION C")}`,
    `NGPF, Build Your Stax: ${link(SRC.stax, "buildyourstax.com")} (interaction reference, played 2026-11-01)`,
    `FMKT 256 extra credit PDF and syllabus ${tag("VERIFIED 2026-11-01")}`,
    `GitHub Pages plans for private repos (secondary) ${tag("UNCONFIRMED")}`
  ];
  return `<ol class="pg-sources">${items.map((h, i) => `<li id="pg-src-${i + 1}" value="${i + 1}">${h}</li>`).join("")}</ol>`;
}

// ---------------------------------------------------------------- METHOD

const TAG_LEGEND = [
  ["VERIFIED", "verified", "checked at the source on the date given"],
  ["SESSION", "session", "from a research session, not re-checked"],
  ["ASSUMPTION", "assumption", "a game term we chose"],
  ["UNCONFIRMED", "unconfirmed", "not confirmed; the design does not depend on it"]
];

function gameTerms() {
  const rows = [
    ["Starting stake", `Shares = round($100,000,000 / offer price). SpaceX: 740,741 shares. All shares start locked.`, "ASSUMPTION"],
    ["Basis", `1% of the offer price per share (SpaceX $1.35). All gains are treated as ${term("Long-term capital gains", "long-term")}.`, "ASSUMPTION"],
    ["Starting cash", `$3,000,000, earning the 1-month Treasury yield (DGS1MO) daily.`, "ASSUMPTION"],
    ["Family spending", `$166,667 on the first trading day of each month ($2M a year). Paid from cash; if cash is short, drawn from the credit line if available; otherwise an emergency overdraft at SOFR + 4%.`, "ASSUMPTION"],
    ["House event", `On five-year cards, at month 18: "$10M is due for the family's house in 30 days. Choose how to pay." You pay from cash and then the index fund (any shortfall goes on the overdraft), draw the credit line, or sell shares if the rules allow it that day. There is no skip: the money is spent, and the rival bots pay for it too. The clock pauses.`, "ASSUMPTION"],
    ["Clock and settlement", `One tick is one trading day from the card's price series. Actions apply at that day's close. Triggers and strikes use raw closes; returns use adjusted closes.`, "ASSUMPTION"],
    ["Blind cards", `Blind cards are played with prices indexed so the offer is $100 and the stake is 1,000,000 shares. Returns are unchanged; company names, dates and tickers are hidden until the card is finished.`, "ASSUMPTION"],
    ["Sale cost", `0.25% of proceeds on every sale.`, "ASSUMPTION"],
    ["Tax", `Realized gains are taxed at 23.8% (20% federal long-term rate plus 3.8% net investment income tax). The engine pays the tax owed on the last trading day of each calendar quarter; unpaid tax counts against your wealth. State tax is not included.`, "ASSUMPTION"],
    ["Seats", `<strong>Early engineer:</strong> a non-affiliate employee who has held more than a year. Rules on: lockup, trading window, 30-day ${term("Cooling-off")}. <strong>Founder-CEO:</strong> an ${term("Affiliate")}. Rules on: lockup, trading window, officer and director cooling-off, ${term("Rule 144")} volume cap, no sales before IPO day 91.`, "ASSUMPTION"],
    ["Trading window", `Closed from 30 calendar days before each earnings release until the start of the second trading day after it. Discretionary sales and adoption of plans and hedges only when it is open. For the live card's next, unannounced release, the game projects it at the last release plus 91 days and labels it "projected". The rule is a game term; the dates are real 8-K Item 2.02 filing dates.`, "ASSUMPTION"],
    ["10b5-1 plan", `Adopt only in an open window. Sell P% of the shares that are free at each monthly sale date (P = 2, 5 or 10) for 6, 12 or 18 months, at the first trading day close of each month. Plan sales ignore blackouts. One plan at a time; changing or cancelling starts over with a new cooling-off.`, "ASSUMPTION"],
    ["Cooling-off", `Early engineer: 30 days. Founder-CEO: the later of 90 days after adoption or 2 business days after the 10-Q or 10-K that reports the fiscal quarter in which the plan was adopted, capped at 120 days. The game takes that quarter as the calendar quarter containing the adoption date, and its report as the first 10-Q or 10-K filed after that quarter ends. A plan adopted in January therefore waits for the May report (or the 120-day cap), not the report for the quarter before it. The first sale is the first trading day on or after the cooling-off date.`, "VERIFIED rule text, 17 CFR 240.10b5-1(c)(1)(ii)(B)"],
    ["10b5-1 plan and hedges", `While a plan is adopted (cooling-off included), you cannot open a new collar or buy a new put on the stock: a new hedge would void the plan's defense. Cancel the plan first, which starts a new cooling-off. Hedges opened before the plan stay in place. The same holds for a collar roll at expiry, because a roll is a new hedge.`, "VERIFIED rule text, 17 CFR 240.10b5-1(c)(1)(i)(C)"],
    ["Zero-cost collar", `On free shares only. Tenor 6, 12 or 24 months (default 12). Put strike 80, 85 or 90% of today's close (default 85). The call strike solves zero cost by bisection on [S, 5S] to $0.01. Band rule: put at most 90%, call at least 110%. Cash-settled at expiry: you receive max(Kp − S, 0) and pay max(S − Kc, 0) per share, and the gains and losses are taxed at settlement. At expiry the clock pauses: roll at today's prices or let it end. Early unwind at model value less 1% of notional. Collared shares cannot be sold until the collar ends or is unwound. Needs 20 trading days of price history to price, so collars and puts open from the 21st trading day. <strong>Stated game terms:</strong> collar and put settlements are taxed at 23.8% when they settle (in real life the treatment can be short-term, with the straddle rules deferring losses); both legs are struck at the model mid price with no dealer spread, so a collar costs nothing up front, although unwinding early costs 1%. On SpaceX, every day you can play uses the model vol (60-day realized vol × 1.10, with the skew above); the listed-option smile appears only in the Street check on the latest data day.`, "ASSUMPTION; no IRS safe harbor for collars"],
    ["Credit line", `Collateral: free shares you pledge. Maximum advance 25% of the pledged shares' value (collared pledged shares count at 70% of the put floor value, where that tool is included). ${term("Maintenance call", "Maintenance call")} when loan ÷ collateral value exceeds 35%. Rate SOFR + 2.00% (5.94% at SOFR 3.94% on 2026-10-29), accrued daily, capitalized monthly. Uses: spending, taxes, collar settlements, the house; never securities. On a call the deadline is the third trading day after the call day, counted on the card's own price dates, and you can act through that day's close (the clock pauses on that day with "Last day to meet the call"). If the loan is still above 35% after the deadline day, the bank sells pledged shares at the close of the next trading day, ignoring blackouts. It sells the fewest shares that make the loan, less the sale proceeds after the 0.25% cost, at most 25% of the remaining pledged value. The tax on the gain is your bill, accrued in the tax ledger like any sale, not taken out of the loan repayment. For the founder seat the bank's sale counts toward the Rule 144 volume.`, "ASSUMPTION on terms; FINRA facts SESSION A"],
    ["Cash and index fund", `Cash earns DGS1MO. The index fund is SPY adjusted closes (total return). Deposits and withdrawals are free; index fund gains are taxed on withdrawal at 23.8% using average cost. Auto-invest (on by default): sale proceeds go straight into the index fund, and on the first trading day of each month any cash above $2,000,000 (a year of spending) is moved in too, but never borrowed money: cash less the loan and the overdraft stays at or above zero.`, "ASSUMPTION"],
    ["Dividends and total return", `Returns are total returns: price plus dividends. Cash dividends come from the dividend-adjusted price series: D<sub>t</sub> = close<sub>t−1</sub> × adj<sub>t</sub> / adj<sub>t−1</sub> − close<sub>t</sub>, counted when it exceeds 0.01% of the close. Each dividend is paid into cash on the day, on every share you hold (locked, collared and pledged shares included), taxed at 23.8% through the same ledger as a sale, and counted in net worth. Only KE Holdings (a blind card) pays dividends among the shipped cards.`, "ASSUMPTION; adjusted closes from Yahoo"],
    ["Tax at the end", `At the last close the game charges the tax still to come: 23.8% × max(0, G + U) − 23.8% × max(0, G), where G is the gain already realized and U the unrealized gain on shares, the index fund and the exchange fund plus the mark of any open collars and the mark of open puts less their premium. Losses net against gains. The charge is never less than minus the tax the ledger already counts.`, "ASSUMPTION"],
    ["Protective put", `Where the build includes it: 80, 85 or 90% puts for 6 or 12 months on free shares, premium paid from cash.`, "ASSUMPTION"],
    ["Exchange fund", `Where the build includes it: contribute free shares (minimum $1M) in an open window. Value follows SPY total return less 1% a year. Locked seven years; at card end it is valued at fund value less 23.8% tax on the gain over the carried-over basis, labeled "locked two more years". Leaving early (returning your own shares) is not modeled; the game holds the fund to the end.`, "SESSION C plus secondary sources; UNCONFIRMED at statute"],
    ["The Holder (rival)", `Never sells except what spending and the house need, from released shares in open windows; no hedges, no loans.`, "ASSUMPTION"],
    ["The Seller (rival)", `Sells every released share at the first open-window close, and adopts a 10b5-1 plan at 10% a month at the first open window to sell through blackouts; proceeds go to the index fund.`, "ASSUMPTION"],
    ["The Playbook (rival)", `At each release, sells a third, collars a third (85%, 12 months, rolled) and holds a third. It collars first, and adopts its 5% monthly 10b5-1 plan only when it has no further collar to place at that release. It never hedges while its plan is active: if a later release comes while the plan runs, it sells a third and holds the rest, and a collar that expires while the plan runs is not rolled. No bank states this plan.`, "ASSUMPTION; no bank's stated plan"],
    ["SpaceX card prices", `Offer price $135 (pricing 2026-06-11); first close $160.95; peak $211.39 (06-16); low $108.27 (08-05); $134.72 at the 2026-10-30 close. The live card grows by one day each trading day, so these are figures through that date, and the card is not comparable with five-year cards.`, "VERIFIED 2026-10-31 and 2026-11-01, Yahoo"],
    ["SpaceX seat", `Early engineer only. All of the founder's shares are locked for 366 days, to June 12, 2027, with no early release provisions, so the founder seat is sealed: "The founder's shares are locked until June 12, 2027 (424B4)."`, "VERIFIED 2026-11-01, 424B4"],
    ["SpaceX 30% price trigger", `Tranche b releases only if the close was at least 30% above $135 ($175.50) on 5 of the 10 trading days ending on the First Earnings Release Date. The highest close in the window was $125.33 on 2026-08-04, so it did not fire.`, "VERIFIED 2026-11-01, Yahoo closes, computed"],
    ["SpaceX release date (a)", `The 8-K for the Q2 results does not say whether the release came before or after the open. The engine uses the later date, 2026-08-06, because a later date can never let you sell early.`, "UNCONFIRMED: time of day"]
  ];
  return rows;
}

function termsHtml() {
  return `<dl class="pg-terms">${gameTerms()
    .map(([t, body, tg]) => `<div class="pg-term-row"><dt>${esc(t)}</dt><dd>${body} ${tag(tg)}</dd></div>`)
    .join("")}</dl>`;
}

const F = {
  nw: "W_t = shares × close + collar mark (model) + put mark + index fund + exchange fund + cash − loan − overdraft − taxes accrued but unpaid",
  ret: "R_t = (W_t + S_t) / W_{t−1} − 1",
  retWhere: "S_t is family spending and the house paid on day t.",
  sharpe: "Sharpe = mean(R_t − rf_t) / sample stdev(R_t − rf_t) × √252",
  rf: "rf_t = (1 + DGS1MO_t/100)^(1/252) − 1",
  dd: "the largest peak-to-trough fall of the spending-adjusted wealth index V_t = V_{t−1} × (1 + R_t), V_0 = 1",
  irr: "After-tax IRR = XIRR (365-day year, Newton with bisection fallback) on: −W_0 on day 0; +S_t on each spending date; +(W_T − terminal tax) on the last day, where terminal tax = 23.8% × max(0, G + U) − 23.8% × max(0, G), G the realized gain and U the unrealized gains on shares, index fund and exchange fund plus the mark of open collars and puts",
  wealth: "After-tax family wealth = the final XIRR flow plus total spending",
  vol: "base vol = max(realized vol of daily log returns over the last 60 trading days (or since IPO if fewer, minimum 20 days), 30%) × 1.10"
};

const fx = (t) => `<span class="pg-formula">${math(t)}</span>`;

function formulasHtml() {
  return (
    `<dl class="pg-formulas">` +
    `<div><dt>Daily net worth</dt><dd><p>${fx(F.nw)}</p></dd></div>` +
    `<div><dt>Daily return</dt><dd><p>${fx(F.ret)}, where ${math(F.retWhere)}</p></dd></div>` +
    `<div><dt>${term("Sharpe ratio", "Sharpe")}</dt><dd><p>${fx(F.sharpe)}, with ${fx(F.rf)}. Shown to one decimal.</p></dd></div>` +
    `<div><dt>${term("Max drawdown")}</dt><dd><p>Max drawdown = ${fx(F.dd)}. Shown as a percent with both dates.</p></dd></div>` +
    `<div><dt>${term("IRR", "After-tax IRR")}</dt><dd><p>${fx(F.irr)}.</p><p>Day-0 wealth is taken after tax too: the day-0 flow is −(W<sub>0</sub> − 23.8% × shares × (close<sub>0</sub> − basis)), so both ends are after tax and the tax already embedded in the stake on day 0 is not charged to your decisions. <span class="tag">[ASSUMPTION, build decision 2026-11-02]</span></p></dd></div>` +
    `<div><dt>After-tax family wealth</dt><dd><p>${fx(F.wealth)}.</p></dd></div>` +
    `</dl>` +
    `<p>Display: the big number is after-tax family wealth. A table of four measures: You, The Holder, The Seller, The Playbook. A verdict line: "You beat The Seller on 3 of 4 measures." No composite grade. The measures are identical for you and the rival bots, and they are compared at the precision shown (Sharpe to one decimal, drawdown and IRR to 0.1 point, wealth to $0.1M), so two scores that look the same are a tie. Returns are total returns: price plus dividends.</p>`
  );
}

function pricingHtml() {
  return (
    `<ul class="pg-list">` +
    `<li>Black-Scholes, no dividends. Rate r = FRED DGS1 on the trade date, used as a continuous rate.</li>` +
    `<li>SpaceX on the latest data day: put and call each at their own strike's ${term("Implied volatility", "implied vol")}, interpolated from the one-year smile stored in <code>data/spcx-options.json</code>.</li>` +
    `<li>Every other date and card: ${fx(F.vol)}. Puts at base + 1.5 vol points, calls at base − 1.5. ${tag("ASSUMPTION; skew calibrated on SPCX 2026-10-30")}</li>` +
    `<li>Collars and puts need 20 trading days of price history to price. Before that the game blocks them: "Options need 20 trading days of price history to price."</li>` +
    `<li>Stated game terms: both legs are struck at the model mid price with no dealer spread, and SpaceX collars use this model vol on every day you can play.</li>` +
    `</ul>` +
    `<div class="pg-scroll"><div class="pg-bs" role="group" aria-label="Black-Scholes formulas">` +
    `<p><span class="pg-formula">Call = S·N(d<sub>1</sub>) − K·e<sup>−rT</sup>·N(d<sub>2</sub>)</span></p>` +
    `<p><span class="pg-formula">Put = K·e<sup>−rT</sup>·N(−d<sub>2</sub>) − S·N(−d<sub>1</sub>)</span></p>` +
    `<p><span class="pg-formula">d<sub>1</sub> = [ln(S/K) + (r + σ<sup>2</sup>/2)·T] / (σ·√T), d<sub>2</sub> = d<sub>1</sub> − σ·√T</span></p>` +
    `</div></div>` +
    `<p>S is the close, K the strike, T the time to expiry in years, σ the volatility, N the standard normal distribution. The zero-cost call strike is found by bisection so that the call premium equals the put premium to $0.01.</p>`
  );
}

function streetCheckHtml(opts) {
  const sc = opts && opts.streetCheck;
  const fallback =
    "Model (flat 53.7% vol): one-year 85% floor $114.51, zero-cost cap $186.99. Listed SPCX options on Oct 30 imply a cap near $182. A dealer quoting a $100M block would charge a spread, so the real cap is lower.";
  if (!sc || typeof sc !== "object") {
    return `<aside class="pg-street" aria-label="Street check"><h3>Street check</h3><p>${esc(fallback)} ${tag("VERIFIED 2026-11-01, computed")}</p>${note("The stored street check could not be loaded, so this is the text as of 2026-11-01.")}</aside>`;
  }
  const vol = typeof sc.vol === "number" ? (sc.vol < 1.5 ? sc.vol * 100 : sc.vol) : null;
  const volTxt = vol == null ? "flat" : `flat ${vol.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  const asOf = String(sc.asOf || (opts && opts.asOf) || "").slice(0, 10);
  const capNear = typeof sc.marketCap === "number" ? money(Math.round(sc.marketCap), 0) : "—";
  const sentence =
    `Model (${volTxt} vol): one-year 85% floor ${money(sc.floor)}, zero-cost cap ${money(sc.modelCap)}. ` +
    `Listed SPCX options on ${asOf ? fmtDate(asOf) : "the as-of date"} imply a cap near ${capNear}. ` +
    `A dealer quoting a $100M block would charge a spread, so the real cap is lower.`;
  return (
    `<aside class="pg-street" aria-label="Street check"><h3>Street check</h3>` +
    `<p>${esc(sentence)}</p>` +
    `<dl class="pg-kv">` +
    `<div><dt>Model cap</dt><dd class="pg-num">${money(sc.modelCap)}</dd></div>` +
    `<div><dt>Market cap</dt><dd class="pg-num">${money(sc.marketCap)}</dd></div>` +
    `<div><dt>Floor (85% put)</dt><dd class="pg-num">${money(sc.floor)}</dd></div>` +
    `<div><dt>Spot</dt><dd class="pg-num">${money(sc.spot)}</dd></div>` +
    `<div><dt>As of</dt><dd>${asOf ? esc(fmtDate(asOf)) : "—"}</dd></div>` +
    `</dl>` +
    (sc.method ? `<p class="pg-method"><strong>Method.</strong> ${esc(sc.method)}</p>` : "") +
    `<p>${tag("VERIFIED 2026-11-01, computed")} Only derived numbers are published, not the option chain.</p>` +
    `</aside>`
  );
}

function rulesHtml() {
  const rows = [
    {
      rule: "Lockup",
      what: "Shares release only on resolved tranche dates. Locked shares cannot be sold, hedged, pledged or contributed.",
      src: [
        link(SRC.spcx424, "SpaceX 424B4, pp. 259 to 261, 272 to 273"),
        `each blind card's 424B4: ${link("#pg-method-universe", "linked in the card universe")}`
      ],
      tag: "VERIFIED 2026-11-01, 424B4 p. 261"
    },
    {
      rule: "Trading window",
      what: "Closed from 30 calendar days before each earnings release until the start of the second trading day after it. Discretionary sales and adoption of plans and hedges only when open. The live card's next release is projected at the last release plus 91 days and labeled \"projected\".",
      src: [`game term; real 8-K Item 2.02 dates from ${link(SRC.spcxSubs, "SEC submissions")} (${link("#pg-src-3", "source 3")})`],
      tag: "ASSUMPTION; dates VERIFIED 2026-11-01"
    },
    {
      rule: "10b5-1 cooling-off",
      what: "Early engineer 30 days. Founder: the later of 90 days after adoption or 2 business days after the 10-Q or 10-K for the quarter in which the plan was adopted, at most 120 days.",
      src: [link(SRC.cfr10b51, "17 CFR 240.10b5-1(c)(1)(ii)(B)")],
      tag: "VERIFIED 2026-11-01"
    },
    {
      rule: "No new hedge under a plan",
      what: "No new collar or put while a 10b5-1 plan is adopted, cooling-off included. Cancel the plan first.",
      src: [link(SRC.cfr10b51, "17 CFR 240.10b5-1(c)(1)(i)(C)")],
      tag: "VERIFIED 2026-11-01"
    },
    {
      rule: "One plan at a time",
      what: "A second plan is blocked.",
      src: [link(SRC.cfr10b51, "17 CFR 240.10b5-1(c)(1)(ii)(D)")],
      tag: "VERIFIED 2026-11-01"
    },
    {
      rule: "Rule 144 volume cap (founder)",
      what: "In any rolling 3 months, sales no more than the greater of 1% of shares outstanding or average weekly volume over the prior 4 calendar weeks.",
      src: [link(SRC.cfr144, "17 CFR 230.144(e)")],
      tag: "VERIFIED 2026-11-01"
    },
    {
      rule: "Rule 144 reporting gate (founder)",
      what: "No sales before IPO day 91.",
      src: [link(SRC.cfr144, "17 CFR 230.144(c) and (d)"), link(SRC.spcx424, "424B4 day-91 release")],
      tag: "VERIFIED 2026-11-01"
    },
    {
      rule: "Single-stock lending",
      what: "25% advance, 35% call, deadline on the third trading day, forced taxable sale at the next close.",
      src: [`game terms; ${link(SRC.finra, "FINRA, securities-backed lines of credit")}`],
      tag: "ASSUMPTION; FINRA facts SESSION A"
    },
    {
      rule: "Collar band",
      what: "Put at most 90%, call at least 110%.",
      src: [`game term; IRC 1259 has no safe harbor: ${link(SRC.irc1259, "26 U.S.C. 1259")}, ${link(SRC.sia, "SIA letter to Treasury")}`],
      tag: "ASSUMPTION; no IRS safe harbor"
    },
    {
      rule: "Exchange fund",
      what: "7-year hold.",
      src: [`IRC 704(c)(1)(B) and 737: ${link(SRC.irc704, "26 U.S.C. 704")}, ${link(SRC.irc737, "26 U.S.C. 737")} (secondary sources)`],
      tag: "UNCONFIRMED at statute"
    }
  ];
  return (
    `<div class="pg-scroll"><table class="pg-table pg-rules"><caption class="pg-sr">Rules the engine enforces, with sources</caption>` +
    `<thead><tr><th scope="col">Rule</th><th scope="col">Engine behavior</th><th scope="col">Source</th></tr></thead><tbody>` +
    rows
      .map(
        (r) =>
          `<tr><th scope="row">${esc(r.rule)}</th><td>${esc(r.what)}</td><td>${r.src.map((s) => `<span class="pg-src">${s}</span>`).join("")} ${tag(r.tag)}</td></tr>`
      )
      .join("") +
    `</tbody></table></div>`
  );
}

// ---- lockup tables

function ordinal(n) {
  const names = { 1: "first", 2: "second", 3: "third", 4: "fourth" };
  return names[n] || `${n}th`;
}

function relDay(card, iso) {
  const first = card && card.ipo && card.ipo.firstTrade;
  const n = daysBetween(first, iso);
  if (n == null) return "—";
  return n === 0 ? "day 0 (first trade)" : `day ${n} after first trade`;
}

function triggerText(t, card, blind) {
  if (!t || typeof t !== "object") return "—";
  switch (t.type) {
    case "date":
      return blind ? `${relDay(card, t.date)}` : `on ${fmtDate(t.date)}`;
    case "calendarDaysAfter":
      return `${t.days} calendar days after ${t.from === "pricingDate" ? "pricing" : "the first trade"}${t.onOrAfter ? " (on or after)" : ""}`;
    case "afterEarnings":
      return `trading day ${t.tradingDaysAfter ?? 2} after the ${ordinal(t.n ?? 1)} earnings release since the IPO`;
    case "priceCondition":
      return `close at least ${t.pct}% above the ${t.of === "offerPrice" ? "offer price" : t.of} on ${t.daysMet} of ${t.window} trading days${t.endsOn === "firstEarnings" ? " ending on the first earnings release date" : ""}`;
    case "remainder":
      return `the rest, ${t.days} days after ${t.from === "firstTrade" ? "the first trade" : "pricing"}`;
    default:
      return String(t.type || "—");
  }
}

function usedDate(tr, card, blind, trig) {
  if (!tr.resolvedDate) return trig && trig.type === "priceCondition" ? "never (condition not met)" : "not resolved";
  return blind ? relDay(card, tr.resolvedDate) : fmtDate(tr.resolvedDate);
}

function lockupTableHtml(card, entry) {
  const blind = !!(entry ? entry.blind : card.blind);
  const label = (entry && entry.label) || (blind ? "Card" : card.name || card.id);
  const groups = (card.lockup && card.lockup.groups) || [];
  const head = blind
    ? `<h3 id="pg-lock-${esc(card.id)}">${esc(label)}</h3><p class="pg-muted">Relative days only, counted from the first trade. The company is revealed after you finish the card.</p>`
    : `<h3 id="pg-lock-${esc(card.id)}">${esc(label)}${card.live ? " · live card" : ""}</h3>` +
      `<p class="pg-muted">${card.live ? `Live card: ${esc((entry && entry.tradingDays) || (card.prices ? card.prices.length : "?"))} trading days so far. Not comparable with five-year cards. ` : ""}Offer price ${card.ipo && card.ipo.offerPrice != null ? esc(money(card.ipo.offerPrice)) : "—"}, priced ${esc(fmtDate(card.ipo && card.ipo.pricingDate))}.</p>`;
  if (!groups.length) return head + note("No reconciled lockup is stored for this card yet.");
  const body = groups
    .map((g) => {
      const seats = (g.seats || []).map((s) => (s === "engineer" ? "Early engineer" : s === "founder" ? "Founder-CEO" : esc(s))).join(" and ");
      const sum = (g.tranches || []).reduce((a, t) => a + (Number(t.pct) || 0), 0);
      const gh = blind ? `Lockup group · ${seats || "seat"}` : `${esc(g.label || g.id)} · ${seats || "seat"}`;
      const rows = (g.tranches || [])
        .map((t) => {
          const quote = !blind && t.quote ? `<q>${esc(t.quote)}</q>${t.page != null ? ` <span class="pg-muted">p. ${esc(t.page)}</span>` : ""}` : "";
          return (
            `<tr><th scope="row">${esc(t.id)}</th><td class="pg-num">${esc(t.pct)}%</td><td>${esc(triggerText(t.trigger, card, blind))}</td>` +
            `<td>${esc(usedDate(t, card, blind, t.trigger))}</td>${blind ? "" : `<td>${quote}</td>`}</tr>`
          );
        })
        .join("");
      return (
        `<h4>${gh}</h4><div class="pg-scroll"><table class="pg-table pg-lockup"><thead><tr><th scope="col">Tranche</th><th scope="col">Share</th><th scope="col">Trigger</th><th scope="col">${blind ? "Releases" : "Date used"}</th>${blind ? "" : `<th scope="col">Prospectus quote</th>`}</tr></thead>` +
        `<tbody>${rows}</tbody><tfoot><tr><th scope="row">Total</th><td class="pg-num">${esc(+sum.toFixed(4))}%</td><td colspan="${blind ? 2 : 3}">${Math.abs(sum - 100) < 1e-6 ? "Shares sum to 100% of the locked stake." : "Does not sum to 100%. The card is flagged for a human check."}</td></tr></tfoot></table></div>` +
        ((g.tranches || []).some((t) => !t.resolvedDate) && (g.tranches || []).some((t) => t.trigger && t.trigger.type === "remainder")
          ? `<p class="pg-muted">Shares in a tranche that never releases are added to the remainder tranche, which releases on its own day.</p>`
          : "")
      );
    })
    .join("");
  return head + body;
}

function lockupsHtml(c) {
  const index = c.cardsIndex || [];
  if (!index.length) return note("No cards are published yet. Lockup tables appear here as soon as a card is.");
  return (
    `<p>Percentages are shares of your locked stake. Each tranche's trigger is quoted from the card's 424B4; the How AI was used page shows the page number and both machine reads.</p>` +
    index
      .map((e) => {
        const card = c.cards[e.id];
        if (!card) return `<h3>${esc(e.label || e.id)}</h3>${missing("This card")}`;
        return lockupTableHtml(card, e);
      })
      .join("")
  );
}

function universeHtml(u) {
  const ruleFallback =
    "US IPOs (no direct listings, no SPACs) priced 2019-01-01 to 2021-06-30 with gross proceeds of at least $1B, a 424B4 on EDGAR, and at least 1,260 trading days of Yahoo history from the first trade. Draw: seeded random (seed string founders-five-2026-11-01, Mulberry32 over the sorted ticker list), first 6 that pass the lockup double-read.";
  if (!u || typeof u !== "object") {
    return `<p>${esc(ruleFallback)}</p>${note("The stored universe file could not be loaded, so this is the rule as designed.")}`;
  }
  const rule = typeof u.rule === "string" ? u.rule : u.rule ? JSON.stringify(u.rule) : ruleFallback;
  const included = Array.isArray(u.included) ? u.included : [];
  const excluded = Array.isArray(u.excluded) ? u.excluded : [];
  const inc = included
    .map((r) => ({ t: String(r.ticker || ""), url: r.url424b4 }))
    .filter((r) => r.t)
    .sort((a, b) => a.t.localeCompare(b.t));
  return (
    `<p>${esc(rule)}</p>` +
    `<dl class="pg-kv"><div><dt>Seed</dt><dd class="pg-num">${esc(u.seed || "—")}</dd></div>` +
    `<div><dt>Included</dt><dd class="pg-num">${included.length}</dd></div>` +
    `<div><dt>Excluded</dt><dd class="pg-num">${excluded.length}</dd></div></dl>` +
    `<h3>Included tickers</h3>` +
    `<p class="pg-muted">Listed alphabetically. The page does not say which of them is which card, so a blind card stays blind until you finish it.</p>` +
    (inc.length
      ? `<ul class="pg-chips">${inc.map((r) => `<li>${r.url ? link(r.url, esc(r.t)) : esc(r.t)}</li>`).join("")}</ul><p class="pg-muted">Each ticker links to its 424B4.</p>`
      : note("No included rows are stored yet.")) +
    `<h3>Excluded, with reasons</h3>` +
    (excluded.length
      ? `<div class="pg-scroll"><table class="pg-table"><thead><tr><th scope="col">Ticker</th><th scope="col">Reason</th></tr></thead><tbody>${excluded
          .map((r) => `<tr><th scope="row">${esc(r.ticker)}</th><td>${esc(r.reason)}</td></tr>`)
          .join("")}</tbody></table></div>`
      : note("No exclusions are stored."))
  );
}

function leavesOutHtml() {
  const items = [
    ["Pre-IPO GRATs", "grantor retained annuity trusts used before an IPO to move expected appreciation out of an estate"],
    ["Gifts to trusts", "transfers of shares to family trusts"],
    ["Charitable remainder trusts", "trusts that pay an income stream and leave the remainder to charity"],
    ["Donor-advised funds", "gifts of appreciated shares to a charitable account"],
    ["QSBS (Section 1202)", "exclusion of some gain on qualified small business stock"],
    ["State tax", "not included"],
    ["Straddle rules", "tax rules for offsetting positions"],
    ["Real dealer spreads", "a bank quoting a $100M block would charge more than the model price"]
  ];
  return (
    `<ul class="pg-list">${items.map(([a, b]) => `<li><strong>${esc(a)}</strong>: ${esc(b)}.</li>`).join("")}</ul>` +
    `<p>Most estate moves happen before the IPO, outside the game's window.</p>`
  );
}

async function renderMethod(ctx) {
  const c = await gather(ctx, ["cards", "spcxOptions", "universe"]);
  const spcx = c.cards && (c.cards.spcx || Object.values(c.cards).find((x) => x && !x.blind));
  const secs = [
    {
      id: "pg-method-terms",
      title: "Game terms and tags",
      html: section(
        "pg-method-terms",
        "Game terms and tags",
        `<p>Every number the game uses is either checked at a source or marked as a choice we made. The tag after each term says which.</p>` +
          `<ul class="pg-legend">${TAG_LEGEND.map(([k, kind, text]) => `<li>${tag(k)} ${esc(text)}</li>`).join("")}</ul>` +
          termsHtml()
      )
    },
    { id: "pg-method-formulas", title: "Formulas", html: section("pg-method-formulas", "Formulas", `<p>Identical for you and the rival bots. Math is shown in plain text.</p>${formulasHtml()}`) },
    { id: "pg-method-rules", title: "Rules enforced", html: section("pg-method-rules", "Rules enforced", `<p>Shown on the Rules drawer and on each gated control. Every gate states the rule and the date.</p>${rulesHtml()}`) },
    { id: "pg-method-pricing", title: "Option pricing", html: section("pg-method-pricing", "Option pricing", pricingHtml()) },
    { id: "pg-method-street", title: "Street check", html: section("pg-method-street", "Street check", streetCheckHtml(c.spcxOptions)) },
    { id: "pg-method-lockups", title: "Lockup tables", html: section("pg-method-lockups", "Lockup tables", lockupsHtml(c)) },
    { id: "pg-method-universe", title: "Card universe and exclusions", html: section("pg-method-universe", "Card universe and exclusions", universeHtml(c.universe)) },
    { id: "pg-method-leaves-out", title: "What this replay leaves out", html: section("pg-method-leaves-out", "What this replay leaves out", leavesOutHtml()) },
    {
      id: "pg-method-credit",
      title: "Credit",
      html: section(
        "pg-method-credit",
        "Credit",
        `<p>The interaction model (a running clock, a dark rail with cash and net worth, tools that unlock with short lessons, live rivals and achievements) was inspired by NGPF's Build Your Stax (${link(SRC.stax, "buildyourstax.com")}). Founder's Five's art, copy, palette and rules are original.</p>`
      )
    },
    { id: "pg-method-sources", title: "Sources", html: section("pg-method-sources", "Sources", sourcesList(spcx)) }
  ];
  return shell(
    "method",
    "Method & Sources",
    "How the game works, which rules it enforces, where every number comes from, and what it leaves out.",
    secs
  );
}

// ---------------------------------------------------------------- DATA

function testStatusHtml(ts) {
  if (!ts || typeof ts !== "object") return note("No test status has been published yet.");
  const pick = (...keys) => keys.map((k) => ts[k]).find((v) => v !== undefined && v !== null);
  const okFlag = [ts.ok, ts.pass, ts.success, ts.passed].find((v) => typeof v === "boolean");
  const failed = pick("failed", "fail", "failures");
  const total = pick("total", "tests");
  const passedN = [ts.passed, ts.passCount, ts.pass_count].find((v) => typeof v === "number");
  const ok = typeof okFlag === "boolean" ? okFlag : typeof failed === "number" ? failed === 0 : null;
  const when = pick("ranAt", "run", "date", "when", "time", "at", "updated");
  const bits = [];
  if (typeof total === "number") bits.push(`${total} tests`);
  if (typeof passedN === "number") bits.push(`${passedN} passed`);
  if (typeof failed === "number") bits.push(`${failed} failed`);
  const flat = Object.entries(ts).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v));
  return (
    `<p class="pg-status ${ok === true ? "pg-ok" : ok === false ? "pg-fail" : ""}">` +
    `<strong>${ok === true ? "Passing" : ok === false ? "Failing" : "Status recorded"}</strong>` +
    (bits.length ? `: ${esc(bits.join(", "))}` : "") +
    (when ? `. Last run ${esc(String(when).length > 10 ? fmtRun(when) : fmtDate(when))}` : "") +
    `.</p>` +
    (flat.length
      ? `<dl class="pg-kv">${flat.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="pg-num">${esc(v === null ? "—" : String(v))}</dd></div>`).join("")}</dl>`
      : "")
  );
}

function runsHtml(log) {
  if (!Array.isArray(log)) return missing("The update log");
  if (!log.length) return note("The nightly job has not logged a run yet.");
  const rows = log.slice(0, 20);
  return (
    `<div class="pg-scroll"><table class="pg-table pg-runs"><caption class="pg-sr">Last ${rows.length} data job runs, newest first</caption>` +
    `<thead><tr><th scope="col">Run (UTC)</th><th scope="col">Result</th><th scope="col">What changed</th><th scope="col">Error</th></tr></thead><tbody>` +
    rows
      .map((r) => {
        const changed = Array.isArray(r.changed) ? r.changed : r.changed ? [r.changed] : [];
        return (
          `<tr><th scope="row" class="pg-num">${fmtRun(r.run)}</th>` +
          `<td><span class="pg-badge ${r.ok ? "pg-ok" : "pg-fail"}">${r.ok ? "ok" : "failed"}</span></td>` +
          `<td>${changed.length ? changed.map((x) => `<span class="pg-chip">${esc(x)}</span>`).join(" ") : '<span class="pg-muted">no new data</span>'}</td>` +
          `<td>${r.error ? esc(r.error) : '<span class="pg-muted">none</span>'}</td></tr>`
        );
      })
      .join("") +
    `</tbody></table></div>`
  );
}

async function renderData(ctx) {
  const c = await gather(ctx, ["meta", "log", "testStatus", "cardsIndex"]);
  const meta = c.meta;
  const asOf = meta && meta.asOf ? String(meta.asOf).slice(0, 10) : null;
  const asOfHtml = meta
    ? `<p class="pg-strip">Prices through <strong>${esc(fmtDateWd(asOf))}</strong> close · updated nightly · SpaceX card: <strong>${esc(meta.spcxTradingDays ?? "?")}</strong> trading days</p>` +
      `<dl class="pg-kv">` +
      `<div><dt>Data as of</dt><dd class="pg-num">${esc(asOf || "—")}</dd></div>` +
      `<div><dt>SpaceX trading days</dt><dd class="pg-num">${esc(meta.spcxTradingDays ?? "—")}</dd></div>` +
      `<div><dt>Last job run</dt><dd class="pg-num">${meta.lastRun ? fmtRun(meta.lastRun) : "—"}</dd></div>` +
      `<div><dt>Schema</dt><dd class="pg-num">${esc(meta.schema ?? "—")}</dd></div></dl>` +
      `<p>The browser never calls a data source. A scheduled job fetches everything, runs the tests and commits JSON; this site reads the JSON. Copy says "nightly" because GitHub's scheduler can run late.</p>`
    : missing("The data-as-of file") ;
  const files = [
    ["meta.json", "data-as-of date, last run, SpaceX trading-day counter"],
    ["update-log.json", "the last 60 job runs"],
    ["market.json", "SPY adjusted closes and the three rate series"],
    ["spcx-options.json", "SpaceX implied-vol summary and the street check"],
    ["universe.json", "the card universe, rule, seed and exclusions"],
    ["test-status.json", "the latest test result"],
    ["cards/index.json", "the card list"]
  ];
  const cardFiles = (c.cardsIndex || []).map((e) => [`cards/${e.id}.json`, e.blind ? `${e.label || e.id}: full card data` : `${e.label || e.id}: full card data`]);
  const fileHtml =
    `<ul class="pg-files">` +
    files.concat(cardFiles)
      .map(([f, d]) => `<li>${link(new URL(f, DATA_BASE).href, `<code>data/${esc(f)}</code>`)} <span class="pg-muted">${esc(d)}</span></li>`)
      .join("") +
    `</ul>` +
    note("Blind card files contain the company name, ticker and dates. Open them after you finish the card.");
  const secs = [
    { id: "pg-data-asof", title: "Data as of", html: section("pg-data-asof", "Data as of", asOfHtml) },
    { id: "pg-data-runs", title: "Last 20 job runs", html: section("pg-data-runs", "Last 20 job runs", runsHtml(c.log)) },
    { id: "pg-data-tests", title: "Test status", html: section("pg-data-tests", "Test status", `${testStatusHtml(c.testStatus)}<p>The job runs <code>node --test</code> and commits only if the tests pass.</p>`) },
    {
      id: "pg-data-history",
      title: "Run history on GitHub",
      html: section(
        "pg-data-history",
        "Run history on GitHub",
        `<p>Every nightly run, its log and the commit it made are public: ${link(ACTIONS_URL, "GitHub Actions history")}. The code is in the ${link(REPO_URL, "repository")}.</p>`
      )
    },
    { id: "pg-data-files", title: "Raw data files", html: section("pg-data-files", "Raw data files", `<p>Everything the game reads, as plain JSON.</p>${fileHtml}`) }
  ];
  return shell(
    "data",
    "Data",
    "What the game knows, when it last updated, and how to check the job that updates it.",
    secs
  );
}

// ---------------------------------------------------------------- AI

function fmtRead(x) {
  if (x == null) return '<span class="pg-muted">not recorded</span>';
  if (typeof x !== "object") return esc(String(x));
  if (Array.isArray(x)) return esc(x.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("; "));
  return esc(
    Object.entries(x)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("; ")
  );
}

function humanHtml(h) {
  if (!h || !h.status) return "pending: a teammate has not signed this yet";
  if (h.status === "signed") return `signed${h.by ? ` by ${esc(h.by)}` : ""}${h.date ? ` on ${esc(fmtDate(h.date))}` : ""}`;
  return "pending: a teammate has not signed this yet";
}

function trancheCard(t, card) {
  const url = t.url || (t.source && t.source.url) || (card.ipo && card.ipo.source && card.ipo.source.url);
  const rec = t.reconciled === true;
  return (
    `<article class="pg-tranche"><h5>Tranche ${esc(t.id)} · ${esc(t.pct)}% · ${t.resolvedDate ? esc(fmtDate(t.resolvedDate)) : "never releases"}</h5>` +
    `<dl class="pg-reads">` +
    `<div><dt>Read A</dt><dd>${fmtRead(t.readA)}</dd></div>` +
    `<div><dt>Read B</dt><dd>${fmtRead(t.readB)}</dd></div>` +
    `<div><dt>Quote</dt><dd>${t.quote ? `<q>${esc(t.quote)}</q>` : '<span class="pg-muted">none stored</span>'}</dd></div>` +
    `<div><dt>Page</dt><dd>${t.page != null ? `p. ${esc(t.page)}` : "—"}</dd></div>` +
    `<div><dt>Filing</dt><dd>${url ? link(url, "424B4" + (t.page != null ? `, p. ${esc(t.page)}` : "")) : "—"}</dd></div>` +
    `<div><dt>Reconciler</dt><dd><span class="pg-badge ${rec ? "pg-ok" : "pg-fail"}">${rec ? "reads agree" : "not reconciled"}</span></dd></div>` +
    `<div><dt>Human sign-off</dt><dd>${humanHtml(t.human)}</dd></div>` +
    `</dl></article>`
  );
}

function headlineSummary(card) {
  const hs = Array.isArray(card.headlines) ? card.headlines : [];
  const st = card.headlineStats || card.headlineCounts || card.headlineMeta || null;
  const pass = (k) => hs.filter((h) => h && h[k] === "pass").length;
  const parts = [];
  if (st && typeof st === "object") {
    const g = (...ks) => ks.map((k) => st[k]).find((v) => v != null);
    if (g("written") != null) parts.push(`${g("written")} written`);
    if (g("rejected") != null) parts.push(`${g("rejected")} rejected`);
    if (g("edited") != null) parts.push(`${g("edited")} edited`);
  }
  const shown = `${hs.length} shown; name filter passed on ${pass("nameFilter")}; identification check passed on ${pass("review")}`;
  return (parts.length ? `Headlines: ${parts.join(", ")}. ` : "Headlines: ") + shown + ".";
}

function aiCardHtml(card, entry, finished) {
  const blind = !!(entry ? entry.blind : card && card.blind);
  const label = (entry && entry.label) || (card && card.name) || (entry && entry.id);
  const idAttr = `pg-ai-card-${esc((entry && entry.id) || (card && card.id))}`;
  if (blind && !finished) {
    return `<div class="pg-ai-card pg-gated" id="${idAttr}"><h3>${esc(label)}</h3><p>Finish ${esc(label)} to see its lockup reads.</p></div>`;
  }
  if (!card) return `<div class="pg-ai-card" id="${idAttr}"><h3>${esc(label)}</h3>${missing("This card")}</div>`;
  const groups = (card.lockup && card.lockup.groups) || [];
  const idLine = blind ? ` <span class="pg-muted">(${esc(card.name || "")}${card.ticker ? `, ${esc(card.ticker)}` : ""})</span>` : "";
  const lock = groups.length
    ? groups
        .map((g) => {
          const seats = (g.seats || []).map((s) => (s === "engineer" ? "Early engineer" : s === "founder" ? "Founder-CEO" : esc(s))).join(" and ");
          return `<h4>${esc(g.label || g.id)} · ${seats}</h4><div class="pg-tranches">${(g.tranches || []).map((t) => trancheCard(t, card)).join("")}</div>`;
        })
        .join("")
    : note("No reconciled lockup is stored for this card yet.");
  const rev = card.reveal && card.reveal.text
    ? `<h4>Reveal paragraph</h4><blockquote class="pg-reveal">${esc(card.reveal.text)}</blockquote><p>${card.reveal.numbersChecked ? '<span class="pg-badge pg-ok">numbers checked</span> Every number in the paragraph appears in the card data.' : '<span class="pg-badge pg-fail">numbers not checked</span>'}</p>`
    : "";
  return (
    `<div class="pg-ai-card" id="${idAttr}"><h3>${esc(label)}${idLine}</h3>` +
    `<h4>Lockup reads</h4>${lock}` +
    `<h4>Headlines</h4><p>${esc(headlineSummary(card))}</p>` +
    rev +
    `</div>`
  );
}

const AI_JOBS = [
  ["Lockup reader", "424B4 text of \"Shares Eligible for Future Sale\" and \"Underwriting: Lock-up\"", "Tranche JSON with quote and page", "Two independent reads (separate agents, no shared context) plus a reconciler; code checks percentages sum to 100 per group and dates resolve", "A teammate signs each tranche on Monday"],
  ["Headline anonymizer", "8-K text near the card's 8 largest absolute one-day moves", "One line each: no names, products, people, places or tickers", "A name filter (company name, ticker, product names, executive names from the 424B4) plus a second agent asked \"can you identify the company?\"", "A teammate reads all of them on Monday"],
  ["Reveal writer", "The card JSON", "About 80 words", "Every number in the text must appear in the card JSON", "A teammate reads them"],
  ["Universe compiler", "Public IPO lists, 424B4s", "universe.json", "Each included row links its 424B4 and proceeds", "A teammate spot-checks 3"]
];

const GOLDEN = [
  "Black-Scholes put and zero-cost call on the SpaceX worked example",
  "Put-call parity to 1e-9",
  "XIRR on a two-year flow",
  "Sharpe of a five-day return series",
  "Max drawdown of a six-point series",
  "SpaceX ladder: resolved dates and shares match the Method table; condition (b) is false",
  "Cooling-off dates for both seats",
  "Loan: the 25% advance reaches the 35% call after a 28.57% fall; cure and forced-sale amounts match closed forms",
  "Tax on a 100,000-share sale",
  "Window closes exactly 30 days before each earnings date and reopens on the second trading day after",
  "Determinism: same card, seat and action log gives the same result to the cent",
  "Invariants each day: shares conserved; no sale of locked shares; net worth recomputes from its parts"
];

async function renderAI(ctx) {
  const c = await gather(ctx, ["cards"]);
  const fin = finishedSet();
  const index = c.cardsIndex || [];
  const secs = [
    {
      id: "pg-ai-what",
      title: "What Claude did",
      html: section(
        "pg-ai-what",
        "What Claude did",
        `<ul class="pg-list">` +
          `<li><strong>Built the code.</strong> The engine, the screens, the nightly data job and the tests were written in Claude Code sessions.</li>` +
          `<li><strong>Read every lockup twice.</strong> Two agents with no shared context each read the 424B4 and wrote the tranches with a quote and a page. A third step, the reconciler, compared them. Where the reads disagree, the card is dropped.</li>` +
          `<li><strong>Wrote anonymized headlines.</strong> Each blind card gets 8 headlines, each checked by a name filter and by a second agent asked whether it can identify the company.</li>` +
          `<li><strong>Wrote reveal paragraphs.</strong> Every number in a paragraph is machine-checked against the card data.</li>` +
          `</ul>` +
          `<p>All AI work ran in the build sessions. The game, the nightly job and these pages call no AI model while you use them.</p>` +
          `<div class="pg-scroll"><table class="pg-table"><caption class="pg-sr">AI jobs, their checks and the human check</caption><thead><tr><th scope="col">Job</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Validator</th><th scope="col">Human check</th></tr></thead><tbody>` +
          AI_JOBS.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("") +
          `</tbody></table></div>`
      )
    },
    {
      id: "pg-ai-humans",
      title: "What humans check",
      html: section(
        "pg-ai-humans",
        "What humans check",
        `<p>Teammates check these on Monday, and the sign-off status of each tranche is shown below:</p>` +
          `<ul class="pg-list"><li>Every tranche on every card against its 424B4 page.</li><li>All headlines.</li><li>The offer prices.</li><li>The street check numbers against the CBOE file.</li><li>The phone check: the live site in a private window on a phone.</li></ul>` +
          `<h3>Automated checks</h3><p>Twelve golden tests run with <code>node --test</code> and must pass before the nightly job commits:</p>` +
          `<ol class="pg-list">${GOLDEN.map((g) => `<li>${esc(g)}.</li>`).join("")}</ol>`
      )
    },
    {
      id: "pg-ai-cards",
      title: "Reads, headlines and reveals by card",
      html: section(
        "pg-ai-cards",
        "Reads, headlines and reveals by card",
        `<p>Blind cards show this only after you finish the card on this device. The SpaceX card is not blind, so it is always shown.</p>` +
          (index.length
            ? index.map((e) => aiCardHtml(c.cards[e.id], e, fin.has(e.id))).join("")
            : note("No cards are published yet."))
      )
    }
  ];
  return shell(
    "ai",
    "How AI was used",
    "What Claude built and read, how each piece was checked, and what people still verify by hand.",
    secs
  );
}

// ---------------------------------------------------------------- GLOSSARY

async function renderGlossary() {
  const keys = glossaryKeys();
  const toc = `<ul class="pg-chips pg-chips-links">${keys.map((k) => `<li><a href="#pg-gl-${esc(slug(k))}">${esc(k)}</a></li>`).join("")}</ul>`;
  const list = `<dl class="pg-glossary">${keys
    .map((k) => `<div id="pg-gl-${esc(slug(k))}" tabindex="-1"><dt>${esc(k)}</dt><dd><p class="pg-gl-short">${esc(GLOSSARY[k].short)}</p><p>${esc(GLOSSARY[k].long)}</p></dd></div>`)
    .join("")}</dl>`;
  const secs = [
    { id: "pg-glossary-terms", title: "Terms", html: section("pg-glossary-terms", "Terms", `<p>${keys.length} terms. The same short definitions appear when you hover or focus a dotted term in the game.</p>${toc}${list}`) }
  ];
  return shell("glossary", "Glossary", "Plain definitions of the words the game uses.", secs);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------- entry point

const RENDERERS = { method: renderMethod, data: renderData, ai: renderAI, glossary: renderGlossary };

function wire(root) {
  root.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#pg-"]');
    if (!a) return;
    const target = root.querySelector("#" + CSS.escape(a.getAttribute("href").slice(1)));
    if (!target) return;
    e.preventDefault(); // keep the shell's own hash routing untouched
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
}

export async function renderPage(name, el, ctx = {}) {
  const key = String(name || "").toLowerCase();
  const render = RENDERERS[key];
  if (!render) {
    el.innerHTML = `<article class="ff-page"><header class="pg-head"><h1>Page not found</h1></header><p class="pg-note">There is no page called "${esc(name)}". Pages: ${PAGES.map(esc).join(", ")}.</p></article>`;
    return;
  }
  el.innerHTML = `<article class="ff-page" data-page="${key}" aria-busy="true"><p class="pg-note">Loading ${esc(PAGE_TITLES[key])}.</p></article>`;
  let html;
  try {
    html = await render(ctx || {});
  } catch (err) {
    console.warn("pages.js: render failed", err);
    html = `<header class="pg-head"><h1>${esc(PAGE_TITLES[key])}</h1></header>${note("This page could not be built from the stored data. Reload to try again.")}<footer class="pg-foot"><p class="pg-disclaimer">${esc(DISCLAIMER)}</p></footer>`;
  }
  el.innerHTML = `<article class="ff-page" data-page="${key}">${html}</article>`;
  wire(el.firstElementChild);
}

export default { renderPage, PAGES, PAGE_TITLES };

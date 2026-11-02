// Founder's Five: pages acceptance run (T11).
//   node tests/pages-shots.mjs
// Renders method | data | ai | glossary through tests/pages-harness.html (no shell needed), at 1280x800 and 375x812.
// Screenshots go to tests/out/pages/. Exits 1 on any console error or failed check.
// Uses a server on :8765 if one is up; otherwise starts `python3 -m http.server 8766` and kills it at the end.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BLIND_NAMES } from "./pages-fixtures.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tests", "out", "pages");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(port) {
  try { const r = await fetch(`http://localhost:${port}/tests/pages-harness.html`); return r.ok; } catch { return false; }
}

let server = null, base;
if (await up(8765)) base = "http://localhost:8765";
else {
  server = spawn("python3", ["-m", "http.server", "8766"], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50 && !(await up(8766)); i++) await sleep(100);
  base = "http://localhost:8766";
}

const failures = [];
const warnings = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

const plain = (html) =>
  html
    .replace(/<sub>([^<]*)<\/sub>/g, (m, x) => (x.length > 1 ? `_{${x}}` : `_${x}`))
    .replace(/<sup>([^<]*)<\/sup>/g, "^$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");

const prd = readFileSync(join(ROOT, "..", "prd", "PRD.md"), "utf8").replace(/\s+/g, " ");
// PRD 4.8 formulas, verbatim.
const FORMULAS = [
  "W_t = shares × close + collar mark (model) + put mark + index fund + exchange fund + cash − loan − overdraft − taxes accrued but unpaid",
  "R_t = (W_t + S_t) / W_{t−1} − 1, where S_t is family spending and the house paid on day t.",
  "mean(R_t − rf_t) / sample stdev(R_t − rf_t) × √252, with rf_t = (1 + DGS1MO_t/100)^(1/252) − 1",
  "the largest peak-to-trough fall of the spending-adjusted wealth index V_t = V_{t−1} × (1 + R_t), V_0 = 1",
  "XIRR (365-day year, Newton with bisection fallback) on: −W_0 on day 0; +S_t on each spending date; +(W_T − 23.8% × unrealized gains on shares, index fund and exchange fund) on the last day",
  "the final XIRR flow plus total spending",
  // 4.7
  "base vol = max(realized vol of daily log returns over the last 60 trading days (or since IPO if fewer, minimum 20 days), 30%) × 1.10"
];
const IRR_ON_PAGE = "XIRR (365-day year, Newton with bisection fallback) on: −(W_0 − 23.8% × N × (close_0 − basis)) on day 0, N the shares held; +S_t on each spending date; +(W_T − terminal tax) on the last day, where terminal tax = 23.8% × max(0, G + U) − tax already paid − tax owed on the ledger";
const RULE_NAMES = ["Lockup", "Trading window", "10b5-1 cooling-off", "One plan at a time", "Rule 144 volume cap (founder)", "Rule 144 reporting gate (founder)", "Single-stock lending", "Collar band", "Exchange fund"];

const browser = await chromium.launch();
const SIZES = [["1280", { width: 1280, height: 800 }], ["375", { width: 375, height: 812 }]];

async function run(label, { page: pageName, fx, finished, size }) {
  const ctx = await browser.newContext({ viewport: size[1], deviceScaleFactor: 1 });
  if (finished) await ctx.addInitScript((v) => { try { localStorage.setItem("ff.finished", JSON.stringify(v)); } catch (e) {} }, finished);
  const p = await ctx.newPage();
  const errors = [];
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!fx && /Failed to load resource/.test(t) && /404/.test(t)) { warnings.push(`${label}: ${t} (optional data file missing)`); return; }
    errors.push(t);
  });
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${base}/tests/pages-harness.html?page=${pageName}${fx ? "&fx=1" : ""}`);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await p.waitForSelector(".ff-page:not([aria-busy])");
  const html = await p.$eval(".ff-page", (e) => e.innerHTML);
  const text = await p.$eval(".ff-page", (e) => e.innerText);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await p.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
  const out = { p, ctx, html, text, errors, overflow };
  return out;
}
async function done(r, label) {
  check(r.errors.length === 0, `${label}: no console errors${r.errors.length ? " -> " + r.errors.join(" | ") : ""}`);
  check(r.overflow <= 0, `${label}: no horizontal page scroll (overflow ${r.overflow}px)`);
  await r.ctx.close();
}

// ---------------------------------------------------------------- fixtures pass (deterministic)
const results = {};
for (const pg of ["method", "data", "ai", "glossary"]) {
  for (const size of SIZES) {
    const label = `${pg}-${size[0]}`;
    const r = await run(label, { page: pg, fx: true, size });
    if (size[0] === "1280") results[pg] = r;
    else await done(r, label);
    if (size[0] === "1280") await done({ ...r, ctx: { close: async () => {} } }, label);
  }
}
// AI page with Card 1 finished
const aiFin = await run("ai-finished-c1-1280", { page: "ai", fx: true, finished: ["c1"], size: SIZES[0] });
await done(aiFin, "ai-finished-c1-1280");
const aiFin375 = await run("ai-finished-c1-375", { page: "ai", fx: true, finished: ["c1"], size: SIZES[1] });
await done(aiFin375, "ai-finished-c1-375");

// ---------------------------------------------------------------- acceptance checks
const method = results.method;
const mp = plain(method.html);
for (const f of FORMULAS) {
  const nf = f.replace(/\s+/g, " ");
  check(prd.includes(nf), `formula is verbatim in PRD: ${nf.slice(0, 60)}...`);
  // The IRR formula is the one PRD formula the build changed on purpose (decisions RUN-5 and the 2026-11-02 terminal-tax fixes): the page states the after-tax version.
  const onPage = nf.startsWith("XIRR (365-day year") ? IRR_ON_PAGE : nf;
  check(mp.includes(onPage), `formula rendered verbatim on Method: ${onPage.slice(0, 60)}...`);
}
check(/<sub>t<\/sub>/.test(method.html) && /<sup>\(1\/252\)<\/sup>/.test(method.html), "math is plain HTML sub/sup (no MathJax)");

// rules table: every rule row has a link; named rules all present; expected sources present
{
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.setContent(`<body>${method.html}</body>`);
  const rows = await p.$$eval("table.pg-rules tbody tr", (trs) => trs.map((tr) => ({ rule: tr.querySelector("th").textContent.trim(), links: [...tr.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")) })));
  // PRD 4.6 names nine rules; the build added one (decision of 2026-11-02: no new hedge under a 10b5-1 plan)
  const EXTRA_RULES = ["No new hedge under a plan"];
  check(rows.length === RULE_NAMES.length + EXTRA_RULES.length, `rules table has ${rows.length} rows (expected ${RULE_NAMES.length + EXTRA_RULES.length})`);
  for (const n of EXTRA_RULES) check(rows.some((r) => r.rule === n && r.links.length > 0), `extra rule row "${n}" exists and has a source link`);
  for (const n of RULE_NAMES) {
    const row = rows.find((r) => r.rule === n);
    check(!!row && row.links.length > 0, `rule row "${n}" exists and has a source link`);
    check(prd.includes(`| ${n} |`), `rule name "${n}" matches PRD 4.6`);
  }
  const all = rows.flatMap((r) => r.links).join(" ");
  for (const u of ["ecfr.gov/current/title-17/section-240.10b5-1", "ecfr.gov/current/title-17/section-230.144", "sec.gov/Archives/edgar/data/1181412/000162828026042639", "finra.org/investors/insights/securities-backed-lines-credit", "sia-submits-comments"])
    check(all.includes(u), `rules link ${u}`);
  const srcs = await p.$$eval("ol.pg-sources li", (l) => l.length);
  check(srcs === 16, `sources list has ${srcs} entries (PRD 16 has 16)`);
  const ladder = await p.$$eval("table.pg-lockup", (t) => t.length);
  check(ladder >= 3, `lockup tables rendered: ${ladder}`);
  check(await p.$eval("#pg-method-credit", (e) => e.textContent.includes("inspired by NGPF's Build Your Stax (buildyourstax.com). Founder's Five's art, copy, palette and rules are original.")), "Stax credit text present");
  check(await p.$eval("aside.pg-street", (e) => /Model \(flat 53\.7% vol\): one-year 85% floor \$114\.51, zero-cost cap \$188\.84\. Listed SPCX options on Oct 30, 2026 imply a cap near \$183\./.test(e.textContent)), "street check reads from spcx-options.json");
  await c.close();
}

// blind safety
const NAMES = Object.values(BLIND_NAMES);
{
  const lockSection = (() => { const m = /id="pg-method-lockups"[\s\S]*?<\/section>/.exec(method.html); return m ? plain(m[0]) : ""; })();
  for (const [name, tk] of NAMES) {
    check(!method.text.includes(name), `Method page does not show blind company name "${name}"`);
    check(!lockSection.includes(tk) && !lockSection.includes(name), `Method lockup tables hide blind ticker/name (${tk})`);
    check(!results.ai.text.includes(name) && !results.ai.text.includes(tk), `AI page hides ${tk} until finished`);
  }
  check(results.ai.text.includes("Finish Card 1 to see its lockup reads"), 'AI page says "Finish Card 1 to see its lockup reads"');
  check(results.ai.text.includes("Finish Card 2 to see its lockup reads"), 'AI page says "Finish Card 2 to see its lockup reads"');
  check(results.ai.text.includes("SpaceX") && /Read A/.test(results.ai.text), "AI page shows SpaceX tranche reads (not blind)");
  check(aiFin.text.includes(NAMES[0][0]) && !aiFin.text.includes(NAMES[1][1]), "AI page reveals only the finished card (Card 1)");
  check(/11 written, 3 rejected, 2 edited/.test(aiFin.text), "AI page shows headline written/rejected/edited when stored");
  check(/numbers checked/.test(aiFin.text), "AI page shows reveal paragraph with its number check for a finished card");
  check(/relative days only/i.test(method.text) && /revealed after you finish the card/i.test(method.text), "Method says blind lockups are relative days and revealed after finishing");
}

// data page
{
  const d = results.data;
  const rows = (d.html.match(/<tr><th scope="row" class="pg-num">/g) || []).length;
  check(rows === 20, `Data page shows the last 20 job runs (${rows})`);
  check(d.html.includes("https://github.com/pjogilvie7/founders-five/actions"), "Data page links the Actions history");
  check(/Prices through Fri Oct 30, 2026 close/.test(d.text) && /98/.test(d.text), "Data page shows data-as-of and the SpaceX day counter");
  check(/data\/cards\/c1\.json/.test(d.html) && /data\/market\.json/.test(d.html), "Data page links raw JSON files");
  check(/Passing/.test(d.text), "Data page shows test status");
  check(/FRED returned HTTP 503/.test(d.text), "Data page shows a run error");
}

// glossary
{
  const g = results.glossary;
  const n = (g.html.match(/<dt>/g) || []).length;
  check(n >= 15, `Glossary has ${n} terms`);
}

// copy rules, all pages
for (const [pg, r] of Object.entries(results)) {
  check(!/recommend/i.test(r.text), `${pg}: no "recommend" wording`);
  check(!r.text.includes("!"), `${pg}: no exclamation marks`);
  check(r.text.includes("A historical replay for education. Not investment, tax or legal advice, and not a view on any stock today."), `${pg}: disclaimer line present`);
}

// tooltip behaviour (keyboard focus, Escape)
{
  const c = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${base}/tests/pages-harness.html?page=glossary&fx=1`);
  await p.waitForFunction(() => window.__ready === true);
  await p.evaluate(async () => {
    const { term } = await import("../ui/glossary.js");
    const d = document.createElement("p");
    d.id = "tt";
    d.style.cssText = "padding:8px;text-align:right";
    d.innerHTML = `Right edge: ${term("lockup")} and ${term("10b5-1")} and ${term("Sharpe", "the Sharpe ratio")}`;
    document.body.prepend(d);
  });
  await p.keyboard.press("Tab");
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.className);
  check(/ff-term/.test(focused || ""), "term() span is keyboard focusable");
  const vis = await p.evaluate(() => getComputedStyle(document.activeElement.querySelector(".ff-tip")).display);
  check(vis === "block", "tooltip shows on keyboard focus");
  const inView = await p.evaluate(() => { const r = document.activeElement.querySelector(".ff-tip").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  check(inView, "tooltip stays inside a 375 px viewport");
  await p.keyboard.press("Escape");
  const vis2 = await p.evaluate(() => getComputedStyle(document.activeElement.querySelector(".ff-tip")).display);
  check(vis2 === "none", "Escape dismisses the tooltip");
  await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
  await p.screenshot({ path: join(OUT, "tooltip-375.png") });
  check(errs.length === 0, "tooltip test: no console errors");
  // in-page anchors scroll without touching the hash (the shell may route by hash)
  await p.goto(`${base}/tests/pages-harness.html?page=method&fx=1`);
  await p.waitForFunction(() => window.__ready === true);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.click(".pg-toc a >> nth=3");
  await p.waitForTimeout(600);
  const hash = await p.evaluate(() => location.hash);
  const top = await p.evaluate(() => Math.round(document.querySelector("#pg-method-rules").getBoundingClientRect().top));
  check(hash === "" && top < 200, `TOC link scrolls to its section and leaves the URL hash alone (hash "${hash}", top ${top}px)`);
  await c.close();
}

// ---------------------------------------------------------------- real data pass, if data/ is populated
if (existsSync(join(ROOT, "data", "cards", "index.json"))) {
  console.log("-- real data present: rendering from data/");
  const idx = JSON.parse(readFileSync(join(ROOT, "data", "cards", "index.json"), "utf8"));
  const blindSecrets = [];
  for (const e of idx.filter((x) => x.blind)) {
    const f = join(ROOT, "data", "cards", `${e.id}.json`);
    if (existsSync(f)) { const c = JSON.parse(readFileSync(f, "utf8")); blindSecrets.push([c.name, c.ticker]); }
  }
  for (const pg of ["method", "data", "ai", "glossary"]) {
    for (const size of SIZES) {
      const label = `real-${pg}-${size[0]}`;
      const r = await run(label, { page: pg, fx: false, size });
      if (pg === "method" || pg === "ai") {
        const lock = (() => { const m = /id="pg-method-lockups"[\s\S]*?<\/section>/.exec(r.html); return m ? plain(m[0]) : r.text; })();
        for (const [n, t] of blindSecrets) {
          if (pg === "method") check(!r.text.includes(n) || n.length < 4, `real Method hides blind name ${t}`);
          if (pg === "method") check(!lock.includes(`(${t})`) && !lock.includes(n), `real Method lockups hide blind ${t}`);
          if (pg === "ai") check(!r.text.includes(n), `real AI page hides blind name ${t} until finished`);
        }
      }
      await done(r, label);
    }
  }
}

await browser.close();
if (server) server.kill();
for (const w of warnings) console.log("WARN", w);
console.log(failures.length ? `\n${failures.length} FAILED` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);

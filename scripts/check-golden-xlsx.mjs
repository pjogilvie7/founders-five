// Computes the golden-test values with the real engine (engine/*.js) and cross-checks tests/golden.xlsx.
//
//   node scripts/check-golden-xlsx.mjs            write tests/golden-js.json (the Python builder reads it)
//   node scripts/check-golden-xlsx.mjs --verify   also read the cached values of the recalculated workbook's
//                                                 Summary sheet and compare them to the JS values; exit 1 on any miss
//
// Run order: node scripts/check-golden-xlsx.mjs && research/venv/bin/python scripts/make-golden-xlsx.py
//            node scripts/check-golden-xlsx.mjs --verify
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bsPrice, zeroCostCall, collarMark } from "../engine/pricing.js";
import { sharpe, maxDrawdown, xirr } from "../engine/metrics.js";
import { saleTax } from "../engine/tax.js";
import { maxAdvance, ltv, callCure, fallToCall, netPerShare, forcedSaleShares } from "../engine/loan.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = path.join(root, "tests", "golden-js.json");
const XLSX_PATH = path.join(root, "tests", "golden.xlsx");

// ---- inputs (the same numbers the workbook uses)
const S = 134.72, K = 114.512, T = 1, r = 0.04, vol = 0.537;
const z = zeroCostCall({ S, Kp: K, T, r, volPut: vol, volCall: vol });
const loanC = 100_000_000, loanBal = maxAdvance(loanC);
const P2 = 70, pledged = 1_000_000, basis2 = 1, costRate = 0.0025, taxRate = 0.238;

export const values = {
  "1a": bsPrice({ type: "put", S, K, T, r, vol }),
  "1b": z.Kc,
  "1c": collarMark({ S, Kp: K, Kc: z.Kc, T, r, volPut: vol, volCall: vol }),
  "3": xirr([{ d: "2020-01-01", amount: -100 }, { d: "2021-12-31", amount: 121 }]),
  "4": sharpe([0.01, -0.005, 0.02, 0, -0.01], 0),
  "5": maxDrawdown([100, 120, 90, 95, 130, 104]).pct,
  "8a": fallToCall(),
  "8b": ltv(loanBal, loanC * (1 - fallToCall())),
  "8c": callCure(loanBal, loanC * (1 - 0.30)),
  "8d": forcedSaleShares(loanBal, P2, pledged, costRate, taxRate, basis2),
  "8e": netPerShare(P2, costRate, taxRate, basis2),
  "9": saleTax({ shares: 100000, price: 150, basis: 1.35 }).tax,
};

writeFileSync(JSON_PATH, JSON.stringify(values, null, 2) + "\n");
console.log(`wrote ${path.relative(root, JSON_PATH)}`);
for (const [k, v] of Object.entries(values)) console.log(`  ${k.padEnd(3)} ${v}`);

if (!process.argv.includes("--verify")) process.exit(0);

// ---- verify: read cached values out of the recalculated xlsx (no libraries: unzip + regex)
if (!existsSync(XLSX_PATH)) { console.error("tests/golden.xlsx missing"); process.exit(1); }
const unzip = (p) => execFileSync("unzip", ["-p", XLSX_PATH, p], { encoding: "utf8", maxBuffer: 1 << 26 });
const wb = unzip("xl/workbook.xml");
const rels = unzip("xl/_rels/workbook.xml.rels");
const sheetTag = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => /name="Summary"/.test(t));
const rid = sheetTag.match(/r:id="([^"]+)"/)[1];
const relTag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
const target = relTag.match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, "");
const sheetXml = unzip(`xl/${target}`);
let sst = [];
try { sst = [...unzip("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")); } catch {}
const cells = {};
for (const m of sheetXml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
  const [, ref, attrs, inner = ""] = m;
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  if (!v) continue;
  const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
  cells[ref] = t === "s" ? sst[+v[1]] : t === "str" || t === "e" || t === "b" ? v[1] : parseFloat(v[1]);
}
// Summary layout: row 1 title, row 4 header, rows 5.. = A id, B quantity, C sheet value, D JS value, ..., I PASS/FAIL
let bad = 0, rows = 0;
for (let row = 5; row < 60; row++) {
  const id = cells[`A${row}`];
  if (id == null) continue;
  const key = String(id);
  if (!(key in values)) continue;
  rows++;
  const sheetVal = cells[`C${row}`], flag = cells[`I${row}`];
  const jsVal = values[key];
  const tol = key === "8d" ? 0 : Math.max(1e-6, Math.abs(jsVal) * 1e-9);
  const loose = { "1b": 0.01, "1c": 0.01, "3": 1e-6 }[key] ?? tol;
  const ok = typeof sheetVal === "number" && Math.abs(sheetVal - jsVal) <= loose && flag === "PASS";
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${key.padEnd(3)} sheet ${sheetVal}  js ${jsVal}  cell says ${flag}`);
}
if (rows !== Object.keys(values).length) { console.error(`found ${rows} of ${Object.keys(values).length} summary rows`); bad++; }
console.log(bad ? `${bad} FAILED` : "all summary rows PASS");
process.exit(bad ? 1 : 0);

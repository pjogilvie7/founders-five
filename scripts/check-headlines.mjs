#!/usr/bin/env node
// T8 checker for blind-card headlines and reveal paragraphs.
//
//   node scripts/check-headlines.mjs            check c1..c8, update nameFilter / numbersChecked, exit 1 on any failure
//   node scripts/check-headlines.mjs c2 c5      only those cards
//   node scripts/check-headlines.mjs --no-write check without touching headlines.json / reveal.json
//
// 1. Name filter. Per card, builds a banned-term list from data/src/{id}/base.json (company name, every capitalised
//    word in it, ticker) and from the 424B4 text in research/424b4/{id}.txt (executive and director names, headquarters
//    city, product and brand names), merges the hand-curated extras in research/headlines/{id}-banned-extra.json, and
//    saves the result to research/headlines/{id}-banned.json. A headline fails if it contains a banned term
//    (case-insensitive, word boundary, optional plural/possessive suffix).
// 2. Headline shape: exactly 8, one per each of the card's 8 largest absolute one-day adjClose moves, at most 12 words,
//    source is "market" or an SEC EDGAR URL, no exclamation marks, no advice words.
// 3. Reveal numbers: every number in the reveal text must appear in base.json (offer price, a close, a date) or be a
//    rounding of a value derived from base.json (whole dollars or two decimals of the offer, first, peak, low or last close;
//    whole or one-decimal percent returns between those values; dates that exist in the price series or ipo block). Sets numbersChecked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CARD_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
const SRC = (id, f) => path.join(ROOT, 'data/src', id, f);
const RES = (f) => path.join(ROOT, 'research/headlines', f);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LEGAL_SUFFIX = new Set(['inc', 'corp', 'co', 'company', 'ltd', 'limited', 'llc', 'plc', 'the', 'and', 'of']);
// Capitalised tokens that are never brand names (filing furniture, months, generic nouns). Extraction skips these.
const STOP = new Set(`class company table contents plan mr ms mrs dr inc total series section rule note act agreement we the this that our in as of and or for to by with from at on an a it its if these those such other any all each
january february march april may june july august september october november december
united states delaware nasdaq nyse gaap sec irs rsu rsus esop espp libor ifrs usd rmb us u.s. non-gaap non-u.s. offering shares share stock common stockholders stockholder board directors director officer officers executive chief
financial statements consolidated notes risk factors business management results operations liquidity capital resources principal selling underwriters underwriter underwriting prospectus summary use proceeds dividend policy dilution
revenue income net loss cash flow adjusted ebitda year years quarter quarters months month ended december page break see
first second third fourth q1 q2 q3 q4 fy cfo ceo cto coo ipo adr ads adss ordinary cayman islands`.split(/\s+/));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function termRegex(term) {
  const t = escapeRe(term.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![A-Za-z0-9])${t}(?:'s|’s|s)?(?![A-Za-z0-9])`, 'i');
}

const norm = (t) => t.replace(/\s+/g, ' ');

// ---- banned-term extraction ------------------------------------------------------------------------------------------
function fromBase(base) {
  const name = base.name;
  const words = name.split(/[\s,]+/).map((w) => w.replace(/[.,]+$/g, '')).filter((w) => /^[A-Z]/.test(w) && !LEGAL_SUFFIX.has(w.toLowerCase()));
  const core = name.replace(/[,.]?\s*(Inc|Corp|Co|Ltd|Limited|LLC|plc)\.?$/i, '').trim();
  return { name, core, ticker: base.ticker, words };
}

function fromFiling(text) {
  const t = norm(text);
  const lowerAll = new Map();
  for (const m of t.matchAll(/(?<![A-Za-z])([a-z][a-z'-]{2,})\b/g)) lowerAll.set(m[1], (lowerAll.get(m[1]) || 0) + 1);
  // A real name is almost never written in lower case in the filing; "Market", "Bank", "Call" are common words.
  const common = (w) => (lowerAll.get(w.toLowerCase()) || 0) >= 3;
  const people = new Set();
  const addName = (n) => {
    const parts = n.replace(/[.,]/g, ' ').split(/\s+/).filter((p) => p.length > 2 && /^[A-Z]/.test(p));
    if (parts.length >= 2) for (const p of parts) if (!STOP.has(p.toLowerCase()) && !common(p)) people.add(p);
  };
  // "Mr. Chesky", "Ms. Woodworth": surname after a title, kept when it appears at least twice.
  const sur = new Map();
  for (const m of t.matchAll(/\b(?:Mr|Ms|Mrs|Dr)\.\s+([A-Z][A-Za-z'’-]{2,})/g)) sur.set(m[1], (sur.get(m[1]) || 0) + 1);
  for (const [s, c] of sur) if (c >= 2 && !STOP.has(s.toLowerCase()) && !common(s)) people.add(s);
  // "Brian Chesky is one of our co-founders", "Jill Woodworth has served as our", "Chesky co-founded"
  const verbs = '(?:is|are|has|have|was|co-founded|founded|joined|serves|currently serves|became|were|will)';
  const nameRe = new RegExp(`\\b([A-Z][a-z]+(?:\\s[A-Z]\\.)?(?:\\s[A-Z][A-Za-z'’-]+){1,2})\\s+${verbs}\\s+(?:one of our|our|a |the |an |currently|also|been|served|joined|has|as )`, 'g');
  for (const m of t.matchAll(nameRe)) addName(m[1]);
  // "Name 45 Chief Executive Officer" style tables
  for (const m of t.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z]\.)?(?:\s[A-Z][A-Za-z'’-]+){1,2})\s+\d{2}\s+(?:Co-|Chief|President|Chair|Director|Executive|Head|Senior|General|Founder|Lead|Independent|Vice)/g)) addName(m[1]);

  // Headquarters: "headquartered in San Francisco, California", "principal executive offices are located at ... City, State 12345"
  const hq = new Set();
  for (const m of t.matchAll(/headquarter(?:s|ed)[^.]{0,60}?\b(?:in|at)\s+((?:[A-Z][a-z]+)(?:[ ,]+[A-Z][a-z]+){0,2})/g)) m[1].split(/[ ,]+/).forEach((w) => w.length > 3 && !STOP.has(w.toLowerCase()) && !common(w) && hq.add(w));
  for (const m of t.matchAll(/executive offices[^.]{0,80}?(?:located|is|are)[^.]{0,40}?\b(?:at|in)\s+[^.]{0,120}?,\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+\d{4,6}/g)) {
    hq.add(m[1]);
    hq.add(m[2]);
  }

  // Brands and products: capitalised single words used mid-sentence at least 10 times that are almost never written lower case.
  const lower = new Map();
  for (const m of t.matchAll(/(?<![A-Z])\b([a-z][a-z'-]{3,})\b/g)) lower.set(m[1], (lower.get(m[1]) || 0) + 1);
  const cap = new Map();
  for (const m of t.matchAll(/(?<=[a-z,;:)] )([A-Z][A-Za-z0-9]{3,})\b/g)) cap.set(m[1], (cap.get(m[1]) || 0) + 1);
  const brands = new Set();
  for (const [w, c] of cap) {
    const lc = lower.get(w.toLowerCase()) || 0;
    if (c >= 10 && lc <= c * 0.1 && !common(w) && !STOP.has(w.toLowerCase()) && !/^[A-Z0-9]+$/.test(w) && !MONTHS.includes(w)) brands.add(w);
  }
  return { people: [...people].sort(), hq: [...hq].sort(), brands: [...brands].sort() };
}

export function buildBanned(id, { write = true } = {}) {
  const base = readJson(SRC(id, 'base.json'));
  const filing = fs.readFileSync(path.join(ROOT, 'research/424b4', `${id}.txt`), 'utf8');
  const b = fromBase(base);
  const f = fromFiling(filing);
  const extraPath = RES(`${id}-banned-extra.json`);
  const manual = fs.existsSync(extraPath) ? readJson(extraPath) : [];
  const all = [...new Set([b.name, b.core, b.ticker, ...b.words, ...f.people, ...f.hq, ...f.brands, ...manual].map((s) => s.trim()).filter((s) => s.length >= 2))];
  const out = { id, name: b.name, ticker: b.ticker, nameWords: b.words, people: f.people, headquarters: f.hq, brandsFromFiling: f.brands, manual, all };
  if (write) fs.writeFileSync(RES(`${id}-banned.json`), JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---- headline checks --------------------------------------------------------------------------------------------------
export function topMoves(prices, n = 8) {
  const mv = [];
  for (let k = 1; k < prices.length; k++) mv.push({ d: prices[k][0], r: Math.log(prices[k][2] / prices[k - 1][2]) });
  mv.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return mv.slice(0, n).map((m) => m.d).sort();
}

const ADVICE = /\b(recommend\w*|advice|advise\w*|you should|should buy|should sell)\b/i;
const SOURCE_OK = /^(market|https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/[\w.\-]+)$/;

export function checkHeadlines(id, banned) {
  const base = readJson(SRC(id, 'base.json'));
  const hs = readJson(SRC(id, 'headlines.json'));
  const errors = [];
  const results = [];
  if (!Array.isArray(hs) || hs.length !== 8) errors.push(`${id}: expected 8 headlines, found ${hs?.length}`);
  const want = topMoves(base.prices);
  const got = hs.map((h) => h.d);
  if (JSON.stringify(want) !== JSON.stringify(got)) errors.push(`${id}: headline dates ${got.join(',')} are not the 8 largest moves ${want.join(',')}`);
  const res = banned.all.map((t) => [t, termRegex(t)]);
  for (const h of hs) {
    const hits = res.filter(([, re]) => re.test(h.text)).map(([t]) => t);
    const words = h.text.trim().split(/\s+/).length;
    const problems = [];
    if (hits.length) problems.push(`banned term(s): ${hits.join(', ')}`);
    if (words > 12) problems.push(`${words} words (max 12)`);
    if (/!/.test(h.text)) problems.push('exclamation mark');
    if (ADVICE.test(h.text)) problems.push('advice wording');
    if (!SOURCE_OK.test(h.source)) problems.push(`bad source ${h.source}`);
    if (h.d < base.prices[0][0] || h.d > base.prices[base.prices.length - 1][0]) problems.push('date outside window');
    results.push({ d: h.d, ok: problems.length === 0, problems });
    for (const p of problems) errors.push(`${id} ${h.d}: ${p} in "${h.text}"`);
  }
  return { errors, results, headlines: hs };
}

// ---- reveal number check ----------------------------------------------------------------------------------------------
export function derivedNumbers(base) {
  const p = base.prices;
  const offer = base.ipo.offerPrice;
  let peak = p[0], low = p[0];
  for (const r of p) { if (r[1] > peak[1]) peak = r; if (r[1] < low[1]) low = r; }
  const key = { offer, first: p[0][1], peak: peak[1], low: low[1], last: p[p.length - 1][1] };
  const dollars = new Set();
  for (const v of Object.values(key)) dollars.add(Math.round(v));
  // Exact (two-decimal) dollar amounts are limited to the five key values and the raw IPO price; any other close is refused.
  const exact = new Set([...Object.values(key), ...(base.ipo.offerPriceRaw ? [base.ipo.offerPriceRaw] : [])]);
  const pcts = new Set();
  const vals = Object.values(key);
  for (const a of vals) for (const b of vals) {
    if (a === b) continue;
    const pct = (b / a - 1) * 100;
    for (const x of [pct, Math.abs(pct)]) { pcts.add(x.toFixed(1)); pcts.add(String(Math.round(x))); }
  }
  const dates = new Set([base.ipo.pricingDate, base.ipo.firstTrade, ...p.map((r) => r[0])]);
  const years = new Set([...dates].map((d) => d.slice(0, 4)));
  return { exact, dollars, pcts, dates, years, key };
}

export function checkReveal(id) {
  const base = readJson(SRC(id, 'base.json'));
  const rv = readJson(SRC(id, 'reveal.json'));
  return { ...checkRevealText(id, base, rv.text), rv };
}

export function checkRevealText(id, base, text) {
  const D = derivedNumbers(base);
  const errors = [];
  const words = text.trim().split(/\s+/).length;
  if (words < 60 || words > 100) errors.push(`${id} reveal: ${words} words (want about 80)`);
  if (/!/.test(text)) errors.push(`${id} reveal: exclamation mark`);
  if (ADVICE.test(text)) errors.push(`${id} reveal: advice wording`);
  if (base.ipo.splitFactor && !/split-adjusted/i.test(text)) errors.push(`${id} reveal: card has a split, text must say split-adjusted`);
  if (!text.includes(base.name.split(/[\s,]+/)[0])) errors.push(`${id} reveal: does not name the company`);

  // dates first (Month D, YYYY), then Month YYYY, then remove them from the text
  let rest = text;
  rest = rest.replace(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{1,2}),\\s+(\\d{4})`, 'g'), (m, mo, d, y) => {
    const iso = `${y}-${String(MONTHS.indexOf(mo) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!D.dates.has(iso)) errors.push(`${id} reveal: date "${m}" (${iso}) is not in base.json`);
    return ' ';
  });
  rest = rest.replace(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{4})`, 'g'), (m, mo, y) => {
    if (!D.years.has(y)) errors.push(`${id} reveal: "${m}" outside the card window`);
    return ' ';
  });
  for (const m of rest.matchAll(/(\$)?(\d[\d,]*(?:\.\d+)?)(%)?/g)) {
    const [raw, dollar, num, pct] = m;
    const x = Number(num.replace(/,/g, ''));
    let ok = false;
    if (dollar) {
      if (num.includes('.')) ok = [...D.exact].some((v) => Math.abs(v - x) < 0.005);
      else ok = D.dollars.has(x) || D.exact.has(x);
    } else if (pct) {
      ok = D.pcts.has(num);
    } else if (/^\d{4}$/.test(num)) {
      ok = D.years.has(num);
    }
    if (!ok) errors.push(`${id} reveal: number "${raw}" is not in base.json or derived from it`);
  }
  return { errors };
}

// ---- main ------------------------------------------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const write = !args.includes('--no-write');
  const ids = args.filter((a) => /^c\d+$/.test(a));
  const cards = ids.length ? ids : CARD_IDS;
  let failed = 0;
  for (const id of cards) {
    const banned = buildBanned(id);
    const h = checkHeadlines(id, banned);
    const r = checkReveal(id);
    const errs = [...h.errors, ...r.errors];
    if (write) {
      const updated = h.headlines.map((x) => ({ ...x, nameFilter: h.results.find((y) => y.d === x.d)?.ok ? 'pass' : 'fail' }));
      fs.writeFileSync(SRC(id, 'headlines.json'), JSON.stringify(updated, null, 2) + '\n');
      fs.writeFileSync(SRC(id, 'reveal.json'), JSON.stringify({ ...r.rv, numbersChecked: r.errors.length === 0 }, null, 2) + '\n');
    }
    const words = r.rv.text.trim().split(/\s+/).length;
    console.log(`${errs.length ? 'FAIL' : 'ok  '} ${id} ${banned.ticker.padEnd(5)} banned terms ${String(banned.all.length).padStart(3)}  headlines ${h.headlines.length}  reveal ${words} words`);
    for (const e of errs) console.log(`       ${e}`);
    failed += errs.length;
  }
  if (failed) {
    console.log(`\n${failed} problem(s)`);
    process.exit(1);
  }
  console.log('\nall cards pass');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

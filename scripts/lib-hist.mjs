// Shared helpers for the blind-card universe: Yahoo daily history, SEC EDGAR, text cleanup.
// Plain ES module, Node 20+, no dependencies. Used by universe.mjs and fetch-card.mjs.

export const SEC_UA = 'Founders Five research pjogilvie7@gmail.com';
const YAHOO_UA = 'Mozilla/5.0'; // Yahoo returns 429 to full browser UA strings from scripts; the bare token works

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- SEC (<= 2 requests a second)
let lastSec = 0;
export async function secFetch(url, { asJson = false, retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = lastSec + 600 - Date.now();
    if (wait > 0) await sleep(wait);
    lastSec = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`SEC ${res.status} ${url}`);
    return asJson ? res.json() : res.text();
  }
  throw new Error(`SEC retries exhausted ${url}`);
}

const pad10 = (cik) => String(cik).padStart(10, '0');

/** All filings of a company as columnar rows merged across data.sec.gov's extra files. */
export async function getFilings(cik) {
  const main = await secFetch(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`, { asJson: true });
  const cols = [main.filings.recent];
  for (const f of main.filings.files || []) {
    cols.push(await secFetch(`https://data.sec.gov/submissions/${f.name}`, { asJson: true }));
  }
  const out = [];
  for (const c of cols) {
    for (let i = 0; i < c.accessionNumber.length; i++) {
      out.push({
        accession: c.accessionNumber[i],
        form: c.form[i],
        filingDate: c.filingDate[i],
        reportDate: c.reportDate?.[i] || null,
        items: c.items?.[i] || '',
        primaryDocument: c.primaryDocument[i],
      });
    }
  }
  out.sort((a, b) => (a.filingDate < b.filingDate ? -1 : a.filingDate > b.filingDate ? 1 : 0));
  return { name: main.name, cik: String(Number(cik)), tickers: main.tickers, exchanges: main.exchanges, filings: out };
}

export function filingUrl(cik, f) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession.replace(/-/g, '')}/${f.primaryDocument}`;
}

/** Pick the IPO 424B4: the 424B4 filed closest to the first trade date, from 3 days before to 5 days after. */
export function pickIpo424b4(filings, firstTrade) {
  const t0 = Date.parse(firstTrade);
  const cands = filings
    .filter((f) => f.form === '424B4')
    .map((f) => ({ f, dd: (Date.parse(f.filingDate) - t0) / 86400000 }))
    .filter((x) => x.dd >= -3 && x.dd <= 5)
    .sort((a, b) => Math.abs(a.dd) - Math.abs(b.dd));
  return cands.length ? cands[0].f : null;
}

// ---------------------------------------------------------------- HTML to text
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", mdash: '-', ndash: '-', hellip: '...', bull: '*', reg: '(R)', trade: '(TM)', copy: '(C)', sect: 'Section ', para: 'Para ', deg: ' deg', middot: '.', times: 'x', eacute: 'e', egrave: 'e', uuml: 'u', ouml: 'o', auml: 'a', aacute: 'a', iacute: 'i', oacute: 'o', uacute: 'u', ntilde: 'n', ccedil: 'c', euro: 'EUR', pound: 'GBP' };
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}

/**
 * Strip an EDGAR HTML prospectus to plain text. Block tags become line breaks so page-number
 * footers stay on their own line; explicit page breaks become "=== PAGE BREAK ===" markers.
 */
export function htmlToText(html) {
  let h = html;
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
  // page breaks: <hr>, or any tag whose style forces a break
  h = h.replace(/<hr[^>]*>/gi, '\n=== PAGE BREAK ===\n');
  h = h.replace(/<([a-z0-9]+)[^>]*style\s*=\s*["'][^"']*(?:page-break-(?:after|before)|break-(?:after|before))\s*:\s*(?:always|page)[^"']*["'][^>]*>/gi, '\n=== PAGE BREAK ===\n<$1>');
  h = h.replace(/<\/(td|th)>/gi, ' \t ');
  h = h.replace(/<\/(p|div|tr|li|h[1-6]|table|center|pre)>/gi, '\n');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<[^>]+>/g, '');
  h = decode(h);
  h = h.replace(/[ \t ]+/g, ' ');
  h = h.replace(/ ?\n ?/g, '\n');
  h = h.replace(/\n{3,}/g, '\n\n');
  // collapse runs of page-break markers (and blank lines between them) into one
  const out = [];
  for (const line of h.split('\n')) {
    if (line === '=== PAGE BREAK ===') {
      let k = out.length - 1;
      while (k >= 0 && out[k] === '') k--;
      if (k >= 0 && out[k] === line) { out.length = k + 1; continue; }
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------------------------------------------------------------- Yahoo
const nyDate = (() => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return (ts) => f.format(new Date(ts * 1000));
})();

/** Full daily history. Returns {rows:[[d, close, adjClose, volume]], splits:[{d, num, den}], meta}. */
export async function yahooHistory(ticker, { period1 = 1514764800 /* 2018-01-01 */, period2 = Math.floor(Date.now() / 1000) + 86400 } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } });
    if (res.status === 404) return { rows: [], splits: [], meta: null, error: '404' };
    if (!res.ok) { last = res.status; await sleep(1500 * (attempt + 1)); continue; }
    const j = await res.json();
    const r = j.chart?.result?.[0];
    if (!r || !r.timestamp) return { rows: [], splits: [], meta: r?.meta || null, error: j.chart?.error?.description || 'no data' };
    const q = r.indicators.quote[0];
    const adj = r.indicators.adjclose?.[0]?.adjclose || [];
    const rows = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.close[i] == null) continue;
      rows.push([nyDate(r.timestamp[i]), q.close[i], adj[i] ?? q.close[i], q.volume[i] ?? 0]);
    }
    // de-duplicate dates (Yahoo occasionally repeats the last day), keep the later row
    const seen = new Map();
    for (const row of rows) seen.set(row[0], row);
    const clean = [...seen.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const splits = Object.values(r.events?.splits || {}).map((s) => ({ d: nyDate(s.date), num: s.numerator, den: s.denominator })).sort((a, b) => (a.d < b.d ? -1 : 1));
    return { rows: clean, splits, meta: r.meta };
  }
  throw new Error(`Yahoo ${last} ${ticker}`);
}

// ---------------------------------------------------------------- deterministic draw
/** FNV-1a 32-bit hash of the UTF-8 bytes of a string. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(str, 'utf8')) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32 PRNG: returns a function giving floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sort alphabetically, then Fisher-Yates from the end with j = floor(rand()*(i+1)). */
export function drawOrder(tickers, seedString) {
  const list = [...tickers].sort();
  const rand = mulberry32(fnv1a32(seedString));
  for (let i = list.length - 1; i >= 1; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

#!/usr/bin/env node
// Builds data/src/{id}/base.json and research/424b4/{id}.txt for a drawn blind card.
//   node scripts/fetch-card.mjs --all            the first ten of drawOrder -> c1..c10
//   node scripts/fetch-card.mjs --ticker ABNB    one card (id = c{position in drawOrder})
// Network: Yahoo chart API (prices), SEC EDGAR (UA "Founders Five research pjogilvie7@gmail.com", <= 2 requests/s).
// Output follows engine/types.md section 1 minus lockup, headlines and reveal.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadUniverse, recompute } from './universe.mjs';
import { getFilings, filingUrl, secFetch, htmlToText, yahooHistory } from './lib-hist.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOW_ROWS = 1261; // first trade .. trading day 1,260

// Hand-read from each 424B4 "The Offering" summary (total shares of all classes outstanding after the offering,
// as printed) and the industry label. sharesText is the exact string searched for to find the page cite.
// adsRatio: ordinary shares per ADS (price is quoted per ADS, so sharesOutPost is stored in ADS-equivalents).
const INFO = {
  ABNB: { industry: 'travel', sharesOutPost: 597448251, sharesText: '597,448,251' },
  PTON: { industry: 'consumer', sharesOutPost: 279390508, sharesText: '279,390,508', note: 'Prospectus figure is after the offering and the concurrent private placement of 3,448,275 shares.' },
  BEKE: { industry: 'other', sharesOutPost: 3382438135, sharesText: '2,497,136,855', adsRatio: 3, note: '2,497,136,855 class A + 885,301,280 class B ordinary shares; price is per ADS (1 ADS = 3 class A ordinary shares), so sharesOutPost is in ADS-equivalents.' },
  PINS: { industry: 'consumer', sharesOutPost: 529372774, sharesText: '529,372,774' },
  AVTR: { industry: 'health', sharesOutPost: 534293808, sharesText: '534,293,808', note: 'Four Item 2.02 8-Ks are preliminary-revenue updates, not quarterly results: 2020-07-07, 2020-10-23, 2021-01-11, 2021-10-12. Lockup readers: do not count them as an earnings release for an afterEarnings trigger.' },
  MQ: { industry: 'fintech', sharesOutPost: 530245901, sharesText: '530,245,901' },
  WMG: { industry: 'consumer', sharesOutPost: 510000000, sharesText: '510,000,000' },
  LYFT: { industry: 'mobility', sharesOutPost: 285877300, sharesText: '285,877,300' },
  OSCR: { industry: 'health', sharesOutPost: 203142236, sharesText: '203,142,236' },
  REYN: { industry: 'consumer', sharesOutPost: 202625000, sharesText: '202,625,000' },
};

const round = (x, dp = 6) => Math.round(x * 10 ** dp) / 10 ** dp;
const cikFromUrl = (u) => Number(u.match(/\/data\/(\d+)\//)[1]);

/** printed page number of the page containing `needle`: last bare-number line before the next page break */
export function pageOf(text, needle) {
  const idx = text.indexOf(needle, 20000); // skip table-of-contents area
  if (idx < 0) return null;
  const end = text.indexOf('=== PAGE BREAK ===', idx);
  const chunk = text.slice(idx, end < 0 ? idx + 20000 : end);
  const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let k = lines.length - 1; k >= 0; k--) {
    if (/^\d{1,3}$/.test(lines[k])) return Number(lines[k]);
    if (/^Table of Contents$/i.test(lines[k]) || lines[k].length > 80) break;
  }
  // footer may sit on the other side of the marker; look at the first lines of the next chunk
  const after = text.slice(end + 18, end + 400).split('\n').map((l) => l.trim()).filter(Boolean);
  if (after.length && /^\d{1,3}$/.test(after[0])) return Number(after[0]);
  return null;
}

export async function earningsFromSixK(cik, filings, from, to) {
  // Foreign private issuers file 6-K, not 8-K. Keep 6-Ks whose press-release exhibit (99.1) headline announces
  // quarterly or annual results; skip meeting results, dividend and other releases.
  const out = [];
  const cands = filings.filter((f) => f.form === '6-K' && f.filingDate >= from && f.filingDate <= to);
  for (const f of cands) {
    const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accession.replace(/-/g, '')}`;
    let idx;
    try { idx = await secFetch(`${base}/index.json`, { asJson: true }); } catch { continue; }
    const docs = (idx.directory?.item || []).map((i) => i.name).filter((n) => /\.htm$/i.test(n) && !/index/i.test(n));
    const ex = docs.find((n) => /(ex-?|_)?99(d|[-_.])?1\.htm$/i.test(n));
    if (!ex) continue;
    let head;
    try { head = htmlToText(await secFetch(`${base}/${ex}`)).replace(/\s+/g, ' ').slice(0, 1500); } catch { continue; }
    // dual-listed issuers open with a Hong Kong exchange disclaimer, so search the first 1,500 characters
    const m = head.match(/(?:Announces|Reports|Announce|Report)\s+(?:Unaudited\s+)?(?:(?:First|Second|Third|Fourth)\s+Quarter|(?:Fiscal|Full)\s+Year|Annual\s+Results|Q[1-4])[^.]{0,120}/i);
    if (m && !/General Meeting/i.test(m[0])) {
      out.push({ d: f.filingDate, url: `${base}/${ex}`, headline: m[0].slice(0, 160) });
    }
  }
  return out;
}

export async function buildCard(ticker, id, u) {
  const row = u.included.find((r) => r.ticker === ticker);
  if (!row) throw new Error(`${ticker} is not in the universe`);
  const info = INFO[ticker];
  if (!info) throw new Error(`no INFO entry for ${ticker}`);
  const cik = cikFromUrl(row.url424b4);

  // 1. prices
  const hist = await yahooHistory(ticker);
  if (hist.rows.length < WINDOW_ROWS) throw new Error(`${ticker}: only ${hist.rows.length} Yahoo rows`);
  if (hist.rows[0][0] !== row.firstTrade) throw new Error(`${ticker}: Yahoo first row ${hist.rows[0][0]} != firstTrade ${row.firstTrade}`);
  const win = hist.rows.slice(0, WINDOW_ROWS);
  const prices = win.map(([d, c, a, v]) => [d, round(c), round(a), v]);
  const lastDay = prices[WINDOW_ROWS - 1][0];

  // 2. splits after the IPO (Yahoo history is already split-adjusted; the offer and share counts are not)
  const splits = hist.splits.filter((s) => s.d > row.firstTrade);
  const splitFactor = splits.reduce((f, s) => f * (s.num / s.den), 1); // shares multiplier; < 1 for a reverse split
  const adsRatio = info.adsRatio || 1;
  const sharesAds = info.sharesOutPost / adsRatio;
  const ipo = {
    offerPrice: round(row.offerPrice / splitFactor, 6),
    pricingDate: row.pricingDate,
    firstTrade: row.firstTrade,
    proceedsUSD: row.proceedsUSD,
    sharesOutPost: Math.round(sharesAds * splitFactor),
    source: { url: row.url424b4, page: null },
  };
  if (splits.length) {
    ipo.splitFactor = round(splitFactor, 10);
    ipo.offerPriceRaw = row.offerPrice;
    ipo.sharesOutPostRaw = Math.round(sharesAds);
    ipo.splits = splits;
  }
  if (adsRatio !== 1) { ipo.adsRatio = adsRatio; ipo.sharesOutPostOrdinary = info.sharesOutPost; }

  // 3. the 424B4 as plain text
  const html = await secFetch(row.url424b4);
  const text = htmlToText(html);
  mkdirSync(join(root, 'research', '424b4'), { recursive: true });
  writeFileSync(join(root, 'research', '424b4', `${id}.txt`), `SOURCE: ${row.url424b4}\n\n${text}`);
  ipo.source.page = pageOf(text, info.sharesText);
  // sanity: price and share counts are in the text
  const priceTxt = String(row.offerPrice % 1 === 0 ? row.offerPrice.toFixed(2) : row.offerPrice);
  if (!text.includes(priceTxt)) throw new Error(`${ticker}: offer price ${priceTxt} not found in the 424B4`);

  // 4. filings: 8-K Item 2.02, 10-Q / 10-K
  const F = await getFilings(cik);
  const inWin = (f) => f.filingDate >= row.firstTrade && f.filingDate <= lastDay;
  const k8 = F.filings.filter((f) => f.form === '8-K' && f.items.split(',').map((s) => s.trim()).includes('2.02'));
  let earnings = k8.filter(inWin).map((f) => ({ d: f.filingDate, url: filingUrl(cik, f) }));
  const before = k8.filter((f) => f.filingDate < row.firstTrade).pop();
  if (before) earnings.unshift({ d: before.filingDate, url: filingUrl(cik, before) });
  const reports = F.filings
    .filter((f) => (f.form === '10-Q' || f.form === '10-K') && inWin(f))
    .map((f) => ({ d: f.filingDate, form: f.form, url: filingUrl(cik, f) }));
  const notes = [];
  if (info.note) notes.push(info.note);
  if (splits.length) notes.push(`Yahoo prices are split-adjusted. offerPrice (${ipo.offerPrice}) and sharesOutPost are restated for the ${splits.map((s) => `${s.num}:${s.den} split on ${s.d}`).join(', ')}; splitFactor ${ipo.splitFactor} is the shares multiplier. Raw: offer ${row.offerPrice}, shares ${ipo.sharesOutPostRaw}.`);

  if (!earnings.length || F.filings.filter((f) => f.form === '6-K' && inWin(f)).length > 5) {
    // foreign private issuer path
    const sk = await earningsFromSixK(cik, F.filings, row.firstTrade, lastDay);
    earnings = sk.map(({ d, url }) => ({ d, url }));
    const annual = F.filings.filter((f) => f.form === '20-F' && inWin(f)).map((f) => ({ d: f.filingDate, form: '20-F', url: filingUrl(cik, f) }));
    reports.push(...annual);
    reports.sort((a, b) => (a.d < b.d ? -1 : 1));
    notes.push('Foreign private issuer: no 8-K Item 2.02 or 10-Q/10-K. earnings are 6-K filings whose exhibit 99.1 headline reports quarterly or annual results; reports are the 20-F annual reports.');
  }
  if (earnings.length === 0) notes.push('DATA PROBLEM: no earnings filings found in the window.');

  return {
    id,
    blind: true,
    live: false,
    name: row.name,
    ticker,
    industry: info.industry,
    ipo,
    prices,
    earnings,
    reports,
    notes,
  };
}

async function main() {
  const u = loadUniverse();
  const { drawOrder } = recompute(u);
  const args = process.argv.slice(2);
  let tickers;
  if (args.includes('--all')) tickers = drawOrder.slice(0, 10);
  else if (args.includes('--ticker')) tickers = [args[args.indexOf('--ticker') + 1]];
  else { console.error('usage: fetch-card.mjs --all | --ticker SYM'); process.exit(2); }
  for (const t of tickers) {
    const id = `c${drawOrder.indexOf(t) + 1}`;
    if (drawOrder.indexOf(t) >= 10) console.warn(`${t} is draw position ${drawOrder.indexOf(t) + 1}; writing ${id}`);
    const card = await buildCard(t, id, u);
    const dir = join(root, 'data', 'src', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'base.json'), JSON.stringify(card) + '\n');
    console.log(`${id} ${t} rows=${card.prices.length} ${card.prices[0][0]}..${card.prices.at(-1)[0]} earnings=${card.earnings.length} reports=${card.reports.length} page=${card.ipo.source.page} offer=${card.ipo.offerPrice} shares=${card.ipo.sharesOutPost}${card.ipo.splitFactor ? ' splitFactor=' + card.ipo.splitFactor : ''}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

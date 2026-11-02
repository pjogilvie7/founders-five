import { getWithRetry, UA_BROWSER, SourceError } from './http.mjs';
import { nowEastern } from './io.mjs';

const toUnix = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000);

// Daily bars from Yahoo's chart endpoint: [[d, close, adjClose, volume]], ascending, no nulls, no duplicate dates.
// close is Yahoo's split-adjusted raw close; adjClose also adjusts for dividends.
// A bar dated today (New York) is dropped until 16:15 ET, because before then it is a partial session.
export async function fetchBars(ticker, fromDate, toDate = null) {
  const p2 = toDate ? toUnix(toDate) + 86400 : Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${toUnix(fromDate)}&period2=${p2}&interval=1d&events=div%2Csplit`;
  // Empirically Yahoo answers 429 to full browser UA strings from scripts and 200 to the bare token; try that first, then a browser UA.
  const attempts = [['query1', 'Mozilla/5.0', 5], ['query2', 'Mozilla/5.0', 3], ['query1', UA_BROWSER, 2]];
  let j = null, firstErr = null;
  for (const [host, ua, retries] of attempts) {
    try { j = await getWithRetry('yahoo', url.replace('query1', host), { headers: { 'User-Agent': ua, Accept: 'application/json' }, as: 'json', retries, baseDelayMs: 2000 }); break; }
    catch (e) { firstErr ??= e; }
  }
  if (!j) throw firstErr;
  const r = j?.chart?.result?.[0];
  if (!r || !r.timestamp) throw new SourceError('yahoo', `no data for ${ticker} (${j?.chart?.error?.description || 'empty result'})`);
  const off = r.meta?.gmtoffset ?? -18000;
  const q = r.indicators?.quote?.[0] || {};
  const adj = r.indicators?.adjclose?.[0]?.adjclose || [];
  const byDate = new Map();
  r.timestamp.forEach((ts, i) => {
    const close = q.close?.[i];
    if (close == null || !Number.isFinite(close)) return;
    const d = new Date((ts + off) * 1000).toISOString().slice(0, 10);
    const a = adj[i] != null && Number.isFinite(adj[i]) ? adj[i] : close;
    byDate.set(d, [d, +close.toFixed(4), +a.toFixed(6), Math.round(q.volume?.[i] ?? 0)]);
  });
  const et = nowEastern();
  if (et.minutes < 16 * 60 + 15) byDate.delete(et.date);
  return [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

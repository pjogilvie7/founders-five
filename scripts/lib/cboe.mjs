import { getWithRetry, UA_BROWSER, SourceError } from './http.mjs';

// CBOE delayed quotes for one symbol. The file is ~1.7 MB; it is read in memory and never written to the repo.
export async function fetchChain(symbol) {
  const j = await getWithRetry('cboe', `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`, { headers: { 'User-Agent': UA_BROWSER, Accept: 'application/json' }, as: 'json', retries: 4, baseDelayMs: 2000 });
  if (!j?.data?.options?.length) throw new SourceError('cboe', `empty chain for ${symbol}`);
  return j;
}

// OCC-style symbol: SPCX261102C00085000 -> {expiry:'2026-11-02', type:'call', strike:85}
export function parseOption(sym, root = 'SPCX') {
  const m = new RegExp(`^${root}(\\d{2})(\\d{2})(\\d{2})([CP])(\\d{8})$`).exec(sym);
  if (!m) return null;
  return { expiry: `20${m[1]}-${m[2]}-${m[3]}`, type: m[4] === 'C' ? 'call' : 'put', strike: Number(m[5]) / 1000 };
}

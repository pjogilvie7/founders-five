import { getWithRetry, UA_CURL, SourceError } from './http.mjs';

// FRED fredgraph.csv -> [[d, pct]] ascending, '.' (missing) skipped. since: only rows with d > since.
export async function fetchSeries(id, since = null) {
  const csv = await getWithRetry('fred', `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { 'User-Agent': UA_CURL }, retries: 4, baseDelayMs: 2000 });
  const lines = csv.trim().split(/\r?\n/);
  if (!/^observation_date|^DATE/i.test(lines[0])) throw new SourceError('fred', `unexpected CSV header for ${id}`);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [d, v] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || v === '.' || v === '' || v == null) continue;
    const x = Number(v);
    if (!Number.isFinite(x)) continue;
    if (since && d <= since) continue;
    rows.push([d, x]);
  }
  if (!rows.length && !since) throw new SourceError('fred', `no rows for ${id}`);
  return rows;
}

// Small fetch helpers: retries with exponential backoff, browser-like UA, polite SEC throttle.
export class SourceError extends Error {
  constructor(source, message) { super(`${source}: ${message}`); this.name = 'SourceError'; this.source = source; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export const UA_CURL = 'curl/8.4.0';
export const UA_SEC = 'Founders Five research pjogilvie7@gmail.com';

// GET with retries. Retries on network errors, 429 and 5xx. Throws SourceError after the last attempt.
export async function getWithRetry(source, url, { headers = {}, retries = 5, baseDelayMs = 1500, as = 'text', timeoutMs = 60000 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return as === 'json' ? await res.json() : await res.text();
      lastErr = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break; // 4xx other than 429: retrying will not help
    } catch (e) {
      lastErr = e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message);
    }
    if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500));
  }
  throw new SourceError(source, `${lastErr} for ${url.replace(/\?.*$/, '')}`);
}

// SEC asks for at most 10 requests a second; other builders share the IP, so this stays under 2 a second.
let lastSecAt = 0;
export async function secGet(url, { as = 'text', retries = 4 } = {}) {
  const wait = lastSecAt + 600 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSecAt = Date.now();
  return getWithRetry('sec', url, { headers: { 'User-Agent': UA_SEC, 'Accept-Encoding': 'gzip, deflate' }, as, retries, baseDelayMs: 2000, timeoutMs: 120000 });
}

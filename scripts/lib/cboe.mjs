import { getWithRetry, UA_BROWSER, SourceError } from './http.mjs';
import { addDays, isoDate, nowEastern } from './io.mjs';

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

// ---- quote-time guard ---------------------------------------------------------------------------------
// The chain must be end-of-day quotes for the same session as the last close we hold (base.json asOf). Mixing intraday
// quotes with the prior close once produced a wrong listed-option cap (2026-11-02, a run at about 10:50 ET).
//
// Field relied on: data.last_trade_time, the underlying's last trade, an America/New_York wall-clock string with no zone,
// e.g. '2026-11-02T11:48:15'. CBOE delays quotes ~15 minutes, so a run at 16:05 ET still shows 15:50 and is rejected.
// The top-level `timestamp` is NOT used: it is the file's generation time in UTC ('2026-11-02 17:03:15' at 12:03 ET).
// The cut-off is 15:55, not 16:00: the closing trade can be stamped a few seconds before 16:00, and asOf only reaches today
// after 16:15 ET (yahoo.mjs drops today's bar until then), so a same-day chain seen then is the close, not mid-session.
const OPEN_MIN = 9 * 60 + 30, CLOSE_MIN = 15 * 60 + 55;

export function chainQuoteTime(chain) {
  const t = chain?.data?.last_trade_time;
  return typeof t === 'string' && t ? t : null;
}

// Quote time -> {date, minutes} in New York. A string with no zone is already New York wall-clock; a Date or a string with
// Z / an offset is converted with Intl (America/New_York), so daylight saving is handled by the time zone database.
export function easternParts(t) {
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : nowEastern(t);
  if (typeof t !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(t.trim());
  if (m) {
    const h = Number(m[2]), mi = Number(m[3]);
    if (h > 23 || mi > 59 || Number.isNaN(Date.parse(m[1] + 'T00:00:00Z'))) return null;
    return { date: m[1], minutes: h * 60 + mi };
  }
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(t.trim()) && !Number.isNaN(Date.parse(t))) return nowEastern(new Date(t));
  return null;
}

const nextWeekday = (d) => { let n = addDays(d, 1); while ([0, 6].includes(new Date(n + 'T00:00:00Z').getUTCDay())) n = addDays(n, 1); return n; };

// Pure. quoteTime: see easternParts. asOf: 'YYYY-MM-DD', the date of the last completed session close we hold.
// Accept when the quotes are the close of the asOf session: on asOf at or after 15:55 ET, or after asOf but before 09:30 ET of the
// next weekday (pre-market, still showing that close). Reject intraday, a newer session, stale quotes, and anything unparseable.
// Exchange holidays are not modelled: the day after a holiday is treated as a session, so the check can only skip, never accept wrongly.
export function checkChainSession(quoteTime, asOf) {
  const q = easternParts(quoteTime);
  if (!q) return { ok: false, reason: 'chain has no usable quote time (data.last_trade_time missing or unparseable)', quote: null };
  if (!isoDate(String(asOf))) return { ok: false, reason: `last close date ${asOf} is not a date`, quote: q };
  const hh = String(Math.floor(q.minutes / 60)).padStart(2, '0'), mm = String(q.minutes % 60).padStart(2, '0');
  const at = `${q.date} ${hh}:${mm} ET`;
  const no = (why) => ({ ok: false, reason: `chain quotes are from ${at}: ${why} (last close ${asOf})`, quote: q });
  if (q.date < asOf) return no('older than the last close');
  if (q.date === asOf) return q.minutes >= CLOSE_MIN ? { ok: true, reason: `end-of-day quotes from ${at}`, quote: q } : no('intraday, session not over');
  const next = nextWeekday(asOf);
  if (q.date < next || (q.date === next && q.minutes < OPEN_MIN)) return { ok: true, reason: `pre-market quotes from ${at}, still the ${asOf} close`, quote: q };
  return no('a newer session than the last close');
}

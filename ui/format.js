// Display helpers only. No money is computed here: every number comes from the engine.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function parseISO(d) { const [y, m, dd] = String(d).split('-').map(Number); return Date.UTC(y, m - 1, dd); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 864e5); }
export function addDays(d, n) { return new Date(parseISO(d) + n * 864e5).toISOString().slice(0, 10); }
export function todayISO() {
  const o = new URLSearchParams(location.search).get('now');
  if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return o;
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function shortDate(d) { if (!d) return ''; const t = new Date(parseISO(d)); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`; }
export function longDate(d) { if (!d) return ''; const t = new Date(parseISO(d)); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`; }
export function fullDate(d) { if (!d) return ''; const t = new Date(parseISO(d)); return `${DOWS[t.getUTCDay()]} ${longDate(d)}`; }

const MINUS = '−';
const group = (n) => Math.round(n).toLocaleString('en-US');

/** "$131.4M" at 10M and above, "$2,140,000" below. opts.compact forces "$2.1M". */
export function money(x, opts = {}) {
  if (x == null || Number.isNaN(x)) return '—';
  const neg = x < 0, a = Math.abs(x);
  let s;
  if (a >= 1e9) s = `$${(a / 1e9).toFixed(2)}B`;
  else if (a >= 1e7 || (opts.compact && a >= 1e6)) s = `$${(a / 1e6).toFixed(1)}M`;
  else if (opts.compact && a >= 1e4) s = `$${(a / 1e3).toFixed(0)}K`;
  else s = `$${group(a)}`;
  return (neg ? MINUS : '') + s;
}
/** Full dollars, "$131,402,118". */
export function moneyFull(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return (x < 0 ? MINUS : '') + '$' + group(Math.abs(x));
}
export function signedMoney(x, opts) { return (x > 0 ? '+' : '') + money(x, opts); }
export function price(x) { return x == null ? '—' : '$' + x.toFixed(2); }
export function int(n) { return n == null ? '—' : group(n); }
/** x is a decimal (0.172 -> "17.2%"). */
export function pct(x, dp = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return (x < 0 ? MINUS : '') + (Math.abs(x) * 100).toFixed(dp) + '%';
}

/**
 * ctx = {blind, dates?:[iso], firstDate}. Blind cards never show a real date.
 * With ctx.dates (the card's trading days) we count trading days; otherwise calendar days.
 */
export function dayNumber(ctx, d) {
  if (ctx.dates && ctx.dates.length) {
    let lo = 0, hi = ctx.dates.length - 1;
    if (d <= ctx.dates[0]) return 1;
    if (d > ctx.dates[hi]) return hi + 1 + Math.round(daysBetween(ctx.dates[hi], d) * 5 / 7);
    while (lo < hi) { const m = (lo + hi) >> 1; if (ctx.dates[m] < d) lo = m + 1; else hi = m; }
    return lo + 1;
  }
  return daysBetween(ctx.firstDate, d) + 1;
}
export function dateLabel(ctx, d, style) {
  if (!d) return '';
  if (ctx && ctx.blind) {
    const n = dayNumber(ctx, d);
    if (style === 'ym') { const y = Math.floor((n - 1) / 252) + 1, m = Math.floor(((n - 1) % 252) / 21) + 1; return `Year ${y} · Month ${m}`; }
    return `Day ${n}`;
  }
  return shortDate(d);
}
export function plural(n, one, many) { return `${int(n)} ${n === 1 ? one : (many || one + 's')}`; }
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

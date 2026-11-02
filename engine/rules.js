// rules.js: pure rule helpers used by the sim: labels, 10b5-1 cooling-off, Rule 144 cap, collar vol smile.
// Nothing here touches state. Dates are "YYYY-MM-DD".
import {
  addCalendarDays, daysBetween, businessDaysAfter, tradingIndexOnOrAfter, weekday, addMonths,
} from "./calendar.js";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtShort(d) {
  return `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
}

// Long form used on the lockup rule: "June 12, 2027".
export function fmtLong(d) {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
}

export function fmtWeekday(d) {
  return `${WEEKDAYS[weekday(d)]} ${fmtShort(d)}`;
}

export function commas(n) {
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  let out = "";
  for (let k = 0; k < s.length; k++) {
    if (k > 0 && (s.length - k) % 3 === 0) out += ",";
    out += s[k];
  }
  return (neg ? "-" : "") + out;
}

// "$2.4M", "$10M", "$166,667"
export function money(x) {
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  return `${sign}$${commas(a)}`;
}

export function pctText(x, dp = 1) {
  return `${(x * 100).toFixed(dp)}%`;
}

// Round a share count for "about N shares": nearest 100 above 1,000, nearest 10 otherwise.
export function aboutShares(n) {
  if (n >= 1000) return commas(Math.round(n / 100) * 100);
  return commas(Math.round(n / 10) * 10);
}

// First trading date on or after d. Inside the series: the real trading day. Beyond it: the next weekday.
export function tradingDateOnOrAfter(prices, d) {
  const idx = tradingIndexOnOrAfter(prices, d);
  if (idx >= 0) return prices[idx][0];
  let x = d;
  while (weekday(x) === 0 || weekday(x) === 6) x = addCalendarDays(x, 1);
  return x;
}

// Trading-day number (1-based) for a date, estimated past the end of the series (252 days a year).
export function dayNumber(prices, d) {
  const idx = tradingIndexOnOrAfter(prices, d);
  if (idx >= 0) return idx + 1;
  const last = prices.length;
  const extra = Math.round((daysBetween(prices[last - 1][0], d) * 252) / 365);
  return last + Math.max(1, extra);
}

// Last calendar day of the calendar quarter that contains d.
export function quarterEndOf(d) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  const qm = Math.ceil(m / 3) * 3;
  const last = new Date(Date.UTC(y, qm, 0)).getUTCDate();
  return `${y}-${String(qm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

// 10b5-1 cooling-off (17 CFR 240.10b5-1(c)(1)(ii)(B)). seat "engineer": 30 calendar days.
// seat "founder" (director or officer): the later of 90 calendar days after adoption or 2 business days after the
// 10-Q/10-K that reports the fiscal quarter IN WHICH the plan was adopted, capped at 120 days. The game takes the
// fiscal quarter as the calendar quarter containing the adoption date; its report is the first 10-Q/10-K in `reports`
// filed after that quarter's end. No such report on file (a live card's future) uses the 120-day cap, the choice
// that can never let a sale happen early.
// Returns {endsOn, firstTradeOn, basis, quarterEnd, reportOn}
export function coolingOff({ seat, adoptedOn, prices, reports }) {
  let endsOn, basis, quarterEnd = null, reportOn = null;
  if (seat === "founder") {
    const d90 = addCalendarDays(adoptedOn, 90);
    const d120 = addCalendarDays(adoptedOn, 120);
    quarterEnd = quarterEndOf(adoptedOn);
    const rep = (reports || []).find((r) => r.d > quarterEnd);
    if (!rep) {
      endsOn = d120;
      basis = "cap";
    } else {
      reportOn = rep.d;
      const afterReport = businessDaysAfter(rep.d, 2);
      if (afterReport <= d90) { endsOn = d90; basis = "90days"; }
      else if (afterReport >= d120) { endsOn = d120; basis = "cap"; }
      else { endsOn = afterReport; basis = "report"; }
    }
  } else {
    endsOn = addCalendarDays(adoptedOn, 30);
    basis = "30days";
  }
  return { endsOn, firstTradeOn: tradingDateOnOrAfter(prices, endsOn), basis, quarterEnd, reportOn };
}

// Rule 144 volume cap for an affiliate: in any rolling 3 months, the greater of 1% of shares outstanding or the
// average weekly volume over the prior 4 calendar weeks. sales = [{d, shares}] already made.
export function rule144({ prices, i, sharesOutPost, sales }) {
  const d = prices[i][0];
  const from = addCalendarDays(d, -28);
  let vol = 0;
  for (let j = i - 1; j >= 0 && prices[j][0] >= from; j--) vol += prices[j][3] || 0;
  const avgWeekly = vol / 4;
  const cap = Math.max(0.01 * (sharesOutPost || 0), avgWeekly);
  const since = addMonths(d, -3);
  let used = 0;
  for (const s of sales || []) if (s.d > since) used += s.shares;
  return { cap, avgWeekly, used, remaining: Math.max(0, Math.floor(cap - used)) };
}

// Earliest date at which enough old sales age out to raise the remaining room above zero (for the reason text).
export function rule144ResetOn(sales, d) {
  const since = addMonths(d, -3);
  const live = (sales || []).filter((s) => s.d > since).sort((a, b) => (a.d < b.d ? -1 : 1));
  return live.length ? addMonths(live[0].d, 3) : null;
}

// ---- implied-vol smile (SpaceX, last data day) ----
function normIv(x) { return x > 3 ? x / 100 : x; }

// smile: [{expiry, strikePct, iv}]. strikePct may be 85 or 0.85; iv may be 53.3 or 0.533.
export function smileVol(smile, expiryDate, strikePct) {
  if (!smile || !smile.length) return null;
  const scale = smile.some((p) => p.strikePct > 3) ? 100 : 1;
  const k = strikePct * scale;
  const byExp = new Map();
  for (const p of smile) {
    if (!byExp.has(p.expiry)) byExp.set(p.expiry, []);
    byExp.get(p.expiry).push({ k: p.strikePct, iv: normIv(p.iv) });
  }
  const atStrike = (pts) => {
    pts.sort((a, b) => a.k - b.k);
    if (k <= pts[0].k) return pts[0].iv;
    if (k >= pts[pts.length - 1].k) return pts[pts.length - 1].iv;
    for (let j = 1; j < pts.length; j++) {
      if (k <= pts[j].k) {
        const w = (k - pts[j - 1].k) / (pts[j].k - pts[j - 1].k || 1);
        return pts[j - 1].iv + w * (pts[j].iv - pts[j - 1].iv);
      }
    }
    return pts[pts.length - 1].iv;
  };
  const exps = [...byExp.keys()].sort();
  const vols = exps.map((e) => ({ e, v: atStrike(byExp.get(e)) }));
  if (expiryDate <= vols[0].e) return vols[0].v;
  if (expiryDate >= vols[vols.length - 1].e) return vols[vols.length - 1].v;
  for (let j = 1; j < vols.length; j++) {
    if (expiryDate <= vols[j].e) {
      const a = vols[j - 1], b = vols[j];
      const w = daysBetween(a.e, expiryDate) / (daysBetween(a.e, b.e) || 1);
      return a.v + w * (b.v - a.v);
    }
  }
  return vols[vols.length - 1].v;
}

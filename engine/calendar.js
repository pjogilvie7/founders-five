// calendar.js: date math (UTC only) and the trading-window rule. Pure, no dependencies.
// Dates are "YYYY-MM-DD" strings. Price rows are [d, close, adjClose, volume] (only row[0] is read).

const DAY_MS = 86400000;

function parse(d) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7), day = +d.slice(8, 10);
  return Date.UTC(y, m - 1, day);
}
function fmt(ms) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarDays(d, n) {
  return fmt(parse(d) + n * DAY_MS);
}

// Whole calendar days from a to b (positive when b is later).
export function daysBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / DAY_MS);
}

export function weekday(d) {
  return new Date(parse(d)).getUTCDay(); // 0 Sunday .. 6 Saturday
}

// The nth weekday strictly after d (Mon-Fri; no holiday list). n=0 returns d.
export function businessDaysAfter(d, n) {
  let ms = parse(d);
  let left = n;
  while (left > 0) {
    ms += DAY_MS;
    const wd = new Date(ms).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return fmt(ms);
}

// Add n calendar months, clamping to the end of the target month (Jan 31 + 1 month = Feb 28/29).
export function addMonths(d, n) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1, day = +d.slice(8, 10);
  const total = y * 12 + m + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fmt(Date.UTC(ny, nm, Math.min(day, last)));
}

// First index whose date is >= d, or -1.
export function tradingIndexOnOrAfter(prices, d) {
  let lo = 0, hi = prices.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid][0] < d) lo = mid + 1; else hi = mid;
  }
  return lo < prices.length ? lo : -1;
}

// Index of the nth trading day strictly after date d (n=2 -> "second full trading day after"), or -1
// if the price series does not reach it.
export function nthTradingIndexAfter(prices, d, n) {
  let lo = 0, hi = prices.length;
  while (lo < hi) { // first index with date > d
    const mid = (lo + hi) >> 1;
    if (prices[mid][0] <= d) lo = mid + 1; else hi = mid;
  }
  const idx = lo + n - 1;
  return idx < prices.length ? idx : -1;
}

// Date (ISO string) of the nth trading day strictly after date d, or null if the series does not reach it.
export function nthTradingDayAfter(prices, d, n) {
  const idx = nthTradingIndexAfter(prices, d, n);
  return idx < 0 ? null : prices[idx][0];
}

// Last trading day of each calendar quarter. The final row counts only if no weekday remains in its quarter.
export function quarterEndIndexes(prices) {
  const out = [];
  const q = (d) => +d.slice(0, 4) * 4 + Math.floor((+d.slice(5, 7) - 1) / 3);
  for (let j = 0; j < prices.length; j++) {
    const d = prices[j][0];
    if (j < prices.length - 1) {
      if (q(prices[j + 1][0]) !== q(d)) out.push(j);
    } else if (q(businessDaysAfter(d, 1)) !== q(d)) {
      out.push(j);
    }
  }
  return out;
}

// First trading day of each calendar month present in the series. Index 0 counts only when no weekday of its
// month precedes it (a card that starts mid-month does not get a spending day on its first row), unless
// opts.includeFirst is set explicitly.
export function firstTradingDayOfMonthIndexes(prices, opts = {}) {
  const out = [];
  const ym = (d) => d.slice(0, 7);
  for (let j = 0; j < prices.length; j++) {
    const d = prices[j][0];
    if (j > 0) {
      if (ym(prices[j - 1][0]) !== ym(d)) out.push(j);
    } else {
      let incl = opts.includeFirst;
      if (incl === undefined) {
        const first = d.slice(0, 8) + "01";
        let wdBefore = false;
        for (let k = first; k < d; k = addCalendarDays(k, 1)) {
          const w = weekday(k);
          if (w !== 0 && w !== 6) { wdBefore = true; break; }
        }
        incl = !wdBefore;
      }
      if (incl) out.push(0);
    }
  }
  return out;
}

// Trading window. earnings: [{d}] ascending. Closed from (earnings date - 30 calendar days) inclusive until
// the 2nd trading day after the earnings date (open again ON that day).
// opts.live: if lastEarnings + 91 is after the last price date, project a release at lastEarnings + 91.
// Returns {open, closesOn, opensOn, projected}:
//   open:      closesOn = next date the window closes (or null), opensOn = null
//   closed:    opensOn = date it reopens (for a projected release, about its 2nd weekday after), closesOn = null
//   projected: true when the relevant window (the one that is closed now, or the next to close) is projected.
export function windowState(prices, earnings, i, opts = {}) {
  const today = prices[i][0];
  const lastPrice = prices[prices.length - 1][0];
  const wins = [];
  for (const e of earnings || []) {
    let opensOn = nthTradingDayAfter(prices, e.d, 2);
    if (opensOn === null) opensOn = businessDaysAfter(e.d, 2); // series ends first: weekday estimate
    wins.push({ from: addCalendarDays(e.d, -30), to: opensOn, projected: false });
  }
  if (opts.live && earnings && earnings.length) {
    const last = earnings[earnings.length - 1].d;
    const proj = addCalendarDays(last, 91);
    if (proj > lastPrice) {
      wins.push({ from: addCalendarDays(proj, -30), to: businessDaysAfter(proj, 2), projected: true });
    }
  }
  wins.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  // Chain overlapping windows: find the window covering today, then extend while another one covers its reopen date.
  let cover = null;
  for (const w of wins) {
    if (today >= w.from && today < w.to) {
      if (!cover || w.to > cover.to) cover = w;
    }
  }
  if (cover) {
    let opensOn = cover.to, projected = cover.projected;
    for (let moved = true; moved; ) {
      moved = false;
      for (const w of wins) {
        if (opensOn >= w.from && opensOn < w.to && w.to > opensOn) {
          opensOn = w.to; projected = w.projected; moved = true;
        }
      }
    }
    return { open: false, closesOn: null, opensOn, projected };
  }
  for (const w of wins) {
    if (w.from > today) return { open: true, closesOn: w.from, opensOn: null, projected: w.projected };
  }
  return { open: true, closesOn: null, opensOn: null, projected: false };
}

// lockup.js: turn a card's lockup triggers into release dates and share counts (PRD 4.1).
import {
  addCalendarDays, tradingIndexOnOrAfter, nthTradingDayAfter, businessDaysAfter, weekday,
} from "./calendar.js";

// Group for a seat, or null when the seat is not playable on this card: no group lists the seat, or none of the
// group's tranches release inside the card's price data (SpaceX founder: the first release is 2027-06-14).
export function groupForSeat(card, seat) {
  const groups = (card && card.lockup && card.lockup.groups) || [];
  const g = groups.find((x) => (x.seats || []).includes(seat));
  if (!g) return null;
  if (card.prices && card.prices.length) {
    const lastDate = card.prices[card.prices.length - 1][0];
    const sched = scheduleTranches(card, g.id);
    if (!sched.some((r) => r.status === "resolved" && r.date && r.date <= lastDate)) return null;
  }
  return g;
}

// Plain-English reason a seat cannot be played (shown on the seat-select padlock and thrown by createGame).
export function seatBlockedReason(card, seat) {
  if (card && card.seatNotes && card.seatNotes[seat]) return card.seatNotes[seat];
  if (card && (card.id === "spcx" || card.ticker === "SPCX") && seat === "founder") {
    return "The founder's shares are locked until June 12, 2027 (424B4).";
  }
  const who = seat === "founder" ? "founder" : "early engineer";
  return `The ${who} seat is not playable on this card: its lockup table has no group for that seat.`;
}

function tradingDate(prices, d) {
  const idx = tradingIndexOnOrAfter(prices, d);
  if (idx >= 0) return prices[idx][0];
  let x = d;
  while (weekday(x) === 0 || weekday(x) === 6) x = addCalendarDays(x, 1);
  return x;
}

function earningsAfterIpo(card) {
  const first = (card.ipo && card.ipo.firstTrade) || card.prices[0][0];
  return (card.earnings || []).filter((e) => e.d >= first).sort((a, b) => (a.d < b.d ? -1 : 1));
}

function releaseAfter(prices, d, k) {
  return nthTradingDayAfter(prices, d, k) ?? businessDaysAfter(d, k);
}

// The price test of a trigger {type:"priceCondition"}: closes at or above offer*(1+pct/100) on at least daysMet of
// the `window` trading days ending on the first earnings release date. Raw closes (Facts 8).
export function priceCondition(card, trigger) {
  const prices = card.prices;
  const e1 = earningsAfterIpo(card)[0];
  const offer = card.ipo.offerPrice;
  const threshold = offer * (1 + trigger.pct / 100);
  if (!e1 || e1.d > prices[prices.length - 1][0]) return { known: false, met: false, threshold };
  let end = -1;
  for (let j = 0; j < prices.length; j++) if (prices[j][0] <= e1.d) end = j;
  if (end < 0) return { known: false, met: false, threshold };
  const start = Math.max(0, end - trigger.window + 1);
  let count = 0, max = -Infinity;
  for (let j = start; j <= end; j++) {
    if (prices[j][1] >= threshold) count++;
    if (prices[j][1] > max) max = prices[j][1];
  }
  return {
    known: true, met: count >= trigger.daysMet, count, max, threshold,
    from: prices[start][0], to: prices[end][0], earningsDate: e1.d,
  };
}

function resolveOne(card, t) {
  const prices = card.prices;
  const ipo = card.ipo || {};
  const trig = t.trigger || {};
  const base = (from) => (from === "firstTrade" ? ipo.firstTrade || prices[0][0] : ipo.pricingDate || ipo.firstTrade || prices[0][0]);
  switch (trig.type) {
    case "date":
      return { date: tradingDate(prices, trig.date), status: "resolved" };
    case "calendarDaysAfter":
    case "remainder":
      return { date: tradingDate(prices, addCalendarDays(base(trig.from), trig.days)), status: "resolved" };
    case "afterEarnings": {
      const e = earningsAfterIpo(card)[(trig.n || 1) - 1];
      if (!e) return { date: null, status: "unknown" };
      return { date: releaseAfter(prices, e.d, trig.tradingDaysAfter ?? 2), status: "resolved" };
    }
    case "priceCondition": {
      const c = priceCondition(card, trig);
      if (!c.known) return { date: null, status: "unknown", condition: c };
      const when = releaseAfter(prices, c.earningsDate, 2);
      if (c.met) return { date: when, status: "resolved", condition: c };
      return { date: null, status: "never", condition: c, noteDate: when };
    }
    default:
      return { date: null, status: "unknown" };
  }
}

// Recompute every tranche's release date from its trigger. date null = never (status "never") or not yet known
// ("unknown", a future earnings release). Tests compare this with the stored resolvedDate.
export function resolveTranches(card, groupId) {
  const g = ((card.lockup && card.lockup.groups) || []).find((x) => x.id === groupId);
  if (!g) return [];
  return g.tranches.map((t) => {
    const r = resolveOne(card, t);
    const out = { id: t.id, pct: t.pct, date: r.date, status: r.status };
    if (r.condition) out.condition = r.condition;
    if (r.noteDate) out.noteDate = r.noteDate;
    return out;
  });
}

// The schedule the sim plays: the card's own stored resolvedDate wins (the reconciler reads the filing, including
// details a trigger cannot express, such as "after the close"); a missing resolvedDate falls back to the recompute.
// A stored null means "never releases" unless the recompute says the date is simply not known yet (a future earnings
// release on a live card).
export function scheduleTranches(card, groupId) {
  const computed = resolveTranches(card, groupId);
  const g = card.lockup.groups.find((x) => x.id === groupId);
  return computed.map((c, k) => {
    const t = g.tranches[k];
    if (t.resolvedDate === undefined) return c;
    if (t.resolvedDate) return { ...c, date: t.resolvedDate, status: "resolved" };
    if (c.status === "unknown") return c;
    return { ...c, date: null, status: "never" };
  });
}

// Shares each tranche frees, for a player holding `total` locked shares.
// A tranche that never releases frees nothing. A "remainder" tranche frees everything still locked on its date, so
// it also takes the shares of a failed price test (SpaceX: 7% + 10% = 17% on day 180). Without a remainder tranche
// the latest dated one takes the leftover.
export function trancheShares(card, groupId, total) {
  const res = scheduleTranches(card, groupId);
  const out = res.map((r) => ({
    id: r.id, pct: r.pct, date: r.date, status: r.status, noteDate: r.noteDate || null,
    shares: r.status === "never" ? 0 : Math.round((total * r.pct) / 100),
  }));
  const g = card.lockup.groups.find((x) => x.id === groupId);
  let absorb = -1;
  g.tranches.forEach((t, k) => {
    if (t.trigger && t.trigger.type === "remainder" && out[k].status === "resolved") absorb = k;
  });
  if (absorb < 0) {
    out.forEach((r, k) => {
      if (r.status === "resolved" && (absorb < 0 || r.date >= out[absorb].date)) absorb = k;
    });
  }
  if (absorb >= 0) {
    const others = out.reduce((a, r, k) => (k === absorb ? a : a + r.shares), 0);
    out[absorb].shares = Math.max(0, total - others);
  }
  return out;
}

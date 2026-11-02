// Mock data + mock engine with the same API as engine/sim.js (createGame, tick, act, canDo, gates,
// snapshot, score, runBot, normalizeCard). Used only when the real engine or data files are absent
// (or with ?mock=1). It is a stand-in so the shell is demoable; its money maths is NOT the real model.
import { addDays, daysBetween, dateLabel, money, moneyFull } from './format.js';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const HOLIDAYS = new Set(['2026-06-19', '2026-07-03', '2026-09-07']);
function tradingDates(start, n) {
  const out = []; let d = start;
  while (out.length < n) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
function interp(anchors, i) {
  for (let k = 1; k < anchors.length; k++) if (i <= anchors[k][0]) {
    const [i0, v0] = anchors[k - 1], [i1, v1] = anchors[k]; return v0 + (v1 - v0) * (i - i0) / (i1 - i0);
  }
  return anchors[anchors.length - 1][1];
}

const CARD_CACHE = new Map();
export function mockCard(id) {
  if (CARD_CACHE.has(id)) return CARD_CACHE.get(id);
  let card;
  if (id === 'spcx') {
    const dates = tradingDates('2026-06-12', 98);
    const r = rng(7);
    const anchors = [[0, 160.95], [1, 190], [2, 211.39], [20, 178], [38, 108.27], [60, 119], [80, 129], [97, 134.72]];
    const prices = dates.map((d, i) => {
      const c = i === 0 || i === 2 || i === 38 || i === 97 ? interp(anchors, i) : interp(anchors, i) * (1 + (r() - 0.5) * 0.04);
      return [d, +c.toFixed(2), +c.toFixed(2), Math.round(4e6 + r() * 3e6)];
    });
    const T = (id, pct, date, quote) => ({ id, pct, trigger: { type: 'date', date }, quote, page: '259', resolvedDate: date, reconciled: true, human: { status: 'pending' } });
    card = {
      id: 'spcx', blind: false, live: true, name: 'Space Exploration Technologies', ticker: 'SPCX', industry: 'aerospace',
      vignette: null, revealVignette: null,
      ipo: { offerPrice: 135, pricingDate: '2026-06-11', firstTrade: '2026-06-12', proceedsUSD: 5e10, sharesOutPost: 7.38e9, source: { url: '', page: '1' } },
      prices,
      earnings: [{ d: '2026-08-04', url: '' }, { d: '2026-10-20', url: '' }],
      reports: [],
      lockup: { groups: [{ id: 'g180', seats: ['engineer'], label: '180-day group', tranches: [
        T('a', 20, '2026-08-06', 'mock'), T('c1', 5, '2026-08-20', 'mock'), T('c2', 5, '2026-09-09', 'mock'),
        T('c3', 5, '2026-09-24', 'mock'), T('c4', 5, '2026-10-09', 'mock'), T('d', 28, '2026-10-22', 'mock'),
        T('c5', 5, '2026-10-26', 'mock'), T('e', 17, '2026-12-08', 'mock'),
        { ...T('b', 10, null, 'mock'), resolvedDate: null, trigger: { type: 'priceCondition' } },
      ] }] },
      headlines: [{ d: '2026-08-04', text: 'Company reports second-quarter results.', source: 'mock' }, { d: '2026-10-20', text: 'Company reports third-quarter results.', source: 'mock' }],
      reveal: { text: '', numbersChecked: true }, notes: ['mock'],
    };
  } else {
    const n = Number(id.replace(/\D/g, '')) || 1;
    const starts = ['2019-09-20', '2020-09-17', '2019-05-10', '2020-12-10', '2021-03-12', '2019-10-04'];
    const dates = tradingDates(starts[(n - 1) % 6], 1261);
    const r = rng(100 + n);
    let p = 100 * (1.08 + 0.07 * r()), drift = [0.0004, 0.0006, -0.0002, 0.0005, -0.0004, 0.0003][(n - 1) % 6];
    const prices = dates.map((d, i) => {
      if (i > 0) p *= 1 + drift + (r() - 0.5) * 0.05 + (i === 60 ? -0.2 : 0);
      return [d, +p.toFixed(2), +p.toFixed(2), Math.round(2e6 + r() * 4e6)];
    });
    const first = dates[0];
    const earnings = []; for (let k = 0; k < 20; k++) earnings.push({ d: addDays(first, 50 + 91 * k), url: '' });
    const mk = (id, pct, days) => ({ id, pct, trigger: { type: 'calendarDaysAfter', days }, quote: 'mock', page: '1', resolvedDate: addDays(first, days), reconciled: true, human: { status: 'pending' } });
    const hl = ['Sales growth beats expectations.', 'The chief financial officer resigns.', 'Regulators open an inquiry.', 'A large customer signs a multi-year deal.', 'Guidance is cut for the year.', 'The company announces a buyback.', 'Short sellers publish a critical report.', 'A secondary offering is priced.'];
    card = {
      id, blind: true, live: false, name: 'Mock Co ' + n, ticker: 'MOCK' + n, industry: 'software',
      vignette: null, revealVignette: null,
      ipo: { offerPrice: 100, pricingDate: addDays(first, -1), firstTrade: first, proceedsUSD: 2e9, sharesOutPost: 1e8, source: { url: '', page: '1' } },
      prices, earnings, reports: [],
      lockup: { groups: [
        { id: 'e', seats: ['engineer', 'founder'], label: 'Lockup', tranches: [mk('t1', 25, 181), mk('t2', 25, 270), mk('t3', 50, 365)] },
      ] },
      headlines: hl.map((text, k) => ({ d: dates[100 + k * 150], text, source: 'mock' })),
      reveal: { text: '', numbersChecked: true }, notes: ['mock'],
    };
  }
  CARD_CACHE.set(id, card);
  return card;
}

export function mockData() {
  const spcx = mockCard('spcx');
  const last = spcx.prices[spcx.prices.length - 1][0];
  const idx = [{ id: 'spcx', blind: false, label: 'SpaceX (SPCX)', vignette: spcx.vignette, revealVignette: null, tradingDays: spcx.prices.length }];
  for (let k = 1; k <= 4; k++) idx.push({ id: 'c' + k, blind: true, label: 'Card ' + k, vignette: null, revealVignette: null, tradingDays: 1261 });
  return {
    meta: { asOf: last, lastRun: last + 'T23:40:00Z', schema: 1, spcxTradingDays: spcx.prices.length, mock: true },
    log: [{ run: last + 'T23:40:00Z', ok: true, changed: ['mock data'], error: null }],
    market: { spy: [], rates: { dgs1mo: [], dgs1: [], sofr: [] } },
    cardsIndex: idx,
    spcxOptions: null,
  };
}

// ---------------------------------------------------------------- mock engine
const COST = 0.0025, TAX = 0.238, SPEND = 166667;
const clone = (o) => JSON.parse(JSON.stringify(o));
const cardOf = (s) => s._card;
const priceAt = (s, i = s.i) => cardOf(s).prices[i][1];
const ctxOf = (s) => ({ blind: s.blind, dates: cardOf(s).prices.map((p) => p[0]), firstDate: cardOf(s).prices[0][0] });
const held = (s) => s.shares.locked + s.shares.free + s.shares.collared + s.shares.pledged;

export function normalizeCard(card) { return card; }

function groupFor(card, seat) { return card.lockup.groups.find((g) => g.seats.includes(seat)) || null; }
function windowAt(card, d) {
  const ends = [];
  const ear = card.earnings.map((e) => e.d);
  const last = card.prices[card.prices.length - 1][0];
  let projected = false;
  if (card.live && ear.length && addDays(ear[ear.length - 1], 91) > last) { ear.push(addDays(ear[ear.length - 1], 91)); projected = true; }
  for (const e of ear) ends.push([addDays(e, -30), addDays(e, 3)]);
  for (const [a, b] of ends) if (d >= a && d < b) return { open: false, closesOn: null, opensOn: b, projected: false };
  const next = ends.find(([a]) => a > d);
  return { open: true, closesOn: next ? next[0] : null, opensOn: null, projected: !!(next && projected && next === ends[ends.length - 1]) };
}
function nextRelease(s) {
  const g = groupFor(cardOf(s), s.seat);
  const t = g.tranches.filter((t) => t.resolvedDate && t.resolvedDate > s.d).sort((a, b) => a.resolvedDate.localeCompare(b.resolvedDate))[0];
  return t ? { date: t.resolvedDate, pct: t.pct } : null;
}
function indexValue(s) { return s.index.units * 1; }
function taxOwed(s) { return Math.max(0, TAX * Math.max(0, s.tax.realized) - s.tax.paid); }
function netWorth(s) {
  const p = priceAt(s);
  return held(s) * p + indexValue(s) + s.cash - s.loan.balance - s.overdraft - taxOwed(s);
}

export function createGame({ card, seat }) {
  const g = groupFor(card, seat);
  if (!g) {
    const e = new Error(card.id === 'spcx' && seat === 'founder' ? 'The founder’s shares are locked until June 12, 2027 (424B4).' : 'This seat is not playable on this card.');
    e.reason = e.message; throw e;
  }
  const offer = card.ipo.offerPrice, total = Math.round(1e8 / offer);
  const s = {
    cardId: card.id, seat, blind: card.blind, live: !!card.live, i: 0, d: card.prices[0][0], done: false,
    total, basis: offer * 0.01, shares: { locked: total, free: 0, collared: 0, pledged: 0, sold: 0, exchanged: 0 },
    cash: 3e6, overdraft: 0, autoInvest: true, index: { units: 0, cost: 0 },
    loan: { balance: 0, accrued: 0, call: null }, collars: [], puts: [], plan: null, exchange: null,
    tax: { realized: 0, paid: 0 }, log: [], history: [],
    flags: { houseDone: false, seenTranches: [], firstUse: {}, achievements: [], unlocked: [] },
    pendingEvent: null, _card: card, _seq: 0,
  };
  s.history.push({ d: s.d, W: netWorth(s), S: 0, rf: 0, close: priceAt(s) });
  s.W0 = s.history[0].W;
  return s;
}

function achieve(s, ev, id, name) {
  if (s.flags.achievements.includes(id)) return;
  s.flags.achievements.push(id);
  ev.push({ type: 'achievement', d: s.d, pause: false, text: name, data: { id, name } });
}
function unlock(s, ev, tool, text) {
  if (s.flags.unlocked.includes(tool)) return;
  s.flags.unlocked.push(tool);
  ev.push({ type: 'toolUnlock', d: s.d, pause: true, text, data: { tool } });
}

export function tick(state0) {
  const s = clone({ ...state0, _card: null }); s._card = state0._card;
  const ev = [];
  if (s.done || s.pendingEvent) return { state: s, events: ev };
  const card = cardOf(s), prevD = s.d, prevWin = windowAt(card, prevD);
  s.i += 1; s.d = card.prices[s.i][0];
  const p = priceAt(s), ctx = ctxOf(s);
  // growth on cash and the index fund (mock)
  s.cash *= 1 + 0.04 / 252;
  s.index.units *= 1 + 0.0004 + 0.007 * Math.sin(s.i * 0.9 + card.prices[0][1]);
  if (s.loan.balance > 0) s.loan.balance *= 1 + 0.0594 / 365 * Math.max(1, daysBetween(prevD, s.d));
  // releases
  const g = groupFor(card, s.seat);
  let freed = 0, pctFreed = 0;
  for (const t of g.tranches) if (t.resolvedDate && t.resolvedDate <= s.d && !s.flags.seenTranches.includes(t.id)) {
    s.flags.seenTranches.push(t.id);
    const n = Math.min(s.shares.locked, Math.round(s.total * t.pct / 100));
    s.shares.locked -= n; s.shares.free += n; freed += n; pctFreed += t.pct;
  }
  const win = windowAt(card, s.d);
  if (freed) {
    ev.push({ type: 'release', d: s.d, pause: true, text: `${pctFreed}% of your shares are free. New: Sell, Collar, Credit Line.`, data: { shares: freed, pct: pctFreed } });
    unlock(s, ev, 'collar', 'Collar unlocked'); unlock(s, ev, 'credit', 'Credit Line unlocked');
    if (win.open) unlock(s, ev, 'plan', '10b5-1 Plan unlocked');
  }
  if (win.open && !prevWin.open) {
    ev.push({ type: 'windowOpen', d: s.d, pause: true, text: `The trading window is open until ${win.closesOn ? dateLabel(ctx, win.closesOn) : 'further notice'}.`, data: {} });
    if (s.flags.seenTranches.length) unlock(s, ev, 'plan', '10b5-1 Plan unlocked');
  }
  if (!win.open && prevWin.open) ev.push({ type: 'windowClose', d: s.d, pause: false, text: `The trading window is closed until ${dateLabel(ctx, win.opensOn)}.${s.plan ? ' Your 10b5-1 plan keeps selling.' : ''}`, data: {} });
  // month start: spending, plan sale
  const newMonth = s.d.slice(0, 7) !== prevD.slice(0, 7);
  let spent = 0;
  if (newMonth) {
    spent = SPEND;
    let need = SPEND;
    const fromCash = Math.min(s.cash, need); s.cash -= fromCash; need -= fromCash;
    const fromIdx = Math.min(s.index.units, need); s.index.units -= fromIdx; need -= fromIdx;
    if (need > 0) s.overdraft += need;
    ev.push({ type: 'spend', d: s.d, pause: false, text: `Family spending: ${moneyFull(SPEND)}.`, data: { amount: SPEND } });
    if (s.plan && s.d >= s.plan.firstTradeOn && s.plan.salesDone < s.plan.salesTotal && s.shares.free > 0) {
      const n = Math.floor(s.shares.free * s.plan.pct / 100); sellShares(s, n);
      s.plan.salesDone += 1;
      ev.push({ type: 'planSale', d: s.d, pause: false, text: `Your plan sold ${n.toLocaleString('en-US')} shares.`, data: { shares: n } });
    }
  }
  if (s.plan && !s.plan.live && s.d >= s.plan.firstTradeOn) { s.plan.live = true; ev.push({ type: 'planLive', d: s.d, pause: true, text: 'Your 10b5-1 plan is live. It sells on the first trading day of each month.', data: {} }); }
  // collar expiry
  const ex = s.collars.find((c) => c.expiry <= s.d);
  if (ex) { s.pendingEvent = { type: 'collarExpiry', d: s.d, pause: true, text: `Your collar has expired. Roll it at today’s prices or let it end.`, data: { id: ex.id } }; ev.push(s.pendingEvent); }
  // quarter-end tax
  const nextD = card.prices[s.i + 1] ? card.prices[s.i + 1][0] : null;
  if (nextD && nextD.slice(0, 7) !== s.d.slice(0, 7) && [2, 5, 8, 11].includes(Number(s.d.slice(5, 7)) - 1)) {
    const due = taxOwed(s);
    if (due > 0) { s.tax.paid += due; const f = Math.min(s.cash, due); s.cash -= f; s.index.units = Math.max(0, s.index.units - (due - f)); ev.push({ type: 'taxPaid', d: s.d, pause: false, text: `Estimated tax paid: ${money(due)}.`, data: { amount: due } }); }
  }
  // house (five-year cards, month 18)
  if (!s.live && !s.flags.houseDone && daysBetween(card.prices[0][0], s.d) >= 548) {
    s.flags.houseDone = true;
    s.pendingEvent = { type: 'house', d: s.d, pause: true, text: 'The house: $10 million is due in 30 days. How do you pay for it?', data: {} };
    ev.push(s.pendingEvent);
  }
  // margin call
  const pledgedV = s.shares.pledged * p;
  if (s.loan.balance > 0 && pledgedV > 0 && !s.loan.call && s.loan.balance / pledgedV > 0.35) {
    const toPost = s.loan.balance - 0.25 * pledgedV;
    s.loan.call = { issuedOn: s.d, deadline: addDays(s.d, 5), toPost, ltv: s.loan.balance / pledgedV };
    s.pendingEvent = { type: 'marginCall', d: s.d, pause: true, text: `Maintenance call. Loan-to-value is ${(s.loan.call.ltv * 100).toFixed(1)}%; the limit is 35%. Post ${money(toPost)} by ${dateLabel(ctx, s.loan.call.deadline)}, or the bank sells shares at that day’s close. The sale is taxable.`, data: s.loan.call };
    ev.push(s.pendingEvent);
  }
  // news
  for (const h of card.headlines) if (h.d === s.d) ev.push({ type: 'news', d: s.d, pause: false, text: h.text, data: h });
  s.history.push({ d: s.d, W: netWorth(s), S: spent, rf: 0.04 / 252, close: p });
  if (s.i >= card.prices.length - 1) { s.done = true; ev.push({ type: 'cardEnd', d: s.d, pause: true, text: 'The card has ended.', data: {} }); }
  return { state: s, events: ev };
}

function sellShares(s, n) {
  const p = priceAt(s); n = Math.min(n, s.shares.free); if (n <= 0) return 0;
  const gross = n * p, proceeds = gross * (1 - COST);
  s.shares.free -= n; s.shares.sold += n; s.tax.realized += proceeds - n * s.basis;
  if (s.autoInvest) { s.index.units += proceeds; s.index.cost += proceeds; } else s.cash += proceeds;
  return proceeds;
}

export function canDo(state, type, params = {}) {
  const s = state, card = cardOf(s), ctx = ctxOf(s), win = windowAt(card, s.d), nr = nextRelease(s);
  const no = (reason, opensOn = null) => ({ allowed: false, reason, opensOn });
  const ok = { allowed: true, reason: '', opensOn: null };
  const needFree = () => (s.shares.free > 0 ? null : no(nr ? `Locked by the lockup until ${dateLabel(ctx, nr.date)}` : 'Your remaining shares are locked or already used.', nr ? nr.date : null));
  switch (type) {
    case 'sell': { const f = needFree(); if (f) return f; if (!win.open) { const tail = s.plan ? (s.d < s.plan.firstTradeOn ? `, your plan starts selling ${dateLabel(ctx, s.plan.firstTradeOn)}.` : ', your 10b5-1 plan keeps selling.') : '.'; return no(`Window closed until ${dateLabel(ctx, win.opensOn)}${tail}`, win.opensOn); } return ok; }
    case 'adoptPlan': { const f = needFree(); if (f) return f; if (s.plan) return no('You already have a plan. One plan at a time.'); if (!win.open) return no(`Window closed until ${dateLabel(ctx, win.opensOn)}`, win.opensOn); return ok; }
    case 'cancelPlan': return s.plan ? ok : no('You have no plan.');
    case 'collar': { const f = needFree(); if (f) return f; if (!win.open) return no(`Window closed until ${dateLabel(ctx, win.opensOn)}`, win.opensOn); return ok; }
    case 'marginCall': return params.choice === 'sell' ? (s.shares.free + s.shares.pledged > 0 ? (win.open ? ok : no(`Window closed until ${dateLabel(ctx, win.opensOn)}: shares can be sold to meet the call then; posting cash is open now`, win.opensOn)) : needFree()) : ok;
    case 'pledge': return needFree() || ok;
    case 'draw': return s.shares.pledged > 0 ? ok : no('No shares are pledged yet.');
    case 'repay': return s.loan.balance > 0 ? ok : no('You have no loan.');
    default: return ok;
  }
}
export function gates(state) {
  const o = {}; for (const t of ['sell', 'adoptPlan', 'cancelPlan', 'collar', 'pledge', 'draw', 'repay', 'deposit', 'withdraw', 'buyPut', 'exchange']) o[t] = canDo(state, t);
  o.marginSell = canDo(state, 'marginCall', { choice: 'sell' });
  return o;
}

export function act(state0, action) {
  const s = clone({ ...state0, _card: null }); s._card = state0._card;
  const ev = [], fail = (error) => ({ state: state0, events: [], error });
  const p = priceAt(s), ctx = ctxOf(s);
  const need = (t) => { const c = canDo(s, t, action); return c.allowed ? null : c.reason; };
  switch (action.type) {
    case 'sell': {
      const e = need('sell'); if (e) return fail(e);
      const n = Math.floor(action.shares); if (!(n > 0) || n > s.shares.free) return fail(`You can sell up to ${s.shares.free.toLocaleString('en-US')} free shares.`);
      const proceeds = sellShares(s, n); achieve(s, ev, 'inside-the-window', 'Inside the Window');
      ev.push({ type: 'planSale', d: s.d, pause: false, text: `Sold ${n.toLocaleString('en-US')} shares for ${money(proceeds)} after costs.`, data: {} }); break;
    }
    case 'adoptPlan': { const e = need('adoptPlan'); if (e) return fail(e); s.plan = { adoptedOn: s.d, pct: action.pct, months: action.months, firstTradeOn: addDays(s.d, s.seat === 'engineer' ? 30 : 90), salesDone: 0, salesTotal: action.months, live: false }; break; }
    case 'cancelPlan': s.plan = null; break;
    case 'collar': {
      const e = need('collar'); if (e) return fail(e);
      const n = Math.min(Math.floor(action.shares), s.shares.free); if (!(n > 0)) return fail('Enter a number of free shares.');
      s.shares.free -= n; s.shares.collared += n;
      const id = 'k' + (++s._seq);
      s.collars.push({ id, shares: n, Kp: +(p * action.putPct).toFixed(2), Kc: +(p * (1.5 - (0.9 - action.putPct))).toFixed(2), start: s.d, expiry: addDays(s.d, Math.round(action.tenorMonths * 30.4)), tenorMonths: action.tenorMonths, putPct: action.putPct, mark: 0 });
      achieve(s, ev, 'floor-plan', 'Floor Plan'); break;
    }
    case 'unwindCollar': { const c = s.collars.find((c) => c.id === action.id); if (!c) return fail('No such collar.'); s.shares.collared -= c.shares; s.shares.free += c.shares; s.collars = s.collars.filter((x) => x !== c); break; }
    case 'pledge': { const e = need('pledge'); if (e) return fail(e); const n = Math.min(Math.floor(action.shares), s.shares.free); s.shares.free -= n; s.shares.pledged += n; break; }
    case 'unpledge': { const n = Math.min(Math.floor(action.shares), s.shares.pledged); if (s.loan.balance > 0.25 * (s.shares.pledged - n) * p) return fail('The loan is too large to release those shares.'); s.shares.pledged -= n; s.shares.free += n; break; }
    case 'draw': { const max = 0.25 * s.shares.pledged * p - s.loan.balance; if (!(action.amount > 0) || action.amount > max) return fail(`You can draw up to ${money(Math.max(0, max))}.`); s.loan.balance += action.amount; s.cash += action.amount; break; }
    case 'repay': { const a = Math.min(action.amount, s.loan.balance, s.cash); s.loan.balance -= a; s.cash -= a; if (s.loan.call && s.loan.balance <= 0.25 * s.shares.pledged * p + 1) { s.loan.call = null; s.pendingEvent = null; } break; }
    case 'deposit': { const a = Math.min(action.amount, s.cash); s.cash -= a; s.index.units += a; s.index.cost += a; break; }
    case 'withdraw': { const a = Math.min(action.amount, s.index.units); s.index.units -= a; s.cash += a; break; }
    case 'setAutoInvest': s.autoInvest = !!action.on; break;
    case 'house': {
      if (!s.pendingEvent || s.pendingEvent.type !== 'house') return fail('There is no house bill to settle.');
      if (action.choice === 'cash') { let need = 1e7; const c = Math.min(s.cash, need); s.cash -= c; need -= c; s.index.units = Math.max(0, s.index.units - need); }
      else if (action.choice === 'credit') { const max = 0.25 * s.shares.pledged * p - s.loan.balance; if (max < 1e7) return fail('Your credit line is too small for that.'); s.loan.balance += 1e7; }
      else if (action.choice === 'sell') { const e = need('sell'); if (e) return fail(e); const n = Math.min(s.shares.free, Math.ceil(1e7 / (p * (1 - COST)))); sellShares(s, n); }
      s.pendingEvent = null; break;
    }
    case 'collarExpiry': {
      const c = s.collars.find((c) => c.id === (s.pendingEvent && s.pendingEvent.data.id)); if (!c) return fail('There is no collar to settle.');
      const pay = c.shares * (Math.max(c.Kp - p, 0) - Math.max(p - c.Kc, 0)); s.cash += pay; s.tax.realized += pay;
      s.shares.collared -= c.shares; s.shares.free += c.shares; s.collars = s.collars.filter((x) => x !== c);
      if (action.choice === 'roll' && s.shares.free >= c.shares && windowAt(cardOf(s), s.d).open) { s.shares.free -= c.shares; s.shares.collared += c.shares; s.collars.push({ ...c, id: 'k' + (++s._seq), Kp: +(p * c.putPct).toFixed(2), Kc: +(p * 1.4).toFixed(2), start: s.d, expiry: addDays(s.d, Math.round(c.tenorMonths * 30.4)) }); }
      s.pendingEvent = null; break;
    }
    case 'marginCall': {
      if (!s.loan.call) return fail('There is no maintenance call.');
      if (action.choice === 'post') {
        let need = s.loan.call.toPost; const c = Math.min(s.cash, need); s.cash -= c; need -= c; const x = Math.min(s.index.units, need); s.index.units -= x; need -= x;
        if (need > 1) return fail('You do not have enough cash and index fund to post that amount.');
        s.loan.balance -= s.loan.call.toPost; s.loan.call = null; achieve(s, ev, 'cured', 'Cured');
      } else if (action.choice === 'sell') {
        const e = need('sell'); if (e) return fail(e);
        const n = Math.min(s.shares.pledged, Math.ceil(s.loan.call.toPost / (p * (1 - COST - TAX * 0.99))));
        s.shares.pledged -= n; s.shares.free += n; const pr = sellShares(s, n); s.cash += s.index.units * 0; s.loan.balance = Math.max(0, s.loan.balance - pr); s.loan.call = null;
      }
      s.pendingEvent = null; break;
    }
    default: return fail('That move is not available yet.');
  }
  s.log.push({ ...action, d: s.d });
  const last = s.history[s.history.length - 1]; if (last) last.W = netWorth(s);
  return { state: s, events: ev };
}

export function snapshot(state) {
  const s = state, card = cardOf(s), p = priceAt(s), ctx = ctxOf(s), n = card.prices.length;
  const win = windowAt(card, s.d), pledgedV = s.shares.pledged * p;
  const W = netWorth(s);
  return {
    d: s.d, i: s.i,
    dayLabel: s.live ? `Day ${s.i + 1} of ${n} so far` : `Year ${Math.floor(s.i / 252) + 1} of 5 · Month ${Math.floor((s.i % 252) / 21) + 1}`,
    close: p, offerPrice: card.ipo.offerPrice, shares: { ...s.shares, total: s.total }, cash: s.cash, overdraft: s.overdraft,
    index: { value: indexValue(s), units: s.index.units, cost: s.index.cost },
    loan: { balance: s.loan.balance, ltv: pledgedV ? s.loan.balance / pledgedV : 0, maxDraw: Math.max(0, 0.25 * pledgedV - s.loan.balance), call: s.loan.call },
    collars: s.collars.map((c) => ({ ...c, mark: 0 })), puts: s.puts, plan: s.plan, exchange: s.exchange, taxOwed: taxOwed(s),
    W, profit: W - s.W0, window: win, nextRelease: nextRelease(s), gates: gates(s),
  };
}

export function score(state) {
  const h = state.history, r = [];
  for (let k = 1; k < h.length; k++) r.push((h[k].W + h[k].S) / h[k - 1].W - 1);
  const m = r.reduce((a, b) => a + b, 0) / (r.length || 1), sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, r.length - 1)) || 1;
  let peak = 0, dd = 0, v = 1; const V = [1]; for (const x of r) { v *= 1 + x; V.push(v); }
  for (const x of V) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
  const finalW = h[h.length - 1].W;
  return { sharpe: m / sd * Math.sqrt(252), maxDrawdown: { pct: dd, peakDate: null, troughDate: null }, irr: 0, afterTaxWealth: finalW, totalSpending: h.reduce((a, b) => a + b.S, 0), taxesPaid: state.tax.paid, finalW, unrealizedTax: 0, days: h.length, flows: [] };
}

export function runBot(botId, card, seat) {
  let s = createGame({ card, seat });
  let guard = 0;
  while (!s.done && guard++ < 5000) {
    let r = tick(s); s = r.state;
    if (s.pendingEvent) { const t = s.pendingEvent.type; s = act(s, t === 'house' ? { type: 'house', choice: 'cash' } : t === 'collarExpiry' ? { type: 'collarExpiry', choice: botId === 'playbook' ? 'roll' : 'end' } : { type: 'marginCall', choice: 'post' }).state; }
    const cd = canDo(s, 'sell');
    if (botId === 'seller' && cd.allowed) s = act(s, { type: 'sell', shares: s.shares.free }).state;
    if (botId === 'playbook') {
      if (!s.plan && canDo(s, 'adoptPlan').allowed) s = act(s, { type: 'adoptPlan', pct: 5, months: 12 }).state;
      if (s.shares.free > 0 && cd.allowed && r.events.some((e) => e.type === 'release')) {
        const third = Math.floor(s.shares.free / 3);
        s = act(s, { type: 'sell', shares: third }).state;
        if (canDo(s, 'collar').allowed && third > 0) s = act(s, { type: 'collar', shares: third, tenorMonths: 12, putPct: 0.85 }).state;
      }
    }
  }
  return { state: s, series: s.history.map((h) => h.W), score: score(s) };
}

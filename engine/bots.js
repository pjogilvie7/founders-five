// bots.js: the three rivals (PRD 4.8). Same engine, same card, same seat. Deterministic.
import {
  createGame, canDo, act, runWithPolicy, score, wealthParts, getCtx, HOUSE, SPEND, COST,
} from "./sim.js";

export const BOTS = ["holder", "seller", "playbook"];
export const BOT_LABELS = { holder: "The Holder", seller: "The Seller", playbook: "The Playbook" };

// On the first trading day of each month the Seller and the Playbook put cash above a year of spending (12 * SPEND) into the
// index fund, never borrowed money (cash less the loan and the overdraft stays at or above zero). Returns the deposit action or null.
function monthlyDeposit(s) {
  if (!getCtx(s).ftdom.has(s.i)) return null;
  const owed = (s.loan.balance + s.loan.accrued) + s.overdraft + s.overdraftAccrued;
  const amount = Math.min(s.cash - 12 * SPEND, s.cash - owed);
  if (!(amount > 0.005)) return null;
  return canDo(s, "deposit", { amount }).allowed ? { type: "deposit", amount } : null;
}

const liquid = (s) => {
  const p = wealthParts(s);
  return p.cash + p.index - p.overdraft;
};

// House: cash and index if they cover it, else sell if the window allows, else the credit line, else cash on the overdraft.
function houseAnswer(s, e) {
  const d = e.data;
  if (d.liquid >= HOUSE) return { type: "house", choice: "cash" };
  if (d.canSell) return { type: "house", choice: "sell" };
  if (d.headroom >= HOUSE) return { type: "house", choice: "credit" };
  return { type: "house", choice: "cash" };
}

function baseRespond(s, e) {
  if (e.type === "house") return houseAnswer(s, e);
  if (e.type === "marginCall") return { type: "marginCall", choice: "post" };
  if (e.type === "collarExpiry") return { type: "collarExpiry", choice: "end" };
  return null;
}

// The Holder sells only what spending and the house need, from released shares in open windows. No hedges, no loans.
function holder() {
  return {
    respond: baseRespond,
    day(s) {
      if (s.done || s.shares.free <= 0) return null;
      const ctx = getCtx(s);
      const g = canDo(s, "sell");
      if (!g.allowed) return null;
      let target = 12 * SPEND; // a year of spending as cash and index
      if (!s.flags.houseDone && ctx.houseIdx >= 0 && s.i >= ctx.houseIdx - 126) target += HOUSE;
      const have = liquid(s);
      if (have >= target) return null;
      const P = ctx.close[s.i];
      const n = Math.min(g.max, Math.ceil((target - have) / (P * (1 - COST))));
      return n > 0 ? { type: "sell", shares: n } : null;
    },
  };
}

// The Seller sells every released share at the first open-window close, and from the first release runs a 10% monthly plan to
// sell through blackouts. Cash above a year of spending goes into the index fund on the first trading day of each month.
function seller() {
  const step = (s) => {
    if (s.done) return null;
    const out = [];
    // a plan is adopted only once a tranche has released: with every share locked there is nothing for it to sell
    const released = s.total - s.shares.locked;
    if (!s.plan && released > 0 && canDo(s, "adoptPlan", { pct: 10, months: 18 }).allowed) out.push({ type: "adoptPlan", pct: 10, months: 18 });
    const g = canDo(s, "sell");
    if (g.allowed && g.max > 0) out.push({ type: "sell", shares: g.max });
    // the deposit is sized after today's actions on a copy, so a sale made on a month's first trading day is deposited too
    let cur = s;
    for (const a of out) { const r = act(cur, a); if (!r.error) cur = r.state; }
    const dep = monthlyDeposit(cur);
    if (dep) out.push(dep);
    return out;
  };
  return { respond: baseRespond, start: step, day: step };
}

// The Playbook: at each release sells a third, collars a third (85%, 12 months, rolled), holds a third. Once the first
// release's collar is placed and nothing is left to collar, it adopts a 5% monthly plan. A live or cooling-off plan voids
// the defense of any new hedge (Rule 10b5-1(c)(1)(i)(C)), so while a plan runs it never collars: a later release has a third
// sold and a third held, and the third that would have been collared is held. A collar that cannot roll (window closed) is
// re-set at the next open window, unless a plan is then running.
function playbook() {
  const mem = { processed: 0, collarOwed: 0 };
  const step = (s) => {
    if (s.done) return null;
    const out = [];
    let cur = s;
    const run = (a) => {
      const r = act(cur, a);
      if (r.error) return false;
      cur = r.state; out.push(a); return true;
    };
    const released = cur.total - cur.shares.locked;
    const g = canDo(cur, "sell");
    if (g.allowed && released > mem.processed) {
      const batch = released - mem.processed;
      const third = Math.floor(batch / 3);
      mem.processed = released;
      if (third > 0) {
        const n = Math.min(third, g.max);
        if (n > 0) run({ type: "sell", shares: n });
        if (!cur.plan) mem.collarOwed += third; // with a plan running, that third is simply held
      }
    }
    if (cur.plan) mem.collarOwed = 0;
    if (mem.collarOwed > 0 && cur.shares.free > 0) {
      const n = Math.min(mem.collarOwed, cur.shares.free);
      const cd = canDo(cur, "collar", { shares: n, tenorMonths: 12, putPct: 0.85 });
      if (cd.allowed) {
        if (run({ type: "collar", shares: n, tenorMonths: 12, putPct: 0.85 })) mem.collarOwed -= n;
      } else if (cd.quote && cd.quote.error) mem.collarOwed = 0; // a band the quote cannot meet: hold instead
    }
    if (!cur.plan && released > 0 && mem.processed >= released && mem.collarOwed <= 0 && canDo(cur, "adoptPlan", { pct: 5, months: 18 }).allowed) {
      run({ type: "adoptPlan", pct: 5, months: 18 });
    }
    const dep = monthlyDeposit(cur);
    if (dep) run(dep);
    return out; // actions already applied to `cur` only for planning; runWithPolicy re-applies them to the real state
  };
  return {
    respond(s, e) {
      if (e.type === "collarExpiry") {
        if (e.data.canRoll) return { type: "collarExpiry", choice: "roll" };
        if (!s.plan) mem.collarOwed += e.data.shares;
        return { type: "collarExpiry", choice: "end" };
      }
      return baseRespond(s, e);
    },
    start: step,
    day: step,
  };
}

export function botPolicy(botId) {
  if (botId === "holder") return holder();
  if (botId === "seller") return seller();
  if (botId === "playbook") return playbook();
  throw new Error(`Unknown bot: ${botId}`);
}

// Run a bot to the end of the card. series[i] = W on day i; events[i] = every event on day i (ticks and the bot's actions).
export function runBot(botId, card, seat, market, spcxOptions = null, opts = {}) {
  const start = createGame({ card, seat, market, spcxOptions, opts });
  const events = [];
  const state = runWithPolicy(start, botPolicy(botId), (todays) => { events.push(todays); });
  return { state, series: state.history.map((r) => r.W), events, score: score(state) };
}

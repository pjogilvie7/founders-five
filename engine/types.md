# Founder's Five: contracts (binding for every builder)

Spec: `../prd/PRD.md` (sections 4 to 11 binding). Facts: `../prd/QUESTIONS.md` "Decided by the facts" 1 to 25. If this file and the PRD disagree, the PRD wins; tell the orchestrator.

Everything is plain ES modules, no build step, no dependencies. The engine runs unchanged in Node 20+ (`node --test`) and the browser. **The UI never computes money**: every number on screen comes from the engine.

Dates are ISO strings `"YYYY-MM-DD"` everywhere. Money is a JS number in dollars, never rounded inside the engine (round only for display). Rates in data files are percents (4.06 means 4.06%).

---

## 1. Data files (written by scripts, read by the app)

```
data/meta.json          {asOf:"2026-10-30", lastRun:"ISO", schema:1, spcxTradingDays: 98}
data/update-log.json    [{run:"ISO", ok:true, changed:["SPCX +1 day","DGS1MO"], error:null}]   (newest first, last 60)
data/market.json        {spy:[[d,adjClose]], rates:{dgs1mo:[[d,pct]], dgs1:[[d,pct]], sofr:[[d,pct]]}}
                        spy from 2018-12-01 to asOf; rates from 2018-12-01 (sofr from its start, 2018-04-03). Missing FRED values ('.') are skipped.
data/spcx-options.json  {asOf, iv30, smile:[{expiry, strikePct, iv}], streetCheck:{modelCap, marketCap, floor, spot, vol, method, asOf}}
data/cards/index.json   [{id, blind, label, vignette, revealVignette, tradingDays}]   label is "SpaceX (SPCX)" for the live card, "Card 1".."Card 6" for blind ones
data/cards/{id}.json    full card, below
data/universe.json      {rule, seed, sortedTickers:[...], included:[{ticker, name, pricingDate, offerPrice, proceedsUSD, url424b4}], excluded:[{ticker, reason}], drawOrder:[...], drawn:[...]}
```

### Card JSON (`data/cards/{id}.json`), assembled by `scripts/build-cards.mjs`

```
{
  id: "spcx" | "c1".."c6",          // blind ids never contain the ticker
  blind: false|true,
  live: true|false,                 // only spcx is live
  name, ticker, industry,
  vignette: "assets/vignettes/....png", revealVignette: "assets/vignettes/....png",
  ipo: {offerPrice, pricingDate, firstTrade, proceedsUSD, sharesOutPost, source:{url, page}},
  prices: [[d, close, adjClose, volume]],      // close = split-adjusted raw close (Yahoo "close"); adjClose = dividend+split adjusted
                                               // five-year cards: exactly first trade .. day 1,260 (1,261 rows, index 0 = first trade)
                                               // spcx: first trade .. asOf, grows nightly
  earnings: [{d, url}],             // 8-K Item 2.02 filing dates, ascending, whole window plus the one before the first trade if any
  reports:  [{d, form, url}],       // 10-Q and 10-K filing dates, ascending
  lockup: {groups:[{id, seats:["engineer"|"founder"], label, tranches:[{
      id, pct,                      // percent of the player's locked shares, groups sum to 100
      trigger: {type:"date", date}
             | {type:"calendarDaysAfter", days, from:"pricingDate"|"firstTrade", onOrAfter:true}
             | {type:"afterEarnings", n:1, tradingDaysAfter:2}          // nth earnings release after IPO
             | {type:"priceCondition", pct:30, of:"offerPrice", daysMet:5, window:10, endsOn:"firstEarnings"}
             | {type:"remainder", days, from:"pricingDate"},
      quote, page, resolvedDate,    // resolvedDate null = never releases (condition failed)
      readA, readB, reconciled:true, human:{status:"pending"|"signed", by:null, date:null}
  }]}]},
  headlines: [{d, text, source, nameFilter:"pass", review:"pass"}],   // blind cards: 8; spcx: may be [] or real 8-K items
  reveal: {text, numbersChecked:true},
  notes: []                         // anything the builder wants a human to see
}
```

### Source layout (each piece owned by one task; `build-cards.mjs` merges)
```
data/src/{id}/base.json       // everything except lockup/headlines/reveal  (T1 for spcx, T2 for blind cards)
data/src/{id}/lockup-readA.json, lockup-readB.json   // independent machine reads (T3a, T3b)
data/src/{id}/lockup.json     // reconciled {groups:[...]} (T3c)
data/src/{id}/headlines.json  // [{d,text,source,nameFilter,review}] (T8)
data/src/{id}/reveal.json     // {text, numbersChecked} (T8)
assets/art-manifest.json      // {spcx:{vignette, revealVignette}, neutral:[6 paths], revealByIndustry:{software, consumer, fintech, health, mobility, travel, other}, title, rivals:{holder,seller,playbook}, icons:{stock,plan,collar,credit,cash,put,exchange,rules}} (T5)
```
`build-cards.mjs` writes `data/cards/{id}.json` and `data/cards/index.json` only for cards whose `lockup.json` exists and reconciled. A card with no reconciled lockup is not shipped.

---

## 2. Engine API (`engine/*.js`)

### pricing.js (T4)
```
normCdf(x)
bsPrice({type:"put"|"call", S, K, T, r, vol})          // r continuous? NO: r is the annual rate as a decimal (0.04), used as continuous rate e^{-rT}
zeroCostCall({S, Kp, T, r, volPut, volCall})           // bisection on [S, 5S] to $0.01; returns {Kc, putPrice, callPrice}
realizedVol(closes /* array of numbers, oldest first */) // stdev of daily log returns, sample, * sqrt(252)
baseVol(closes, i)                                      // max(realized over last 60 days ending i (min 20; fewer -> since IPO), 0.30) * 1.10
skewVols(base) -> {put: base + 0.015, call: base - 0.015}
```
Golden test 1: S 134.72, K 114.512, T 1, r 0.04, vol 0.537: put 15.325 ± 0.01; zero-cost call 186.99 ± 0.05 (same vol both legs).

### metrics.js (T4)
```
dailyRf(pct) -> (1 + pct/100)^(1/252) - 1
sharpe(returns, rfs)          // mean(R-rf)/sampleStdev(R-rf)*sqrt(252)
maxDrawdown(values, dates?)   -> {pct (negative, e.g. -0.25), peakIndex, troughIndex, peakDate, troughDate}
xirr(flows:[{d, amount}])     // 365-day year, Newton with bisection fallback; returns decimal (0.10)
```

### tax.js (T4)
```
RATE = 0.238
saleTax({shares, price, basis, costRate=0}) -> {proceeds, cost, gain, tax}   // gain = shares*price*(1-costRate) - shares*basis
// test 9: saleTax({shares:100000, price:150, basis:1.35}).tax === 3537870
```
Engine tax ledger: cumulative net realized gain G (sales, collar/put settlements, index withdrawals); owed = 0.238 * max(0, G); on the last trading day of each calendar quarter the engine pays (owed - paidSoFar) if positive. Unpaid owed tax is a liability in W_t.

### calendar.js (T4)
```
addCalendarDays(d, n), daysBetween(a, b)
tradingIndexOnOrAfter(prices, d)      // first index with date >= d, or -1
nthTradingDayAfter(prices, d, n)      // the nth trading day strictly after date d (n=2 -> "second full trading day after")
businessDaysAfter(d, n)               // weekdays only (no holiday list) for deadlines and cooling-off
windowState(prices, earnings, i, opts) -> {open, closesOn, opensOn, projected}
   // closed from 30 calendar days before each earnings date (inclusive) until the start of the 2nd trading day after it.
   // For a live card, if the last earnings date + 91 days is beyond the last price, project the next release at last + 91 (projected:true).
```

### lockup.js (T7)
```
resolveTranches(card, groupId) -> [{id, pct, date|null}]      // recompute resolvedDate from trigger; tests compare with stored resolvedDate
groupForSeat(card, seat) -> group | null                       // null => seat not playable on this card (show reason)
```

### sim.js (T7): the game
```
createGame({card, seat:"engineer"|"founder", market, spcxOptions?, opts?:{autoInvest:true}}) -> state
tick(state) -> {state, events}          // advances one trading day; applies scheduled things; returns events for that day
act(state, action) -> {state, events, error?}   // pure; never mutates input; error is a user-facing string if disallowed
canDo(state, actionType, params?) -> {allowed, reason, opensOn}   // reason is plain English shown on the control; opensOn ISO date or null
gates(state) -> {sell, adoptPlan, cancelPlan, collar, pledge, draw, repay, deposit, withdraw, buyPut, exchange: canDo results}
snapshot(state) -> plain object for the UI (see below)
runToEnd(state, policy?) -> state       // for bots and "watch a run"
score(state) -> Score
normalizeCard(card) -> card             // blind cards: price factor f = 100/offerPrice; close, adjClose, offerPrice times f;
                                        // volume and sharesOutPost divided by f. So every blind card starts at $100 and 1,000,000 shares.
```

**Normalization.** Blind cards are always played normalized (prices indexed so the offer = $100). SpaceX is not normalized.

**State (JSON-serializable, deterministic, no Date.now, no Math.random):**
```
{
  cardId, seat, blind, live, i /* index into prices */, d /* date */, done,
  total, basis,                                   // shares at start, basis per share (1% of offer)
  shares:{locked, free, collared, pledged, sold, exchanged},   // a partition: sums to total every day
  cash, overdraft, autoInvest,
  index:{units, cost},                            // SPY adjClose units; average cost
  loan:{balance, accrued, call:null|{issuedOn, deadline, toPost, ltv}},
  collars:[{id, shares, Kp, Kc, start, expiry, tenorMonths, putPct}],
  puts:[{id, shares, K, expiry, premium}],
  plan:null|{adoptedOn, pct, months, firstTradeOn, salesDone, salesTotal},
  exchange:{value, basisShares, contributedOn}|null,
  tax:{realized, paid},
  log:[action...],                                // every accepted action with its date, for determinism and share codes
  history:[{d, W, S, rf, close}],                 // one row per trading day played
  flags:{houseDone, seenTranches:[], firstUse:{}, achievements:[]},
  pendingEvent: null | event                      // set when the clock must pause for a choice (house, collar expiry, margin call)
}
```

**Actions** (`act`):
```
{type:"sell", shares}
{type:"adoptPlan", pct:2|5|10, months:6|12|18}     {type:"cancelPlan"}
{type:"collar", shares, tenorMonths:6|12|24, putPct:0.80|0.85|0.90}    {type:"unwindCollar", id}
{type:"pledge", shares}  {type:"unpledge", shares}  {type:"draw", amount}  {type:"repay", amount}
{type:"deposit", amount} {type:"withdraw", amount}  {type:"setAutoInvest", on}
{type:"house", choice:"cash"|"credit"|"sell"|"skip"}
{type:"marginCall", choice:"post"|"sell"|"wait"}    // post = repay from cash then index to bring LTV to 25%
{type:"collarExpiry", choice:"roll"|"end"}
{type:"buyPut", shares, putPct, tenorMonths:6|12}   // should-have
{type:"exchange", shares}                            // should-have
```

**Events** (`tick` and `act` return `[{type, d, pause, text, data}]`):
`release` (pause), `windowOpen` (pause), `windowClose`, `planLive` (pause), `planSale`, `collarExpiry` (pause, choice), `marginCall` (pause, choice), `forcedSale`, `house` (pause, choice), `taxPaid`, `spend`, `toolUnlock` (pause on first unlock of each tool: shows the lesson), `news` (headline on its date), `achievement`, `cardEnd`.
`text` is the exact player-facing copy (PRD 5.7 voice: plain, second person, no "recommended", no exclamation marks).

**Snapshot** (what the UI renders):
```
{ d, i, dayLabel /* "Year 2 of 5 · Month 4" or "Day 98 of 98 so far" */, close, offerPrice,
  shares, cash, overdraft, index:{value, units, cost}, loan:{balance, ltv, maxDraw, call}, collars:[...with mark], puts:[...],
  plan, exchange, taxOwed, W, profit /* W - W0 */, window:{open, closesOn, opensOn, projected},
  nextRelease:{date, pct}|null, gates, rivals?:{holder, seller, playbook} /* W of each bot on day i */ }
```

### loan.js (T7)
```
maxAdvance(collateralValue) = 0.25 * value     // collared pledged shares: 0.70 * put floor value (should-have)
ltv(balance, collateralValue)
callCure(balance, collateralValue) -> amount to repay so LTV = 25%
fallToCall(from = 0.25, to = 0.35) -> 1 - from/to (28.57%)
netPerShare(price, costRate) -> price * (1 - costRate)   // cash applied to the loan per share sold; tax is NOT withheld
forcedSaleShares(balance, price, pledgedShares, costRate) -> fewest whole shares n (capped at pledged) with balance - n*a <= 0.25*(pledged - n)*price, a = netPerShare; n = (balance - 0.25*C) / (a - 0.25*price)
```
Rate SOFR + 2.00%, accrued daily as balance * rate * (calendar days since the previous trading day)/365, capitalized on the first trading day of each month. Call when LTV > 35%; deadline 3 business days; if still > 35% at that day's close, the bank sells (ignores windows). The sale's tax goes on the client's ledger like any sale; the bank applies proceeds net of the 0.25% cost only.

### bots.js (T7)
```
BOTS = ["holder","seller","playbook"]
runBot(botId, card, seat, market, spcxOptions?) -> {state, series:[W...], score}
```
The UI calls `runBot` for all three at game start and shows `series[i]` live.

### metrics -> Score (`score(state)`)
```
{ sharpe, maxDrawdown:{pct, peakDate, troughDate}, irr, afterTaxWealth, totalSpending, taxesPaid,
  finalW, unrealizedTax, days, flows:[{d, amount}] }
```
Formulas: PRD 4.8 verbatim. W_t: PRD 4.8. R_t = (W_t + S_t)/W_{t-1} - 1.

### debrief.js (T7)
```
debrief(state, score, botScores) -> {paragraphs:[3 strings], verdict:"You beat The Seller on 3 of 4 measures."}
```

---

## 3. Game rules the sim enforces (summary; PRD 4 is the source)

- Start: shares = round(100,000,000 / offerPrice) (all locked); basis = 1% of offer; cash $3,000,000; autoInvest on.
- Each trading day i: interest on cash (DGS1MO, daily rf), loan accrual, releases, spending (first trading day of each month: $166,667 from cash -> credit line if pledged headroom -> overdraft at SOFR+4%), plan sales, collar/put expiries, margin checks, quarter-end tax, house (five-year cards, first trading day on/after firstTrade + 18 months), news, W_t.
- Actions settle at day i's close. Sales cost 0.25% of proceeds. Proceeds -> cash -> index fund if autoInvest.
- Seats: engineer = lockup, window, 30-day cooling-off. Founder = lockup, window, D&O cooling-off (later of 90 days or 2 business days after the next 10-Q/10-K, cap 120), Rule 144 volume cap (rolling 3 months: greater of 1% of sharesOutPost or average weekly volume over the prior 4 calendar weeks), no sale before IPO day 91.
- SpaceX founder seat: not playable: "The founder's shares are locked until June 12, 2027 (424B4)."
- Gated controls always say why and when: "Locked by the lockup until Aug 6", "Window closed until Feb 4: a 10b5-1 plan can still sell", "Cooling-off: plan trades from Nov 23".

## 4. UI contracts (T6 owns the shell; tabs plug in)

```
ui/data.js      loadAll() -> {meta, log, market, cardsIndex, spcxOptions}; loadCard(id)
ui/format.js    money(x) "$131.4M" / "$2,140,000"; pct(x, dp); dateLabel(state, d) (blind: "Day 214"/"Year 2 · Month 4"; spcx: "Aug 6")
ui/store.js     tiny pub/sub: getState(), setState(fn), subscribe(fn)
Tab module:     export default { id:"stock", label:"Stock", icon:"assets/icons/seal.png", hotkey:"1",
                  lesson:[{title, body}x3], render(container, snapshot, api) }
                api = { act(action), canDo(type, params), pause(), resume(), openLesson(id) }
```
Stylesheets: `app.css` (T6), `ui/pages.css` (T11), `ui/tabs/tabs.css` (T9), `ui/scoreboard.css` (T10); index.html links all four.
Design tokens: `app.css` `:root` (PRD 5.1). Only those tokens; no Stax pig, top hat, "Stax" wordmark, olive palette or copied text.

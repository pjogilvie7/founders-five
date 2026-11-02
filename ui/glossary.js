// Founder's Five: glossary (T11). Plain ES module, no dependencies.
//
//   GLOSSARY            {term: {short, long}}   short = one sentence for hovers, long = Glossary page
//   term(name, label?)  -> HTML string: a keyboard-focusable span with a tooltip. Use it inside template
//                          literals that go through innerHTML.
//   termEl(name, label?) -> the same thing as a DOM element.
//   lookup(name)        -> {key, short, long} or null (case-insensitive, accepts aliases)
//
// Copy rules: plain, second person where it addresses the player, no advice.

export const GLOSSARY = {
  "Lockup": {
    short: "An agreement made at the IPO that bars insiders and employees from selling, pledging or hedging their shares until set dates.",
    long: "Underwriters usually ask insiders and employees to sign a lockup before an IPO. It bars selling, pledging and hedging the shares for a set period, and many lockups release the shares in steps. In the game every date comes from the card's 424B4 prospectus, and locked shares cannot be sold, hedged, pledged or contributed to an exchange fund."
  },
  "Tranche": {
    short: "One slice of a lockup release, such as 20% of your locked shares on a given date.",
    long: "A lockup that releases in steps is a ladder of tranches. Each tranche has a share of your locked stake and a trigger: a date, a number of days after the IPO, a number of trading days after an earnings release, or a price condition. The Method page lists every tranche on every card, with the prospectus quote and page."
  },
  "Trading window": {
    short: "The stretch of the calendar when a company's policy lets insiders and employees trade its stock.",
    long: "Most companies close the window around earnings. In the game the window is closed from 30 calendar days before each earnings release until the start of the second trading day after it. You can make discretionary sales and adopt plans or hedges only while it is open. The window dates use real 8-K Item 2.02 filing dates; the rule itself is a game term."
  },
  "Blackout": {
    short: "A period when the trading window is closed and you cannot make discretionary sales.",
    long: "During a blackout you cannot sell on your own, adopt a 10b5-1 plan or open a hedge. A plan that was adopted earlier and has finished its cooling-off keeps selling through a blackout, which is the main reason people use one."
  },
  "10b5-1 plan": {
    short: "A written plan, adopted while you hold no inside information, that sells shares on a preset schedule.",
    long: "SEC Rule 10b5-1 gives a defense against insider-trading claims for trades made under a plan adopted in good faith before you were aware of material nonpublic information. In the game you adopt a plan only in an open window, choose a share of your free stock to sell each month for 6, 12 or 18 months, and wait out a cooling-off period before the first trade. Only one plan can run at a time, and changing a plan starts a new one."
  },
  "Cooling-off": {
    short: "The waiting period between adopting a 10b5-1 plan and its first trade.",
    long: "For an early employee who is not an officer or director it is 30 days. For a director or officer it is the later of 90 days after adoption or two business days after the 10-Q or 10-K for the quarter of adoption, capped at 120 days (17 CFR 240.10b5-1(c)(1)(ii)(B)). The rail shows the date the first trade can happen."
  },
  "Affiliate": {
    short: "Someone who controls the company, is controlled by it, or is under common control with it, such as a founder, officer or director.",
    long: "Affiliates face extra limits when they resell stock under Rule 144: a volume cap, and in the game no sales before day 91 after the IPO. A non-affiliate who has held the shares for more than a year faces no Rule 144 volume cap. The Founder-CEO seat is an affiliate; the Early engineer seat is not."
  },
  "Rule 144": {
    short: "The SEC rule that sets conditions for reselling restricted and control shares, including a volume cap for affiliates.",
    long: "In any rolling three months, an affiliate's sales may not exceed the greater of 1% of shares outstanding or the average weekly trading volume over the prior four calendar weeks (17 CFR 230.144(e)). On a large IPO a $100 million stake never reaches the cap, and the game says so when it checks. The affiliate also cannot sell before the issuer has been reporting for 90 days."
  },
  "Zero-cost collar": {
    short: "A put you buy and a call you sell on the same shares, with strikes set so the call premium pays for the put.",
    long: "The put sets a floor under your shares and the call sets a cap above them, so nothing changes hands up front. You keep the shares, but you give up the gains above the call strike. In the game the put is at 80, 85 or 90% of today's close and the call strike is solved so the model price is zero. The band has to stay at a put of at most 90% and a call of at least 110%."
  },
  "Put": {
    short: "An option that gives you the right to sell shares at the strike price on or before its expiry.",
    long: "A put gains value as the stock falls below its strike, which is why it works as a floor. Its price depends on the stock price, the strike, the time left, the interest rate and implied volatility. The game prices puts with Black-Scholes."
  },
  "Call": {
    short: "An option that gives its holder the right to buy shares at the strike price on or before its expiry.",
    long: "In a collar you sell a call. If the stock finishes above the call strike you pay the difference per share, so your gains above that strike are capped. The premium you collect pays for the put."
  },
  "Implied volatility": {
    short: "The yearly volatility that makes an option-pricing model match an option's market price.",
    long: "Implied volatility is read backwards from option prices rather than measured from past returns. On the SpaceX card the game reads it from listed options at each strike; on every other date it uses trailing realized volatility with a floor and a small skew."
  },
  "Securities-based line of credit": {
    short: "A loan secured by your securities that you can draw on as needed, usually barred from buying more securities.",
    long: "Lenders advance a percentage of the collateral's value and can call the loan when the value falls. FINRA notes that these lines are typically callable on demand and restricted from buying securities. In the game the advance is 25% of the pledged shares' value, the rate is SOFR plus 2.00%, and only released shares can be pledged."
  },
  "Loan-to-value": {
    short: "The loan balance divided by the current value of the collateral.",
    long: "At a 25% advance, a loan starts at 25% loan-to-value. As the shares fall, the ratio rises. In the game a maintenance call comes when it passes 35%, which happens after a fall of about 28.6% from the day you borrowed the full advance."
  },
  "Maintenance call": {
    short: "A demand from the lender to add collateral or repay when loan-to-value goes above the limit.",
    long: "In the game you get 3 business days. You can post cash to bring loan-to-value back to 25%, sell shares if the window is open, or let the bank sell. If the ratio is still above 35% at that day's close, the bank sells enough pledged shares to bring the loan to 25% of what remains, ignoring the trading window, and the sale is taxable."
  },
  "Exchange fund": {
    short: "A private fund where many holders swap concentrated stock for shares in a diversified pool, without tax at the swap.",
    long: "You contribute shares and receive an interest in the pool; your tax basis carries over. Under the rules the game follows, leaving before seven years returns your own shares rather than a diversified payout, so there is no tax-free exit inside a five-year card. At the end of a card the game values the interest net of the embedded tax. The seven-year figure rests on secondary sources and is not confirmed at the statute."
  },
  "Sharpe ratio": {
    short: "Average return above the risk-free rate, divided by the volatility of that excess return, scaled to a year.",
    long: "The game uses daily returns that include spending, subtracts the daily risk-free rate from the 1-month Treasury yield, divides the mean by the sample standard deviation and multiplies by the square root of 252. It is shown to one decimal. One path is noisy, so the ratio is a comparison between strategies on the same card, not a forecast."
  },
  "Max drawdown": {
    short: "The largest fall from a peak to a later low in your spending-adjusted wealth.",
    long: "The game builds an index of your wealth that ignores the money your family spends, then finds the largest peak-to-trough fall and shows it as a percent with both dates. A deep drawdown matters for a concentrated holder because there is little else in the portfolio to offset it."
  },
  "IRR": {
    short: "The yearly rate that makes the present value of all your cash flows equal zero.",
    long: "The game uses XIRR on actual dates with a 365-day year. The flows are your starting wealth going in, each month's spending coming out, and your final wealth, less tax on unrealized gains, at the end. It measures return with timing, so spending early costs more than spending late."
  },
  "Basis": {
    short: "What your shares are treated as costing you for tax; your taxable gain is the sale price less basis.",
    long: "Early employees and founders often hold shares with a very low basis. In the game it is 1% of the offer price per share, so almost all of a sale is taxable gain. Index fund purchases use their actual cost, averaged."
  },
  "Long-term capital gains": {
    short: "Gains on assets held more than a year, taxed at lower federal rates than ordinary income.",
    long: "The game treats every gain as long-term and applies 23.8% (the 20% top federal rate plus the 3.8% net investment income tax). State tax is not included. Tax accrues as you realize gains and is paid at the end of each calendar quarter; unpaid tax counts against your wealth."
  },
  "Constructive sale": {
    short: "A transaction the tax code treats as a sale of shares you still hold, because it removes substantially all risk and reward.",
    long: "Section 1259 of the Internal Revenue Code can tax a hedge as if you had sold. There is no safe harbor for collars, and Treasury never issued the regulations Congress expected, so the game uses a wide minimum band as a stated game term rather than a legal line."
  }
};

// Aliases: lowercase -> canonical key.
const ALIASES = {
  "10b5-1": "10b5-1 plan",
  "plan": "10b5-1 plan",
  "cooling off": "Cooling-off",
  "cooling-off period": "Cooling-off",
  "collar": "Zero-cost collar",
  "zero cost collar": "Zero-cost collar",
  "puts": "Put",
  "calls": "Call",
  "iv": "Implied volatility",
  "sblo": "Securities-based line of credit",
  "sbloc": "Securities-based line of credit",
  "line of credit": "Securities-based line of credit",
  "credit line": "Securities-based line of credit",
  "ltv": "Loan-to-value",
  "margin call": "Maintenance call",
  "call (maintenance)": "Maintenance call",
  "sharpe": "Sharpe ratio",
  "drawdown": "Max drawdown",
  "xirr": "IRR",
  "cost basis": "Basis",
  "ltcg": "Long-term capital gains",
  "capital gains": "Long-term capital gains",
  "window": "Trading window",
  "locked up": "Lockup",
  "tranches": "Tranche",
  "affiliates": "Affiliate",
  "section 1259": "Constructive sale"
};

const INDEX = new Map();
for (const key of Object.keys(GLOSSARY)) INDEX.set(key.toLowerCase(), key);
for (const [alias, key] of Object.entries(ALIASES)) INDEX.set(alias.toLowerCase(), key);

export function lookup(name) {
  if (name == null) return null;
  const key = INDEX.get(String(name).trim().toLowerCase());
  return key ? { key, ...GLOSSARY[key] } : null;
}

export function glossaryKeys() {
  return Object.keys(GLOSSARY).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let uid = 0;

/** HTML string for a hoverable, focusable term. `label` overrides the visible text. */
export function term(name, label) {
  const hit = lookup(name);
  const text = label == null ? String(name) : String(label);
  if (!hit) return esc(text);
  const id = `ff-tip-${++uid}`;
  return (
    `<span class="ff-term" tabindex="0" data-term="${esc(hit.key)}" aria-describedby="${id}">` +
    `${esc(text)}<span class="ff-tip" role="tooltip" id="${id}">${esc(hit.short)}</span></span>`
  );
}

/** Same as term(), as a DOM element. */
export function termEl(name, label) {
  const tpl = document.createElement("template");
  tpl.innerHTML = term(name, label);
  return tpl.content.firstElementChild || document.createTextNode(String(label == null ? name : label));
}

// Keep tooltips on screen, and let Escape dismiss them (WCAG 1.4.13). Runs once per page load.
function placeTip(termEl_) {
  const tip = termEl_.querySelector(":scope > .ff-tip");
  if (!tip) return;
  termEl_.style.setProperty("--tip-shift", "0px");
  const r = tip.getBoundingClientRect();
  const vw = document.documentElement.clientWidth || window.innerWidth;
  let shift = 0;
  if (r.right > vw - 8) shift = vw - 8 - r.right;
  if (r.left + shift < 8) shift = 8 - r.left;
  termEl_.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
}

if (typeof document !== "undefined" && !globalThis.__ffGlossaryBound) {
  globalThis.__ffGlossaryBound = true;
  const onShow = (e) => {
    const t = e.target && e.target.closest ? e.target.closest(".ff-term") : null;
    if (t) { t.classList.remove("ff-term-dismissed"); placeTip(t); }
  };
  document.addEventListener("pointerover", onShow);
  document.addEventListener("focusin", onShow);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const t = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".ff-term") : null;
    if (t) t.classList.add("ff-term-dismissed");
    else document.querySelectorAll(".ff-term:hover").forEach((n) => n.classList.add("ff-term-dismissed"));
  });
}

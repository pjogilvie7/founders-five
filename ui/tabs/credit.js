// Credit Line tab: pledge shares, borrow against them, watch loan-to-value, answer a maintenance call.
import { loanRate } from '../../engine/loan.js';
import {
  sim, esc, int, money, moneyFull, price, dl, daysBetween, safe, setText, setHTML, tween, actionForm, ensure, plateHTML, snapOf,
} from './kit.js';

const SCALE = 0.4; // the bar runs 0% to 40%

const pctTxt = (x) => `${(x * 100).toFixed(1)}%`;

function build(k, c) {
  c.innerHTML = `<div class="tool credit">
    ${plateHTML('Credit Line', 'Pledge free shares and borrow up to 25% of their value. Borrowing defers tax, and the loan costs interest.', '<span class="chip" data-v="chip"></span>')}
    <section class="box call" data-v="call" hidden role="alert"></section>
    <div class="bigs">${bigStat2('Loan owed', 'owed')}${bigStat2('Interest so far', 'accrued')}${bigStat2('Rate', 'rate')}</div>
    <section class="box" aria-labelledby="ltv-h"><h3 id="ltv-h">Loan to value</h3>
      <div class="ltv" role="meter" aria-valuemin="0" aria-valuemax="40" aria-valuenow="0" aria-label="Loan to value" data-v="ltv">
        <div class="ltv-track"><i class="ltv-fill"></i><i class="mk m25"></i><i class="mk m35"></i></div>
        <div class="ltv-lbl"><span class="l0 num">0%</span><span class="l25"><b class="num">25%</b> max advance</span><span class="l35"><b class="num">35%</b> call</span></div>
      </div>
      <p class="ltv-now"><span class="num" data-v="ltvn">0.0%</span> <span data-v="ltvt"></span></p></section>
    <div class="two">
      <section class="box" aria-labelledby="cl-h"><h3 id="cl-h">Collateral</h3><p class="t-hint" data-v="pinfo"></p><div data-v="pform"></div></section>
      <section class="box" aria-labelledby="ln-h"><h3 id="ln-h">Loan</h3><p class="t-hint" data-v="linfo"></p><div data-v="lform"></div></section>
    </div>
  </div>`;
  k.p = actionForm(c.querySelector('[data-v=pform]'), {
    kind: 'int',
    segs: [{ name: 'mode', label: 'Action', options: [['pledge', 'Pledge'], ['unpledge', 'Unpledge']], def: 'pledge' }],
    label: (v) => (v.mode === 'pledge' ? 'Shares to pledge' : 'Shares to unpledge'),
    resolve: (v, n) => ({ type: v.mode, params: n > 0 ? { shares: n } : {} }),
    hint: (v) => (v.mode === 'pledge' ? 'Enter a number of shares, or press MAX. Only free shares can be pledged.' : 'Enter a number of shares, or press MAX.'),
    idle: (v) => (v.mode === 'pledge' ? 'Pledge shares' : 'Unpledge shares'),
    confirm: (v, n) => (v.mode === 'pledge' ? `Pledge ${int(n)} shares to the bank` : `Take back ${int(n)} pledged shares`),
    word: (v) => (v.mode === 'pledge' ? 'PLEDGED' : 'RELEASED'), tone: (v) => (v.mode === 'pledge' ? 'tone-gold' : 'tone-ink'),
    preview: (v, n, d) => `<dl class="pv"><div><dt>Pledged after</dt><dd class="num">${int(d.after.shares.pledged)}</dd></div>
      <div><dt>You can draw</dt><dd class="num">${moneyFull(d.after.loan.maxDraw)}</dd></div>
      <div><dt>Loan to value</dt><dd class="num">${pctTxt(d.after.loan.ltv)}</dd></div></dl>`,
    onDone: () => safe('credit', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
  k.l = actionForm(c.querySelector('[data-v=lform]'), {
    kind: 'money',
    segs: [{ name: 'mode', label: 'Action', options: [['draw', 'Draw'], ['repay', 'Repay']], def: 'draw' }],
    label: (v) => (v.mode === 'draw' ? 'Amount to draw' : 'Amount to repay'),
    resolve: (v, n) => ({ type: v.mode, params: n > 0 ? { amount: n } : {} }),
    hint: (v) => (v.mode === 'draw' ? 'Enter an amount, or press MAX for the most the bank will lend.' : 'Enter an amount, or press MAX. Repayment comes from cash.'),
    idle: (v) => (v.mode === 'draw' ? 'Draw from the credit line' : 'Repay the loan'),
    confirm: (v, n) => (v.mode === 'draw' ? `Draw ${moneyFull(n)} from the credit line` : `Repay ${moneyFull(n)} from cash`),
    word: (v) => (v.mode === 'draw' ? 'BORROWED' : 'REPAID'), tone: (v) => (v.mode === 'draw' ? 'tone-gold' : 'tone-good'),
    preview: (v, n, d) => `<dl class="pv"><div><dt>Loan after</dt><dd class="num">${moneyFull(d.after.loan.owed)}</dd></div>
      <div><dt>Cash after</dt><dd class="num">${moneyFull(d.after.cash)}</dd></div>
      <div><dt>Loan to value</dt><dd class="num">${pctTxt(d.after.loan.ltv)}</dd></div></dl>`,
    onDone: () => safe('credit', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
  c.querySelector('[data-v=call]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ch]'); if (!b || b.getAttribute('aria-disabled') === 'true') return;
    // the shell's banner owns the answer (it also handles the test banner)
    const bb = document.querySelector(`.margin [data-mc="${b.dataset.ch}"]`);
    if (bb) bb.click(); else c._api.act({ type: 'marginCall', choice: b.dataset.ch });
  });
}

function bigStat2(label, key) { return `<div class="big"><span class="k">${esc(label)}</span><span class="v num" data-v="${key}">—</span><span class="sub num" data-s="${key}"></span></div>`; }

function callHTML(snap, api) {
  const call = snap.loan.call;
  const days = daysBetween(snap.d, call.deadline);
  const sellG = snap.gates.sell;
  const sellOff = sellG && !sellG.allowed;
  return `<h3>Maintenance call</h3>
    <p class="call-line"><b class="num">${days <= 0 ? 'Due today' : `${days} ${days === 1 ? 'day' : 'days'} left`}</b>
      Loan to value is <span class="num">${pctTxt(call.ltv)}</span> and the limit is 35%. Post <b class="num">${moneyFull(call.toPost)}</b> by <b class="num">${esc(dl(api, call.deadline))}</b>, or the bank sells pledged shares at that day’s close, window open or not. That sale is taxable.</p>
    <div class="ch">
      <div><button type="button" class="btn primary" data-ch="post">Post ${esc(money(call.toPost))}</button><span class="t-hint">From cash, then the index fund.</span></div>
      <div><button type="button" class="btn" data-ch="sell"${sellOff ? ' aria-disabled="true"' : ''}>Sell shares now</button><span class="t-hint">${sellOff ? esc(sellG.reason + '.') : 'Sold at today’s close.'}</span></div>
      <div><button type="button" class="btn" data-ch="wait">Wait</button><span class="t-hint">The bank sells on ${esc(dl(api, call.deadline))} if the loan is still above 35%.</span></div>
    </div>`;
}

function draw(c, snap, api) {
  const k = c._kit, q = (s) => c.querySelector(s);
  const L = snap.loan;
  tween(q('[data-v=owed]'), L.owed, moneyFull);
  setText(q('[data-s=owed]'), L.balance > 0 ? `${moneyFull(L.balance)} borrowed` : 'Nothing borrowed');
  tween(q('[data-v=accrued]'), L.accrued, moneyFull);
  setText(q('[data-s=accrued]'), 'added to the loan monthly');
  let sofr = null;
  try { sofr = sim.getCtx(api.state()).sofr[snap.i]; } catch { /* no data */ }
  const blind = api.card().blind;
  setText(q('[data-v=rate]'), blind || sofr == null ? 'SOFR + 2.00%' : `${(loanRate(sofr) * 100).toFixed(2)}%`);
  setText(q('[data-s=rate]'), blind || sofr == null ? 'Overnight rate plus 2.00%' : `SOFR ${sofr.toFixed(2)}% + 2.00%`);
  // LTV bar
  const call = L.call;
  const fillPct = Math.min(1, L.ltv / SCALE) * 100;
  const bar = q('[data-v=ltv]');
  bar.style.setProperty('--fill', fillPct.toFixed(2) + '%');
  bar.dataset.zone = call || L.ltv > 0.35 ? 'call' : L.ltv > 0.25 + 1e-6 ? 'warn' : 'ok';
  bar.setAttribute('aria-valuenow', (L.ltv * 100).toFixed(1));
  bar.setAttribute('aria-valuetext', `${(L.ltv * 100).toFixed(1)} percent`);
  tween(q('[data-v=ltvn]'), L.ltv, pctTxt, { flash: false });
  setText(q('[data-v=ltvt]'), call ? 'Above the 35% call line.' : L.ltv <= 0 ? 'No loan. The bank lends up to 25% of pledged value and calls the loan above 35%.' : L.ltv > 0.25 + 1e-6 ? 'Above the 25% advance, below the 35% call.' : 'Within the 25% advance.');
  setText(q('[data-v=pinfo]'), `${int(snap.shares.pledged)} shares pledged. You can still draw ${moneyFull(L.maxDraw)}.`);
  setText(q('[data-v=linfo]'), blind ? 'Rate: SOFR + 2.00%, accrued daily, added to the loan on the first trading day of each month.' : 'Accrued daily, added to the loan on the first trading day of each month.');
  const chip = q('[data-v=chip]');
  chip.className = 'chip ' + (call ? 'bad' : L.owed > 0 ? 'closed' : '');
  setText(chip, call ? 'Maintenance call' : L.owed > 0 ? 'Loan open' : 'No loan');
  const cb = q('[data-v=call]');
  cb.hidden = !call;
  if (call) setHTML(cb, callHTML(snap, api)); else cb._h = null;
  k.p.update(snap, api); k.l.update(snap, api);
}

export default {
  id: 'credit', label: 'Credit Line', icon: 'assets/icons/credit.svg', hotkey: '4',
  lesson: [
    { title: 'Borrow instead of selling', body: 'You can pledge free shares and borrow up to 25% of their value. Borrowing defers tax, but the loan costs interest.' },
    { title: 'The maintenance call', body: 'If the loan rises above 35% of the pledged value, the bank issues a call. You post cash, or shares are sold.' },
    { title: 'The forced sale', body: 'If a call is still open after three business days, the bank sells enough shares at the close. That sale is taxed and ignores the window.' },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};

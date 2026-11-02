// Cash & Index tab: your cash, the index fund, deposit and withdraw with MAX, the auto-invest switch.
import {
  sim, esc, int, money, moneyFull, safe, setText, setHTML, tween, actionForm, ensure, plateHTML, snapOf, stamp, gateHTML,
} from './kit.js';

function build(k, c) {
  c.innerHTML = `<div class="tool cash">
    ${plateHTML('Cash & Index', 'Cash earns the one-month Treasury rate. The index fund tracks the S&P 500 with dividends reinvested.', '<span class="chip" data-v="chip"></span>')}
    <div class="bigs two-up">
      <div class="big"><span class="k">Cash</span><span class="v num" data-v="cash">—</span><span class="sub num" data-s="cash"></span></div>
      <div class="big"><span class="k">Index fund</span><span class="v num" data-v="index">—</span><span class="sub num" data-s="index"></span></div>
    </div>
    <section class="box" data-v="od" hidden role="status"></section>
    <section class="box" aria-labelledby="ca-h"><h3 id="ca-h">Move money</h3><div data-v="form"></div></section>
    <section class="box auto"><div class="sw-row"><div><h3 id="ai-h">Auto-invest</h3>
      <p class="t-hint" id="ai-d">When on, cash from sales goes straight into the index fund. When off, it stays in cash.</p></div>
      <button type="button" class="sw" role="switch" aria-checked="true" aria-labelledby="ai-h" aria-describedby="ai-d"><span class="sw-on">On</span><span class="sw-off">Off</span><i></i></button></div></section>
    <p class="taxnote">Tax on withdrawals: gains in the index fund are taxed at 23.8% when you withdraw, on the gain over your average cost. The tax is paid at quarter end.</p>
  </div>`;
  k.form = actionForm(c.querySelector('[data-v=form]'), {
    kind: 'money',
    segs: [{ name: 'mode', label: 'Direction', options: [['deposit', 'Deposit to index fund'], ['withdraw', 'Withdraw to cash']], def: 'deposit' }],
    label: (v) => (v.mode === 'deposit' ? 'Amount to deposit' : 'Amount to withdraw'),
    resolve: (v, n) => ({ type: v.mode, params: n > 0 ? { amount: n } : {} }),
    hint: (v) => (v.mode === 'deposit' ? 'Enter an amount, or press MAX for all the cash above what you owe.' : 'Enter an amount, or press MAX for the whole fund.'),
    idle: (v) => (v.mode === 'deposit' ? 'Deposit cash into the index fund' : 'Withdraw from the index fund'),
    confirm: (v, n) => (v.mode === 'deposit' ? `Deposit ${moneyFull(n)} into the index fund` : `Withdraw ${moneyFull(n)} from the index fund`),
    word: (v) => (v.mode === 'deposit' ? 'DEPOSITED' : 'WITHDRAWN'), tone: (v) => (v.mode === 'deposit' ? 'tone-good' : 'tone-ink'),
    preview: (v, n, d) => {
      const tax = d.after.taxOwed - d.before.taxOwed;
      return `<dl class="pv"><div><dt>Cash after</dt><dd class="num">${moneyFull(d.after.cash)}</dd></div><div><dt>Index fund after</dt><dd class="num">${moneyFull(d.after.index.value)}</dd></div>
        ${v.mode === 'withdraw' ? `<div><dt>Tax on the gain</dt><dd class="num">${moneyFull(Math.max(0, tax))}</dd></div>` : ''}</dl>
        ${v.mode === 'withdraw' ? `<p class="t-hint">${tax > 0.005 ? 'The gain in this withdrawal is taxed at 23.8%, paid at quarter end.' : 'There is no gain in this withdrawal, so no tax.'}</p>` : '<p class="t-hint">Deposits cost nothing. The fund holds the S&amp;P 500, so its value moves every day.</p>'}`;
    },
    onDone: () => safe('cash', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
  const sw = c.querySelector('.sw');
  sw.addEventListener('click', () => {
    const api = c._api;
    const r = api.act({ type: 'setAutoInvest', on: sw.getAttribute('aria-checked') !== 'true' });
    if (r.ok) draw(c, snapOf(api) || c._snap, api);
  });
}

function draw(c, snap, api) {
  const k = c._kit, q = (s) => c.querySelector(s);
  tween(q('[data-v=cash]'), snap.cash, moneyFull);
  tween(q('[data-v=index]'), snap.index.value, moneyFull);
  const gain = snap.index.value - snap.index.cost;
  setText(q('[data-s=index]'), snap.index.value > 0.005 ? `Average cost ${moneyFull(snap.index.cost)}` : 'Empty');
  let r = null;
  try { const ctx = sim.getCtx(api.state()); r = ctx.dgs1mo[snap.i]; } catch { /* no data */ }
  setText(q('[data-s=cash]'), api.card().blind || r == null ? 'Earns the 1-month Treasury rate' : `Earns ${r.toFixed(2)}% a year`);
  const sw = q('.sw');
  sw.setAttribute('aria-checked', String(!!snap.autoInvest));
  const chip = q('[data-v=chip]');
  setText(chip, snap.autoInvest ? 'Auto-invest on' : 'Auto-invest off');
  chip.className = 'chip ' + (snap.autoInvest ? 'open' : '');
  const od = q('[data-v=od]');
  od.hidden = !(snap.overdraft > 0.005);
  if (!od.hidden) setHTML(od, `<h3>Overdraft</h3><p class="call-line"><b class="num">${moneyFull(snap.overdraft)}</b> is overdrawn at SOFR + 4.00%. New cash pays it off first, before anything goes to the index fund.</p>`); else od._h = null;
  k.form.update(snap, api);
}

export default {
  id: 'cash', label: 'Cash & Index', icon: 'assets/icons/cash.svg', hotkey: '5',
  lesson: [
    { title: 'Cash', body: 'Cash earns the one-month Treasury rate. Your family’s spending comes out of it on the first trading day of each month.' },
    { title: 'The index fund', body: 'Idle cash can sit in an index fund that tracks the S&P 500 with dividends reinvested. Moving money in and out takes one click.' },
    { title: 'Tax on the way out', body: 'Index fund gains are taxed when you withdraw, at 23.8% of the gain over your average cost.' },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};

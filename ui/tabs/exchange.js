// Exchange Fund tab (should-have): contribute free shares to a pooled fund, locked for seven years.
import {
  esc, int, money, moneyFull, price, dl, safe, setText, setHTML, actionForm, ensure, plateHTML, snapOf, tween,
} from './kit.js';

function build(k, c) {
  c.innerHTML = `<div class="tool exchange">
    ${plateHTML('Exchange Fund', 'Swap free shares for a share of a diversified pool, without selling. The price is a long lock.', '<span class="chip" data-v="n"></span>')}
    <section class="box lockbox"><h3>The seven-year lock</h3>
      <p>Your shares go into a pool that tracks the S&amp;P 500, less 1% a year. The fund is locked for seven years. At the end of the card it is valued at the fund value less 23.8% tax on the gain over your carried-over basis, and it is labeled locked two more years. Leave early and you get your own shares back.</p>
      <p class="t-hint">The minimum contribution is $1M of free shares, and you can contribute only while the trading window is open.</p></section>
    <section class="box" aria-labelledby="ex-h"><h3 id="ex-h">Contribute shares</h3><div data-v="form"></div></section>
    <section class="box" data-v="cur" hidden></section>
  </div>`;
  k.form = actionForm(c.querySelector('[data-v=form]'), {
    kind: 'int',
    label: () => 'Shares to contribute',
    resolve: (v, n) => ({ type: 'exchange', params: n > 0 ? { shares: n } : {} }),
    hint: () => 'Enter a number of shares worth at least $1M, or press MAX.',
    idle: () => 'Contribute shares to the exchange fund',
    confirm: (v, n) => `Contribute ${int(n)} shares to the exchange fund`,
    word: () => 'POOLED', tone: () => 'tone-ink',
    preview: (v, n, d, snap) => `<dl class="pv"><div><dt>Fund value after</dt><dd class="num">${moneyFull(d.after.exchange.value)}</dd></div><div><dt>Free shares after</dt><dd class="num">${int(d.after.shares.free)}</dd></div></dl>
      <p class="t-hint">The shares leave your certificate and stay in the fund for seven years. Nothing is sold, so no tax is due now.</p>`,
    onDone: () => safe('exchange', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
}

function draw(c, snap, api) {
  const cur = c.querySelector('[data-v=cur]');
  const ex = snap.exchange;
  cur.hidden = !ex;
  setText(c.querySelector('[data-v=n]'), ex ? 'In the fund' : 'Empty');
  if (ex) setHTML(cur, `<h3>Your fund</h3><div class="bigs two-up"><div class="big"><span class="k">Fund value</span><span class="v num">${moneyFull(ex.value)}</span><span class="sub num">${int(ex.basisShares)} shares contributed</span></div>
    <div class="big"><span class="k">First contribution</span><span class="v num">${esc(dl(api, ex.contributedOn))}</span><span class="sub">locked seven years</span></div></div>`); else cur._h = null;
  c._kit.form.update(snap, api);
}

export default {
  id: 'exchange', label: 'Exchange Fund', icon: 'assets/icons/exchange.svg', hotkey: '7',
  lesson: [
    { title: 'Diversify without selling', body: 'You put free shares into a pool with other investors’ shares. You own a slice of the whole pool instead of one company.' },
    { title: 'A seven-year lock', body: 'The pool stays locked for seven years. Leave early and you get your own shares back, not cash.' },
    { title: 'Tax at the end', body: 'Nothing is taxed when you contribute. At the end the fund is valued less 23.8% tax on the gain over your carried-over basis.' },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};

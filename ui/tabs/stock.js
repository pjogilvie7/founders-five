// Stock tab: price chart, where your shares are, and the sell form.
import { createPriceChart, nextReleaseInfo } from '../chart.js';
import {
  esc, int, money, moneyFull, price, dl, quarterEnd, shortDate, events, safe, setText, setHTML, tween, actionForm, evOf, ensure, plateHTML, bigStat,
} from './kit.js';

const PARTS = [
  ['free', 'Free', 'var(--good)'], ['locked', 'Locked', 'var(--seal)'], ['collared', 'Collared', 'var(--collar)'],
  ['pledged', 'Pledged', 'var(--gold)'], ['exchanged', 'In exchange fund', 'var(--ink)'], ['sold', 'Sold', 'var(--paper-line)'],
];

function build(k, c) {
  c.innerHTML = `<div class="tool stock">
    ${plateHTML('Stock', 'Your shares, the price since the first trade, and the one move that sells them.', '<span class="chip win" data-v="win"></span>')}
    <div class="bigs">${bigStat('Close today', 'close', true)}${bigStat('Offer price', 'offer', true)}${bigStat('Free to sell', 'free', true)}</div>
    <div class="t-chart" data-v="chart"></div>
    <aside class="lockcard" data-v="lock" aria-label="Next release" hidden>
      <span class="lc-art" aria-hidden="true"><img data-lc="art" alt="" decoding="async"></span>
      <p class="lc-h">Your <b class="num" data-lc="locked"></b> shares are locked.</p>
      <p class="lc-s">Next release <b data-lc="date"></b>: <b data-lc="pct"></b> of your shares.</p>
      <p class="lc-count"><b class="num" data-lc="days"></b><span data-lc="unit"></span></p>
      <span class="lc-fuse" aria-hidden="true"><i data-lc="fill"></i></span>
      <button type="button" class="btn primary lc-run" data-lc="run"></button>
      <p class="lc-until">Until then: speed up time, watch the price and your rivals.</p>
    </aside>
    <ul class="keys" aria-label="Chart key">
      <li><i class="k-line"></i>Close</li><li><i class="k-offer"></i>Offer price</li><li><i class="k-seal"></i>Release</li>
      <li><i class="k-win"></i>Window closed</li><li><i class="k-band"></i>Collar band</li><li><i class="k-tax"></i>Tax paid</li><li><i class="k-call"></i>Margin call</li>
    </ul>
    <div class="lower">
      <section class="box sellbox" aria-labelledby="sell-h"><h3 id="sell-h">Sell</h3><div data-v="sell"></div>
        <button type="button" class="sell-more" aria-expanded="false" aria-label="Sale details"></button></section>
      <section class="box" aria-labelledby="sb-h"><h3 id="sb-h">Where your shares are</h3>
        <div class="sharebar" role="img" data-v="bar"></div><ul class="sharelegend" data-v="legend"></ul></section>
    </div>
  </div>`;
  k.chart = createPriceChart(c.querySelector('[data-v=chart]'), c._api, () => events(c._api));
  const mq = matchMedia('(max-width:899px)');
  // The one verb on the locked board: set the clock to 4x and press play through the rail's own buttons. The engine's release hold does the stopping.
  c.querySelector('[data-lc=run]').addEventListener('click', (e) => {
    if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
    const sp = document.querySelector('.rail .speed[data-speed="4"]'), pa = document.querySelector('.rail .pause');
    if (sp && sp.getAttribute('aria-pressed') !== 'true') sp.click();
    if (pa && pa.classList.contains('paused')) pa.click();
    syncRun(c);
  });
  k.legend = c.querySelector('[data-v=legend]');
  k.legend.innerHTML = PARTS.map(([id, name, col]) => `<li data-p="${id}"><i style="background:${col}"></i><span>${name}</span><b class="num" data-n="${id}">0</b></li>`).join('');
  // Phone: the sale breakdown folds to one summary line; this chevron opens it. Presentation only.
  const sellBox = c.querySelector('.sellbox'), more = sellBox.querySelector('.sell-more');
  const fold = (open) => { sellBox.classList.toggle('open', open); more.setAttribute('aria-expanded', String(open)); };
  more.addEventListener('click', () => fold(more.getAttribute('aria-expanded') !== 'true'));
  const phone = () => matchMedia('(max-width:899px)').matches;
  const showMore = () => { more.hidden = !phone(); }; showMore(); mq.addEventListener?.('change', showMore);
  k.sell = actionForm(c.querySelector('[data-v=sell]'), {
    kind: 'int',
    label: () => 'Shares to sell',
    resolve: (v, n) => ({ type: 'sell', params: n > 0 ? { shares: n } : {} }),
    hint: () => 'Enter a number of shares, or press MAX. A sale settles at today’s close.',
    idle: () => (phone() ? 'Sell shares' : 'Sell shares at today’s close'),
    confirm: (v, n) => (phone() ? `Sell ${int(n)} shares` : `Sell ${int(n)} shares at today’s close`),
    word: () => 'SOLD',
    preview: (v, n, d, snap, api) => {
      const sale = evOf(d, 'sale'); if (!sale) return '';
      const s = sale.data, tax = d.after.taxOwed - d.before.taxOwed;
      const qe = api.card().blind ? 'quarter end' : `quarter end, ${shortDate(quarterEnd(snap.d))}`;
      return `<dl class="pv"><div><dt>You receive</dt><dd class="num">${moneyFull(s.net)}</dd></div>
        <div><dt>Cost, 0.25%</dt><dd class="num">${moneyFull(s.fee)}</dd></div>
        <div><dt>Tax on the gain</dt><dd class="num">${moneyFull(Math.max(0, tax))}</dd></div></dl>
        <p class="t-hint">${int(n)} shares at ${price(s.price)}. Tax is paid at ${esc(qe)}. ${snap.autoInvest ? 'The proceeds go to the index fund.' : 'The proceeds stay in cash.'}</p>`;
    },
    onDone: () => { fold(false); safe('stock', () => draw(c, c._snap, c._api)); },
  });
}

function draw(c, snap, api) {
  const k = c._kit;
  const q = (s) => c.querySelector(s);
  tween(q('[data-v=close]'), snap.close, price, { flash: false });
  tween(q('[data-v=offer]'), snap.offerPrice, price, { flash: false });
  tween(q('[data-v=free]'), snap.shares.free, int, { flash: false });
  const blind = api.card().blind;
  setText(q('[data-s=close]'), snap.close >= snap.offerPrice ? `${((snap.close / snap.offerPrice - 1) * 100).toFixed(1)}% above the offer` : `${((1 - snap.close / snap.offerPrice) * 100).toFixed(1)}% below the offer`);
  setText(q('[data-s=offer]'), blind ? 'Indexed: the offer is 100' : 'What the underwriters sold it for');
  setText(q('[data-s=free]'), `of ${int(snap.shares.total)} shares in all`);
  const w = snap.window;
  const win = q('[data-v=win]');
  win.className = 'chip win ' + (w.open ? 'open' : 'closed');
  setText(win, w.open ? (w.closesOn ? `Window open until ${dl(api, w.closesOn)}${w.projected ? ' (projected)' : ''}` : 'Window open') : `Window closed until ${dl(api, w.opensOn)}${w.projected ? ' (projected)' : ''}`);
  // share breakdown
  const total = snap.shares.total || 1;
  const bar = q('[data-v=bar]');
  const html = PARTS.map(([id, name, col]) => {
    const n = snap.shares[id] || 0; if (n <= 0) return '';
    return `<span class="seg-${id}" style="flex:${n / total} 1 0;background:${col}" title="${esc(name)} ${int(n)}"></span>`;
  }).join('');
  setHTML(bar, html);
  bar.setAttribute('aria-label', PARTS.map(([id, name]) => `${name} ${int(snap.shares[id] || 0)}`).join(', '));
  for (const [id] of PARTS) {
    const li = k.legend.querySelector(`[data-p=${id}]`), n = snap.shares[id] || 0;
    tween(li.querySelector('b'), n, int, { flash: false });
    li.classList.toggle('zero', n === 0);
  }
  drawLock(c, snap, api);
  requestAnimationFrame(() => syncRun(c));
  k.chart.update(snap);
  k.sell.update(snap, api);
}

// The countdown card under the chart (phone): the next release, its share, the days to go. All of it comes from the engine snapshot.
function drawLock(c, snap, api) {
  const box = c.querySelector('[data-v=lock]'), info = nextReleaseInfo(api, snap);
  box.hidden = !info;
  if (!info) return;
  const q = (n) => box.querySelector(`[data-lc=${n}]`);
  const art = q('art'), src = api.card().vignette || 'assets/vignettes/neutral-key.png';
  if (art.getAttribute('src') !== src) art.setAttribute('src', src);
  setText(q('locked'), int(snap.shares.locked));
  box.classList.toggle('solo', snap.shares.free === 0 && snap.shares.locked > 0);
  setText(q('pct'), `${info.pct}%`);
  setText(q('date'), String(dl(api, info.date)).replace(/\s+/g, ' '));
  setText(q('days'), info.days === 0 ? 'Today' : int(info.days));
  setText(q('unit'), info.days === 0 ? '' : info.days === 1 ? 'day to go' : 'days to go');
  q('fill').style.width = `${(info.frac * 100).toFixed(1)}%`;
  const run = q('run'), when = String(dl(api, info.date)).replace(/\s+/g, ' ');
  run._when = when;
  syncRun(c);
  box.classList.toggle('near', info.days <= 5);
  if (box._days !== undefined && box._days !== info.days) { const n = q('days'); n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick'); }
  box._days = info.days;
}

// "Run to the Aug 6 release" reads the rail's own state: running at 4x makes it a quiet, disabled "Running to Aug 6...".
function syncRun(c) {
  const run = c.querySelector('[data-lc=run]'); if (!run || !run._when) return;
  const sp = document.querySelector('.rail .speed[data-speed="4"]'), pa = document.querySelector('.rail .pause');
  const going = !!sp && sp.getAttribute('aria-pressed') === 'true' && !!pa && !pa.classList.contains('paused');
  const text = going ? `Running to ${run._when}...` : `Run to the ${run._when} release`;
  if (run.textContent !== text) run.textContent = text;
  run.setAttribute('aria-disabled', String(going));
  run.classList.toggle('going', going);
}

export default {
  id: 'stock', label: 'Stock', icon: 'assets/icons/stock.svg', hotkey: '1',
  lesson: [
    { title: 'Your shares', body: 'Every share on your certificate is locked until a seal breaks. Released shares become free to use.' },
    { title: 'Selling', body: 'You can sell free shares only while the trading window is open. Each sale costs 0.25% and the gain is taxed at 23.8%.' },
    { title: 'Where the money goes', body: 'Sale proceeds go to cash, then into the index fund if auto-invest is on. Tax on the sale is paid at quarter end.' },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};

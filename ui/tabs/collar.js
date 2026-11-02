// Collar tab: set a zero-cost collar on free shares, see open collars, unwind them, and (SpaceX) check the Street.
import {
  sim, esc, int, money, moneyFull, price, pct, dl, dry, evOf, safe, setText, setHTML, actionForm, ensure, plateHTML, stamp, snapOf, gateHTML, shortDate, tween,
} from './kit.js';

let streetP = null;
const loadStreet = () => (streetP ||= fetch('data/spcx-options.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));

function quoteHTML(v, snap, api) {
  let q;
  try { q = sim.collarQuote(api.state(), v.tenor, v.put); } catch { return ''; }
  const blind = api.card().blind;
  const fmt = (x) => (blind ? x.toFixed(2) : price(x));
  // Band diagram: display positions only (ratios the engine already returned), no money maths.
  const lo = 0.7, hi = Math.max(1.4, q.capPct + 0.1);
  const at = (r) => `${Math.max(2, Math.min(98, ((r - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  return `<div class="quote ${q.error ? 'bad' : ''}" role="group" aria-label="Live collar quote">
    <div class="q-top"><span class="tag model">model price</span><span class="num q-meta">${v.tenor} months, ends ${esc(dl(api, q.expiry))}</span></div>
    <div class="q-grid">
      <div class="q-floor"><span class="k">Floor (put)</span><span class="v num">${fmt(q.Kp)}</span><span class="sub num">${Math.round(v.put * 100)}% of ${fmt(q.S)}</span></div>
      <div class="q-cap"><span class="k">Cap (call)</span><span class="v num">${fmt(q.Kc)}</span><span class="sub num">${Math.round(q.capPct * 100)}% of today</span></div>
      <div class="q-cost"><span class="k">Cost up front</span><span class="v num">$0</span><span class="sub">call pays for put</span></div>
    </div>
    <div class="q-band" aria-hidden="true" style="--f:${at(v.put)};--t:${at(1)};--c:${at(q.capPct)}"><i class="b-fill"></i><i class="b-pin b-f"><em>floor</em></i><i class="b-pin b-t"><em>today</em></i><i class="b-pin b-c"><em>cap</em></i></div>
    <p class="t-hint q-rule">Band rule: the floor is at most 90% and the cap at least 110% of today’s price.${q.error ? ` <b class="bad-t">${esc(q.error)}</b>` : ''}</p>
  </div>`;
}

function build(k, c) {
  c.innerHTML = `<div class="tool collar">
    ${plateHTML('Collar', 'A floor under your shares, paid for by a cap above them. Collared shares stay locked until it ends.', '<span class="chip" data-v="n"></span>')}
    <section class="box" aria-labelledby="co-h"><h3 id="co-h">Set a collar</h3><div data-v="form"></div></section>
    <section class="box" data-v="street" hidden></section>
    <section class="box" aria-labelledby="co-a"><h3 id="co-a">Your collars</h3><div data-v="list"></div></section>
  </div>`;
  k.form = actionForm(c.querySelector('[data-v=form]'), {
    kind: 'int',
    segs: [
      { name: 'tenor', label: 'Tenor', options: [[6, '6 months'], [12, '12 months'], [24, '24 months']], def: 12 },
      { name: 'put', label: 'Floor, % of price', options: [[0.8, '80%'], [0.85, '85%'], [0.9, '90%']], def: 0.85 },
    ],
    label: () => 'Shares to collar',
    head: quoteHTML,
    resolve: (v, n) => ({ type: 'collar', params: { tenorMonths: v.tenor, putPct: v.put, ...(n > 0 ? { shares: n } : {}) } }),
    hint: () => '',
    idle: () => 'Collar shares',
    confirm: (v, n, d) => {
      const c0 = d.after.collars.find((x) => !d.before.collars.some((y) => y.id === x.id));
      return c0 ? `Collar ${int(n)} shares: floor ${price(c0.Kp)}, cap ${price(c0.Kc)}, ${v.tenor} months` : `Collar ${int(n)} shares for ${v.tenor} months`;
    },
    word: () => 'COLLARED', tone: () => 'tone-collar',
    preview: (v, n, d, snap, api) => {
      const c0 = d.after.collars.find((x) => !d.before.collars.some((y) => y.id === x.id)); if (!c0) return '';
      return `<p class="t-hint">Held until ${esc(dl(api, c0.expiry))}. Under ${price(c0.Kp)} you receive the put’s payoff; over ${price(c0.Kc)} you pay the call’s. Taxed at settlement. Unwinding early costs 1%.</p>`;
    },
    onDone: () => safe('collar', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
  // Layout: segs side by side, then quote, then one dock holding the input, MAX and confirm.
  const fh = k.form.el, dock = document.createElement('div');
  dock.className = 'dock';
  fh.insertBefore(dock, fh.querySelector('.t-res'));
  dock.append(fh.querySelector('.fld'), fh.querySelector('.t-go'));
  c.querySelector('[data-v=list]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unwind]'); if (!b) return;
    const api = c._api, r = api.act({ type: 'unwindCollar', id: b.dataset.unwind });
    if (r.ok) { c._unwMsg = (r.events || []).map((x) => x.text).join(' '); stamp(c.querySelector('.tool'), 'UNWOUND', 'tone-collar'); safe('collar', () => draw(c, snapOf(api) || c._snap, api)); }
  });
}

function listHTML(snap, api, msg) {
  const res = `<p class="t-res pop" aria-live="polite">${esc(msg || '')}</p>`;
  if (!snap.collars.length) return '<p class="empty">No open collars.</p>' + res;
  return `<ul class="rows">${snap.collars.map((o) => {
    const d = dry(api, { type: 'unwindCollar', id: o.id });
    const w = d.ok ? evOf(d, 'note') : null;
    const net = w && w.data ? w.data.net : null;
    return `<li class="row-item"><div class="r-main"><b class="num">${int(o.shares)} shares</b><span class="num">floor ${price(o.Kp)} · cap ${price(o.Kc)}</span>
      <span class="num">${o.tenorMonths} months · ends ${esc(dl(api, o.expiry))} · ${o.daysLeft} days left</span></div>
      <div class="r-side"><span class="k">Model value</span><b class="num ${o.mark < 0 ? 'neg' : ''}">${money(o.mark)}</b>
      <button type="button" class="btn sm" data-unwind="${esc(o.id)}">${net == null ? 'Unwind' : `Unwind: ${net >= 0 ? 'receive' : 'pay'} ${moneyFull(Math.abs(net))}`}</button>
      <span class="t-hint">Model value less 1% of notional</span></div></li>`;
  }).join('')}</ul>` + res;
}

async function streetBox(c, api) {
  const box = c.querySelector('[data-v=street]');
  const card = api.card();
  if (!card.live) { box.hidden = true; return; }
  if (box._ready) return;
  const o = await loadStreet();
  const s = o && o.streetCheck; if (!s) { box.hidden = true; return; }
  if (box._ready) return;
  box._ready = true; box.hidden = false;
  const vol = (s.vol * 100).toFixed(1);
  box.innerHTML = `<details class="street"><summary><span>Street check</span><span class="num">model cap ${price(s.modelCap)} against listed options ${price(s.marketCap)}</span></summary>
    <div class="q-grid">
      <div><span class="k">Model (flat ${vol}% vol)</span><span class="v num">${price(s.modelCap)}</span><span class="sub num">zero-cost cap, one-year ${price(s.floor)} floor (85% of ${price(s.spot)})</span></div>
      <div><span class="k">Listed SPCX options</span><span class="v num">${price(s.marketCap)}</span><span class="sub num">cap implied by listed mid quotes on ${esc(shortDate(s.asOf))}</span></div>
    </div>
    <p class="t-hint">Model (flat ${vol}% vol): one-year 85% floor ${price(s.floor)}, zero-cost cap ${price(s.modelCap)}. Listed SPCX options on ${esc(shortDate(s.asOf))} imply a cap near ${price(s.marketCap)}. A dealer quoting a $100M block would charge a spread, so the real cap is lower.</p>
    ${api.state().d !== s.asOf ? `<p class="t-hint"><b>These are the listed quotes from ${esc(shortDate(s.asOf))}, the latest day in the data.</b> Your game date is ${esc(dl(api, api.state().d))}, so the collar quote above can differ.</p>` : ''}
    <p class="t-hint">${esc(s.method)}${s.rate ? ` Rate used: 1-year Treasury ${s.rate}%${s.rateAsOf ? ` (${esc(shortDate(s.rateAsOf))})` : ''}.` : ''}</p>
  </details>`;
  box.querySelector('details').addEventListener('toggle', (e) => {
    if (e.currentTarget.open && !box._flagged && !api.watch) { box._flagged = true; c._api.act({ type: 'flag', name: 'streetCheck' }); }
  });
}

function draw(c, snap, api) {
  const k = c._kit;
  const nEl = c.querySelector('[data-v=n]');
  setText(nEl, snap.collars.length ? `${snap.collars.length} open` : 'None open');
  nEl.className = 'chip ' + (snap.collars.length ? 'collar-on' : '');
  const list = c.querySelector('[data-v=list]');
  setHTML(list, listHTML(snap, api, c._unwMsg));
  streetBox(c, api);
  k.form.update(snap, api);
}

export default {
  id: 'collar', label: 'Collar', icon: 'assets/icons/collar.svg', hotkey: '3',
  lesson: [
    { title: 'A floor and a cap', body: 'A zero-cost collar buys a put below today’s price and sells a call above it. The call pays for the put, so nothing changes hands up front.' },
    { title: 'You keep the shares', body: 'You keep your shares and your vote, but you give up gains above the cap. Collared shares cannot be sold until the collar ends.' },
    { title: 'At expiry', body: 'At expiry the difference is settled in cash and taxed. You can roll the collar at that day’s prices or let it end.' },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};

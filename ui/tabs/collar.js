// Collar tab: set a zero-cost collar on free shares, see open collars, unwind them, and (SpaceX) check the Street.
import {
  sim, esc, int, money, moneyFull, price, pct, dl, dry, evOf, safe, setText, setHTML, actionForm, ensure, plateHTML, stamp, snapOf, gateHTML, shortDate, tween, reasonText,
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
    <div class="q-top"><span class="tag model">model price</span><span class="num q-meta">Held until ${esc(dl(api, q.expiry))} · ${v.tenor} months</span></div>
    <div class="q-grid">
      <div class="q-floor"><span class="k">Floor (put)</span><span class="v num">${fmt(q.Kp)}</span><span class="sub num">${Math.round(v.put * 100)}% of ${fmt(q.S)}</span></div>
      <div class="q-cap"><span class="k">Cap (call)</span><span class="v num">${fmt(q.Kc)}</span><span class="sub num">${Math.round(q.capPct * 100)}% of today</span></div>
      <div class="q-cost"><span class="k">Cost up front</span><span class="v num">$0</span><span class="sub">call pays for put</span></div>
    </div>
    <div class="q-band" aria-hidden="true" style="--f:${at(v.put)};--t:${at(1)};--c:${at(q.capPct)}"><i class="b-fill"></i><i class="b-pin b-f"><em>floor</em></i><i class="b-pin b-t"><em>today</em></i><i class="b-pin b-c"><em>cap</em></i></div>
    <p class="q-terms"><span class="t-lo">Below the floor, the put pays you.</span><span class="t-hi">Above the cap, you pay the call.</span></p>
    <p class="t-hint q-rule">Taxed at settlement. Unwinding early costs 1%. Band rule: the floor is at most 90% and the cap at least 110% of today’s price.${q.error ? ` <b class="bad-t">${esc(q.error)}</b>` : ''}</p>
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
    confirm: (v, n) => `Collar ${int(n)} shares for ${v.tenor} months`,
    word: () => 'COLLARED', tone: () => 'tone-collar',
    preview: (v, n, d, snap, api) => {
      const c0 = d.after.collars.find((x) => !d.before.collars.some((y) => y.id === x.id)); if (!c0) return '';
      return `<ul class="terms">
        <li class="t-hold">Held until <b class="num">${esc(dl(api, c0.expiry))}</b></li>
        <li class="t-low">Under <b class="num">${price(c0.Kp)}</b>, the put pays you</li>
        <li class="t-high">Over <b class="num">${price(c0.Kc)}</b>, you pay the call</li>
        <li class="t-tax">Taxed at settlement. Unwinding early costs 1%.</li></ul>`;
    },
    onDone: () => { c._unwMsg = ''; safe('collar', () => draw(c, snapOf(c._api) || c._snap, c._api)); },
  });
  // Layout: segs side by side, then quote, then one dock holding the input, MAX and confirm.
  const fh = k.form.el, dock = document.createElement('div');
  dock.className = 'dock';
  fh.insertBefore(dock, fh.querySelector('.t-res'));
  dock.append(fh.querySelector('.fld'), fh.querySelector('.t-go'));
  // A result line belongs to the move that made it: clear it as soon as the form changes.
  const stale = (e) => {
    if (e.target.closest('.t-go')) return;
    const r = fh.querySelector('.t-res');
    if (r && r.textContent) { r.textContent = ''; r.classList.remove('pop'); }
  };
  fh.addEventListener('input', stale);
  fh.addEventListener('click', stale);
  // Blocked by the engine (for example a live 10b5-1 plan): the whole input row gives way to one card holding the engine's
  // reason and one button to the tab that lifts the block. The field stays in the DOM, out of sight and out of the tab order.
  // The reason is read from canDo; nothing is computed here.
  const input = k.form.input, goBtn = fh.querySelector('.t-go'), gateEl = fh.querySelector('.t-gate');
  const card = document.createElement('div');
  card.className = 'co-card'; card.hidden = true;
  card.innerHTML = `<svg class="co-seal" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <circle class="s-r1" cx="32" cy="32" r="30"/><circle class="s-r2" cx="32" cy="32" r="26"/><circle class="s-r3" cx="32" cy="32" r="21"/>
      <path class="s-sh" d="M24.5 30v-5.5a7.5 7.5 0 0 1 15 0V30"/><rect class="s-bd" x="20" y="29.5" width="24" height="17" rx="2"/><circle class="s-hole" cx="32" cy="37" r="2.4"/><path class="s-key" d="M32 39v4"/></svg>
    <p class="co-why" role="status"></p><button type="button" class="co-go"></button>`;
  dock.append(card);
  const why = card.querySelector('.co-why'), goTab = card.querySelector('.co-go');
  let tabId = '';
  goTab.addEventListener('click', () => { const t = document.getElementById('tab-' + tabId); if (t) t.click(); });
  // Display only: the first sentence of the engine's reason, without the rule citation in brackets.
  const plain = (t) => {
    let x = t.replace(/\s*\([^)]*\)+/g, '');
    if (/10b5-1/.test(x)) x = x.split(':')[0];
    const m = x.match(/^.*?[.!?](?=\s|$)/);
    x = (m ? m[0] : x).trim();
    return /[.!?]$/.test(x) ? x : x + '.';
  };
  const placeholder = input.placeholder;
  const gate0 = () => {
    const api = c._api; if (!api) return null;
    try { const v = k.form.vals(); const g = api.canDo('collar', { tenorMonths: v.tenor, putPct: v.put }); return g && !g.allowed ? g : null; } catch { return null; }
  };
  const sync = () => {
    const g = gate0(), blocked = !!g;
    fh.classList.toggle('co-blocked', blocked);
    for (const el of [gateEl, goBtn, input.closest('.fld')]) if (el) el.setAttribute('aria-hidden', String(blocked));
    input.tabIndex = blocked ? -1 : 0;
    fh.querySelector('[data-max]').tabIndex = blocked ? -1 : 0;
    input.placeholder = blocked ? '\u2014' : placeholder;
    card.hidden = !blocked;
    if (!blocked) return;
    const t = reasonText(c._api, g);
    tabId = /10b5-1/.test(t) ? 'plan' : /^Locked by the lockup/.test(t) ? 'stock' : '';
    const line = plain(t);
    if (why.textContent !== line) why.textContent = line;
    goTab.hidden = !tabId;
    goTab.textContent = tabId === 'plan' ? 'Open the 10b5-1 tab' : 'Open the Stock tab';
    if (input.value) { input.value = ''; k.form.update(); }
  };
  new MutationObserver(sync).observe(gateEl, { childList: true, characterData: true, subtree: true });
  new MutationObserver(sync).observe(goBtn, { childList: true, characterData: true, subtree: true });
  // While blocked, nothing can be typed or confirmed.
  fh.addEventListener('input', (e) => { if (e.target === input && gate0()) input.value = ''; }, true);
  // Phone: the sticky dock's height, so the panel's scroll area never leaves text under it.
  if (window.ResizeObserver) new ResizeObserver(() => { const h = dock.offsetHeight; c.style.setProperty('--dock-h', h + 'px'); }).observe(dock);
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
  box.innerHTML = `<details class="street"><summary><span>Street check</span><span class="sc-figs num"><span><i>Model cap</i><b>${price(s.modelCap)}</b></span><span><i>Listed options</i><b>${price(s.marketCap)}</b></span></span></summary>
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

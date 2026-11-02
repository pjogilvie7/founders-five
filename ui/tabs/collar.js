// Collar tab: set a zero-cost collar on free shares, see open collars, unwind them, and (SpaceX) check the Street.
import {
  sim, esc, int, money, moneyFull, price, pct, dl, dlFar, dry, evOf, safe, setText, setHTML, actionForm, ensure, plateHTML, stamp, snapOf, gateHTML, shortDate, tween, reasonText,
} from './kit.js';

let streetP = null;
let formRef = null; // the live form, so the quote card can read the typed share count
const MAXN = 1e12;
const loadStreet = () => (streetP ||= fetch('data/spcx-options.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));

// The typed share count, as an integer or 0 (display only; the engine does every multiplication).
const typedShares = () => { const n = formRef && formRef.current ? formRef.current.n : 0; return Number.isInteger(n) && n > 0 && n < MAXN ? n : 0; };
const quoteFor = (api, v, n) => { try { return sim.collarQuote(api.state(), v.tenor, v.put, n > 0 ? n : undefined); } catch { return null; } };

// The result strip is built once and repainted, so the figures can count and the markers can slide as the inputs change.
function quoteShell() {
  const el = document.createElement('div');
  el.className = 'quote'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Live collar quote');
  el.innerHTML = `<div class="q-top"><span class="tag model">model price</span><span class="num q-meta" data-q="meta"></span></div>
    <div class="q-strip">
      <div class="qs-fig qs-floor"><span class="k">Floor</span><span class="v num" data-q="fv">\u2014</span></div>
      <div class="qs-fig qs-cap"><span class="k">Cap</span><span class="v num" data-q="cv">\u2014</span></div>
      <div class="q-band" aria-hidden="true"><i class="b-fill"></i><i class="b-pin b-f"></i><i class="b-pin b-t"><em>today</em></i><i class="b-pin b-c"></i></div>
      <span class="qs-sub num qs-fs" data-q="fs"></span><span class="qs-sub num qs-cs" data-q="cs"></span>
    </div>
    <p class="q-err" data-q="err" role="alert" hidden></p>
    <details class="co-terms"><summary>Terms</summary>
      <p class="co-say" data-q="say"></p>
      <ul><li>Cost up front is $0: the call you sell pays for the put you buy.</li><li>Taxed at settlement.</li><li>Unwinding early costs 1% of the notional.</li><li>Band rule: the floor is at most 90% and the cap at least 110% of today\u2019s price.</li></ul></details>`;
  return el;
}

// Paints the strip from one engine quote. n is the typed share count; 0 means per-share. lineEl gets the one plain result line beside confirm.
function paintQuote(el, v, api, n, lineEl) {
  const q = quoteFor(api, v, n);
  if (!q) return;
  const Q = (name) => el.querySelector(`[data-q=${name}]`);
  const blind = api.card().blind;
  const fmt = (x) => (blind ? x.toFixed(2) : price(x));
  const live = n > 0 && !q.error && q.floorValue != null && q.capValue != null;
  const until = esc(dlFar(api, q.expiry));
  setText(Q('meta'), `Held until ${dlFar(api, q.expiry)} \u00b7 ${v.tenor} months \u00b7 $0\u00a0up\u00a0front`);
  // Band: display positions only (ratios the engine already returned), scaled so floor and cap sit near the two ends.
  const lo = q.putPct - 0.06, hi = q.capPct + 0.06;
  const at = (r) => `${Math.max(2, Math.min(98, ((r - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  const strip = el.querySelector('.q-strip');
  strip.style.setProperty('--f', at(q.putPct)); strip.style.setProperty('--t', at(1)); strip.style.setProperty('--c', at(q.capPct));
  const mode = live ? 'total' : 'share';
  for (const [name, val] of [['fv', live ? q.floorValue : q.Kp], ['cv', live ? q.capValue : q.Kc]]) {
    const t = Q(name);
    if (t._mode !== mode) { t._mode = mode; t._v = undefined; }
    tween(t, val, live ? moneyFull : fmt, { flash: false });
  }
  setText(Q('fs'), live ? `${fmt(q.Kp)} a share` : `${Math.round(v.put * 100)}% of ${fmt(q.S)}`);
  setText(Q('cs'), live ? `${fmt(q.Kc)} a share` : `${Math.round(q.capPct * 100)}% of today`);
  setHTML(Q('say'), live
    ? `<b class="num">${int(n)} shares</b>: at least <b class="num">${moneyFull(q.floorValue)}</b> until ${until} (floor). Above <b class="num">${moneyFull(q.capValue)}</b> you give up the gain (cap).`
    : `Until ${until}: below <b class="num">${fmt(q.Kp)}</b> the put pays you up to <b class="num">${fmt(q.Kp)}</b> a share; above <b class="num">${fmt(q.Kc)}</b> you give up the gain.`);
  if (lineEl) {
    const ok = live && !q.error;
    setHTML(lineEl, ok ? `Worth at least <b class="num">${money(q.floorValue, { compact: true })}</b> until ${until}, at most <b class="num">${money(q.capValue, { compact: true })}</b>.` : '');
    lineEl.hidden = !ok;
  }
  const err = Q('err'); setText(err, q.error || ''); err.hidden = !q.error;
  el.classList.toggle('bad', !!q.error); el.classList.toggle('has-n', live);
  if (el._n !== n) {
    const first = el._n === undefined; el._n = n;
    if (!first && live) { strip.classList.remove('bump'); void strip.offsetWidth; strip.classList.add('bump'); }
  }
}

// The word stamp rides the plate (kit.js stamp), clear of the status chip. The receipt line the engine returns is shown as a slip at the
// top of "Your collars", in the flow of the page, so nothing is ever laid over the form or its controls. Any change to the form clears it.
function dropStamp(c) {
  clearTimeout(c._rt);
  if (!c._receipt) return;
  c._receipt = '';
  const r = c.querySelector('.co-receipt'); if (r) r.remove();
}
function showStamp(c, word, line) {
  dropStamp(c);
  if (!line) return;
  c._receipt = line;
  safe('collar', () => draw(c, snapOf(c._api) || c._snap, c._api));
  c._rt = setTimeout(() => dropStamp(c), 8000);
}

function build(k, c) {
  c.innerHTML = `<div class="tool collar">
    ${plateHTML('Collar', 'A floor under your shares, paid for by a cap above them. Collared shares stay locked until it ends.', '<span class="chip" data-v="n"></span>')}
    <section class="box instr" aria-labelledby="co-h"><h3 id="co-h">Set a collar</h3><div data-v="form"></div></section>
    <section class="box" data-v="street" hidden></section>
    <section class="box" aria-labelledby="co-a"><h3 id="co-a">Your collars</h3><div data-v="list"></div></section>
  </div>`;
  const fhEl = () => c.querySelector('[data-v=form]');
  formRef = null;
  k.form = actionForm(c.querySelector('[data-v=form]'), {
    kind: 'int',
    segs: [
      { name: 'tenor', label: 'Tenor', options: [[6, '6 months'], [12, '12 months'], [24, '24 months']], def: 12 },
      { name: 'put', label: 'Floor, % of price', options: [[0.8, '80%'], [0.85, '85%'], [0.9, '90%']], def: 0.85 },
    ],
    label: () => 'Shares to collar',
    resolve: (v, n) => ({ type: 'collar', params: { tenorMonths: v.tenor, putPct: v.put, ...(n > 0 ? { shares: n } : {}) } }),
    hint: () => '',
    idle: () => 'Pick a size',
    // Names the move; the floor and cap figures live in the result strip only.
    confirm: (v, n) => `Collar ${int(n)} shares`,
    word: () => 'COLLARED', tone: () => 'tone-collar',
    preview: (v, n, d, snap, api) => {
      const c0 = d.after.collars.find((x) => !d.before.collars.some((y) => y.id === x.id)); if (!c0) return '';
      return `<ul class="terms">
        <li class="t-hold">Held until <b class="num">${esc(dlFar(api, c0.expiry))}</b></li>
        <li class="t-low">Under <b class="num">${price(c0.Kp)}</b>, the put pays you</li>
        <li class="t-high">Over <b class="num">${price(c0.Kc)}</b>, you pay the call</li>
        <li class="t-tax">Taxed at settlement. Unwinding early costs 1%.</li></ul>`;
    },
    onDone: () => {
      c._unwMsg = '';
      const line = (fhEl().querySelector('.t-res') || {}).textContent || '';
      safe('collar', () => draw(c, snapOf(c._api) || c._snap, c._api));
      safe('collar', () => showStamp(c, 'COLLARED', line));
    },
  });
  formRef = k.form;
  // Tenor: full words from 420px up, "6 mo" under it so three segments fit a phone; the full word is always the accessible name.
  const mq = window.matchMedia ? window.matchMedia('(max-width: 420px)') : null;
  const tenors = [...c.querySelectorAll('[data-seg=tenor] button')];
  const full = tenors.map((b) => b.textContent);
  tenors.forEach((b, i) => b.setAttribute('aria-label', full[i]));
  const short = () => tenors.forEach((b, i) => { b.textContent = mq && mq.matches ? full[i].replace(' months', ' mo') : full[i]; });
  short();
  if (mq) (mq.addEventListener ? mq.addEventListener('change', short) : mq.addListener(short));
  // Layout: pickers, then the action dock (shares input, quick-pick chips, confirm, and the one result strip beneath).
  const fh = k.form.el, dock = document.createElement('div');
  dock.className = 'dock';
  fh.insertBefore(dock, fh.querySelector('.t-head'));
  const fld = fh.querySelector('.fld'), maxBtn = fld.querySelector('[data-max]');
  const act = document.createElement('div');
  act.className = 'co-act';
  const lineEl = document.createElement('p');
  lineEl.className = 'co-line'; lineEl.hidden = true;
  act.append(fh.querySelector('.t-go'), lineEl);
  dock.append(fld, act);
  // Quick sizes: 25% and 50% of the engine's free-share number (whole shares, rounded down); the old MAX key is "All free".
  maxBtn.textContent = 'All free'; maxBtn.classList.remove('btn', 'sm', 'max'); maxBtn.classList.add('co-chip');
  const chipsEl = document.createElement('div');
  chipsEl.className = 'co-chips'; chipsEl.setAttribute('role', 'group'); chipsEl.setAttribute('aria-label', 'Quick sizes');
  for (const [lab, f] of [['25%', 0.25], ['50%', 0.5]]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'co-chip'; b.dataset.frac = String(f); b.textContent = lab; b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${lab} of your free shares`);
    chipsEl.appendChild(b);
  }
  chipsEl.appendChild(maxBtn); maxBtn.setAttribute('aria-pressed', 'false'); maxBtn.dataset.frac = '1';
  fld.querySelector('.fld-row').appendChild(chipsEl);
  const chipBtns = [...chipsEl.querySelectorAll('.co-chip')];
  fld.append(fh.querySelector('.t-gate'));
  const quoteEl = quoteShell();
  dock.append(quoteEl);
  const tickIn = () => { const i = k.form.input; i.classList.remove('tick'); void i.offsetWidth; i.classList.add('tick'); };
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.co-chip'); if (!b) return;
    if (b === maxBtn) { tickIn(); return; }
    const mx = maxBtn._max > 0 ? Math.floor(maxBtn._max) : 0, n = Math.floor(mx * Number(b.dataset.frac));
    if (n < 1) { const gt = fh.querySelector('.t-gate'); gt.classList.remove('nudge'); void gt.offsetWidth; gt.classList.add('nudge'); return; }
    k.form.input.value = String(n);
    k.form.input.dispatchEvent(new Event('input', { bubbles: true }));
    tickIn();
  });
  // Selected chip + the result strip (engine collarQuote only). Called after every form update.
  const refresh = () => {
    const api = c._api; if (!api) return;
    const mx = maxBtn._max > 0 ? Math.floor(maxBtn._max) : 0, n = typedShares();
    for (const b of chipBtns) {
      const v = Math.floor(mx * Number(b.dataset.frac)), on = n > 0 && v === n;
      b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
      if (b !== maxBtn) b.setAttribute('aria-disabled', String(v < 1));
    }
    // While the engine blocks the move nothing is previewed: the panel is the lock card alone.
    if (gate0()) return;
    paintQuote(quoteEl, k.form.vals(), api, n, lineEl);
  };
  c._refresh = refresh;
  // A result line belongs to the move that made it: clear it as soon as the form changes.
  const stale = (e) => {
    if (e.target.closest('.t-go')) return;
    dropStamp(c);
    const r = fh.querySelector('.t-res');
    if (r && r.textContent) { r.textContent = ''; r.classList.remove('pop'); }
  };
  fh.addEventListener('input', stale);
  fh.addEventListener('click', stale);
  fh.addEventListener('input', refresh);
  fh.addEventListener('click', refresh);
  // Blocked by the engine (for example a live 10b5-1 plan): the panel collapses to one lock card with the engine's reason and the
  // one button to the tab that lifts the block. The pickers, input, chips, confirm and strip stay in the DOM but are inert and
  // visually hidden, so nothing dead is shown. The reason is read from canDo.
  const instrEl = c.querySelector('.instr');
  const input = k.form.input, goBtn = fh.querySelector('.t-go'), gateEl = fh.querySelector('.t-gate');
  const card = document.createElement('div');
  card.className = 'co-lock'; card.hidden = true;
  card.innerHTML = `<span class="co-medal" aria-hidden="true"><svg class="co-seal" viewBox="0 0 24 24" width="26" height="26" focusable="false"><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path class="s-key" d="M12 14.2v2.6"/></svg></span>
    <div class="co-copy"><p class="co-why" role="status"></p><p class="co-sub">A collar sets a floor and a cap on some of your shares for 6 to 24 months.</p></div>`;
  const goTab = document.createElement('button');
  goTab.type = 'button'; goTab.className = 'co-go'; goTab.hidden = true;
  card.append(goTab);
  dock.insertBefore(card, fld);
  const why = card.querySelector('.co-why');
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
    refresh();
    fh.classList.toggle('co-blocked', blocked);
    if (gateEl) gateEl.setAttribute('aria-hidden', String(blocked));
    for (const el of [fld, act, quoteEl, ...fh.querySelectorAll(':scope>.segf')]) el.toggleAttribute('inert', blocked);
    instrEl.classList.toggle('is-locked', blocked);
    input.tabIndex = blocked ? -1 : 0;
    for (const b of chipBtns) b.tabIndex = blocked ? -1 : 0;
    input.placeholder = blocked ? '\u2014' : placeholder;
    card.hidden = !blocked;
    goBtn.tabIndex = blocked ? -1 : 0;
    if (blocked) dropStamp(c);
    if (!blocked) return;
    const t = reasonText(c._api, g);
    tabId = /10b5-1/.test(t) ? 'plan' : /^Locked by the lockup|^No free shares/.test(t) ? 'stock' : '';
    const line = tabId === 'plan' ? 'Locked by your 10b5-1 plan.' : plain(t);
    if (why.textContent !== line) why.textContent = line;
    goTab.hidden = !tabId;
    goTab.textContent = tabId === 'plan' ? 'Open the 10b5-1 tab' : 'Open the Stock tab';
    if (input.value) { input.value = ''; k.form.update(); }
  };
  new MutationObserver(sync).observe(gateEl, { childList: true, characterData: true, subtree: true });
  new MutationObserver(sync).observe(goBtn, { childList: true, characterData: true, subtree: true });
  // While blocked, nothing can be typed or confirmed.
  fh.addEventListener('input', (e) => { if (e.target === input && gate0()) input.value = ''; }, true);
  c.querySelector('[data-v=list]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unwind]'); if (!b) return;
    const api = c._api, r = api.act({ type: 'unwindCollar', id: b.dataset.unwind });
    if (r.ok) {
      c._unwMsg = (r.events || []).map((x) => x.text).join(' '); stamp(c.querySelector('.tool'), 'UNWOUND', 'tone-collar');
      safe('collar', () => draw(c, snapOf(api) || c._snap, api));
      safe('collar', () => showStamp(c, 'UNWOUND', c._unwMsg));
    }
  });
}

function listHTML(snap, api, msg, fresh, receipt) {
  const res = `<p class="t-res pop" aria-live="polite">${esc(msg || '')}</p>`;
  const slip = receipt ? `<p class="co-receipt num">${esc(receipt)}</p>` : '';
  if (!snap.collars.length) return slip + '<p class="empty">No open collars.</p>' + res;
  return slip + `<ul class="rows">${snap.collars.map((o) => {
    const d = dry(api, { type: 'unwindCollar', id: o.id });
    const w = d.ok ? evOf(d, 'note') : null;
    const net = w && w.data ? w.data.net : null;
    return `<li class="row-item${fresh && fresh.has(o.id) ? ' fresh' : ''}"><div class="r-main"><b class="num">${int(o.shares)} shares</b><span class="num">floor ${price(o.Kp)} · cap ${price(o.Kc)}</span>
      <span class="num">${o.tenorMonths} months · ends ${esc(dlFar(api, o.expiry))} · ${o.daysLeft} days left</span></div>
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
  </details>
  <p class="t-hint st-why">The model uses one volatility for every strike; listed options price each strike on its own, so the two caps differ.</p>`;
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
  // A collar seen for the first time after the tab has drawn once is "fresh" for under two seconds (a short gold flash on its row).
  const fresh = (c._fresh ||= new Set());
  if (c._seen) for (const o of snap.collars) if (!c._seen.has(o.id)) { fresh.add(o.id); setTimeout(() => fresh.delete(o.id), 1800); }
  c._seen = new Set(snap.collars.map((o) => o.id));
  setHTML(list, listHTML(snap, api, c._unwMsg, fresh, c._receipt));
  streetBox(c, api);
  k.form.update(snap, api);
  if (c._refresh) c._refresh();
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

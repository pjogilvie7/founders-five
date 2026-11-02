// 10b5-1 Plan tab: adopt a plan, watch cooling-off, see the sales, cancel.
import {
  esc, int, money, dl, daysBetween, nextMonthStart, events, safe, setText, setHTML, actionForm, ensure, plateHTML, stamp, snapOf, gateHTML, reasonText,
} from './kit.js';

const COOL = {
  engineer: '30 calendar days',
  founder: 'the later of 90 days or 2 business days after the next 10-Q or 10-K, capped at 120 days',
};

function build(k, c) {
  c.innerHTML = `<div class="tool plan">
    ${plateHTML('10b5-1 Plan', 'A plan sells a fixed share of your free shares on the first trading day of each month, window open or not.', '<span class="chip" data-v="state"></span>')}
    <section class="box" data-v="live" hidden></section>
    <section class="box" data-v="newbox" aria-labelledby="pl-h"><h3 id="pl-h">Adopt a plan</h3><div data-v="form"></div></section>
    <section class="box" data-v="hist"><h3>Plan sales</h3><ol class="log" data-v="log"></ol></section>
  </div>`;
  k.form = actionForm(c.querySelector('[data-v=form]'), {
    kind: 'none',
    segs: [
      { name: 'pct', label: 'Sell each month', options: [[2, '2%'], [5, '5%'], [10, '10%']], def: 5 },
      { name: 'months', label: 'For', options: [[6, '6 months'], [12, '12 months'], [18, '18 months']], def: 12 },
    ],
    resolve: (v) => ({ type: 'adoptPlan', params: { pct: v.pct, months: v.months } }),
    head: (v, snap, api) => `<p class="t-hint">Cooling-off before the first sale: ${esc(COOL[api.state().seat] || COOL.engineer)}. Adopting is allowed only while the trading window is open.</p>`,
    idle: (v) => `Adopt a ${v.pct}% a month plan for ${v.months} months`,
    confirm: (v) => `Adopt a ${v.pct}% a month plan for ${v.months} months`,
    word: () => 'ADOPTED',
    preview: (v, n, d, snap, api) => {
      const g = api.canDo('adoptPlan', { pct: v.pct, months: v.months });
      return `<dl class="pv"><div><dt>Sells</dt><dd class="num">${v.pct}% a month</dd></div><div><dt>For</dt><dd class="num">${v.months} months</dd></div>
        <div><dt>First sale</dt><dd class="num">${esc(dl(api, g.firstTradeOn))}</dd></div></dl>
        <p class="t-hint">Cooling-off ends ${esc(dl(api, g.coolingOffEnds))}; the first sale is the first trading day on or after it. Each sale is a percentage of the shares free that day. Cancelling later starts a new cooling-off.</p>`;
    },
    onDone: () => safe('plan', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
  c.querySelector('[data-v=live]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const api = c._api;
    if (b.dataset.a === 'ask') { c._askCancel = true; draw(c, snapOf(api) || c._snap, api); c.querySelector('[data-a=no]')?.focus(); }
    else if (b.dataset.a === 'no') { c._askCancel = false; draw(c, snapOf(api) || c._snap, api); }
    else if (b.dataset.a === 'yes') {
      c._askCancel = false;
      const r = api.act({ type: 'cancelPlan' });
      if (r.ok) stamp(c.querySelector('.tool'), 'CANCELLED', 'tone-ink');
      draw(c, snapOf(api) || c._snap, api);
    }
  });
}

function liveHTML(c, snap, api) {
  const p = snap.plan, seat = api.state().seat;
  const cooling = p.status === 'cooling-off';
  const days = daysBetween(snap.d, p.firstTradeOn);
  const next = cooling ? p.firstTradeOn : nextMonthStart(api, snap.d);
  const dots = Array.from({ length: p.salesTotal }, (_, i) => `<i class="${i < p.salesDone ? 'done' : ''}"></i>`).join('');
  const cancel = c._askCancel
    ? `<div class="warn-box" role="alert"><p><b>Cancel this plan?</b> The plan stops selling. A new plan starts a new cooling-off: ${esc(COOL[seat] || COOL.engineer)}. Without a plan you can sell only while the window is open.</p>
        <div class="row"><button type="button" class="btn primary" data-a="yes">Cancel the plan</button><button type="button" class="btn" data-a="no">Keep the plan</button></div></div>`
    : `<button type="button" class="btn" data-a="ask">Cancel plan</button>`;
  return `<h3>Your plan</h3>
    <div class="bigs">
      <div class="big"><span class="k">Sells</span><span class="v num">${p.pct}% a month</span><span class="sub num">for ${p.months} months, adopted ${esc(dl(api, p.adoptedOn))}</span></div>
      <div class="big"><span class="k">${cooling ? 'Cooling-off' : 'Next sale'}</span><span class="v num">${cooling ? `${days} ${days === 1 ? 'day' : 'days'} left` : esc(dl(api, next))}</span>
        <span class="sub num">${cooling ? `Plan trades from ${esc(dl(api, p.firstTradeOn))}` : `First trading day of next month`}</span></div>
      <div class="big"><span class="k">Sales done</span><span class="v num">${p.salesDone} of ${p.salesTotal}</span><span class="sub"><span class="dots2" role="img" aria-label="${p.salesDone} of ${p.salesTotal} sales done">${dots}</span></span></div>
    </div>
    ${cooling ? `<p class="t-hint">${esc(`Cooling-off: plan trades from ${dl(api, p.firstTradeOn)}.`)} Until then you can still sell by hand in an open window.</p>` : '<p class="t-hint">The plan sells on its dates even when the trading window is closed.</p>'}
    ${cancel}`;
}

function draw(c, snap, api) {
  const k = c._kit;
  const p = snap.plan;
  const live = c.querySelector('[data-v=live]'), nb = c.querySelector('[data-v=newbox]');
  live.hidden = !p; nb.hidden = !!p;
  if (p) setHTML(live, liveHTML(c, snap, api)); else { live._h = null; c._askCancel = false; }
  const st = c.querySelector('[data-v=state]');
  st.className = 'chip ' + (p ? (p.status === 'live' ? 'open' : 'closed') : '');
  setText(st, p ? (p.status === 'live' ? 'Plan live' : 'Cooling-off') : 'No plan');
  // sales history from the engine's plan events
  const sales = events(api).filter((e) => e.type === 'planSale' || e.type === 'planLive');
  const log = c.querySelector('[data-v=log]');
  setHTML(log, sales.length
    ? sales.slice().reverse().slice(0, 8).map((e) => `<li><span class="num when">${esc(dl(api, e.d))}</span><span>${esc(e.text)}</span></li>`).join('')
    : `<li class="empty">${p ? 'The first sale will appear here.' : 'No plan sales yet.'}</li>`);
  if (!p) k.form.update(snap, api);
}

export default {
  id: 'plan', label: '10b5-1 Plan', icon: 'assets/icons/plan.svg', hotkey: '2',
  lesson: [
    { title: 'A plan sells for you', body: 'A 10b5-1 plan sells a fixed percentage of your free shares each month. It keeps selling while the window is closed.' },
    { title: 'Adopt it in an open window', body: 'You can adopt a plan only when the window is open. Cancelling it starts everything over.' },
    { title: 'Cooling-off', body: 'The first sale waits out a cooling-off period, 30 days for an engineer. The tab shows the date the plan goes live.' },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};

// The paper panel: tool tabs (from ui/tabs/*.js, or a placeholder), sealed tabs, "?" refresher,
// margin-call banner, event notices, toasts and the news ticker.
import { iconUrl } from './data.js';
import { DEFAULT_LESSONS } from './lesson.js';
import { esc, int, money, price, dateLabel } from './format.js';

export const TAB_DEFS = [
  { id: 'stock', label: 'Stock', hotkey: '1', locked: 'Stock opens with your first day.' },
  { id: 'plan', label: '10b5-1 Plan', hotkey: '2', locked: 'Unlocks with your first release. A plan can be adopted only while the window is open.' },
  { id: 'collar', label: 'Collar', hotkey: '3', locked: 'Unlocks with your first release. Locked shares cannot be hedged.' },
  { id: 'credit', label: 'Credit Line', hotkey: '4', locked: 'Unlocks with your first release. Locked shares cannot be pledged.' },
  { id: 'cash', label: 'Cash & Index', hotkey: '5', locked: 'Cash and the index fund open with your first day.' },
  { id: 'put', label: 'Put', hotkey: '6', locked: 'Unlocks with your first release. Locked shares cannot be hedged.' },
  { id: 'exchange', label: 'Exchange Fund', hotkey: '7', locked: 'Unlocks with your first release. Locked shares cannot be contributed.' },
];
export const START_UNLOCKED = ['stock', 'cash'];
// What the tab itself says. The full name stays on the tab as its title and accessible name, and in lessons.
const TAB_SHORT = { plan: '10b5-1', credit: 'Credit', cash: 'Cash', put: 'Put', exchange: 'Exchange' };

const GLYPH = {
  stock: '<path d="M3 17V9M8 17V5M13 17v-6M18 17V3" /><path d="M2 19h18"/>',
  plan: '<rect x="3" y="4" width="16" height="14" rx="1"/><path d="M3 8h16M7 2v4M15 2v4M7 12h3M12 12h3M7 15h3"/>',
  collar: '<path d="M5 3H3v16h2M17 3h2v16h-2"/><path d="M7 14l3-3 2 2 4-5"/>',
  credit: '<circle cx="7" cy="11" r="4"/><path d="M11 11h8M16 11v3M19 11v2"/>',
  cash: '<ellipse cx="11" cy="6" rx="7" ry="3"/><path d="M4 6v5c0 1.7 3 3 7 3s7-1.3 7-3V6M4 11v5c0 1.7 3 3 7 3s7-1.3 7-3v-5"/>',
};
const glyph = (id) => `<svg class="gl" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id]}</svg>`;
const SEAL_BIG = `<svg class="wax" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><circle cx="32" cy="32" r="21" class="in"/><path d="M24 33v-4a8 8 0 0 1 16 0v4M22 33h20v13H22Z" class="lock"/></svg>`;
const SEAL_MINI = `<svg class="gl lock" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9"/><path d="M8.5 11.5V10a2.5 2.5 0 0 1 5 0v1.5M7.5 11.5h7V16h-7Z"/></svg>`;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createPaper(el, ctx) {
  const { api, mods, h } = ctx;
  const defs = TAB_DEFS.map((d) => ({ ...d, mod: mods[d.id] || null }));
  for (const d of defs) {
    if (d.mod) { d.label = d.mod.label || d.label; d.hotkey = d.mod.hotkey || d.hotkey; }
    d.lesson = (d.mod && d.mod.lesson) || DEFAULT_LESSONS[d.id];
  }
  el.innerHTML = `
  <section class="paper" aria-label="Tools">
    <div class="banner-slot"></div>
    <div class="notice-slot" role="status" aria-live="polite"></div>
    <div class="tabbar">
      <div class="tabs" role="tablist" aria-label="Tools"></div>
      <button class="help" aria-label="Lesson refresher for this tool" title="Lesson refresher">?</button>
    </div>
    <div class="panel-wrap"><div class="panel" role="tabpanel" tabindex="-1"></div><div class="toasts" aria-live="polite"></div></div>
    <div class="ticker"><span class="tk-lbl">News</span><span class="tk-text">No headlines yet.</span></div>
  </section>`;
  const $ = (s) => el.querySelector(s);
  const tabsEl = $('.tabs'), panel = $('.panel'), banner = $('.banner-slot'), notices = $('.notice-slot'), toasts = $('.toasts'), tk = $('.tk-text');
  let active = 'stock', unlocked = new Set(START_UNLOCKED), view = null, lastRender = 0, bannerKey = '', noticeKey = '';
  const conts = new Map();
  // The maintenance-call banner stays above any moment card; the card's scrim starts where the banner ends.
  const paperEl = $('.paper');
  const syncBannerH = () => paperEl.style.setProperty('--banner-h', banner.offsetHeight + 'px');
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncBannerH).observe(banner);

  tabsEl.innerHTML = defs.map((d) => `<button class="tab" role="tab" id="tab-${d.id}" data-tab="${d.id}" aria-selected="false" aria-controls="panel" tabindex="-1" title="${esc(d.label)}">
      <span class="ico"></span><span class="lbl">${esc(TAB_SHORT[d.id] || d.label)}</span><kbd aria-hidden="true">${esc(d.hotkey)}</kbd></button>`).join('');
  const tabEls = Object.fromEntries(defs.map((d) => [d.id, tabsEl.querySelector(`[data-tab=${d.id}]`)]));
  panel.id = 'panel';
  function setIcon(d, locked) {
    const ico = tabEls[d.id].querySelector('.ico');
    if (locked) { ico.innerHTML = SEAL_MINI; return; }
    const src = (d.mod && d.mod.icon) || iconUrl(d.id);
    if (src) { ico.innerHTML = `<img src="${esc(src)}" alt="" width="20" height="20">`; ico.querySelector('img').onerror = () => { ico.innerHTML = glyph(d.id); }; }
    else ico.innerHTML = glyph(d.id);
  }

  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) select(b.dataset.tab, true); });
  tabsEl.addEventListener('keydown', (e) => {
    const ids = defs.map((d) => d.id), i = ids.indexOf(active);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; select(n, true); tabEls[n].focus(); }
  });
  $('.help').addEventListener('click', () => h.onLesson(active));

  function select(id, focus) {
    if (!tabEls[id]) return;
    active = id;
    for (const d of defs) { const on = d.id === id; tabEls[d.id].setAttribute('aria-selected', String(on)); tabEls[d.id].tabIndex = on ? 0 : -1; tabEls[d.id].classList.toggle('active', on); }
    tabEls[id].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    for (const [k, c] of conts) c.hidden = k !== id + ':' + (unlocked.has(id) ? 'u' : 'l');
    panel.setAttribute('aria-labelledby', 'tab-' + id);
    render(true);
    h.onTab?.(id);
  }

  function container(id, locked) {
    const k = id + ':' + (locked ? 'l' : 'u');
    let c = conts.get(k);
    if (!c) { c = document.createElement('div'); c.className = 'tab-body'; c.dataset.tab = id; c.hidden = true; panel.appendChild(c); conts.set(k, c); }
    return c;
  }

  function lockedPanel(c, d, snap) {
    const nr = snap && snap.nextRelease;
    c.innerHTML = `<div class="sealed-panel">${SEAL_BIG}<h2>${esc(d.label)} is sealed</h2><p>${esc(d.locked)}</p>
      ${nr ? `<p class="next num">Next release: ${esc(dateLabel(view.dctx, nr.date))} · ${nr.pct}% of your shares</p>` : ''}</div>`;
  }

  function placeholder(c, d, snap) {
    if (!c._init) {
      c._init = true;
      c.innerHTML = `<div class="ph"><header class="tool-h"><h2>${esc(d.label)}</h2><span class="tag">preview</span></header>
        <p class="hint">This tool’s full panel arrives with the next build. The numbers below come straight from the game.</p>
        <svg class="spark" viewBox="0 0 400 90" preserveAspectRatio="none" role="img" aria-label="Price since the first trade"><path class="off"/><path class="ln"/></svg>
        <dl class="facts"></dl>
        <div class="why"></div>
        ${d.id === 'stock' ? `<form class="sell" autocomplete="off"><label>Sell <input class="num" inputmode="numeric" name="n" placeholder="shares" aria-label="Shares to sell"></label>
          <button type="button" class="btn sm" data-max>MAX</button><button class="btn primary" type="submit">Sell at close</button></form>` : ''}</div>`;
      c.querySelector('.sell')?.addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target, n = Math.floor(Number(String(f.n.value).replace(/,/g, '')));
        if (n > 0) api.act({ type: 'sell', shares: n });
      });
      c.querySelector('[data-max]')?.addEventListener('click', () => { const f = c.querySelector('.sell'); f.n.value = int(view.snap.shares.free); f.n.focus(); });
    }
    const hist = api.history ? api.history() : [];
    if (hist.length > 1) {
      const xs = hist.map((r) => r.close), lo = Math.min(...xs, snap.offerPrice) * 0.98, hi = Math.max(...xs, snap.offerPrice) * 1.02;
      const X = (i) => (i / Math.max(1, hist.length - 1)) * 400, Y = (v) => 85 - ((v - lo) / (hi - lo)) * 80;
      c.querySelector('.ln').setAttribute('d', xs.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(''));
      c.querySelector('.off').setAttribute('d', `M0 ${Y(snap.offerPrice).toFixed(1)}L400 ${Y(snap.offerPrice).toFixed(1)}`);
    }
    const sh = snap.shares;
    const rows = d.id === 'stock'
      ? [['Close', price(snap.close)], ['Offer price', price(snap.offerPrice)], ['Free', int(sh.free)], ['Locked', int(sh.locked)], ['Collared', int(sh.collared || 0)], ['Pledged', int(sh.pledged || 0)]]
      : d.id === 'credit' ? [['Loan', money(snap.loan.balance)], ['Loan to value', (snap.loan.ltv * 100).toFixed(1) + '%'], ['Can still draw', money(snap.loan.maxDraw)]]
      : d.id === 'cash' ? [['Cash', money(snap.cash)], ['Index fund', money(snap.index.value)]]
      : d.id === 'plan' ? [['Plan', snap.plan ? `${snap.plan.pct}% a month for ${snap.plan.months} months` : 'None'], ['Goes live', snap.plan ? dateLabel(view.dctx, snap.plan.firstTradeOn) : '—']]
      : [['Collars', int((snap.collars || []).length)], ['Collared shares', int(sh.collared || 0)]];
    const html = rows.map(([a, b]) => `<div><dt>${a}</dt><dd class="num">${b}</dd></div>`).join('');
    const f = c.querySelector('.facts'); if (f._h !== html) { f._h = html; f.innerHTML = html; }
    const g = snap.gates || {}, gk = { stock: 'sell', plan: 'adoptPlan', collar: 'collar', credit: 'pledge', cash: 'deposit' }[d.id], gate = g[gk];
    const w = c.querySelector('.why'), wh = gate && !gate.allowed ? `<p class="gate"><span class="lockdot" aria-hidden="true"></span>${esc(gate.reason)}</p>` : '';
    if (w._h !== wh) { w._h = wh; w.innerHTML = wh; }
  }

  function render(force) {
    if (!view) return;
    const d = defs.find((x) => x.id === active), locked = !unlocked.has(active);
    const c = container(active, locked);
    for (const [k, cc] of conts) cc.hidden = cc !== c;
    const now = performance.now();
    if (!force) {
      if (view.running && now - lastRender < 240) return;
      if (c.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    }
    lastRender = now;
    if (locked) { lockedPanel(c, d, view.snap); return; }
    if (d.mod && !c._failed) {
      try { d.mod.render(c, view.snap, api); return; }
      catch (e) { console.warn('tab render failed', d.id, e); c._failed = true; c.innerHTML = ''; c._init = false; }
    }
    placeholder(c, d, view.snap);
  }

  function setUnlocked(set) {
    const prev = unlocked; unlocked = set;
    for (const d of defs) {
      const lk = !set.has(d.id), t = tabEls[d.id];
      t.classList.toggle('locked', lk); t.setAttribute('aria-label', `${d.label}${lk ? ', sealed' : ''}`);
      t.dataset.l = lk ? '1' : '';
      if (t._lk !== lk) { setIcon(d, lk); t._lk = lk; }
      if (!lk && !prev.has(d.id) && !reduced() && view) { t.classList.add('unsealing'); setTimeout(() => t.classList.remove('unsealing'), 1400); }
    }
  }

  function marginBanner(v) {
    const call = v.snap.loan && v.snap.loan.call;
    const key = call ? JSON.stringify([call.issuedOn, call.deadline, Math.round(call.toPost), v.marginText]) : '';
    if (key === bannerKey) return;
    bannerKey = key;
    if (!call) { banner.innerHTML = ''; return; }
    const text = v.marginText || `Maintenance call. Loan-to-value is ${(call.ltv * 100).toFixed(1)}%; the limit is 35%. Post ${money(call.toPost)} by ${dateLabel(v.dctx, call.deadline)}, or the bank sells shares at that day’s close. The sale is taxable.`;
    const stake = (label, val, cls = '') => `<div class="${cls}"><dt>${label}</dt><dd class="num">${esc(val)}</dd></div>`;
    banner.innerHTML = `<div class="margin" role="alert">
      <div class="m-main"><b class="m-h">Maintenance call</b><p>${esc(text.replace(/^Maintenance call\.\s*/, ''))}</p></div>
      <dl class="m-stakes">${stake('To post', money(call.toPost), 'big')}${stake('Loan to value', (call.ltv * 100).toFixed(1) + '%')}${stake('Post by', dateLabel(v.dctx, call.deadline))}</dl>
      <div class="m-btns"><button class="btn" data-mc="post">Post ${esc(money(call.toPost))}</button><button class="btn" data-mc="sell">Sell shares now</button><button class="btn" data-mc="wait">Wait</button></div></div>`;
    banner.querySelectorAll('[data-mc]').forEach((b) => b.addEventListener('click', () => h.onChoice('marginCall', b.dataset.mc)));
    if (v.snap.gates?.sell && !v.snap.gates.sell.allowed) { const s = banner.querySelector('[data-mc=sell]'); s.setAttribute('aria-disabled', 'true'); s.title = v.snap.gates.sell.reason; }
  }

  // Moments: one designed card for every pause. Release leads with the free-share count; the rest are plain notes under it.
  const MOMENT_HEAD = {
    windowOpen: ['Trading window', 'The window is open'], planLive: ['Your plan', 'Your plan is live'],
    forcedSale: ['The bank', 'The bank sold shares'], relock: ['Window closed', 'Some shares are locked again'], never: ['Release', 'One release will not come early'],
  };
  const KIND_RANK = { release: 0, relock: 1, forcedSale: 2, planLive: 3, windowOpen: 4, never: 5 };
  let countRaf = 0;
  function countUp(el, from, to) {
    cancelAnimationFrame(countRaf);
    if (reduced() || from === to) { el.textContent = int(to); return; }
    el.textContent = int(from);
    const t0 = performance.now() + 180, D = 560;
    const tick = (t) => {
      if (!el.isConnected) return;
      const p = Math.min(1, Math.max(0, (t - t0) / D)), e = 1 - Math.pow(1 - p, 3);
      el.textContent = int(Math.round(from + (to - from) * e));
      if (p < 1) countRaf = requestAnimationFrame(tick);
    };
    countRaf = requestAnimationFrame(tick);
  }
  const lockable = () => el.querySelectorAll('.tabbar, .panel-wrap, .ticker');
  function momentHtml(list) {
    const items = list.map((n) => ({ ...n, kind: n.kind || n.type || 'note' }));
    const rels = items.filter((n) => n.kind === 'release' && n.shares != null);
    let lead = items.slice().sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9))[0];
    if (rels.length > 1) {   // two releases landing together read as one card
      const ids = new Set(rels.flatMap((r) => r.idx || []));
      lead = { ...rels[0], shares: rels.reduce((a, r) => a + r.shares, 0), pct: rels.reduce((a, r) => a + r.pct, 0), idx: [...ids].sort((a, b) => a - b), text: rels.map((r) => r.text).join(' ') };
    }
    const rest = items.filter((n) => n !== lead && !(lead.kind === 'release' && rels.includes(n)));
    const notes = [], fine = [];
    let head = '', kick = '', body = '', pips = '', hero = '';
    if (lead.kind === 'release' && lead.shares != null) {
      const ix = lead.idx || [];
      kick = ix.length && lead.total ? `${ix.length > 1 ? 'Releases' : 'Release'} ${ix.length > 1 ? `${ix[0]} to ${ix[ix.length - 1]}` : ix[0]} of ${lead.total}` : 'Release';
      head = `${lead.pct}% of your shares are now free`;
      const extra = String(lead.text || '').replace(/\d+% of your shares are free\.\s*/g, '').trim();
      if (extra) notes.push(extra);
      pips = `<div class="m-pips" aria-hidden="true">${(lead.pips || []).map((p, i) => `<span class="pip ${p.void ? 'void' : p.state}" style="--i:${i}"><span class="num">${p.void ? '' : esc(p.pct)}</span></span>`).join('')}</div>`;
      const lower = lead.free != null && lead.free < lead.shares;   // only when shares were sold on the release day itself
      hero = `<div class="m-hero"><div class="m-free"><span class="num m-count" data-from="0" data-to="${lead.shares}">${int(lead.shares)}</span><span class="m-unit">shares released</span></div></div>
        ${lead.free != null ? `<p class="m-left"><span class="num">${int(lead.free)}</span> free now${lower ? ', after a sale on the same day' : ''} · <span class="num">${int(lead.locked)}</span> still locked</p>` : ''}`;
    } else {
      const k = MOMENT_HEAD[lead.kind];
      const t = String(lead.text || ''), cut = t.search(/[.:]\s/), first = cut > 0 ? t.slice(0, cut) : t, tail = cut > 0 ? t.slice(cut + 1).trim() : '';
      kick = k ? k[0] : 'Notice'; head = k ? k[1] : first;
      body = k ? `<p class="m-body">${esc(t)}</p>` : (tail ? `<p class="m-body">${esc(tail)}</p>` : '');
    }
    for (const n of rest) (n.kind === 'never' ? fine : notes).push(n.text);
    const shown = notes.slice(0, 2); fine.push(...notes.slice(2));
    return { kick, head, html: `<p class="m-kick">${esc(kick)}</p><h2 class="m-head">${esc(head)}</h2>${pips}${hero}${body}
      ${shown.length ? `<ul class="m-notes">${shown.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${fine.length ? `<p class="m-fine">${fine.map(esc).join(' ')}</p>` : ''}` };
  }

  function setNotices(list) {
    const key = JSON.stringify(list.map((n) => [n.text, n.free, n.locked, n.idx]));
    if (key === noticeKey) return; noticeKey = key;
    cancelAnimationFrame(countRaf);
    if (!list.length) { notices.innerHTML = ''; lockable().forEach((e) => e.removeAttribute('inert')); return; }
    const m = momentHtml(list);
    notices.innerHTML = `<div class="notice moment-scrim"><div class="moment" role="group" aria-label="${esc(m.kick + ': ' + m.head)}"><div class="m-body-wrap">${m.html}</div><button class="btn m-go" data-a="go">Continue</button></div></div>`;
    lockable().forEach((e) => e.setAttribute('inert', ''));
    const c = notices.querySelector('.m-count'); if (c) countUp(c, Number(c.dataset.from), Number(c.dataset.to));
    const b = notices.querySelector('.m-go'); b.addEventListener('click', () => h.onContinue());
    if (!list.some((n) => n.noFocus)) b.focus({ preventScroll: true });
  }

  function toast(text, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'ach' ? 5200 : 4200);
  }
  function setNews(text, when) { tk.innerHTML = text ? `<span class="when num">${esc(when || '')}</span> ${esc(text)}` : 'No headlines yet.'; tk.classList.remove('pop'); void tk.offsetWidth; tk.classList.add('pop'); }

  function update(v) {
    view = v; setUnlocked(v.unlocked);
    if (!tabEls[active]._set) { tabEls[active]._set = true; select(active); }
    marginBanner(v); setNotices(v.notices || []);
    render(false);
  }
  setUnlocked(unlocked);
  return { update, select, forceRender: () => render(true), toast, setNews, get active() { return active; }, tabIds: defs.map((d) => d.id), lesson: (id) => defs.find((d) => d.id === id)?.lesson, label: (id) => defs.find((d) => d.id === id)?.label };
}
